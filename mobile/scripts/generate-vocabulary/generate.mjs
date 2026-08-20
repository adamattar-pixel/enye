// Génère un candidat words.generated.json à partir de doozan/spanish_data
// (frequency.csv, es-en.data, sentences.tsv). Ne touche jamais
// mobile/src/data/words.json directement — voir README.md de ce dossier
// pour le pourquoi et le format de sortie.
//
// Usage : node generate.mjs [N]   (N = nombre de mots visé, défaut 2000)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'words.generated.json');

const TARGET_COUNT = parseInt(process.argv[2] ?? '2000', 10);

// pos (frequency.csv / es-en.data) -> partOfSpeech attendu par l'app
// (mobile/src/theme/solYSombra.ts, partOfSpeechAbbreviation). "art" et
// "nombre" existaient déjà comme catégories envisagées dans le cahier
// des charges d'origine ; "déterminant" et "contraction" sont nouveaux,
// ajoutés à la table d'abréviations dans le même chantier.
const POS_MAP = {
  n: 'nom',
  v: 'verbe',
  adj: 'adjectif',
  adv: 'adverbe',
  pron: 'pronom',
  prep: 'préposition',
  conj: 'conjonction',
  interj: 'interjection',
  num: 'nombre',
  determiner: 'déterminant',
  art: 'article',
  contraction: 'contraction',
};

// Exclus de la sélection : "none"/"letter" sont du bruit confirmé en
// inspectant frequency.csv (prénoms anglais, abréviations comme "sr.",
// "dr." qui ont fui du corpus Tatoeba) ; "prop" = noms propres, pas du
// vocabulaire général ; "prefix"/"suffix" = pas des mots autonomes ;
// "phrase"/"particle" = trop peu d'entrées (2 et 1) pour être fiables.
const EXCLUDED_POS = new Set(['none', 'prop', 'letter', 'prefix', 'suffix', 'phrase', 'particle']);

const BAD_GLOSS_PREFIX =
  /^(obsolete|dated|archaic|nonstandard|alternative|misspelling|pronunciation spelling|informal spelling)\b/i;

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugify(spanish) {
  return stripAccents(spanish)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// MARK: - 1. frequency.csv : sélection des lemmes cibles

function loadFrequencyCsv() {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'frequency.csv'), 'utf8');
  const lines = raw.split('\n');
  const rows = [];
  // Pas de parseur CSV : vérifié qu'aucune ligne ne contient de guillemet
  // et que chaque ligne a exactement 5 champs séparés par des virgules
  // (voir AUDIT.md) — un split() simple suffit.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const [count, spanish, pos, flags] = parts;
    if (flags === 'NOUSAGE' || flags === 'DUPLICATE') continue;
    if (EXCLUDED_POS.has(pos)) continue;
    if (!POS_MAP[pos]) continue; // pos inconnu, pas dans la table de mapping
    rows.push({ count: parseInt(count, 10), spanish, pos });
  }
  // Déjà trié par fréquence décroissante dans le fichier source, mais on
  // retrie explicitement plutôt que de faire confiance à l'ordre du fichier.
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

// MARK: - 2. es-en.data : glose anglaise + genre par lemme

function loadEsEnEntries(targetLemmas) {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'es-en.data'), 'utf8');
  const lines = raw.split('\n');
  const result = new Map(); // spanish -> { gender, glossByPos: Map<pos, string> }

  let currentHeadword = null;
  let wanted = false;
  let currentPos = null;
  let currentGender = null;
  let currentGlossCaptured = false;

  function flushPos() {
    if (wanted && currentPos && currentGlossCaptured === false) {
      // pos block avec aucune glose exploitable — rien à faire, juste ne
      // pas laisser d'état incohérent pour le pos suivant.
    }
    currentPos = null;
    currentGender = null;
    currentGlossCaptured = false;
  }

  for (const rawLine of lines) {
    if (rawLine === '_____') {
      flushPos();
      currentHeadword = null;
      wanted = false;
      continue;
    }

    if (!rawLine.startsWith(' ')) {
      // Ligne à indentation 0 : soit un nouveau mot-vedette, soit "pos: X".
      if (rawLine.startsWith('pos: ')) {
        flushPos();
        if (wanted) {
          currentPos = rawLine.slice('pos: '.length).trim();
          if (!result.has(currentHeadword)) {
            result.set(currentHeadword, { gender: null, glossByPos: new Map() });
          }
        }
        continue;
      }
      currentHeadword = rawLine;
      wanted = targetLemmas.has(currentHeadword);
      continue;
    }

    if (!wanted || !currentPos) continue;

    const trimmed = rawLine.trim();
    const entry = result.get(currentHeadword);

    if (trimmed.startsWith('g: ') && !currentGender) {
      const g = trimmed.slice('g: '.length).trim();
      if (g === 'f') currentGender = 'féminin';
      else if (g === 'm') currentGender = 'masculin';
      // m-f, mf, c (genre commun/ambigu) : on ne devine pas, reste null.
      if (currentGender) entry.gender = entry.gender ?? currentGender;
      continue;
    }

    if (trimmed.startsWith('gloss: ') && !currentGlossCaptured) {
      let gloss = trimmed.slice('gloss: '.length).trim();
      if (BAD_GLOSS_PREFIX.test(gloss)) continue; // essaiera la gloss suivante du même pos
      gloss = gloss.split(';')[0].trim(); // un seul sens principal, pas une liste
      gloss = gloss.replace(/^"|"$/g, '');
      if (gloss && !entry.glossByPos.has(currentPos)) {
        entry.glossByPos.set(currentPos, gloss);
      }
      currentGlossCaptured = true;
      continue;
    }
    // meta:, usage:, etymology:, q:, syn:, _gloss: (sens secondaires) —
    // ignorés délibérément, on ne garde qu'un sens principal par mot.
  }

  return result;
}

