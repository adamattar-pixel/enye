import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getDueConjugationCardsSplit,
  getConjugationCounts,
  getConjugationHistory,
  updateConjugationReviewGrade,
  type ConjugationHistoryRow,
} from '../data/database';
import { getSettings } from '../data/settings';
import { conjugationVerbs, getConjugationVerb } from '../conjugation/data';
import { CONJUGATION_TENSES, TENSE_LABELS, personLabelsForTense } from '../conjugation/types';
import type { SM2Grade } from '../sm2/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onStartSession: () => void };
type SubView = 'training' | 'history' | 'rules';
type Styles = ReturnType<typeof createStyles>;

const GRADE_LABELS: Record<SM2Grade, string> = {
  again: 'Otra vez',
  hard: 'Difícil',
  good: 'Bien',
  easy: 'Fácil',
};

const GRADES: SM2Grade[] = ['again', 'hard', 'good', 'easy'];

/** Onglet Conjugaison : entraînement SM-2 (flashcards, réutilise
 * [ConjugationReviewContainer.tsx](./ConjugationReviewContainer.tsx)),
 * historique et référence statique des règles — trois sous-onglets d'un
 * même onglet, comme Réglages/Historique/Notifications le sont déjà
 * pour l'onglet Réglages, plutôt que des onglets séparés dans la barre
 * du bas (voir docs/AUDIT.md). Historique séparé de celui du vocabulaire —
 * les notifications verrouillées, elles, restent vocabulaire uniquement
 * (demandé explicitement le 20/08/2026), donc pas de sous-onglet
 * Notifications ici. */
export function ConjugationScreen({ db, onStartSession }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('training');

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Conjugaison</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Entraînement" active={subView === 'training'} onPress={() => setSubView('training')} />
          <SubTabButton styles={styles} label="Historique" active={subView === 'history'} onPress={() => setSubView('history')} />
          <SubTabButton styles={styles} label="Règles" active={subView === 'rules'} onPress={() => setSubView('rules')} />
        </View>
      </View>

      {subView === 'training' && <TrainingView db={db} styles={styles} onStartSession={onStartSession} />}
      {subView === 'history' && <HistoryView db={db} styles={styles} />}
      {subView === 'rules' && <RulesView styles={styles} />}
    </ScreenContainer>
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

// MARK: - Entraînement

function TrainingView({ db, styles, onStartSession }: { db: SQLiteDatabase; styles: Styles; onStartSession: () => void }) {
  const [dueCount, setDueCount] = useState(0);
  const [learned, setLearned] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const [due, counts] = await Promise.all([
      getDueConjugationCardsSplit(db, new Date(), settings),
      getConjugationCounts(db),
    ]);
    setDueCount(due.length);
    setLearned(counts.learned);
    setTotal(counts.total);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.trainingContent}>
      {!loading && (
        <>
          {/* Total acquis plutôt que nombre dû, demandé explicitement
           * (20/08/2026) — le compteur dû reste utilisé pour activer/
           * désactiver le bouton juste en dessous, simplement plus mis
           * en avant comme gros chiffre. */}
          <FadeInView duration={400} style={styles.statCard}>
            <Text style={styles.statNumber}>
              {learned} <Text style={styles.statNumberTotal}>/ {total}</Text>
            </Text>
            <Text style={styles.statCaption}>conjugaison{learned !== 1 ? 's' : ''} acquise{learned !== 1 ? 's' : ''}</Text>
          </FadeInView>

          <Text style={styles.trainingHint}>
            Verbe, personne et temps donnés, tirés au hasard — tape la conjugaison au clavier.{' '}
            {conjugationVerbs.length} verbes couverts.
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
        </>
      )}
    </View>
  );
}

// MARK: - Historique

/** Historique des révisions de conjugaison — mot conjugué, temps/mode,
 * personne, note, avec correction possible en cas de mauvais clic.
 * Même principe et même limite assumée que l'historique du vocabulaire
 * (Réglages → Historique) : corrige les stats, pas l'échéance déjà
 * programmée de la carte. */
