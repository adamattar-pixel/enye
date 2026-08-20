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
| Verbes couverts (v1) | **200**, les plus fréquents parmi les 1228 déjà catégorisés "verbe" dans `words.json` — pas une nouvelle source séparée. Extensible sans changement de code (`node generate.mjs 400`) |
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

## Prochaines actions

- [ ] **Retester sur iPhone réel** — en particulier confirmer que les boutons de notation répondent au toucher, que les animations jouent, que l'historique s'affiche et se corrige correctement, que le padding est jugé suffisant, que le plafond nouvelles/révisions se ressent bien en session comme en notification, et que l'installation existante reçoit bien les ~5966 nouveaux mots via `importMissingWords` sans ralentissement excessif au démarrage.
- [ ] **Tester l'onglet Conjugaison sur device** : temps de premier import (~16 400 lignes en base au total avec le vocabulaire), confort de la saisie clavier + tolérance sur les accents jugée bien calibrée ou pas, lisibilité de l'écran Règles avec les accordéons dépliés, et si 5 onglets restent confortables au toucher dans la barre du bas.
- [ ] Regarder le mode sombre en vrai et ajuster la palette si besoin (choix de couleurs non validés par toi).
- [ ] Gloses verbeuses sur les mots grammaticaux (pronoms/déterminants/prépositions) dans le vocabulaire généré — pas corrigées automatiquement (voir AUDIT.md), correctibles au cas par cas si un mot précis pose problème à l'usage (pas d'édition de mot existant dans l'app pour l'instant, seulement ajout/suppression).
- [ ] Intégration de la conjugaison aux notifications verrouillées — explicitement hors périmètre en v1 (voir AUDIT.md), à envisager si l'entraînement en app est jugé utile.
- [ ] Claude : maintenir ce fichier et [AUDIT.md](AUDIT.md) à jour à chaque étape significative.

## Archive — plan de la version iOS native

Conservé pour référence, non poursuivi activement.

- **Contraintes** : compte développeur Apple gratuit (pas d'App Group, pas de push/iCloud/WidgetKit, 10 App IDs max, 3 appareils max, profil 7 jours), iOS 17 min, SwiftUI + SwiftData + Notification Content Extension + `AVSpeechSynthesizer`.
- **Phases 1-8 d'origine** : Setup Xcode (bloqué, macOS requis), Données (schéma proposé, 36 mots), SM-2 (fait, 13 tests), Notifications (bloqué), Content Extension (bloqué), Écrans (bloqué), Audio (bloqué), Finitions (bloqué).
- **Décisions gelées avec le pivot** : nom de travail « Lexis », style des boutons de notation système iOS accepté tel quel, toolchain Swift sur Windows installé et fonctionnel (utile pour continuer à faire tourner les tests de `Packages/`).
- Détails complets : voir l'historique de conversation et [AUDIT.md](AUDIT.md).
