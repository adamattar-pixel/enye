import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getDueListeningCardsSplit,
  getListeningCounts,
  getListeningVideosWithStats,
  addListeningVideo,
  deleteListeningVideo,
  type ListeningVideoWithStats,
} from '../data/database';
import { getSettings } from '../data/settings';
import { extractVideoId } from '../listening/youtubeUrl';
import { fetchVideoMetadata } from '../listening/metadata';
import { fetchVideoCaptions } from '../listening/captions';
import type { CaptionStatus, ListeningVideo } from '../listening/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onStartSession: () => void };
type SubView = 'training' | 'library';
type Styles = ReturnType<typeof createStyles>;

/** Onglet Écoute (compréhension orale) : entraînement SM-2 sur des
 * segments de vidéos YouTube ajoutées par l'utilisateur, et bibliothèque
 * pour gérer ces vidéos — deux sous-onglets, même patron que
 * ConjugationScreen.tsx. Pas de sous-onglet Historique/Règles ici (hors
 * périmètre de la mission d'origine, à ajouter plus tard si demandé). */
export function ListeningScreen({ db, onStartSession }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('training');

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Écoute</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Entraînement" active={subView === 'training'} onPress={() => setSubView('training')} />
          <SubTabButton styles={styles} label="Bibliothèque" active={subView === 'library'} onPress={() => setSubView('library')} />
        </View>
      </View>

      {subView === 'training' && <TrainingView db={db} styles={styles} onStartSession={onStartSession} />}
      {subView === 'library' && <LibraryView db={db} styles={styles} />}
    </ScreenContainer>
  );
}

