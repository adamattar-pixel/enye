# Génération d'expressions et locutions

Génère `mobile/src/data/expressions.json` à partir d'une liste écrite à la main directement dans `generate.mjs`, pas d'une source ouverte téléchargée.

## Pourquoi une liste écrite à la main, pas une source type doozan/spanish_data

`words.json` (vocabulaire) et `conjugations.json` viennent tous les deux de sources ouvertes vérifiables à grande échelle (frequency lists, Wiktionary, un moteur de conjugaison évalué à 100% sur 339 200 formes). Aucune source équivalente, fiable et directement exploitable hors-ligne, n'a été identifiée pour les expressions/locutions espagnoles avec traduction anglaise de qualité : une expression idiomatique n'est par définition pas déductible mot à mot d'un dictionnaire bilingue générique (contrairement à un mot simple), donc une approche par fusion automatique de sources (comme `generate-vocabulary`) risquerait de produire des traductions fausses ou approximatives sans relecture humaine — précisément ce que ce domaine ne peut pas se permettre (une expression mal traduite serait pire qu'une glose verbeuse).

Choix fait : une liste curée à la main (60 expressions courantes, réparties par thème), avec traduction anglaise et phrase d'exemple écrites directement — même principe que les 36 premiers mots de `words.json` avant l'intégration à grande échelle (curation manuelle prioritaire quand la qualité prime sur le volume).

## Limites connues

- **60 expressions seulement** — volume volontairement restreint pour rester curable à la main avec un niveau de qualité contrôlé, pas la limite technique du script. Étendre nécessiterait soit plus de curation manuelle, soit l'identification d'une vraie source ouverte fiable pour ce domaine (aucune trouvée à ce jour).
- **Pas de vérification croisée contre une deuxième source** — contrairement à `@v4nn4/ablaut` (vérifié contre deux lexiques indépendants), ces traductions n'ont pas de validation automatisée ; à corriger au cas par cas si une erreur est signalée.
- **Aucun test automatisé sur le script lui-même** — validé manuellement (JSON valide, ids uniques via l'assertion dans `generate.mjs`, un thème par entrée).

## Utilisation

```
node generate.mjs
```

Écrit directement dans `mobile/src/data/expressions.json` (pas de fichier candidat séparé à fusionner, contrairement à `generate-vocabulary` — le volume est assez petit et déjà entièrement relu pour ne pas avoir besoin de cette étape intermédiaire).
