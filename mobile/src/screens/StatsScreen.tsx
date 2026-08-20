import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAllReviews, getAllDueDates, getWordCounts } from '../data/database';
import { computeStreak, computeSuccessRate, computeForecast } from '../stats/statsEngine';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase };
type Styles = ReturnType<typeof createStyles>;

const FORECAST_DAYS = 7;
const DAY_LABELS = ['Auj.', 'J+1', 'J+2', 'J+3', 'J+4', 'J+5', 'J+6'];

export function StatsScreen({ db }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [streak, setStreak] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [learned, setLearned] = useState(0);
  const [total, setTotal] = useState(0);
  const [forecast, setForecast] = useState<number[]>(new Array(FORECAST_DAYS).fill(0));

  const refresh = useCallback(async () => {
    const now = new Date();
    const reviews = await getAllReviews(db);
    setStreak(computeStreak(reviews.map((r) => r.reviewedAt), now));
    setSuccessRate(computeSuccessRate(reviews.map((r) => r.grade)));

    const counts = await getWordCounts(db);
    setLearned(counts.learned);
    setTotal(counts.total);

    const dueDates = await getAllDueDates(db);
    setForecast(computeForecast(dueDates, now, FORECAST_DAYS));
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const maxForecast = Math.max(1, ...forecast);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={0} paddingVertical={0}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Statistiques</Text>

        <View style={styles.statRow}>
          <StatTile styles={styles} delay={0} number={streak} caption={`jour${streak !== 1 ? 's' : ''} de suite`} />
          <StatTile styles={styles} delay={60} number={`${Math.round(successRate * 100)}%`} caption="taux de réussite" />
        </View>

        <View style={styles.statRow}>
          <StatTile styles={styles} delay={120} number={learned} caption="mots appris" />
          <StatTile styles={styles} delay={180} number={total} caption="mots au total" />
        </View>

        <Text style={styles.sectionTitle}>Charge à venir</Text>
        <View style={styles.forecastRow}>
          {forecast.map((count, index) => (
            <ForecastBar
              key={index}
              styles={styles}
              count={count}
              heightRatio={Math.max(0.05, count / maxForecast)}
              label={DAY_LABELS[index]}
              delay={index * 60}
            />
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function StatTile({
  styles,
  number,
  caption,
  delay,
}: {
  styles: Styles;
  number: number | string;
  caption: string;
  delay: number;
}) {
  return (
    <FadeInView duration={400} delay={delay} style={styles.tile}>
      <Text style={styles.tileNumber}>{number}</Text>
      <Text style={styles.tileCaption}>{caption}</Text>
    </FadeInView>
  );
}

function ForecastBar({
  styles,
  count,
  heightRatio,
  label,
  delay,
}: {
  styles: Styles;
  count: number;
  heightRatio: number;
  label: string;
  delay: number;
}) {
  const height = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(height, { toValue: heightRatio, duration: 500, delay, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [heightRatio, delay, height]);

  return (
    <FadeInView duration={300} delay={delay} style={styles.forecastBarWrapper}>
      <View style={styles.forecastTrack}>
        <Animated.View
          style={[styles.forecastBar, { height: height.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
      <Text style={styles.forecastCount}>{count}</Text>
      <Text style={styles.forecastLabel}>{label}</Text>
    </FadeInView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    content: { padding: 24, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 24 },
    statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    tile: {
      flex: 1,
      backgroundColor: t.translationBackground,
      borderRadius: 16,
      paddingVertical: 20,
      alignItems: 'center',
    },
    tileNumber: { fontSize: 28, fontWeight: '700', color: t.wordText },
    tileCaption: { fontSize: 12, color: t.metaText, marginTop: 4, textAlign: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: t.wordText, marginTop: 20, marginBottom: 12 },
    forecastRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      height: 140,
    },
    forecastBarWrapper: { flex: 1, alignItems: 'center' },
    forecastTrack: {
      width: 18,
      height: 90,
      borderRadius: 9,
      backgroundColor: t.translationBackground,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    forecastBar: { width: '100%', backgroundColor: t.buttonFilled, borderRadius: 9 },
    forecastCount: { fontSize: 11, color: t.wordText, marginTop: 6, fontWeight: '600' },
    forecastLabel: { fontSize: 10, color: t.metaText, marginTop: 2 },
  });
}
