import { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import { formatMeta, useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';

export type ReviewCardData = {
  word: string;
  translation: string;
  partOfSpeech: string;
  gender: string | null;
  level: string;
};

type Props = {
  card: ReviewCardData;
  onGrade: (grade: SM2Grade) => void;
};

/**
 * L'écran de révision, style « Sol y sombra ». Purement présentation :
 * données et callback de notation passés par l'appelant — voir
 * `ReviewScreenContainer.tsx` pour le branchement à SM-2/SQLite.
 */
export function ReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = formatMeta(card.partOfSpeech, card.gender, card.level);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>LEXIS</Text>
          <View style={styles.dot} />
        </View>

        <View style={styles.wordRow}>
          <Text style={styles.word}>{card.word}</Text>
          <TouchableOpacity
            style={styles.speakButton}
            onPress={() => Speech.speak(card.word, { language: 'es-ES' })}
            accessibilityLabel={`Écouter la prononciation de ${card.word}`}
          >
            <Text style={styles.speakButtonText}>Écouter</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.meta}>{meta}</Text>

        <View style={styles.translationBlock}>
          <Text style={styles.translationText}>{card.translation}</Text>
        </View>

        <View style={styles.ticketDash} />

        <View style={styles.buttonRowTop}>
          <GradeButton styles={styles} label="Otra vez" variant="outline" onPress={() => onGrade('again')} />
          <GradeButton styles={styles} label="Difícil" variant="outline" onPress={() => onGrade('hard')} />
        </View>
        <View style={styles.buttonRowBottom}>
          <GradeButton styles={styles} label="Bien" variant="filled" onPress={() => onGrade('good')} />
          <GradeButton styles={styles} label="Fácil" variant="filled" onPress={() => onGrade('easy')} />
        </View>
      </View>
    </SafeAreaView>
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
    <TouchableOpacity
      style={[styles.pill, variant === 'outline' ? styles.pillOutline : styles.pillFilled]}
      onPress={onPress}
    >
      <Text style={variant === 'outline' ? styles.pillOutlineText : styles.pillFilledText}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.cardBackground,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: t.cardBackground,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      borderRadius: 16,
      padding: 20,
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
    wordRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    word: {
      fontFamily: 'Georgia',
      fontSize: 30,
      fontWeight: '600',
      color: t.wordText,
    },
    speakButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.buttonOutline,
    },
    speakButtonText: {
      fontSize: 11,
      fontWeight: '600',
      color: t.buttonOutline,
    },
    meta: {
      fontSize: 13,
      color: t.metaText,
      marginTop: 4,
      marginBottom: 20,
    },
    translationBlock: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 16,
      width: '100%',
    },
    translationText: {
      fontSize: 17,
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
      gap: 10,
      marginBottom: 10,
    },
    buttonRowBottom: {
      flexDirection: 'row',
      gap: 10,
    },
    pill: {
      flex: 1,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillOutline: {
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      backgroundColor: 'transparent',
    },
    pillOutlineText: {
      color: t.buttonOutline,
      fontWeight: '600',
    },
    pillFilled: {
      backgroundColor: t.buttonFilled,
    },
    pillFilledText: {
      color: t.buttonFilledText,
      fontWeight: '600',
    },
  });
}
