import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueReadingCardsSplit, updateReadingCard, logReadingReview, type DueReadingCardRow } from '../data/database';
import { getSettings } from '../data/settings';
import { getReadingText } from '../reading/data';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ReadingReviewScreen } from './ReadingReviewScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase; onExit: () => void };

/** Écran de session pour l'onglet Compréhension écrite — même rôle que
 * [ExpressionReviewContainer.tsx](./ExpressionReviewContainer.tsx),
 * branché sur `reading_cards`/`reading_reviews`. Pas de notifications
 * verrouillées (même périmètre que les autres domaines in-app-only, voir
 * Decision 006 dans docs/DECISIONS.md). */
export function ReadingReviewContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueReadingCardRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueReadingCardsSplit(db, new Date(), settings);
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
      await updateReadingCard(db, current.cardId, nextState);
      await logReadingReview(db, current.cardId, grade, now);
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

  const text = current ? getReadingText(current.cardId) : null;

  if (!current || !text) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucun texte dû pour l'instant — bravo !</Text>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ReadingReviewScreen
        key={current.cardId}
        card={{ spanish: text.spanish, theme: text.theme, questions: text.questions }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Compréhension écrite</Text>
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
