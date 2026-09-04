import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LexisDb } from '../data/dbTypes';
import { getDueCardsSplit, getMoreNewCards, updateCard, logReview, type DueCardRow } from '../data/database';
import { getSettings } from '../data/settings';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ReviewScreen } from './ReviewScreen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = {
  db: LexisDb;
  onExit: () => void;
};

/** L'écran de session, branché à SQLite + SM-2 : affiche la carte la
 * plus ancienne due, persiste le résultat de `SM2Engine.review()` à
 * chaque note, journalise pour les statistiques. Le rechargement de la
 * file de notifications OS a été retiré avec la cible desktop (voir
 * docs/DECISIONS.md Decision 016) — le rappel de cartes dues vient
 * maintenant de l'onglet Aujourd'hui, consulté à l'ouverture de l'app. */
export function ReviewScreenContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueCardRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadNext = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueCardsSplit(db, new Date(), settings);
    setCurrent(due[0] ?? null);
  }, [db]);

  useEffect(() => {
    (async () => {
      await loadNext();
      setLoading(false);
    })();
  }, [loadNext]);

  const handleGrade = useCallback(
    async (grade: SM2Grade) => {
      if (!current) return;
      const now = new Date();
      const nextState = review(current.card, grade, now);
      await updateCard(db, current.word.id, nextState);
      await logReview(db, current.word.id, grade, now);
      await loadNext();
    },
    [db, current, loadNext]
  );

  // Le plafond "nouvelles cartes / jour" n'est qu'une limite par appel à
  // `getDueCardsSplit`, pas un verrou en base — redemander un lot ici
  // (`getMoreNewCards`) revient à relancer la même requête sans attendre
  // le lendemain, ce qui correspond exactement à "si je finis celles
  // d'aujourd'hui, donne m'en d'autres" (demandé explicitement).
  const handleMoreCards = useCallback(async () => {
    setFetchingMore(true);
    const settings = await getSettings(db);
    const more = await getMoreNewCards(db, new Date(), settings.disabledTags, settings.newCardsPerDay);
    setFetchingMore(false);

    if (more.length === 0) {
      Alert.alert('Plus de nouveaux mots', "Il n'y a plus de nouveau mot disponible pour l'instant.");
      return;
    }
    setCurrent(more[0]);
  }, [db]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucune carte due pour l'instant — bravo !</Text>

        <AnimatedPressable style={styles.moreButton} haptic="selection" disabled={fetchingMore} onPress={handleMoreCards}>
          <Text style={styles.moreButtonText}>{fetchingMore ? '…' : 'Encore des cartes'}</Text>
        </AnimatedPressable>

        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ReviewScreen
        // Remonte le composant à chaque nouvelle carte pour rejouer
        // l'animation d'entrée (sinon React ne fait que mettre à jour le
        // texte en place, sans réanimation).
        key={current.word.id}
        card={{
          word: current.word.spanish,
          translation: current.word.english,
          partOfSpeech: current.word.partOfSpeech,
          gender: current.word.gender,
          level: current.word.level,
        }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Aujourd'hui</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    center: {
      flex: 1,
      backgroundColor: t.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center', marginBottom: 20 },
    moreButton: {
      backgroundColor: t.buttonFilled,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 24,
      marginBottom: 12,
    },
    moreButtonText: { color: t.buttonFilledText, fontWeight: '700', fontSize: 15 },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
    exitLink: { alignItems: 'center', paddingVertical: 14, backgroundColor: t.cardBackground },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
  });
}
