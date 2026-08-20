# Audit technique — Lexis

Journal des constats techniques, risques et incidents résolus. Chaque entrée : constat → impact → statut. Sert à ne pas re-découvrir deux fois le même problème.

## Pivot vers Expo (20/08/2026)

**Pourquoi.** La version iOS native était bloquée sur 6 phases/8 sans Mac disponible (voir « Archive » plus bas). Expo/React Native permet de développer sur Windows et tester directement sur iPhone via Expo Go, sans Mac, sans compte développeur Apple, sans expiration à 7 jours.

**Ce que ça coûte.** Pas de Notification Content Extension possible en Expo Go sans development build → pas d'UI custom dans la notification déroulée, apparence standard iOS uniquement. Le design « Sol y sombra » ne vit plus que dans l'app elle-même.

## Écran de révision — style Sol y sombra (20/08/2026)

Implémenté : [mobile/src/screens/ReviewScreen.tsx](mobile/src/screens/ReviewScreen.tsx) + [mobile/src/theme/solYSombra.ts](mobile/src/theme/solYSombra.ts). Carte crème/bordure ocre, liseré pointillé façon ticket, bloc traduction fond rose pâle, 4 boutons de notation en pilules (2 lignes de 2 : Otra vez/Difícil en contour ocre, Bien/Fácil en plein bordeaux). Visible par défaut au lancement de l'app (mock data, pas encore branché à SM-2/à la vraie file — tâches 3-4).

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
