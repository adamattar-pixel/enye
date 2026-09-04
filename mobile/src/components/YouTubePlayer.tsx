import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

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
   * résilience de docs/PLAN.md — vidéo bloquée à l'intégration, région,
   * etc.) — à afficher comme message simple côté appelant, pas de
   * tentative de contournement ici. */
  onError?: () => void;
};

/**
 * Remplace `react-native-youtube-iframe` (WebView, Decision 014) lors du
 * passage à la cible desktop — voir docs/DECISIONS.md Decision 016 : sur
 * un vrai navigateur/Electron, le renderer EST déjà un contexte web, donc
 * l'API JS officielle "IFrame Player" de YouTube (`youtube.com/iframe_api`)
 * s'utilise directement, sans wrapper WebView du tout — une vraie
 * simplification par rapport au mobile, pas juste un portage à l'identique.
 *
 * Reprend la même technique de fond que l'ancien `buildPlayerFixupScript`
 * (Decision 014) pour ce qui reste possible depuis un contexte cross-origin
 * standard : `player.seekTo`/`getCurrentTime` (précision à la milliseconde,
 * les paramètres `start`/`end` de l'API n'acceptant que des secondes
 * entières) et `player.unloadModule('captions')`/`setOption('captions',
 * 'track', {})` pour les sous-titres. Le repli par clic DOM sur le bouton
 * CC (`.ytp-subtitles-button`) n'a PAS de portage possible ici : ce bouton
 * vit dans le DOM d'un iframe cross-origin (`youtube.com`), inaccessible
 * depuis la page hôte par la politique same-origin du navigateur — c'est
 * exactement la même contrainte que celle qui a forcé la réécriture du
 * mécanisme de sous-titres (voir `electron/captionsFetcher.ts`). Si les
 * appels officiels ci-dessus s'avèrent insuffisants seuls (comme ils
 * l'avaient été sur WebView iOS), il n'y a pas de filet de sécurité
 * équivalent disponible sur cette cible — **non vérifié visuellement**,
 * seul le fait que le composant compile et que le player se charge a été
 * établi (voir docs/AUDIT.md).
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, startTime, endTime, onReady, onSegmentEnded, onError },
  ref
) {
  const containerRef = useRef<View>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [width, setWidth] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  // WebKit/Chromium bloque l'autoplay avec son sans geste utilisateur
  // direct, mais autorise l'autoplay MUET — même contournement que côté
  // mobile (Decision 014) : démarrer muet, démuter dès que la lecture a
  // réellement commencé.
  const mutedRef = useRef(true);
  const hasUnmutedRef = useRef(false);

  useEffect(() => {
    hasUnmutedRef.current = false;
    mutedRef.current = true;
  }, [replayKey, videoId]);

  useImperativeHandle(ref, () => ({
    replay: () => setReplayKey((k) => k + 1),
  }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (width <= 0) return;
    let disposed = false;
    let endCheckInterval: ReturnType<typeof setInterval> | null = null;
    let captionsInterval: ReturnType<typeof setInterval> | null = null;

    function disableCaptions(p: YTPlayer): void {
      try {
        p.unloadModule?.('captions');
      } catch {
        // ignore
      }
      try {
        p.setOption?.('captions', 'track', {});
      } catch {
        // ignore
      }
    }

    function createPlayer(): void {
      if (disposed) return;
      const node = containerRef.current as unknown as HTMLElement | null;
      const YT = window.YT;
      if (!node || !YT) return;

      // eslint-disable-next-line new-cap
      const player = new YT.Player(node, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          start: Math.floor(startTime),
          end: Math.ceil(endTime),
          controls: 0,
          rel: 0,
          cc_load_policy: 0,
          autoplay: 1,
          mute: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (disposed) return;
            try {
              player.seekTo(startTime, true);
            } catch {
              // ignore
            }
            disableCaptions(player);
            captionsInterval = setInterval(() => disableCaptions(player), 1000);
            endCheckInterval = setInterval(() => {
              try {
                if (player.getCurrentTime() >= endTime) player.pauseVideo();
              } catch {
                // ignore
              }
            }, 200);
            onReady?.();
          },
          onStateChange: (event: { data: number }) => {
            // 1 = YT.PlayerState.PLAYING, 0 = ENDED (constantes officielles,
            // pas de dépendance ajoutée juste pour ces deux entiers stables).
            if (event.data === 1 && !hasUnmutedRef.current) {
              hasUnmutedRef.current = true;
              try {
                player.unMute();
              } catch {
                // ignore
              }
            }
            if (event.data === 0) onSegmentEnded?.();
          },
          onError: () => onError?.(),
        },
      });
      playerRef.current = player;
    }

    loadYouTubeIframeApi().then(() => {
      if (!disposed) createPlayer();
    });

    return () => {
      disposed = true;
      if (endCheckInterval) clearInterval(endCheckInterval);
      if (captionsInterval) clearInterval(captionsInterval);
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, replayKey, videoId, startTime, endTime]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {width > 0 && <View key={replayKey} ref={containerRef} style={styles.playerNode} />}
    </View>
  );
});

// MARK: - Chargement de l'API IFrame officielle

type YTPlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  pauseVideo: () => void;
  unMute: () => void;
  unloadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<void> | null = null;

/** L'API IFrame s'appelle `window.onYouTubeIframeAPIReady` elle-même une
 * fois chargée — mémoïsé en promesse partagée pour n'injecter le
 * `<script>` qu'une seule fois même si plusieurs `YouTubePlayer` montent
 * en même temps. */
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return iframeApiPromise;
}

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
  playerNode: { width: '100%', height: '100%' },
});
