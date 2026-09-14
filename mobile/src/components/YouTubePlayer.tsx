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
  /** Appelé une seule fois quand la lecture atteint `endTime` (segment
   * terminé) — déclenché par le même sondage à 200ms qui appelle déjà
   * `pauseVideo()` ci-dessous, PAS par l'évènement `onStateChange` "ENDED"
   * de l'API IFrame : ce dernier ne se déclenche fiablement que si la
   * vidéo entière se termine, pas quand le paramètre `end` interrompt un
   * segment en plein milieu (comportement documenté comme incohérent
   * selon les navigateurs) — s'y fier exclusivement aurait laissé
   * `onSegmentEnded` ne jamais s'appeler pour un usage en plein milieu de
   * vidéo. */
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
  // WebKit/Chromium bloque l'autoplay avec son sans geste utilisateur
  // direct, mais autorise l'autoplay MUET — même contournement que côté
  // mobile (Decision 014) : démarrer muet, démuter dès que la lecture a
  // réellement commencé.
  const hasUnmutedRef = useRef(false);
  // Partagé avec `notifySegmentEnded` (dans l'effet ci-dessous) plutôt
  // qu'une variable locale à l'effet : `replay()` doit pouvoir le
  // réarmer, pour qu'un segment déjà terminé puisse à nouveau signaler sa
  // fin après un "Réécouter" (sinon `onSegmentEnded` ne se redéclencherait
  // jamais une deuxième fois pour le même segment).
  const segmentEndedNotifiedRef = useRef(false);

  // `seekTo` + `playVideo` sur l'instance EXISTANTE, jamais un
  // démontage/remontage du conteneur — bug réel confirmé le 14/09/2026
  // ("le bouton réécouter fait crash l'application") : la version
  // précédente forçait un remontage complet via `key={replayKey}`, or
  // `new YT.Player(node, ...)` REMPLACE `node` par son propre `<iframe>`
  // dans le vrai DOM (comportement documenté de l'API IFrame, pas un
  // détail d'implémentation) — React continue de croire que CE `<View>`
  // lui appartient encore. Au remontage suivant, la tentative de React de
  // retirer ce nœud (déjà remplacé par YouTube) plantait tout l'arbre,
  // sans limite de dégâts (aucun error boundary) : `Uncaught NotFoundError:
  // Failed to execute 'removeChild' ... the node to be removed is not a
  // child of this node`, page blanche. Les transitions normales entre
  // segments (`startTime`/`endTime` qui changent) n'ont jamais ce problème
  // — la `key` du conteneur ne change pas, donc React ne tente jamais de
  // retirer ce nœud lui-même.
  useImperativeHandle(ref, () => ({
    replay: () => {
      const player = playerRef.current;
      if (!player) return;
      segmentEndedNotifiedRef.current = false;
      try {
        player.seekTo(startTime, true);
        player.playVideo();
      } catch {
        // ignore
      }
    },
  }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (width <= 0) return;
    let disposed = false;
    let endCheckInterval: ReturnType<typeof setInterval> | null = null;
    let captionsInterval: ReturnType<typeof setInterval> | null = null;
    segmentEndedNotifiedRef.current = false;

    function notifySegmentEnded(): void {
      if (segmentEndedNotifiedRef.current) return;
      segmentEndedNotifiedRef.current = true;
      onSegmentEnded?.();
    }

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
                if (player.getCurrentTime() >= endTime) {
                  player.pauseVideo();
                  notifySegmentEnded();
                }
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
            // Filet de secours si la vraie fin de vidéo est atteinte avant
            // `endTime` (segment couvrant la toute fin) — le sondage
            // ci-dessus ne se déclencherait alors jamais puisque la
            // lecture s'arrête d'elle-même sans jamais dépasser `endTime`.
            if (event.data === 0) notifySegmentEnded();
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
  }, [width, videoId, startTime, endTime]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {width > 0 && <View ref={containerRef} style={styles.playerNode} />}
    </View>
  );
});

// MARK: - Chargement de l'API IFrame officielle

type YTPlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
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
  // `maxWidth: 480` — bug réel signalé le 13/09/2026 ("le lecteur youtube
  // est trop grand, je vois même pas le champ texte") : sans plafond, la
  // largeur `100%` se résout contre la carte qui l'englobe, elle-même sans
  // limite propre — sur une fenêtre desktop de 1280px, ça donnait un
  // lecteur ~1180×664px, débordant largement la fenêtre entière (aucun
  // `ScrollView` dans ces écrans) et poussant le champ de saisie hors
  // écran, invisible et inatteignable. 480px de large (donc 270px de haut
  // en 16:9) reste largement lisible tout en laissant la place au reste de
  // la carte quelle que soit la largeur de fenêtre.
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden',
  },
  playerNode: { width: '100%', height: '100%' },
});
