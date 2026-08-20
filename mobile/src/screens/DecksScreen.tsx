import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import { addUserWord, deleteWord, getAllTags, getAllWords } from '../data/database';
import { getSettings, saveSettings, type AppSettings } from '../data/settings';
import type { Word } from '../data/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CreditsScreen } from './CreditsScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase };
type SubView = 'list' | 'settings';
type Styles = ReturnType<typeof createStyles>;

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

export function DecksScreen({ db }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('list');

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Decks & mots</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Mots" active={subView === 'list'} onPress={() => setSubView('list')} />
          <SubTabButton styles={styles} label="Réglages" active={subView === 'settings'} onPress={() => setSubView('settings')} />
        </View>
      </View>

      {subView === 'list' ? <WordListView db={db} styles={styles} /> : <SettingsView db={db} styles={styles} />}
    </SafeAreaView>
  );
}

function SubTabButton({
  styles,
  label,
  active,
  onPress,
}: {
  styles: Styles;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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

// MARK: - Liste des mots

function WordListView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [words, setWords] = useState<Word[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [addVisible, setAddVisible] = useState(false);

  const refresh = useCallback(async () => {
    const [rows, tags] = await Promise.all([
      getAllWords(db, { level: levelFilter ?? undefined, tag: tagFilter ?? undefined }),
      getAllTags(db),
    ]);
    setWords(rows);
    setAllTags(tags);
  }, [db, levelFilter, tagFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = (word: Word) => {
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
  };

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

      <FlatList
        data={words}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInRight.duration(250).delay(Math.min(index, 12) * 25)} style={styles.wordRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wordSpanish}>{item.spanish}</Text>
              <Text style={styles.wordEnglish}>
                {item.english} · {item.level}
              </Text>
            </View>
            {item.isUserAdded && (
              <AnimatedPressable haptic={Haptics.ImpactFeedbackStyle.Light} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteLink}>Supprimer</Text>
              </AnimatedPressable>
            )}
          </Animated.View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aucun mot ne correspond à ce filtre.</Text>}
      />

      <Animated.View entering={FadeInDown.duration(300)} style={styles.fabWrapper}>
        <AnimatedPressable style={styles.fab} onPress={() => setAddVisible(true)}>
          <Text style={styles.fabText}>+ Ajouter un mot</Text>
        </AnimatedPressable>
      </Animated.View>

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
    </View>
  );
}

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
  db: SQLiteDatabase;
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
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} />
    </View>
  );
}

// MARK: - Réglages

function SettingsView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [creditsVisible, setCreditsVisible] = useState(false);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings(db));
      setAllTags(await getAllTags(db));
    })();
  }, [db]);

  if (!settings) return null;

  const update = (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch });

  const toggleTag = (tag: string) => {
    const disabled = settings.disabledTags.includes(tag)
      ? settings.disabledTags.filter((t) => t !== tag)
      : [...settings.disabledTags, tag];
    update({ disabledTags: disabled });
  };

  const handleSave = async () => {
    await saveSettings(db, settings);
    Alert.alert('Enregistré', 'Les réglages ont été mis à jour.');
  };

  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <NumberField
        styles={styles}
        label="Nouvelles cartes / jour"
        value={settings.newCardsPerDay}
        onChange={(v) => update({ newCardsPerDay: v })}
      />
      <NumberField
        styles={styles}
        label="Plafond de révisions / jour"
        value={settings.reviewCapPerDay}
        onChange={(v) => update({ reviewCapPerDay: v })}
      />
      <View style={styles.hourRow}>
        <NumberField styles={styles} label="Début (heure)" value={settings.windowStartHour} onChange={(v) => update({ windowStartHour: v })} compact />
        <NumberField styles={styles} label="Fin (heure)" value={settings.windowEndHour} onChange={(v) => update({ windowEndHour: v })} compact />
      </View>

      {allTags.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Thèmes actifs pour les nouvelles cartes</Text>
          <View style={styles.tagToggleWrap}>
            {allTags.map((tag) => {
              const enabled = !settings.disabledTags.includes(tag);
              return (
                <AnimatedPressable
                  key={tag}
                  style={[styles.chip, enabled && styles.chipActive]}
                  haptic="none"
                  scaleTo={0.92}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.chipText, enabled && styles.chipTextActive]}>{tag}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </>
      )}

      <AnimatedPressable style={styles.button} haptic={Haptics.NotificationFeedbackType.Success} onPress={handleSave}>
        <Text style={styles.buttonText}>Enregistrer</Text>
      </AnimatedPressable>

      <TouchableOpacity style={styles.creditsLink} onPress={() => setCreditsVisible(true)}>
        <Text style={styles.creditsLinkText}>Crédits et sources du vocabulaire</Text>
      </TouchableOpacity>

      <CreditsScreen visible={creditsVisible} onClose={() => setCreditsVisible(false)} />
    </ScrollView>
  );
}

function NumberField({
  styles,
  label,
  value,
  onChange,
  compact,
}: {
  styles: Styles;
  label: string;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && { flex: 1, marginRight: 8 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.cardBackground },
    header: { padding: 24, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },
    subTabs: { flexDirection: 'row', gap: 8 },
    subTabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.translationBackground },
    subTabButtonActive: { backgroundColor: t.buttonFilled },
    subTabText: { color: t.wordText, fontWeight: '600', fontSize: 13 },
    subTabTextActive: { color: t.buttonFilledText },

    filterRow: { flexGrow: 0, paddingHorizontal: 24, marginBottom: 8 },
    filterRowContent: { gap: 8, paddingRight: 24 },
    chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.translationBackground },
    chipActive: { backgroundColor: t.buttonFilled },
    chipText: { fontSize: 12, color: t.wordText, fontWeight: '600' },
    chipTextActive: { color: t.buttonFilledText },

    listContent: { paddingHorizontal: 24, paddingBottom: 100 },
    wordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
    },
    wordSpanish: { fontSize: 16, fontWeight: '600', color: t.wordText },
    wordEnglish: { fontSize: 13, color: t.metaText, marginTop: 2 },
    deleteLink: { color: t.dot, fontSize: 12 },
    empty: { color: t.metaText, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

    fabWrapper: { position: 'absolute', bottom: 20, left: 24, right: 24 },
    fab: {
      backgroundColor: t.buttonFilled,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: 'center',
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

    settingsContent: { padding: 24, paddingBottom: 60 },
    creditsLink: { alignItems: 'center', paddingVertical: 16 },
    creditsLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
    hourRow: { flexDirection: 'row' },
    tagToggleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },

    button: { flex: 1, backgroundColor: t.buttonFilled, paddingVertical: 14, borderRadius: 24, alignItems: 'center' },
    buttonText: { color: t.buttonFilledText, fontWeight: '600' },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
