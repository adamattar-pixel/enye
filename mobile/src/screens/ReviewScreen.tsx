import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { solYSombra, formatMeta } from '../theme/solYSombra';

export type ReviewCardData = {
  word: string;
  translation: string;
  partOfSpeech: string;
  gender: string | null;
  level: string;
};

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

type Props = {
  card: ReviewCardData;
  onGrade: (grade: ReviewGrade) => void;
};

/**
 * L'écran de révision, style « Sol y sombra ». Pas encore branché au
 * moteur SM-2 ni à la vraie file de cartes (tâches 3-4) — données et
 * callback passés en props par l'appelant, mock pour l'instant côté
 * `App.tsx`.
 */
export function ReviewScreen({ card, onGrade }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <ReviewCard card={card} onGrade={onGrade} />
    </SafeAreaView>
  );
}

function ReviewCard({ card, onGrade }: Props) {
  const meta = formatMeta(card.partOfSpeech, card.gender, card.level);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <View style={styles.dot} />
      </View>

      <Text style={styles.word}>{card.word}</Text>
      <Text style={styles.meta}>{meta}</Text>

      <View style={styles.translationBlock}>
        <Text style={styles.translationText}>{card.translation}</Text>
      </View>

      <View style={styles.ticketDash} />

      <View style={styles.buttonRowTop}>
        <GradeButton label="Otra vez" variant="outline" onPress={() => onGrade('again')} />
        <GradeButton label="Difícil" variant="outline" onPress={() => onGrade('hard')} />
      </View>
      <View style={styles.buttonRowBottom}>
        <GradeButton label="Bien" variant="filled" onPress={() => onGrade('good')} />
        <GradeButton label="Fácil" variant="filled" onPress={() => onGrade('easy')} />
      </View>
    </View>
  );
}

function GradeButton({
  label,
  variant,
  onPress,
}: {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: solYSombra.cardBackground,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: solYSombra.cardBackground,
    borderWidth: 1.5,
    borderColor: solYSombra.cardBorder,
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
    color: solYSombra.label,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: solYSombra.dot,
  },
  word: {
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '600',
    color: solYSombra.wordText,
  },
  meta: {
    fontSize: 13,
    color: solYSombra.metaText,
    marginTop: 4,
    marginBottom: 20,
  },
  translationBlock: {
    backgroundColor: solYSombra.translationBackground,
    borderRadius: 14,
    padding: 16,
    width: '100%',
  },
  translationText: {
    fontSize: 17,
    color: solYSombra.translationText,
  },
  ticketDash: {
    borderTopWidth: 1.5,
    borderTopColor: solYSombra.ticketDash,
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
    borderColor: solYSombra.buttonOutline,
    backgroundColor: 'transparent',
  },
  pillOutlineText: {
    color: solYSombra.buttonOutline,
    fontWeight: '600',
  },
  pillFilled: {
    backgroundColor: solYSombra.buttonFilled,
  },
  pillFilledText: {
    color: solYSombra.buttonFilledText,
    fontWeight: '600',
  },
});
