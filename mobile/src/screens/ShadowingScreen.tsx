import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LexisDb } from '../data/dbTypes';
import { getListeningVideoSegments } from '../data/database';
import type { ListeningSegment } from '../listening/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { YouTubePlayer, type YouTubePlayerHandle } from '../components/YouTubePlayer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb; videoId: string; videoTitle: string; onExit: () => void };

/**
 * Mode "Répétition" (demandé le 13/09/2026) — lecture libre, PAS de
 * moteur SM-2 (même statut que `ReaderScreen.tsx` pour les livres) : la
 * vidéo entière se joue phrase par phrase dans l'ordre de ses
 * sous-titres, pause automatique à la fin de chaque segment pour laisser
 * le temps de répéter la phrase à voix haute, puis reprise manuelle au
 * clic sur "Continuer" — pas d'avance automatique, le but étant de
 * répéter à son propre rythme, pas de suivre celui de la vidéo.
 */
export function ShadowingScreen({ db, videoId, videoTitle, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const [segments, setSegments] = useState<ListeningSegment[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState(false);

  useEffect(() => {
    (async () => {
      setSegments(await getListeningVideoSegments(db, videoId));
      setLoading(false);
    })();
  }, [db, videoId]);

  const current = segments[index] ?? null;
  const finished = !loading && segments.length > 0 && index >= segments.length;

  const handleContinue = () => {
    setPaused(false);
    setIndex((i) => i + 1);
  };

  const handleRestart = () => {
    setPaused(false);
    setIndex(0);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  if (segments.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Cette vidéo n'a aucun sous-titre exploitable pour la répétition.</Text>
        <AnimatedPressable style={styles.exitButton} haptic="none" onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </AnimatedPressable>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Vidéo terminée — {segments.length} phrase{segments.length !== 1 ? 's' : ''} répétée{segments.length !== 1 ? 's' : ''}.</Text>
        <AnimatedPressable style={styles.primaryButton} haptic="none" onPress={handleRestart}>
          <Text style={styles.primaryButtonText}>↻ Recommencer</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.exitButton} haptic="none" onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </AnimatedPressable>
      </SafeAreaView>
    );
  }

  if (!current) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS · RÉPÉTITION</Text>
        <Text style={styles.progress}>
          {index + 1} / {segments.length}
        </Text>
      </View>

      {/* Filet de sécurité au cas où le contenu déborde encore malgré le
       * plafond de largeur du lecteur (YouTubePlayer.tsx) — voir le même
       * correctif sur ListeningReviewScreen.tsx. */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {videoTitle}
        </Text>

        {playerError ? (
          <View style={styles.playerErrorBox}>
            <Text style={styles.playerErrorText}>La lecture intégrée n'a pas pu démarrer.</Text>
          </View>
        ) : (
          <YouTubePlayer
            ref={playerRef}
            // Remonte le lecteur à chaque segment plutôt que de laisser les
            // props seules déclencher la mise à jour — évite tout état
            // fantôme (ex. `segmentEndedNotified` d'un sondage précédent)
            // qui survivrait entre deux phrases très rapprochées.
            key={current.id}
            videoId={videoId}
            startTime={current.startTime}
            endTime={current.endTime}
            onSegmentEnded={() => setPaused(true)}
            onError={() => setPlayerError(true)}
          />
        )}

        <FadeInView duration={250} style={styles.transcriptBlock}>
          <Text style={styles.transcriptText}>{current.transcript}</Text>
        </FadeInView>

        <View style={styles.rowButtons}>
          <AnimatedPressable style={styles.replayButton} haptic="none" onPress={() => playerRef.current?.replay()}>
            <Text style={styles.replayButtonText}>↻ Réécouter</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.primaryButton, !paused && styles.buttonDisabled]}
            haptic="none"
            disabled={!paused}
            onPress={handleContinue}
          >
            <Text style={styles.primaryButtonText}>Continuer ›</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>

      <AnimatedPressable style={styles.exitLink} haptic="none" onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Écoute</Text>
      </AnimatedPressable>
    </SafeAreaView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.cardBackground, paddingHorizontal: 22, paddingTop: 16 },
    scrollContent: { flexGrow: 1, justifyContent: 'center' },
    center: { flex: 1, backgroundColor: t.cardBackground, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    progress: { fontSize: 12, fontWeight: '600', color: t.metaText },
    videoTitle: { fontSize: 14, fontWeight: '600', color: t.wordText, marginBottom: 14 },
    playerErrorBox: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 20,
      alignItems: 'center',
      aspectRatio: 16 / 9,
      justifyContent: 'center',
    },
    playerErrorText: { fontSize: 13, color: t.metaText, textAlign: 'center', lineHeight: 18 },
    transcriptBlock: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 18,
      marginTop: 18,
      minHeight: 72,
      justifyContent: 'center',
    },
    transcriptText: { fontSize: 18, fontWeight: '700', color: t.translationText, textAlign: 'center' },
    rowButtons: { flexDirection: 'row', gap: 12, marginTop: 18 },
    replayButton: {
      flex: 1,
      height: 52,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replayButtonText: { color: t.buttonOutline, fontWeight: '600', fontSize: 14 },
    primaryButton: {
      flex: 1,
      height: 52,
      borderRadius: 24,
      backgroundColor: t.buttonFilled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 14 },
    buttonDisabled: { opacity: 0.4 },
    exitLink: { alignItems: 'center', paddingVertical: 16 },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center' },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
