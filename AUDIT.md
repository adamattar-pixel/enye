# Audit technique — Lexis

Journal des constats techniques, risques et incidents résolus. Chaque entrée : constat → impact → statut. Sert à ne pas re-découvrir deux fois le même problème.

## Vocabulaire aléatoire, notification exacte, stat conjugaison, thèmes (20/08/2026)

Quatre retours groupés dans un même message après un test réel.

### Vocabulaire pas aléatoire — même bug que la conjugaison, jamais corrigé côté vocabulaire

**Constat.** `fetchNewCardRows` (utilisée par `getDueCardsSplit`) triait les nouveaux mots par `ORDER BY w.frequency_rank ASC` — un tri par fréquence, pas aléatoire, donc les nouveaux mots apparaissaient toujours dans le même ordre (ser, estar, tener, hacer...) à chaque session. Exactement le même défaut que celui trouvé et corrigé plus tôt pour `getDueConjugationCardsSplit`, mais jamais appliqué au vocabulaire — à l'époque, seule la conjugaison avait été signalée cassée, donc le vocabulaire n'avait pas été touché ("ne pas complexifier là où rien n'a été signalé cassé"). Maintenant signalé cassé aussi.

**Impact.** Corrigé de la même façon : `ORDER BY RANDOM()` sur la sélection des nouvelles cartes, puis `shuffle()` (Fisher-Yates, déjà utilisé et testé pour la conjugaison) sur l'ensemble révisions+nouvelles avant renvoi par `getDueCardsSplit`.

**Statut : implémenté.** Vérifié : `tsc --noEmit`, `npm test`, bundle Metro compilé. **Non vérifié sur device.**

### Heure de notification enfin exacte — persistée, pas recalculée

**Constat.** `getNextNotificationTime` recalculait le planning de notification à chaque consultation (rejouait `ReviewScheduler` avec un nouvel espacement aléatoire 15-30 min à chaque appel), donc l'heure affichée pouvait diverger de celle réellement programmée par le dernier `refillNotificationQueue` — déjà noté comme "approximatif, assumé comme tel" dans une entrée précédente de ce fichier, mais l'utilisateur signale maintenant que ce n'est pas assez précis.

**Impact / décision.** Plutôt que d'essayer de lire le format de retour non documenté de `Notifications.getAllScheduledNotificationsAsync()` (option déjà écartée précédemment, toujours pas tentée), la vraie source de vérité a été rapprochée du calcul : `refillNotificationQueue` calcule déjà les créneaux réels (`slots`) avant de les programmer côté OS — ils sont maintenant AUSSI persistés dans une nouvelle table miroir `scheduled_notifications` (word_id, fire_date), au moment exact où ils sont programmés pour de vrai. `getNextNotificationTime` n'a plus qu'à lire `MIN(fire_date) WHERE fire_date > now` — une lecture, plus une estimation. Signature simplifiée en conséquence (`settings` n'est plus un paramètre nécessaire, l'appelant dans `SettingsScreen.tsx` mis à jour).

**Statut : implémenté.** Vérifié : `tsc --noEmit`, `npm test`, bundle Metro compilé. **Non vérifié sur device** — en particulier que l'heure affichée corresponde bien, au dixième de seconde d'arrondi près, à la notification réellement reçue.

### Onglet Conjugaison → total acquis plutôt que nombre dû

**Constat/décision.** Demandé explicitement : remplacer l'affichage "N conjugaisons dues" par le total de conjugaisons acquises. Nouvelle fonction `getConjugationCounts(db)` ([database.ts](mobile/src/data/database.ts)), même principe que `getWordCounts` déjà existant côté vocabulaire (`learned` = `lifecycle != 'new'`, `total` = toutes les cartes). Le nombre dû (`dueCount`) reste calculé et utilisé en interne pour activer/désactiver le bouton "Commencer la session"/"Rien à réviser" — seul l'affichage du gros chiffre a changé, pas la logique de session.

**Statut : implémenté.** Vérifié : `tsc --noEmit`, `npm test`, bundle Metro compilé. **Non vérifié sur device.**

### Tags thématiques pour les 6000 mots de vocabulaire — fait, avec des limites honnêtes

**Constat.** Demandé explicitement, avec la permission explicite de décliner si impossible ("si tu peux pas dis le moi"). Aucune source de catégorisation thématique dans les données utilisées pour générer le vocabulaire (déjà noté comme limite connue plus bas dans ce fichier) — pas de raccourci propre disponible, il fallait soit une vraie compréhension sémantique (hors de portée sans faire appel à un modèle externe), soit une heuristique.

**Décision : heuristique par mots-clés anglais sur la glose de chaque mot** ([mobile/scripts/tag-themes/](mobile/scripts/tag-themes/)), 20 thèmes couvrant les catégories les plus utiles pour un apprenant (nourriture, maison, famille, corps, santé, vêtements, nature, animaux, météo/temps, voyage, travail, école, technologie, argent, émotions, sport, ville, couleurs, communication, art/musique).

**Faux positifs trouvés et corrigés pendant le développement du script, pas découverts après coup** : plusieurs verbes à sens phrasal étaient mal classés à cause d'un mot anglais partagé avec un sens différent — *"to hand"* (donner) classé "cuerpo" à cause de "hand" (main), *"to fall"* (tomber) confondu avec la saison "fall", *"to head out"* (partir) à cause de "head" (tête). Corrigé en excluant ces mots-clés spécifiquement pour les verbes (`verbAmbiguous`, appliqué à cuerpo/tiempo_clima/deportes). D'autres collisions (mois "March"/"May" avec des mots espagnols sans rapport comme "marcha") ont été retirées entièrement plutôt que patchées.

**Limite résiduelle assumée, pas corrigée davantage** : des faux positifs subsistent sur des ambiguïtés nom-contre-nom (pas verbe-contre-nom, donc pas couvertes par le mécanisme ci-dessus) — ex. *"arma"* (arme) tagué "cuerpo" à cause de "arm" (bras). Estimé à l'œil, pas mesuré systématiquement, autour de 10% de faux positifs résiduels sur le thème le plus touché ("cuerpo") — **chiffre approximatif, pas un audit exhaustif des 1027 mots tagués.** Détail complet dans le README du script.

**Résultat chiffré** : 1027 des 5966 mots générés (17,2%) sans tag ont reçu au moins un thème ; 4939 restent sans tag (mots grammaticaux/abstraits sans thème concret, attendu). Les 36 mots écrits à la main, déjà tagués, n'ont jamais été touchés.

**Statut : fait, avec limites documentées honnêtement plutôt que promis parfait.** Pas de code applicatif à tester (`words.json` est une donnée statique) — vérifié : le fichier reste un JSON valide de 6002 entrées, `tsc --noEmit`/`npm test`/bundle Metro (qui embarquent `words.json`) toujours verts après la mise à jour du contenu.

## Planification — Onglet « Compréhension orale » (20/08/2026) — AUCUN CODE ÉCRIT

Mission de cadrage explicite : inspecter l'architecture, concevoir la fonctionnalité, documenter, **sans coder**. Détail complet des décisions et du pipeline proposé dans PLAN.md, section « Planification — Onglet Compréhension orale ». Cette entrée reprend la structure demandée explicitement (constat → impact → statut par thème), avec des statuts honnêtes : rien n'est "résolu" tant que rien n'a tourné.

### YouTube — lecteur vs récupération de captions

**Constat d'origine (planification, avant tout appel réseau)** : lire une vidéo YouTube (IFrame Player API, officiel et documenté) et en extraire le texte des sous-titres (pas officiellement supporté pour des vidéos tierces) sont deux besoins de nature différente, à ne pas confondre. Lecteur et métadonnées (oEmbed) : décidés dès la planification, aucune ambiguïté. Durée de la vidéo : pas de source officielle sans clé API, champ `durationSeconds` nullable, non bloquant.

**La partie captions a depuis été testée en profondeur, à deux reprises** (une fois à l'implémentation, une fois lors d'une session de débogage dédiée) — **voir la section "Débogage dédié de la récupération de captions" plus bas dans ce fichier pour le résultat réel**, nettement plus complet que ce qui pouvait être anticipé ici avant tout test réseau. Ce paragraphe d'origine est gardé uniquement pour la trace de la distinction officiel/non-officiel, pas comme statut à jour.

### Compatibilité Expo Go — point le plus bloquant de tout le chantier

**Constat.** L'app tourne exclusivement en Expo Go (contrainte non négociable établie depuis le pivot vers Expo, voir plus bas dans ce fichier) — aucune dépendance native custom, aucun development build. `react-native-webview` n'est pas dans les dépendances actuelles de `mobile/package.json` (vérifié : `grep` sur `package.json`, aucune trace). C'est un paquet généralement inclus dans le binaire précompilé d'Expo Go pour les versions de SDK supportées (il fait partie de l'écosystème de bibliothèques qu'Expo Go embarque nativement), mais **ça n'a pas été vérifié concrètement sur l'installation réelle (SDK 54, Expo Go 54.0.2) de l'utilisateur** — aucune installation de paquet ni test n'a été fait pendant cette session, conformément à la consigne de ne pas coder.

**Impact.** Si `react-native-webview` ne fonctionne pas dans cet Expo Go précis, toute l'approche de lecture vidéo (IFrame Player API via WebView) doit être reconsidérée — et comme le lecteur "officiel/intégré" est une exigence explicite de la mission (pas une préférence d'implémentation), il n'y a pas d'alternative évidente sans development build, ce qui casserait la contrainte "pas de development build" établie pour tout le reste du projet. C'est la seule hypothèse de tout ce chantier dont l'échec remettrait en cause l'approche entière, pas juste un détail d'implémentation.

**Statut : à vérifier en tout premier, avant tout le reste du code de cette fonctionnalité.** `npx expo install react-native-webview` suivi d'un test minimal (une WebView vide qui s'affiche) sur l'iPhone réel de l'utilisateur, avant d'investir du temps dans le pipeline captions/segments/SM-2.

### Sélection aléatoire, segmentation, validation, persistance, résilience — planifiées ici, depuis implémentées

Ces cinq thèmes ont été entièrement décidés dans cette section de planification (algorithme de cooldown vidéo-puis-segment, 1 cue = 1 segment sans fusion, extraction de la validation dans un module partagé, schéma SQLite à 4 tables, dégradation silencieuse à chaque étape réseau), **puis réellement codés et testés dans les sections plus bas de ce fichier** ("Compréhension orale — implémentation", "Sélection aléatoire — implémentée et testée", "Segmentation", "Validation — implémentée, testée, non régressive", "Persistance — schéma créé, CRUD complet", "Résilience — implémentée"). Le raisonnement détaillé d'origine (pourquoi vidéo-puis-segment élimine structurellement le biais par nombre de segments, pourquoi la ponctuation doit être ignorée pour l'exemple donné dans la mission, pourquoi SQLite est la seule source de vérité ici contrairement au vocabulaire/à la conjugaison) reste dans PLAN.md. Retiré d'ici le 20/08/2026 lors d'un nettoyage demandé explicitement, pour ne pas garder deux statuts contradictoires ("décidé, pas implémenté" ici vs "implémenté et testé" plus bas) sur les mêmes cinq thèmes.

### Ce qui N'A PAS été fait pendant cette session, conformément à la consigne explicite

Aucun fichier de code n'a été créé ni modifié pour cette fonctionnalité. Aucune dépendance n'a été installée. Aucun appel réseau n'a été fait (ni vers YouTube, ni vers npm au-delà de la lecture de `package.json` déjà présent). Seuls `PLAN.md` et `AUDIT.md` (ce fichier) ont été modifiés, comme demandé explicitement au point 20 de la mission.

## Compréhension orale — implémentation, avec un échec de test en direct qui limite ce qui marche vraiment (20/08/2026)

Suite directe de la section de planification ci-dessus, après autorisation explicite de coder ("Code ce qu'il te reste à coder d'après le plan md et l'audit md"). Reprend le même découpage par thème, avec le statut mis à jour honnêtement — **rien n'est marqué "résolu" tant que ça n'a pas tourné**, conformément à la consigne d'origine de la mission.

### YouTube — lecteur vs récupération de captions : la partie captions NE FONCTIONNE PAS actuellement, testé en direct

**Constat.** Trois méthodes de récupération du CONTENU d'une piste de sous-titres ont été testées en direct pendant cette session (accès réseau du bac à sable de développement), pour une vidéo connue prise uniquement comme test mécanique (pas de rapport avec l'espagnol) :
1. Endpoint `timedtext` classique, avec la `baseUrl` extraite du JSON embarqué dans la page — réponse HTTP 200 mais corps **complètement vide** (`content-length: 0`).
2. Même endpoint, avec un `User-Agent` de navigateur réel ET les cookies de session obtenus depuis le fetch initial de la page — même résultat, corps vide.
3. API interne InnerTube (`youtubei/v1/player`, celle utilisée par des outils à jour comme yt-dlp), avec un contexte client ANDROID et une clé publique connue — HTTP 400 "Precondition check failed", avec et sans la clé.

En revanche, deux étapes ont été testées et fonctionnent : l'extraction de la LISTE des pistes disponibles depuis le JSON embarqué dans la page (`captionTracks`, 6 pistes distinctes trouvées y compris une `es-419` et une piste ASR), et l'endpoint oEmbed officiel (titre/auteur/miniature récupérés correctement).

**Impact.** `fetchVideoCaptions()` ([mobile/src/listening/captions.ts](mobile/src/listening/captions.ts)) gère ça sans planter (dégradation silencieuse déjà prévue dans le design), mais concrètement : **ajouter une vidéo aujourd'hui, même avec de vrais sous-titres espagnols sur YouTube, l'enregistrera très probablement avec `captionStatus: 'unavailable'` et 0 segment** — donc invisible pour l'entraînement. La cause exacte n'est pas identifiée avec certitude (changement récent des défenses anti-bot de YouTube sur cet endpoint précis, ou spécificité du réseau du bac à sable — IP de datacenter plutôt que résidentielle, souvent plus filtrée). Pas d'investissement supplémentaire fait pour contourner ça (retour sur investissement décroissant, terrain glissant vis-à-vis des CGU de YouTube) — le choix a été de construire le reste de la fonctionnalité par-dessus la dégradation gracieuse déjà prévue plutôt que de bloquer tout le chantier sur ce point.

**Statut : implémenté mais NON FONCTIONNEL EN L'ÉTAT pour la récupération de contenu.** À revérifier en priorité depuis le réseau réel d'un iPhone (IP résidentielle/mobile) avant de considérer cette fonctionnalité utilisable — c'est plausible que ça fonctionne différemment là-bas, mais ce n'est qu'une hypothèse, pas vérifié.

## Débogage dédié de la récupération de captions — cause identifiée, solution WebView implémentée, non vérifiée de bout en bout (20/08/2026)

Suite à un retour explicite ("la fonctionnalité est inutilisable en pratique, débogue et répare"), session de débogage dédiée avec pour consigne explicite de ne pas se contenter d'un essai superficiel avant de conclure à un blocage YouTube. Démarche : reproduire le bug avec de vraies vidéos avant de toucher au code, tester méthodiquement plusieurs approches avec preuve à l'appui de chacune, puis corriger.

### Reproduction — bug confirmé systémique, pas lié à une vidéo ou un paramètre précis

**Constat.** Testé en direct (accès réseau du bac à sable de développement) avec DEUX vidéos réelles différentes (une petite chaîne d'apprentissage de l'espagnol, et la vidéo la plus regardée de toute la plateforme — choisie précisément pour éliminer l'hypothèse "cette vidéo précise a un souci") :

| Méthode testée | Requête exacte | Résultat |
|---|---|---|
| `timedtext`, piste manuelle espagnole, URL signée complète | `GET .../api/timedtext?v=...&signature=...&lang=es` | HTTP 200, `Content-Length: 0` |
| `timedtext`, piste ASR espagnole, URL signée complète | idem avec `&kind=asr` | HTTP 200, `Content-Length: 0` |
| `timedtext`, `type=list` (liste des pistes — **ne nécessite normalement AUCUNE signature**, endpoint public historique) | `GET .../api/timedtext?type=list&v=...` | HTTP 200, `Content-Length: 0` |
| `timedtext` avec cookies de session repris de la page (cookie jar `curl -c/-b`) | idem + `Cookie: ...` | HTTP 200, `Content-Length: 0` |
| InnerTube `get_transcript`, contexte client **WEB entièrement authentique** (copié tel quel depuis `INNERTUBE_CONTEXT` de la page réelle, `visitorData`/`configInfo.appInstallData` inclus, vrai `continuationEndpoint.getTranscriptEndpoint.params` extrait de `ytInitialData`) | `POST .../youtubei/v1/get_transcript?key=...` | HTTP 400 `"Precondition check failed"` |
| InnerTube `player`, contexte client ANDROID (clé publique connue de la communauté) | `POST .../youtubei/v1/player?key=...` | HTTP 400 `"Precondition check failed"` |
| InnerTube `player`, contexte client IOS | idem | HTTP 400 `"Precondition check failed"` |
| InnerTube `get_transcript`, contexte client WEB_EMBEDDED_PLAYER | idem | HTTP 400 `"Precondition check failed"` |

**8 méthodes sur 8 échouent**, dont une (`type=list`) qui n'a historiquement jamais nécessité de signature et qui échoue même sur la vidéo la plus regardée de toute la plateforme — élimine l'hypothèse d'un problème de signature/expiration/vidéo précise. Seule l'extraction de la LISTE des pistes (pas leur contenu) depuis le HTML de la page fonctionne, de façon reproductible, sur les deux vidéos testées.

### Diagnostic

**Cause la plus probable, avec un niveau de confiance raisonnable mais pas une certitude absolue** (impossible à confirmer à 100% sans accès aux systèmes internes de YouTube) : l'exigence croissante de "PoToken" (attestation d'origine générée par l'exécution réelle du script BotGuard de Google dans un vrai moteur de navigateur) que YouTube applique désormais à un périmètre de plus en plus large de requêtes non émises par un navigateur véritable — documentée publiquement par les mainteneurs de yt-dlp depuis 2024 et toujours d'actualité. Le motif observé colle exactement à ce diagnostic : la requête HTTP nue échoue systématiquement quel que soit le endpoint ou le client déclaré, alors que la LECTURE de la page elle-même (HTML brut, sans exécution JS) réussit toujours — cohérent avec un blocage appliqué spécifiquement à la couche "récupération de contenu dynamique", pas à la lecture de page statique.

**Non déterminé avec certitude** : si ce blocage est spécifique à l'IP de ce bac à sable de développement (plage d'adresses de datacenter, souvent plus sévèrement filtrée) ou s'il est désormais appliqué universellement à toute requête non-navigateur, y compris depuis un réseau résidentiel/mobile. Les deux hypothèses sont plausibles ; aucune n'a pu être testée depuis un réseau autre que celui de ce bac à sable dans cette session.

