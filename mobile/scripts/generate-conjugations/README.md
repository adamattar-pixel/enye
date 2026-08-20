# Génération de conjugaisons — @v4nn4/ablaut

Génère `mobile/src/data/conjugations.json` à partir des verbes déjà présents dans `mobile/src/data/words.json` (`partOfSpeech === 'verbe'`), conjugués par [@v4nn4/ablaut](https://www.npmjs.com/package/@v4nn4/ablaut) — un devDependency de `mobile/`, jamais embarqué dans l'app (le calcul se fait ici, à la génération, pas sur le téléphone).

## Pourquoi `@v4nn4/ablaut` et pas `spanish-verbs`

Le plan initial proposait `spanish-verbs` (npm, package **déprécié** — "no longer supported" affiché par `npm view`). Avant de l'adopter, sa couverture a été testée sur un échantillon de verbes fréquents à changement de radical/irréguliers plutôt que supposée fiable :

- **Présent de l'indicatif** : `pensar` → `penso/pensas/pensa...` (attendu : `pienso/piensas/piensa...`), `pedir` → `pedo/pedes/pede...` (attendu : `pido/pides/pide...`), `sentir`, `jugar`, `empezar` — même défaut. Le changement de radical e→ie / e→i / o→ue n'est simplement pas appliqué pour plusieurs verbes très fréquents.
- **Présent du subjonctif**, plus touché encore : sur un échantillon de 30 verbes irréguliers/à changement de radical, **13 (43%) donnaient un résultat faux**, dont un cas de contamination croisée entre verbes (`hacer` au subjonctif renvoyait les formes *nosotros/vosotros/ellos* de `tener` : `tengamos/tengáis/tengan` au lieu de `hagamos/hagáis/hagan`).

Un taux d'erreur pareil sur des verbes que n'importe quel cours d'espagnol débutant enseigne aurait fait apprendre de mauvaises conjugaisons — inacceptable pour des flashcards, bien plus grave qu'une glose de vocabulaire verbeuse. `spanish-verbs` a donc été écarté après ce test, pas avant.

**`@v4nn4/ablaut`** a été retenu à la place : moteur à règles (pas une simple table de correspondance — "generalizes to unseen verbs"), licence MIT OR Apache-2.0, activement maintenu (CI, publié récemment), et surtout **vérifié à 100,00% sur 339 200 formes espagnoles** contre deux lexiques indépendants (voir son propre README). Retesté ici sur le même échantillon de 30 verbes qui avait fait échouer `spanish-verbs` : 0 erreur. Testé aussi sur les 200 verbes réellement utilisés (voir plus bas) : 0 erreur, 0 verbe rejeté.

## Utilisation

```
node generate.mjs [N]   # N = nombre de verbes visé, défaut 200
```

Aucune étape de téléchargement séparée : les verbes viennent de `words.json`, déjà présent dans le dépôt (pas de nouvelle source externe à récupérer). Le résultat est écrit directement dans `mobile/src/data/conjugations.json` (pas de fichier candidat séparé à fusionner — contrairement à `generate-vocabulary`, qui produit un fichier réutilisé pour l'app **et** la fiche de référence de l'onglet « Règles de conjugaison », donc pas besoin d'un second jeu de données).

## Détail technique — piège d'API à connaître

`@v4nn4/ablaut` est distribué en WebAssembly (`ablaut_bg.wasm` + glue JS générée par `wasm-bindgen`), ciblée navigateur par défaut : son exemple d'usage JS appelle `await init()`, qui fait un `fetch()` — échoue en Node (`TypeError: fetch failed`). Contournement : lire le `.wasm` depuis le disque et appeler `initSync({ module: bytes })` à la place (voir `generate.mjs`).

**Autre piège, testé plutôt que deviné** : `conjugate(infinitif, lang)` ne lève pas d'erreur si l'infinitif est mal accentué — il se rabat silencieusement sur une conjugaison régulière fausse. Exemple : `conjugate('oir', 'spa')` donne `oo/oes/oe...` (faux), alors que `conjugate('oír', 'spa')` donne `oigo/oyes/oye...` (correct). Vérifié que les verbes concernés dans `words.json` (`oír`, `reír`, `sonreír`, `freír`) y sont déjà correctement accentués — aucune correction supplémentaire nécessaire pour l'instant, mais **à surveiller si la liste de verbes s'élargit** au-delà des 200 actuels.

## Ce qui est généré par verbe

7 temps/modes à 6 personnes (yo / tú / él-ella-usted / nosotros / vosotros / ellos-ellas-ustedes) + 2 formes d'impératif à 5 personnes (pas de "yo" à l'impératif) :

- Indicatif : présent, prétérit (`indicativePreterite`), imparfait, futur
- Conditionnel présent
- Subjonctif présent, subjonctif imparfait (**forme en -ra uniquement** — ablaut ne renvoie que celle-ci ; la forme en -se, tout aussi correcte, se dérive du même radical par un simple remplacement de suffixe et est acceptée comme réponse valide côté validation de l'app plutôt que dupliquée dans ce fichier, voir `mobile/src/conjugation/validate.ts`)
- Impératif affirmatif (renvoyé directement par ablaut) et négatif (**pas renvoyé par la librairie, composé ici** : "no" + subjonctif présent, à toutes les personnes — y compris *tú*, qui n'utilise **pas** sa forme impérative affirmative propre au négatif : "no hables", jamais "no habla")

Soit 6×7 + 5×2 = 52 formes par verbe, 10 400 au total pour 200 verbes.

## Limites connues

- **Verbes = les 200 plus fréquents parmi ceux déjà catégorisés `partOfSpeech: "verbe"` dans `words.json`** (1228 disponibles au total) — pas une nouvelle source de fréquence séparée. Extensible en relançant `node generate.mjs 300` (ou plus) sans changement de code, `words.json` en contient largement assez.
- **Paradigme espagnol d'Espagne uniquement** (*vosotros* inclus) — pas de voseo (*vos*) ni de formes latino-américaines, conforme à la demande.
- **Pas de temps composés** (passé composé, plus-que-parfait...) en v1 — ablaut les fournit pourtant (`perfectoCompuesto`, `pluscuamperfecto`...), simplement pas repris dans `conjugations.json` pour rester sur le périmètre validé (indicatif simple + subjonctif présent/imparfait + impératif). Facile à ajouter plus tard si demandé, la donnée existe déjà côté ablaut.
