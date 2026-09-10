import { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { AzulejoFrieze } from '../components/AzulejoFrieze';
import { isCorrectAnswer } from '../conjugation/validate';
import { TENSE_LABELS, personLabelsForTense, type ConjugationTense } from '../conjugation/types';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';
import { useGradeKeyboardShortcuts } from '../hooks/useGradeKeyboardShortcuts';

export type ConjugationCardData = {
  infinitive: string;
  english: string;
  tense: ConjugationTense;
  person: number;
  expectedForm: string;
};

type Props = {
  card: ConjugationCardData;
  onGrade: (grade: SM2Grade) => void;
};

const GRADE_HAPTICS: Record<SM2Grade, () => Promise<void>> = {
  again: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  hard: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  good: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  easy: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

/**
 * Flashcard de conjugaison, même carte « Sol y sombra » que le
 * vocabulaire ([ReviewScreen.tsx](./ReviewScreen.tsx)) mais avec une
 * réponse tapée au clavier plutôt que révélée puis auto-évaluée en 2
 * temps : la comparaison ("correct"/"incorrect", tolérante sur les
 * accents, voir `conjugation/validate.ts`) **informe** la note mais ne
 * la choisit pas à la place de l'utilisateur — les 4 mêmes boutons
 * qu'en vocabulaire (Otra vez/Difícil/Bien/Fácil) restent disponibles
 * après validation, pour rester cohérent avec le reste de l'app plutôt
 * que d'inventer une notation 100% automatique.
 *
 * Styles dupliqués depuis ReviewScreen.tsx plutôt qu'importés — chaque
 * écran de ce projet garde son propre `createStyles` autonome (aucun
 * partage de styles entre écrans ailleurs dans le code), pour ne pas
 * lier accidentellement ce fichier à des changements futurs de l'écran
 * de révision du vocabulaire.
 */
export function ConjugationReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const personLabel = personLabelsForTense(card.tense)[card.person];

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const correct = isCorrectAnswer(answer, card.expectedForm, card.tense, card.person);
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
    // Toucher n'importe où en dehors du champ de saisie ferme le clavier
    // — demandé explicitement ("cliquer dans le vide pour sortir du
    // textbox"). `Pressable` imbriqué : toucher le champ ou les boutons
    // à l'intérieur ne déclenche pas ce `onPress` (le système de
    // réponse au toucher de React Native donne la priorité à l'élément
    // le plus profond), donc ça ne gêne pas la saisie elle-même.
    <Pressable style={styles.screenPressable} onPress={Keyboard.dismiss}>
      <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={28} paddingVertical={32} style={styles.screen}>
      <FadeInView duration={350} distance={20} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>LEXIS · CONJUGAISON</Text>
          <View style={styles.dot} />
        </View>

        <Text style={styles.infinitive}>{card.infinitive}</Text>
        <Text style={styles.meta}>{card.english}</Text>

        <View style={styles.promptRow}>
          <View style={styles.promptChip}>
            <Text style={styles.promptChipText}>{TENSE_LABELS[card.tense]}</Text>
          </View>
          <View style={styles.promptChip}>
            <Text style={styles.promptChipText}>{personLabel}</Text>
          </View>
        </View>

        {!submitted ? (
          <FadeInView duration={250}>
            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder="Tape la conjugaison…"
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
              <Text style={styles.translationText}>{card.expectedForm}</Text>
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
    infinitive: {
      fontFamily: 'Georgia',
      fontSize: 30,
      fontWeight: '600',
      color: t.wordText,
    },
    meta: {
      fontSize: 13,
      color: t.metaText,
      marginTop: 4,
    },
    promptRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
      marginBottom: 20,
    },
    promptChip: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    promptChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: t.translationText,
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
