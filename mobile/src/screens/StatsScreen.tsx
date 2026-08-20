import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getAllReviews,
  getAllDueDates,
  getWordCounts,
  getReviewHistory,
  updateReviewGrade,
  type ReviewHistoryRow,
} from '../data/database';
import { computeStreak, computeSuccessRate, computeForecast } from '../stats/statsEngine';
import type { SM2Grade } from '../sm2/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase };
type SubView = 'stats' | 'history';
type Styles = ReturnType<typeof createStyles>;

const FORECAST_DAYS = 7;
const DAY_LABELS = ['Auj.', 'J+1', 'J+2', 'J+3', 'J+4', 'J+5', 'J+6'];

const GRADE_LABELS: Record<SM2Grade, string> = {
  again: 'Otra vez',
  hard: 'Difícil',
  good: 'Bien',
  easy: 'Fácil',
};

const GRADES: SM2Grade[] = ['again', 'hard', 'good', 'easy'];

/** Statistiques + Historique des révisions, en sous-onglets d'un même
 * onglet — l'historique vivait auparavant dans Réglages, déplacé ici le
 * 20/08/2026 sur demande explicite (les deux parlent de la même chose :
 * ce qui s'est passé pendant les révisions, contrairement à Réglages qui
 * ne concerne que la configuration de l'app). Même patron de sous-onglets
 * que ConjugationScreen.tsx/SettingsScreen.tsx/ListeningScreen.tsx. */
export function StatsScreen({ db }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('stats');

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Statistiques</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Statistiques" active={subView === 'stats'} onPress={() => setSubView('stats')} />
          <SubTabButton styles={styles} label="Historique" active={subView === 'history'} onPress={() => setSubView('history')} />
        </View>
      </View>

      {subView === 'stats' && <StatsView db={db} styles={styles} />}
      {subView === 'history' && <HistoryView db={db} styles={styles} />}
    </ScreenContainer>
  );
}

function SubTabButton({ styles, label, active, onPress }: { styles: Styles; label: string; active: boolean; onPress: () => void }) {
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

// MARK: - Statistiques

function StatsView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
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
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

// MARK: - Historique

/** Historique des révisions — mot, traduction, note, avec correction
 * possible en cas de mauvais clic. Déplacé depuis Réglages (voir
 * commentaire en tête de fichier) sans changement de comportement. */
function HistoryView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [rows, setRows] = useState<ReviewHistoryRow[]>([]);
  const [editing, setEditing] = useState<ReviewHistoryRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setRows(await getReviewHistory(db));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePickGrade = async (grade: SM2Grade) => {
    if (!editing) return;
    await updateReviewGrade(db, editing.id, grade);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
    await refresh();
  };

  if (loading) return null;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.historyHint}>
        Touchez une note pour la corriger en cas de mauvais clic. Corriger ici met à jour les statistiques mais ne
        change pas la prochaine date de révision déjà programmée pour ce mot.
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <FadeInView duration={220} direction="right" delay={Math.min(index, 12) * 20} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wordSpanish}>{item.spanish}</Text>
              <Text style={styles.wordEnglish}>{item.english}</Text>
              <Text style={styles.historyDate}>
                {item.reviewedAt.toLocaleDateString()} · {item.reviewedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <AnimatedPressable
              style={[styles.gradeBadge, styles[`gradeBadge_${item.grade}` as const]]}
              haptic={Haptics.ImpactFeedbackStyle.Light}
              onPress={() => setEditing(item)}
            >
              <Text style={styles.gradeBadgeText}>{GRADE_LABELS[item.grade]}</Text>
            </AnimatedPressable>
          </FadeInView>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aucune révision pour l'instant.</Text>}
      />

      <Modal visible={editing !== null} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.editCard}>
            {editing && (
              <>
                <Text style={styles.modalTitle}>{editing.spanish}</Text>
                <Text style={styles.wordEnglish}>{editing.english}</Text>
                <View style={styles.editGradeGrid}>
                  {GRADES.map((grade) => (
                    <AnimatedPressable
                      key={grade}
                      style={[styles.editGradeButton, styles[`gradeBadge_${grade}` as const]]}
                      haptic="none"
                      scaleTo={0.94}
                      onPress={() => handlePickGrade(grade)}
                    >
                      <Text style={styles.gradeBadgeText}>{GRADE_LABELS[grade]}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
                <AnimatedPressable style={[styles.button, styles.buttonOutline, { marginTop: 4 }]} haptic="none" onPress={() => setEditing(null)}>
                  <Text style={styles.buttonOutlineText}>Annuler</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </View>
      </Modal>
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

    content: { paddingTop: 16, paddingBottom: 40 },
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

    listContent: { paddingTop: 8, paddingBottom: 60 },
    wordSpanish: { fontSize: 16, fontWeight: '600', color: t.wordText },
    wordEnglish: { fontSize: 13, color: t.metaText, marginTop: 2 },
    empty: { color: t.metaText, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

    historyHint: { fontSize: 12, color: t.metaText, paddingTop: 4, paddingBottom: 12, lineHeight: 17 },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.translationBackground,
      gap: 12,
    },
    historyDate: { fontSize: 11, color: t.metaText, marginTop: 4 },
    gradeBadge: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, minWidth: 76, alignItems: 'center' },
    gradeBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    gradeBadge_again: { backgroundColor: '#B5533C' },
    gradeBadge_hard: { backgroundColor: '#C98A3E' },
    gradeBadge_good: { backgroundColor: '#4C7A5E' },
    gradeBadge_easy: { backgroundColor: '#3D6E8C' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalTitle: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: t.wordText, marginBottom: 16 },

    editCard: { backgroundColor: t.cardBackground, borderRadius: 20, padding: 24, margin: 24, alignSelf: 'stretch' },
    editGradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18, marginBottom: 8 },
    editGradeButton: { flexBasis: '47%', paddingVertical: 14, borderRadius: 20, alignItems: 'center' },

    button: { flex: 1, backgroundColor: t.buttonFilled, paddingVertical: 14, borderRadius: 24, alignItems: 'center' },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
