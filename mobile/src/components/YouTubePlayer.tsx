import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/** Même user-agent desktop que `TranscriptFetcher.tsx` (confirmé fiable sur
 * device pour charger de vraies pages `youtube.com`) — absent ici jusqu'au
 * 21/08/2026, alors que c'est la seule différence notable entre les deux
 * WebViews. Ajouté après que `baseUrl`/`origin`/`Referer` aient tous été
 * testés et écartés individuellement, et que l'échec ait été confirmé
 * systémique (même erreur sur une vidéo de contrôle garantie intégrable —
 * voir AUDIT.md, itération 14) : le user-agent par défaut de la WebView
 * peut être traité différemment par YouTube pour l'intégration `/embed/`. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

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
  /** Appelé quand la lecture atteint `endTime` (segment terminé) — estimation
   * par minuteur RN, pas un événement natif du player (voir plus bas). */
  onSegmentEnded?: () => void;
  /** Appelé sur une erreur du player YouTube (voir la table de
   * résilience de PLAN.md — vidéo bloquée à l'intégration, région,
   * etc.) — à afficher comme message simple côté appelant, pas de
   * tentative de contournement ici. */
  onError?: () => void;
};

/**
 * Wrapper autour d'une vraie page `youtube.com/embed/{id}` chargée par URL
 * réelle dans une WebView — PAS une page HTML custom embarquant l'IFrame
 * Player API JS (ancienne approche, abandonnée le 21/08/2026 après avoir
 * échoué de façon systémique sur device réel : erreur non documentée
 * "code 152" reproduite sur deux vidéos différentes, y compris après avoir
 * confirmé que `baseUrl`/`origin` fonctionnaient correctement — voir
 * AUDIT.md itérations 8 à 10). Cette nouvelle approche évite tout le
 * problème d'origine synthétique en chargeant une vraie page YouTube par
 * une vraie URL https, sur le même principe que `TranscriptFetcher.tsx`
 * (confirmé fonctionnel sur device pour les captions).
 *
 * Pas de dépendance vidéo tierce, la vidéo n'est jamais téléchargée (voir
 * la mission : "uniquement via le lecteur natif de YouTube").
 *
 * **Compromis assumé** : sans script custom embarquant l'IFrame Player API
 * (qui exigerait de re-attaquer le même problème d'origine), on perd les
 * événements JS précis (`onReady`/`onStateChange`). `onReady` est déduit
 * d'un script injecté qui vérifie, 1,8 s après chargement, l'absence de
 * texte d'erreur connu dans la page (multilingue, best-effort — pas une
 * détection garantie à 100%). `onSegmentEnded` est estimé par un minuteur
 * côté RN (`endTime - startTime`), pas un événement natif — actuellement
 * sans conséquence car [ListeningReviewScreen.tsx](../screens/ListeningReviewScreen.tsx)
 * ne câble que `onError`, ni `onReady` ni `onSegmentEnded`. Le blocage de
 * lecture au bon moment reste géré nativement par le paramètre `end` de
 * l'URL d'intégration YouTube (documenté, indépendant de cette API JS).
 *
 * **Non encore revérifié sur device** — voir AUDIT.md, itérations 8 à 10
 * pour l'historique complet du diagnostic qui a mené à ce changement.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, startTime, endTime, onReady, onSegmentEnded, onError },
  ref
) {
  const webviewRef = useRef<WebView>(null);
  const [webviewError, setWebviewError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useImperativeHandle(ref, () => ({
    replay: () => setReloadKey((k) => k + 1),
  }));

  useEffect(() => {
    setWebviewError(false);
  }, [videoId, reloadKey]);

  // Filet de sécurité côté RN pour `onSegmentEnded` (voir docstring) —
  // approximatif, part du principe que la lecture démarre peu après le
  // montage grâce à `autoplay=1` dans l'URL.
  useEffect(() => {
    const durationMs = Math.max(0, (endTime - startTime) * 1000);
    if (!durationMs) return;
    const timer = setTimeout(() => onSegmentEnded?.(), durationMs + 500);
    return () => clearTimeout(timer);
  }, [videoId, startTime, endTime, reloadKey, onSegmentEnded]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type: string; reason?: string };
        console.log('[YouTubePlayer] message:', data);
        if (data.type === 'ready') onReady?.();
        else if (data.type === 'error') onError?.();
      } catch (err) {
        console.log('[YouTubePlayer] message JSON invalide:', event.nativeEvent.data, err);
      }
    },
    [onReady, onError]
  );

  if (webviewError) {
    return <View style={styles.container} />;
  }

  const uri = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}&end=${Math.ceil(
    endTime
  )}&autoplay=1&playsinline=1&controls=1&rel=0&origin=https%3A%2F%2Fwww.youtube.com`;

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        ref={webviewRef}
        style={styles.webview}
        source={{ uri, headers: { Referer: 'https://www.youtube.com/' } }}
        userAgent={DESKTOP_USER_AGENT}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScript={ERROR_CHECK_SCRIPT}
        onMessage={handleMessage}
        onError={(event) => {
          console.log('[YouTubePlayer] WebView onError:', event.nativeEvent);
          setWebviewError(true);
          onError?.();
        }}
        onHttpError={(event) => {
          console.log('[YouTubePlayer] WebView onHttpError:', event.nativeEvent);
          setWebviewError(true);
          onError?.();
        }}
      />
    </View>
  );
});

// La page `/embed/{id}` répond HTTP 200 même quand la vidéo est bloquée,
// privée ou introuvable — elle affiche juste un message d'erreur dans la
// page (pas d'erreur réseau détectable par `onError`/`onHttpError`).
// Détection heuristique par texte, multilingue (device testé en français,
// YouTube peut aussi répondre en anglais/espagnol selon l'Accept-Language
// envoyé par la WebView) — best-effort, pas garanti exhaustif.
const ERROR_CHECK_SCRIPT = `
(function () {
  function post(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  var errorMarkers = [
    'video unavailable', 'private video', "isn't available", 'unavailable in your country',
    'sign in to confirm your age', 'this video is not available', 'video player configuration error',
    'watch this video on youtube', 'watch on youtube',
    'vidéo n\\'est pas disponible', 'vidéo indisponible', 'vidéo privée', 'n\\'est plus disponible',
    'non disponible dans votre pays', 'confirmez votre âge', 'erreur de configuration du lecteur',
    'regarder cette vidéo sur youtube', 'regarder sur youtube',
    'vídeo no disponible', 'vídeo privado', 'ya no está disponible', 'error de configuración del reproductor',
    'ver este video en youtube', 'ver en youtube'
  ];
  // La page d'erreur de YouTube se rend parfois de façon asynchrone (après
  // un contrôle JS interne) -- un seul contrôle ponctuel peut la manquer si
  // elle apparaît après coup (bug confirmé le 21/08/2026 : "ready" reçu
  // alors que l'utilisateur voyait bien l'écran d'erreur). Sondage répété
  // au lieu d'un contrôle unique.
  var checksLeft = 8;
  var interval = setInterval(function () {
    checksLeft--;
    var text = ((document.body && document.body.innerText) || '').toLowerCase();
    var matched = errorMarkers.find(function (m) { return text.indexOf(m) !== -1; });
    if (matched) {
      clearInterval(interval);
      post({ type: 'error', reason: matched });
    } else if (checksLeft <= 0) {
      clearInterval(interval);
      post({ type: 'ready' });
    }
  }, 700);
  true;
})();
`;

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#000' },
});