### Solution retenue — faire émettre la requête par un vrai moteur de navigateur, pas par un client HTTP

**Décision.** Plutôt que de continuer à chercher une combinaison de paramètres/headers qui contournerait le blocage (déjà 8 tentatives infructueuses, rendement décroissant), exploiter ce que l'app a déjà : une vraie `WebView` (déjà utilisée pour le lecteur vidéo, `YouTubePlayer.tsx`). Nouveau fichier [mobile/src/listening/TranscriptFetcher.tsx](mobile/src/listening/TranscriptFetcher.tsx) : charge la vraie page `youtube.com/watch?v=...` dans une `WebView` invisible (1×1px, hors écran), attend que `captionTracks` apparaisse dans le HTML (déjà présent dans le rendu serveur initial, pas besoin d'attendre l'hydratation complète de la SPA), puis exécute le `fetch()` vers l'URL `timedtext` **depuis le contexte JS de cette page** — même origine (`youtube.com`), vrais cookies du moteur WebKit/Chromium de la WebView, vrai fingerprint de navigateur. Cette requête est, par construction, indiscernable de celle d'un utilisateur réel qui aurait ouvert cette page — précisément ce qu'aucune des 8 méthodes en HTTP nu ne pouvait offrir.

**Intégration.** [ListeningScreen.tsx](mobile/src/screens/ListeningScreen.tsx) essaie d'abord `fetchVideoCaptions()` (gratuit, pas de WebView à monter — peut très bien fonctionner sur un réseau non bloqué, gardé comme premier essai plutôt que supprimé) ; si ça revient sans segment, bascule sur `fetchTranscript()` (le hook `useTranscriptFetcher`, WebView). Aucun autre système touché : SM-2, cooldown, sélection vidéo-puis-segment, lecteur de révision, validation des réponses — tous inchangés, conformément à la consigne explicite de ne pas réécrire ce qui fonctionne déjà.

**Logs de diagnostic ajoutés** (temporaires, demandés explicitement) dans `captions.ts` et `TranscriptFetcher.tsx` : nombre de pistes détectées, langue/type de piste choisie, statut HTTP et taille du corps reçu à chaque tentative, début du corps si non vide — jamais de cookie ni de jeton loggué.

### Ce qui N'A PAS pu être vérifié, et pourquoi ce n'est PAS marqué "résolu"

**Une vraie `WebView` ne peut pas être instanciée ni exécutée depuis les outils de cette session** (Bash/Node n'ont pas de moteur de rendu web/JS de navigateur) — impossible de reproduire ici la preuve de bout en bout explicitement demandée (nombre de cues récupérés, exemple de segment en espagnol réel, insertion DB réussie). `tsc --noEmit` et `npm test` confirment que le code compile et n'introduit aucune régression, mais **ça ne prouve rien sur le comportement réel de la WebView face à YouTube** — seul un test sur l'iPhone de l'utilisateur peut le confirmer.

**Statut : cause du blocage identifiée avec un diagnostic argumenté (pas une certitude absolue), solution architecturale implémentée et compilée, mécanisme non vérifié de bout en bout faute d'environnement WebView disponible dans cette session.** Ne pas présenter comme "réparé" tant qu'un test réel sur device n'a pas montré un nombre de segments > 0 pour une vraie vidéo. Si le test sur device échoue aussi (c'est-à-dire si le blocage n'est pas spécifique à l'IP du bac à sable mais universel), l'étape suivante documentée mais non implémentée serait un petit service local minimal (voir PLAN.md) — pas construit maintenant, conformément à la consigne de ne l'implémenter que si un test démontre que c'est nécessaire.

### Deuxième itération — interception réseau + repli DOM, plutôt qu'un fetch émis par nous-mêmes (20/08/2026)

**Constat.** La première version de `TranscriptFetcher.tsx` faisait encore, depuis le contexte JS de la WebView, un `fetch()` vers l'URL `timedtext` — une requête que NOUS forgeons nous-mêmes. Rien ne garantit qu'une telle requête porte un "PoToken" valide seulement parce qu'elle est émise depuis un vrai moteur de navigateur : ce jeton doit être généré par l'exécution du script BotGuard propre à YouTube, pas simplement hérité du contexte d'exécution. Demande explicite de corriger ce point précis, avec une méthode différente.

**Décision.** Ne plus émettre de requête nous-mêmes : laisser la vraie page charger sa transcription comme le ferait un utilisateur réel (clic sur "Show transcript", ce qui déclenche l'appel interne de YouTube — avec un PoToken correctement généré par son propre code), et intercepter cette requête au passage. Séquence implémentée dans `TranscriptFetcher.tsx` :
1. `window.fetch`/`XMLHttpRequest.prototype.open`/`send` patchés via `injectedJavaScriptBeforeContentLoaded` (doit être en place AVANT que le moindre script de la page ne s'exécute, sinon une requête pourrait être manquée) — toute URL contenant `get_transcript` ou `timedtext` est interceptée, son corps relayé tel quel par `postMessage`.
2. Page chargée avec `headers: {'Accept-Language': 'en-US,en;q=0.9'}` pour forcer l'anglais — rend le libellé "Show transcript" prévisible pour le sélecteur.
3. Après `onLoadEnd` + 2,5s (hydratation), script injecté cherchant `button[aria-label="Show transcript"]`, puis en repli tout élément dont le texte matche `/show transcript/i`, et cliquant dessus si trouvé.
4. Si rien d'intercepté 5s après le clic, script de repli injecté lisant directement le texte déjà rendu dans `ytd-transcript-segment-renderer` (le panneau affiche un timestamp de départ par ligne, ex. "0:05", mais pas de fin — la fin de chaque segment est déduite du début du suivant côté TypeScript, le dernier segment reçoit +4s par défaut).
5. Délai global de sécurité de 9s, au-delà duquel `unavailable`/0 segment est renvoyé.

**Parsing déplacé côté TypeScript, pas dans le script injecté** : le corps intercepté peut être du XML `timedtext` (réutilise `parseTimedTextXml`/`decodeHtmlEntities`, maintenant exportées de `captions.ts` plutôt que dupliquées) ou du JSON `get_transcript` — pour ce dernier, **aucun payload réel n'a pu être obtenu dans cette session** (l'endpoint a systématiquement échoué depuis ce réseau, voir tableau plus haut), donc la structure exacte du JSON n'a jamais été observée directement. Plutôt que de coder un chemin fixe dans l'arborescence (qui serait pure spéculation), `extractJsonTranscriptSegments` fait une recherche récursive de tout objet portant `startMs`/`endMs` + un texte accompagnant (`snippet.simpleText` ou `snippet.runs[].text`) — plus robuste à une structure imprévue, mais **jamais testé contre un vrai payload**.

**Statut : implémenté et compilé (`tsc --noEmit` propre, scripts injectés vérifiés syntaxiquement valides via `new Function()` en Node), non vérifié de bout en bout — même limite que l'itération précédente : aucun moteur de WebView disponible dans cette session pour exécuter réellement le scénario.** Ne pas présenter comme "réparé". Le test qui tranchera : ajouter une vraie vidéo espagnole depuis l'app et vérifier un nombre de segments > 0, avec un exemple de segment contenant du texte espagnol réel.

### Troisième itération — premier vrai test sur device, cause probable identifiée : version mobile de YouTube (20/08/2026)

**Constat.** Premier test réel sur iPhone (Expo Go) avec une vraie vidéo à sous-titres espagnols confirmés disponibles. Logs obtenus :

```
[captions] track list: 1 pistes, 1 en espagnol
[captions] piste choisie: es (auto-générée)
[captions] fetch timedtext — HTTP 200 — corps: 0 caractères (vide)
[TranscriptFetcher] network_patch_installed
[TranscriptFetcher] button_search {"found":false,"selector":null}
[TranscriptFetcher] button_search {"found":false,"selector":null}
[TranscriptFetcher] dom_fallback {"rowCount":0,"segmentCount":0}
```

Deux observations utiles : (1) `fetchVideoCaptions()` (fetch HTTP nu) échoue exactement comme prévu — cohérent avec le diagnostic PoToken déjà établi, pas une surprise ; (2) côté `TranscriptFetcher`, le patch réseau s'installe bien, mais **le bouton "Show transcript" n'est jamais trouvé, et le repli DOM ne trouve aucune ligne non plus** — signe que le panneau de transcription ne s'ouvre probablement jamais, indépendamment de l'interception réseau elle-même (qui n'a donc jamais eu l'occasion de capturer quoi que ce soit).

**Diagnostic.** Hypothèse principale, pas encore confirmée par un log direct (voir "Non vérifié" ci-dessous) : la `WebView` iOS utilise par défaut un user-agent de type mobile Safari, et YouTube sert alors `m.youtube.com` (structure DOM différente) plutôt que la version desktop pour laquelle `button[aria-label="Show transcript"]`/`ytd-transcript-segment-renderer` ont été écrits — ces sélecteurs n'existent probablement simplement pas sur cette page-là. Hypothèse secondaire, à départager en second (moins probable mais pas exclue) : un bandeau de consentement cookies (RGPD) bloquant l'interaction avant que le bouton n'apparaisse.

**Impact / correctifs appliqués**, dans `TranscriptFetcher.tsx` :
1. **Log de diagnostic `page_context`** ajouté en tout premier dans `CLICK_SCRIPT`, avant toute tentative de correction — capture `document.location.href` et les 500 premiers caractères de `document.body.innerHTML`. Permettra de confirmer concrètement, au prochain test, laquelle des deux hypothèses ci-dessus est la bonne (ou si c'est autre chose).
2. **Forçage de la version desktop, sur les deux leviers en même temps** (pas un seul, la détection serveur de YouTube pouvant se baser sur l'un ou l'autre) : `&app=desktop` ajouté à l'URL chargée, ET prop `userAgent` de la `WebView` posée à une chaîne desktop Safari explicite (`DESKTOP_USER_AGENT`).
3. **Tentative de fermeture d'un bandeau de consentement** ajoutée avant la recherche du bouton (`tryDismissConsentBanner`, recherche par texte "accept all"/"i agree"/"reject all"/"agree to all" sur boutons/`aria-label`) — couvre les variantes les plus courantes vues publiquement, pas garanti exhaustif pour toutes les régions. Un log `consent_check` indique si un tel bouton a été trouvé et si l'URL est passée par `consent.youtube.com` (cas où le consentement est une redirection de page entière, pas juste un bandeau).

**Statut : correctifs appliqués et compilés (`tsc --noEmit` propre, scripts réinjectés vérifiés syntaxiquement valides), appliqués sur la base d'une hypothèse argumentée mais PAS d'un log de confirmation déjà observé — je n'ai pas eu accès aux résultats de `page_context` avant d'écrire ce correctif, faute de pouvoir retester moi-même sur device.** Ne pas marquer "résolu" : le prochain test réel doit montrer (a) ce que `page_context` rapporte comme `href` (confirme ou infirme l'hypothèse mobile/desktop), et (b) si `button_search` trouve enfin le bouton et si `segmentCount` dépasse 0. Si l'hypothèse s'avère fausse (le `href` montre déjà `youtube.com` desktop malgré tout), le vrai problème est ailleurs et il faudra regarder le `bodySample` capturé pour comprendre pourquoi le bouton n'existe pas dans ce DOM précis.

### Quatrième itération — deuxième vrai test : `&app=desktop` sert en fait une page legacy (20/08/2026)

**Constat.** Deuxième test réel sur iPhone, avec le log `page_context` de l'itération précédente. Résultat clair : `document.location.href` confirme bien une page servie avec `?app=desktop` appliqué (donc le `userAgent` desktop fonctionne, la page N'EST PAS `m.youtube.com`), mais `bodySample` montre `id="watch7-content"`, `class="watch-main-col"` — la structure HTML **legacy pré-2017 de YouTube** (Polymer 1), pas le site desktop moderne. C'est exactement pour ça que `button_search` "trouvait quelque chose" (un candidat correspondait vaguement) mais `dom_fallback` restait à `rowCount: 0` : le composant moderne `ytd-transcript-segment-renderer` n'existe tout simplement pas dans cette structure de page.

**Diagnostic.** L'hypothèse "version mobile" de l'itération précédente était fausse (le `userAgent` desktop suffisait déjà à éviter `m.youtube.com`) — le vrai coupable était `&app=desktop` lui-même : un ancien paramètre YouTube, aujourd'hui traité côté serveur comme "sers la version dégradée/legacy" plutôt que "sers le vrai desktop moderne". Diagnostic confirmé par une preuve directe (le `bodySample` capturé), pas une nouvelle hypothèse non vérifiée.

**Impact / correctif appliqué**, dans `TranscriptFetcher.tsx` : `&app=desktop` retiré de l'URL chargée — retour à `https://www.youtube.com/watch?v=...` standard. Le `userAgent` desktop explicite (`DESKTOP_USER_AGENT`) reste seul, puisqu'il s'est avéré suffisant à lui seul pour éviter la version mobile. Le log `page_context` (href + échantillon du DOM) reste en place pour confirmer, au prochain test, qu'une structure moderne (balises `ytd-*`) est bien servie cette fois.

**Statut : correctif appliqué et compilé (`tsc --noEmit` propre, scripts réinjectés vérifiés syntaxiquement valides), diagnostic cette fois confirmé par une preuve directe (le `bodySample` réel), mais le correctif LUI-MÊME reste non vérifié — aucun nouveau test sur device effectué après ce changement.** Ne pas marquer "résolu". Si la page moderne apparaît au prochain test mais que le bouton "Show transcript" reste introuvable, point suivant à vérifier signalé par l'utilisateur : il faudrait peut-être d'abord ouvrir la description de la vidéo ("...more") avant que le bouton transcript n'apparaisse dans le DOM — comportement réel du site desktop actuel, pas encore géré par `CLICK_SCRIPT`.

### Compatibilité Expo Go — toujours non vérifiée sur device, mais l'installation du paquet s'est bien passée

**Constat.** `npx expo install react-native-webview` s'est exécuté proprement (résolution automatique d'une version compatible SDK 54, `13.15.0`), et `expo-doctor` rapporte 18/18 vérifications passées après installation. Le bundle Metro iOS a aussi été récupéré avec succès (`HTTP 200`, ~9,5 Mo) pendant cette session, confirmant que le module se résout et se bundle sans erreur de compilation ou de dépendance manquante.

**Impact.** Ça élimine le risque le plus grossier (paquet absent/incompatible/erreur de build), mais **ne prouve pas** que la WebView s'affiche et fonctionne réellement à l'exécution dans l'Expo Go installé sur l'iPhone de l'utilisateur — ce test n'a pas pu être fait dans cette session (pas de device disponible). C'était identifié en planification comme le point le plus bloquant de tout le chantier ; ça reste vrai.

**Statut : dépendance installée et bundle compilé avec succès, exécution réelle sur device toujours non vérifiée.**

### Sélection aléatoire — implémentée et testée (hors réseau/base, donc vérifiable dans cette session)

**Constat.** Contrairement aux deux points ci-dessus (qui dépendent du réseau ou d'un device réel), la logique de sélection vidéo-puis-segment est une fonction pure ([mobile/src/listening/selection.ts](mobile/src/listening/selection.ts)) — entièrement testable sans mock.

**Impact.** 12 tests couvrent : exclusion des vidéos utilisées dans les `VIDEO_COOLDOWN` derniers exercices, réintégration d'une vidéo hors fenêtre, absence de biais par nombre de segments (test statistique sur 2000 tirages, vidéo à 100 segments dus simulée vs vidéo à 2 — écart de sélection resté dans l'intervalle 40-60% attendu pour un tirage uniforme entre 2 vidéos), et les 4 cas limites (1/2/3/4 vidéos disponibles avec `VIDEO_COOLDOWN = 3`, relâchement progressif de la fenêtre). Un bug a été trouvé et corrigé DANS LE TEST lui-même (pas dans l'implémentation) pendant l'écriture : l'attente initiale du cas "3 vidéos disponibles" supposait à tort que le relâchement libère la vidéo la PLUS récemment utilisée en premier, alors que l'algorithme (correct) libère la MOINS récemment utilisée en premier — cohérent avec l'intention du cooldown.

**Statut : implémenté et testé (12/12).** Reste non vérifié : que le pool de segments dus fourni par `getDueListeningCardsSplit` (SQL, non testable unitairement) alimente correctement cette logique en usage réel — dépend de la persistance, voir plus bas.

### Segmentation

**Constat/décision inchangée depuis la planification** : 1 cue de sous-titre = 1 segment, pas de fusion de phrases en v1. `captionStatus` distingue `available`/`auto_generated`/`unavailable`, affiché dans l'UI de la Bibliothèque.

**Statut : implémenté tel que décidé.** Non vérifiable de bout en bout tant que le point "récupération de captions" ci-dessus n'est pas résolu — la logique de segmentation elle-même (parsing XML `<text start dur>`) n'a jamais reçu de vrai contenu à parser pendant cette session (les trois tests réseau ont tous renvoyé un corps vide avant d'atteindre cette étape).

### Validation — implémentée, testée, non régressive

**Constat.** `mobile/src/validation/textAnswer.ts` créé (normalisation accents NFD + suppression ponctuation ¿¡.,;:!?()"'«»…—+casse+espaces), `conjugation/validate.ts` refactorisé pour la réexporter sous son ancien nom local plutôt que dupliquer la logique.

**Impact.** 8 tests sur `textAnswer.test.ts`, y compris l'exemple exact de la mission ("No sé lo que quieres decir." ≈ "No se lo que quieres decir" → correct ; réponse tronquée → incorrect). Les tests déjà existants de `conjugation/validate.test.ts` (accents, terminaisons -ra/-se) ont été rejoués après le refactor : aucune régression.

**Statut : implémenté, testé, non régressif (16/16 sur les deux fichiers combinés).**

### Persistance — schéma créé, CRUD complet, non testable unitairement (limite déjà connue du projet)

**Constat.** 4 tables ajoutées à `migrateDbIfNeeded()` (`listening_videos`, `listening_segments`, `listening_cards`, `listening_reviews`), exactement comme prévu en planification. CRUD complet dans `database.ts` : import transactionnel vidéo+segments+cartes neuves (`addListeningVideo`), lecture avec stats (`getListeningVideosWithStats`), suppression en cascade (`deleteListeningVideo`), pool de segments dus par lots séparés nouveaux/révisions (`getDueListeningCardsSplit`), historique récent des vidéos pour amorcer le cooldown (`getRecentListeningVideoIds`), mise à jour de carte/journalisation (`updateListeningCard`/`logListeningReview`), comptage (`getListeningCounts`), historique consultable (`getListeningHistory`). Intégré à `resetProgress()` existant (même transaction que la remise à zéro du vocabulaire/de la conjugaison).

**Impact.** Comme documenté ailleurs dans ce fichier pour `words`/`conjugation_cards`, aucun de ce code n'est testable unitairement sous Jest/jest-expo (pas de SQLite en mémoire disponible) — seule la compilation (`tsc --noEmit`, propre) et la relecture manuelle donnent un signal avant le test sur device réel.

**Statut : implémenté, non testé au sens propre du terme (aucune exécution réelle contre une base SQLite dans cette session).**

### Résilience — implémentée comme décidé, dégradation silencieuse à chaque étape

**Constat.** Chaque fonction réseau (`fetchVideoMetadata`, `fetchVideoCaptions`) retourne `null`/`unavailable` plutôt que de lever une exception ; `ListeningScreen.tsx` capture les erreurs du formulaire d'ajout dans un `try/catch` et affiche un message plutôt que de planter ; `ListeningReviewScreen.tsx` affiche un message d'erreur simple si le lecteur YouTube signale une erreur (`onError`), sans retirer la carte de la file (elle reste due pour un prochain essai).

**Statut : implémenté tel que décidé.** L'échec de récupération de captions documenté plus haut est justement un cas réel où cette dégradation s'est déclenchée pendant les tests de cette session — pas un scénario seulement théorique.

### Nouvelle décision prise pendant l'implémentation, pas explicitement confirmée par l'utilisateur

**Constat.** Le point ouvert #3 de la planification (mappage résultat binaire ✓/✗ → note SM-2 à 4 valeurs) demandait un arbitrage. **Option A retenue** (correct → "Bien", incorrect → "Otra vez"), conforme à la maquette UX donnée littéralement dans la mission, plutôt que l'option B (grille de 4 boutons comme le reste de l'app).

**Impact.** Si jugé trop strict (une erreur mineure d'accent traitée comme un échec complet plutôt qu'un "Difícil" nuancé) ou trop laxiste à l'usage réel, c'est un changement localisé à `ListeningReviewScreen.tsx#handleNext` — pas une décision architecturale difficile à revenir en arrière.

**Statut : tranché par défaut (recommandation du plan), pas confirmé explicitement par l'utilisateur — à vérifier à l'usage.**

### Ce qui a été vérifié pendant cette session de code, et ce qui ne l'a pas été

**Vérifié** : `tsc --noEmit` propre sur l'ensemble du projet après tous les changements ; `npm test` 91/95 (les 4 échecs, dans `reviewScheduler.test.ts`, sont préexistants — fichier non touché cette session, écart de 2h dans les dates attendues, probablement un souci d'environnement/fuseau horaire du bac à sable, sans lien avec la compréhension orale) ; bundle Metro iOS récupéré avec succès en conditions réelles (serveur `expo start` démarré, requête HTTP sur `/index.bundle`, 200 OK, dépendance WebView résolue sans erreur).

**Non vérifié, à ne pas présenter comme fonctionnel** : compatibilité réelle de la WebView dans l'Expo Go de l'utilisateur ; récupération de sous-titres de bout en bout (bloquée par l'échec documenté ci-dessus) ; ajout réel d'une vidéo puis session d'entraînement complète sur device ; fiabilité du paramètre `end` de l'IFrame Player API pour arrêter la lecture au bon moment (filet de sécurité JS ajouté par précaution, mais jamais déclenché en conditions réelles).

## Espace sous l'icône ☰ encore agrandi (21/08/2026)

**Constat.** Retour utilisateur après le premier ajustement du 20/08 (16px d'espace ajouté sous l'icône) : le tiroir restait perçu comme trop proche de l'icône — "encore plus bas, bien sous le bouton".

**Impact.** `DRAWER_TOP_OFFSET` ([TabBar.tsx](mobile/src/navigation/TabBar.tsx)) passé de 16px à 40px d'espace sous l'icône (en plus de sa propre hauteur, 6+38px, inchangée). Même mécanisme qu'avant (`SafeAreaView` + marge), seule la valeur de la marge change.

**Statut : implémenté.** Vérifié : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants), bundle Metro récupéré avec succès. **Non vérifié sur device** — à confirmer que 40px suffit cette fois, ou si un nouvel ajustement sera encore nécessaire.

## Tiroir toujours trop proche des boutons : mécanique de positionnement revue (21/08/2026)

**Constat.** Troisième retour sur le même sujet ("encore en dessous du bouton thème sombre/clair") malgré deux augmentations successives (16px puis 40px) — augmenter la valeur ne réglait pas durablement le problème, signe probable d'un souci de mécanique plutôt que de simple réglage fin.

**Diagnostic.** Le tiroir utilisait un `SafeAreaView` étroit (`drawerPositioner`, ancré uniquement à `right: 0`, 70% de la largeur) — différent du `SafeAreaView` PLEINE LARGEUR (`hamburgerSafeArea`, `left: 0, right: 0`) qui positionne l'icône ☰ et qui, lui, n'a jamais été signalé mal placé. Hypothèse retenue : la détection de l'encoche/l'île dynamique se fait sur toute la largeur de l'écran, donc un `SafeAreaView` étroit décalé vers la droite peut calculer une marge de sécurité automatique différente (probablement plus petite, voire nulle si la zone concernée est en dehors de la zone d'encoche détectée) que le `SafeAreaView` pleine largeur de l'icône — expliquant que le tiroir reste "collé" malgré une marge manuelle grandissante ajoutée par-dessus une valeur de sécurité déjà incohérente.

**Impact / correctif appliqué**, dans `TabBar.tsx` : le tiroir utilise maintenant le MÊME `SafeAreaView` pleine largeur que l'icône (`drawerSafeArea`, `left: 0, right: 0, bottom: 0`), avec `alignItems: 'flex-end'` pour pousser le tiroir (largeur fixe, `DRAWER_WIDTH`) contre le bord droit à l'intérieur de cette zone. Un espaceur explicite (`View` de hauteur fixe `DRAWER_TOP_OFFSET`) remplace l'ancienne marge (`marginTop`) sur un `SafeAreaView` imbriqué — élimine toute combinaison imprévisible entre marge manuelle et padding de sécurité automatique de deux `SafeAreaView` empilés. Espace sous l'icône aussi élargi une troisième fois par précaution (40px → 48px).

**Statut : implémenté.** Vérifié : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants), bundle Metro récupéré avec succès. **Non vérifié sur device** — cette fois un changement de mécanique de positionnement, pas seulement de valeur numérique, donc une meilleure chance d'être la bonne correction, mais reste à confirmer avant de considérer ce sujet clos.

## Tiroir désormais trop bas : confirme l'hypothèse de la marge automatique plus grande (21/08/2026)

**Constat.** Retour immédiat après le changement de mécanique ci-dessus : "met le tab plus haut" — le tiroir est maintenant trop bas, pas trop haut. Confirme indirectement l'hypothèse retenue plus haut : le nouveau `SafeAreaView` pleine largeur calcule bien une marge de sécurité automatique différente (plus grande) que l'ancien `SafeAreaView` étroit, donc l'espace manuel de 48px (pensé pour compenser une marge automatique jugée insuffisante) est devenu excessif une fois cumulé avec la nouvelle marge automatique, elle-même déjà suffisante.

**Impact.** Espace manuel sous l'icône réduit de 48px à 12px dans `TabBar.tsx` — la marge de sécurité automatique fait maintenant l'essentiel du travail, l'espace manuel n'ajoute qu'un léger espace visuel résiduel.

**Statut : implémenté.** Vérifié : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants), bundle Metro récupéré avec succès. **Non vérifié sur device.**

