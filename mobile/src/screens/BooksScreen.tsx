import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LexisDb } from '../data/dbTypes';
import { getBooks, createBook, deleteBook } from '../data/database';
import { downloadAndParseBook, searchBooks, type BookSearchResult } from '../services/bookImportIpc';
import type { Book } from '../books/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb; onOpenBook: (bookId: string) => void };
type Styles = ReturnType<typeof createStyles>;
type AddMode = 'url' | 'search';

const FORMAT_LABELS: Record<Book['format'], string> = { epub: 'EPUB', txt: 'TXT', html: 'HTML' };

/** Onglet Livres — lecture libre, INDÉPENDANTE du moteur SM-2 (pas de
 * carte de révision, demandé explicitement le 21/08/2026). Deux modes
 * d'ajout (URL directe ou recherche Open Library/Internet Archive), voir
 * `services/bookImport.ts`. Suppression via un bouton dédié par livre —
 * PAS intégrée à "Réinitialiser ma progression" (Réglages), qui ne
 * concerne que la progression SM-2 des autres domaines. */
export function BooksScreen({ db, onOpenBook }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);

  const refresh = useCallback(async () => {
    setBooks(await getBooks(db));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    (book: Book) => {
      Alert.alert('Supprimer ce livre ?', `« ${book.title} » et sa progression de lecture seront définitivement supprimés.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteBook(db, book.id);
            refresh();
          },
        },
      ]);
    },
    [db, refresh]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Book; index: number }) => (
      <BookRow item={item} index={index} styles={styles} onOpen={() => onOpenBook(item.id)} onDelete={handleDelete} />
    ),
    [styles, onOpenBook, handleDelete]
  );

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Livres</Text>
      </View>

      {!loading &&
        (books.length === 0 ? (
          <Text style={styles.empty}>Aucun livre pour l'instant — ajoute-en un pour commencer à lire.</Text>
        ) : (
          <FlatList style={{ flex: 1 }} data={books} keyExtractor={bookKeyExtractor} contentContainerStyle={styles.listContent} renderItem={renderItem} />
        ))}

      <FadeInView duration={300} style={styles.fabWrapper}>
        <AnimatedPressable style={styles.fab} onPress={() => setAddVisible(true)}>
          <Text style={styles.fabText}>+ Ajouter un livre</Text>
        </AnimatedPressable>
      </FadeInView>

      <AddBookModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onAdded={async () => {
          setAddVisible(false);
          await refresh();
        }}
        db={db}
        styles={styles}
      />
    </ScreenContainer>
  );
}

const bookKeyExtractor = (b: Book) => b.id;

const BookRow = memo(function BookRow({
  item,
  index,
  styles,
  onOpen,
  onDelete,
}: {
  item: Book;
  index: number;
  styles: Styles;
  onOpen: () => void;
  onDelete: (book: Book) => void;
}) {
  return (
    <FadeInView duration={220} direction="right" delay={Math.min(index, 12) * 20} style={styles.bookRow}>
      <AnimatedPressable style={{ flex: 1 }} haptic="none" onPress={onOpen}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookMeta}>
          {item.author ? `${item.author} · ` : ''}
          {FORMAT_LABELS[item.format]}
        </Text>
      </AnimatedPressable>
      <AnimatedPressable haptic="none" onPress={() => onDelete(item)}>
        <Text style={styles.deleteLink}>Supprimer</Text>
      </AnimatedPressable>
    </FadeInView>
  );
});

// MARK: - Ajout de livre

function AddBookModal({
  visible,
  onClose,
  onAdded,
  db,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
  db: LexisDb;
  styles: Styles;
}) {
  const [mode, setMode] = useState<AddMode>('url');
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUrl('');
    setQuery('');
    setSearchResults([]);
    setError(null);
  };

  const importFromUrl = async (sourceUrl: string) => {
    setImporting(true);
    setError(null);
    try {
      const parsed = await downloadAndParseBook(sourceUrl);
      const id = `book_${Date.now()}`;
      await createBook(db, { id, title: parsed.title, author: parsed.author, sourceUrl, format: parsed.format }, parsed.chapters);
      reset();
      onAdded();
    } catch (err) {
      console.log('[BooksScreen] échec import :', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : "Échec de l'ajout de ce livre.");
    } finally {
      setImporting(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const results = await searchBooks(query.trim());
    setSearchResults(results);
    setSearching(false);
    if (results.length === 0) setError('Aucun résultat exploitable trouvé pour cette recherche.');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Ajouter un livre</Text>

          <View style={styles.modeRow}>
            <ModeChip styles={styles} label="Coller une URL" active={mode === 'url'} onPress={() => setMode('url')} />
            <ModeChip styles={styles} label="Rechercher un titre" active={mode === 'search'} onPress={() => setMode('search')} />
          </View>

          {mode === 'url' ? (
            <>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://exemple.com/livre.epub"
                placeholderTextColor={styles.placeholderColor.color}
                keyboardAppearance="dark"
                editable={!importing}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <AnimatedPressable
                style={[styles.button, (!url.trim() || importing) && styles.buttonDisabled]}
                haptic="none"
                disabled={!url.trim() || importing}
                onPress={() => importFromUrl(url.trim())}
              >
                {importing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ajouter</Text>}
              </AnimatedPressable>
            </>
          ) : (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Titre du livre…"
                  placeholderTextColor={styles.placeholderColor.color}
                  keyboardAppearance="dark"
                  editable={!searching && !importing}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
                <AnimatedPressable
                  style={[styles.searchButton, (!query.trim() || searching) && styles.buttonDisabled]}
                  haptic="none"
                  disabled={!query.trim() || searching}
                  onPress={handleSearch}
                >
                  {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>🔍</Text>}
                </AnimatedPressable>
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}

              <ScrollView style={styles.searchResultsScroll}>
                {searchResults.map((result, i) => (
                  <View key={`${result.downloadUrl}_${i}`} style={styles.searchResultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookTitle} numberOfLines={2}>
                        {result.title}
                      </Text>
                      {result.author && <Text style={styles.bookMeta}>{result.author}</Text>}
                    </View>
                    <AnimatedPressable
                      style={[styles.searchAddButton, importing && styles.buttonDisabled]}
                      haptic="none"
                      disabled={importing}
                      onPress={() => importFromUrl(result.downloadUrl)}
                    >
                      {importing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>+</Text>}
                    </AnimatedPressable>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          <AnimatedPressable
            style={[styles.button, styles.buttonOutline, { marginTop: 12 }]}
            haptic="none"
            onPress={() => {
              reset();
              onClose();
            }}
          >
            <Text style={styles.buttonOutlineText}>Annuler</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function ModeChip({ styles, label, active, onPress }: { styles: Styles; label: string; active: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable style={[styles.modeChip, active && styles.modeChipActive]} haptic="none" scaleTo={0.94} onPress={onPress}>
      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    header: { paddingTop: 20, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },
    empty: { color: t.metaText, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },

    listContent: { paddingTop: 8, paddingBottom: 100 },
    bookRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    bookTitle: { fontSize: 16, fontWeight: '600', color: t.wordText },
    bookMeta: { fontSize: 13, color: t.metaText, marginTop: 2 },
    deleteLink: { color: t.dot, fontSize: 12 },

    fabWrapper: { position: 'absolute', bottom: 20, left: 0, right: 0 },
    fab: { backgroundColor: t.buttonFilled, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
    fabText: { color: t.buttonFilledText, fontWeight: '600' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: t.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    modalTitle: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: t.wordText, marginBottom: 16 },

    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    modeChip: { flex: 1, paddingVertical: 10, borderRadius: 16, backgroundColor: t.translationBackground, alignItems: 'center' },
    modeChipActive: { backgroundColor: t.buttonFilled },
    modeChipText: { color: t.wordText, fontWeight: '600', fontSize: 13 },
    modeChipTextActive: { color: t.buttonFilledText },

    input: {
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.wordText,
      backgroundColor: t.cardBackground,
      marginBottom: 12,
    },
    placeholderColor: { color: t.metaText },
    errorText: { color: t.dot, fontSize: 13, marginBottom: 12 },

    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    searchButton: { width: 48, height: 44, borderRadius: 10, backgroundColor: t.buttonFilled, alignItems: 'center', justifyContent: 'center' },
    searchResultsScroll: { maxHeight: 280, marginTop: 8 },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    searchAddButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.buttonFilled, alignItems: 'center', justifyContent: 'center' },

    button: { backgroundColor: t.buttonFilled, paddingVertical: 14, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 15 },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
