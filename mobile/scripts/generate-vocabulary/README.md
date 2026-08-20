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

Le résultat est écrit dans `mobile/src/data/words.generated.json` — le script ne touche jamais `words.json` automatiquement, la fusion se fait à part (voir « Intégration dans words.json » ci-dessous).

## Comment ça marche

1. **`frequency.csv`** est filtré : on retire les lignes marquées `NOUSAGE` ou `DUPLICATE` (bruit confirmé en inspectant le fichier — prénoms anglais, abréviations comme « sr. », « dr. » qui ont fui du corpus Tatoeba), et les catégories grammaticales `none`, `prop` (noms propres), `letter`, `prefix`, `suffix`, `phrase`, `particle` (pas du vocabulaire autonome exploitable). Les lemmes restants, triés par fréquence décroissante, forment le vivier de candidats.
2. **`es-en.data`** est parcouru une fois pour extraire, pour chaque lemme candidat, un genre (`g: f`/`g: m`) et une glose anglaise principale (la première `gloss:` exploitable du bloc `pos:` correspondant — les sens secondaires, synonymes et notes d'usage sont ignorés délibérément pour garder une fiche par mot simple).
3. **`sentences.tsv`** est parcouru une fois pour trouver, par lemme, la phrase espagnole la plus courte (entre 10 et 90 caractères) dont un des tags grammaticaux pointe vers ce lemme.
4. Le niveau CECRL est une **heuristique par position** dans le classement de sortie (40% A1, 30% A2, 30% B1) — il n'y a pas de vraie donnée CECRL dans la source, donc **à valider manuellement**.

## Limites connues

- **Gloses verbeuses sur les mots grammaticaux** (pronoms, déterminants, prépositions) — Wiktionary y est souvent très académique. Exemple observé : « he, him, masculine personal third person subject and disjunctive pronoun (used as a subject and after prepositions) » pour *él*, contre un simple « to have » pour *tener*. Concerne une minorité de mots (les catégories fermées sont peu nombreuses), mais ce sont les mots les plus fréquents donc les premiers vus par l'utilisateur. Pas corrigé automatiquement pour ne pas risquer de casser les bonnes gloses courtes (ex. « in, at, on » pour *en*, à garder telle quelle).
- **Niveau CECRL approximatif** (voir ci-dessus) — un mot rare peut se retrouver classé A1 simplement parce que son rang de fréquence est haut par accident du filtrage, et inversement.
- **Tags thématiques vides** (`tags: []`) — aucune source de catégorisation thématique (maison, nourriture, etc.) dans les données utilisées.
- **Phrases d'exemple parfois dominées par « Tom »** — particularité connue du corpus Tatoeba (nom générique très utilisé dans les phrases contribuées), pas filtré.
- **Aucun test automatisé sur le script lui-même** — validé manuellement par échantillonnage (JSON valide, ids uniques, distribution des niveaux/catégories cohérente), pas de suite Jest dédiée.

## Intégration dans words.json (20/08/2026)

**Fusionné directement dans `words.json`, sans relecture manuelle mot par mot** — décision actée avec l'utilisateur en amont (« gros volume direct, pas de relecture par petits lots », voir PLAN.md) et confirmée par la demande explicite d'intégrer "2000, voire plus" de mots.

Regénéré avec `node generate.mjs 6000` (plutôt que le défaut 2000) pour couvrir davantage de vocabulaire d'un coup — 17420 lemmes candidats étaient disponibles après filtrage, donc 6000 restait large marge sous le plafond réel ; choisi comme un compromis raisonnable entre "plus de contenu" et une taille de bundle/durée de premier import qui reste correcte, pas comme la limite technique du script (`node generate.mjs 17420` fonctionnerait aussi).

Fusion faite par un script one-off (pas conservé dans le dépôt) : les 36 mots écrits à la main dans `words.json` sont gardés tels quels (curation manuelle prioritaire sur la génération automatique) ; les entrées de `words.generated.json` dont l'id OU le texte espagnol coïncidait avec un des 36 mots à la main ont été exclues (34 coïncidences trouvées) ; le reste (5966 mots) a été ajouté. Résultat : **6002 mots au total**, 0 id dupliqué, 0 champ manquant, 0 glose anglaise vide (vérifié par script avant d'écrire le fichier final).

Les limites listées ci-dessus (gloses verbeuses, niveaux CECRL approximatifs, tags vides, exemples "Tom") s'appliquent donc maintenant à l'ensemble du vocabulaire de l'app, pas seulement à un fichier candidat séparé — assumé, pas caché : reste correctible mot par mot depuis Decks & mots si un utilisateur tombe sur une glose vraiment mauvaise (pas d'édition de mot existant dans l'app pour l'instant, seulement ajout/suppression — voir PLAN.md pour le backlog).
