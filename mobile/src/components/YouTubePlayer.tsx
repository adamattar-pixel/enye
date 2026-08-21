import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import YoutubeIframe, { type YoutubeIframeRef } from 'react-native-youtube-iframe';

export type YouTubePlayerHandle = {
  /** Relance la lecture depuis `startTime` (voir `types.ts`). */
  replay: () => void;
};

type Props = {
  videoId: string;
  startTime: number;
  endTime: number;
  /** Appelé quand le player a fini de charger et est prêt à lire. */
  onReady?: () => void;
  /** Appelé quand la lecture atteint `endTime` (segment terminé). */
  onSegmentEnded?: () => void;
  /** Appelé sur une erreur du player YouTube (voir la table de
   * résilience de PLAN.md — vidéo bloquée à l'intégration, région,
   * etc.) — à afficher comme message simple côté appelant, pas de
   * tentative de contournement ici. */
  onError?: () => void;
};

/**
 * Wrapper autour de `react-native-youtube-iframe` (LonelyCpp) — remplace
 * le 21/08/2026 une implémentation maison (page HTML custom embarquant
 * l'API JS IFrame Player de YouTube) qui a échoué de façon systémique sur
 * device réel après 18 itérations de correctifs ciblés (`baseUrl`,
 * `origin`, `Referer`, URL d'embed réelle, `userAgent` desktop — voir
 * AUDIT.md, itérations 8 à 18). Cette librairie utilise EXACTEMENT la
 * même technique de fond (page HTML embarquant `YT.Player`), mais la sert
 * par défaut depuis une vraie URL HTTPS tierce (`lonelycpp.github.io`,
 * `baseUrlOverride` par défaut) plutôt qu'une chaîne HTML synthétique
 * sans origine réelle — c'est très probablement la différence qui la
 * rend fiable là où l'implémentation maison ne l'était pas (~700 ⭐,
 * support Expo explicite, aucune dépendance native — compatible Expo Go
 * sans dev build). **Non encore vérifié sur device** — voir AUDIT.md.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, startTime, endTime, onReady, onSegmentEnded, onError },
  ref
) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const [width, setWidth] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  useImperativeHandle(ref, () => ({
    // `seekTo` seul ne reprend jamais la lecture si le player est en
    // pause (documenté officiellement par l'API YouTube) — maintenant que
    // la coupure précise à `endTime` est fiable (voir plus bas), rejouer
    // laisserait sinon la vidéo en pause après le retour au début. Un
    // remontage complet (nouvelle `key`) redémarre proprement avec
    // `play=true`, plutôt que de dépendre d'un appel `playVideo` que la
    // librairie n'expose pas dans sa ref.
    replay: () => setReplayKey((k) => k + 1),
  }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const handleChangeState = useCallback(
    (state: string) => {
      console.log('[YouTubePlayer] state:', state);
      if (state === 'ended') onSegmentEnded?.();
    },
    [onSegmentEnded]
  );

  const handleError = useCallback(
    (error: string) => {
      console.log('[YouTubePlayer] error:', error);
      onError?.();
    },
    [onError]
  );

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {width > 0 && (
        <YoutubeIframe
          key={replayKey}
          ref={playerRef}
          height={(width * 9) / 16}
          width={width}
          videoId={videoId}
          play
          initialPlayerParams={{
            start: Math.floor(startTime),
            end: Math.ceil(endTime),
            // Habillage YouTube (barre de contrôle, titre, bouton plein
            // écran) masqué — demandé explicitement : ne garder que
            // l'image de la vidéo. Compromis assumé : plus de pause/
            // avance manuelle native, seul "Réécouter" (côté app) reste
            // disponible pour agir sur la lecture.
            controls: false,
            rel: false,
            // Les sous-titres révéleraient la réponse avant que l'utilisateur
            // ait tapé ce qu'il a entendu — explicitement désactivés plutôt
            // que de compter sur le défaut de la librairie (demandé
            // explicitement, l'utilisateur devait sinon les couper à la main).
            showClosedCaptions: false,
          }}
          // `showClosedCaptions: false`, `incognito`, puis `unloadModule`
          // seul ont tous les trois échoué sur device (21/08/2026, réglage
          // iOS "Sous-titres et SDH" aussi vérifié désactivé). Filet de
          // sécurité le plus robuste ajouté en dernier recours : simuler un
          // vrai clic sur le bouton CC du lecteur si l'API le montre actif,
          // en plus des méthodes d'API — voir `buildPlayerFixupScript` plus
          // bas, qui gère aussi le bornage précis à la milliseconde du
          // segment (demandé explicitement, `start`/`end` de l'API YouTube
          // n'acceptent que des secondes entières).
          webViewProps={{ incognito: true, injectedJavaScript: buildPlayerFixupScript(startTime, endTime) }}
          onReady={() => onReady?.()}
          onChangeState={handleChangeState}
          onError={handleError}
        />
      )}
    </View>
  );
});

/** Script injecté dans la page du lecteur (`player` est une variable
 * globale déclarée `var player` au niveau racine d'un `<script>` classique
 * par `react-native-youtube-iframe`, pas un module — voir son
 * `PlayerScripts.js` sur GitHub — donc accessible depuis n'importe quel
 * script partageant la même WebView). Trois responsabilités, combinées en
 * un seul sondage pour ne pas multiplier les `setInterval` :
 *
 * 1. **Désactivation des sous-titres.** `cc_load_policy` (via
 *    `showClosedCaptions`), puis `incognito`, puis `unloadModule('captions')`
 *    seul ont chacun échoué sur device (21/08/2026, itérations successives
 *    — voir AUDIT.md). `cc_load_policy` ne peut par conception qu'éviter de
 *    FORCER l'affichage, jamais forcer l'extinction. Filet de sécurité le
 *    plus direct ajouté en dernier recours : simuler un vrai clic sur le
 *    bouton CC du lecteur (`.ytp-subtitles-button`, classe stable de
 *    l'habillage YouTube) chaque fois qu'il est trouvé actif
 *    (`aria-pressed="true"`) — équivalent à ce que ferait un utilisateur
 *    réel, sondé en continu au cas où l'état changerait après coup (ex.
 *    activation tardive d'une traduction automatique).
 * 2. **Bornage précis du segment, à la milliseconde.** Les paramètres
 *    `start`/`end` de l'API YouTube (`initialPlayerParams`) n'acceptent que
 *    des secondes entières — limitation documentée de l'API, pas un choix
 *    de ce projet. `player.seekTo(secondes, true)` et
 *    `player.getCurrentTime()`, eux, acceptent des flottants : on corrige
 *    la position de départ précisément dès que le player existe, puis on
 *    sonde `getCurrentTime()` pour couper à `endTime` au lieu de compter
 *    uniquement sur le `end` grossier (demandé explicitement, 21/08/2026).
 */
