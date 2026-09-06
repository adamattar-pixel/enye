import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LexisDb } from '../data/dbTypes';
import { addUserWord, deleteWord, getAllTags, getAllWords, updateWord } from '../data/database';
import type { Word } from '../data/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb };
type Styles = ReturnType<typeof createStyles>;

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

/** Liste des mots seule — Historique, Notifications et Réglages ont leur
 * propre onglet ([SettingsScreen.tsx](../screens/SettingsScreen.tsx)),
 * demandé explicitement le 20/08/2026 pour ne pas mélanger gestion du
 * contenu et réglages/consultation dans les mêmes sous-onglets. */
export function DecksScreen({ db }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Decks & mots</Text>
      </View>

      <WordListView db={db} styles={styles} />
    </ScreenContainer>
  );
}

// MARK: - Liste des mots

function WordListView({ db, styles }: { db: LexisDb; styles: Styles }) {
  const [words, setWords] = useState<Word[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [userAddedOnly, setUserAddedOnly] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);

  const refresh = useCallback(async () => {
    const [rows, tags] = await Promise.all([
      getAllWords(db, { level: levelFilter ?? undefined, tag: tagFilter ?? undefined, userAddedOnly }),
      getAllTags(db),
    ]);
    setWords(rows);
    setAllTags(tags);
  }, [db, levelFilter, tagFilter, userAddedOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    (word: Word) => {
      Alert.alert('Supprimer ce mot ?', `« ${word.spanish} » sera définitivement supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteWord(db, word.id);
            refresh();
          },
        },
      ]);
    },
    [db, refresh]
  );

  // Jusqu'à 6002 mots (voir docs/AUDIT.md) — `renderItem` mémorisé et ligne
  // extraite en composant `memo` pour que `FlatList` ne re-rende pas
  // toutes les lignes visibles à chaque changement d'état sans rapport
  // (ex. ouverture de la modale d'ajout), qui recréerait sinon une
  // fonction `renderItem` différente à chaque rendu.
  const renderItem = useCallback(
    ({ item, index }: { item: Word; index: number }) => (
      <WordRow item={item} index={index} styles={styles} onDelete={handleDelete} onEdit={setEditingWord} />
    ),
    [styles, handleDelete]
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        <FilterChip styles={styles} label="Tous niveaux" active={levelFilter === null} onPress={() => setLevelFilter(null)} />
        {LEVELS.map((level) => (
          <FilterChip key={level} styles={styles} label={level} active={levelFilter === level} onPress={() => setLevelFilter(level)} />
        ))}
      </ScrollView>

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
          <FilterChip styles={styles} label="Tous thèmes" active={tagFilter === null} onPress={() => setTagFilter(null)} />
          {allTags.map((tag) => (
            <FilterChip key={tag} styles={styles} label={tag} active={tagFilter === tag} onPress={() => setTagFilter(tag)} />
          ))}
        </ScrollView>
      )}

      <View style={[styles.filterRow, styles.filterRowContent, { flexDirection: 'row' }]}>
        <FilterChip
          styles={styles}
          label="Mots ajoutés seulement"
          active={userAddedOnly}
          onPress={() => setUserAddedOnly((v) => !v)}
        />
      </View>

      <FlatList
        style={styles.list}
        data={words}
        keyExtractor={wordKeyExtractor}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Aucun mot ne correspond à ce filtre.</Text>}
      />

      <FadeInView duration={300} style={styles.fabWrapper}>
        <AnimatedPressable style={styles.fab} onPress={() => setAddVisible(true)}>
          <Text style={styles.fabText}>+ Ajouter un mot</Text>
        </AnimatedPressable>
      </FadeInView>

      <AddWordModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onAdded={async () => {
          setAddVisible(false);
          await refresh();
        }}
        db={db}
        styles={styles}
      />

      <EditWordModal
        word={editingWord}
        onClose={() => setEditingWord(null)}
        onSaved={async () => {
          setEditingWord(null);
          await refresh();
        }}
        db={db}
        styles={styles}
      />
    </View>
  );
}

const wordKeyExtractor = (w: Word) => w.id;

const WordRow = memo(function WordRow({
  item,
  index,
  styles,
  onDelete,
  onEdit,
}: {
  item: Word;
  index: number;
  styles: Styles;
  onDelete: (word: Word) => void;
  onEdit: (word: Word) => void;
}) {
  return (
    <FadeInView duration={250} direction="right" delay={Math.min(index, 12) * 25} style={styles.wordRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.wordSpanish}>{item.spanish}</Text>
        <Text style={styles.wordEnglish}>
          {item.english} · {item.level}
        </Text>
      </View>
      <View style={styles.wordRowActions}>
        <AnimatedPressable haptic="none" onPress={() => onEdit(item)}>
          <Text style={styles.editLink}>Éditer</Text>
        </AnimatedPressable>
        {item.isUserAdded && (
          <AnimatedPressable haptic={Haptics.ImpactFeedbackStyle.Light} onPress={() => onDelete(item)}>
            <Text style={styles.deleteLink}>Supprimer</Text>
          </AnimatedPressable>
        )}
      </View>
    </FadeInView>
  );
});

function FilterChip({ styles, label, active, onPress }: { styles: Styles; label: string; active: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable style={[styles.chip, active && styles.chipActive]} haptic="none" scaleTo={0.92} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

// MARK: - Ajout de mot

function AddWordModal({
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
  const [spanish, setSpanish] = useState('');
  const [english, setEnglish] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('nom');
  const [gender, setGender] = useState('');
  const [exampleEs, setExampleEs] = useState('');
  const [exampleEn, setExampleEn] = useState('');
  const [level, setLevel] = useState('A1');
  const [tags, setTags] = useState('');

  const reset = () => {
    setSpanish('');
    setEnglish('');
    setPartOfSpeech('nom');
    setGender('');
    setExampleEs('');
    setExampleEn('');
    setLevel('A1');
    setTags('');
  };

  const handleSave = async () => {
    if (!spanish.trim() || !english.trim()) {
      Alert.alert('Champs manquants', 'Le mot espagnol et sa traduction sont obligatoires.');
      return;
    }

    const id = `user_${spanish.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    await addUserWord(db, {
      id,
      spanish: spanish.trim(),
      english: english.trim(),
      partOfSpeech: partOfSpeech.trim() || 'nom',
      gender: gender.trim() || null,
      exampleEs: exampleEs.trim(),
      exampleEn: exampleEn.trim(),
      level,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      frequencyRank: 999999,
    });

    reset();
    onAdded();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>Ajouter un mot</Text>

            <FormField styles={styles} label="Mot espagnol *" value={spanish} onChangeText={setSpanish} />
            <FormField styles={styles} label="Traduction anglaise *" value={english} onChangeText={setEnglish} />
            <FormField styles={styles} label="Catégorie grammaticale (nom, verbe, adjectif…)" value={partOfSpeech} onChangeText={setPartOfSpeech} />
            <FormField styles={styles} label="Genre (masculin / féminin, si nom)" value={gender} onChangeText={setGender} />
            <FormField styles={styles} label="Phrase d'exemple (espagnol)" value={exampleEs} onChangeText={setExampleEs} />
            <FormField styles={styles} label="Phrase d'exemple (anglais)" value={exampleEn} onChangeText={setExampleEn} />
            <FormField styles={styles} label="Niveau (A1, A2, B1, B2)" value={level} onChangeText={setLevel} />
            <FormField styles={styles} label="Tags (séparés par des virgules)" value={tags} onChangeText={setTags} />

            <View style={styles.modalButtonRow}>
              <AnimatedPressable style={[styles.button, styles.buttonOutline]} haptic="none" onPress={onClose}>
                <Text style={styles.buttonOutlineText}>Annuler</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.button} haptic={Haptics.NotificationFeedbackType.Success} onPress={handleSave}>
                <Text style={styles.buttonText}>Ajouter</Text>
              </AnimatedPressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// MARK: - Édition de mot

/** Édite `english`/`exampleEn`/`tags`/`level` d'un mot existant, importé
 * ou ajouté par l'utilisateur — demandé explicitement le 21/08/2026,
 * portée volontairement limitée à ces quatre champs (voir `updateWord`
 * dans `database.ts`). Le reste du mot (espagnol, catégorie grammaticale,
 * exemple espagnol) n'est pas éditable ici. */
function EditWordModal({
  word,
  onClose,
  onSaved,
  db,
  styles,
}: {
  word: Word | null;
  onClose: () => void;
  onSaved: () => void;
  db: LexisDb;
  styles: Styles;
}) {
  const [english, setEnglish] = useState('');
  const [exampleEn, setExampleEn] = useState('');
  const [level, setLevel] = useState('');
  const [tags, setTags] = useState('');

  // Le modal reste monté en permanence (visible piloté par `word !== null`)
  // — les champs doivent se réinitialiser à chaque nouveau mot édité, pas
  // seulement au montage.
  useEffect(() => {
    if (!word) return;
    setEnglish(word.english);
    setExampleEn(word.exampleEn);
    setLevel(word.level);
    setTags(word.tags.join(', '));
  }, [word]);

  const handleSave = async () => {
    if (!word) return;
    if (!english.trim()) {
      Alert.alert('Champ manquant', 'La traduction anglaise est obligatoire.');
      return;
    }

    await updateWord(db, word.id, {
      english: english.trim(),
      exampleEn: exampleEn.trim(),
      level: level.trim() || word.level,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    onSaved();
  };

  return (
    <Modal visible={word !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>Éditer « {word?.spanish} »</Text>

            <FormField styles={styles} label="Traduction anglaise *" value={english} onChangeText={setEnglish} />
            <FormField styles={styles} label="Phrase d'exemple (anglais)" value={exampleEn} onChangeText={setExampleEn} />
            <FormField styles={styles} label="Niveau (A1, A2, B1, B2)" value={level} onChangeText={setLevel} />
            <FormField styles={styles} label="Tags (séparés par des virgules)" value={tags} onChangeText={setTags} />

            <View style={styles.modalButtonRow}>
              <AnimatedPressable style={[styles.button, styles.buttonOutline]} haptic="none" onPress={onClose}>
                <Text style={styles.buttonOutlineText}>Annuler</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.button} haptic={Haptics.NotificationFeedbackType.Success} onPress={handleSave}>
                <Text style={styles.buttonText}>Enregistrer</Text>
              </AnimatedPressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormField({
  styles,
  label,
  value,
  onChangeText,
}: {
  styles: Styles;
  label: string;
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardAppearance="dark" />
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    header: { paddingTop: 20, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },

    // `flexGrow: 0` seul ne suffit pas sous react-native-web : sans
    // `flexShrink: 0` explicite, ces rangées de filtres pouvaient être
    // écrasées par `FlatList` qui, sans sa propre hauteur bornée (voir
    // `list` ci-dessous), grossissait avec son contenu (jusqu'à 6002
    // mots) plutôt que de rester une zone de défilement fixe — d'où les
    // boutons qui rétrécissaient progressivement à mesure que la liste se
    // peuplait, signalé explicitement le 06/09/2026.
    filterRow: { flexGrow: 0, flexShrink: 0, marginBottom: 8 },
    filterRowContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // Borne la zone de la liste à l'espace flex restant, pour qu'elle
    // défile en interne au lieu de grossir avec son contenu (voir le
    // commentaire sur `filterRow` ci-dessus — la cause réelle du problème
    // était ici, pas sur les boutons eux-mêmes).
    list: { flex: 1 },
    chip: {
      minHeight: 32,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: t.translationBackground,
    },
    chipActive: { backgroundColor: t.buttonFilled },
    chipText: { fontSize: 12, color: t.wordText, fontWeight: '600' },
    chipTextActive: { color: t.buttonFilledText },

    listContent: { paddingTop: 8, paddingBottom: 100 },
    wordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
    },
    wordSpanish: { fontSize: 16, fontWeight: '600', color: t.wordText },
    wordEnglish: { fontSize: 13, color: t.metaText, marginTop: 2 },
    wordRowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    editLink: { color: t.buttonOutline, fontSize: 12 },
    deleteLink: { color: t.dot, fontSize: 12 },
    empty: { color: t.metaText, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

    fabWrapper: { position: 'absolute', bottom: 20, left: 0, right: 0 },
    fab: {
      minHeight: 48,
      backgroundColor: t.buttonFilled,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabText: { color: t.buttonFilledText, fontWeight: '600' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: t.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    modalTitle: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: t.wordText, marginBottom: 16 },
    modalButtonRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 20 },

    field: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, color: t.metaText, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.wordText,
      backgroundColor: t.cardBackground,
    },

    button: {
      flex: 1,
      minHeight: 48,
      backgroundColor: t.buttonFilled,
      paddingVertical: 14,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { color: t.buttonFilledText, fontWeight: '600' },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
