import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueCardsSplit, getReviewCountSince } from '../data/database';
import { getSettings } from '../data/settings';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
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

  const progressWidth = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(async () => {
    const settings = await getSettings(db);
    const cap = settings.newCardsPerDay + settings.reviewCapPerDay;
    setDailyCap(cap);

    const due = await getDueCardsSplit(db, new Date(), settings);
    setDueCount(due.length);

    const done = await getReviewCountSince(db, startOfToday());
    setDoneToday(done);

    Animated.timing(progressWidth, {
      toValue: cap > 0 ? Math.min(1, done / cap) : 0,
      duration: 600,
      useNativeDriver: false,
    }).start();

    setLoading(false);
  }, [db, progressWidth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground}>
      <Text style={styles.label}>LEXIS</Text>
      <Text style={styles.title}>Aujourd'hui</Text>

      {!loading && (
        <>
          <FadeInView duration={400} style={styles.statCard}>
            <Text style={styles.statNumber}>{dueCount}</Text>
            <Text style={styles.statCaption}>carte{dueCount !== 1 ? 's' : ''} due{dueCount !== 1 ? 's' : ''}</Text>
          </FadeInView>

          <FadeInView duration={400} delay={80} style={styles.progressRow}>
            <Text style={styles.progressText}>
              {doneToday} / {dailyCap} révisées aujourd'hui
            </Text>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: progressWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            </View>
          </FadeInView>

          <FadeInView duration={400} delay={160}>
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
    </ScreenContainer>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
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
