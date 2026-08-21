import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBook, getBookChapters, updateBookProgress, addBookmark, getBookmarks, deleteBookmark } from '../data/database';
import { splitIntoSentences } from '../books/parsing';
import { translateSentence, isTranslationAvailable } from '../services/translate';
import type { Book, BookChapter, BookBookmark } from '../books/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; bookId: string; onExit: () => void };
type Styles = ReturnType<typeof createStyles>;

/**
 * Écran de lecture — chapitre courant, navigation entre chapitres,
 * reprise automatique à la dernière position (paragraphe, pas caractère
 * — voir docs/DECISIONS.md), signets manuels multiples, et traduction à
 * la volée au tap sur une phrase (DeepL, voir services/translate.ts).
 * Lecture libre, aucune interaction avec le moteur SM-2.
 */
export function ReaderScreen({ db, bookId, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const listRef = useRef<FlatList<string>>(null);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterListVisible, setChapterListVisible] = useState(false);
  const [bookmarksVisible, setBookmarksVisible] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [translation, setTranslation] = useState<{ sentence: string; result: string | null; loading: boolean } | null>(null);

  const currentParagraphIndexRef = useRef(0);
  // Index de paragraphe où faire défiler dès que la liste a fini de se
  // rendre — pour la reprise automatique ET le saut vers un signet, voir
  // `onScrollToIndexFailed` (les items de hauteur variable font parfois
  // échouer `scrollToIndex` avant que tout ait été mesuré).
  const pendingScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const [loadedBook, loadedChapters] = await Promise.all([getBook(db, bookId), getBookChapters(db, bookId)]);
      setBook(loadedBook);
      setChapters(loadedChapters);
      const startChapterId = loadedBook?.lastChapterId ?? loadedChapters[0]?.id ?? null;
      setCurrentChapterId(startChapterId);
      if (loadedBook?.lastChapterId && loadedBook.lastPosition > 0) {
        pendingScrollIndexRef.current = loadedBook.lastPosition;
      }
      setLoading(false);
    })();
  }, [db, bookId]);

  const currentChapter = chapters.find((c) => c.id === currentChapterId) ?? null;
  const currentIndex = currentChapter ? chapters.findIndex((c) => c.id === currentChapter.id) : -1;

  const paragraphs = useMemo(
    () => (currentChapter ? currentChapter.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : []),
    [currentChapter]
  );

  const saveProgress = useCallback(() => {
    if (!currentChapterId) return;
    updateBookProgress(db, bookId, currentChapterId, currentParagraphIndexRef.current).catch((err) => {
      console.log('[ReaderScreen] échec sauvegarde progression :', err instanceof Error ? err.message : String(err));
    });
  }, [db, bookId, currentChapterId]);

  // Sauvegarde à la sortie de l'écran et à chaque changement de
  // chapitre — pas à chaque frame de défilement, pour ne pas
  // multiplier les écritures SQLite pendant la lecture.
  useEffect(() => {
    return () => saveProgress();
  }, [saveProgress]);

  const goToChapter = useCallback((chapterId: string, scrollToIndex = 0) => {
    saveProgress();
    currentParagraphIndexRef.current = scrollToIndex;
    pendingScrollIndexRef.current = scrollToIndex;
    setCurrentChapterId(chapterId);
    setChapterListVisible(false);
    setBookmarksVisible(false);
  }, [saveProgress]);

  const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first && typeof first.index === 'number') {
      currentParagraphIndexRef.current = first.index;
    }
  }).current;

  const handleContentSizeChange = useCallback(() => {
    if (pendingScrollIndexRef.current !== null && pendingScrollIndexRef.current > 0) {
      const index = pendingScrollIndexRef.current;
      pendingScrollIndexRef.current = null;
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated: false });
      });
    }
  }, []);

  const handleBookmark = useCallback(async () => {
    if (!currentChapterId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addBookmark(db, { bookId, chapterId: currentChapterId, position: currentParagraphIndexRef.current, note: null });
  }, [db, bookId, currentChapterId]);

  const openBookmarks = useCallback(async () => {
    setBookmarks(await getBookmarks(db, bookId));
    setBookmarksVisible(true);
  }, [db, bookId]);

  const handleDeleteBookmark = useCallback(
    async (bookmarkId: string) => {
      await deleteBookmark(db, bookmarkId);
      setBookmarks(await getBookmarks(db, bookId));
    },
    [db, bookId]
  );

  const handleTapSentence = useCallback((sentence: string) => {
    if (!isTranslationAvailable()) {
      setTranslation({ sentence, result: null, loading: false });
      return;
    }
    setTranslation({ sentence, result: null, loading: true });
    translateSentence(sentence).then((result) => {
      setTranslation({ sentence, result, loading: false });
    });
  }, []);

  const renderParagraph = useCallback(
    ({ item }: { item: string }) => (
      <Text style={styles.paragraph}>
        {splitIntoSentences(item).map((sentence, i) => (
          <Text key={i} onPress={() => handleTapSentence(sentence)}>
            {sentence}{' '}
          </Text>
        ))}
      </Text>
    ),
    [styles, handleTapSentence]
  );

  if (loading || !book || !currentChapter) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit}>
          <Text style={styles.exitLink}>‹ Livres</Text>
        </TouchableOpacity>
        <Text style={styles.bookTitle} numberOfLines={1}>
          {book.title}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openBookmarks}>
            <Text style={styles.headerActionText}>Signets</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBookmark}>
            <Text style={styles.headerActionText}>+ Signet</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.chapterTitleRow} onPress={() => setChapterListVisible(true)}>
        <Text style={styles.chapterTitle} numberOfLines={1}>
          {currentChapter.title}
        </Text>
        <Text style={styles.chapterTitleHint}>Chapitres ▾</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={paragraphs}
        keyExtractor={(_, i) => `${currentChapter.id}_p${i}`}
        renderItem={renderParagraph}
        contentContainerStyle={styles.readerContent}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        onContentSizeChange={handleContentSizeChange}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
      />

      <View style={styles.navRow}>
        <AnimatedPressable
          style={[styles.navButton, currentIndex <= 0 && styles.navButtonDisabled]}
          haptic="none"
          disabled={currentIndex <= 0}
          onPress={() => goToChapter(chapters[currentIndex - 1].id)}
        >
          <Text style={styles.navButtonText}>‹ Précédent</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.navButton, currentIndex >= chapters.length - 1 && styles.navButtonDisabled]}
          haptic="none"
          disabled={currentIndex >= chapters.length - 1}
          onPress={() => goToChapter(chapters[currentIndex + 1].id)}
        >
          <Text style={styles.navButtonText}>Suivant ›</Text>
        </AnimatedPressable>
      </View>

      <Modal visible={chapterListVisible} animationType="slide" transparent onRequestClose={() => setChapterListVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chapitres</Text>
            <FlatList
              data={chapters}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.listRow} onPress={() => goToChapter(item.id)}>
                  <Text style={[styles.listRowText, item.id === currentChapterId && styles.listRowTextActive]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseLink} onPress={() => setChapterListVisible(false)}>
              <Text style={styles.exitLink}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={bookmarksVisible} animationType="slide" transparent onRequestClose={() => setBookmarksVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Signets</Text>
            {bookmarks.length === 0 ? (
              <Text style={styles.empty}>Aucun signet pour l'instant.</Text>
            ) : (
              <FlatList
                data={bookmarks}
                keyExtractor={(b) => b.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => {
                  const chapter = chapters.find((c) => c.id === item.chapterId);
                  return (
                    <View style={styles.listRow}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => goToChapter(item.chapterId, item.position)}>
                        <Text style={styles.listRowText} numberOfLines={1}>
                          {chapter?.title ?? item.chapterId}
                        </Text>
                        <Text style={styles.bookMeta}>{item.createdAt.toLocaleDateString()}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteBookmark(item.id)}>
                        <Text style={styles.deleteLink}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
            <TouchableOpacity style={styles.modalCloseLink} onPress={() => setBookmarksVisible(false)}>
              <Text style={styles.exitLink}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={translation !== null} animationType="fade" transparent onRequestClose={() => setTranslation(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setTranslation(null)}>
          <View style={styles.translationCard}>
            <Text style={styles.translationOriginal}>{translation?.sentence}</Text>
            <View style={styles.ticketDash} />
            {translation?.loading ? (
              <ActivityIndicator color={theme.buttonFilled} />
            ) : !isTranslationAvailable() ? (
              <Text style={styles.translationUnavailable}>
                Traduction non configurée — ajoute une clé DeepL dans .env (EXPO_PUBLIC_DEEPL_API_KEY, voir .env.example).
              </Text>
            ) : translation?.result ? (
              <Text style={styles.translationResult}>{translation.result}</Text>
            ) : (
              <Text style={styles.translationUnavailable}>Traduction indisponible pour le moment.</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.cardBackground },
    center: { flex: 1, backgroundColor: t.cardBackground, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
    },
    exitLink: { color: t.label, fontSize: 13, fontWeight: '600' },
    bookTitle: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', color: t.wordText, marginHorizontal: 8 },
    headerActions: { flexDirection: 'row', gap: 12 },
    headerActionText: { color: t.buttonOutline, fontSize: 12, fontWeight: '600' },

    chapterTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    chapterTitle: { flex: 1, fontFamily: 'Georgia', fontSize: 17, fontWeight: '600', color: t.wordText },
    chapterTitleHint: { fontSize: 12, color: t.metaText, marginLeft: 8 },

    readerContent: { paddingHorizontal: 20, paddingBottom: 24 },
    paragraph: { fontSize: 16, lineHeight: 26, color: t.wordText, marginBottom: 16 },

    navRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
    navButton: {
      flex: 1,
      height: 48,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navButtonDisabled: { opacity: 0.4 },
    navButtonText: { color: t.buttonOutline, fontWeight: '600', fontSize: 14 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: t.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
    modalTitle: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: t.wordText, marginBottom: 16 },
    modalCloseLink: { alignItems: 'center', paddingVertical: 14 },

    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    listRowText: { fontSize: 15, color: t.wordText },
    listRowTextActive: { fontWeight: '700', color: t.buttonOutline },
    bookMeta: { fontSize: 12, color: t.metaText, marginTop: 2 },
    deleteLink: { color: t.dot, fontSize: 12 },
    empty: { color: t.metaText, fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },

    translationCard: {
      backgroundColor: t.cardBackground,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 24,
      marginBottom: 40,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    translationOriginal: { fontSize: 16, fontWeight: '600', color: t.wordText },
    ticketDash: { borderTopWidth: 1.5, borderTopColor: t.ticketDash, borderStyle: 'dashed', marginVertical: 12 },
    translationResult: { fontSize: 16, color: t.translationText },
    translationUnavailable: { fontSize: 13, color: t.metaText, fontStyle: 'italic' },
  });
}
