# Plan — Lexis

App d'apprentissage du vocabulaire espagnol → anglais (SM-2, pilotage par notifications). Ce fichier suit l'avancement réel et les décisions prises.

**Pivot linguistique du 20/08/2026, définitif : espagnol→anglais, plus espagnol→français.** Décidé par l'utilisateur en aval du choix de source de vocabulaire (voir section dédiée plus bas). Le schéma `Word` a été renommé partout (`english`/`exampleEn`), les 36 mots déjà écrits à la main retraduits en anglais.

## Pivot vers Expo (20/08/2026)

Sans Mac disponible, six des huit phases de la version iOS native étaient bloquées (voir l'archive plus bas). **On développe maintenant en Expo/React Native** : ça tourne sur Windows, se teste immédiatement sur l'iPhone via Expo Go (pas de Mac, pas de compte développeur, pas d'expiration à 7 jours). Coût accepté : pas de Notification Content Extension → pas de design custom dans la notification déroulée, apparence standard iOS. Détails et alternatives envisagées dans [AUDIT.md](AUDIT.md).

Le travail natif n'est pas perdu : [Packages/SM2Engine](Packages/SM2Engine) (13 tests) et [Packages/ReviewScheduler](Packages/ReviewScheduler) (9 tests) servent de **spécification de référence** pour le portage TypeScript — comportement strictement identique attendu, tests portés avant le code.

## Contraintes non négociables (version Expo)

- **Tout doit tourner hors ligne et dans Expo Go** — aucun besoin ne doit forcer un development build (ça ramènerait au problème du Mac, EAS Build nécessitant soit macOS soit un service payant). Si un besoin l'exige, s'arrêter et prévenir avant de coder.
- Notifications **locales uniquement** (`expo-notifications`) — aucun push, aucun serveur, aucun compte.
- Persistance offline via `expo-sqlite` (stable en Expo Go, confirmé).
- Prononciation via `expo-speech`, code langue `es-ES` (fonctionne en Expo Go ; éviter la sélection de voix précise, signalée peu fiable sur iOS — utiliser uniquement le paramètre `language`).
- Le plafond iOS de 64 notifications locales en attente s'applique toujours (limite système, pas liée à Expo) : file glissante ~50, rechargée à chaque réponse et à chaque ouverture de l'app.

## Décisions validées avec l'utilisateur

| Sujet | Décision |
|---|---|
| Framework | Expo (React Native, TypeScript), **SDK 54** (aligné sur la version d'Expo Go installée sur l'iPhone — 54.0.2 — pas la dernière SDK ; Expo Go ne supporte qu'une seule version de SDK à la fois) |
| Nouvelles cartes / jour | 8 |
| Plafond de révisions / jour | 22 (total 30/j — cohérent avec la fenêtre 8h-22h, voir calcul ci-dessous) |
| Plage horaire des notifications | 8h – 22h |
| Espacement entre cartes dues simultanément | aléatoire 15-30 min (moyenne 22,5 min → capacité ≈37/j), triées par échéance la plus ancienne, jamais tassé (règle défensive testée dans ReviewScheduler) |
| Boucle de révision (sans Content Extension) | notification 1 = mot seul + bouton « Ver traducción » ; tap → notification 2 programmée en arrière-plan avec traduction + exemple + 4 boutons de notation. **Validée sur iPhone réel tant que l'app n'a pas été force-quittée** ; si force-quit, le tap ne fait rien jusqu'à la prochaine ouverture manuelle (limite iOS documentée, acceptée — voir AUDIT.md). Depuis le 20/08/2026, l'écran de révision **dans l'app** reprend le même montage en deux temps (demandé après le premier test réel) |
| Couple de langues | **Espagnol → anglais** (pivot du 20/08/2026, définitif — plus français) |
| Source de vocabulaire | [doozan/spanish_data](https://github.com/doozan/spanish_data) (CC BY 4.0, agrège hermitdave/FrequencyWords + Wiktionary + Tatoeba) — remplace la génération manuelle par lots. **Fusionné dans `words.json` le 20/08/2026 : 6002 mots au total** (36 écrits à la main + 5966 générés), voir section dédiée plus bas |

### Le calcul des plafonds (pourquoi 8+22, pas 15+80)

8h–22h = 840 min. Avec un espacement moyen de 22,5 min → capacité ≈37 créneaux/jour (mini 28 si tout à 30 min, maxi 56 si tout à 15 min). Les anciens plafonds (15 nouvelles + 80 révisions = 95/jour) dépassaient largement cette capacité, même dans le meilleur cas — 39 cartes n'auraient jamais eu de créneau. Réglage retenu : 8 + 22 = 30/jour, avec une marge d'environ 19 % sous la capacité moyenne estimée.

## Décisions validées — fonctionnalités futures (20/08/2026, planification puis implémentation le même jour)

Cadrage initial validé avec l'utilisateur avant tout code ; **implémenté dans la foulée** suite à "code tout ça" — voir la section dédiée plus bas pour le détail de la construction, et AUDIT.md pour le raisonnement derrière chaque décision, notamment le changement de librairie de génération (`spanish-verbs` abandonné après test, remplacé par `@v4nn4/ablaut`).

### Onglet « Conjugaison » (entraînement, flashcards)

| Sujet | Décision |
|---|---|
| Principe de la carte | Un verbe + une personne + un temps sont donnés ; l'utilisateur tape la conjugaison au clavier ; comparaison tolérante sur les accents (ignorés des deux côtés), qui **informe** la note sans la choisir à la place de l'utilisateur — les 4 mêmes boutons qu'en vocabulaire (Otra vez/Difícil/Bien/Fácil) restent proposés après validation |
| Répétition espacée | SM-2, réutilise le moteur existant ([Packages/SM2Engine](Packages/SM2Engine) / [mobile/src/sm2/engine.ts](mobile/src/sm2/engine.ts)) — **pas de nouveau moteur**. Chaque triplet (verbe, personne, temps) est une carte indépendante avec son propre calendrier, en base dans `conjugation_cards`/`conjugation_reviews` |
| Personnes couvertes | yo / tú / él-ella-usted / nosotros / vosotros / ellos-ellas-ustedes — paradigme espagnol d'Espagne complet (avec *vosotros*) ; impératif à 5 personnes (pas de "yo") |
| Temps couverts (v1) | Indicatif : présent, prétérit, imparfait, futur. Conditionnel présent. Subjonctif : présent, imparfait (forme -ra, la forme -se dérivée et acceptée comme réponse valide). Impératif : affirmatif (fourni par la librairie) et négatif (composé : "no" + subjonctif présent) |
| Source des données | Fichier statique `conjugations.json`, produit par [mobile/scripts/generate-conjugations/generate.mjs](mobile/scripts/generate-conjugations/generate.mjs), calcul fait à la génération — **aucune dépendance runtime sur le téléphone** |
| Librairie de génération | **`@v4nn4/ablaut`**, pas `spanish-verbs` comme envisagé initialement — testé avant d'écrire le script, `spanish-verbs` s'est révélé avoir ~43% d'erreurs sur un échantillon de verbes à changement de radical au subjonctif présent (déprécié en plus). `@v4nn4/ablaut` : vérifié à 100,00% sur 339 200 formes espagnoles par ses propres auteurs, retesté ici sans erreur. Voir AUDIT.md et le [README du script](mobile/scripts/generate-conjugations/README.md) |
| Verbes couverts | **1227** (élargi de 200 à quasi-tous les verbes disponibles le 20/08/2026, suite à "vérifie que le répertoire est très grand" — voir plus bas), parmi les 1228 déjà catégorisés "verbe" dans `words.json` — pas une nouvelle source séparée. Extensible sans changement de code si `words.json` en gagne d'autres |
| Écran de révision | Carte « Sol y sombra » cohérente avec le vocabulaire, adaptée pour une saisie au clavier plutôt qu'une révélation en 2 temps — voir [ConjugationReviewScreen.tsx](mobile/src/screens/ConjugationReviewScreen.tsx) |
| Rythme quotidien | Réglages séparés du vocabulaire (`conjugationNewCardsPerDay`/`conjugationReviewCapPerDay`, 8+22 par défaut) — les deux entraînements ne se disputent pas les mêmes créneaux |
| Notifications verrouillées | **Pas intégré en v1** — entraînement dans l'app uniquement, décision de périmètre pour contenir la taille du chantier (voir AUDIT.md) |

### Onglet « Règles de conjugaison » (référence statique)

| Sujet | Décision |
|---|---|
| Nature du contenu | Consultable uniquement, pas de logique dynamique (pas de SM-2, pas de notation) |
| Organisation | 3 modèles réguliers (hablar/comer/vivir) + 12 irréguliers les plus fréquents (ser, estar, tener, ir, hacer, poder, decir, querer, poner, saber, venir, salir), chacun dépliable pour voir ses 9 temps/modes |
| Format | **Pas un second fichier JSON** — lit directement `conjugations.json` (déjà généré pour l'entraînement), un seul jeu de données pour les deux onglets. Sous-onglet de « Conjugaison » plutôt qu'un onglet séparé dans la barre du bas — voir AUDIT.md, ça ramène la barre à 5 onglets au lieu de 6 |

## Phases

0. **Preuve de concept notifications** (tâche 0) — **validée et close**. Le montage en deux temps (mot → « Ver traducción » → 2ème notification traduction + 4 boutons de notation) fonctionne sur iPhone réel tant que l'app n'a pas été force-quittée. Limite acceptée : après un force-quit utilisateur, aucun code ne s'exécute en arrière-plan (politique iOS documentée par Apple, identique en natif — voir AUDIT.md) ; dégradation silencieuse et sans perte de données, résolue à la prochaine ouverture manuelle grâce au rechargement de la file. Bug de prototype trouvé et corrigé au passage : il fallait à la fois `getLastNotificationResponseAsync()` au démarrage ET `addNotificationResponseReceivedListener` en direct, pas l'un ou l'autre.
1. **Réglages SM-2** — **fait** (8 nouvelles + 22 révisions = 30/j, voir ci-dessus).
2. **Portage SM-2 en TypeScript** — **fait**. [mobile/src/sm2/](mobile/src/sm2/) (`types.ts`, `engine.ts`, `engine.test.ts`), 13/13 tests portés depuis `Packages/SM2Engine` et verts, aucune divergence de comportement trouvée.
3. **Persistance + chargement de `words.json`** — **fait**. [mobile/src/data/](mobile/src/data/) : schéma SQLite (`words` + `cards`), import au premier lancement, écran de révision branché sur de vraies cartes dues (plus plus de données mock). Contenu de `words.json` toujours incomplet (36/1000-2000 mots, non validés) — n'empêchait pas de construire le mécanisme.
4. **Planificateur de notifications** — **fait, branché pour de vrai**. [mobile/src/notifications/](mobile/src/notifications/) (`categories.ts`, `queue.ts`, `responseHandler.ts`) programme de vraies notifications `expo-notifications` à partir des cartes dues et de `ReviewScheduler`, avec les vrais mot/traduction/exemple (plus le "gato" figé du prototype de la tâche 0). La file se recharge à l'ouverture de l'app et après chaque note, notification comme in-app.
5. **Écrans** (Aujourd'hui, Session, Statistiques, Decks/mots) — **fait**. Les 4 écrans existent : [TodayScreen](mobile/src/screens/TodayScreen.tsx) (cartes dues, progression du jour), [ReviewScreenContainer](mobile/src/screens/ReviewScreenContainer.tsx) (session), [StatsScreen](mobile/src/screens/StatsScreen.tsx) (série de jours, taux de réussite, mots appris, prévision 7 jours), [DecksScreen](mobile/src/screens/DecksScreen.tsx) (liste filtrable, ajout/suppression de mots, réglages). Navigation : barre d'onglets custom ([RootTabs](mobile/src/navigation/RootTabs.tsx)), pas de librairie de navigation ajoutée.
6. **Audio, finitions, mode sombre** — **fait**. Bouton "Écouter" sur l'écran de révision (`expo-speech`, `language: 'es-ES'`, pas de sélection de voix précise — voir contrainte ci-dessus). Mode sombre : palette déclinée et bascule automatique selon le réglage système (`useColorScheme`), **non validée visuellement** — à eyeballer sur device réel, voir AUDIT.md.
7. **Animations et finitions visuelles** — **fait**, à la demande explicite ("rends l'app plus moderne avec plein d'animation"). `react-native-reanimated` : entrée en fondu/glissé des écrans et des cartes, barre de progression et graphique de prévision animés, retrait au toucher (spring) + retour haptique (`expo-haptics`) sur les boutons principaux, transitions entre onglets. Détail dans AUDIT.md.

## Premier retour sur device réel (20/08/2026)

Trois retours reçus après un vrai test sur iPhone, tous traités :
1. **Démarrage lent** → cause identifiée et corrigée (voir AUDIT.md, notifications programmées en parallèle au lieu d'en séquence, plus bloquant pour l'affichage).
2. **Boutons de notation absents sur l'écran de session** → l'utilisateur attendait le même montage en deux temps qu'en notification (mot → « Ver traducción » → traduction + notation), pas encore implémenté dans l'app jusque-là. Ajouté.
3. **Design jugé « un peu vide »** → padding augmenté (20→24/28 sur les écrans), frise géométrique façon azulejo ajoutée en bas de la carte de révision (déjà prévue dans le cahier des charges d'origine, jamais construite avant).

## Vocabulaire généré depuis doozan/spanish_data (20/08/2026)

Remplace la génération manuelle par lots (trop lente pour atteindre 1000-2000 mots). [mobile/scripts/generate-vocabulary/](mobile/scripts/generate-vocabulary/) télécharge et parse `frequency.csv` + `es-en.data` + `sentences.tsv`, produit `mobile/src/data/words.generated.json`. Détail complet, format, limites connues (gloses verbeuses sur les mots grammaticaux, niveaux CECRL approximatifs, tags thématiques vides) : voir le [README du script](mobile/scripts/generate-vocabulary/README.md) et AUDIT.md.

Écran **Crédits** ajouté (Decks & mots → Réglages → Crédits et sources du vocabulaire) citant hermitdave/FrequencyWords, Wiktionary, Tatoeba et doozan/spanish_data avec leurs licences respectives, comme l'exigent CC BY/CC BY-SA.

**Fusionné dans `words.json` (20/08/2026), demandé explicitement ("met les 2000 voir plus de mots")** : régénéré à 6000 mots (`node generate.mjs 6000`, le script en supportait jusqu'à 17420) plutôt que 2000, fusionné directement sans relecture manuelle (cohérent avec la décision "gros volume direct" déjà actée) — les 36 mots à la main sont gardés tels quels, priorité sur la génération automatique en cas de coïncidence (34 trouvées). **`words.json` : 36 → 6002 mots.** `seedIfEmpty` (qui ne faisait rien sur une base déjà peuplée, donc n'aurait jamais propagé ce changement aux installations existantes) remplacé par `importMissingWords`, qui complète le delta à chaque démarrage au lieu de ne rien faire du tout. Voir AUDIT.md pour le détail et les points non vérifiés (temps du premier import à ce volume).

## Boutons qui ne répondaient pas, historique, padding (20/08/2026)

Nouveau retour après test réel : boutons de notation non réactifs et trop petits, padding insuffisant, demande d'un historique consultable des révisions (mot, traduction, note) avec correction possible en cas de mauvais clic.

- **`react-native-reanimated` + `react-native-worklets` retirés entièrement du projet**, remplacés par l'API `Animated` native de React Native partout où ils étaient utilisés (boutons, écrans, barre d'onglets, barres de progression/prévision) — voir AUDIT.md pour le détail et le raisonnement. Boutons de notation agrandis (48→56px de hauteur) + zone tactile élargie (`hitSlop`).
- **Historique ajouté** : nouvel onglet dans Decks & mots, liste les révisions passées (mot, traduction, note, date), correction de note possible par un sélecteur. Limite assumée et affichée dans l'UI : corrige les stats, ne recalcule pas l'échéance déjà programmée de la carte — voir AUDIT.md.
- **Padding** vérifié sur les 4 côtés de chaque écran, complété là où il manquait (liste de mots, historique).
- **Validation de réglages** : heure de fin ne peut plus précéder l'heure de début (backlog résolu au passage).
- Vérifié : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé (878 modules, HTTP 200). **Non vérifié sur device** — à confirmer au prochain test réel, en particulier si les boutons répondent maintenant au toucher.

## Réglages/Historique/Notifications en onglet à part (20/08/2026)

Demandé explicitement : sortir Réglages et Historique des sous-onglets de Decks & mots. Nouvel onglet "Réglages" dans la barre du bas ([SettingsScreen.tsx](mobile/src/screens/SettingsScreen.tsx)), regroupant Réglages/Historique/Notifications en sous-onglets internes ; Decks & mots ne garde que la liste de mots. Voir AUDIT.md.

## Bouton "Réinitialiser ma progression" (20/08/2026)

"Rien à réviser" après un vidage de cache n'était pas un bug : le cache Metro (JS) et les données SQLite de l'app sont deux choses séparées, la base persiste tant qu'on ne l'efface pas explicitement. Ajouté un bouton dans Réglages → Zone sensible pour repartir de zéro sans attendre les échéances naturelles (efface reviews + cards, remet chaque mot existant en "nouveau"). Voir AUDIT.md.

## Bouton "Encore des cartes" en fin de session (20/08/2026)

Demandé explicitement : pouvoir demander de nouvelles cartes une fois celles du jour terminées. Le plafond `newCardsPerDay` n'était déjà qu'une limite par requête, pas un verrou persisté — `getMoreNewCards` (database.ts) redemande simplement un nouveau lot, affiché via un bouton sur l'écran "Aucune carte due" de la session. Voir AUDIT.md pour le détail. Vérifié : `tsc`, tests, bundle. Non testé sur device.

## Vrai bug de mise en page trouvé + barre d'onglets redessinée (20/08/2026)

Retour "les 4 boutons de notation s'affichent comme des traits entassés" a permis de trouver la vraie cause des soucis de boutons depuis le début : `AnimatedPressable` appliquait `style` (donc `flex`, `height`...) uniquement à un `Animated.View` intérieur, jamais au `Pressable` extérieur — celui qui est réellement l'enfant d'une rangée flex. Sans taille propre, ce `Pressable` s'écrasait. Corrigé en rendant le `Pressable` directement animable (`Animated.createAnimatedComponent`), un seul élément portant à la fois la mise en page et l'animation. Ce correctif explique aussi pourquoi les agrandissements précédents (48→56→68px) n'avaient probablement aucun effet visible — voir AUDIT.md pour le détail complet.

Barre d'onglets du bas agrandie verticalement et redessinée en pilules colorées (sélectionné = couleur pleine, non sélectionné = même teinte éclaircie), demandé explicitement — nouveau token `buttonFilledLight` dans la palette.

Vérifié : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device** — cette fois avec une cause de bug identifiée avec certitude plutôt qu'une hypothèse.

## Padding centralisé, boutons re-agrandis, mode sombre manuel, prochaine notification (20/08/2026)

Nouveau retour : le padding restait invisible malgré le correctif précédent, les boutons de notation restaient trop petits, plus deux demandes — bascule manuelle clair/sombre en haut à droite, et un onglet affichant l'heure approximative de la prochaine notification.

- **Padding centralisé** dans un seul composant ([ScreenContainer.tsx](mobile/src/components/ScreenContainer.tsx)) utilisé par tous les écrans, plutôt que des valeurs dispersées par écran — voir AUDIT.md pour le raisonnement (la quantité n'était probablement pas le problème).
- **Boutons de notation** : 56 → 68px de hauteur, texte plus gros et en gras, `hitSlop` élargi.
- **Mode sombre manuel** : bouton ☀️/🌙 flottant en haut à droite (visible sur tous les écrans), en plus du réglage système — choix persisté dans les réglages.
- **Onglet Notifications** (dans Decks & mots) : estimation approximative de la prochaine notification, assumée comme approximative dans l'UI (l'algorithme de planification tire l'espacement au hasard, voir AUDIT.md).
- Vérifié : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device.**

## Fond de dossier terminé : split nouvelles/révisions + thèmes désactivés (20/08/2026)

Deux éléments de dette technique notés depuis la construction "d'un bloc" ont été traités à la demande explicite de continuer le travail restant :
- **`getDueCardsSplit`** (nouveau, [database.ts](mobile/src/data/database.ts)) remplace le plafond combiné (`DAILY_CARD_LIMIT = 30` dans `ReviewScreenContainer.tsx`, plafond ad hoc dans `TodayScreen.tsx`) : les cartes en révision (plafonnées à `reviewCapPerDay`, triées par échéance) passent en premier, les nouvelles cartes (plafonnées à `newCardsPerDay`, triées par fréquence) sont ajoutées ensuite — au lieu d'un tirage indistinct qui pouvait laisser les nouvelles cartes noyer les révisions en retard ou l'inverse.
- **`disabledTags`** (réglage "thèmes actifs", jusqu'ici défini mais jamais lu) est maintenant appliqué : les mots dont un tag est désactivé n'entrent plus dans le pool de nouvelles cartes. Un mot déjà en cours de révision reste dû même si son tag est désactivé depuis, pour ne jamais faire disparaître une carte déjà commencée.
- **`refillNotificationQueue`** (queue.ts) utilise maintenant `getDueCardsSplit` au lieu de piocher indistinctement jusqu'à `QUEUE_SIZE` (50) parmi toutes les cartes dues — la file de notifications respecte donc le même plafond 8+22 et le même filtre de thèmes que l'écran de session.

Vérifié : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device** — comme le reste de ce chantier.

## Onglets Conjugaison + Règles de conjugaison implémentés (20/08/2026)

Suite directe de la planification ci-dessus, construits dans la foulée ("code tout ça"). Détail technique complet dans AUDIT.md ; résumé :

- **Découverte qui a changé le plan** : la librairie de génération initialement envisagée (`spanish-verbs`) a été testée avant d'écrire le script plutôt que supposée fiable — ~43% d'erreurs trouvées sur un échantillon de verbes à changement de radical au subjonctif présent, dont une contamination croisée entre verbes (`hacer` renvoyait des formes de `tener`). Remplacée par `@v4nn4/ablaut` (vérifié à 100,00% par ses auteurs sur 339 200 formes espagnoles, retesté ici sans erreur) — voir AUDIT.md pour le détail complet du test.
- **Génération** : [mobile/scripts/generate-conjugations/](mobile/scripts/generate-conjugations/), 200 verbes (les plus fréquents déjà catégorisés dans `words.json`) × 52 formes = 10 400 formes, écrit dans `mobile/src/data/conjugations.json`.
- **Base de données** : nouvelles tables `conjugation_cards`/`conjugation_reviews` ([database.ts](mobile/src/data/database.ts)) — le contenu des verbes n'y est pas dupliqué (contrairement à `words`), seule la progression SM-2 de chaque triplet y est stockée. `importMissingConjugationCards` complète le delta à chaque démarrage, même principe que `importMissingWords`.
- **Écrans** : [ConjugationScreen.tsx](mobile/src/screens/ConjugationScreen.tsx) (onglet, sous-onglets Entraînement/Règles), [ConjugationReviewContainer.tsx](mobile/src/screens/ConjugationReviewContainer.tsx) + [ConjugationReviewScreen.tsx](mobile/src/screens/ConjugationReviewScreen.tsx) (session — carte à saisie clavier plutôt que révélation).
- **Validation des réponses** : [conjugation/validate.ts](mobile/src/conjugation/validate.ts), tolérante sur les accents (testé, 8 tests unitaires).
- **Navigation** : 5e onglet dans la barre du bas (libellé "Decks & mots" raccourci en "Decks" pour laisser la place) ; "Règles de conjugaison" est un sous-onglet de "Conjugaison", pas un 6e onglet séparé.
- **"Réinitialiser ma progression"** étendu pour couvrir aussi la conjugaison (un seul bouton pour toute la progression).
- Vérifié : `tsc --noEmit`, `npm test` (51/51, +8 pour la validation de conjugaison), bundle Metro compilé (7,3 → 7,7 Mo). **Non vérifié sur device** — comme le reste construit cette session, y compris le temps de premier lancement avec ~16 400 lignes à importer en base (mots + conjugaisons combinés) et le confort réel de la saisie au clavier sur un clavier iOS.

## Conjugaison : entraînement aléatoire, historique, répertoire élargi à 1227 verbes (20/08/2026)

Retour après un premier test réel de l'onglet Conjugaison : la partie Règles "marche bien", l'entraînement "ça va" mais "c'est pas aléatoire" — les nouvelles cartes défilaient verbe par verbe dans l'ordre d'import (`ORDER BY rowid`), donc de façon très prévisible. Trois demandes explicites + latitude laissée pour d'autres ajustements :

- **Ordre aléatoire** : nouvelles cartes tirées avec `ORDER BY RANDOM()` côté SQL, puis l'ensemble révisions+nouvelles remélangé côté JS ([shuffle.ts](mobile/src/utils/shuffle.ts), testé) avant présentation — voir AUDIT.md.
- **Historique de conjugaison** ajouté (3e sous-onglet de "Conjugaison", à côté d'Entraînement/Règles) — mot conjugué, infinitif, temps/mode, personne, note, correction possible, même principe que l'historique du vocabulaire. **Les notifications verrouillées restent vocabulaire uniquement**, confirmé explicitement par l'utilisateur — pas de sous-onglet Notifications pour la conjugaison.
- **Répertoire élargi de 200 à 1227 verbes** ("vérifie que le répertoire est très grand") — la quasi-totalité des verbes disponibles dans `words.json`, régénéré et revérifié (1 seul rejeté, un artefact de source, pas une vraie erreur de conjugaison). Voir le [README du script](mobile/scripts/generate-conjugations/README.md).
- **Autres ajustements faits de ma propre initiative** (le volume de cartes a été multiplié par ~6, de 10 400 à ~63 800) : les imports SQLite (`importMissingWords`, `importMissingConjugationCards`) sont passés d'un `INSERT` par ligne à des lots de 80 lignes par requête — sinon le premier lancement (ou le premier lancement après cette mise à jour) aurait probablement été nettement plus lent avec ce volume. Voir AUDIT.md pour le raisonnement et ce qui reste à surveiller (tri `RANDOM()` sur un grand nombre de lignes, pas mesuré sur device).

Vérifié : `tsc --noEmit`, `npm test` (55/55, +4 pour `shuffle.ts`), bundle Metro compilé (7,7 → 9,4 Mo, `conjugations.json` nettement plus gros avec 1227 verbes). **Non vérifié sur device.**

## Tags CECRL de words.json — vérifiés déjà complets, rien à faire (20/08/2026)

Demandé explicitement : compléter les tags CECRL (A1/A2/B1) manquants dans `words.json`, en appliquant la même heuristique que `generate-vocabulary` (position dans `frequency.csv`, 40%/30%/30%), sans toucher aux tags déjà présents.

**Vérifié avant de coder, comme demandé** : les 6002 mots de `words.json` ont **tous** déjà un `level` valide — 2400 "A1", 1802 "A2", 1800 "B1" (2400+1802+1800 = 6002, exactement le total). Les 36 mots écrits à la main ont un niveau posé manuellement (majoritairement A1, cohérent avec un vocabulaire de départ pour débutant) ; les 5966 mots générés ont déjà reçu leur niveau par l'heuristique de position au moment de la génération (voir [generate-vocabulary/generate.mjs](mobile/scripts/generate-vocabulary/generate.mjs), fonction `levelForIndex`, déjà en place avant cette demande). **Aucun mot ne manque de tag CECRL — la prémisse "sous-ensemble à compléter" ne tient pas, il n'y a rien à compléter.** Aucun fichier modifié pour ce chantier. Voir AUDIT.md pour le détail de la vérification.

À noter, en marge (pas demandé, juste constaté en vérifiant) : aucun mot n'est actuellement classé "B2", alors que ce niveau existe comme filtre dans Decks & mots (`LEVELS = ['A1','A2','B1','B2']`) — l'heuristique de génération ne produit que A1/A2/B1 (voir `levelForIndex`), donc le filtre B2 est aujourd'hui toujours vide en pratique. Pas un défaut du chantier demandé, juste un constat à connaître.

## Badge de série de jours (streak) sur Aujourd'hui (20/08/2026)

Demandé explicitement : un indicateur visuel de série de jours consécutifs avec au moins une révision — pas de notification "mot du jour" ni de rappel poussé, uniquement l'indicateur.

- **Placé sur Aujourd'hui**, pas Statistiques (qui a déjà le même nombre comme simple tuile, inchangée) — justification : Aujourd'hui est le premier écran ouvert, l'endroit où "ne pas casser la chaîne" pèse le plus sur la décision de réviser ou non, alors que Statistiques est consultée après coup.
- **Réutilise `computeStreak`** (déjà utilisé par Statistiques, voir `stats/statsEngine.ts`) — pas de nouvelle logique de calcul de série dupliquée, comme demandé.
- Deux points ambigus posés à l'utilisateur avant de coder plutôt que devinés : le badge est **toujours visible, y compris à 0** (pas de seuil minimum) ; et quand la série vient de se casser, le badge le **rappelle explicitement** avec la longueur de la série perdue ("Série interrompue — tu avais N jours") plutôt qu'un simple "0 jour" neutre — nouvelle fonction pure `computeLostStreakLength` ([statsEngine.ts](mobile/src/stats/statsEngine.ts), 5 tests) pour retrouver cette longueur.
- Vérifié : `tsc --noEmit`, `npm test` (60/60, +5 pour `computeLostStreakLength`), bundle Metro compilé. **Non vérifié sur device.**

## Planification — Onglet « Compréhension orale » (20/08/2026, aucun code écrit)

Mission de cadrage uniquement, demandée explicitement avant tout code : inspecter l'architecture existante, concevoir la fonctionnalité, documenter ici et dans AUDIT.md. **Rien de ce qui suit n'est implémenté.** But : dictée audio à partir de vraies vidéos YouTube que l'utilisateur ajoute à sa bibliothèque — vidéo + segment choisis automatiquement (au hasard, avec cooldown par vidéo), lecture du segment seul, saisie de ce qui a été entendu, comparaison au transcript réel, notation SM-2.

### Principe directeur : pourquoi réutiliser plutôt que reconstruire

Avant de proposer quoi que ce soit de nouveau, l'architecture existante a été relue en entier avec la question "pourquoi cette fonctionnalité ne pourrait-elle pas utiliser l'abstraction existante X ?" (demandé explicitement). Résultat, poste par poste :

| Besoin | Abstraction existante | Réutilisable telle quelle ? |
|---|---|---|
| Répétition espacée | [mobile/src/sm2/engine.ts](mobile/src/sm2/engine.ts) + [types.ts](mobile/src/sm2/types.ts) — fonction pure `review(card, grade, now)`, aucune dépendance au type de contenu (déjà partagée entre vocabulaire ET conjugaison sans modification) | **Oui, sans changement.** Voir section SM-2 ci-dessous pour le choix de la clé (`segmentId`) |
| Comparaison de réponse tolérante aux accents | [mobile/src/conjugation/validate.ts](mobile/src/conjugation/validate.ts) — `normalize()` interne (accents/casse/espaces) est générique, mais la fonction exportée `isCorrectAnswer(typed, expected, tense, personIndex)` a une signature propre à la conjugaison (le paramètre `tense` ne sert qu'à la règle -ra/-se) | **Partiellement.** La logique de normalisation doit être extraite dans un module partagé plutôt que dupliquée — voir section Validation |
| Stockage | `expo-sqlite`, schéma additif dans `migrateDbIfNeeded()` (`CREATE TABLE IF NOT EXISTS`, pas de vrai système de migration versionné — c'est le principe déjà en place, pas une lacune à corriger ici) | **Oui**, nouvelles tables dans le même fichier, même style |
| Import de contenu en gros volume par lots | `insertInBatches()` ([database.ts](mobile/src/data/database.ts)) | **Oui si besoin**, mais le volume ici (dizaines de vidéos, quelques centaines/milliers de segments) est sans commune mesure avec les 6002 mots/63 800 formes de conjugaison — probablement pas nécessaire, à réévaluer si la bibliothèque grossit beaucoup |
| Navigation par onglets + sous-onglets | [TabBar.tsx](mobile/src/navigation/TabBar.tsx)/[RootTabs.tsx](mobile/src/navigation/RootTabs.tsx) (`TabKey` union, `ActiveSession` union pour les écrans plein écran) + pattern sous-onglets ([ConjugationScreen.tsx](mobile/src/screens/ConjugationScreen.tsx), [SettingsScreen.tsx](mobile/src/screens/SettingsScreen.tsx)) | **Oui**, un 6e onglet + 2 sous-onglets (Entraînement/Bibliothèque), même mécanique |
| UI (carte, boutons, animations, thème) | `ScreenContainer`, `AnimatedPressable`, `FadeInView`, palette Sol y sombra | **Oui, sans changement** |
| Génération de contenu par script Node hors-ligne | [generate-vocabulary/](mobile/scripts/generate-vocabulary/), [generate-conjugations/](mobile/scripts/generate-conjugations/) — script lancé par le développeur sur son PC, produit un JSON statique embarqué dans le bundle de l'app | **Non applicable ici**, et c'est la divergence architecturale la plus importante de tout ce chantier — voir section suivante |

### Divergence architecturale majeure : contenu dynamique + besoin réseau en direct

Deux principes déjà établis et respectés jusqu'ici par tout le reste de l'app sont mis sous tension par cette fonctionnalité, et il faut le dire clairement plutôt que le glisser sous le tapis :

1. **"Tout doit tourner hors ligne et dans Expo Go"** (contrainte non négociable de ce fichier, section plus haut). Or lire une vidéo YouTube nécessite une connexion internet active — c'est inhérent à la demande elle-même ("vraies personnes qui parlent dans des vidéos YouTube" via "le lecteur YouTube officiel/intégré"), pas un choix d'implémentation évitable. **Décision proposée : accepter une exception explicite et documentée à cette contrainte pour ce seul onglet** — le reste de l'app (vocabulaire, conjugation, notifications) continue de fonctionner 100% hors ligne, seul l'onglet Compréhension orale nécessite du réseau, et seulement quand on l'utilise.
2. **Contenu généré par script Node avant le build** (`words.json`, `conjugations.json`) — modèle qui ne convient pas ici : la mission décrit explicitement un flux "coller une URL YouTube dans l'app" (`+ Ajouter une vidéo`), pas "relancer un script sur son PC puis reconstruire l'app". **Décision proposée : la récupération de métadonnées + captions se fait EN DIRECT depuis l'app**, au moment où l'utilisateur ajoute une vidéo — via le `fetch()` natif de React Native, qui n'est **pas** soumis aux restrictions CORS d'un navigateur (CORS est une politique appliquée par les navigateurs web, pas par le runtime réseau de React Native) — donc techniquement faisable sans serveur intermédiaire. Puisque regarder la vidéo nécessite de toute façon internet au même moment, ça n'ajoute pas une nouvelle rupture du principe hors-ligne, seulement le même réseau déjà indispensable utilisé un peu plus tôt dans le flux.

### YouTube — ce qui est officiel, ce qui ne l'est pas

Recherche faite avant de proposer quoi que ce soit, pour ne pas présenter une méthode fragile comme officiellement supportée :

| Besoin | Méthode envisagée | Statut |
|---|---|---|
| Lecture vidéo | WebView + YouTube IFrame Player API (`https://www.youtube.com/iframe_api`), avec `playerVars: { start, end }` | **Officiel et documenté** par Google/YouTube (`developers.google.com/youtube/iframe_api_reference`) — les paramètres `start`/`end` en secondes font partie de l'API publique. C'est aussi la seule méthode conforme à la demande explicite "le lecteur doit utiliser le lecteur YouTube officiel/intégré" — exclut d'office toute extraction de flux vidéo brut, qui violerait les CGU YouTube et n'a jamais été envisagée |
| Métadonnées (titre, chaîne, miniature) | oEmbed : `https://www.youtube.com/oembed?url=...&format=json` | **Officiel, documenté, sans clé API.** Ne fournit pas la durée de la vidéo |
| Durée de la vidéo | Pas de source officielle sans clé API | **Best-effort seulement.** Option A : ignorer ce champ (pas strictement nécessaire au fonctionnement — les segments ont leurs propres horodatages). Option B : demander à l'utilisateur une clé YouTube Data API v3 gratuite (quota généreux pour un usage personnel) s'il veut ce champ rempli. Proposé : **Option A pour la v1**, champ `durationSeconds` nullable |
| Liste des pistes de sous-titres disponibles | Extraction du JSON `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[]` embarqué dans le HTML de la page `watch?v=...`, ou endpoint non documenté `timedtext?type=list&v=...` | **Non officiel.** Aucune API publique YouTube ne permet de lister/télécharger les sous-titres d'une vidéo tierce sans être authentifié comme propriétaire de cette vidéo (`captions.download` de YouTube Data API v3 exige l'autorisation OAuth du propriétaire — inutilisable pour des vidéos publiques quelconques). Chaque piste expose normalement si elle est auto-générée (`kind: "asr"`) ou humaine |
| Contenu du transcript (texte + horodatages) | Endpoint non documenté `timedtext?lang=xx&v=...&fmt=json3` (ou XML par défaut), une fois l'URL de la piste connue | **Non officiel, fragile.** Format observé stable depuis des années dans l'écosystème (bibliothèques communautaires comme `youtube-transcript` s'appuient dessus), mais peut changer sans préavis, n'est couvert par aucune garantie de compatibilité, et pourrait nécessiter des en-têtes/paramètres supplémentaires selon la région ou des évolutions côté YouTube. **Rien de tout ça n'a été testé pendant cette session de planification** (aucun appel réseau fait) — la toute première étape de l'implémentation doit être de vérifier concrètement que ça fonctionne encore, avant de construire le reste par-dessus |

**Aucune dépendance npm de récupération de transcript n'est proposée par défaut.** Deux options pour l'implémentation, à trancher à ce moment-là plutôt que devinées ici :
- **Option A (recommandée)** : implémenter le fetch + parsing à la main en TypeScript (juste `fetch()` + extraction JSON/regex + parsing XML ou JSON3 léger) — pas de nouvelle dépendance runtime, contrôle total, mais il faut écrire et vérifier soi-même le parsing.
- **Option B** : une bibliothèque npm communautaire (ex. `youtube-transcript`) — plus rapide à démarrer, mais ajoute une dépendance à un paquet potentiellement peu maintenu, qui repose sur exactement la même mécanique non officielle en interne (pas plus fiable qu'Option A, juste déjà écrite).

**Auto-générées vs humaines** : les sous-titres auto-générés (ASR) contiennent souvent des erreurs de transcription et une segmentation moins naturelle (coupures en plein milieu d'une phrase). Proposition : accepter les deux en v1 (rejeter uniquement l'absence totale de sous-titres) mais retenir dans `captionStatus` la distinction (`available` = humain, `auto_generated` = ASR) pour l'afficher dans l'UI de la bibliothèque — l'utilisateur reste libre de juger si une vidéo à captions auto-générées vaut la peine d'être gardée.

### Modèle de données proposé

Nouveau module `mobile/src/listening/types.ts` (même esprit que `conjugation/types.ts`) :

```ts
export type CaptionStatus = 'available' | 'auto_generated' | 'unavailable';

export interface ListeningVideo {
  id: string;              // videoId YouTube (ex. "dQw4w9WgXcQ")
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;  // best-effort, voir ci-dessus
  language: string;                // code de la piste de sous-titres utilisée (ex. "es")
  captionStatus: CaptionStatus;
  addedAt: string;                 // ISO
}

export interface ListeningSegment {
  id: string;        // `${videoId}:${index}`
  videoId: string;
  index: number;      // ordre stable dans la vidéo (pas garanti trié par une autre colonne)
  startTime: number;  // secondes, décimales autorisées
  endTime: number;
  transcript: string;
}
```

**Contrairement au vocabulaire et à la conjugaison, il n'y a pas de fichier JSON statique bundlé** : les vidéos sont ajoutées dynamiquement par l'utilisateur pendant qu'il utilise l'app, donc SQLite est la seule source de vérité pour le contenu ET pour la progression — plus proche du design historique de `words`/`cards` (contenu + progression toutes deux en base) que de `conjugation_cards` (progression seule, contenu en JSON importé).

Schéma SQLite proposé (additif dans `migrateDbIfNeeded()`, même style que l'existant) :

```sql
CREATE TABLE IF NOT EXISTS listening_videos (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  duration_seconds REAL,
  language TEXT NOT NULL,
  caption_status TEXT NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listening_segments (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL REFERENCES listening_videos(id),
  segment_index INTEGER NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  transcript TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listening_segments_video_id ON listening_segments(video_id);

-- Même forme que conjugation_cards/conjugation_reviews (progression SM-2 séparée du contenu).
CREATE TABLE IF NOT EXISTS listening_cards (
  id TEXT PRIMARY KEY NOT NULL,  -- = segment id, un segment = une carte (voir section SM-2)
  ease_factor REAL NOT NULL,
  interval_days REAL NOT NULL,
  repetitions INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  learning_step_index INTEGER NOT NULL,
  lifecycle TEXT NOT NULL,
  due_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listening_cards_due_date ON listening_cards(due_date);

CREATE TABLE IF NOT EXISTS listening_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
```

**Pas de table séparée pour l'historique de sélection/cooldown** — dérivé de `listening_reviews` jointe à `listening_segments` (dernières notes distinctes par `video_id`, triées par `reviewed_at DESC`), même principe que "pas de nouvelle abstraction si l'existante suffit". Limite assumée : le cooldown ne compte que les exercices **terminés et notés**, pas ceux commencés puis abandonnés (app fermée en cours de segment) — cohérent avec "ne pas complexifier inutilement", à revoir seulement si ça s'avère gênant à l'usage.

### SM-2 : quelle unité ?

Confirmé par lecture de `sm2/engine.ts`/`types.ts` : `review()` est une fonction pure sur un `SM2CardState` générique, aucune référence au type de contenu — déjà partagée par le vocabulaire (clé = `word.id`) et la conjugaison (clé composite `${verbId}:${tense}:${person}`) sans aucune modification du moteur. **Confirmation de la préférence de l'utilisateur : `segmentId` (soit `${videoId}:${index}`) comme clé, chaque segment est une unité d'apprentissage indépendante** — s'intègre proprement, exactement le même patron que `conjugation_cards.id`. Pas de nouveau moteur, pas de nouvelle abstraction de carte.

### Validation : extension proposée, pas un nouveau validateur

`conjugation/validate.ts` contient déjà la bonne brique de base — `normalize()` (accents via `NFD` + suppression des diacritiques, casse, espaces) — mais :
1. Elle n'est pas exportée séparément de `isCorrectAnswer(typed, expected, tense, personIndex)`, dont la signature est spécifique à la conjugaison (le paramètre `tense` ne sert qu'à la règle -ra/-se du subjonctif imparfait, non pertinente ici).
2. Elle ne supprime pas la ponctuation — **testé sur l'exemple donné dans la mission** ("No sé lo que quieres decir." vs "No se lo que quieres decir" sans point final) : avec la logique actuelle telle quelle, la comparaison échouerait à cause du point final manquant côté réponse, ce qui casserait l'exemple donné. La ponctuation (dont les signes espagnols ouvrants ¿¡) doit être ignorée des deux côtés pour que cet exemple précis fonctionne.

**Proposition (à faire en tout début d'implémentation, avant le reste)** : extraire `normalize()` dans un nouveau module partagé `mobile/src/validation/textAnswer.ts`, l'étendre pour ignorer aussi la ponctuation, et faire réexporter `conjugation/validate.ts` par-dessus (garde sa signature actuelle et ses tests existants inchangés, `isCorrectAnswer` de la conjugaison appelle juste la fonction partagée en interne). La compréhension orale utilise directement la fonction générique, sans les règles -ra/-se propres à la conjugaison. Concrètement :

```ts
// mobile/src/validation/textAnswer.ts
export function normalizeAnswer(s: string): string { /* accents + casse + ponctuation + espaces */ }
export function isExactMatch(typed: string, expected: string): boolean {
  return normalizeAnswer(typed) === normalizeAnswer(expected);
}
```

Ni plus ni moins que ce que les exemples donnés dans la mission exigent — pas de correspondance floue/partielle (une réponse tronquée doit rester incorrecte, exactement comme l'exemple "No sé lo que quieres" le montre), pas de tolérance orthographique au-delà des accents/ponctuation.

### Sélection aléatoire : cooldown vidéo puis segment, intégré au SM-2 existant plutôt qu'à côté

Point le plus important de la mission, détaillé précisément comme demandé.

**Constat d'intégration clé, pas explicitement dans la mission mais nécessaire pour éviter deux systèmes de sélection parallèles** : le vocabulaire et la conjugaison utilisent déjà un patron à deux temps — `getDueCardsSplit`/`getDueConjugationCardsSplit` renvoie les cartes **dues maintenant** (nouvelles + à réviser, plafonnées séparément), et une carte neuve est due immédiatement dès sa création (`due_date = now`). Un segment de compréhension orale suit exactement la même mécanique : neuf tant que jamais noté, donc "due" par défaut. **Proposition : ne pas construire un sélecteur aléatoire séparé du système SM-2, mais un troisième `getDueListeningCardsSplit`, puis appliquer le cooldown vidéo par-dessus son résultat** — un segment "dû" au sens SM-2 ET dont la vidéo n'est pas en cooldown est la définition de "segment exploitable maintenant". Ça répond en même temps à la demande de l'utilisateur (point 8) de ne pas re-proposer un segment déjà vu trop récemment : c'est déjà géré par `due_date`, sans logique supplémentaire à inventer.

Algorithme proposé :

```text
1. dueSegments = getDueListeningCardsSplit(db, now, settings)
   → segments dus (nouveaux + à réviser), plafonnés séparément
     comme pour le vocabulaire/la conjugaison
2. dueVideoIds = ensemble des video_id distincts parmi dueSegments
3. recentVideoIds = derniers VIDEO_COOLDOWN video_id distincts
   (du plus récent au plus ancien), dérivés de listening_reviews
4. eligibleVideoIds = dueVideoIds - recentVideoIds
5. si eligibleVideoIds non vide :
     video = choix aléatoire uniforme dans eligibleVideoIds
   sinon (relâchement progressif, voir section suivante) :
     réduire progressivement combien de "derniers X" comptent comme
     récents, jusqu'à ce qu'au moins une vidéo devienne éligible
6. segment = choix aléatoire uniforme parmi dueSegments filtrés sur
   video_id == video (PAS parmi tous les segments de la vidéo —
   seulement ceux effectivement dus, cohérent avec SM-2)
```

**Pourquoi vidéo d'abord, segment ensuite (jamais l'inverse)**, exactement comme demandé : à l'étape 5-6, le tirage aléatoire porte sur l'ENSEMBLE DES VIDÉOS ÉLIGIBLES, pas sur l'ensemble des segments dus toutes vidéos confondues — une vidéo à 100 segments dus et une vidéo à 2 segments dus ont exactement la même probabilité d'être choisie à l'étape 5 (chacune compte une fois dans `eligibleVideoIds`, indépendamment de son nombre de segments). Le biais que la mission demande explicitement d'éviter est ainsi structurellement impossible, pas juste évité par convention.

### Cas limite : trop peu de vidéos pour respecter le cooldown

Algorithme de relâchement progressif proposé, jamais bloquant :

```text
function selectEligibleVideos(dueVideoIds, recentVideoIdsOrdered, cooldown):
  for windowSize from cooldown down to 0:
    recent = premiers `windowSize` éléments de recentVideoIdsOrdered
    eligible = dueVideoIds - recent
    si eligible non vide : renvoyer eligible
  # windowSize = 0 signifie "aucune vidéo exclue" → eligible = dueVideoIds
  # si dueVideoIds est vide, aucun segment n'est dû, ce n'est plus un
  # problème de cooldown mais l'écran "rien à réviser" (même état que
  # pour le vocabulaire/la conjugaison), pas un cas à gérer ici
```

Exemple concret avec `VIDEO_COOLDOWN = 3` et seulement A, B disponibles (dues) : historique récent `[A, B, A]` → `windowSize=3` exclut A et B, `eligible` vide → `windowSize=2` exclut B et A (les 2 derniers), toujours vide → `windowSize=1` exclut seulement A (le tout dernier) → `eligible = {B}`, non vide, on s'arrête là. Résultat : la contrainte de cooldown est respectée **autant que mathématiquement possible** (ne jamais répéter la toute dernière vidéo si une alternative due existe), et se dégrade en douceur plutôt que de bloquer l'app ou de planter.

### Sélection du segment — pas de logique supplémentaire

Comme expliqué plus haut : le segment est choisi aléatoirement parmi les segments **dus** de la vidéo choisie (`due_date <= now`), pas parmi tous ses segments. Un segment qui vient d'être noté a sa `due_date` repoussée dans le futur par `review()` (comportement déjà existant du moteur SM-2, inchangé) — il ne réapparaîtra donc pas immédiatement, sans avoir besoin d'un tracker "derniers segments vus" séparé. Si la vidéo choisie n'a qu'un seul segment dû, il est réutilisé (comportement attendu et sans alternative, pas un bug).

### Constantes proposées

```ts
export const VIDEO_COOLDOWN = 3;              // demandé explicitement
export const LISTENING_NEW_SEGMENTS_PER_DAY = 5;   // proposition, pas testée à l'usage
export const LISTENING_REVIEW_CAP_PER_DAY = 15;    // proposition, pas testée à l'usage
```

Les deux derniers seraient des réglages utilisateur persistés (`AppSettings.listeningNewSegmentsPerDay`/`listeningReviewCapPerDay`), même patron que `conjugationNewCardsPerDay`/`conjugationReviewCapPerDay` — valeurs de départ plus basses que le vocabulaire/la conjugaison **par hypothèse, pas par mesure** : un exercice de dictée (écouter, taper une phrase entière, comparer) demande plus de temps/effort qu'une carte de vocabulaire ou une forme conjuguée isolée. À ajuster une fois testé en usage réel.

### Pipeline complet

```text
URL YouTube (collée par l'utilisateur)
  ↓ parsing (regex, plusieurs formats : watch?v=, youtu.be/, embed/, shorts/)
videoId
  ↓ fetch oEmbed (officiel)
métadonnées (titre, chaîne, miniature ; durée = null si indisponible)
  ↓ fetch + parsing non officiel (à vérifier en tout début d'implémentation)
captions (liste des pistes, choix de la piste espagnole, contenu horodaté)
  ↓ si aucune piste : captionStatus = 'unavailable', vidéo quand même
    ajoutée à la bibliothèque (visible, non exploitable) — dégradation
    silencieuse demandée explicitement, pas une erreur bloquante
segments (1 cue de sous-titre = 1 segment en v1 — pas de fusion de
  phrases pour rester simple, cohérent avec "ne complexifie pas
  inutilement" ; amélioration possible plus tard, pas en v1)
  ↓ import en base (listening_videos + listening_segments + une
    listening_cards neuve par segment, même patron que
    importMissingWords/importMissingConjugationCards)
vidéo exploitable (captionStatus ≠ 'unavailable' ET ≥ 1 segment)
  ↓
getDueListeningCardsSplit() → cooldown vidéo → vidéo choisie → segment dû choisi
  ↓
lecteur YouTube (WebView + IFrame API, start/end du segment)
  ↓
réponse tapée par l'utilisateur
  ↓
validation (mobile/src/validation/textAnswer.ts, accents + ponctuation)
  ↓
note (voir point ouvert ci-dessous : mappage auto correct/incorrect →
  grade SM-2, ou 4 boutons comme le reste de l'app)
  ↓
review() (sm2/engine.ts, inchangé) → updateListeningCard + logListeningReview
```

### UI proposée (pas codée, juste l'intégration prévue)

- **6e onglet "Écoute"** (ou "Compréhension orale" si la barre le permet — à mesurer, voir Risques) dans [TabBar.tsx](mobile/src/navigation/TabBar.tsx)/[RootTabs.tsx](mobile/src/navigation/RootTabs.tsx), même patron que Conjugaison (`ActiveSession` étendu avec `'listening'`).
- `ListeningScreen.tsx` : 2 sous-onglets, même patron que `ConjugationScreen.tsx`/`SettingsScreen.tsx` :
  - **Entraînement** : nombre de segments dus + bouton "Commencer la session" (copie du patron `TrainingView` de `ConjugationScreen.tsx`).
  - **Bibliothèque** : liste des vidéos ajoutées (titre, statut des captions, nombre de segments), formulaire "+ Ajouter une vidéo" (`TextInput` URL + bouton, avec état de chargement pendant le fetch metadata+captions).
- `ListeningReviewContainer.tsx` + `ListeningReviewScreen.tsx` : copie du patron `ConjugationReviewContainer.tsx`/`ConjugationReviewScreen.tsx` (chargement du prochain segment dû, `TextInput` de réponse, résultat, notation, "Exercice suivant"), avec le lecteur vidéo en haut de la carte à la place du prompt "verbe + temps + personne".
- Nouveau composant `mobile/src/components/YouTubePlayer.tsx` : wrapper autour d'une `WebView` (nouvelle dépendance, voir ci-dessous) chargeant une page HTML minimale embarquant l'IFrame Player API, exposant au composant React `play()`/`seekTo(startTime)` et un événement "segment terminé" (soit via le paramètre `end` natif de l'API, soit via un minuteur JS côté page si `end` s'avère peu fiable en pratique — **à vérifier**, pas supposé).

### Résilience — dégradation silencieuse, comme demandé explicitement

| Cas | Comportement proposé |
|---|---|
| Captions indisponibles à l'ajout | `captionStatus = 'unavailable'`, vidéo ajoutée quand même à la bibliothèque, visible mais marquée non exploitable, jamais sélectionnée par `getDueListeningCardsSplit` (filtre `WHERE caption_status != 'unavailable'` côté requête ou côté jointure) |
| Vidéo supprimée/privée/indisponible après coup | Non détecté proactivement en v1 (pas de vérification périodique) — si le lecteur ne peut pas la charger au moment de l'exercice, l'échec est local à cet essai (voir ligne suivante), la vidéo reste en base telle quelle jusqu'à ce que l'utilisateur la supprime manuellement |
| Échec réseau (fetch metadata/captions, ou chargement du lecteur) | Try/catch à chaque étape, jamais de crash — à l'ajout : message d'erreur dans le formulaire, rien n'est inséré en base ; en session : écran d'erreur simple avec retour à Entraînement, la carte reste due pour la prochaine tentative |
| Erreur du player YouTube (vidéo bloquée à l'intégration, région, etc.) | La WebView/l'IFrame API expose un événement d'erreur documenté (codes d'erreur du player) — à afficher comme message simple, pas de tentative de contournement |

### Fichiers concernés (proposition, pas figée)

**Nouveaux :**
- `mobile/src/listening/types.ts`
- `mobile/src/listening/selection.ts` (logique pure de cooldown + sélection — testable sans réseau ni SQLite)
- `mobile/src/listening/youtubeUrl.ts` (parsing d'URL → videoId — pure, testable)
- `mobile/src/listening/metadata.ts` (fetch oEmbed)
- `mobile/src/listening/captions.ts` (fetch + parsing des sous-titres — non testable unitairement sans mock réseau, à vérifier manuellement)
- `mobile/src/validation/textAnswer.ts` (extraction généralisée depuis `conjugation/validate.ts`)
- `mobile/src/components/YouTubePlayer.tsx`
- `mobile/src/screens/ListeningScreen.tsx`
- `mobile/src/screens/ListeningReviewContainer.tsx`
- `mobile/src/screens/ListeningReviewScreen.tsx`

**Modifiés :**
- `mobile/src/data/database.ts` (4 nouvelles tables + fonctions CRUD, même patron que la section Conjugaison)
- `mobile/src/data/settings.ts` (`listeningNewSegmentsPerDay`/`listeningReviewCapPerDay`)
- `mobile/src/conjugation/validate.ts` (réexporte la logique partagée au lieu de la dupliquer)
- `mobile/src/navigation/TabBar.tsx` / `RootTabs.tsx` (6e onglet)
- `mobile/package.json` / `app.json` (nouvelle dépendance WebView, voir Risques)

**Pas de changement attendu dans `App.tsx`** : contrairement au vocabulaire/à la conjugaison, il n'y a pas de contenu bundlé à importer au démarrage (la bibliothèque est vide au premier lancement, remplie au fil de l'usage) — seul `migrateDbIfNeeded()` (déjà appelé) a besoin des nouvelles tables.

### Tests prévus

- `listening/selection.test.ts` : cooldown avec 4 vidéos A/B/C/D (aucune répétition avant `VIDEO_COOLDOWN`) ; absence de biais par nombre de segments (vidéo à 100 segments dus vs vidéo à 2, test statistique sur de nombreux tirages façon `shuffle.test.ts`) ; cas 1/2/3/4 vidéos disponibles avec `VIDEO_COOLDOWN = 3` (relâchement progressif) ; segment renvoyé appartient toujours à la vidéo choisie.
- `listening/youtubeUrl.test.ts` : extraction du `videoId` pour les formats `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, et rejet propre d'une URL invalide.
- `validation/textAnswer.test.ts` : reprend et étend les cas déjà couverts par `conjugation/validate.test.ts` (accents), ajoute la ponctuation (exemple exact de la mission : "No sé lo que quieres decir." vs "No se lo que quieres decir") et confirme qu'une réponse tronquée reste incorrecte.
- `conjugation/validate.test.ts` : doit continuer à passer sans modification après l'extraction, comme garde-fou de non-régression.
- **Persistance (vidéos/segments/cartes/historique) : pas testable unitairement**, même limite déjà documentée pour `database.ts` (pas de SQLite en mémoire disponible sous Jest/jest-expo) — à vérifier manuellement sur device au moment de l'implémentation, pas promis comme testé automatiquement.

### Points à valider avant implémentation (pas devinés ici)

1. **`react-native-webview` fonctionne-t-il réellement dans l'Expo Go installé sur l'iPhone de l'utilisateur (SDK 54) sans development build ?** C'est la question la plus bloquante de tout ce chantier — si la réponse est non, toute l'approche WebView doit être reconsidérée, et ça remettrait en cause la contrainte "pas de development build" pour cette seule fonctionnalité. À vérifier en tout premier, avant d'écrire quoi que ce soit d'autre.
2. **La récupération de captions (endpoint non officiel) fonctionne-t-elle encore aujourd'hui, et le paramètre `end` de l'IFrame Player API arrête-t-il fiablement la lecture au bon moment ?** Aucun appel réseau fait pendant cette session de planification — à vérifier en tout début d'implémentation, avant de construire le reste par-dessus une hypothèse non vérifiée.
3. **Mappage résultat binaire (✓/✗) → note SM-2 à 4 valeurs.** La maquette UX donnée dans la mission ne montre que "✓ Correct"/"✗ Incorrect" suivi de "Réécouter"/"Exercice suivant" — pas de 4 boutons de notation comme pour le vocabulaire/la conjugaison. Deux options : (A) mappage automatique correct→"Bien", incorrect→"Otra vez" (colle à la maquette donnée telle quelle) ; (B) réutiliser le patron à 4 boutons de la conjugaison après affichage du résultat, pour un signal SM-2 plus nuancé mais qui s'écarte de la maquette fournie. **Recommandation : option A**, mais à confirmer.
4. **Nom exact du 6e onglet dans la barre du bas** ("Écoute" tient sur une pilule à 6 onglets, "Compréhension orale" est nettement plus long) — à trancher en fonction de ce que rend réellement la barre une fois testée à 6 pilules.
5. **Valeurs de départ `LISTENING_NEW_SEGMENTS_PER_DAY`/`LISTENING_REVIEW_CAP_PER_DAY`** (proposées à 5/15 par hypothèse, jamais testées).
6. **Fusion future de segments trop courts/fragmentés** (sous-titres auto-générés parfois coupés en plein milieu d'une phrase) — explicitement hors v1, à revisiter seulement si ça s'avère gênant en usage réel.

## Quatre retours après test réel : vocabulaire aléatoire, notification exacte, stat conjugaison, thèmes (20/08/2026)

- **Le vocabulaire aussi n'était pas aléatoire.** Même défaut que celui déjà corrigé pour la conjugaison, jamais appliqué au vocabulaire jusqu'ici car jamais signalé cassé de ce côté : `fetchNewCardRows` triait les nouveaux mots par `frequency_rank ASC`, donc toujours introduits dans le même ordre (ser, estar, tener...). Corrigé : `ORDER BY RANDOM()` côté SQL + `shuffle()` du résultat combiné révisions+nouvelles dans `getDueCardsSplit`, même patron que `getDueConjugationCardsSplit`.
- **Heure de notification enfin exacte, pas recalculée.** `getNextNotificationTime` relisait le calcul de planification à chaque consultation, et l'espacement aléatoire (15-30 min) faisait diverger l'estimation de l'heure réellement programmée — signalé "pas exact". Corrigé en persistant les créneaux réellement programmés (`scheduled_notifications`, nouvelle table miroir) au moment où `refillNotificationQueue` les programme pour de vrai ; `getNextNotificationTime` les LIT maintenant au lieu de les recalculer. Signature simplifiée (`settings` n'est plus nécessaire).
- **Onglet Conjugaison → Entraînement affiche le total acquis, pas le nombre dû.** Nouvelle fonction `getConjugationCounts` (même principe que `getWordCounts` côté vocabulaire) ; le nombre dû reste utilisé en interne pour activer/désactiver le bouton de session.
- **Tags thématiques pour le vocabulaire généré.** [mobile/scripts/tag-themes/](mobile/scripts/tag-themes/), heuristique par mots-clés sur la glose anglaise — 1027 mots sur 5966 sans tag (17,2%) en ont reçu un ; le reste (mots grammaticaux/abstraits) n'a pas de thème naturel. Détail complet des faux positifs trouvés et corrigés (verbes à sens phrasal, collisions mois/saisons) dans le README du script et AUDIT.md — limite résiduelle assumée, pas une méthode parfaite.

Vérifié : `tsc --noEmit`, `npm test` (60/60), bundle Metro compilé. **Non vérifié sur device.**

## Prochaines actions

- [ ] **Retester sur iPhone réel** — en particulier confirmer que les boutons de notation répondent au toucher, que les animations jouent, que l'historique s'affiche et se corrige correctement, que le padding est jugé suffisant, que le plafond nouvelles/révisions se ressent bien en session comme en notification, et que l'installation existante reçoit bien les ~5966 nouveaux mots via `importMissingWords` sans ralentissement excessif au démarrage.
- [ ] **Tester l'onglet Conjugaison sur device** : l'entraînement est-il perçu comme suffisamment aléatoire maintenant, temps de premier import à ce volume (~69 800 lignes en base au total, mots + conjugaisons), confort de la saisie clavier + tolérance sur les accents jugée bien calibrée ou pas, lisibilité de l'écran Règles et du nouvel historique, et si 5 onglets restent confortables au toucher dans la barre du bas.
- [ ] **Vérifier le badge de série sur device** : lisibilité, et si le message "série interrompue" est jugé motivant ou culpabilisant à l'usage réel (choisi sur demande explicite, mais jamais vu tourner).
- [ ] Regarder le mode sombre en vrai et ajuster la palette si besoin (choix de couleurs non validés par toi).
- [ ] Gloses verbeuses sur les mots grammaticaux (pronoms/déterminants/prépositions) dans le vocabulaire généré — pas corrigées automatiquement (voir AUDIT.md), correctibles au cas par cas si un mot précis pose problème à l'usage (pas d'édition de mot existant dans l'app pour l'instant, seulement ajout/suppression).
- [ ] Intégration de la conjugaison aux notifications verrouillées — explicitement hors périmètre, confirmé une deuxième fois par l'utilisateur (vocabulaire uniquement) : à ne plus reproposer sauf demande explicite.
- [ ] Filtre "B2" dans Decks & mots actuellement toujours vide (voir section CECRL ci-dessus) — pas un problème signalé, à corriger seulement si demandé (ajuster `levelForIndex` pour produire aussi du B2, ou retirer le filtre).
- [ ] **Onglet Compréhension orale — planifié, pas commencé.** Voir section dédiée ci-dessus et AUDIT.md. Avant d'écrire le moindre code : vérifier que `react-native-webview` fonctionne dans l'Expo Go de l'utilisateur (bloquant si non), et que la récupération de captions non officielle fonctionne encore aujourd'hui — les deux points les plus risqués du chantier, à confirmer en premier.
- [ ] Claude : maintenir ce fichier et [AUDIT.md](AUDIT.md) à jour à chaque étape significative.

## Archive — plan de la version iOS native

Conservé pour référence, non poursuivi activement.

- **Contraintes** : compte développeur Apple gratuit (pas d'App Group, pas de push/iCloud/WidgetKit, 10 App IDs max, 3 appareils max, profil 7 jours), iOS 17 min, SwiftUI + SwiftData + Notification Content Extension + `AVSpeechSynthesizer`.
- **Phases 1-8 d'origine** : Setup Xcode (bloqué, macOS requis), Données (schéma proposé, 36 mots), SM-2 (fait, 13 tests), Notifications (bloqué), Content Extension (bloqué), Écrans (bloqué), Audio (bloqué), Finitions (bloqué).
- **Décisions gelées avec le pivot** : nom de travail « Lexis », style des boutons de notation système iOS accepté tel quel, toolchain Swift sur Windows installé et fonctionnel (utile pour continuer à faire tourner les tests de `Packages/`).
- Détails complets : voir l'historique de conversation et [AUDIT.md](AUDIT.md).
