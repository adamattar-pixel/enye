import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueCards, updateCard, logReview, type DueCardRow } from '../data/database';
import { getSettings } from '../data/settings';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { refillNotificationQueue } from '../notifications/queue';
import { ReviewScreen } from './ReviewScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

// Plafond quotidien retenu (8 nouvelles + 22 révisions, voir PLAN.md).
// La séparation nouvelles/révisions n'est pas encore faite ici — sert
// pour l'instant de plafond global sur `getDueCards`.
const DAILY_CARD_LIMIT = 30;

type Props = {
  db: SQLiteDatabase;
  onExit: () => void;
};

/** L'écran de session, branché à SQLite + SM-2 : affiche la carte la
 * plus ancienne due, persiste le résultat de `SM2Engine.review()` à
 * chaque note, journalise pour les statistiques, et recharge la file de
 * notifications (même règle que côté notification : chaque note tient
 * la file à jour). */
export function ReviewScreenContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueCardRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    const due = await getDueCards(db, new Date(), DAILY_CARD_LIMIT);
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
      await updateCard(db, current.word.id, nextState);
      await logReview(db, current.word.id, grade, now);

      const settings = await getSettings(db);
      await refillNotificationQueue(db, settings, now);

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

  if (!current) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucune carte due pour l'instant — bravo !</Text>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ReviewScreen
        // Remonte le composant à chaque nouvelle carte pour rejouer
        // l'animation d'entrée (sinon React ne fait que mettre à jour le
        // texte en place, sans réanimation).
        key={current.word.id}
        card={{
          word: current.word.spanish,
          translation: current.word.french,
          partOfSpeech: current.word.partOfSpeech,
          gender: current.word.gender,
          level: current.word.level,
        }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Aujourd'hui</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    center: {
      flex: 1,
      backgroundColor: t.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center', marginBottom: 16 },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
    exitLink: { alignItems: 'center', paddingVertical: 14, backgroundColor: t.cardBackground },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
  });
}