function buildPlayerFixupScript(startTime: number, endTime: number): string {
  return `
(function () {
  var attempts = 0;
  var seeked = false;

  function disableCaptions(p) {
    try { p.unloadModule && p.unloadModule('captions'); } catch (e) {}
    try { p.setOption && p.setOption('captions', 'track', {}); } catch (e) {}
    // .click() sur un élément déclare son gestionnaire d'événement même
    // masqué par CSS (controls: false ci-dessus) tant qu'il reste dans le
    // DOM — à surveiller si YouTube retire carrément le bouton du DOM
    // plutôt que de le masquer visuellement quand controls=0, auquel cas
    // ce repli deviendrait inopérant et il faudrait revenir à controls:
    // true pour le garder fonctionnel.
    var btn = document.querySelector('.ytp-subtitles-button');
    if (btn && btn.getAttribute('aria-pressed') === 'true') {
      try { btn.click(); } catch (e) {}
    }
  }

  var initInterval = setInterval(function () {
    attempts++;
    if (typeof player === 'undefined' || !player) {
      if (attempts > 20) clearInterval(initInterval);
      return;
    }
    clearInterval(initInterval);

    if (!seeked && player.seekTo) {
      try { player.seekTo(${startTime}, true); } catch (e) {}
      seeked = true;
    }

    disableCaptions(player);
    setInterval(function () { disableCaptions(player); }, 1000);

    setInterval(function () {
      if (player.getCurrentTime && player.getCurrentTime() >= ${endTime}) {
        try { player.pauseVideo(); } catch (e) {}
      }
    }, 200);
  }, 300);
  true;
})();
`;
}

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
});
