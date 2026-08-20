# Lexis

App d'apprentissage du vocabulaire espagnol → français, sur le principe d'Anki (SM-2), pilotée depuis les notifications de l'écran verrouillé plutôt que depuis l'app elle-même.

## État du projet — pivot vers Expo (20/08/2026)

Le projet a démarré en iOS natif (Swift/SwiftUI/SwiftData), mais sans Mac disponible, six phases sur huit étaient bloquées. **Le développement actif se fait maintenant en Expo/React Native** ([mobile/](mobile/)), qui permet de développer et tester directement sur iPhone depuis Windows, sans Mac ni compte développeur Apple. Contrepartie assumée : pas de Notification Content Extension possible, donc pas d'UI custom dans la notification déroulée — le design « Sol y sombra » ne vit que dans l'app.

Le travail natif Swift n'est pas supprimé, seulement mis en pause : [Packages/SM2Engine](Packages/SM2Engine) et [Packages/ReviewScheduler](Packages/ReviewScheduler) servent de spécification de référence pour le portage TypeScript (mêmes comportements, mêmes tests). Voir [PLAN.md](PLAN.md) pour l'avancement détaillé et [AUDIT.md](AUDIT.md) pour les risques techniques et incidents.

## Lancer l'app (mobile/)

```
cd mobile
npx expo start
```

Puis scanner le QR code affiché avec l'app Appareil photo de l'iPhone (elle propose d'ouvrir dans Expo Go), ou avec le bouton « Scan QR Code » dans Expo Go directement. PC et iPhone doivent être sur le même réseau Wi-Fi. L'app affiche par défaut l'écran de révision (style « Sol y sombra », données mock) ; un lien en bas permet de revenir au panneau de diagnostic de la tâche 0.

## Lancer les tests TypeScript (mobile/)

```
cd mobile
npx jest --watchAll=false
```

`npm test` lance le mode watch (relance automatique à chaque modification).

## Tâche 0 — preuve de concept notifications (validée)

Testait le risque le plus important du pivot : est-ce qu'un bouton d'action sur une notification peut réveiller l'app en arrière-plan pour écrire en base ET programmer une seconde notification, sans jamais ouvrir l'app ? **Résultat : oui, tant que l'app n'a pas été force-quittée par l'utilisateur** — limite documentée par Apple elle-même (voir [AUDIT.md](AUDIT.md)), identique en natif, acceptée comme dégradation silencieuse sans perte de données.

## Archive — version iOS native (Swift/SwiftUI/SwiftData)

Cette section décrit le projet tel qu'il était pensé avant le pivot. Conservée pour référence et parce que [Packages/SM2Engine](Packages/SM2Engine) et [Packages/ReviewScheduler](Packages/ReviewScheduler) restent la spécification du portage TypeScript.

```
Lexis/                                  # cible app (à créer sous Xcode, phase 1)
├── Models/          SwiftData : Word, Card, ReviewLog, UserSettings
├── SM2/             copie/référence locale du package SM2Engine (voir Packages/)
├── Notifications/   planification, file glissante, délégué UNUserNotificationCenter
├── Data/            words.json + import au premier lancement
├── Views/           Aujourd'hui, Session, Statistiques, Decks/mots
├── DesignSystem/    palette « Sol y sombra », frise azulejo, styles de bouton
└── Audio/           AVSpeechSynthesizer (es-ES)

LexisContentExtension/  # cible extension — affichage seul, lit le userInfo de la notif, n'écrit jamais en base (pas d'App Group : compte développeur gratuit)

Packages/SM2Engine/     # package Swift autonome, compilable indépendamment de Xcode
├── Sources/SM2Engine/  SM2Engine.swift, SM2CardState.swift, SM2Grade.swift, SM2Config.swift
└── Tests/SM2EngineTests/
```

`Packages/SM2Engine` sera ajouté au projet Xcode comme dépendance de package locale une fois celui-ci créé (File → Add Package Dependencies → Add Local...).

## Contraintes du compte développeur Apple (gratuit)

- Pas d'App Group, pas de conteneur SwiftData partagé, pas d'`UserDefaults(suiteName:)` — toute donnée nécessaire à la Content Extension voyage dans le `userInfo` de la notification.
- Pas de push, iCloud, WidgetKit ou toute autre capability à entitlement.
- 10 App IDs maximum, 3 appareils maximum, profil de provisioning valable 7 jours (l'app cesse de se lancer passé ce délai, il faut la relancer depuis Xcode).

## Lancer les tests du moteur SM-2

Prérequis sur Windows : [toolchain Swift](https://www.swift.org/install/windows/) + Visual Studio 2022 avec les composants « Développement Desktop en C++ » et un SDK Windows (Swift en a besoin même en dehors de l'IDE, pour son linker). Sur ce dépôt, les deux sont déjà installés.

`swift test` échoue si on le lance depuis un PowerShell ou un cmd.exe ordinaire (le linker `link.exe` de MSVC n'est pas sur le PATH). Il faut passer par l'invite de développeur Visual Studio :

```
"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" -arch=x64
cd Packages\SM2Engine
swift test
```

Si `swift test` échoue quand même avec `unable to load standard library for target 'x86_64-unknown-windows-msvc'` dans un terminal ouvert avant l'installation de Swift, la variable `SDKROOT` n'a pas encore été chargée dans cette session — rouvrir un nouveau terminal, ou la définir explicitement :

```
set SDKROOT=C:\Users\<toi>\AppData\Local\Programs\Swift\Platforms\<version>\Windows.platform\Developer\SDKs\Windows.sdk
```

Sur macOS, une fois le projet Xcode créé, les mêmes tests tournent aussi via `swift test` dans ce même dossier, ou directement depuis Xcode (Cmd+U) si le package y est ajouté.
