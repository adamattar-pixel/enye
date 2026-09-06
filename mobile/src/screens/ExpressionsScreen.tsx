import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { LexisDb } from '../data/dbTypes';
import { getDueExpressionCardsSplit, getExpressionCounts } from '../data/database';
import { getSettings } from '../data/settings';
import { expressions } from '../expressions/data';
import type { Expression } from '../expressions/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb; onStartSession: () => void };
type SubView = 'training' | 'repertoire';
type Styles = ReturnType<typeof createStyles>;

/** Onglet Expressions et locutions — entraînement SM-2 (flashcards,
 * réutilise [ExpressionReviewContainer.tsx](./ExpressionReviewContainer.tsx))
 * et répertoire consultable, deux sous-onglets calqués sur
 * [ConjugationScreen.tsx](./ConjugationScreen.tsx) (demandé explicitement
 * le 21/08/2026). Pas de sous-onglet Historique/Règles ici — hors
 * périmètre de la demande d'origine, à ajouter plus tard si demandé. */
export function ExpressionsScreen({ db, onStartSession }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('training');

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Expressions</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Entraînement" active={subView === 'training'} onPress={() => setSubView('training')} />
          <SubTabButton styles={styles} label="Répertoire" active={subView === 'repertoire'} onPress={() => setSubView('repertoire')} />
        </View>
      </View>

      {subView === 'training' && <TrainingView db={db} styles={styles} onStartSession={onStartSession} />}
      {subView === 'repertoire' && <RepertoireView styles={styles} />}
    </ScreenContainer>
  );
}

function SubTabButton({ styles, label, active, onPress }: { styles: Styles; label: string; active: boolean; onPress: () => void }) {
  return (
    <AnimatedPressable style={[styles.subTabButton, active && styles.subTabButtonActive]} haptic="none" scaleTo={0.94} onPress={onPress}>
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

// MARK: - Entraînement

function TrainingView({ db, styles, onStartSession }: { db: LexisDb; styles: Styles; onStartSession: () => void }) {
  const [dueCount, setDueCount] = useState(0);
  const [learned, setLearned] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const [due, counts] = await Promise.all([getDueExpressionCardsSplit(db, new Date(), settings), getExpressionCounts(db)]);
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
          <FadeInView duration={400} style={styles.statCard}>
            <Text style={styles.statNumber}>
              {learned} <Text style={styles.statNumberTotal}>/ {total}</Text>
            </Text>
            <Text style={styles.statCaption}>expression{learned !== 1 ? 's' : ''} acquise{learned !== 1 ? 's' : ''}</Text>
          </FadeInView>

          <Text style={styles.trainingHint}>
            Expression ou locution donnée, révèle la traduction et un exemple — {expressions.length} expressions couvertes.
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

// MARK: - Répertoire

const expressionKeyExtractor = (e: Expression) => e.id;

const ExpressionRow = memo(function ExpressionRow({ item, index, styles }: { item: Expression; index: number; styles: Styles }) {
  return (
    <FadeInView duration={220} direction="right" delay={Math.min(index, 12) * 20} style={styles.repertoireRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.wordSpanish}>{item.spanish}</Text>
        <Text style={styles.wordEnglish}>
          {item.english} · {item.theme}
        </Text>
      </View>
    </FadeInView>
  );
});

function RepertoireView({ styles }: { styles: Styles }) {
  const renderItem = useCallback(
    ({ item, index }: { item: Expression; index: number }) => <ExpressionRow item={item} index={index} styles={styles} />,
    [styles]
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      data={expressions}
      keyExtractor={expressionKeyExtractor}
      contentContainerStyle={styles.listContent}
      renderItem={renderItem}
    />
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

    listContent: { paddingTop: 8, paddingBottom: 24 },
    repertoireRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
    },
    wordSpanish: { fontSize: 16, fontWeight: '600', color: t.wordText },
    wordEnglish: { fontSize: 13, color: t.metaText, marginTop: 2 },
  });
}
