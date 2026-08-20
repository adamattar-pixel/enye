# Audit technique — Lexis

Journal des constats techniques, risques et incidents résolus. Chaque entrée : constat → impact → statut. Sert à ne pas re-découvrir deux fois le même problème.

## Flux de révélation in-app + esthétique (20/08/2026)

Retour utilisateur après premier test réel : les boutons de notation semblaient absents sur l'écran de session, l'app paraît un peu vide, et il manque du padding sur les bords. Clarifié avec l'utilisateur : il s'attendait à retrouver le même montage en deux temps que la notification (mot seul → « Ver traducción » → traduction + 4 boutons de notation) **à l'intérieur de l'app aussi** — ce n'était pas construit ainsi jusque-là (traduction affichée immédiatement, sans étape de révélation).

**Hypothèse non retenue, à garder en tête si le problème persiste** : avant de conclure que c'était uniquement un problème de design attendu, une hypothèse technique a été envisagée — `react-native-reanimated` v4 + `react-native-worklets` (installés via `expo install`) nécessitent la New Architecture, et une éventuelle incompatibilité avec Expo Go aurait pu expliquer des éléments (notamment les boutons utilisant `AnimatedPressable`, basé sur `useSharedValue`/`useAnimatedStyle`) qui ne s'affichent pas alors que d'autres éléments (basés sur `entering`/`FadeIn`, un mécanisme différent) s'affichent bien. Recherche faite : Expo Go SDK 54 tourne en New Architecture par défaut, donc en théorie compatible — mais non confirmé sur ce device précis. **Si les boutons de notation restent invisibles après ce correctif (flux de révélation ajouté), c'est cette hypothèse qu'il faudra creuser en premier**, en remplaçant `AnimatedPressable` par l'API `Animated` native de React Native (sans dépendance à Reanimated/worklets) pour isoler la cause.

Implémenté :
- **Écran de révision** ([ReviewScreen.tsx](mobile/src/screens/ReviewScreen.tsx)) : état `revealed` local, réinitialisé à chaque nouvelle carte (`key` côté `ReviewScreenContainer`). Mot + bouton « Ver traducción » d'abord ; au tap, traduction + 4 boutons de notation apparaissent avec une animation d'entrée.
- **Padding** : augmenté sur tous les écrans (bords à 20px → 24-28px). Interprétation de « padding sur les extrémités » — à corriger si ce n'était pas le bon endroit.
- **[AzulejoFrieze.tsx](mobile/src/components/AzulejoFrieze.tsx)** : frise de petits losanges (View tournées à 45°, pas de SVG) en bas de la carte de révision, discrète (opacité 0,3-0,45), reprend une idée du cahier des charges d'origine ("frise géométrique azulejo... pas une image bitmap") jamais implémentée avant ce chantier. Aucun cliché national (pas de drapeau, taureau, etc.), conforme à la contrainte d'origine.

**Non vérifié** : comme tout le reste depuis la tâche 0, ce correctif n'a pas encore tourné sur device au moment où il est écrit.

## Lenteur au démarrage — cause identifiée et corrigée (20/08/2026)

Repéré sur relecture du code suite à une question de l'utilisateur ("l'app est lente au démarrage non ?"), avant même un test réel — donc une hypothèse forte, pas encore confirmée sur device. Deux points bloquaient l'affichage :

1. **`App.tsx`** attendait `refillNotificationQueue()` avant d'appeler `setDb()` — l'écran de chargement restait affiché tant que la file entière n'était pas reprogrammée.
2. **`refillNotificationQueue()`** ([queue.ts](mobile/src/notifications/queue.ts)) programmait les notifications **une par une, en séquence** (`for` + `await` dans la boucle) — jusqu'à 50 appels au pont natif attendus les uns après les autres.

Fix : `setDb()` est maintenant appelé **avant** le rechargement de la file, qui se termine en arrière-plan sans bloquer l'affichage ; la boucle de programmation est passée en `Promise.all` (parallèle, pas séquentiel). Même correctif appliqué dans `ReviewScreenContainer.handleGrade` — noter une carte affichait la suivante seulement après le rechargement complet de la file, ce qui aurait rendu **chaque note** dans une session aussi lente que l'était le démarrage.

**Non confirmé sur device** : c'est un diagnostic à partir du code, pas d'une mesure réelle. Si le démarrage est encore lent après ce correctif, il faudra profiler pour de vrai plutôt que deviner à nouveau.

