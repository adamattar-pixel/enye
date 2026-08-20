# Génération de vocabulaire — doozan/spanish_data

Génère un candidat `mobile/src/data/words.generated.json` à partir de [doozan/spanish_data](https://github.com/doozan/spanish_data), sans jamais toucher `mobile/src/data/words.json` (le fichier réellement utilisé par l'app) directement.

## Sources et licences

`doozan/spanish_data` (CC BY 4.0) agrège trois sources, chacune sous sa propre licence — voir aussi l'écran Crédits dans l'app (Decks & mots → Réglages → Crédits et sources du vocabulaire) :

| Fichier | Contenu | Source d'origine | Licence |
|---|---|---|---|
| `frequency.csv` | Classement de fréquence des lemmes espagnols, avec catégorie grammaticale | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) | CC BY-SA 3.0 |
| `es-en.data` | Dictionnaire espagnol → anglais (définitions, genre) | [Wiktionary](https://wiktionary.org) | CC BY-SA |
| `sentences.tsv` | Paires de phrases anglais/espagnol avec tags grammaticaux | [Tatoeba](https://tatoeba.org) | CC BY 2.0 FR |

**Décision actée le 20/08/2026, définitive pour tout le projet : le couple cible est espagnol→anglais, pas espagnol→français.** Le schéma `Word` a été renommé en conséquence (`english`/`exampleEn` au lieu de `french`/`exampleFr`) — voir PLAN.md/AUDIT.md à la racine du dépôt.

## Utilisation

```
node download-sources.mjs   # télécharge les 3 fichiers dans ./data/ (~63 Mo, gitignored)
node generate.mjs [N]       # N = nombre de mots visé, défaut 2000
```

Le résultat est écrit dans `mobile/src/data/words.generated.json`. **Il faut le relire avant de l'intégrer** — voir la section « Limites connues » ci-dessous — puis fusionner manuellement dans `words.json` (le script ne le fait jamais automatiquement).

## Comment ça marche

1. **`frequency.csv`** est filtré : on retire les lignes marquées `NOUSAGE` ou `DUPLICATE` (bruit confirmé en inspectant le fichier — prénoms anglais, abréviations comme « sr. », « dr. » qui ont fui du corpus Tatoeba), et les catégories grammaticales `none`, `prop` (noms propres), `letter`, `prefix`, `suffix`, `phrase`, `particle` (pas du vocabulaire autonome exploitable). Les lemmes restants, triés par fréquence décroissante, forment le vivier de candidats.
2. **`es-en.data`** est parcouru une fois pour extraire, pour chaque lemme candidat, un genre (`g: f`/`g: m`) et une glose anglaise principale (la première `gloss:` exploitable du bloc `pos:` correspondant — les sens secondaires, synonymes et notes d'usage sont ignorés délibérément pour garder une fiche par mot simple).
3. **`sentences.tsv`** est parcouru une fois pour trouver, par lemme, la phrase espagnole la plus courte (entre 10 et 90 caractères) dont un des tags grammaticaux pointe vers ce lemme.
4. Le niveau CECRL est une **heuristique par position** dans le classement de sortie (40% A1, 30% A2, 30% B1) — il n'y a pas de vraie donnée CECRL dans la source, donc **à valider manuellement**.

## Limites connues, à valider avant intégration

- **Gloses verbeuses sur les mots grammaticaux** (pronoms, déterminants, prépositions) — Wiktionary y est souvent très académique. Exemple observé : « he, him, masculine personal third person subject and disjunctive pronoun (used as a subject and after prepositions) » pour *él*, contre un simple « to have » pour *tener*. Concerne une minorité de mots (les catégories fermées sont peu nombreuses : ~80 pronoms/déterminants/prépositions/conjonctions sur 2000), mais ce sont les mots les plus fréquents donc les premiers vus par l'utilisateur. Pas corrigé automatiquement pour ne pas risquer de casser les bonnes gloses courtes (ex. « in, at, on » pour *en*, à garder telle quelle).
- **Niveau CECRL approximatif** (voir ci-dessus) — un mot rare peut se retrouver classé A1 simplement parce que son rang de fréquence est haut par accident du filtrage, et inversement.
- **Tags thématiques vides** (`tags: []`) — aucune source de catégorisation thématique (maison, nourriture, etc.) dans les données utilisées.
- **Phrases d'exemple parfois dominées par « Tom »** — particularité connue du corpus Tatoeba (nom générique très utilisé dans les phrases contribuées), pas filtré.
- **Aucun test automatisé sur le script lui-même** — validé manuellement sur un échantillon de 20 mots puis sur les 2000 mots (JSON valide, ids uniques, distribution des niveaux/catégories cohérente), pas de suite Jest dédiée.