// MARK: - 3. sentences.tsv : une phrase d'exemple par lemme

function loadExampleSentences(targetLemmas) {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'sentences.tsv'), 'utf8');
  const lines = raw.split('\n');
  const best = new Map(); // lemma -> { es, en, length }

  for (const line of lines) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 6) continue;
    const [en, es, , , , tagString] = cols;
    if (es.length < 10 || es.length > 90) continue; // trop courte/longue pour un exemple A1-B1

    const tags = tagString.split(' ');
    for (const tag of tags) {
      if (!tag.startsWith(':') || tag.startsWith(':phrase')) continue;
      const withoutColon = tag.slice(1);
      const commaIndex = withoutColon.indexOf(',');
      if (commaIndex === -1) continue;
      const formsPart = withoutColon.slice(commaIndex + 1);
      const lastForm = formsPart.split(',').pop();
      const lemma = lastForm.includes('|') ? lastForm.split('|').pop() : lastForm;
      if (!targetLemmas.has(lemma)) continue;

      const existing = best.get(lemma);
      if (!existing || es.length < existing.es.length) {
        best.set(lemma, { es, en });
      }
    }
  }

  return best;
}

// MARK: - Niveau CECRL — heuristique par position dans le classement de
// sortie (pas de vraie donnée CECRL dans la source). À valider
// manuellement, voir AUDIT.md.

function levelForIndex(index, total) {
  const ratio = index / total;
  if (ratio < 0.4) return 'A1';
  if (ratio < 0.7) return 'A2';
  return 'B1';
}

// MARK: - Orchestration

async function main() {
  for (const file of ['frequency.csv', 'es-en.data', 'sentences.tsv']) {
    if (!fs.existsSync(path.join(DATA_DIR, file))) {
      console.error(`Fichier manquant : data/${file}. Lance d'abord "node download-sources.mjs".`);
      process.exit(1);
    }
  }

  console.log('Lecture de frequency.csv...');
  const freqRows = loadFrequencyCsv();
  console.log(`  ${freqRows.length} lemmes candidats après filtrage.`);

  // On prend plus large que TARGET_COUNT car une partie n'aura pas de
  // correspondance dans es-en.data (mots absents du dictionnaire) — voir
  // le README pour le taux de correspondance observé.
  const candidatePool = freqRows.slice(0, TARGET_COUNT * 2);
  const targetLemmas = new Set(candidatePool.map((r) => r.spanish));

  console.log('Lecture de es-en.data (peut prendre quelques secondes)...');
  const dictionary = loadEsEnEntries(targetLemmas);

  console.log('Lecture de sentences.tsv (peut prendre quelques secondes)...');
  const examples = loadExampleSentences(targetLemmas);

  const words = [];
  const seenIds = new Set();
  let skippedNoDictionaryEntry = 0;
  let skippedNoGlossForPos = 0;
  let withExample = 0;

  for (const row of candidatePool) {
    if (words.length >= TARGET_COUNT) break;

    const entry = dictionary.get(row.spanish);
    if (!entry) {
      skippedNoDictionaryEntry++;
      continue;
    }
    const gloss = entry.glossByPos.get(row.pos);
    if (!gloss) {
      skippedNoGlossForPos++;
      continue;
    }

    let id = slugify(row.spanish);
    if (seenIds.has(id)) id = `${id}_${row.pos}`;
    if (seenIds.has(id)) continue; // collision improbable mais on ne veut jamais deux entrées avec le même id
    seenIds.add(id);

    const example = examples.get(row.spanish);
    if (example) withExample++;

    words.push({
      id,
      spanish: row.spanish,
      english: gloss,
      partOfSpeech: POS_MAP[row.pos],
      gender: row.pos === 'n' ? (entry.gender ?? null) : null,
      exampleEs: example ? example.es : '',
      exampleEn: example ? example.en : '',
      level: null, // rempli après coup une fois la taille finale connue
      tags: [],
      frequencyRank: words.length + 1,
    });
  }

  words.forEach((w, i) => {
    w.level = levelForIndex(i, words.length);
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(words, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`✓ ${words.length} mots écrits dans ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  ${withExample} avec une phrase d'exemple (${((withExample / words.length) * 100).toFixed(0)}%)`);
  console.log(`  ${skippedNoDictionaryEntry} lemmes ignorés (absents de es-en.data)`);
  console.log(`  ${skippedNoGlossForPos} lemmes ignorés (dans le dictionnaire mais sans glose exploitable pour ce pos)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
