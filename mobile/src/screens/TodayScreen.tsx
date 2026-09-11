import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { LexisDb } from '../data/dbTypes';
import { getDueCardsSplit, getReviewCountSince, getAllReviews } from '../data/database';
import { getSettings } from '../data/settings';
import { computeStreak, computeLostStreakLength } from '../stats/statsEngine';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = {
  db: LexisDb;
  onStartSession: (mode: 'vocab' | 'vocabWriting') => void;
};
type Styles = ReturnType<typeof createStyles>;

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
  const [streak, setStreak] = useState(0);
  const [lostStreak, setLostStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const progressWidth = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(async () => {
    const now = new Date();
    const settings = await getSettings(db);
    const cap = settings.newCardsPerDay + settings.reviewCapPerDay;
    setDailyCap(cap);

    const due = await getDueCardsSplit(db, now, settings);
    setDueCount(due.length);

    const done = await getReviewCountSince(db, startOfToday());
    setDoneToday(done);

    // Badge de série (voir docs/AUDIT.md, 20/08/2026) : réutilise
    // `computeStreak` déjà utilisé par Statistiques, pas de nouvelle
    // logique de calcul de série dupliquée.
    const reviews = await getAllReviews(db);
    const reviewDates = reviews.map((r) => r.reviewedAt);
    const currentStreak = computeStreak(reviewDates, now);
    setStreak(currentStreak);
    setLostStreak(currentStreak === 0 ? computeLostStreakLength(reviewDates, now) : 0);

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
          <StreakBadge styles={styles} streak={streak} lostStreak={lostStreak} />

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
              onPress={() => onStartSession('vocab')}
              disabled={dueCount === 0}
            >
              <Text style={styles.buttonText}>{dueCount === 0 ? 'Rien à réviser' : 'Commencer la session'}</Text>
            </AnimatedPressable>
          </FadeInView>

          {dueCount > 0 && (
            <FadeInView duration={400} delay={220}>
              <AnimatedPressable
                style={[styles.button, styles.buttonOutline]}
                haptic="selection"
                onPress={() => onStartSession('vocabWriting')}
              >
                <Text style={styles.buttonOutlineText}>Écrire les mots</Text>
              </AnimatedPressable>
            </FadeInView>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

/**
 * Badge de série de jours consécutifs, demandé explicitement (20/08/2026).
 * Placé sur Aujourd'hui plutôt que Statistiques (qui affiche déjà le même
 * nombre comme simple tuile) : c'est le premier écran ouvert, l'endroit
 * où "ne pas casser la chaîne" pèse le plus sur la décision de réviser
 * ou non aujourd'hui — Statistiques est consultée après coup, pas avant.
 *
 * Toujours visible, y compris à 0 (choisi explicitement plutôt que
 * masqué) : à 0 sans série antérieure, invite à commencer ; à 0 avec une
 * série interrompue, le rappelle explicitement plutôt que d'afficher un
 * simple "0 jour" neutre (choisi explicitement aussi) — voir docs/AUDIT.md.
 */
function StreakBadge({ styles, streak, lostStreak }: { styles: Styles; streak: number; lostStreak: number }) {
  let emoji: string;
  let text: string;

  if (streak > 0) {
    emoji = '🔥';
    text = `${streak} jour${streak !== 1 ? 's' : ''} de suite`;
  } else if (lostStreak > 0) {
    emoji = '💔';
    text = `Série interrompue — tu avais ${lostStreak} jour${lostStreak !== 1 ? 's' : ''} de suite`;
  } else {
    emoji = '✨';
    text = "Commence une série aujourd'hui";
  }

  return (
    <FadeInView duration={350} style={styles.streakBadge}>
      <Text style={styles.streakEmoji}>{emoji}</Text>
      <Text style={styles.streakText}>{text}</Text>
    </FadeInView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 24 },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: t.translationBackground,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginBottom: 16,
      gap: 8,
    },
    streakEmoji: { fontSize: 16 },
    streakText: { fontSize: 13, fontWeight: '600', color: t.translationText, flexShrink: 1 },
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
    button: {
      minHeight: 52,
      backgroundColor: t.buttonFilled,
      paddingVertical: 16,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { backgroundColor: t.cardBorder, opacity: 0.5 },
    buttonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 16 },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline, marginTop: 12 },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600', fontSize: 16 },
  });
}
