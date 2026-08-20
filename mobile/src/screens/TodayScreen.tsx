import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueCards, getReviewCountSince } from '../data/database';
import { getSettings } from '../data/settings';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = {
  db: SQLiteDatabase;
  onStartSession: () => void;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function TodayScreen({ db, onStartSession }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [dueCount, setDueCount] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [dailyCap, setDailyCap] = useState(30);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const cap = settings.newCardsPerDay + settings.reviewCapPerDay;
    setDailyCap(cap);

    const due = await getDueCards(db, new Date(), cap);
    setDueCount(due.length);

    const done = await getReviewCountSince(db, startOfToday());
    setDoneToday(done);

    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const progress = dailyCap > 0 ? Math.min(1, doneToday / dailyCap) : 0;

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.label}>LEXIS</Text>
      <Text style={styles.title}>Aujourd'hui</Text>

      {!loading && (
        <>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{dueCount}</Text>
            <Text style={styles.statCaption}>carte{dueCount !== 1 ? 's' : ''} due{dueCount !== 1 ? 's' : ''}</Text>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {doneToday} / {dailyCap} révisées aujourd'hui
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, dueCount === 0 && styles.buttonDisabled]}
            onPress={onStartSession}
            disabled={dueCount === 0}
          >
            <Text style={styles.buttonText}>{dueCount === 0 ? 'Rien à réviser' : 'Commencer la session'}</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.cardBackground, padding: 20 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 24 },
    statCard: {
      backgroundColor: t.translationBackground,
      borderRadius: 16,
      paddingVertical: 28,
      alignItems: 'center',
      marginBottom: 20,
    },
    statNumber: { fontSize: 44, fontWeight: '700', color: t.wordText },
    statCaption: { fontSize: 14, color: t.metaText, marginTop: 4 },
    progressRow: { marginBottom: 24 },
    progressText: { fontSize: 13, color: t.metaText, marginBottom: 8 },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: t.translationBackground, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: t.buttonFilled, borderRadius: 4 },
    button: { backgroundColor: t.buttonFilled, paddingVertical: 16, borderRadius: 24, alignItems: 'center' },
    buttonDisabled: { backgroundColor: t.cardBorder, opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },
  });
}
