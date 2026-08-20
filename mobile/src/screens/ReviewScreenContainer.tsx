import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { DB_NAME, migrateDbIfNeeded, seedIfEmpty, getDueCards, updateCard, type DueCardRow } from '../data/database';
import { parseWords } from '../data/wordRepository';
import wordsJson from '../data/words.json';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ReviewScreen } from './ReviewScreen';
import { solYSombra } from '../theme/solYSombra';

// Plafond quotidien retenu (8 nouvelles + 22 révisions, voir PLAN.md).
// La séparation nouvelles/révisions n'est pas encore faite ici — sert
// pour l'instant de plafond global sur `getDueCards`.
const DAILY_CARD_LIMIT = 30;

/** Branche l'écran de révision à SQLite + SM-2 : importe words.json au
 * premier lancement, affiche la carte la plus ancienne due, et persiste
 * le résultat de `SM2Engine.review()` à chaque note. */
export function ReviewScreenContainer() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [current, setCurrent] = useState<DueCardRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async (database: SQLite.SQLiteDatabase) => {
    const due = await getDueCards(database, new Date(), DAILY_CARD_LIMIT);
    setCurrent(due[0] ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await migrateDbIfNeeded(database);
      await seedIfEmpty(database, parseWords(wordsJson));
      setDb(database);
      await loadNext(database);
      setLoading(false);
    })();
  }, [loadNext]);

  const handleGrade = useCallback(
    async (grade: SM2Grade) => {
      if (!db || !current) return;
      const nextState = review(current.card, grade, new Date());
      await updateCard(db, current.word.id, nextState);
      await loadNext(db);
    },
    [db, current, loadNext]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={solYSombra.buttonFilled} />
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucune carte due pour l'instant — bravo !</Text>
      </SafeAreaView>
    );
  }

  return (
    <ReviewScreen
      card={{
        word: current.word.spanish,
        translation: current.word.french,
        partOfSpeech: current.word.partOfSpeech,
        gender: current.word.gender,
        level: current.word.level,
      }}
      onGrade={handleGrade}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: solYSombra.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  doneText: { color: solYSombra.wordText, fontSize: 16, textAlign: 'center' },
});
