import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { AzulejoFrieze } from '../components/AzulejoFrieze';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';
import { useGradeKeyboardShortcuts } from '../hooks/useGradeKeyboardShortcuts';

export type ExpressionCardData = {
  spanish: string;
  english: string;
  exampleEs: string;
  exampleEn: string;
  theme: string;
};

type Props = {
  card: ExpressionCardData;
  onGrade: (grade: SM2Grade) => void;
};

const GRADE_HAPTICS: Record<SM2Grade, () => Promise<void>> = {
  again: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  hard: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  good: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  easy: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/**
 * Flashcard d'expressions — calquée sur [ReviewScreen.tsx](./ReviewScreen.tsx)
 * (vocabulaire) : révélation classique (expression seule → traduction +
 * exemple + notation), pas de saisie clavier (demandé explicitement le
 * 21/08/2026, contrairement à la conjugaison). Remontée par l'appelant
 * (`key={card.spanish}`) à chaque nouvelle carte, même principe que
 * `ReviewScreen`.
 */
export function ExpressionReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [revealed, setRevealed] = useState(false);

  const handleReveal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRevealed(true);
  };

  const handleGrade = (grade: SM2Grade) => {
    GRADE_HAPTICS[grade]();
    onGrade(grade);
  };

  useGradeKeyboardShortcuts(revealed, handleGrade);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={28} paddingVertical={32} style={styles.screen}>
      <FadeInView duration={350} distance={20} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>LEXIS · EXPRESIONES</Text>
          <View style={styles.dot} />
        </View>

        <View style={styles.wordRow}>
          <Text style={styles.word}>{card.spanish}</Text>
          <AnimatedPressable
            style={styles.speakButton}
            haptic={Haptics.ImpactFeedbackStyle.Light}
            accessibilityLabel={`Écouter la prononciation de ${card.spanish}`}
            onPress={() => Speech.speak(card.spanish, { language: 'es-ES' })}
          >
            <Text style={styles.speakButtonText}>Écouter</Text>
          </AnimatedPressable>
        </View>
        <Text style={styles.meta}>{card.theme}</Text>

        {revealed ? (
          <>
            <FadeInView duration={300} style={styles.translationBlock}>
              <Text style={styles.translationText}>{card.english}</Text>
              <Text style={styles.exampleEs}>{card.exampleEs}</Text>
              <Text style={styles.exampleEn}>{card.exampleEn}</Text>
            </FadeInView>

            <View style={styles.ticketDash} />

            <FadeInView duration={300} delay={80}>
              <View style={styles.buttonRowTop}>
                <GradeButton styles={styles} label="Otra vez" variant="outline" onPress={() => handleGrade('again')} />
                <GradeButton styles={styles} label="Difícil" variant="outline" onPress={() => handleGrade('hard')} />
              </View>
              <View style={styles.buttonRowBottom}>
                <GradeButton styles={styles} label="Bien" variant="filled" onPress={() => handleGrade('good')} />
                <GradeButton styles={styles} label="Fácil" variant="filled" onPress={() => handleGrade('easy')} />
              </View>
            </FadeInView>
          </>
        ) : (
          <FadeInView duration={250}>
            <AnimatedPressable style={styles.revealButton} haptic="none" onPress={handleReveal}>
              <Text style={styles.revealButtonText}>Ver traducción</Text>
            </AnimatedPressable>
          </FadeInView>
        )}

        <AzulejoFrieze theme={theme} />
      </FadeInView>
    </ScreenContainer>
  );
}

function GradeButton({
  styles,
  label,
  variant,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  variant: 'outline' | 'filled';
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.pill, variant === 'outline' ? styles.pillOutline : styles.pillFilled]}
      haptic="none"
      scaleTo={0.94}
      onPress={onPress}
    >
      <Text style={variant === 'outline' ? styles.pillOutlineText : styles.pillFilledText}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screen: { justifyContent: 'center' },
    card: {
      backgroundColor: t.cardBackground,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      borderRadius: 16,
      padding: 22,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 3,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot },
    wordRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    word: { fontFamily: 'Georgia', fontSize: 24, fontWeight: '600', color: t.wordText, flexShrink: 1, marginRight: 8 },
    speakButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: t.buttonOutline },
    speakButtonText: { fontSize: 11, fontWeight: '600', color: t.buttonOutline },
    meta: { fontSize: 13, color: t.metaText, marginTop: 4, marginBottom: 20 },
    revealButton: {
      height: 56,
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revealButtonText: { color: t.buttonOutline, fontWeight: '600', fontSize: 15 },
    translationBlock: { backgroundColor: t.translationBackground, borderRadius: 14, padding: 16, width: '100%' },
    translationText: { fontSize: 17, fontWeight: '700', color: t.translationText },
    exampleEs: { fontSize: 14, color: t.translationText, marginTop: 10, fontStyle: 'italic' },
    exampleEn: { fontSize: 13, color: t.metaText, marginTop: 4 },
    ticketDash: { borderTopWidth: 1.5, borderTopColor: t.ticketDash, borderStyle: 'dashed', marginTop: 24, marginBottom: 16 },
    buttonRowTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    buttonRowBottom: { flexDirection: 'row', gap: 12 },
    pill: { flex: 1, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    pillOutline: { borderWidth: 2, borderColor: t.buttonOutline, backgroundColor: 'transparent' },
    pillOutlineText: { color: t.buttonOutline, fontWeight: '700', fontSize: 16 },
    pillFilled: { backgroundColor: t.buttonFilled },
    pillFilledText: { color: t.buttonFilledText, fontWeight: '700', fontSize: 16 },
  });
}
