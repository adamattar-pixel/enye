# Tags thématiques — heuristique par mots-clés

Ajoute des tags thématiques ("nourriture", "casa", "familia", ...) aux mots de `mobile/src/data/words.json` qui n'en ont pas encore — demandé explicitement le 20/08/2026 ("fixe des thèmes pour les 6000 mots de vocabulaire, si tu peux").

## Ce que c'est — et ce que ce n'est pas

**C'est une heuristique par mots-clés sur la glose anglaise, pas une vraie compréhension sémantique.** Chaque thème est une liste de mots-clés anglais ; un mot reçoit un thème si l'un des mots-clés apparaît (en tant que mot entier) dans sa glose. Aucun modèle de langue, aucune API externe — un script Node autonome, dans le même esprit que les autres heuristiques déjà documentées du projet (le niveau CECRL par position de fréquence, par exemple).

## Résultat

Sur les 5966 mots générés (les 36 écrits à la main, déjà tagués manuellement, ne sont jamais touchés) :

- **1027 mots (17,2%) ont reçu au moins un tag.**
- **4939 mots restent sans tag** — très majoritairement des mots grammaticaux (prépositions, pronoms, conjonctions, déterminants) et des adjectifs/verbes abstraits qui n'ont pas de thème concret naturel. Ce n'est pas un échec de la méthode : un mot comme "cependant" ou "au sujet de" n'a simplement pas de thème.

20 thèmes couverts : nourriture, casa, familia, cuerpo, salud, ropa, naturaleza, animales, tiempo_clima, viaje_transporte, trabajo, escuela, tecnologia, dinero, emociones, deportes, ciudad, colores, comunicacion, arte_musica.

## Limite honnête, testée plutôt que supposée : faux positifs dus à l'ambiguïté lexicale anglaise

Une bonne partie de l'effort de ce script a été de **repérer et corriger des faux positifs concrets**, pas de les découvrir après coup :

- Des verbes à sens phrasal ont d'abord été mal classés parce qu'un de leurs mots anglais coïncide avec un mot-clé thématique dans un sens différent : *"to hand"* (donner) classé à tort dans le corps humain à cause de "hand" (main), *"to get back"* (revenir) à cause de "back" (dos), *"to fall"* (tomber) confondu avec la saison "fall" (automne), *"to head out"* (partir) à cause de "head" (tête). **Corrigé** : ces mots-clés ne sont retenus que pour les noms, jamais pour les verbes (`verbAmbiguous` dans `generate.mjs`).
- Certains restent ambigus même en tant que noms et ont été retirés entièrement plutôt que patchés : *"marcha"* (défilé) collisionnait avec le mois "March", *"fuente"* (source d'eau, fontaine) avec la saison "spring". Les noms des mois de mars/mai et les saisons automne/printemps ont donc été retirés de la liste de mots-clés.

**Limite résiduelle, assumée, pas corrigée davantage** : certains faux positifs subsistent, propres à l'ambiguïté entre deux sens NOMINAUX du même mot anglais (pas verbe-vs-nom, donc pas couvert par le mécanisme ci-dessus) — exemples trouvés en vérifiant le résultat : *"arma"* (arme) tagué "cuerpo" à cause de "arm" (bras) dans sa glose "weapon, arm" ; *"baúl"*/*"arca"* (coffre, malle) tagués "cuerpo" à cause de "chest" (à la fois coffre ET poitrine) ; *"líder"* (dirigeant, général) tagué "deportes" parce que sa glose mentionne une équipe sportive comme un exemple parmi d'autres. Une estimation approximative sur l'échantillon vérifié à la main pendant le développement de ce script situe ce taux de faux positifs résiduel autour de 10% des mots tagués sur le thème le plus touché ("cuerpo") — pas mesuré systématiquement sur l'ensemble des 1027 mots tagués, donc à prendre comme un ordre de grandeur, pas un chiffre exact.

**Pourquoi ne pas corriger davantage** : chaque correction spécifique (retirer un mot-clé, l'exclure pour les verbes) referme un cas mais peut en manquer d'autres du même genre — une vraie résolution demanderait une désambiguïsation sémantique (savoir que "arm" dans "weapon, arm" ne signifie pas le bras), hors de portée d'une heuristique par mots-clés. Le compromis retenu : corriger les cas les plus flagrants trouvés en vérifiant le résultat, documenter honnêtement ce qui reste, plutôt que de poursuivre indéfiniment une liste d'exceptions qui ne sera jamais complète.

## Utilisation

```
node generate.mjs
```

Lit et réécrit directement `mobile/src/data/words.json` en place (pas de fichier candidat séparé à fusionner) — ne touche jamais un mot qui a déjà au moins un tag. Idempotent : relancer le script sur un fichier déjà tagué n'a aucun effet (tous les mots concernés ont déjà `tags.length > 0`).

## Correction manuelle

Aucune UI d'édition de mot existant dans l'app pour l'instant (seulement ajout/suppression, voir docs/PLAN.md) — un tag mal posé se corrige en éditant directement `words.json`, ou en relançant ce script après avoir vidé le tableau `tags` du mot concerné.
