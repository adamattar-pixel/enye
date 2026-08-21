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

  useImperativeHandle(ref, () => ({
    replay: () => {
      playerRef.current?.seekTo(startTime, true);
    },
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
          ref={playerRef}
          height={(width * 9) / 16}
          width={width}
          videoId={videoId}
          play
          initialPlayerParams={{
            start: Math.floor(startTime),
            end: Math.ceil(endTime),
            controls: true,
            rel: false,
            // Les sous-titres révéleraient la réponse avant que l'utilisateur
            // ait tapé ce qu'il a entendu — explicitement désactivés plutôt
            // que de compter sur le défaut de la librairie (demandé
            // explicitement, l'utilisateur devait sinon les couper à la main).
            showClosedCaptions: false,
          }}
          // `showClosedCaptions: false` (cc_load_policy=0) ne fait que ne
          // pas FORCER l'affichage — la doc officielle de l'API YouTube
          // indique que si une préférence "sous-titres activés" existe déjà
          // (ex. cookie persistant après un CC activé manuellement une fois
          // dans cette WebView), aucun paramètre ne peut la forcer à
          // désactivé. `incognito` empêche cette persistance entre les
          // sessions de lecture (signalé le 21/08/2026 : sous-titres actifs
          // dès le lancement malgré `showClosedCaptions: false`).
          webViewProps={{ incognito: true }}
          onReady={() => onReady?.()}
          onChangeState={handleChangeState}
          onError={handleError}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
});
