import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueReadingCardsSplit, getReadingCounts } from '../data/database';
import { getSettings } from '../data/settings';
import { readingTexts } from '../reading/data';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onStartSession: () => void };

/** Onglet Compréhension écrite — pas de sous-onglets (contrairement à
 * Expressions/Conjugaison) : uniquement un point d'entrée
 * statistiques + bouton "Commencer la session", même contenu que la vue
 * Entraînement des autres domaines mais sans les sous-onglets Répertoire/
 * Historique/Règles, non demandés pour ce domaine le 21/08/2026 — un
 * texte de compréhension se prête moins à un "répertoire" consultable
 * qu'un mot ou une expression. */
export function ReadingScreen({ db, onStartSession }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [dueCount, setDueCount] = useState(0);
  const [learned, setLearned] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const [due, counts] = await Promise.all([getDueReadingCardsSplit(db, new Date(), settings), getReadingCounts(db)]);
    setDueCount(due.length);
    setLearned(counts.learned);
    setTotal(counts.total);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Compréhension écrite</Text>
      </View>

      {!loading && (
        <View style={styles.trainingContent}>
          <FadeInView duration={400} style={styles.statCard}>
            <Text style={styles.statNumber}>
              {learned} <Text style={styles.statNumberTotal}>/ {total}</Text>
            </Text>
            <Text style={styles.statCaption}>texte{learned !== 1 ? 's' : ''} acquis{learned !== 1 ? 's' : ''}</Text>
          </FadeInView>

          <Text style={styles.trainingHint}>
            Mini-texte en espagnol, questions de compréhension à choix multiple — tu notes toi-même ta compréhension
            après correction. {readingTexts.length} textes couverts.
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
      )}
    </ScreenContainer>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    header: { paddingTop: 20, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },

    trainingContent: { flex: 1, paddingTop: 16 },
    statCard: { backgroundColor: t.translationBackground, borderRadius: 16, paddingVertical: 28, alignItems: 'center', marginBottom: 16 },
    statNumber: { fontSize: 44, fontWeight: '700', color: t.wordText },
    statNumberTotal: { fontSize: 22, fontWeight: '600', color: t.metaText },
    statCaption: { fontSize: 14, color: t.metaText, marginTop: 4 },
    trainingHint: { fontSize: 13, color: t.metaText, lineHeight: 18, marginBottom: 24, marginTop: 8 },
    button: { backgroundColor: t.buttonFilled, paddingVertical: 16, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },
  });
}
