import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LexisDb } from '../data/dbTypes';
import {
  getDueListeningCardsSplit,
  getRecentListeningVideoIds,
  getListeningVideos,
  updateListeningCard,
  logListeningReview,
  type DueListeningCardRow,
} from '../data/database';
import { getSettings } from '../data/settings';
import { selectEligibleVideoIds, pickRandomVideo, pickRandomSegment, VIDEO_COOLDOWN } from '../listening/selection';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ListeningReviewScreen } from './ListeningReviewScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb; onExit: () => void };

/**
 * Écran de session pour l'onglet Écoute — même rôle que
 * [ConjugationReviewContainer.tsx](./ConjugationReviewContainer.tsx),
 * mais avec une sélection en deux temps (vidéo puis segment, voir
 * docs/PLAN.md "Sélection aléatoire : cooldown vidéo puis segment") que ni le
 * vocabulaire ni la conjugaison n'ont besoin de faire.
 *
 * `recentVideoIdsRef` porte l'historique "récemment utilisé" en mémoire
 * pendant toute la session, du plus récent au plus ancien — amorcé une
 * fois au montage depuis l'historique persisté
 * (`getRecentListeningVideoIds`), puis mis à jour localement à chaque
 * note plutôt que rechargé depuis la base à chaque exercice : le
 * cooldown doit tenir compte des exercices FAITS PENDANT cette session,
 * pas seulement de ceux d'avant (voir `database.ts`, commentaire sur
 * `getDueListeningCardsSplit`).
 */
export function ListeningReviewContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueListeningCardRow | null>(null);
  const [videoTitles, setVideoTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const recentVideoIdsRef = useRef<string[]>([]);

  const loadNext = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueListeningCardsSplit(db, new Date(), settings);
    if (due.length === 0) {
      setCurrent(null);
      return;
    }

    const dueVideoIds = [...new Set(due.map((row) => row.videoId))];
    const eligible = selectEligibleVideoIds(dueVideoIds, recentVideoIdsRef.current, VIDEO_COOLDOWN);
    const chosenVideoId = pickRandomVideo(eligible);
    if (!chosenVideoId) {
      setCurrent(null);
      return;
    }

    const segmentsForVideo = due.filter((row) => row.videoId === chosenVideoId);
    setCurrent(pickRandomSegment(segmentsForVideo));
  }, [db]);

  useEffect(() => {
    (async () => {
      const [videos, recent] = await Promise.all([getListeningVideos(db), getRecentListeningVideoIds(db, VIDEO_COOLDOWN)]);
      setVideoTitles(Object.fromEntries(videos.map((v) => [v.id, v.title])));
      recentVideoIdsRef.current = recent;
      await loadNext();
      setLoading(false);
    })();
  }, [db, loadNext]);

  const handleGrade = useCallback(
    async (grade: SM2Grade) => {
      if (!current) return;
      const now = new Date();
      const nextState = review(current.card, grade, now);
      await updateListeningCard(db, current.cardId, nextState);
      await logListeningReview(db, current.cardId, grade, now);

      recentVideoIdsRef.current = [current.videoId, ...recentVideoIdsRef.current.filter((id) => id !== current.videoId)].slice(
        0,
        VIDEO_COOLDOWN
      );

      await loadNext();
    },
    [db, current, loadNext]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucun segment dû pour l'instant — bravo !</Text>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ListeningReviewScreen
        // Remonte le composant à chaque nouveau segment pour rejouer
        // l'animation d'entrée, réinitialiser le champ de saisie et
        // recharger le lecteur avec la nouvelle vidéo/plage.
        key={current.cardId}
        card={{
          videoId: current.videoId,
          videoTitle: videoTitles[current.videoId] ?? '',
          startTime: current.startTime,
          endTime: current.endTime,
          transcript: current.transcript,
        }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Écoute</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    center: { flex: 1, backgroundColor: t.cardBackground, alignItems: 'center', justifyContent: 'center', padding: 20 },
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center', marginBottom: 16 },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
    exitLink: { alignItems: 'center', paddingVertical: 14, backgroundColor: t.cardBackground },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
  });
}
