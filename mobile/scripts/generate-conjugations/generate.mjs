// Génère mobile/src/data/conjugations.json à partir des verbes déjà
// présents dans mobile/src/data/words.json (partOfSpeech === 'verbe'),
// conjugués via @v4nn4/ablaut (moteur à règles, vérifié à 100% sur
// 339 200 formes espagnoles contre deux lexiques indépendants — voir
// README.md de ce dossier pour le détail de l'évaluation qui a mené à
// ce choix plutôt qu'un autre paquet npm).
//
// Usage : node generate.mjs [N]   (N = nombre de verbes visé, défaut 200,
// pris parmi les plus fréquents de words.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conjugate, initSync } from '@v4nn4/ablaut';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDS_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'words.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'conjugations.json');

const TARGET_COUNT = parseInt(process.argv[2] ?? '200', 10);

// wasm-bindgen : le paquet cible le navigateur par défaut (fetch() du
// .wasm) — initSync() avec les octets lus depuis le disque fonctionne en
// Node, contrairement à l'exemple `await init()` du README (conçu pour
// le web). Chemin construit à la main plutôt que via `import.meta.resolve`
// (API récente, pas garantie stable sur toutes les versions de Node) —
// le paquet est un devDependency direct de `mobile/`, donc toujours à
// `mobile/node_modules/@v4nn4/ablaut/`.
const WASM_PATH = path.join(__dirname, '..', '..', 'node_modules', '@v4nn4', 'ablaut', 'ablaut_bg.wasm');
initSync({ module: fs.readFileSync(WASM_PATH) });

// Les 6 personnes utilisées pour l'indicatif/subjonctif/conditionnel,
// dans l'ordre renvoyé par ablaut (vérifié empiriquement, pas supposé —
// voir README). Le paradigme espagnol d'Espagne complet demandé inclut
// *vosotros*, contrairement au voseo/paradigme latino-américain.
const PERSONS_6 = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

// L'impératif n'a pas de forme "yo" (on ne se donne pas d'ordre à
// soi-même) — 5 personnes seulement, même ordre que le tableau `imperative`
// renvoyé par ablaut (vérifié : tú, usted, nosotros, vosotros, ustedes).
const PERSONS_5 = ['tú', 'usted', 'nosotros', 'vosotros', 'ustedes'];

function loadVerbs() {
  const words = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
  return words
    .filter((w) => w.partOfSpeech === 'verbe')
    .sort((a, b) => a.frequencyRank - b.frequencyRank)
    .slice(0, TARGET_COUNT);
}

async function main() {
  const verbs = loadVerbs();
  console.log(`${verbs.length} verbes retenus (les plus fréquents parmi ${JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8')).filter((w) => w.partOfSpeech === 'verbe').length} verbes disponibles dans words.json).`);

  const entries = [];
  const errors = [];

  for (const word of verbs) {
    let t;
    try {
      t = conjugate(word.spanish, 'spa');
    } catch (err) {
      errors.push({ verb: word.spanish, error: err.message ?? String(err) });
      continue;
    }

    // L'impératif négatif n'est pas renvoyé par ablaut — règle de
    // grammaire espagnole standard, appliquée ici plutôt que devinée :
    // "no" + subjonctif présent, à TOUTES les personnes (y compris tú,
    // qui n'utilise PAS sa forme impérative affirmative propre au
    // négatif — piège classique, vérifié sur "hablar" avant de généraliser :
    // "no hables", pas "no habla").
    const imperativeNegative = [1, 2, 3, 4, 5].map((i) => `no ${t.subjunctivePresent[i]}`);

    entries.push({
      id: word.id,
      infinitive: word.spanish,
      english: word.english,
      frequencyRank: word.frequencyRank,
      forms: {
        indicativePresent: t.present,
        indicativePreterite: t.preterite,
        indicativeImperfect: t.imperfect,
        indicativeFuture: t.future,
        conditionalPresent: t.conditional,
        subjunctivePresent: t.subjunctivePresent,
        // Forme en -ra uniquement (celle renvoyée par ablaut) — la
        // forme en -se, tout aussi correcte, se dérive du même radical
        // par un simple remplacement de suffixe et est acceptée comme
        // réponse valide côté validation de l'app plutôt que dupliquée
        // ici (voir mobile/src/conjugation/validate.ts).
        subjunctiveImperfect: t.subjunctiveImperfect,
        imperativeAffirmative: t.imperative,
        imperativeNegative,
      },
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`✓ ${entries.length} verbes écrits dans ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  ${entries.length * (PERSONS_6.length * 7 + PERSONS_5.length * 2)} formes individuelles au total (${PERSONS_6.length} personnes × 7 temps/modes + ${PERSONS_5.length} personnes × 2 impératifs, par verbe).`);
  if (errors.length > 0) {
    console.log(`  ${errors.length} verbe(s) en erreur (non conjugués, exclus) :`, errors);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