## Animations et retour haptique (20/08/2026)

À la demande explicite ("rends l'app plus moderne avec plein d'animation et aesthetics"). Ajouté `react-native-reanimated` + `react-native-worklets` (dépendance requise séparément par les versions récentes de Reanimated) et `expo-haptics`, tous compatibles SDK 54 (`expo-doctor` : 18/18 après ajout). Pas de `babel.config.js` dans le projet — le plugin Reanimated est censé être auto-configuré par `babel-preset-expo` sans fichier explicite ; le bundle compile et passe `node -c` sans erreur, donc apparemment fonctionnel, **mais le vrai test est l'exécution sur device, pas juste la compilation**.

Ce qui a été ajouté :
- **[AnimatedPressable.tsx](mobile/src/components/AnimatedPressable.tsx)** : composant réutilisable remplaçant `TouchableOpacity` sur les interactions principales — retrait au toucher (spring) + retour haptique configurable (impact, notification, sélection, ou aucun).
- **Écran de révision** : la carte entre en fondu/glissé à chaque nouvelle carte (remontée via `key`), la traduction apparaît en différé, haptique distinct par note (Warning sur Otra vez, Medium sur Difícil, Light sur Bien, Success sur Fácil).
- **Aujourd'hui** : barre de progression animée (largeur interpolée), entrées en cascade.
- **Statistiques** : barres de prévision qui grandissent depuis 0 au montage, tuiles en cascade.
- **Barre d'onglets** : point actif animé (spring), retour haptique de sélection au changement d'onglet.
- **Decks/mots** : liste de mots qui entre en cascade légère, FAB et puces de filtre avec retrait au toucher.
- Tous les écrans sont passés d'un `StyleSheet.create` statique (au chargement du module) à un calcul par rendu via `useMemo`, nécessaire pour que le mode sombre (palette dynamique) fonctionne — effet de bord positif de ce chantier, pas seulement les animations.

**Non vérifié** : aucune animation n'a été vue jouer réellement — la présence de `entering`/`useAnimatedStyle`/`withTiming` dans un bundle qui compile ne garantit pas qu'elles s'exécutent sans accroc (fluidité, absence de warning "Reanimated 2" au runtime, comportement du plugin worklets) sur un vrai iPhone.

## Reste de l'app construit d'un bloc (20/08/2026) — RIEN DE CE QUI SUIT N'A ENCORE TOURNÉ SUR DEVICE

À la demande explicite de l'utilisateur ("continue tout le reste et je teste tout à la fin"), le reste du plan a été construit sans repasser par un test intermédiaire sur iPhone. Résumé de ce qui a changé, avec un niveau de confiance honnête pour chaque partie :

