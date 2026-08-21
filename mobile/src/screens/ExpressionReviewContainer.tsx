import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getDueExpressionCardsSplit,
  updateExpressionCard,
  logExpressionReview,
  type DueExpressionCardRow,
} from '../data/database';
import { getSettings } from '../data/settings';
import { getExpression } from '../expressions/data';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ExpressionReviewScreen } from './ExpressionReviewScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onExit: () => void };

/** Écran de session pour l'onglet Expressions — même rôle que
 * [ConjugationReviewContainer.tsx](./ConjugationReviewContainer.tsx),
 * branché sur `expression_cards`/`expression_reviews`. Pas de
 * rechargement de file de notifications : les expressions ne sont pas
 * intégrées aux notifications verrouillées (même périmètre que la
 * conjugaison/l'écoute, voir Decision 006 dans docs/DECISIONS.md). */
export function ExpressionReviewContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueExpressionCardRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueExpressionCardsSplit(db, new Date(), settings);
    setCurrent(due[0] ?? null);
  }, [db]);

  useEffect(() => {
    (async () => {
      await loadNext();
      setLoading(false);
    })();
  }, [loadNext]);

  const handleGrade = useCallback(
    async (grade: SM2Grade) => {
      if (!current) return;
      const now = new Date();
      const nextState = review(current.card, grade, now);
      await updateExpressionCard(db, current.cardId, nextState);
      await logExpressionReview(db, current.cardId, grade, now);
      await loadNext();
    },
    [db, current, loadNext]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  const expression = current ? getExpression(current.cardId) : null;

  if (!current || !expression) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucune expression due pour l'instant — bravo !</Text>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ExpressionReviewScreen
        key={current.cardId}
        card={{
          spanish: expression.spanish,
          english: expression.english,
          exampleEs: expression.exampleEs,
          exampleEn: expression.exampleEn,
          theme: expression.theme,
        }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Expressions</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    center: { flex: 1, backgroundColor: t.cardBackground, alignItems: 'center', justifyContent: 'center', padding: 20 },
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center', marginBottom: 16 },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
    exitLink: { alignItems: 'center', paddingVertical: 14, backgroundColor: t.cardBackground },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
  });
}
