import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueConjugationCardsSplit } from '../data/database';
import { getSettings } from '../data/settings';
import { conjugationVerbs, getConjugationVerb } from '../conjugation/data';
import { CONJUGATION_TENSES, TENSE_LABELS, personLabelsForTense } from '../conjugation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onStartSession: () => void };
type SubView = 'training' | 'rules';
type Styles = ReturnType<typeof createStyles>;

/** Onglet Conjugaison : entraînement SM-2 (flashcards, réutilise
 * [ConjugationReviewContainer.tsx](./ConjugationReviewContainer.tsx))
 * et référence statique des règles — deux sous-onglets d'un même
 * onglet, comme Réglages/Historique/Notifications le sont déjà pour
 * l'onglet Réglages, plutôt que deux onglets séparés dans la barre du
 * bas (voir AUDIT.md : la place réelle de 6 onglets n'avait pas été
 * évaluée au moment de la planification, ce regroupement la ramène à 5). */
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
          <SubTabButton styles={styles} label="Règles" active={subView === 'rules'} onPress={() => setSubView('rules')} />
        </View>
      </View>

      {subView === 'training' && <TrainingView db={db} styles={styles} onStartSession={onStartSession} />}
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueConjugationCardsSplit(db, new Date(), settings);
    setDueCount(due.length);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.trainingContent}>
      {!loading && (
        <>
          <FadeInView duration={400} style={styles.statCard}>
            <Text style={styles.statNumber}>{dueCount}</Text>
            <Text style={styles.statCaption}>
              conjugaison{dueCount !== 1 ? 's' : ''} due{dueCount !== 1 ? 's' : ''}
            </Text>
          </FadeInView>

          <Text style={styles.trainingHint}>
            Verbe, personne et temps donnés — tape la conjugaison au clavier. {conjugationVerbs.length} verbes
            couverts, du plus fréquent au moins fréquent.
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
    statCaption: { fontSize: 14, color: t.metaText, marginTop: 4 },
    trainingHint: { fontSize: 13, color: t.metaText, lineHeight: 18, marginBottom: 24 },
    button: { backgroundColor: t.buttonFilled, paddingVertical: 16, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { backgroundColor: t.cardBorder, opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },

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
