# Plan — Lexis

App d'apprentissage du vocabulaire espagnol → français (SM-2, pilotage par notifications). Ce fichier suit l'avancement réel et les décisions prises.

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
| Boucle de révision (sans Content Extension) | notification 1 = mot seul + bouton « Ver traducción » ; tap → notification 2 programmée en arrière-plan avec traduction + exemple + 4 boutons de notation — **en cours de validation réelle, voir tâche 0** |
| Source de `words.json` | liste de fréquence hermitdave/FrequencyWords (CC BY-SA 3.0) comme guide de priorité ; enrichissement généré par lots validés par l'utilisateur — **seul un échantillon de 36 mots existe, non encore validé** |

### Le calcul des plafonds (pourquoi 8+22, pas 15+80)

8h–22h = 840 min. Avec un espacement moyen de 22,5 min → capacité ≈37 créneaux/jour (mini 28 si tout à 30 min, maxi 56 si tout à 15 min). Les anciens plafonds (15 nouvelles + 80 révisions = 95/jour) dépassaient largement cette capacité, même dans le meilleur cas — 39 cartes n'auraient jamais eu de créneau. Réglage retenu : 8 + 22 = 30/jour, avec une marge d'environ 19 % sous la capacité moyenne estimée.

## Phases

0. **Preuve de concept notifications** (tâche 0) — **en cours**. Prototype construit ([mobile/](mobile/)), en attente du retour de test sur iPhone réel. Risque identifié par la recherche : le pattern à utiliser est `getLastNotificationResponseAsync()` au démarrage (pas l'écouteur classique, qui ne se déclenche pas app fermée) ; historique de bugs Expo sur ce scénario exact, y compris un rapport non résolu de troncature d'écriture asynchrone dans le handler. D'où le test sur device avant tout le reste.
1. **Réglages SM-2** — **fait** (8 nouvelles + 22 révisions = 30/j, voir ci-dessus).
2. **Portage SM-2 en TypeScript** — pas commencé. Les 13 tests de `Packages/SM2Engine` (Swift) servent de spécification ; à porter d'abord, faire passer ensuite.
3. **Persistance + chargement de `words.json`** — pas commencé côté Expo. Contenu de `words.json` toujours incomplet (36/1000-2000 mots, non validés).
4. **Planificateur de notifications** — la logique pure (`Packages/ReviewScheduler`, 9 tests) existe en Swift, à porter en TypeScript sur le même principe que SM-2.
5. **Écrans** (Aujourd'hui, Session, Statistiques, Decks/mots) — pas commencé.
6. **Audio, finitions, mode sombre** — pas commencé.

## Prochaines actions

- [ ] Utilisateur : tester le prototype de la tâche 0 sur iPhone réel et rapporter le résultat (protocole donné en conversation).
- [ ] Claude : ne pas avancer au-delà de la tâche 0 tant que le retour de test n'est pas arrivé (consigne explicite de l'utilisateur).
- [ ] Une fois validé : porter SM-2 puis ReviewScheduler en TypeScript, tests d'abord.
- [ ] Reprendre la validation de `words.json` (échantillon 36 mots) avant l'étape 3.
- [ ] Claude : maintenir ce fichier et [AUDIT.md](AUDIT.md) à jour à chaque étape significative.

## Archive — plan de la version iOS native

Conservé pour référence, non poursuivi activement.

- **Contraintes** : compte développeur Apple gratuit (pas d'App Group, pas de push/iCloud/WidgetKit, 10 App IDs max, 3 appareils max, profil 7 jours), iOS 17 min, SwiftUI + SwiftData + Notification Content Extension + `AVSpeechSynthesizer`.
- **Phases 1-8 d'origine** : Setup Xcode (bloqué, macOS requis), Données (schéma proposé, 36 mots), SM-2 (fait, 13 tests), Notifications (bloqué), Content Extension (bloqué), Écrans (bloqué), Audio (bloqué), Finitions (bloqué).
- **Décisions gelées avec le pivot** : nom de travail « Lexis », style des boutons de notation système iOS accepté tel quel, toolchain Swift sur Windows installé et fonctionnel (utile pour continuer à faire tourner les tests de `Packages/`).
- Détails complets : voir l'historique de conversation et [AUDIT.md](AUDIT.md).