## Cinquième itération — l'interception réseau fonctionne réellement, seul le parsing était cassé (21/08/2026)

**Constat.** Retour réel avec logs complets, sur une vraie vidéo Ibai avec sous-titres espagnols auto-générés confirmés disponibles. Séquence observée :
1. `network_patch_installed` — le patch `fetch`/`XMLHttpRequest` s'installe correctement.
2. `page_context` — `href` sans `&app=desktop` (le correctif précédent a bien pris), mais le `bodySample` (500 premiers caractères) montre toujours des marqueurs `watch7-content`/`watch-main-col` — **résidu de contenu de repli côté serveur, pas représentatif de la page réellement chargée**, comme le montre la suite.
3. `consent_check` — aucun bandeau de consentement trouvé (`found: false`), pas la cause ici.
4. `button_search` — **`found: true, selector: "aria-label"`** : le bouton "Show transcript" a été trouvé et cliqué avec succès, contrairement au tout premier test. Confirme que la page réellement rendue EST la version moderne, malgré l'apparence du `bodySample`.
5. `xhr_intercepted` — **un vrai corps de 858 225 caractères capturé**, pour une requête `.../api/timedtext?...&pot=Mlk6Hl_ysIq2...&potc=1&fmt=json3...` — la présence d'un paramètre `pot`/`potc` (le "PoToken") confirme directement l'hypothèse retenue depuis le début de ce chantier : la page émet une requête correctement authentifiée, que ni `fetchVideoCaptions()` ni la première version de `TranscriptFetcher.tsx` ne pouvaient reproduire elles-mêmes.

**Malgré ça, l'app a affiché "0 segments".**

**Diagnostic.** Le corps intercepté était au format `fmt=json3` (`{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`), une structure que `parseInterceptedBody`/`extractJsonTranscriptSegments` ne reconnaissait pas — ce fichier ne savait lire que la forme spéculative `get_transcript` (`startMs`/`endMs`/`snippet`), jamais confirmée par un vrai payload jusqu'ici. Le contenu était donc récupéré avec succès, puis silencieusement perdu au parsing.

**Impact / correctif appliqué.**
- Nouveau parseur `parseJson3Captions`, écrit contre la structure réelle observée (pas une spéculation cette fois).
- **Logique de parsing extraite dans un nouveau fichier pur, `mobile/src/listening/transcriptParsing.ts`**, sans aucun import React/React Native — `TranscriptFetcher.tsx` importe `react-native-webview`, qui lève `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'RNCWebViewModule' could not be found` au chargement du module sous Jest (aucun module natif enregistré dans l'environnement de test) : impossible de tester la moindre fonction, même 100% pure, tant qu'elle vivait dans ce fichier. Découvert en essayant d'ajouter un premier test pour `parseJson3Captions`.
- **8 tests unitaires** (`transcriptParsing.test.ts`) contre un fixture reproduisant fidèlement la forme réelle (événements de positionnement sans `segs` mélangés aux événements de texte, comme observé dans le vrai payload), plus les cas limites (durée par défaut, entités HTML, texte vide, repli XML, corps vide/invalide).

**Statut : cause du "0 segments" identifiée avec certitude (pas une hypothèse — le payload réel a été vu dans les logs), correctif de parsing implémenté et couvert par des tests unitaires basés sur la forme réelle. Le mécanisme d'interception réseau lui-même est maintenant CONFIRMÉ fonctionnel en conditions réelles — c'était le plus gros risque non résolu de toute cette fonctionnalité.** Ce qui reste non vérifié : que `parseJson3Captions`, une fois exécuté sur le vrai corps de 858 225 caractères (pas seulement sur un fixture construit à la main), produise bien un nombre de segments > 0 cohérent. Le prochain test réel sur device doit le confirmer avant de considérer cette fonctionnalité comme réparée.

### Sixième itération — "Erreur réseau" à l'ajout, cause réelle inconnue faute de log (21/08/2026)

**Constat.** Retour utilisateur après le correctif de parsing ci-dessus : "erreur réseau quand je rajoute une vidéo maintenant". En relisant `handleAddResult` ([ListeningScreen.tsx](mobile/src/screens/ListeningScreen.tsx)), le `catch` était muet (`catch { setAddError('Erreur réseau...') }`) — affiche le même message pour absolument N'IMPORTE QUELLE exception, réseau ou non. Ni `fetchVideoCaptions()` ni `fetchTranscript()` (le hook de `TranscriptFetcher.tsx`) ne sont censés lever d'exception dans leur conception actuelle (les deux se dégradent silencieusement vers un statut `unavailable` plutôt que de rejeter/lancer) — donc soit l'un des deux a un chemin d'exception non couvert qui n'a pas été repéré à la relecture, soit l'exception vient d'ailleurs dans le bloc `try` (le plus probable candidat restant : `addListeningVideo`, l'écriture SQLite).