function HistoryView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [rows, setRows] = useState<ConjugationHistoryRow[]>([]);
  const [editing, setEditing] = useState<ConjugationHistoryRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setRows(await getConjugationHistory(db));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePickGrade = async (grade: SM2Grade) => {
    if (!editing) return;
    await updateConjugationReviewGrade(db, editing.id, grade);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
    await refresh();
  };

  const renderItem = useCallback(
    ({ item, index }: { item: ConjugationHistoryRow; index: number }) => (
      <ConjugationHistoryRowView item={item} index={index} styles={styles} onEdit={setEditing} />
    ),
    [styles]
  );

  if (loading) return null;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.historyHint}>
        Touche une note pour la corriger en cas de mauvais clic. Corriger ici met à jour les statistiques mais ne
        change pas la prochaine date de révision déjà programmée pour cette carte.
      </Text>
      <FlatList
        data={rows}
        keyExtractor={conjugationHistoryKeyExtractor}
        contentContainerStyle={styles.historyListContent}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.rulesHint}>Aucune révision de conjugaison pour l'instant.</Text>}
      />

      <Modal visible={editing !== null} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.editCard}>
            {editing &&
              (() => {
                const verb = getConjugationVerb(editing.verbId);
                if (!verb) return null;
                return (
                  <>
                    <Text style={styles.modalTitle}>{verb.forms[editing.tense][editing.person]}</Text>
                    <Text style={styles.wordEnglish}>
                      {verb.infinitive} · {TENSE_LABELS[editing.tense]} · {personLabelsForTense(editing.tense)[editing.person]}
                    </Text>
                    <View style={styles.editGradeGrid}>
                      {GRADES.map((grade) => (
                        <AnimatedPressable
                          key={grade}
                          style={[styles.editGradeButton, styles[`gradeBadge_${grade}` as const]]}
                          haptic="none"
                          scaleTo={0.94}
                          onPress={() => handlePickGrade(grade)}
                        >
                          <Text style={styles.gradeBadgeText}>{GRADE_LABELS[grade]}</Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                    <AnimatedPressable style={styles.editCancelButton} haptic="none" onPress={() => setEditing(null)}>
                      <Text style={styles.editCancelButtonText}>Annuler</Text>
                    </AnimatedPressable>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const conjugationHistoryKeyExtractor = (r: ConjugationHistoryRow) => String(r.id);

const ConjugationHistoryRowView = memo(function ConjugationHistoryRowView({
  item,
  index,
  styles,
  onEdit,
}: {
  item: ConjugationHistoryRow;
  index: number;
  styles: Styles;
  onEdit: (row: ConjugationHistoryRow) => void;
}) {
  const verb = getConjugationVerb(item.verbId);
  if (!verb) return null;
  const form = verb.forms[item.tense][item.person];
  const personLabel = personLabelsForTense(item.tense)[item.person];
  return (
    <FadeInView duration={220} direction="right" delay={Math.min(index, 12) * 20} style={styles.historyRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.wordSpanish}>{form}</Text>
        <Text style={styles.wordEnglish}>
          {verb.infinitive} · {TENSE_LABELS[item.tense]} · {personLabel}
        </Text>
        <Text style={styles.historyDate}>
          {item.reviewedAt.toLocaleDateString()} ·{' '}
          {item.reviewedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <AnimatedPressable
        style={[styles.gradeBadge, styles[`gradeBadge_${item.grade}` as const]]}
        haptic={Haptics.ImpactFeedbackStyle.Light}
        onPress={() => onEdit(item)}
      >
        <Text style={styles.gradeBadgeText}>{GRADE_LABELS[item.grade]}</Text>
      </AnimatedPressable>
    </FadeInView>
  );
});

// MARK: - Règles de conjugaison

// 3 modèles réguliers (-ar/-er/-ir) + verbes irréguliers les plus
// fréquents — lus directement depuis `conjugations.json` (déjà généré
// pour l'entraînement, voir generate-conjugations/README.md), pas un
// second jeu de données à maintenir séparément.
const REGULAR_MODEL_IDS = ['hablar', 'comer', 'vivir'];
const IRREGULAR_HIGHLIGHT_IDS = ['ser', 'estar', 'tener', 'ir', 'hacer', 'poder', 'decir', 'querer', 'poner', 'saber', 'venir', 'salir'];

function RulesView({ styles }: { styles: Styles }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.rulesContent}>
      <Text style={styles.rulesHint}>
        Consultation seulement — touche un verbe pour déplier ses 9 temps/modes. Pas de suivi ni de notation ici,
        voir l'onglet Entraînement pour réviser.
      </Text>

      <Text style={styles.rulesSectionTitle}>Modèles réguliers</Text>
      {REGULAR_MODEL_IDS.map((id) => (
        <VerbAccordion key={id} id={id} styles={styles} expanded={expandedId === id} onToggle={() => setExpandedId(expandedId === id ? null : id)} />
      ))}

      <Text style={styles.rulesSectionTitle}>Irréguliers les plus fréquents</Text>
      {IRREGULAR_HIGHLIGHT_IDS.map((id) => (
        <VerbAccordion key={id} id={id} styles={styles} expanded={expandedId === id} onToggle={() => setExpandedId(expandedId === id ? null : id)} />
      ))}
    </ScrollView>
  );
}

function VerbAccordion({ id, styles, expanded, onToggle }: { id: string; styles: Styles; expanded: boolean; onToggle: () => void }) {
  const verb = getConjugationVerb(id);
  if (!verb) return null;

  return (
    <View style={styles.accordionCard}>
      <AnimatedPressable haptic="selection" onPress={onToggle}>
        <View style={styles.accordionHeader}>
          <View>
            <Text style={styles.accordionInfinitive}>{verb.infinitive}</Text>
            <Text style={styles.accordionEnglish}>{verb.english}</Text>
          </View>
          <Text style={styles.accordionChevron}>{expanded ? '−' : '+'}</Text>
        </View>
      </AnimatedPressable>

      {expanded && (
        <FadeInView duration={200} direction="none">
          {CONJUGATION_TENSES.map((tense) => {
            const forms = verb.forms[tense];
            const labels = personLabelsForTense(tense);
            return (
              <View key={tense} style={styles.tenseBlock}>
                <Text style={styles.tenseLabel}>{TENSE_LABELS[tense]}</Text>
                {forms.map((form, i) => (
                  <Text key={i} style={styles.formRow}>
                    <Text style={styles.formPerson}>{labels[i]}</Text> {form}
                  </Text>
                ))}
              </View>
            );
          })}
        </FadeInView>
      )}
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
    statCard: {
      backgroundColor: t.translationBackground,
      borderRadius: 16,
      paddingVertical: 28,
      alignItems: 'center',
      marginBottom: 16,
    },
    statNumber: { fontSize: 44, fontWeight: '700', color: t.wordText },
    statNumberTotal: { fontSize: 22, fontWeight: '600', color: t.metaText },
    statCaption: { fontSize: 14, color: t.metaText, marginTop: 4 },
    trainingHint: { fontSize: 13, color: t.metaText, lineHeight: 18, marginBottom: 24 },
    button: { backgroundColor: t.buttonFilled, paddingVertical: 16, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { backgroundColor: t.cardBorder, opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },

    historyHint: { fontSize: 12, color: t.metaText, paddingTop: 4, paddingBottom: 12, lineHeight: 17 },
    historyListContent: { paddingBottom: 60 },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    wordSpanish: { fontSize: 16, fontWeight: '600', color: t.wordText },
    wordEnglish: { fontSize: 13, color: t.metaText, marginTop: 2 },
    historyDate: { fontSize: 11, color: t.metaText, marginTop: 4 },
    gradeBadge: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, minWidth: 76, alignItems: 'center' },
    gradeBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    gradeBadge_again: { backgroundColor: '#B5533C' },
    gradeBadge_hard: { backgroundColor: '#C98A3E' },
    gradeBadge_good: { backgroundColor: '#4C7A5E' },
    gradeBadge_easy: { backgroundColor: '#3D6E8C' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    editCard: { backgroundColor: t.cardBackground, borderRadius: 20, padding: 24, margin: 24, alignSelf: 'stretch' },
    modalTitle: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: t.wordText, marginBottom: 4 },
    editGradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18, marginBottom: 8 },
    editGradeButton: { flexBasis: '47%', paddingVertical: 14, borderRadius: 20, alignItems: 'center' },
    editCancelButton: {
      marginTop: 4,
      paddingVertical: 14,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
    },
    editCancelButtonText: { color: t.buttonOutline, fontWeight: '600' },

    rulesContent: { paddingTop: 8, paddingBottom: 60 },
    rulesHint: { fontSize: 12, color: t.metaText, lineHeight: 17, marginBottom: 16 },
    rulesSectionTitle: { fontSize: 15, fontWeight: '600', color: t.wordText, marginTop: 16, marginBottom: 10 },

    accordionCard: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    accordionInfinitive: { fontFamily: 'Georgia', fontSize: 18, fontWeight: '600', color: t.wordText },
    accordionEnglish: { fontSize: 12, color: t.metaText, marginTop: 2 },
    accordionChevron: { fontSize: 20, fontWeight: '700', color: t.buttonOutline },

    tenseBlock: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.cardBorder },
    tenseLabel: { fontSize: 12, fontWeight: '700', color: t.buttonOutline, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    formRow: { fontSize: 14, color: t.wordText, lineHeight: 20 },
    formPerson: { color: t.metaText, fontWeight: '600' },
  });
}
