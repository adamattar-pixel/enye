import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { searchYoutubeVideos, type YoutubeSearchResult } from '../listening/search';
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
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setVideos(await getListeningVideosWithStats(db));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setSearchError(null);
    setAddError(null);

    // Coller un lien direct dans la barre de recherche va droit à cette
    // vidéo (comme sur YouTube) plutôt que de la traiter comme des
    // mots-clés — on connaît déjà précisément l'identifiant, pas besoin
    // de passer par la recherche non officielle pour ce cas.
    const directId = extractVideoId(trimmed);
    if (directId) {
      const metadata = await fetchVideoMetadata(directId);
      setSearching(false);
      if (!metadata) {
        setSearchResults([]);
        setSearchError('Impossible de récupérer les informations de cette vidéo.');
        return;
      }
      setSearchResults([{ videoId: directId, title: metadata.title, channel: metadata.channel, thumbnailUrl: metadata.thumbnailUrl, lengthText: null }]);
      return;
    }

    const results = await searchYoutubeVideos(trimmed);
    setSearching(false);
    setSearchResults(results);
    if (results.length === 0) {
      setSearchError('Aucun résultat — réessaie avec d’autres mots-clés.');
    }
  };

  const handleAddResult = async (result: YoutubeSearchResult) => {
    if (videos.some((v) => v.id === result.videoId)) {
      setAddError('Cette vidéo est déjà dans ta bibliothèque.');
      return;
    }

    setAddingId(result.videoId);
    setAddError(null);
    try {
      const captions = await fetchVideoCaptions(result.videoId);
      const video: ListeningVideo = {
        id: result.videoId,
        title: result.title,
        channel: result.channel,
        thumbnailUrl: result.thumbnailUrl,
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

      setSearchResults((prev) => prev.filter((r) => r.videoId !== result.videoId));
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
      setAddingId(null);
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

  // Un seul FlatList pour tout l'écran (formulaire de recherche +
  // résultats + bibliothèque), plutôt que les résultats de recherche
  // posés dans une `View` séparée au-dessus d'un `FlatList` distinct —
  // signalé cassé (le scroll ne fonctionnait pas sur les résultats de
  // recherche, hors de toute zone défilante) et "pas smooth" (deux
  // gestionnaires de défilement qui se marchaient dessus). Le formulaire
  // + les résultats vivent maintenant dans `ListHeaderComponent`, qui
  // défile avec le reste dans le même `FlatList` natif.
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.libraryListContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={styles.addForm}>
              <TextInput
                style={styles.addInput}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Rechercher une vidéo en espagnol…"
                editable={!searching}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <AnimatedPressable
                style={[styles.addButton, (searching || !query.trim()) && styles.buttonDisabled]}
                haptic="none"
                disabled={searching || !query.trim()}
                onPress={handleSearch}
              >
                {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>🔍</Text>}
              </AnimatedPressable>
            </View>
            {searchError && <Text style={styles.addError}>{searchError}</Text>}
            {addError && <Text style={styles.addError}>{addError}</Text>}

            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((result) => (
                  <View key={result.videoId} style={styles.searchResultRow}>
                    {result.thumbnailUrl ? <Image source={{ uri: result.thumbnailUrl }} style={styles.searchResultThumb} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.videoTitle} numberOfLines={2}>
                        {result.title}
                      </Text>
                      <Text style={styles.videoMeta}>
                        {result.channel}
                        {result.lengthText ? ` · ${result.lengthText}` : ''}
                      </Text>
                    </View>
                    <AnimatedPressable
                      style={[styles.addResultButton, addingId === result.videoId && styles.buttonDisabled]}
                      haptic="none"
                      disabled={addingId === result.videoId}
                      onPress={() => handleAddResult(result)}
                    >
                      {addingId === result.videoId ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.addResultButtonText}>+</Text>
                      )}
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.librarySectionTitle}>Ta bibliothèque</Text>
          </>
        }
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
          <Text style={styles.trainingHint}>Aucune vidéo pour l'instant — recherche une vidéo ci-dessus pour commencer.</Text>
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
    addButtonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },
    addError: { fontSize: 12, color: t.dot, marginTop: 8, lineHeight: 16 },

    searchResults: { marginTop: 14, gap: 10 },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 10,
    },
    searchResultThumb: { width: 64, height: 48, borderRadius: 8, backgroundColor: t.cardBorder },
    addResultButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.buttonFilled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addResultButtonText: { color: t.buttonFilledText, fontWeight: '700', fontSize: 18, lineHeight: 20 },

    librarySectionTitle: { fontSize: 13, fontWeight: '600', color: t.metaText, marginTop: 22, marginBottom: 4 },
    libraryListContent: { paddingTop: 8, paddingBottom: 60 },
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
