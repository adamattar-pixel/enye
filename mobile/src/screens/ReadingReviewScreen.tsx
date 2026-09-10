import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { AzulejoFrieze } from '../components/AzulejoFrieze';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';
import type { ReadingQuestion } from '../reading/types';
import { useGradeKeyboardShortcuts } from '../hooks/useGradeKeyboardShortcuts';

export type ReadingCardData = {
  spanish: string;
  theme: string;
  questions: ReadingQuestion[];
};

type Props = {
  card: ReadingCardData;
  onGrade: (grade: SM2Grade) => void;
};

const GRADE_HAPTICS: Record<SM2Grade, () => Promise<void>> = {
  again: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  hard: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  good: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  easy: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/**
 * Flashcard de compréhension écrite — trois temps, pas deux comme le
 * vocabulaire/les expressions (demandé explicitement le 21/08/2026) :
 * (1) texte seul, (2) questions à choix multiple révélées (l'utilisateur
 * peut choisir une option par simple intérêt, rien n'est validé ici),
 * (3) après "Corregir", les bonnes réponses s'affichent et les 4
 * boutons de notation habituels apparaissent — **aucun mapping
 * automatique correct/incorrect** vers une note SM-2 : contrairement à
 * l'écoute, l'utilisateur reste seul juge de sa propre compréhension.
 */
export function ReadingReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [questionsRevealed, setQuestionsRevealed] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<number, number>>({});

  const handleRevealQuestions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuestionsRevealed(true);
  };

  const handleSelect = (questionIndex: number, optionIndex: number) => {
    if (corrected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedByQuestion((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const handleCorrect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCorrected(true);
  };

  const handleGrade = (grade: SM2Grade) => {
    GRADE_HAPTICS[grade]();
    onGrade(grade);
  };

  useGradeKeyboardShortcuts(corrected, handleGrade);

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={28} paddingVertical={32} style={styles.screen}>
      <FadeInView duration={350} distance={20} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>LEXIS · COMPRENSIÓN LECTORA</Text>
          <View style={styles.dot} />
        </View>

        <Text style={styles.meta}>{card.theme}</Text>
        <Text style={styles.textBlock}>{card.spanish}</Text>

        {!questionsRevealed && (
          <FadeInView duration={250}>
            <AnimatedPressable style={styles.revealButton} haptic="none" onPress={handleRevealQuestions}>
              <Text style={styles.revealButtonText}>Ver preguntas</Text>
            </AnimatedPressable>
          </FadeInView>
        )}

        {questionsRevealed && (
          <FadeInView duration={300} style={{ width: '100%' }}>
            {card.questions.map((q, qIndex) => (
              <View key={qIndex} style={styles.questionBlock}>
                <Text style={styles.questionText}>{q.question}</Text>
                {q.options.map((option, oIndex) => {
                  const isSelected = selectedByQuestion[qIndex] === oIndex;
                  const isCorrectOption = corrected && oIndex === q.correctIndex;
                  const isWrongSelected = corrected && isSelected && oIndex !== q.correctIndex;
                  return (
                    <AnimatedPressable
                      key={oIndex}
                      style={[
                        styles.optionRow,
                        isSelected && !corrected && styles.optionRowSelected,
                        isCorrectOption && styles.optionRowCorrect,
                        isWrongSelected && styles.optionRowWrong,
                      ]}
                      haptic="none"
                      onPress={() => handleSelect(qIndex, oIndex)}
                    >
                      <Text style={styles.optionText}>{option}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            ))}

            {!corrected ? (
              <AnimatedPressable style={styles.revealButton} haptic="none" onPress={handleCorrect}>
                <Text style={styles.revealButtonText}>Corregir</Text>
              </AnimatedPressable>
            ) : (
              <>
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
            )}
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot },
    meta: { fontSize: 12, color: t.metaText, marginBottom: 10, textTransform: 'capitalize' },
    textBlock: { fontSize: 17, lineHeight: 25, color: t.wordText, marginBottom: 20 },
    revealButton: {
      height: 56,
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    revealButtonText: { color: t.buttonOutline, fontWeight: '600', fontSize: 15 },
    questionBlock: { marginBottom: 18 },
    questionText: { fontSize: 15, fontWeight: '600', color: t.wordText, marginBottom: 10 },
    optionRow: {
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    optionRowSelected: { borderColor: t.buttonOutline, backgroundColor: t.translationBackground },
    optionRowCorrect: { borderColor: '#4C7A5E', backgroundColor: t.translationBackground },
    optionRowWrong: { borderColor: t.dot, backgroundColor: t.translationBackground },
    optionText: { fontSize: 14, color: t.wordText },
    ticketDash: { borderTopWidth: 1.5, borderTopColor: t.ticketDash, borderStyle: 'dashed', marginTop: 12, marginBottom: 16 },
    buttonRowTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    buttonRowBottom: { flexDirection: 'row', gap: 12 },
    pill: { flex: 1, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    pillOutline: { borderWidth: 2, borderColor: t.buttonOutline, backgroundColor: 'transparent' },
    pillOutlineText: { color: t.buttonOutline, fontWeight: '700', fontSize: 16 },
    pillFilled: { backgroundColor: t.buttonFilled },
    pillFilledText: { color: t.buttonFilledText, fontWeight: '700', fontSize: 16 },
  });
}
