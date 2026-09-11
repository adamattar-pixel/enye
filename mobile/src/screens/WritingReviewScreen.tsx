import { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { AzulejoFrieze } from '../components/AzulejoFrieze';
import { isExactMatch } from '../validation/textAnswer';
import { formatMeta, useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';
import { useGradeKeyboardShortcuts } from '../hooks/useGradeKeyboardShortcuts';

export type WritingCardData = {
  english: string;
  expectedSpanish: string;
  partOfSpeech: string;
  gender: string | null;
  level: string;
};

type Props = {
  card: WritingCardData;
  onGrade: (grade: SM2Grade) => void;
};

const GRADE_HAPTICS: Record<SM2Grade, () => Promise<void>> = {
  again: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  hard: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  good: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  easy: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/**
 * Mode "Écrire" du vocabulaire — demandé explicitement le 11/09/2026, en
 * plus des flashcards existantes ([ReviewScreen.tsx](./ReviewScreen.tsx)),
 * pas à leur place : le mot anglais est donné, la traduction espagnole se
 * tape au clavier plutôt que se révèle. Calqué sur
 * [ConjugationReviewScreen.tsx](./ConjugationReviewScreen.tsx) (même
 * principe déjà en place pour la conjugaison) : la comparaison
 * correct/incorrect **informe** la note mais ne la choisit pas à la
 * place de l'utilisateur — les 4 mêmes boutons (Otra vez/Difícil/Bien/
 * Fácil) restent disponibles après validation. Comparaison tolérante aux
 * accents/casse/ponctuation via `isExactMatch` (déjà partagée avec la
 * compréhension orale), pas de logique de validation dupliquée.
 */
export function WritingReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = formatMeta(card.partOfSpeech, card.gender, card.level);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const correct = isExactMatch(answer, card.expectedSpanish);
    setIsCorrect(correct);
    setSubmitted(true);
    Haptics.impactAsync(correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleGrade = (grade: SM2Grade) => {
    GRADE_HAPTICS[grade]();
    onGrade(grade);
  };

  useGradeKeyboardShortcuts(submitted, handleGrade);

  return (
    // Même geste "toucher en dehors du champ ferme le clavier" que la
    // conjugaison — voir ConjugationReviewScreen.tsx pour le détail.
    <Pressable style={styles.screenPressable} onPress={Keyboard.dismiss}>
      <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={28} paddingVertical={32} style={styles.screen}>
        <FadeInView duration={350} distance={20} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.label}>LEXIS · ÉCRIRE</Text>
            <View style={styles.dot} />
          </View>

          <Text style={styles.word}>{card.english}</Text>
          <Text style={styles.meta}>{meta}</Text>

          {!submitted ? (
            <FadeInView duration={250}>
              <TextInput
                style={styles.input}
                value={answer}
                onChangeText={setAnswer}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                placeholder="Tape la traduction en espagnol…"
                placeholderTextColor={theme.metaText}
                keyboardAppearance="dark"
                onSubmitEditing={handleSubmit}
                returnKeyType="done"
              />
              <AnimatedPressable style={styles.revealButton} haptic="none" disabled={!answer.trim()} onPress={handleSubmit}>
                <Text style={styles.revealButtonText}>Valider</Text>
              </AnimatedPressable>
            </FadeInView>
          ) : (
            <>
              <FadeInView
                duration={300}
                style={[styles.translationBlock, isCorrect ? styles.resultCorrect : styles.resultWrong]}
              >
                <Text style={styles.resultLabel}>{isCorrect ? '✓ Correct' : `✗ Ta réponse : ${answer}`}</Text>
                <Text style={styles.translationText}>{card.expectedSpanish}</Text>
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
          )}

          <AzulejoFrieze theme={theme} />
        </FadeInView>
      </ScreenContainer>
    </Pressable>
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
    screenPressable: { flex: 1 },
    screen: {
      justifyContent: 'center',
    },
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 2,
      color: t.label,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.dot,
    },
    word: {
      fontFamily: 'Georgia',
      fontSize: 30,
      fontWeight: '600',
      color: t.wordText,
    },
    meta: {
      fontSize: 13,
      color: t.metaText,
      marginTop: 4,
      marginBottom: 20,
    },
    input: {
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 18,
      color: t.wordText,
      backgroundColor: t.cardBackground,
      marginBottom: 16,
    },
    revealButton: {
      height: 56,
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revealButtonText: {
      color: t.buttonOutline,
      fontWeight: '600',
      fontSize: 15,
    },
    translationBlock: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 16,
      width: '100%',
    },
    resultLabel: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 6,
      color: t.translationText,
    },
    resultCorrect: {
      borderWidth: 1.5,
      borderColor: '#4C7A5E',
    },
    resultWrong: {
      borderWidth: 1.5,
      borderColor: t.dot,
    },
    translationText: {
      fontSize: 20,
      fontWeight: '700',
      color: t.translationText,
    },
    ticketDash: {
      borderTopWidth: 1.5,
      borderTopColor: t.ticketDash,
      borderStyle: 'dashed',
      marginTop: 24,
      marginBottom: 16,
    },
    buttonRowTop: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    buttonRowBottom: {
      flexDirection: 'row',
      gap: 12,
    },
    pill: {
      flex: 1,
      height: 68,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillOutline: {
      borderWidth: 2,
      borderColor: t.buttonOutline,
      backgroundColor: 'transparent',
    },
    pillOutlineText: {
      color: t.buttonOutline,
      fontWeight: '700',
      fontSize: 16,
    },
    pillFilled: {
      backgroundColor: t.buttonFilled,
    },
    pillFilledText: {
      color: t.buttonFilledText,
      fontWeight: '700',
      fontSize: 16,
    },
  });
}