- **Notifications réelles** ([mobile/src/notifications/](mobile/src/notifications/)) : `queue.ts` programme de vraies notifications à partir des cartes dues (mot réel, pas "gato"), `responseHandler.ts` traite reveal/notation avec le vrai mot via `data.wordId` dans le contenu de la notification, recharge la file après chaque note. **Mécanisme du tap en arrière-plan validé en tâche 0 ; le CONTENU dynamique (vrai mot au lieu du mot figé) n'a pas encore été testé en conditions réelles.**
- **Prototype de la tâche 0 supprimé** (`mobile/src/db.ts`, `mobile/src/notifications.ts`) : son rôle (prouver le mécanisme) est rempli, remplacé par le vrai système ci-dessus. Le panneau de diagnostic n'existe plus dans l'app.
- **4 écrans** : Aujourd'hui, Session, Statistiques, Decks/mots — voir PLAN.md pour le détail. Navigation par barre d'onglets custom (pas de librairie ajoutée). **Jamais ouverts sur device — mise en page, tailles, comportement du clavier (formulaire d'ajout de mot) tout ça est à vérifier.**
- **Statistiques** ([mobile/src/stats/statsEngine.ts](mobile/src/stats/statsEngine.ts)) : logique pure testée (12 tests : série de jours, taux de réussite, prévision de charge). Les requêtes SQLite qui alimentent ces fonctions (`getAllReviews`, `getAllDueDates`, `getWordCounts`) suivent la même limite que le reste de `database.ts` : pas de test automatisé possible.
- **Audio** : bouton "Écouter" sur l'écran de révision, `expo-speech` avec `language: 'es-ES'`. **Jamais entendu en vrai** — la doc dit que ça marche, mais aucune vérification faite ici.
- **Mode sombre** : palette sombre construite (voir section dédiée plus bas), bascule automatique via `useColorScheme()`. **Couleurs choisies par moi, jamais validées visuellement, jamais vues en vrai.**
- **Réglages** (Decks/mots → Réglages) : nouvelles cartes/jour, plafond révisions/jour, heures de la fenêtre, thèmes actifs — stockés dans une table `settings` (clé/valeur JSON), lus par `queue.ts` et `TodayScreen`. Pas de validation d'entrée au-delà de "c'est un nombre" (ex. rien n'empêche de mettre une heure de fin avant l'heure de début).
- **Ajout de mot utilisateur** : formulaire simple (`Modal` + `TextInput`), pas de validation de format au-delà de "mot et traduction non vides".

**Ce qui EST vérifié pour tout ce qui précède** : `tsc --noEmit` sans erreur, `npm test` (43 tests) vert, le bundle Metro compile sans erreur (`curl` sur `/index.bundle`, HTTP 200, pas de "Unable to resolve module"). Ça garantit que le code est syntaxiquement correct et se charge — **pas** qu'il se comporte correctement à l'usage. Seul un test réel sur iPhone le dira.

## Pivot vers Expo (20/08/2026)

**Pourquoi.** La version iOS native était bloquée sur 6 phases/8 sans Mac disponible (voir « Archive » plus bas). Expo/React Native permet de développer sur Windows et tester directement sur iPhone via Expo Go, sans Mac, sans compte développeur Apple, sans expiration à 7 jours.

**Ce que ça coûte.** Pas de Notification Content Extension possible en Expo Go sans development build → pas d'UI custom dans la notification déroulée, apparence standard iOS uniquement. Le design « Sol y sombra » ne vit plus que dans l'app elle-même.

## Portage SM-2 en TypeScript (20/08/2026)

Implémenté : [mobile/src/sm2/types.ts](mobile/src/sm2/types.ts), [engine.ts](mobile/src/sm2/engine.ts), [engine.test.ts](mobile/src/sm2/engine.test.ts) — port direct de `Packages/SM2Engine` (Swift). Les 13 tests Swift ont été traduits 1:1 (mêmes cas, mêmes valeurs attendues) puis passés : **13/13 verts, aucune divergence de comportement trouvée** entre les deux implémentations.

Setup de test ajouté au projet Expo : `jest-expo` + `jest` + `@types/jest` en devDependencies (commande officielle SDK 54 : `npx expo install jest-expo jest @types/jest -- --dev` sous Windows), `"jest": { "preset": "jest-expo" }` dans `package.json`, `"types": ["jest"]` dans `tsconfig.json`. Lancer les tests : `npx jest --watchAll=false` (ou `npm test` pour le mode watch).

## Portage ReviewScheduler en TypeScript (20/08/2026)

Implémenté : [mobile/src/scheduler/types.ts](mobile/src/scheduler/types.ts), [reviewScheduler.ts](mobile/src/scheduler/reviewScheduler.ts), [reviewScheduler.test.ts](mobile/src/scheduler/reviewScheduler.test.ts) — port direct de `Packages/ReviewScheduler` (Swift). Les 9 tests Swift traduits 1:1, **9/9 verts**, aucune divergence de comportement.

**Divergence de signature (documentée, pas de comportement) :** la version Swift permet d'injecter un `Calendar` pour les tests ; TypeScript/`Date` n'a pas d'équivalent objet-calendrier passable en paramètre. La version TS n'expose donc pas ce paramètre — le comportement (fenêtre, espacement, report au lendemain) reste identique, seule la façon de fixer le fuseau horaire en test diffère (voir incident ci-dessous).

**Incident résolu — fuseau horaire des tests sous Windows/Node :** fixer `process.env.TZ = 'UTC'` en tête du fichier de test échouait silencieusement (décalage de 2h constaté sur tous les résultats) — sur cette machine, Node/V8 ne relit pas cette variable une fois le processus démarré ; le fuseau horaire local effectif reste celui figé au lancement. Fix : fixer `TZ=UTC` **avant** le démarrage de Node, via `cross-env` dans le script npm (`"test": "cross-env TZ=UTC jest --watchAll"`, `mobile/package.json`) plutôt que dans le code du test. `cross-env` ajouté en devDependency (nécessaire pour que la syntaxe `TZ=UTC commande` fonctionne aussi sur Windows, où `cmd.exe` ne la supporte pas nativement contrairement à bash).

## Mode sombre — palette non validée (20/08/2026)

Le cahier des charges d'origine demandait de proposer une déclinaison sombre et de la faire valider avant application. Avec la consigne "fais comme tu le souhaites" / "continue tout le reste", une palette a été choisie et appliquée directement plutôt que d'attendre une validation qui aurait bloqué le reste. Valeurs dans [solYSombra.ts](mobile/src/theme/solYSombra.ts) : fond très sombre chaud (`#241812`, pas noir pur), textes crème clair (`#F5E6D3`), accents ocre/bordeaux éclaircis pour rester lisibles sur fond sombre (`#D98A4D`, `#B25454`). Bascule automatique selon `useColorScheme()`, pas de réglage manuel dans l'app. **À valider visuellement au premier test réel** — c'est un choix de couleurs de ma part, pas une spec.

## Persistance SQLite + import words.json (20/08/2026)

Implémenté : [mobile/src/data/](mobile/src/data/) — `types.ts` (type `Word`), `wordRepository.ts` (validation/parsing de `words.json`, testé : 8 tests), `database.ts` (schéma `words`/`cards`, import au premier lancement, requêtes cartes dues, écriture après notation), `words.json` (copie de `WordList/words.sample.json`, 36 mots). L'écran de révision est maintenant branché sur de vraies données via [ReviewScreenContainer.tsx](mobile/src/screens/ReviewScreenContainer.tsx) : ouverture de la base, import si vide, chargement de la carte due la plus ancienne, notation → `SM2Engine.review()` → écriture en base → carte suivante. Choix pragmatique : construit avec l'échantillon de 36 mots plutôt que d'attendre les 1000-2000 mots finaux — le mécanisme de chargement ne dépend pas du volume de contenu.

**Non testé unitairement, à vérifier sur device réel** : `database.ts` (schéma, import, requêtes) n'a pas de test automatisé — `jest-expo` n'expose pas de SQLite en mémoire fonctionnel pour `expo-sqlite` dans l'environnement de test Node. Seule la partie pure (`wordRepository.ts` : validation/parsing du JSON) est testée. Ne pas considérer la persistance comme validée avant un test réel sur iPhone.

## Écran de révision — style Sol y sombra (20/08/2026)

Implémenté : [mobile/src/screens/ReviewScreen.tsx](mobile/src/screens/ReviewScreen.tsx) + [mobile/src/theme/solYSombra.ts](mobile/src/theme/solYSombra.ts). Carte crème/bordure ocre, liseré pointillé façon ticket, bloc traduction fond rose pâle, 4 boutons de notation en pilules (2 lignes de 2 : Otra vez/Difícil en contour ocre, Bien/Fácil en plein bordeaux). Branché à SM-2 + SQLite depuis, voir la section « Persistance SQLite » plus haut et « Reste de l'app construit d'un bloc » en tête de fichier.

**Limite notification vs in-app : confirmée appliquée, pas re-découverte.** Comme déjà acté plus haut, aucune UI custom n'est possible dans la notification système en Expo Go (pas de Content Extension) — le style « Sol y sombra » ne s'applique qu'à l'écran de révision dans l'app. Le contenu de la notification programmée par le prototype (titre = mot, corps = traduction + exemple) reste du texte brut lisible, géré par le style natif iOS ; aucun changement nécessaire de ce côté.

**Écarts avec la spec visuelle fournie, à valider** :
- La spec ne montrait que 2 boutons (Difícil contour ocre / Fácil plein bordeaux) alors que SM-2 a besoin de 4 notes. Extrapolé à 4 en gardant le principe (négatif = contour, positif = plein) : Otra vez + Difícil en contour, Bien + Fácil en plein — à confirmer, pas dans la spec d'origine.
- Couleurs non précisées dans la spec (label « LEXIS », texte méta) : choisies par cohérence avec le reste de la palette, voir commentaires dans `solYSombra.ts`.
- Police : « Georgia » (serif système iOS, pas de nouvelle dépendance installée sans demander) plutôt qu'une police Google Fonts qui aurait nécessité `expo-font` + un package supplémentaire.

**Recherche menée avant de coder quoi que ce soit** (voir aussi PLAN.md) — questions posées et réponses trouvées, avec sources :

| Question | Réponse | Confiance |
|---|---|---|
| Notifications locales programmées, dans Expo Go (iOS) | Oui — la dépréciation du push en Expo Go (SDK 53) ne concernait que le push Android, pas les notifications locales | Haute — [docs.expo.dev](https://docs.expo.dev/push-notifications/what-you-need-to-know/), [changelog SDK 53](https://expo.dev/changelog/sdk-53) |
| Catégories + boutons d'action custom, dans Expo Go | Oui (API 100% runtime, pas de config plugin/rebuild nécessaire) | Moyenne-haute — des rapports épars et non résolus signalent des boutons parfois invisibles app fermée/arrière-plan ([expo/expo#36282](https://github.com/expo/expo/issues/36282)) |
| **JS exécuté + écriture SQLite au tap d'un bouton, app totalement fermée** | **Conditionnellement oui**, via `getLastNotificationResponseAsync()` appelé au démarrage — **pas** via l'écouteur classique (`addNotificationResponseReceivedListener`), qui ne se déclenche que si du JS tourne déjà. Un correctif de *documentation* (pas de code) a été fusionné en mars 2026 sur ce point précis ([expo/expo#40590](https://github.com/expo/expo/issues/40590)). Un rapport séparé et non résolu signale que du travail asynchrone dans le handler peut être tronqué avant la fin ([expo/expo#34498](https://github.com/expo/expo/issues/34498)). | **Basse-moyenne — c'est LE point qui décide de la viabilité du produit. Aucune source ne tranche définitivement. → tâche 0 : prototype + test réel obligatoire avant de construire le reste.** |
| `expo-sqlite` stable dans Expo Go | Oui (sauf SQLCipher, hors sujet ici) | Haute — [docs.expo.dev/sdk/sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| `expo-speech`, voix es-ES, dans Expo Go | Fonctionne via le paramètre `language` ; la sélection d'une voix précise est signalée peu fiable sur iOS ([expo/expo#12720](https://github.com/expo/expo/issues/12720)) | Moyenne |

**Version SDK ajustée à SDK 54 (20/08/2026).** Le projet avait été créé sur SDK 57 (la plus récente à ce moment) ; l'iPhone de l'utilisateur a Expo Go **54.0.2** installé — Expo Go ne charge qu'un seul SDK à la fois et refuse un projet d'une autre version ([doc officielle](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/)). Réalignement fait avec `npm install expo@^54.0.0` puis `npx expo install --fix` (aligne automatiquement `expo-notifications`, `expo-sqlite`, `react`, `react-native`, `@types/react`, `typescript` sur les versions compatibles SDK 54 — pas besoin de les fixer à la main). Vérifié : `npx expo-doctor` (18/18), `tsc --noEmit` (aucune erreur), démarrage du serveur (`npx expo start`) sans erreur. L'API `expo-notifications`/`expo-sqlite` utilisée dans le prototype est identique entre SDK 54 et SDK 57 (vérifié sur la doc versionnée des deux), donc aucun changement de code n'a été nécessaire, seulement les dépendances.

**Premier test utilisateur (20/08/2026) : échec, cause identifiée dans le prototype, pas dans Expo.** La 2ème notification n'apparaissait pas, y compris avec l'app en arrière-plan (pas tuée). Cause : `App.tsx` ne vérifiait `getLastNotificationResponseAsync()` **qu'une seule fois, au montage initial** — si l'app tournait déjà (arrière-plan, JS non redémarré), ce check ne se redéclenchait jamais, et l'écouteur en direct (`addNotificationResponseReceivedListener`) n'était pas branché du tout. Corrigé : les deux chemins tournent maintenant en parallèle, avec un tag `startup`/`listener` dans le journal pour voir lequel capte quoi.

**Deuxième test utilisateur, après correctif : succès app en arrière-plan (pas tuée).** Les 3 étapes attendues apparaissent (reveal capté, 2ème notification programmée et livrée, grade capté sur cette 2ème notification) — le montage en deux temps fonctionne bel et bien en arrière-plan.

**Troisième test, app totalement tuée (force-quit, swipe dans le multitâche) : échec total, rien ne se passe.** Recherche menée pour savoir si c'est un bug Expo ou une limite plus générale — **c'est une politique iOS documentée par Apple elle-même, pas un bug Expo, et elle s'appliquerait identiquement à une app 100% Swift/UIKit native** :

- Quand l'utilisateur force-quit une app, iOS ne la relance **pour aucune raison** en arrière-plan (fetch silencieux, push silencieux, `BGAppRefreshTask`, et par le même mécanisme, une action de notification en `opensAppToForeground: false`) tant qu'il ne l'a pas rouverte manuellement. Confirmé par des ingénieurs Apple DTS sur les forums développeurs officiels : [thread 62005](https://developer.apple.com/forums/thread/62005) (*"the system accepts this as a signal that the user no longer wishes this app to be running, also in the background"*), [thread 62006](https://developer.apple.com/forums/thread/62006). Doc officielle : [About the background execution sequence](https://developer.apple.com/documentation/uikit/about-the-background-execution-sequence).
- Le blocage a lieu **avant qu'une seule ligne de code (Swift ou JS) ne s'exécute** — au niveau du lancement de processus par l'OS. Aucune techno ne peut y échapper.
- Seule exception documentée : le region monitoring (géofencing), sans rapport avec Lexis.
- Fait cohérent avec nos tests : un **tap simple sur le corps de la notification** (qui ouvre l'app au premier plan, comme taper sur l'icône) relance bien l'app même après force-quit — seule l'action en arrière-plan est bloquée.
- Aucune API pour détecter côté app "ai-je été force-quittée ?" ([thread 97582](https://developer.apple.com/forums/thread/97582), un ingénieur Apple : *"there's probably no solution to this"*).
- **Non confirmé** : si ce blocage s'applique aussi quand iOS tue lui-même l'app en arrière-plan par manque de mémoire (jetsam), par opposition à un force-quit volontaire de l'utilisateur — la doc Apple parle spécifiquement du geste utilisateur, sans trancher ce cas. À observer en usage réel.

**Décision produit (20/08/2026, validée avec l'utilisateur) : accepter la limite, ne pas redesigner la boucle.** Le force-quit est un geste rare et délibéré, peu probable sur une app qu'on n'ouvre presque jamais activement. La dégradation est silencieuse et non destructive : la carte reste due, et le mécanisme déjà prévu (file de notifications rechargée à chaque ouverture de l'app) resynchronise tout dès la prochaine ouverture manuelle. **Tâche 0 : validée et close.**

## Environnement de développement — archive (version native)

- **Pas de Mac disponible.** Xcode ne tourne que sur macOS, sans exception. Impact : phases 1, 4, 5, 6, 7, 8 du plan sont bloquées pour tout build/run/test réel. Statut : assumé par l'utilisateur, on avance sur SM-2 et les données en attendant.
- **Sideloading (AltStore/SideStore/Sideloadly) ne résout pas le besoin de Mac.** Ces outils installent un `.ipa` déjà compilé sur iPhone depuis Windows avec un compte Apple gratuit, mais ne compilent rien : Xcode reste requis pour produire le binaire et configurer la Notification Content Extension. Statut : noté, pas de solution de contournement retenue.
- **Swift sur Windows nécessite Visual Studio**, pas seulement le toolchain officiel. `winget install Swift.Toolchain` seul plante silencieusement (`STATUS_DLL_NOT_FOUND`, code `-1073741515` / `0xC0000135`) car `swift.exe` dépend du linker et des libs MSVC/Windows SDK. Statut : résolu (voir journal ci-dessous).

## Risques produit identifiés

- **Boutons de notation dans la notification déroulée** (`Otra vez`/`Difícil`/`Bien`/`Fácil`) seront probablement des `UNNotificationAction` — stylés par iOS, pas par l'app. Le design "Sol y sombra" (pilules ocre) ne s'appliquera donc vraisemblablement qu'à la partie custom de la vue (mot, traduction, exemple), pas aux boutons eux-mêmes. Décision utilisateur : accepter le style système plutôt que de casser la boucle "jamais ouvrir l'app" avec un écran de confirmation dans l'app. À vérifier réellement sur iPhone en phase 5 — si le rendu s'avère pire que prévu, revenir sur cette décision.
- **`words.json` ne peut pas être dérivé mécaniquement de la liste de fréquence.** hermitdave/FrequencyWords compte des formes fléchies ("estoy", "estás", "está" séparément), pas des lemmes. Un import brut produirait un vocabulaire de mauvaise qualité (doublons de fait, formes conjuguées traitées comme mots séparés). Statut : la liste sert uniquement de guide de priorité ; le contenu réel (lemmes, traductions, exemples) est écrit/généré à la main par lots, validés par l'utilisateur avant de continuer.
- **Genres irréguliers** (ex. "agua", féminin mais précédé de "el" à l'oral pour l'euphonie) : le champ `gender` reflète le genre grammatical réel (utile pour l'accord des adjectifs), pas l'article employé dans l'usage oral. À garder en tête pour les mots similaires ("águila", "hacha", etc.) lors des prochains lots.
- **`AVSpeechSynthesizer` dans une Notification Content Extension** : fiabilité non vérifiée (mentionné comme risque dans le cahier des charges initial). Pas encore testé — à faire dès qu'un Mac et un iPhone sont disponibles (phase 5 ou 7). Ne pas supposer que ça fonctionne avant test réel.

## Journal des incidents résolus (installation Swift / Visual Studio sur Windows)

1. `winget install Swift.Toolchain` seul → `swift --version` plante sans sortie, code `-1073741515` (`STATUS_DLL_NOT_FOUND`). Cause : dépendances MSVC/Windows SDK absentes.
2. 1ère tentative d'installer Visual Studio 2022 Community avec `--custom "...--quiet"` → échec, exit code 87. Cause : winget ajoute déjà `--passive`, qui est incompatible avec `--quiet` passé en plus. Fix : retirer `--quiet` du `--custom`.
3. 2e tentative (sans `--quiet`) → VS Community installé avec succès, mais le composant demandé `Microsoft.VisualStudio.Component.Windows11SDK.22000` n'existe pas dans le catalogue de la version 17.14 installée (log : *"Cannot find package ... in product graph"*). Cet ID, documenté sur swift.org, est obsolète pour les canaux VS récents.
4. Recherche du bon ID dans `C:\ProgramData\Microsoft\VisualStudio\Packages\_Channels\*\catalog.json` → `Microsoft.VisualStudio.Component.Windows11SDK.26100` disponible. Réinstallation ciblée sur ce composant → SDK effectivement présent (`C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0`).
5. `swift test` échouait encore avec `unable to load standard library for target 'x86_64-unknown-windows-msvc'` malgré le SDK installé. Cause : la variable d'environnement `SDKROOT` positionnée par l'installeur Swift (au niveau utilisateur, via registre) n'était pas visible dans la session shell déjà ouverte avant l'installation — Windows ne propage pas les changements de variables d'environnement aux processus déjà lancés. Fix : la définir explicitement (`set SDKROOT=...\Windows.platform\Developer\SDKs\Windows.sdk`) dans le script de lancement, ou ouvrir un nouveau terminal après installation.
6. `swift test` échoue aussi si lancé depuis un PowerShell/cmd ordinaire, même avec `SDKROOT` correct : `link.exe` (MSVC) n'est pas sur le PATH en dehors d'une invite de développeur Visual Studio. Fix définitif : lancer via `VsDevCmd.bat -arch=x64` avant `swift test`. Procédure documentée dans le [README](README.md).

**Résultat** : `swift test` fonctionne de façon fiable et reproductible avec la procédure du README.

## État de la suite de tests

- `Packages/SM2Engine` : 13 tests, 0 échec (dernière exécution le 19/08/2026). Couvre : progression des étapes d'apprentissage (new/learning), graduation (Bien/Fácil), phase de révision (Bien/Difícil/Fácil/Otra vez), passage en relearning après un échec, plancher du facteur de facilité à 1.3, non-régression de l'intervalle sur "Difícil".

## À vérifier dès qu'un Mac est disponible

- [ ] `Packages/SM2Engine` s'ajoute proprement au projet Xcode comme dépendance de package locale.
- [ ] Rendu et interactivité réels des `UNNotificationAction` sur iPhone (styling, nombre de boutons affichables, comportement de `UNNotificationExtensionUserInteractionEnabled`).
- [ ] Fiabilité d'`AVSpeechSynthesizer` appelé depuis la Content Extension.
- [ ] Comportement de la file de notifications glissante face au plafond de 64 notifications locales en attente, en conditions réelles (pas seulement en théorie).