function SubTabButton({ styles, label, active, onPress }: { styles: Styles; label: string; active: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable
      style={[styles.subTabButton, active && styles.subTabButtonActive]}
      haptic="none"
      scaleTo={0.94}
      onPress={onPress}
    >
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

// MARK: - Entraînement

function TrainingView({ db, styles, onStartSession }: { db: SQLiteDatabase; styles: Styles; onStartSession: () => void }) {
  const [dueCount, setDueCount] = useState(0);
  const [learned, setLearned] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const [due, counts] = await Promise.all([getDueListeningCardsSplit(db, new Date(), settings), getListeningCounts(db)]);
    setDueCount(due.length);
    setLearned(counts.learned);
    setTotal(counts.total);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return null;

  if (total === 0) {
    return (
      <View style={styles.trainingContent}>
        <Text style={styles.trainingHint}>
          Aucune vidéo dans ta bibliothèque pour l'instant. Va dans l'onglet Bibliothèque pour ajouter une vidéo
          YouTube en espagnol et commencer à t'entraîner.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.trainingContent}>
      <FadeInView duration={400} style={styles.statCard}>
        <Text style={styles.statNumber}>
          {learned} <Text style={styles.statNumberTotal}>/ {total}</Text>
        </Text>
        <Text style={styles.statCaption}>segment{learned !== 1 ? 's' : ''} acquis{learned !== 1 ? 's' : ''}</Text>
      </FadeInView>

      <Text style={styles.trainingHint}>
        Un segment de vidéo se joue, tape ce que tu as entendu — la même vidéo ne revient pas plusieurs fois de
        suite.
      </Text>

      <FadeInView duration={400} delay={100}>
        <AnimatedPressable
          style={[styles.button, dueCount === 0 && styles.buttonDisabled]}
          onPress={onStartSession}
          disabled={dueCount === 0}
        >
          <Text style={styles.buttonText}>{dueCount === 0 ? 'Rien à réviser' : 'Commencer la session'}</Text>
        </AnimatedPressable>
      </FadeInView>
    </View>
  );
}

// MARK: - Bibliothèque

const CAPTION_STATUS_LABELS: Record<CaptionStatus, string> = {
  available: 'Sous-titres manuels',
  auto_generated: 'Sous-titres auto',
  unavailable: 'Sous-titres indisponibles',
};

function LibraryView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [videos, setVideos] = useState<ListeningVideoWithStats[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setVideos(await getListeningVideosWithStats(db));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      setAddError("URL YouTube non reconnue — colle un lien de la forme youtube.com/watch?v=... ou youtu.be/...");
      return;
    }
    if (videos.some((v) => v.id === videoId)) {
      setAddError('Cette vidéo est déjà dans ta bibliothèque.');
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const metadata = await fetchVideoMetadata(videoId);
      if (!metadata) {
        setAddError("Impossible de récupérer les informations de cette vidéo — vérifie le lien ou réessaie plus tard.");
        return;
      }

      const captions = await fetchVideoCaptions(videoId);
      const video: ListeningVideo = {
        id: videoId,
        title: metadata.title,
        channel: metadata.channel,
        thumbnailUrl: metadata.thumbnailUrl,
        durationSeconds: null,
        language: captions.language,
        captionStatus: captions.status,
        addedAt: new Date().toISOString(),
      };
      await addListeningVideo(
        db,
        video,
        captions.segments.map((s) => ({ startTime: s.startTime, endTime: s.endTime, transcript: s.transcript }))
      );

      setUrl('');
      await refresh();

      if (captions.status === 'unavailable') {
        Alert.alert(
          'Vidéo ajoutée, sans sous-titres exploitables',
          "Cette vidéo est dans ta bibliothèque mais aucun sous-titre espagnol n'a pu être récupéré — elle ne sera pas proposée en entraînement tant que ça reste le cas."
        );
      }
    } catch {
      setAddError('Erreur réseau — réessaie dans un instant.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (video: ListeningVideoWithStats) => {
    Alert.alert('Supprimer cette vidéo ?', video.title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteListeningVideo(db, video.id);
          await refresh();
        },
      },
    ]);
  };

  if (loading) return null;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.addForm}>
        <TextInput
          style={styles.addInput}
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setAddError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Lien YouTube (en espagnol)…"
          editable={!adding}
        />
        <AnimatedPressable
          style={[styles.addButton, (adding || !url.trim()) && styles.buttonDisabled]}
          haptic="none"
          disabled={adding || !url.trim()}
          onPress={handleAdd}
        >
          {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>Ajouter</Text>}
        </AnimatedPressable>
      </View>
      {addError && <Text style={styles.addError}>{addError}</Text>}

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.libraryListContent}
        renderItem={({ item, index }) => (
          <FadeInView duration={220} direction="right" delay={Math.min(index, 12) * 20} style={styles.videoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.videoMeta}>
                {item.channel} · {item.segmentCount} segment{item.segmentCount !== 1 ? 's' : ''}
              </Text>
              <View style={[styles.captionBadge, item.captionStatus === 'unavailable' && styles.captionBadgeUnavailable]}>
                <Text style={styles.captionBadgeText}>{CAPTION_STATUS_LABELS[item.captionStatus]}</Text>
              </View>
            </View>
            <AnimatedPressable style={styles.deleteButton} haptic="none" onPress={() => handleDelete(item)}>
              <Text style={styles.deleteButtonText}>×</Text>
            </AnimatedPressable>
          </FadeInView>
        )}
        ListEmptyComponent={
          <Text style={styles.trainingHint}>Aucune vidéo pour l'instant — colle un lien YouTube ci-dessus pour commencer.</Text>
        }
      />
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    header: { paddingTop: 20, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },
    subTabs: { flexDirection: 'row', gap: 8 },
    subTabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.translationBackground },
    subTabButtonActive: { backgroundColor: t.buttonFilled },
    subTabText: { color: t.wordText, fontWeight: '600', fontSize: 13 },
    subTabTextActive: { color: t.buttonFilledText },

    trainingContent: { flex: 1, paddingTop: 16 },
    statCard: { backgroundColor: t.translationBackground, borderRadius: 16, paddingVertical: 28, alignItems: 'center', marginBottom: 16 },
    statNumber: { fontSize: 44, fontWeight: '700', color: t.wordText },
    statNumberTotal: { fontSize: 22, fontWeight: '600', color: t.metaText },
    statCaption: { fontSize: 14, color: t.metaText, marginTop: 4 },
    trainingHint: { fontSize: 13, color: t.metaText, lineHeight: 18, marginBottom: 24, marginTop: 8 },
    button: { backgroundColor: t.buttonFilled, paddingVertical: 16, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },

    addForm: { flexDirection: 'row', gap: 8, paddingTop: 16 },
    addInput: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: t.wordText,
      backgroundColor: t.cardBackground,
    },
    addButton: {
      backgroundColor: t.buttonFilled,
      borderRadius: 14,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 14 },
    addError: { fontSize: 12, color: t.dot, marginTop: 8, lineHeight: 16 },

    libraryListContent: { paddingTop: 16, paddingBottom: 60 },
    videoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    videoTitle: { fontSize: 15, fontWeight: '600', color: t.wordText },
    videoMeta: { fontSize: 12, color: t.metaText, marginTop: 2 },
    captionBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.translationBackground,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginTop: 6,
    },
    captionBadgeUnavailable: { backgroundColor: 'rgba(181,83,60,0.15)' },
    captionBadgeText: { fontSize: 11, fontWeight: '600', color: t.metaText },
    deleteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    deleteButtonText: { fontSize: 22, color: t.metaText, fontWeight: '400' },
  });
}
