# Génération de textes de compréhension écrite

Génère `mobile/src/data/reading.json` à partir de mini-textes espagnols écrits à la main directement dans `generate.mjs`.

## Format choisi

Chaque texte (2-3 phrases, niveau A1/A2) a 1-2 questions de compréhension à **choix multiple** (question + options de réponse, `correctIndex` pointant la bonne option) — pas de réponse ouverte courte.

Choisi explicitement plutôt qu'un format ouvert, pour deux raisons :
- **Génération fiable hors-ligne** : une réponse ouverte correcte a plusieurs formulations valides (ex. "en la playa" / "a la playa" / "en la costa") qu'il faudrait soit lister exhaustivement, soit valider par correspondance floue — aucune des deux options n'est fiable à écrire à la main sans risque d'en oublier une variante raisonnable. Un choix multiple élimine le problème : une seule bonne réponse, sans ambiguïté de formulation.
- **Cohérent avec le rôle de la note SM-2 dans ce domaine** : contrairement à l'écoute (réponse tapée comparée automatiquement au texte), l'utilisateur note lui-même sa compréhension via les 4 boutons habituels après avoir vu la bonne réponse (demandé explicitement) — le choix multiple n'est donc qu'une aide à l'auto-évaluation, pas un mécanisme de correction automatique, donc son format importe moins que sa fiabilité de génération.

**Texte en espagnol, question et options en anglais** — même répartition langue-cible/langue-support que le reste de l'app (vocabulaire, écoute) : le contenu à apprendre est en espagnol, la vérification de compréhension se fait dans la langue de support pour ne pas cumuler la difficulté de lecture du texte ET de la question elle-même.

## Limites connues

- **15 textes seulement (29 questions au total)** — volume volontairement restreint, curé à la main comme `generate-expressions` (voir son README pour le même raisonnement). Pas de source ouverte identifiée pour ce format précis (texte court + question de compréhension) qui soit fiable à générer automatiquement hors-ligne.
- **Aucune vraie question ouverte** — voir "Format choisi" ci-dessus, décision assumée, pas un oubli.
- **Aucun test automatisé sur le script lui-même** — validation faite dans `generate.mjs` (ids uniques, 1-2 questions par texte, `correctIndex` dans les limites), pas de suite Jest dédiée.

## Utilisation

```
node generate.mjs
```
