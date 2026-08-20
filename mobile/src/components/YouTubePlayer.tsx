import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

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
 * Wrapper autour d'une page HTML minimale embarquant l'IFrame Player API
 * de YouTube (officielle) dans une WebView — pas de dépendance vidéo
 * tierce, la vidéo n'est jamais téléchargée (voir la mission :
 * "uniquement via le lecteur natif de YouTube").
 *
 * Compatibilité Expo Go réelle **non vérifiée dans cette session** (pas
 * de device disponible) — `expo-doctor` ne signale rien d'anormal après
 * `npx expo install react-native-webview`, mais c'était le point le plus
 * bloquant identifié en planification (voir PLAN.md, "Points à valider
 * avant implémentation", #1) et reste à confirmer sur l'iPhone réel de
 * l'utilisateur avant de considérer cette fonctionnalité fiable.
 *
 * Le paramètre `end` natif de l'IFrame API est utilisé pour arrêter la
 * lecture au bon moment ; en secours, la page injecte aussi un minuteur
 * JS qui appelle `pauseVideo()` si `end` s'avère peu fiable en pratique
 * (also non vérifié — voir même point ouvert du plan).
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, startTime, endTime, onReady, onSegmentEnded, onError },
  ref
) {
  const webviewRef = useRef<WebView>(null);
  const [webviewError, setWebviewError] = useState(false);

  useImperativeHandle(ref, () => ({
    replay: () => {
      webviewRef.current?.injectJavaScript(`window.__lexisReplay && window.__lexisReplay(); true;`);
    },
  }));

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type: string };
        if (data.type === 'ready') onReady?.();
        else if (data.type === 'segmentEnded') onSegmentEnded?.();
        else if (data.type === 'error') onError?.();
      } catch {
        // Message inattendu, ignoré plutôt que de planter.
      }
    },
    [onReady, onSegmentEnded, onError]
  );

  if (webviewError) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        style={styles.webview}
        source={{ html: buildPlayerHtml(videoId, startTime, endTime) }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onError={() => {
          setWebviewError(true);
          onError?.();
        }}
      />
    </View>
  );
});

function buildPlayerHtml(videoId: string, startTime: number, endTime: number): string {
  // videoId vient de `youtubeUrl.ts` (regex stricte, 11 caractères
  // alphanumériques/-/_) — jamais de texte libre utilisateur injecté
  // directement ici sans validation préalable.
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#000;">
<div id="player"></div>
<script>
  var tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.body.appendChild(tag);

  var player;
  var endTime = ${endTime};
  var startTime = ${startTime};
  var endCheckInterval = null;

  function post(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function clearEndCheck() {
    if (endCheckInterval) { clearInterval(endCheckInterval); endCheckInterval = null; }
  }

  // Filet de sécurité si le paramètre "end" natif de l'IFrame API ne
  // déclenche pas de façon fiable (non vérifié en amont) : vérifie le
  // temps courant toutes les 250ms et coupe manuellement au besoin.
  function startEndCheck() {
    clearEndCheck();
    endCheckInterval = setInterval(function () {
      if (player && player.getCurrentTime && player.getCurrentTime() >= endTime) {
        player.pauseVideo();
        clearEndCheck();
        post({ type: 'segmentEnded' });
      }
    }, 250);
  }

  window.__lexisReplay = function () {
    if (!player) return;
    player.seekTo(startTime, true);
    player.playVideo();
    startEndCheck();
  };

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: '${videoId}',
      playerVars: { start: Math.floor(startTime), end: Math.ceil(endTime), playsinline: 1, controls: 1 },
      events: {
        onReady: function () {
          post({ type: 'ready' });
          player.playVideo();
          startEndCheck();
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) {
            clearEndCheck();
            post({ type: 'segmentEnded' });
          }
        },
        onError: function () {
          post({ type: 'error' });
        }
      }
    });
  };
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#000' },
});