**Impact.** Plutôt que de deviner une nouvelle cause sans preuve (déjà fait deux fois dans ce chantier avec des résultats mitigés), un log de diagnostic temporaire a été ajouté (`console.log('[ListeningScreen] échec ajout vidéo:', ...)`, avec le nom et le message de l'exception) pour voir la vraie cause au prochain test. Le message affiché à l'utilisateur a aussi été rendu moins spécifiquement faux ("Impossible d'ajouter cette vidéo" plutôt que "Erreur réseau", qui présupposait une cause non confirmée).

**Statut : cause réelle non identifiée, logging de diagnostic ajouté pour la découvrir au prochain test — ne pas supposer qu'il s'agit véritablement d'un problème réseau tant que le log `[ListeningScreen] échec ajout vidéo:` n'a pas été lu.**

### Septième itération — cause trouvée grâce au log : un vrai bug SQL, pas un problème réseau (21/08/2026)

**Constat.** Le log ajouté ci-dessus a immédiatement donné la vraie cause :

```
[ListeningScreen] échec ajout vidéo: Error: Calling the 'prepareAsync' function has failed
→ Caused by: Error code 1: 5 values for 6 columns
```

**Confirmé exactement comme prévu par ce que montrent les logs juste avant cette erreur — et c'est une excellente nouvelle pour le reste du chantier** : `[TranscriptFetcher] xhr_intercepted` a capturé un vrai corps sur PLUSIEURS vidéos différentes testées à la suite (395 114, 368 825, 504 109 et 130 149 caractères), donc l'interception réseau ET le nouveau parseur `parseJson3Captions` (corrigé lors de l'itération précédente) ont visiblement fonctionné jusqu'au bout — assez de segments réels ont été produits pour atteindre l'étape suivante, `addListeningVideo`, qui a échoué avec une erreur SQL, pas une erreur réseau. Le message "Erreur réseau" affiché à l'utilisateur était donc doublement trompeur.

**Diagnostic.** Dans `addListeningVideo` ([database.ts](mobile/src/data/database.ts)), l'insertion par lots dans `listening_segments` appelait `insertInBatches(db, segmentRows, 5, 'INSERT INTO listening_segments (id, video_id, segment_index, start_time, end_time, transcript)', ...)` — le paramètre `columnCount` valait **5**, alors que la liste de colonnes de la requête en nomme **6** (`id, video_id, segment_index, start_time, end_time, transcript`), et la fonction `toParams` fournit bien 6 valeurs par ligne. `valuesPlaceholders(5, N)` générait donc des groupes `(?, ?, ?, ?, ?)` à 5 emplacements pour une liste de colonnes qui en attend 6 — exactement l'erreur SQLite observée. Une simple faute de frappe (le paramètre `9` de l'insertion suivante, `listening_cards`, était lui correct).

**Impact / correctif appliqué.** `columnCount` corrigé de `5` à `6` pour l'insertion `listening_segments`. Correctif d'une ligne, mais avec un impact potentiellement décisif : c'était le dernier obstacle identifié dans toute la chaîne captions → segments → base de données.

**Statut : CONFIRMÉ sur device (21/08/2026).** Correctif compilé (`tsc --noEmit` propre, `npm test` 91/95 mêmes échecs préexistants, bundle Metro récupéré avec succès) puis retesté par l'utilisateur : nouveaux logs montrant `xhr_intercepted` sur d'autres vidéos (ex. 504 109 caractères, vidéo `1rcaS1J12hs`) suivis d'une confirmation explicite ("the segments aren't 0") — l'ajout de vidéo fonctionne bien de bout en bout, pas seulement jusqu'à l'écriture SQLite. **C'était bien le dernier obstacle** de toute la chaîne page réelle → clic sur "Afficher la transcription" → interception réseau (token PoToken) → parsing `fmt=json3` → écriture en base → affichage du nombre de segments dans l'app.

### Huitième itération — le lecteur vidéo lui-même ne charge pas (21/08/2026)

**Constat.** Distinct du problème de captions (résolu ci-dessus) : une fois un segment sélectionné en révision, l'utilisateur voit "Cette vidéo n'a pas pu être chargée (bloquée, privée ou supprimée)." — le message d'erreur défini dans [ListeningReviewScreen.tsx](mobile/src/screens/ListeningReviewScreen.tsx), affiché quand `YouTubePlayer` (composant séparé, [YouTubePlayer.tsx](mobile/src/components/YouTubePlayer.tsx)) appelle `onError`. C'est le point resté "non vérifié sur device" depuis la planification initiale (voir docstring du composant) — confirmé maintenant être réellement cassé, pas juste non testé.

**Diagnostic — aucun log disponible pour l'instant, donc pas de cause confirmée.** L'ancien code appelait `onError` sans aucune information (ni code d'erreur YouTube, ni détail de l'échec WebView), impossible de savoir laquelle des causes possibles (embedding bloqué par l'origine, vidéo réellement indisponible, échec réseau du chargement de `iframe_api`, erreur JS silencieuse) est en jeu. Plutôt que de deviner à l'aveugle, du logging a été ajouté partout où l'information existe : le code d'erreur natif de l'IFrame API (`e.data` dans `onError` du player YouTube), les erreurs JS non interceptées de la page (`window.onerror`), les échecs de chargement WebView natifs (`onError`/`onHttpError` de `react-native-webview`), et un timeout de diagnostic à 8s si `onYouTubeIframeAPIReady` ne se déclenche jamais.

**Correctif appliqué en parallèle, pas juste du logging** : le `WebView` chargeait la page via `source={{ html: ... }}` sans `baseUrl`, ce qui lui donne une origine nulle/`about:blank` — un problème connu et documenté pour l'IFrame API YouTube dans les WebViews mobiles (l'embedding peut être refusé, erreur 153 "not allowed to be played in embedded players", faute d'une origine valide pour le postMessage entre la page hôte et l'iframe YouTube). `baseUrl: 'https://www.youtube.com'` ajouté à `source`. Ce correctif est basé sur un fait technique documenté publiquement (pas une supposition en l'air), mais reste à confirmer sur ce device précis — c'est pour ça que le logging l'accompagne plutôt que de le présenter seul comme "le" correctif.

**Statut : logging + correctif candidat appliqués et compilés (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device.** Prochaine étape : retester une session d'écoute et, si l'erreur persiste, lire les logs `[YouTubePlayer] ...` dans Metro pour voir la vraie cause (code d'erreur YouTube en particulier) plutôt que d'essayer un autre correctif à l'aveugle.

### Neuvième itération — `baseUrl` insuffisant seul, code d'erreur 152 obtenu (21/08/2026)

**Constat.** Log réel après le correctif `baseUrl` ci-dessus, sur trois cycles de suite :
```
[YouTubePlayer] message: {"step": "script_start", "type": "debug"}
[YouTubePlayer] message: {"type": "ready"}
[YouTubePlayer] message: {"code": 152, "type": "error"}
```
Le player se construit et `onReady` se déclenche bien (donc `iframe_api` charge, le JS s'exécute, `baseUrl` a au moins permis d'atteindre cette étape) — mais une erreur survient juste après. **Code 152 : honnêtement non identifié avec certitude** — ce n'est PAS l'un des quatre codes officiellement documentés par YouTube (2, 5, 100, 101/150). Ne pas présenter une signification comme confirmée.

**Hypothèse retenue pour la suite (pas confirmée) : toujours un problème d'origine/autorisation, pas la vidéo elle-même.** Le paramètre `origin` de `playerVars` — recommandé explicitement par la documentation Google précisément pour les pages où l'origine réelle n'est pas fiable (exactement le cas ici) — n'était pas défini. Ajouté (`origin: 'https://www.youtube.com'`), avec en plus `location.href`/`document.referrer` maintenant inclus dans le message d'erreur pour objectiver l'origine réellement vue par la page côté device au prochain test, et le `videoId` concerné loggé pour vérifier si l'erreur est systématique (toutes les vidéos) ou spécifique à une vidéo précise (les trois logs ci-dessus ne permettent pas de trancher : impossible de savoir s'il s'agissait de la même vidéo rejouée ou de vidéos différentes).

**Statut : nouveau correctif candidat appliqué et compilé (`tsc --noEmit` propre), PAS encore vérifié sur device.** Si l'erreur persiste malgré `origin`, l'hypothèse à examiner ensuite (pas encore engagée, changement d'architecture plus lourd) : WebKit traite parfois une page chargée via `loadHTMLString`/`baseURL` comme ayant une origine "opaque" pour certaines vérifications de sécurité malgré `baseURL` — dans ce cas, il faudrait charger une vraie page `https://www.youtube.com/embed/{id}` par URL réelle (`source.uri`) plutôt qu'un document HTML de repli, sur le même principe que la solution déjà confirmée fonctionnelle pour les captions (`TranscriptFetcher.tsx`, qui charge une vraie page `youtube.com`).

### Dixième itération — l'hypothèse d'origine est écartée par la preuve, piste vidéo-spécifique retenue (21/08/2026)

**Constat.** Log réel après le correctif `origin` ci-dessus :
```
[YouTubePlayer] message: {"step": "script_start", "type": "debug"}
[YouTubePlayer] message: {"type": "ready", "videoId": "lUHlckT8a44"}
[YouTubePlayer] message: {"code": 152, "href": "https://www.youtube.com/", "referrer": "", "type": "error", "videoId": "lUHlckT8a44"}
```

**L'hypothèse d'origine est maintenant écartée par la preuve, pas juste non confirmée.** `href` montre `https://www.youtube.com/` — donc `baseUrl` ET `origin` fonctionnent exactement comme prévu, l'origine vue par la page est correcte — et pourtant le code 152 persiste à l'identique. Continuer à chercher du côté de l'origine sans nouvelle preuve serait deviner à l'aveugle après que l'hypothèse a déjà été testée et invalidée.

**Nouvelle piste, appuyée par un fait objectif du log : `videoId` est identique sur les deux derniers tests (`lUHlckT8a44`, la vidéo Ibai utilisée depuis le début de ce chantier pour les tests captions).** Impossible de savoir si les 3 cycles du test précédent portaient sur cette même vidéo ou non (`videoId` n'était pas encore loggé à ce moment). Il est donc possible que le code 152 soit **spécifique à cette vidéo précise** (restriction d'intégration par le propriétaire, contenu réservé aux abonnés/soumis à âge, ou restriction géographique) plutôt qu'un problème systémique du lecteur — les créateurs type Ibai désactivent fréquemment l'intégration sur leurs contenus.

**Pas de nouveau correctif appliqué cette fois — la prochaine étape utile est un test, pas du code.** Demandé à l'utilisateur de retester avec une vidéo différente, dont l'intégration est connue pour fonctionner, afin de trancher entre "problème vidéo-spécifique" (le code 152 disparaît) et "problème systémique du lecteur" (le code 152 persiste sur une autre vidéo aussi) — sans cette distinction, tout nouveau correctif de code serait une supposition non guidée par une preuve.

### Onzième itération — piste vidéo-spécifique écartée, le lecteur lui-même est remplacé (21/08/2026)

**Constat.** Log réel avec une vidéo entièrement différente (`95oYTSICA30`, capturée via une nouvelle recherche/ajout côté utilisateur) : même `code: 152`, exactement comme `lUHlckT8a44`. **La piste vidéo-spécifique est donc écartée par la preuve** — deux vidéos différentes, même échec identique, donc le problème est bien systémique au wrapper `YouTubePlayer.tsx` lui-même, pas à une restriction d'intégration propre à une vidéo précise.

**Changement d'architecture appliqué (l'option "plus lourde" déjà annoncée aux itérations précédentes comme plan de repli).** L'ancienne approche — une page HTML custom embarquant l'API JS `IFrame Player` officielle de YouTube (`YT.Player`, `onYouTubeIframeAPIReady`) — est abandonnée. Remplacée par le chargement d'une vraie page `https://www.youtube.com/embed/{videoId}?start=...&end=...&autoplay=1&playsinline=1&controls=1&rel=0` par URL réelle (`source.uri`), sur le même principe que `TranscriptFetcher.tsx` (déjà confirmé fonctionnel sur device pour les captions) : une vraie page `youtube.com`, une vraie origine HTTPS, aucune page HTML de repli synthétique à qui il faut faire croire à une origine via `baseUrl`/`origin`.

**Compromis assumé, documentés dans le composant** : sans script JS custom embarquant l'IFrame API (qui redemanderait exactement le problème d'origine qu'on vient d'éliminer), les événements précis (`onReady`/`onStateChange`) n'existent plus nativement. `onReady` est maintenant déduit d'une détection de texte d'erreur (multilingue, best-effort) 1,8 s après chargement ; `onSegmentEnded` est estimé par un minuteur côté React Native (`endTime - startTime`), pas un événement natif. **Sans conséquence pratique actuellement** : vérifié dans [ListeningReviewScreen.tsx](mobile/src/screens/ListeningReviewScreen.tsx) que seul `onError` est câblé sur `YouTubePlayer`, ni `onReady` ni `onSegmentEnded` ne sont utilisés par l'écran de révision aujourd'hui. Le blocage de lecture à `endTime` reste géré nativement par le paramètre `end` de l'URL d'intégration, indépendant de toute API JS.

**Statut : implémenté et compilé (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants, bundle Metro récupéré avec succès), PAS encore vérifié sur device.** C'est un changement plus important que les précédents correctifs ciblés (remplacement complet du mécanisme de chargement) — à retester en priorité, avec plusieurs vidéos différentes si possible pour confirmer que ce n'est pas juste une coïncidence sur un cas particulier.

### Douzième itération — nouveau message d'erreur trouvé (referrer manquant probable), plus un vrai bug de détection découvert en même temps (21/08/2026)

**Constat.** Retesté sur device avec une nouvelle vidéo (`PWkaQXXTMd8`) : les logs ne montrent QUE `{"type": "ready"}` (deux fois — normal, `injectedJavaScript` se réexécute à chaque re-navigation), aucune erreur détectée. **Mais la vidéo n'a toujours pas joué** — l'utilisateur rapporte avoir vu le message YouTube natif "Error de configuración del reproductor de video" avec un bouton "Ver en YouTube".

**Deux problèmes distincts révélés par ce test, pas un seul.**

1. **Bug de détection confirmé, pas une hypothèse.** Le texte exact affiché ("Error de configuración del reproductor de video" / "Ver en YouTube") ne correspondait à AUCUN des marqueurs multilingues de `ERROR_CHECK_SCRIPT` — donc le composant a signalé `ready` alors que la vidéo avait en fait échoué. Corrigé : marqueurs ajoutés dans les trois langues pour ce message précis ("video player configuration error"/"watch on youtube", "erreur de configuration du lecteur"/"regarder sur youtube", "error de configuración del reproductor"/"ver en youtube"). Ce correctif-là est garanti correct (basé sur le texte réel observé, pas une supposition) — la détection sera fiable au prochain test, indépendamment du reste.

2. **Cause probable de l'échec lui-même (hypothèse, pas confirmée) : absence d'en-tête `Referer`.** "Error de configuración du reproductor de video" + bouton "Ver en YouTube" est le message standard de YouTube pour un embed jugé non autorisé (même famille que l'erreur 101/150 de l'API JS) — et il est apparu de façon identique sur plusieurs vidéos différentes, ce qui pointe vers quelque chose d'envoyé (ou pas envoyé) à chaque requête plutôt qu'une restriction propre à chaque vidéo. Un log précédent avait déjà montré `document.referrer: ""` (vide) — `source={{ uri }}` sans en-tête explicite ne fournit aucun `Referer` HTTP à la requête initiale, ce que la page d'embed de YouTube peut exiger pour autoriser la lecture. Ajouté : `headers: { Referer: 'https://www.youtube.com/' }` sur la source de la WebView, et `origin=https%3A%2F%2Fwww.youtube.com` en paramètre de l'URL d'embed elle-même (recommandé par la documentation YouTube pour ce endpoint aussi, pas seulement pour l'API JS).

**Statut : correctif de détection garanti correct, correctif de cause (Referer) candidat non confirmé — compilé (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device.** Si l'erreur persiste malgré le `Referer`, au moins la détection sera désormais fiable pour objectiver précisément quel message s'affiche à chaque nouvel essai.

### Treizième itération — le bug de détection persiste (timing, pas les marqueurs) ; l'hypothèse "problème systémique" elle-même remise en question (21/08/2026)

**Constat.** Retesté avec `95oYTSICA30` : le log ne montre que `{"type":"ready"}` (×2/3, normal), aucune erreur détectée — **mais l'utilisateur rapporte avoir de nouveau vu l'écran "Ver en Youtube"**, et qu'en cliquant dessus la vidéo complète se lance côté YouTube réel (sous-titres actifs, pas de coupure à `endTime`) — comportement attendu du lien de secours en lui-même, mais confirmant que l'intégration échoue toujours malgré le `Referer`.

**Le bug de détection n'était donc PAS résolu par le simple ajout des marqueurs manquants — un deuxième bug distinct, de timing.** Le contrôle ne s'exécutait qu'une seule fois, 1,8 s après le chargement — si YouTube rend son écran d'erreur de façon asynchrone (contrôle JS interne, ce qui est plausible), un contrôle ponctuel trop précoce peut le manquer complètement. **Corrigé : sondage répété** (toutes les 700 ms, jusqu'à 8 fois, ~5,6 s de fenêtre) au lieu d'un contrôle unique — dès qu'un marqueur d'erreur apparaît à n'importe quel sondage, `error` est posté immédiatement ; `ready` n'est posté qu'après épuisement de tous les sondages sans détection.

**Remise en question méthodologique, pas juste un nouveau correctif : l'hypothèse "problème systémique, pas vidéo-spécifique" (itération 11) reposait sur une preuve plus faible que présenté à l'époque.** Les trois vidéos testées jusqu'ici (`lUHlckT8a44` Ibai, `PWkaQXXTMd8`, `95oYTSICA30`) sont toutes du contenu hispanophone de créateurs/labels — exactement le type de contenu où la désactivation d'intégration par Content ID est fréquente. "Deux vidéos différentes, même erreur" ne prouve pas un problème systémique si les DEUX vidéos ont individuellement l'intégration désactivée — ce que l'hypothèse d'origine n'avait pas exclu. **Demandé à l'utilisateur de tester avec une vidéo de contrôle dont l'intégration est garantie autorisée** (ex. une bande-annonce de studio officielle, ou la vidéo test universellement utilisée par les développeurs pour ce genre de vérification) pour trancher définitivement entre "l'intégration ne fonctionne pas du tout dans cet environnement" et "ce sont ces vidéos précises qui ont l'intégration désactivée".

**Statut : correctif de timing appliqué et compilé (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device. Cause racine de l'échec de lecture toujours non confirmée.**

### Quatorzième itération — problème confirmé systémique par une vidéo de contrôle garantie, correctif appliqué : user-agent desktop (21/08/2026)

**Constat.** Nouveau test avec `Ww7q0H0o05Y` (contenu hispanophone encore) : même échec identique. Vu le doute méthodologique soulevé à l'itération précédente, l'utilisateur a été invité à tester une URL précise connue pour être universellement intégrable — `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (upload officiel Sony Music, la référence standard utilisée par les développeurs pour ce genre de vérification, collée directement plutôt que recherchée pour garantir l'upload officiel et non un re-upload tiers). **Retour : "meme chose" — échec identique même sur cette vidéo.** Le problème est donc bien confirmé systémique, cette fois par une preuve qui exclut vraiment l'hypothèse vidéo-spécifique (contrairement à l'itération 11 dont le raisonnement était insuffisant).

**Cause retenue : absence de `userAgent` desktop sur la WebView — la seule différence notable restante avec `TranscriptFetcher.tsx`, qui charge fiablement de vraies pages `youtube.com` sur ce même device.** `TranscriptFetcher.tsx` force `userAgent={DESKTOP_USER_AGENT}` (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15`), confirmé fonctionnel sur device pour l'interception des sous-titres. `YouTubePlayer.tsx` n'avait jamais fixé de `userAgent` (WebView par défaut) — or l'endpoint `/embed/` de YouTube est connu pour traiter différemment les requêtes selon le user-agent, y compris pour refuser purement et simplement la lecture. Toutes les pistes précédentes (`baseUrl`, `origin`, `Referer`) avaient été testées et écartées individuellement ; celle-ci n'avait encore jamais été essayée alors qu'elle est directement inspirée d'un mécanisme déjà confirmé fonctionnel dans ce même projet, pas une nouvelle supposition en l'air.

**Impact / correctif appliqué.** Même constante `DESKTOP_USER_AGENT` dupliquée localement dans `YouTubePlayer.tsx` (pas d'import partagé créé, pour rester simple), passée via `userAgent={DESKTOP_USER_AGENT}` sur la `WebView`.

**Statut : implémenté et compilé (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device.** C'est la piste la mieux justifiée jusqu'ici (dérivée d'un mécanisme confirmé, pas devinée) — à retester en priorité.

### Quinzième itération — `userAgent` desktop insuffisant seul, "pratiquement le même bug" (21/08/2026)

**Constat.** Retesté (`ASL5hhgRMfQ`) : demandé explicitement à l'utilisateur si l'écran affiché était identique à avant plutôt que de supposer — confirmé "même écran qu'avant" (toujours "Error de configuración del reproductor de video" + "Ver en Youtube"). Le `userAgent` desktop, bien que bien justifié, n'a donc PAS résolu la cause racine. Le log ne montre toujours que `{"type":"ready"}` ×2 — **la détection reste en échec, même avec le sondage répété (5,6 s) ajouté à l'itération 13.**

**Plutôt que deviner un sixième correctif à l'aveugle, transformation du script en outil de diagnostic réel.** Deux limites possibles du sondage actuel, non tranchées : (1) fenêtre encore trop courte si le rendu d'erreur est très tardif, (2) le texte d'erreur pourrait être rendu dans un frame différent du frame principal (`injectedJavaScript` ne s'exécute par défaut que dans le frame principal côté `react-native-webview`). Corrigé/ajouté : fenêtre de sondage élargie à ~14 s (20 sondages), `injectedJavaScriptForMainFrameOnly={false}` pour couvrir l'hypothèse de frame, et surtout — le dernier sondage envoie maintenant un extrait brut (`href` + 300 premiers caractères de `document.body.innerText`) même s'il ne matche aucun marqueur connu, pour objectiver au prochain test ce que le script voit réellement plutôt que de continuer à raisonner à l'aveugle sur des hypothèses non vérifiables depuis cette session (pas de device disponible).

**Statut : instrumentation de diagnostic ajoutée et compilée (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device. Cause racine de l'échec de lecture toujours non confirmée après cinq correctifs candidats (`baseUrl`, `origin`, `Referer`, URL réelle au lieu de HTML synthétique, `userAgent` desktop).** Le prochain log `bodySample` devrait enfin permettre de savoir si c'est un problème de timing, de frame, ou autre chose d'inattendu.

### Seizième itération — cause racine enfin objectivée : redirection silencieuse vers la page `/watch` complète (21/08/2026)

**Constat.** Le `bodySample` diagnostique a immédiatement livré la vraie cause, sans ambiguïté cette fois : `href: "https://www.youtube.com/watch?v=ASL5hhgRMfQ"`, et le texte extrait montre "saltar navegación", "iniciar sesión", "17,1 M de suscriptores", "compartir", "6,8 M de visualizaciones" — **ce n'est pas la page `/embed/{id}` demandée, mais la page `/watch` complète, desktop, avec toute la navigation/barre latérale/chrome du site.** L'écran "Error de configuración del reproductor de video" que l'utilisateur voyait à chaque test n'était donc PAS un blocage d'intégration comme supposé — c'était le lecteur intégré à cette page `/watch` échouant à s'initialiser correctement, écrasé dans le cadre 16:9 minuscule du composant. Les marqueurs d'erreur (conçus pour l'écran de repli spécifique à `/embed/`) ne matchaient jamais pour la bonne raison : ce n'était tout simplement pas la bonne page.

**Cause de la redirection, identifiée avec un niveau de confiance élevé : l'en-tête `Referer: https://www.youtube.com/` ajouté à l'itération 12.** Un `Referer` indiquant que la requête provient de youtube.com lui-même peut faire traiter par le serveur YouTube une requête `/embed/{id}` comme une navigation interne, redirigée vers l'URL canonique `/watch?v={id}` plutôt que servie telle quelle comme un player autonome — comportement cohérent avec tout ce qui a été observé (échec identique et systémique quelle que soit la vidéo, contenu de page qui n'a jamais correspondu aux textes de repli connus). **Retiré.** Détection explicite ajoutée en prime : si `location.href` ne contient plus `/embed/` à un moment donné du sondage, `error` est posté immédiatement avec `reason: 'redirected_away_from_embed'` — pour objectiver instantanément si ce problème précis se reproduit, sans dépendre d'une inspection manuelle du `bodySample`.

**Statut : correctif appliqué et compilé (`tsc --noEmit` propre, `npm test` 99/103 mêmes échecs préexistants), PAS encore vérifié sur device.** C'est la première fois dans ce chantier qu'une preuve directe et non ambiguë de la cause réelle est obtenue (pas une hypothèse déduite par élimination) — bon espoir que ce soit la bonne piste, mais reste à confirmer par un test réel avant de considérer la lecture vidéo fiable.

## Recherche YouTube par mots-clés, à la place du collage de lien (20/08/2026)

**Constat.** Demande explicite : remplacer le champ "coller un lien" par une recherche par mots-clés dans la Bibliothèque de l'onglet Écoute.

**Vérification en direct avant d'écrire le moindre code applicatif** (même discipline que pour les captions plus haut dans ce fichier) : fetch de `https://www.youtube.com/results?search_query=...` avec un User-Agent de navigateur, extraction du JSON `ytInitialData` embarqué dans la page (même famille de technique que l'extraction réussie de `captionTracks` sur la page `watch?v=...`, PAS la technique du fetch de contenu `timedtext` qui, elle, avait échoué). **Résultat : succès** — 14 objets `videoRenderer` trouvés et parsés pour une requête test, avec `videoId`/titre/chaîne/vignette/durée tous présents et correctement structurés.

**Impact.** `mobile/src/listening/search.ts` (nouveau) implémente cette extraction via un parcours récursif du JSON (plus robuste qu'un chemin fixe dans l'arborescence, qui casserait à la moindre réorganisation de la page par YouTube) — dégradation silencieuse (`[]`) en cas d'échec réseau/parsing, cohérent avec le reste de `listening/`. `ListeningScreen.tsx` remplace le champ "coller un lien" par une barre de recherche ; une URL collée directement dans cette même barre est détectée (`extractVideoId`) et traitée comme un raccourci direct vers cette vidéo plutôt que comme des mots-clés, sans écran ni bouton séparé pour ça — reproduit le comportement réel de la barre de recherche YouTube elle-même.

**Statut : implémenté et vérifié en direct avant écriture du code (pas juste "supposé fonctionner").** Reste, comme pour les captions et les métadonnées : **méthode non officielle**, peut casser sans préavis si YouTube change la structure de cette page — pas de garantie de stabilité à long terme, à re-tester si la recherche cesse un jour de renvoyer des résultats.

## Barre d'onglets remplacée par un menu ☰ (20/08/2026, 5 itérations)

**Constat d'origine, formulé de façon ambiguë** ("trois traits horizontaux qui défilent un truc de la gauche vers la droite") — l'utilisateur avait lui-même anticipé l'ambiguïté ("si t'as pas compris demande moi"). Plutôt que deviner, question posée avec des interprétations concrètes illustrées par des maquettes ASCII : l'utilisateur a choisi "icône ☰ qui ouvre un menu", pas une bande toujours visible.

**Quatre retours supplémentaires reçus le même jour, après avoir vu chaque résultat** : (1) l'icône ne devait pas se superposer au logo "LEXIS" de chaque écran, les deux devaient être "sur le même plan" ; (2) le menu ouvert ne devait pas être un bandeau qui défile horizontalement mais un rectangle plein hauteur, pas pleine largeur, avec des traits de séparation sobres et discrets (pas une bordure pleine largeur), design "moderne" — jugé "parfait" une fois ce point réglé ; (3) le tiroir obtenu à l'étape précédente était en fait jugé trop grand en hauteur et en largeur (réduit à une petite carte dimensionnée à son contenu), et l'animation d'entrée (fondu + léger glissement, via `FadeInView`) devait être un glissement pur droite→gauche, sans fondu ; (4) la petite carte de l'étape 3 était finalement **jugée trop petite** — retour au tiroir plein en hauteur, mais avec une largeur légèrement réduite par rapport à la toute première version.

**Impact — état final de [TabBar.tsx](mobile/src/navigation/TabBar.tsx)** : icône ☰ en haut à **droite** (alignée exactement sur le `paddingTop` du bouton clair/sombre déjà là, avec un espacement fixe entre les deux) — la superposition avec "LEXIS" (toujours à gauche) devient structurellement impossible plutôt que corrigée au pixel près. Le menu est un **tiroir ancré au bord droit, du bas de l'icône jusqu'en bas de l'écran, largeur 70%** (78% à l'origine, 56% à l'étape intermédiaire jugée trop petite) : onglets empilés verticalement, séparés par un trait hairline à opacité réduite et en retrait des bords (`marginHorizontal`), onglet actif marqué par une fine barre de couleur à gauche plutôt qu'un bloc de fond plein. **Animation d'entrée** : `FadeInView` (composant partagé, utilisé ailleurs avec fondu intentionnellement) ne permet pas de désactiver le fondu séparément de la translation — plutôt que de lui ajouter un mode et risquer de changer le comportement des autres écrans qui l'utilisent, un petit composant local `SlideInFromRight` a été écrit directement dans `TabBar.tsx` (`Animated.Value`/`Animated.timing` sur `translateX` seul, opacité jamais touchée). `RootTabs.tsx` inchangé structurellement — `TabBar` reste monté seulement hors session.

**Statut : implémenté.** Vérifié à chaque itération : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants documentés plus haut, sans rapport), bundle Metro iOS récupéré avec succès (`HTTP 200`). **Non vérifié sur device** : ergonomie réelle du geste ouvrir/toucher une ligne/refermer, jamais testée hors du bundle compilé.

## Fermer le clavier en touchant en dehors du champ de saisie (20/08/2026)

**Constat.** `ConjugationReviewScreen.tsx` et `ListeningReviewScreen.tsx` (saisie de la conjugaison / de ce qui a été entendu) n'avaient aucun moyen de fermer le clavier sans passer par le bouton "Retour" du clavier système — `onSubmitEditing` déclenche déjà la validation, mais rien n'appelait `Keyboard.dismiss()`, donc le clavier restait ouvert même après validation.

**Impact.** Les deux écrans sont maintenant enveloppés dans un `Pressable` plein écran qui appelle `Keyboard.dismiss()` au toucher — toucher n'importe où en dehors du champ de saisie ou des boutons ferme le clavier. Grâce au système de réponse au toucher de React Native (le composant le plus profond sous le doigt reçoit l'événement), toucher le champ de saisie ou un bouton à l'intérieur ne déclenche jamais ce `Pressable` englobant, donc ça ne gêne pas la saisie elle-même. Corrigé sur les deux écrans (seule la conjugaison était explicitement signalée, mais la compréhension orale a exactement le même composant `TextInput` et le même souci) plutôt qu'un seul, pour rester cohérent.

**Statut : implémenté.** Vérifié : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants), bundle Metro récupéré avec succès. **Non vérifié sur device** — en particulier que le clavier se ferme bien au toucher sans gêner par ailleurs le défilement ou les autres boutons de l'écran.

## Clavier toujours sombre + Historique déplacé de Réglages vers Statistiques (20/08/2026)

**Constat.** Deux demandes explicites groupées dans le même message : (1) le clavier système doit toujours apparaître en thème sombre, indépendamment du thème clair/sombre choisi dans l'app ; (2) le sous-onglet Historique (liste des révisions, correction de note) doit vivre dans Statistiques plutôt que dans Réglages.

**Impact — clavier.** `keyboardAppearance` (prop native de `TextInput`, iOS uniquement — pas d'équivalent Android) posé à `"dark"` sur les 5 `TextInput` trouvés dans l'app : conjugaison ([ConjugationReviewScreen.tsx](mobile/src/screens/ConjugationReviewScreen.tsx)), compréhension orale ([ListeningReviewScreen.tsx](mobile/src/screens/ListeningReviewScreen.tsx), [ListeningScreen.tsx](mobile/src/screens/ListeningScreen.tsx) — recherche), mot personnalisé ([DecksScreen.tsx](mobile/src/screens/DecksScreen.tsx)), champs numériques de réglages ([SettingsScreen.tsx](mobile/src/screens/SettingsScreen.tsx)). Choix indépendant du thème clair/sombre de l'app (`useTheme()`) plutôt que suivi dessus — c'est ce qui a été demandé littéralement ("toujours").

**Impact — Historique.** `HistoryView` déplacée telle quelle (aucune logique changée) de `SettingsScreen.tsx` vers [StatsScreen.tsx](mobile/src/screens/StatsScreen.tsx), avec ses styles associés (badges de note, modal de correction). `StatsScreen.tsx` gagne des sous-onglets Statistiques/Historique (même patron `SubTabButton`/`subView` que Conjugaison/Écoute/Réglages) — le contenu "stats" existant (tuiles, prévision) devient `StatsView`, extrait sans changement de comportement. `SettingsScreen.tsx` repasse à 2 sous-onglets (Réglages/Notifications). Imports et styles devenus inutiles dans `SettingsScreen.tsx` après le déplacement (`FlatList`, `Modal`, `getReviewHistory`, `updateReviewGrade`, `ReviewHistoryRow`, `SM2Grade`, `GRADE_LABELS`/`GRADES`, et une dizaine de clés de style) supprimés plutôt que laissés morts — vérifié qu'aucun n'était utilisé ailleurs dans le fichier avant suppression.

**Statut : implémenté.** Vérifié : `tsc --noEmit` propre, `npm test` (91/95, mêmes 4 échecs préexistants), bundle Metro récupéré avec succès. **Non vérifié sur device** : teinte réelle du clavier iOS, lisibilité du nouvel emplacement de l'historique.

## Couverture thématique à 100% des 6002 mots (20/08/2026)

**Constat.** Demande explicite de couvrir tous les mots, pas seulement les ~17% déjà tagués par le premier passage du script (voir plus haut). Échantillonnage du "divers" (nouveau filet de sécurité, voir ci-dessous) fait à chaque itération pour cibler les ajouts plutôt que deviner : `node -e` groupant les mots restants par `partOfSpeech` et affichant un échantillon réparti (pas les 100 premiers, un pas régulier sur toute la liste pour éviter un biais d'ordre alphabétique/de fréquence).

**Impact.**
- **Catégories grammaticales** (préposition, pronom, article, déterminant, conjonction, contraction, interjection, nombre) taguées directement par `partOfSpeech` — 130 mots, sans ambiguïté possible.
- **Quatre thèmes larges ajoutés** (`cualidades`, `acciones_comunes`, `pensamiento_sociedad`, `cantidad_tiempo`), avec une deuxième passe de mots-clés après un premier échantillonnage qui a réduit le filet de sécurité de 3591 à 3123 mots (−468, ≈13% de réduction pour cette seule passe).
- **Règle par suffixe pour les adverbes en "-ly"** (quickly, seriously, publicly...) → `cualidades` : repéré comme motif dominant dans l'échantillon des adverbes non tagués (>80% des adverbes du premier échantillon suivaient ce seul motif), plus efficace qu'énumérer chaque adverbe individuellement.
- **Filet de sécurité `divers`** pour ce qui reste : 3123 mots (63% des 4939 mots initialement sans tag). **Ce n'est pas un vrai thème** — juste une garantie qu'aucun mot n'affiche "aucun thème" dans l'app. Composition dominante (vérifiée par échantillonnage) : noms très spécifiques (professions, objets, institutions — "commissioner", "shotgun", "orphanage"), verbes précis peu fréquents ("to whisper", "to bury", "to poison"), adjectifs de registre soutenu ("hypocritical", "elemental", "provisional"). Couvrir ça correctement demanderait une vraie compréhension sémantique (ou beaucoup plus de temps à énumérer des milliers de mots-clés supplémentaires), hors de portée raisonnable d'une heuristique par mot-clé dans le temps disponible.

**Statut : implémenté, 6002/6002 mots ont un tag.** Vérifié : `words.json` reste un JSON valide (6002 entrées, aucune perte), `wordRepository.test.ts` (8/8), `tsc --noEmit` propre. **Non vérifié sur device** : si les nouveaux thèmes larges et surtout le filet "divers" (qui concentre plus de la moitié des mots nouvellement tagués) sont perçus comme utiles à l'usage ou plutôt comme du bruit — impossible à juger sans retour réel.

## Tags CECRL de words.json : vérifiés déjà complets (20/08/2026)

**Constat.** Demande explicite : compléter les tags CECRL manquants dans `words.json`, en vérifiant d'abord combien de mots en ont déjà un et combien n'en ont pas, avant de coder quoi que ce soit. Vérification faite par script one-off (comptage par valeur exacte du champ `level`) plutôt que supposée :

```
2400 × "A1"
1802 × "A2"
1800 × "B1"
2400 + 1802 + 1800 = 6002 = nombre total de mots dans words.json
```

**Tous les mots ont déjà un niveau valide, sans exception.** Vérifié aussi spécifiquement sur les 36 mots écrits à la main (posé manuellement au moment de leur rédaction, majoritairement A1) : eux aussi en ont tous un. Ce n'est pas une coïncidence de comptage — le schéma (`wordRepository.ts`, `parseWordEntry`) exige déjà `typeof e.level === 'string'` pour qu'une entrée soit acceptée à l'import, donc *aucune* entrée sans niveau n'aurait pu se retrouver dans `words.json` en premier lieu. La prémisse du chantier ("un sous-ensemble à compléter") ne correspond pas à l'état réel des données.

**Impact.** Aucun code écrit pour ce chantier — appliquer l'heuristique de génération à un ensemble vide n'aurait rien changé, et forcer une "correction" sur des mots qui ont déjà un niveau aurait justement été l'inverse de la consigne explicite ("ne pas toucher aux tags déjà présents"). Le seul fichier concerné (`words.json`) n'a pas été modifié.

**Constat en marge, pas demandé** : aucun mot n'est actuellement au niveau "B2", bien que ce niveau existe comme option de filtre dans Decks & mots (`LEVELS = ['A1', 'A2', 'B1', 'B2']`, [DecksScreen.tsx](mobile/src/screens/DecksScreen.tsx)). Cause : `levelForIndex()` dans [generate-vocabulary/generate.mjs](mobile/scripts/generate-vocabulary/generate.mjs) ne produit que A1 (40%), A2 (30%) ou B1 (30%) — B2 n'a jamais été une sortie possible de l'heuristique, indépendamment de ce chantier. Conséquence pratique : le filtre "B2" dans l'app est aujourd'hui toujours vide. Pas corrigé ici, faute de consigne — noté dans PLAN.md pour trancher si besoin (étendre l'heuristique à 4 paliers, ou retirer le filtre B2 tant qu'aucun contenu ne l'utilise).

**Statut : vérifié, rien à faire.** Pas de code à tester pour ce point précis — la vérification elle-même (comptage exact, exécuté et son résultat collé ci-dessus) *est* la preuve, reproductible en relançant le même comptage sur `words.json`.

## Badge de série de jours (streak) sur Aujourd'hui (20/08/2026)

**Constat.** Demande explicite d'un indicateur visuel de série de jours consécutifs, avec deux contraintes : pas de notification "mot du jour" ni de rappel poussé (uniquement l'indicateur visuel), et réutiliser la logique existante si elle existe déjà — `computeStreak` était déjà en place dans [stats/statsEngine.ts](mobile/src/stats/statsEngine.ts) (testé, utilisé par l'écran Statistiques comme simple tuile numérique) avant ce chantier.

**Deux points explicitement ambigus, posés à l'utilisateur avant de coder** (pas devinés, conformément à la façon dont ce projet est mené) :
1. Faut-il un seuil minimum de série avant d'afficher le badge, ou toujours visible même à 0 ? → **Toujours visible, même à 0** (choix de l'utilisateur).
2. Que montrer quand la série vient de se casser (0 après en avoir eu une) ? Deux options neutres proposées (message encourageant générique, ou simple "0 jour" factuel) — l'utilisateur a demandé autre chose que les deux : **un rappel explicite de la longueur de la série perdue** ("tu avais X jours").

**Implémenté.**
- Nouvelle fonction pure `computeLostStreakLength(reviewDates, today)` ([statsEngine.ts](mobile/src/stats/statsEngine.ts)) : ne doit être appelée que quand `computeStreak()` vient de renvoyer 0 (précondition documentée dans le code) — cherche le jour le plus récent avec une révision strictement avant hier, puis compte les jours consécutifs en remontant depuis là. Renvoie 0 s'il n'y a jamais eu de série du tout (cas distinct de "série cassée"). 5 tests unitaires, y compris un cas avec deux séries passées distinctes (vérifie que c'est bien la plus récente qui compte, pas la plus longue).
- `TodayScreen.tsx` : nouveau composant `StreakBadge`, pilule avec emoji + texte, toujours affichée juste sous le titre. Trois états : 🔥 série active ("N jours de suite"), 💔 série cassée ("Série interrompue — tu avais N jours de suite"), ✨ jamais de série ("Commence une série aujourd'hui").
- **Placé sur Aujourd'hui, pas Statistiques** — décision laissée à mon jugement, justifiée : Aujourd'hui est le premier écran ouvert et l'endroit où "ne pas casser la chaîne" influence directement la décision de réviser aujourd'hui ; Statistiques est consultée après coup, une fois la décision déjà prise. La tuile "jours de suite" déjà présente sur Statistiques n'a pas été retirée (reste utile dans le contexte des autres stats agrégées) — pas une duplication problématique, juste deux présentations différentes du même nombre à deux endroits qui répondent à des questions différentes ("où en suis-je" vs "est-ce que je dois réviser maintenant").
- **Pas de notification ajoutée**, conformément à la consigne explicite — uniquement un indicateur visuel dans l'app, lu à l'ouverture d'Aujourd'hui comme le reste de l'écran (`getAllReviews` déjà appelé pour les besoins existants de l'écran, pas un nouvel appel réseau/IO ajouté à part la requête déjà nécessaire).

**Statut : implémenté.** Vérifié : `tsc --noEmit`, `npm test` (60/60, +5 pour `computeLostStreakLength`), bundle Metro compilé. **Non vérifié sur device** : lisibilité réelle du badge, et surtout si le message "série interrompue" est perçu comme motivant (l'intention derrière le choix explicite de l'utilisateur) ou culpabilisant à l'usage — impossible à juger depuis cette session, à observer en usage réel.

## Conjugaison : entraînement rendu aléatoire, historique ajouté, répertoire élargi à 1227 verbes (20/08/2026)

**Constat.** Premier retour réel sur l'onglet Conjugaison (voir section précédente pour son implémentation initiale) : la partie Règles fonctionne bien, l'entraînement fonctionne mais **n'est pas aléatoire**. Cause identifiée en relisant `getDueConjugationCardsSplit` : les nouvelles cartes étaient triées `ORDER BY rowid ASC`, et `importMissingConjugationCards` les insère verbe par verbe, temps par temps, personne par personne — donc une session commençait systématiquement par "ser" à l'indicatif présent (yo, tú, él...), puis tout l'indicatif prétérit de "ser", etc., avant de jamais toucher à un deuxième verbe. Un bug de conception, pas une fonctionnalité manquante : rien dans le plan d'origine ne demandait un ordre fixe, c'est juste la conséquence non anticipée de trier par ordre d'insertion.

**Fix — deux niveaux, pas un seul :**
1. **Sélection** : la requête SQL des nouvelles cartes passe de `ORDER BY rowid ASC` à `ORDER BY RANDOM()` — quelles cartes deviennent "nouvelles" dans une session est maintenant tiré au hasard parmi tout ce qui est encore `lifecycle = 'new'`, pas les N premières insérées.
2. **Présentation** : l'ensemble révisions + nouvelles (`[...reviewRows, ...newRows]`) est remélangé côté JS avec un Fisher-Yates ([mobile/src/utils/shuffle.ts](mobile/src/utils/shuffle.ts), 4 tests unitaires) avant d'être renvoyé — sinon même avec une sélection aléatoire, l'ordre de présentation restait "toutes les révisions d'abord, puis toutes les nouvelles", encore assez prévisible pour un utilisateur qui enchaîne les sessions.

Les cartes de révision (`lifecycle != 'new'`) restent sélectionnées par `due_date ASC` (les plus en retard d'abord) — seul l'ordre de *présentation* dans la session est mélangé, pas la priorité SM-2 de *quelles* cartes sont choisies. Décision volontaire, cohérente avec le principe SM-2 : le hasard demandé porte sur la variété perçue par l'utilisateur, pas sur la logique de priorisation des révisions en retard.

**Non appliqué au vocabulaire.** Le retour portait explicitement sur "la partie entraînement" de conjugaison (juste après avoir validé "la partie règle"), et `getDueCardsSplit` (vocabulaire) n'a jamais eu ce défaut précis — les mots sont sélectionnés un par un dès l'import initial (36 puis 6002, jamais par lots verbe-par-verbe comme les triplets de conjugaison), donc l'ordre d'insertion n'a jamais produit le même effet "toutes les formes d'un seul mot d'affilée". Pas de changement fait là où rien n'a été signalé cassé.

**Historique de conjugaison ajouté**, demandé explicitement, avec la précision "les notifications restent que pour le vocabulaire" — confirmée et respectée : `getConjugationHistory`/`updateConjugationReviewGrade` ([database.ts](mobile/src/data/database.ts)), nouveau sous-onglet "Historique" dans `ConjugationScreen.tsx` (Entraînement/Historique/Règles), aucun sous-onglet Notifications ajouté côté conjugaison. Même limite assumée que l'historique du vocabulaire : corrige le journal `conjugation_reviews` (donc les stats), pas l'échéance déjà programmée de la carte.

**Répertoire élargi de 200 à 1227 verbes**, demandé explicitement ("vérifie que le répertoire de verbes est très grand"). Régénéré avec `node generate.mjs 1228` (la totalité des verbes catégorisés dans `words.json` à ce moment) plutôt que devinée à un nombre intermédiaire arbitraire — résultat : **1227 verbes générés, 1 seul rejeté** (`ponerle`, rejeté par `@v4nn4/ablaut` avec une erreur explicite — "not a supported Spanish verb" — parce que ce n'est pas un vrai infinitif autonome mais un artefact `poner` + enclitique `le` qui a fui dans `words.json` depuis la génération de vocabulaire). Aucune nouvelle vérification de couverture nécessaire au-delà de relire ce journal d'erreurs : `@v4nn4/ablaut` est un moteur à règles (voir section précédente), pas une table figée qui aurait pu manquer des entrées pour les verbes les moins fréquents.

**Ajustement fait de ma propre initiative, pas demandé mais rendu nécessaire par le changement d'échelle** : le volume de cartes de conjugaison passe de 10 400 (200 verbes) à ~63 800 (1227 verbes), soit ×6. `importMissingConjugationCards` et `importMissingWords` inséraient jusque-là une ligne à la fois (`db.runAsync` par item, dans une seule transaction) — correct mais lent à ce volume : chaque appel implique un aller-retour au pont natif SQLite. Remplacé par des inserts groupés par lots de 80 lignes (`insertInBatches`, nouveau helper partagé) — un seul `INSERT ... VALUES (...), (...), ...` par lot au lieu d'un par ligne. Taille de lot choisie pour rester sous l'ancienne limite historique de SQLite (999 paramètres liés, obsolète depuis SQLite 3.32.0 mais gardée par prudence faute de pouvoir vérifier la version exacte bundlée par `expo-sqlite` sur ce device) : 80 lignes × 11 colonnes max = 880 paramètres.

**Non mesuré, à surveiller** : le tri `ORDER BY RANDOM()` sur la table `conjugation_cards` (jusqu'à ~63 800 lignes, potentiellement toutes `lifecycle = 'new'` et donc dues immédiatement à l'installation) s'exécute à **chaque** chargement de carte (après chaque note, voir `ConjugationReviewContainer.loadNext`), pas une fois par session. Un index existe sur `due_date` (`idx_conjugation_cards_due_date`) qui borne rapidement le `WHERE`, mais le tri aléatoire du résultat filtré n'est pas indexable par nature — coût exact non mesurable depuis cette session (pas de device). Si des lenteurs perceptibles apparaissent pendant une session de conjugaison (pas juste au premier lancement), c'est le premier endroit à profiler.

**Statut : implémenté.** Vérifié : `tsc --noEmit`, `npm test` (55/55, +4 pour `shuffle.ts`), bundle Metro compilé (7,7 → 9,4 Mo avec le répertoire élargi). **Non vérifié sur device** : la variété perçue en usage réel, le temps de premier import à ce volume (surtout pour l'installation déjà en place de l'utilisateur, qui va devoir importer les ~63 800 nouvelles lignes en une fois au prochain lancement), et la performance de `ORDER BY RANDOM()` en usage prolongé.

## Onglets Conjugaison + Règles de conjugaison implémentés (20/08/2026)

**Constat.** Suite de la planification documentée plus bas dans ce fichier (section « Planification (pas de code) : onglets Conjugaison + Règles de conjugaison ») — demande explicite ("code tout ça") de construire ce qui avait été cadré. Trois des quatre points ouverts listés à l'époque ont été résolus par investigation concrète plutôt que par décision arbitraire ; le quatrième (place dans la barre d'onglets) a été contourné par un choix d'architecture.

**`spanish-verbs` rejeté après test, pas par principe — remplacé par `@v4nn4/ablaut`.** Avant d'écrire le script de génération, la librairie initialement proposée a été testée sur un échantillon de 30 verbes fréquents à changement de radical/irréguliers plutôt que supposée fiable (`npm view spanish-verbs` la signale d'ailleurs dépréciée). Résultat, au présent du subjonctif : **13/30 (43%) de formes fausses**, dont un cas de contamination croisée entre verbes (`hacer` renvoyait `tengamos/tengáis/tengan`, les formes de `tener`, au lieu de `hagamos/hagáis/hagan`). Même défaut au présent de l'indicatif sur plusieurs verbes très fréquents (`pensar`→`penso`, `pedir`→`pedo`, `sentir`→`sento`...). Un taux d'erreur pareil sur des verbes enseignés dès le début de tout cours d'espagnol aurait fait apprendre de mauvaises conjugaisons — écarté avant d'écrire une seule ligne du script de génération dessus.

Recherche d'alternative sur le registre npm (pas une liste de noms devinés — recherche par mots-clés) : **`@v4nn4/ablaut`** retenu — moteur à règles (pas une simple table, "generalizes to unseen verbs"), licence MIT OR Apache-2.0, activement maintenu (CI, publié la veille du test), et **vérifié à 100,00% sur 339 200 formes espagnoles** contre deux lexiques indépendants par ses propres auteurs. Retesté ici sur le même échantillon de 30 verbes qui avait fait échouer `spanish-verbs` (0 erreur) et sur les 200 verbes réellement utilisés en v1 (0 erreur, 0 verbe rejeté). Un piège d'API a été découvert et documenté au passage : `conjugate()` ne lève pas d'erreur sur un infinitif mal accentué, il se rabat silencieusement sur une conjugaison régulière fausse (`oir` → faux, `oír` → correct) — vérifié que les verbes concernés dans `words.json` (oír, reír, sonreír, freír) y sont déjà bien accentués, donc sans impact en v1, mais à surveiller si la liste de verbes s'élargit. Détail complet, y compris le contournement du piège `fetch()` du WASM en environnement Node : [mobile/scripts/generate-conjugations/README.md](mobile/scripts/generate-conjugations/README.md).

**Tolérance sur les accents — option retenue : la plus indulgente des trois envisagées.** Accents ignorés des deux côtés de la comparaison (`hablo` accepté pour `habló`), plutôt qu'une tolérance asymétrique ou une distance d'édition. Choisi pour ne jamais décourager sur un accent manquant plutôt qu'une vraie erreur de conjugaison — au prix, assumé, de ne pas forcer l'apprentissage du placement des accents. Correctible plus tard vers une règle plus stricte si l'usage montre que c'est trop permissif (le réglage n'est pas encore exposé dans l'UI, changement de code nécessaire). Implémenté dans [conjugation/validate.ts](mobile/src/conjugation/validate.ts), 8 tests unitaires. Accepte aussi la variante -se du subjonctif imparfait, dérivée par un simple remplacement de suffixe depuis la forme -ra fournie par `conjugations.json` (`hablara`→`hablase`), sans avoir besoin de la stocker séparément.

**Nombre de verbes v1 : 200, confirmé sans changement** par rapport à la proposition initiale — la crainte notée dans la planification (10 800 cartes potentielles) s'est révélée non-problématique : le plafond quotidien (nouvelles cartes/jour) borne déjà l'exposition indépendamment de la taille du pool total, exactement comme pour les 6002 mots de vocabulaire (voir plus bas dans ce fichier). `@v4nn4/ablaut` étant un moteur à règles et non une table figée, monter à 300-400 verbes plus tard ne demande qu'un changement de paramètre (`node generate.mjs 400`), pas une nouvelle validation de couverture.

**Place dans la barre d'onglets : contournée, pas résolue frontalement.** Plutôt que d'ajouter 2 onglets séparés (Conjugaison + Règles) pour arriver à 6, « Règles de conjugaison » est devenu un **sous-onglet** de « Conjugaison » (aux côtés d'« Entraînement ») — même schéma que Réglages/Historique/Notifications sous un seul onglet « Réglages », déjà en place. La barre passe donc de 4 à 5 onglets, pas 6. Libellé de l'onglet Decks & mots raccourci en « Decks » dans la barre (le titre complet reste affiché en haut de l'écran) pour garder de la place ; police des libellés réduite à 10px. **Non vérifié visuellement sur device** si 5 pilules à cette taille restent confortables au toucher.

**Décisions de périmètre prises pendant la construction, pas dans la planification d'origine — documentées ici plutôt que silencieuses :**
- **Pas d'intégration aux notifications verrouillées en v1.** L'entraînement à la conjugaison est utilisable uniquement depuis l'app (onglet Conjugaison → Entraînement). Décision prise pour contenir la taille du chantier plutôt qu'un choix produit délibéré — à revoir si l'utilisateur trouve l'entraînement utile et veut le même mécanisme "jamais ouvrir l'app" que pour le vocabulaire.
- **Pas d'écran Historique ni de bouton "Encore des cartes" dédiés à la conjugaison en v1** — même raison de périmètre. Le bouton "Réinitialiser ma progression" (Réglages), en revanche, a été étendu pour couvrir aussi la conjugaison dans la même transaction : un seul bouton pour toute la progression de l'utilisateur, plutôt que deux boutons qui font presque la même chose.
- **Le contenu des verbes n'est pas dupliqué en base** (contrairement à `words`) : `conjugations.json` est importé une fois en mémoire côté app (`conjugation/data.ts`) et consulté par id ; `conjugation_cards` ne stocke que la progression SM-2 de chaque triplet (verbe, temps/mode, personne). Pas de fonctionnalité "ajouter son propre verbe" en v1, contrairement au vocabulaire — cohérent avec le périmètre validé, pas un oubli.

**Impact sur le temps de premier lancement, pas mesuré.** `importMissingConjugationCards` (10 400 lignes potentielles au premier import, 2 tables) s'ajoute à `importMissingWords` (déjà ~6000 mots × 2 lignes) dans la même séquence bloquante avant l'affichage de l'app — voir plus bas dans ce fichier, section sur l'expansion du vocabulaire, pour le même risque déjà identifié et pas encore mesuré sur device. Combiné, ça représente environ 16 400 lignes SQL à insérer séquentiellement au premier lancement (ou au premier lancement après cette mise à jour, pour l'installation déjà en place de l'utilisateur) — **à surveiller en priorité au prochain test réel**, plus encore que l'expansion du vocabulaire seule.

**Statut : implémenté.** Vérifié : `tsc --noEmit` (aucune erreur), `npm test` (51/51, dont les 8 nouveaux tests de `conjugation/validate.ts`), bundle Metro compilé et servi (`curl` sur `/index.ts.bundle`, HTTP 200, `node -c` sans erreur, taille passée de ~7,3 à ~7,7 Mo). Confirmé qu'`@v4nn4/ablaut` (paquet WASM, devDependency) n'est importé nulle part dans `mobile/src/` ni `App.tsx` — uniquement par le script de génération, jamais embarqué dans le bundle de l'app (`grep -rn "ablaut" src/ App.tsx` : aucun résultat). **Non vérifié sur device** : comportement réel de la saisie clavier, calibrage de la tolérance sur les accents à l'usage, temps de premier import, lisibilité de l'écran Règles.

## Retrait de react-native-reanimated, boutons agrandis, historique de révisions, padding (20/08/2026)

Retour utilisateur après un nouveau test réel : les boutons de notation (Otra vez/Difícil/Bien/Fácil) ne réagissaient pas au toucher et étaient perçus comme trop petits, plus de padding demandé sur les 4 côtés, et une demande d'historique consultable des révisions avec correction possible de la note.

**Cause retenue pour les boutons qui ne réagissaient pas : `react-native-reanimated` v4 + `react-native-worklets`.** C'était déjà l'hypothèse non retenue notée plus bas dans ce fichier (section « Flux de révélation in-app »), gardée « à creuser en premier » si le problème persistait après le flux de révélation — c'est exactement ce qui s'est passé. Plutôt que de chercher un correctif de configuration Reanimated (plugin Babel, New Architecture, version worklets) sans pouvoir tester sur ce device précis, **toute dépendance à Reanimated/worklets a été retirée du projet** et remplacée par l'API `Animated` intégrée à React Native, qui ne dépend d'aucun module natif tiers et ne peut donc pas souffrir du même type d'incompatibilité avec Expo Go :
- [AnimatedPressable.tsx](mobile/src/components/AnimatedPressable.tsx) : reconstruit sur `Animated.Value` + `Animated.timing` (retrait au toucher) au lieu de `useSharedValue`/`useAnimatedStyle`. `hitSlop` de 10px ajouté sur les 4 côtés — répond aussi au retour "trop petits" indépendamment de la cause du bug.
- [FadeInView.tsx](mobile/src/components/FadeInView.tsx) (nouveau) : remplace tous les usages de `entering={FadeIn/FadeInDown/FadeInUp/FadeInRight}` par un composant basé sur `Animated.Value` + `interpolate`, rejoué à chaque montage.
- Toutes les animations pilotées par valeur (barre de progression sur Aujourd'hui, barres de prévision sur Statistiques, point actif de la barre d'onglets) portées de `useSharedValue`/`withTiming`/`withSpring`/`withDelay` vers `Animated.Value`/`Animated.timing`/`Animated.spring`.
- `react-native-reanimated` et `react-native-worklets` retirés de `package.json` (`npm uninstall`) — plus aucune trace dans le bundle compilé au-delà de deux commentaires de code qui citent le nom en toutes lettres (vérifié par recherche dans le bundle Metro).
- Boutons de notation (`pill`) : hauteur 48 → 56px.

**Non confirmé sur device** : l'hypothèse tient (Reanimated nécessite la New Architecture + un plugin Babel correctement configuré, ce projet n'a pas de `babel.config.js` explicite pour ça) mais n'a jamais été vérifiée en isolant précisément quelle partie de Reanimated posait problème — seul un nouveau test réel confirmera si les boutons répondent maintenant. Si le problème persiste malgré ce retrait complet, la cause est ailleurs (pas Reanimated) et il faudra chercher du côté d'un conflit de `Pressable`/scroll parent ou d'un souci de zIndex/overlay.

**Historique des révisions ajouté** — nouvel onglet « Historique » dans Decks & mots (à côté de « Mots » et « Réglages »), voir [DecksScreen.tsx](mobile/src/screens/DecksScreen.tsx) (`HistoryView`) et [database.ts](mobile/src/data/database.ts) (`getReviewHistory`, `updateReviewGrade`). Liste le mot, sa traduction et la note donnée, la plus récente en premier ; toucher une ligne ouvre un sélecteur pour corriger la note en cas de mauvais clic.

**Limite assumée et affichée dans l'UI, pas cachée** : corriger une note dans l'historique ne met à jour que le journal `reviews` (utilisé pour les stats — série de jours, taux de réussite). Elle ne recalcule **pas** rétroactivement l'intervalle SM-2 ni la prochaine date d'échéance de la carte, qui ont déjà été avancés au moment de la note d'origine — recalculer cela correctement demanderait de rejouer tout l'historique SM-2 de la carte depuis ce point, non implémenté. Un texte d'aide au-dessus de la liste explique cette limite à l'utilisateur.

**Padding revu sur les 4 côtés** : l'écran de révision avait déjà `paddingHorizontal`/`paddingVertical` (donc techniquement les 4 côtés) avant cette demande ; vérifié qu'aucun écran (Aujourd'hui, Statistiques, Decks & mots, Historique) n'a de côté sans padding — ajout d'un `paddingTop` sur la liste de mots et l'historique qui n'en avaient pas explicitement (ils héritaient de l'espace laissé par le header, ce qui n'est pas la même chose qu'un padding propre à la zone si le header change).

**Validation de réglages ajoutée au passage** (backlog identifié plus bas dans ce fichier, section « Reste de l'app construit d'un bloc ») : l'heure de fin ne peut plus être enregistrée avant l'heure de début dans Decks & mots → Réglages.

**Vérifié pour ce chantier** : `tsc --noEmit` sans erreur, `npm test` (43 tests) vert, bundle Metro compilé et servi (`curl` sur `/index.ts.bundle`, HTTP 200, `node -c` sans erreur de syntaxe, 878 modules). **Non vérifié** : comportement réel des boutons, de l'historique et des animations sur iPhone — seul un test réel le confirmera.

## Planification (pas de code) : onglets Conjugaison + Règles de conjugaison (20/08/2026)

**Constat.** Demande explicite de cadrer deux nouveaux onglets — un entraînement à la conjugaison en flashcards SM-2, et une référence statique des règles de conjugaison — **sans écrire de code d'implémentation**, uniquement documenter la décision dans PLAN.md/AUDIT.md pour trancher les points restants avant de coder. Détail des décisions déjà validées : voir PLAN.md, section « Décisions validées — fonctionnalités futures ».

**Impact.** Aucun sur le code actuel — tâche de documentation pure, rien n'a tourné, rien à vérifier (`tsc`/tests/bundle inchangés). L'impact est sur la suite du plan : ces deux onglets s'ajouteraient à la barre du bas, qui en compte déjà 4 (Aujourd'hui/Statistiques/Decks & mots/Réglages, voir plus bas) — **la place disponible pour 6 onglets n'a pas été évaluée**, à revoir au moment de l'implémentation (possible qu'un sous-menu ou une organisation différente soit nécessaire plutôt que d'empiler des pilules).

**Statut : planifié, non commencé.** Points explicitement ouverts, à trancher avec l'utilisateur avant d'écrire la moindre ligne de code :

- **Tolérance exacte sur les accents.** "Tolérance sur les accents" est mentionné mais pas précisé : ignorer entièrement les accents (`tomo` accepté pour `tomó`) ? Ou les accepter en plus d'une saisie sans accent mais pas l'inverse (`hablo` refusé pour `habló`, `habló` accepté même tapé `hablo`) ? Ou une distance d'édition tolérée (ex. 1 caractère) plutôt qu'une règle spécifique aux accents ? Ces trois options ont des implications pédagogiques différentes (la première risque de ne jamais faire apprendre les accents), à choisir avant de coder la validation.
- **Nombre de verbes couverts en v1.** PLAN.md propose 200-300 comme point de départ ("à confirmer") — pas validé. À mettre en regard du nombre de temps/personnes retenus : 200 verbes × 6 personnes × 9 temps (5 indicatif + 2 subjonctif + 2 impératif) = 10800 cartes de conjugaison possibles si tout est généré d'un coup, largement plus que les 6002 mots de vocabulaire déjà en base — **volume à cadrer explicitement** (générer tout d'un coup comme pour le vocabulaire, ou une couverture plus restreinte en v1 ?) avant de lancer un script de génération.
- **Choix définitif de la source de conjugaison.** `spanish-verbs` (npm, MIT) proposé comme source principale, avec un repli sur les tables Wiktionary (déjà utilisées pour `words.json` via `es-en.data`) si des irréguliers ciblés sont mal couverts — mais **aucune des deux sources n'a été inspectée pour ce chantier** (contrairement à l'audit fait avant d'écrire le script `generate-vocabulary`, voir plus bas dans ce fichier, section « Pivot espagnol→anglais »). Avant de coder `generate-conjugations/`, il faudra vérifier concrètement la couverture de `spanish-verbs` sur les verbes irréguliers les plus fréquents (ser, estar, ir, hacer...) et sur les temps composés/subjonctif imparfait (deux formes en espagnol, `-ra`/`-se` — laquelle privilégier n'est pas tranché non plus), plutôt que de supposer que la lib suffit.
- **Place dans la barre d'onglets** (voir « Impact » ci-dessus) — 6 onglets au lieu de 4, pas évalué visuellement ni en usage.

## Réglages/Historique/Notifications séparés de Decks & mots en un 4e onglet (20/08/2026)

Demandé explicitement : sortir Réglages et Historique des sous-onglets de Decks & mots pour en faire un onglet à part dans la barre du bas. Notifications (ajouté la veille aux côtés de Réglages/Historique dans Decks & mots) n'était pas nommé dans la demande, mais regroupé avec eux plutôt que laissé seul dans Decks & mots : thématiquement plus proche de Réglages/consultation que de la gestion de la liste de mots, et Decks & mots n'aurait gardé qu'un seul sous-onglet ("Mots") si Notifications était resté — pas une vraie décision binaire, un jugement pris pour rester cohérent avec l'esprit de la demande plutôt qu'une lecture littérale limitée aux deux mots cités.

**Implémenté** :
- [SettingsScreen.tsx](mobile/src/screens/SettingsScreen.tsx) (nouveau) : reprend telles quelles les vues `SettingsView`, `HistoryView`, `NotificationsView` déplacées depuis `DecksScreen.tsx`, avec leurs propres sous-onglets (Réglages / Historique / Notifications, "Réglages" par défaut à l'ouverture).
- [DecksScreen.tsx](mobile/src/screens/DecksScreen.tsx) réduit à la liste de mots seule (`WordListView` + `AddWordModal`) — plus de sous-onglets, plus besoin puisqu'il ne reste qu'une seule vue.
- [TabBar.tsx](mobile/src/navigation/TabBar.tsx) : 4e onglet "Réglages" ajouté à côté d'Aujourd'hui/Statistiques/Decks & mots. Barre resserrée (`gap` 10→6, `paddingHorizontal` 14→10, police des libellés 12→11) pour garder assez de place à 4 pilules au lieu de 3.
- [RootTabs.tsx](mobile/src/navigation/RootTabs.tsx) : branche le nouvel onglet.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device** — en particulier si 4 pilules à cette taille restent confortables au toucher sur un écran d'iPhone standard (pas seulement en simulation de layout).

## Vocabulaire élargi à 6002 mots + import incrémental (20/08/2026)

Demandé explicitement : intégrer les 2000 mots générés (`words.generated.json`, jamais fusionnés jusque-là), "voire plus". Deux volets : (1) produire et fusionner davantage de vocabulaire, (2) faire en sorte que l'installation déjà sur l'iPhone de l'utilisateur (base SQLite déjà peuplée avec les 36 mots d'origine, voir la section "Rien à réviser" ci-dessous) reçoive bien les nouveaux mots — pas juste les nouvelles installations.

**Régénération à 6000 mots plutôt que 2000** : `node generate.mjs 6000` (le script accepte déjà un nombre cible en argument, défaut 2000 — voir [generate.mjs](mobile/scripts/generate-vocabulary/generate.mjs)). 17420 lemmes candidats étaient disponibles après filtrage dans `frequency.csv`, donc 6000 restait large marge en dessous du plafond réel (aurait pu aller à 17420) — choisi comme un compromis délibéré entre "plus de contenu" et une taille de bundle/durée de premier import raisonnable, pas une limite technique atteinte. Résultat : 5477/6000 mots (91%) avec une phrase d'exemple, 0 lemme ignoré faute d'entrée dans le dictionnaire, seulement 2 ignorés faute de glose exploitable.

**Fusion dans `words.json` sans relecture manuelle mot par mot**, cohérent avec la décision déjà actée ("gros volume direct, pas de relecture par petits lots", voir plus bas dans ce fichier) et avec la demande explicite. Script one-off (pas conservé) : garde les 36 mots écrits à la main tels quels, exclut du lot généré toute entrée dont l'id OU le texte espagnol coïncide avec un des 36 (34 coïncidences trouvées — normal, les deux listes piochent dans le vocabulaire le plus fréquent), ajoute le reste. **`words.json` passe de 36 à 6002 mots.** Vérifié avant écriture : 0 id dupliqué, 0 champ manquant au schéma attendu par `wordRepository.ts`, 0 glose anglaise vide. Détail complet dans le [README du script](mobile/scripts/generate-vocabulary/README.md), section « Intégration ».

**Import incrémental ajouté** — sans ça, la fusion ne servait à rien pour une base déjà peuplée (comme celle déjà testée par l'utilisateur) : `seedIfEmpty` ne faisait **strictement rien** si la table `words` n'était pas totalement vide, y compris si `words.json` avait changé depuis. Remplacé par `importMissingWords(db, words, now)` ([database.ts](mobile/src/data/database.ts)) : importe tout mot du bundle dont l'id n'est pas déjà en base, avec une carte SM-2 neuve (`lifecycle: 'new'`, due immédiatement) — au premier lancement ça importe tout (comme avant), sur une base déjà peuplée ça complète juste le delta, sans jamais toucher aux cartes/mots déjà existants. Appelé dans `App.tsx` à chaque démarrage (remplace l'appel à `seedIfEmpty`) — coût négligeable une fois le delta à zéro (une seule requête `SELECT id FROM words` de comparaison).

**Compromis assumé, pas caché** : le premier import (fraîche installation, ou l'installation existante de l'utilisateur au prochain lancement) insère maintenant ~6000 mots × 2 insertions SQL séquentielles (`words` + `cards`) dans une seule transaction — nettement plus que les 36×2 d'avant. Pas mesuré sur device (aucune mesure de perf possible depuis cette session), mais attendu plus lent que l'ancien premier lancement (déjà identifié comme point sensible, voir section "Lenteur au démarrage" plus bas) : **à surveiller au prochain test réel**, un indicateur de progression pourrait devenir nécessaire si c'est perceptiblement long.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43 — le test qui valide `words.json` en entier tourne maintenant sur 6002 entrées réelles au lieu de 36, toujours vert), bundle Metro compilé (taille passée de ~5,47 Mo à ~7,3 Mo, HTTP 200, `node -c` sans erreur). **Non vérifié sur device** : temps du premier import avec ce volume, et effet réel de `importMissingWords` sur l'installation déjà en place de l'utilisateur (n'a encore jamais tourné en dehors du bundle compilé ici).

## "Rien à réviser" après vidage du cache — pas un bug, précision utile pour la suite (20/08/2026)

Retour utilisateur après le vidage du cache Metro (`expo start --clear`) : l'écran Aujourd'hui affiche "Rien à réviser". Vérifié avec l'utilisateur via l'onglet Historique (déjà des révisions listées) : **la base SQLite de l'app n'a pas été remise à zéro**, contrairement à ce qui était supposé lors du "redémarrage". Confirme une distinction déjà présente dans le code mais pas assez explicite pour l'utilisateur jusqu'ici : vider le cache Metro (`expo start --clear`) n'efface que le bundle JavaScript, pas les données de l'app (SQLite, via `expo-sqlite`) — Expo Go conserve le stockage local du projet même après avoir complètement fermé/rouvert l'app ou vidé ce cache. Les 36 mots du vocabulaire de départ avaient déjà tous été notés pendant les tests (dont via le bouton "Encore des cartes"), donc SM-2 avait repoussé leurs échéances dans le futur : "Rien à réviser" était le comportement correct, pas un bug.

**Action retenue** (choisie par l'utilisateur parmi plusieurs options proposées) : ajouter un bouton "Réinitialiser ma progression" plutôt que d'attendre les échéances naturelles ou d'élargir le vocabulaire pour l'instant. Implémenté :
- `resetProgress(db, now)` ([database.ts](mobile/src/data/database.ts)) : vide `reviews` et `cards`, réinsère une carte SM-2 neuve (`lifecycle: 'new'`, `due_date: now`) pour chaque mot déjà présent dans `words` via un seul `INSERT ... SELECT` — ne touche pas à la table `words` elle-même (mots du bundle et mots ajoutés à la main restent tous là), donc fonctionne quel que soit le contenu réellement présent, pas câblé sur les 36 mots d'origine.
- Bouton dans Decks & mots → Réglages → "Zone sensible", avec confirmation (`Alert.alert`, style destructif) avant d'agir — irréversible, donc pas d'exécution en un seul tap.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device.**

## Bouton "Encore des cartes" en fin de session (20/08/2026)

Demandé explicitement : pouvoir demander de nouvelles cartes si la session du jour est terminée. Constat en écrivant ce correctif : le plafond `newCardsPerDay` (8 par défaut) n'a **jamais été un verrou en base** — `getDueCardsSplit` ne fait que limiter le nombre de nouvelles cartes sélectionnées *par appel*, sans mémoriser combien ont déjà été servies aujourd'hui. Rien n'empêchait donc techniquement d'en redemander, seulement l'UI ne le permettait pas encore.

Ajouté : `getMoreNewCards(db, now, disabledTags, limit)` ([database.ts](mobile/src/data/database.ts)), qui réutilise la même logique de sélection des nouvelles cartes que `getDueCardsSplit` (extraite dans un helper partagé `fetchNewCardRows`) mais sans dépendre du plafond déjà utilisé pour la session en cours. Bouton "Encore des cartes" affiché dans [ReviewScreenContainer.tsx](mobile/src/screens/ReviewScreenContainer.tsx) quand la session se termine ("Aucune carte due pour l'instant") : redemande un lot de la taille de `newCardsPerDay`, ou affiche "Plus de nouveaux mots" si le stock de mots `new` est vraiment épuisé.

**Pas de garde-fou artificiel ajouté contre l'abus de ce bouton** (ex. limite de lots par jour) — décision volontaire, pas un oubli : le plafond quotidien existe pour lisser l'introduction de nouveaux mots par défaut, pas pour empêcher un utilisateur qui a du temps libre d'en voir plus s'il le demande explicitement. Cohérent avec l'esprit de la demande.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device.**

## Cause réelle des boutons "en traits entassés" trouvée : bug de mise en page, pas Reanimated (20/08/2026)

Retour utilisateur : à la révélation de la traduction, les 4 boutons de notation ne s'affichent pas correctement — "plats", "des traits entassés". Ce symptôme, combiné au fait qu'il persistait malgré tous les correctifs précédents (retrait de Reanimated, agrandissements successifs), a permis de trouver la vraie cause : un **bug de mise en page dans `AnimatedPressable.tsx`**, présent depuis sa réécriture sur l'API `Animated` native (voir plus bas dans ce fichier, section « Retrait de react-native-reanimated ») — et donc jamais lié à Reanimated en premier lieu, contrairement à l'hypothèse retenue jusque-là pour les boutons "qui ne répondent pas".

**Le bug** : la version précédente était `<Pressable><Animated.View style={[style, {transform}]}>{children}</Animated.View></Pressable>` — `style` (donc `flex: 1`, `height: 68`, `borderRadius`...) n'était appliqué qu'à l'`Animated.View` **intérieur**, jamais au `Pressable` extérieur. Dans une rangée (`flexDirection: 'row'`) comme les 4 boutons de notation, c'est le `Pressable` extérieur qui est l'enfant direct de la rangée — sans aucun style propre, sans taille déterminée, Yoga (le moteur de mise en page de React Native) l'écrase à la taille de son contenu. Le `flex: 1` demandé par l'enfant intérieur ne peut pas se résoudre correctement contre un parent qui n'a lui-même aucune taille propre dans cet axe. Résultat : des boîtes quasi sans hauteur, écrasées les unes contre les autres — exactement "des traits entassés".

**Pourquoi ça n'avait pas été repéré plus tôt** : les tentatives précédentes (agrandir `height`, ajouter `hitSlop`, épaissir la bordure) portaient toutes sur des valeurs à l'intérieur de `style`, donc sur l'`Animated.View` intérieur déjà mal positionné — augmenter une valeur qui ne s'applique pas au bon niveau de l'arbre ne pouvait rien changer visuellement, ce qui explique pourquoi le problème "persistait" à travers plusieurs correctifs de taille.

**Fix** : `AnimatedPressable` rendu directement animable via `Animated.createAnimatedComponent(Pressable)` (`AnimatedPressableBase`) plutôt que d'envelopper un `Animated.View` séparé — un seul élément porte maintenant `style` (mise en page + visuel) ET le `transform` de l'animation de retrait au toucher, donc c'est bien l'élément qui a la bonne taille dans la rangée qui s'anime. Ce changement corrige structurellement TOUT usage de `AnimatedPressable` avec `flex: 1` dans une rangée, pas seulement les boutons de notation — notamment les onglets de la barre du bas (voir section suivante) et les boutons du formulaire d'ajout de mot.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device** — mais cette fois la cause est un vrai bug de mise en page identifié et corrigé à sa racine (pas une hypothèse), avec un mécanisme qui explique précisément le symptôme rapporté, contrairement aux tentatives précédentes qui n'avaient pas d'explication aussi directe.

## Barre d'onglets agrandie + pilules colorées (20/08/2026)

Demande explicite : agrandir verticalement la barre d'onglets du bas, et donner aux onglets non sélectionnés la même couleur que celui sélectionné, mais plus clair — remplace l'ancien indicateur (petit point qui grandissait en ressort à côté du libellé) par une pilule pleine derrière chaque onglet.

Implémenté dans [TabBar.tsx](mobile/src/navigation/TabBar.tsx) :
- `paddingTop`/`paddingBottom` de la barre augmentés (8/20 → 20/34), plus `paddingVertical: 14` propre à chaque pilule d'onglet — la barre est nettement plus haute.
- Chaque onglet est maintenant une pilule pleine (`borderRadius: 18`) : `t.buttonFilled` (bordeaux) si sélectionné, `t.buttonFilledLight` (même teinte, éclaircie) sinon. Texte blanc sur fond plein, texte bordeaux sur fond clair — reste lisible dans les deux cas.
- **`buttonFilledLight` ajouté à `SolYSombraPalette`** ([solYSombra.tsx](mobile/src/theme/solYSombra.tsx)) : une valeur hex choisie à la main pour chaque palette (comme le reste des couleurs de ce fichier), pas calculée à l'exécution — teinte claire dérivée de `buttonFilled` par thème (`#E9D2CE` en clair, `#5C3838` en sombre, où "clair" veut dire moins saturé/plus proche du fond que l'actif, cohérent dans les deux palettes).
- Ce composant bénéficie aussi du correctif de mise en page ci-dessus (section précédente) : les onglets utilisent `flex: 1` dans une rangée, exactement le cas qui posait problème avant le fix d'`AnimatedPressable`.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé. **Non vérifié sur device.**

## Padding toujours invisible, boutons encore trop petits (avant le vrai fix), mode sombre manuel, prochaine notification (20/08/2026)

Retour reçu **avant** la découverte du bug de mise en page ci-dessus : le padding ajouté n'était **toujours pas visible** malgré des valeurs déjà présentes sur tous les écrans (24-32px), les boutons de notation restaient trop petits, et deux nouvelles demandes — un bouton en haut à droite pour inverser manuellement clair/sombre, et un onglet indiquant l'heure approximative de la prochaine notification. Avec le recul (voir section « Cause réelle... » plus haut), le fait que les boutons restent "trop petits" malgré plusieurs agrandissements de valeurs s'explique : ces valeurs étaient posées sur l'`Animated.View` intérieur mal positionné, donc sans effet visible tant que le vrai bug de mise en page n'était pas corrigé.

**Padding — changement d'approche, pas juste de valeur.** Que le padding soit "toujours invisible" alors qu'il était déjà appliqué (`SafeAreaView` avec `padding`/`paddingHorizontal`/`paddingVertical` explicites sur Aujourd'hui, Statistiques, Session) plutôt qu'absent, laisse penser que le problème n'était pas la quantité mais la fiabilité de son application (bundle pas rechargé côté device, ou incohérence entre écrans qui rendait le résultat imprévisible). Plutôt que de re-augmenter des valeurs déjà présentes, le padding a été **centralisé** dans un nouveau composant, [ScreenContainer.tsx](mobile/src/components/ScreenContainer.tsx) : une unique racine visuelle (`SafeAreaView` + `View` intérieure avec `paddingHorizontal`/`paddingVertical` explicites, 22px par défaut) utilisée par tous les écrans (Aujourd'hui, Statistiques, Decks & mots, Session), remplaçant les paddings dispersés dans le style propre à chaque écran. Objectif : un seul endroit à vérifier/corriger si ça ne se voit toujours pas, plutôt que quatre implémentations légèrement différentes. **Si le padding ne se voit toujours pas après ce changement, la cause n'est plus du côté du code** (la même racine est utilisée partout, testée par compilation du bundle) **mais probablement un bundle Expo Go non rechargé** — recommandé côté utilisateur : fermer complètement Expo Go (pas juste revenir en arrière) et relancer, ou secouer l'appareil → Reload, plutôt qu'un rafraîchissement partiel qui peut servir un bundle JS en cache.

**Boutons de notation encore agrandis** : 56px → 68px de hauteur, bordure des boutons contour épaissie (1.5 → 2), texte 16px en gras (au lieu de la taille par défaut). `hitSlop` élargi de 10 à 14px sur `AnimatedPressable`.

**Mode sombre manuel ajouté** — bouton ☀️/🌙 flottant en haut à droite, visible sur tous les écrans (posé une seule fois au niveau de [RootTabs.tsx](mobile/src/navigation/RootTabs.tsx), pas dupliqué par écran). Avant ce chantier, `useTheme()` suivait uniquement `useColorScheme()` (réglage système iOS), sans bascule possible depuis l'app. Réimplémenté avec un contexte React (`ThemeProvider`, dans [solYSombra.tsx](mobile/src/theme/solYSombra.tsx) — renommé de `.ts` à `.tsx` car il contient maintenant du JSX) : le choix (`themeOverride: 'system' | 'light' | 'dark'`, nouveau champ dans `AppSettings`) est persisté dans la même table `settings` que le reste des réglages, donc survit à la fermeture de l'app. `ThemeProvider` a besoin de `db`, donc posé dans `App.tsx` autour de `<RootTabs>`, après l'ouverture de la base — l'écran de chargement (avant que `db` existe) garde un usage direct de `useColorScheme()` pour son propre fond, sans bascule manuelle possible à ce stade précis (cas limite, différence invisible en pratique : le chargement dure quelques centaines de ms).

**Onglet « prochaine notification » ajouté** — nouveau sous-onglet "Notifications" dans Decks & mots (aux côtés de Mots/Historique/Réglages), voir `NotificationsView` dans [DecksScreen.tsx](mobile/src/screens/DecksScreen.tsx). Utilise une nouvelle fonction `getNextNotificationTime` ([queue.ts](mobile/src/notifications/queue.ts)), qui **rejoue le même calcul de planification que `refillNotificationQueue` sans rien reprogrammer** (factorisé dans une fonction commune `computeQueueSlots`), plutôt que d'aller lire l'état réellement programmé côté OS via `Notifications.getAllScheduledNotificationsAsync()`. **Décision volontaire, pas un raccourci de facilité** : le format de retour de cette API pour un trigger de type date sur iOS (composants de date `UNCalendarNotificationTrigger` vs timestamp direct) n'est pas documenté de façon fiable pour cette version d'expo-notifications, et l'aurait tenté de deviner — ce qui est explicitement à éviter (voir la consigne du cahier des charges d'origine, "pose la question... plutôt que deviner"). Recalculer soi-même le prochain créneau est cohérent avec l'algorithme réellement utilisé, testé (le module `reviewScheduler` a 9 tests), et **le caractère approximatif de cette estimation est explicite dans l'UI** (texte d'aide + mot "environ") plutôt que présenté comme une heure garantie — l'espacement entre cartes dues simultanément est tiré aléatoirement (15-30 min) à chaque appel, donc peut légitimement différer de quelques minutes de l'heure réellement programmée par le dernier rechargement de la file.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé (5 vérifications successives au fil du chantier, toutes HTTP 200 / `node -c` sans erreur). **Non vérifié sur device** : comme toujours, seul un test réel dira si le padding est enfin visible, si les boutons sont maintenant jugés assez grands, si le bouton clair/sombre fonctionne et si l'estimation de notification est jugée utile telle quelle.

## Séparation nouvelles cartes / révisions + thèmes désactivés (20/08/2026)

Backlog identifié dans ce fichier (section « Reste de l'app construit d'un bloc ») traité à la demande de continuer le travail restant. Deux limites connues corrigées ensemble, car la même fonction (`getDueCards`) les concernait toutes les deux :

**Avant** : un seul plafond combiné (`limit`, ex. `DAILY_CARD_LIMIT = 30` dans `ReviewScreenContainer.tsx`, `QUEUE_SIZE = 50` dans `queue.ts`) appliqué à une requête unique triée par échéance, sans distinguer nouvelles cartes et révisions. Le réglage `disabledTags` (thèmes actifs) existait dans `AppSettings` et était modifiable dans Decks & mots → Réglages, mais n'était lu nulle part — désactiver un thème n'avait aucun effet observable.

**Après** : `getDueCardsSplit(db, now, settings)` (nouveau, [database.ts](mobile/src/data/database.ts)) fait deux requêtes SQL séparées — cartes en révision (`lifecycle != 'new'`, plafonnées à `reviewCapPerDay`, triées par échéance) puis nouvelles cartes (`lifecycle = 'new'`, plafonnées à `newCardsPerDay`, triées par fréquence) — et filtre ces dernières en JS pour exclure celles dont un tag figure dans `disabledTags`. Le filtre par tag se fait en JS après une requête large (marge de `newCardsPerDay * 5 + 50` candidats) plutôt qu'en SQL, car `tags` est stocké en JSON dans la colonne, pas dans une table de jointure — acceptable au volume de mots actuel (des milliers, pas des millions).

Branché dans les 3 endroits qui pilotaient auparavant ce plafond différemment : `ReviewScreenContainer.tsx` (session), `TodayScreen.tsx` (compteur affiché), `queue.ts` (`refillNotificationQueue`, qui piochait auparavant jusqu'à 50 cartes indistinctement).

**Décision de conception, pas explicitement demandée, documentée pour correction si besoin** : un mot déjà en cours de révision reste dû même si son tag est désactivé depuis (le filtre `disabledTags` ne s'applique qu'aux nouvelles cartes) — pour ne jamais faire disparaître une carte déjà commencée simplement parce qu'un thème a été décoché après coup. Cohérent avec le commentaire déjà présent dans `settings.ts` au moment où `disabledTags` avait été défini sans être branché.

**Refactor de passage** : `getDueCards` et `getWordWithCard` partageaient un type `Row` et un bloc de mapping SQL→objet dupliqués trois fois dans le fichier ; extraits en `WordCardRow`/`mapWordCardRow`/`WORD_CARD_SELECT` réutilisés par les trois fonctions (`getDueCards`, `getWordWithCard`, `getDueCardsSplit`) — pas un changement de comportement, seulement pour ne pas tripler la nouvelle logique de mapping une quatrième fois.

**Vérifié** : `tsc --noEmit`, `npm test` (43/43), bundle Metro compilé (HTTP 200, `node -c` sans erreur). **Non vérifié sur device** : la répartition effective en session réelle (est-ce qu'on voit bien un mélange nouvelles/révisions cohérent, est-ce que désactiver un thème dans Réglages a l'effet attendu) n'a pas pu être testée sans SQLite fonctionnel dans l'environnement Jest — même limite que le reste de `database.ts`, voir plus bas dans ce fichier.

## Pivot espagnol→anglais + vocabulaire généré depuis doozan/spanish_data (20/08/2026)

**Décision définitive, actée avec l'utilisateur** : le couple cible du projet passe d'espagnol→français à espagnol→anglais, pour toute la suite du projet — pas seulement ce lot de contenu. Déclenchée par le choix d'une source de vocabulaire fiable ([doozan/spanish_data](https://github.com/doozan/spanish_data), CC BY 4.0, agrégeant hermitdave/FrequencyWords CC BY-SA 3.0 + Wiktionary CC BY-SA + Tatoeba CC BY 2.0 FR) qui ne fournit que de l'anglais, pas de français.

**Renommage effectué dans toute la base de code** : `Word.french`→`Word.english`, `Word.exampleFr`→`Word.exampleEn`, colonnes SQL `french`/`example_fr` → `english`/`example_en`, libellés UI ("Traduction française" → "Traduction anglaise"), les 36 mots de `mobile/src/data/words.json` retraduits en anglais (dérivés directement de l'espagnol, pas d'une chaîne de traduction français→anglais, pour éviter une double perte de nuance). **`DB_NAME` changé de `lexis.db` à `lexis-en.db`** : `CREATE TABLE IF NOT EXISTS` ne migre pas une table déjà créée avec l'ancien schéma, donc un nouveau nom de fichier force une base fraîche plutôt qu'un crash au premier import. Aucune donnée utilisateur réelle perdue (rien n'a encore tourné avec succès de bout en bout sur device, voir plus bas dans ce fichier).

**Script de génération** : [mobile/scripts/generate-vocabulary/](mobile/scripts/generate-vocabulary/), voir son propre README pour le détail complet du fonctionnement et des limites. Résumé :
- Formats des 3 fichiers sources inspectés manuellement avant d'écrire le parseur (pas de doc formelle dans le dépôt source) : `frequency.csv` est un CSV simple sans guillemets (vérifié : 0 occurrence de `"`, 5 champs exactement sur chaque ligne, un `split(',')` suffit) ; `es-en.data` est un format texte custom (blocs séparés par `_____`, indentation à 2 espaces pour les sous-champs) ; `sentences.tsv` a des tags grammaticaux au format `:pos,forme|lemme`.
- **Filtrage confirmé nécessaire par inspection** : `flags=NOUSAGE` (5508 lignes) contient du bruit réel — prénoms anglais ("john", "jack"), abréviations ("sr.", "dr.") qui ont fui du corpus Tatoeba dans le classement de fréquence espagnol. Filtré, avec `DUPLICATE` (264 lignes).
- **Catégories grammaticales ajoutées** au passage (absentes du vocabulaire écrit à la main) : `nombre` (num), `déterminant`, `article`, `contraction` — table d'abréviations mise à jour dans `solYSombra.ts`.
- **Test sur 20 mots puis sur 2000** : JSON valide, 2000 ids uniques, 99% avec une phrase d'exemple, genres corrects sur les noms spot-vérifiés (banda→féminin, héroe→masculin, etc.), 0 lemme perdu faute de correspondance dictionnaire dans le pool de candidats utilisé.
- **Limite honnête constatée, pas corrigée automatiquement** : les gloses des mots grammaticaux (pronoms, déterminants, prépositions) sont parfois très verbeuses/académiques (Wiktionary), ex. « he, him, masculine personal third person subject and disjunctive pronoun (used as a subject and after prepositions) » pour *él*, contre « to have » pour *tener*. Pas de heuristique de troncature ajoutée : le risque de casser de bonnes gloses courtes existantes (ex. « in, at, on » pour *en*) l'emportait sur le bénéfice. Concerne une minorité de mots (~80 sur 2000) mais ce sont les plus fréquents, donc les premiers vus.
- **Niveau CECRL** : heuristique par position dans le classement (40% A1/30% A2/30% B1), pas de vraie donnée CECRL dans la source — à valider manuellement.
- **`words.generated.json` n'est jamais fusionné automatiquement** dans `words.json` (toujours 36 mots) — reste à relire par lots, comme demandé.

**Écran Crédits ajouté** ([CreditsScreen.tsx](mobile/src/screens/CreditsScreen.tsx), accessible depuis Decks & mots → Réglages) — obligation légale des licences CC BY/CC BY-SA, cite les 4 sources avec leur licence respective.

**Non vérifié sur device** : comme le reste depuis la tâche 0, ni le nouveau schéma ni l'écran Crédits n'ont encore tourné sur un vrai iPhone au moment où c'est écrit.

## Prononciation muette — bug documenté d'expo-speech corrigé (20/08/2026)

Retour utilisateur après test : le bouton "Écouter" réagit visuellement mais aucun son ne sort, sonnerie activée (pas le mode silencieux, déjà écarté par la question posée). Recherché plutôt que deviné : c'est un [bug connu et documenté d'expo-speech sur iOS](https://github.com/expo/expo/issues/8235), présent depuis plusieurs années — la session audio n'est pas toujours activée correctement pour la lecture, indépendamment du bouton silencieux.

Fix standard : configurer explicitement le mode audio au démarrage via `expo-audio` (`setAudioModeAsync({ playsInSilentMode: true })`), qui a remplacé `expo-av` pour SDK 54. Ajouté dans `App.tsx`, avant tout le reste de l'initialisation. `expo-asset` a dû être ajouté en peer dependency explicite (réclamé par `expo-doctor`, sinon "l'app pourrait planter hors Expo Go") ; `expo-doctor` repasse à 18/18 après.

**Non confirmé sur device** — comme le reste, diagnostiqué à partir d'un rapport de bug connu et du comportement observé, pas encore réécouté en vrai après le correctif.

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
