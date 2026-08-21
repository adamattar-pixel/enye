import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getDueConjugationCardsSplit,
  updateConjugationCard,
  logConjugationReview,
  type DueConjugationCardRow,
} from '../data/database';
import { getSettings } from '../data/settings';
import { getConjugationVerb } from '../conjugation/data';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { ConjugationReviewScreen } from './ConjugationReviewScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = {
  db: SQLiteDatabase;
  onExit: () => void;
};

/** Écran de session pour l'onglet Conjugaison — même rôle que
 * [ReviewScreenContainer.tsx](./ReviewScreenContainer.tsx) pour le
 * vocabulaire (charge la carte due, persiste la note, passe à la
 * suivante), branché sur `conjugation_cards`/`conjugation_reviews`
 * plutôt que `cards`/`reviews`. Pas de rechargement de file de
 * notifications ici : la conjugaison n'est pas encore intégrée aux
 * notifications verrouillées en v1 (entraînement dans l'app
 * uniquement), voir docs/AUDIT.md pour la décision de périmètre. */
export function ConjugationReviewContainer({ db, onExit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [current, setCurrent] = useState<DueConjugationCardRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    const settings = await getSettings(db);
    const due = await getDueConjugationCardsSplit(db, new Date(), settings);
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
      await updateConjugationCard(db, current.cardId, nextState);
      await logConjugationReview(db, current.cardId, grade, now);
      await loadNext();
    },
    [db, current, loadNext]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  const verb = current ? getConjugationVerb(current.verbId) : null;

  if (!current || !verb) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.doneText}>Aucune conjugaison due pour l'instant — bravo !</Text>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const expectedForm = verb.forms[current.tense][current.person];

  return (
    <View style={{ flex: 1 }}>
      <ConjugationReviewScreen
        // Remonte le composant à chaque nouvelle carte pour rejouer
        // l'animation d'entrée et repartir sur un champ de saisie vide.
        key={current.cardId}
        card={{
          infinitive: verb.infinitive,
          english: verb.english,
          tense: current.tense,
          person: current.person,
          expectedForm,
        }}
        onGrade={handleGrade}
      />
      <TouchableOpacity style={styles.exitLink} onPress={onExit}>
        <Text style={styles.exitLinkText}>‹ Retour à Conjugaison</Text>
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
    doneText: { color: t.wordText, fontSize: 16, textAlign: 'center', marginBottom: 16 },
    exitButton: { paddingVertical: 10, paddingHorizontal: 16 },
    exitButtonText: { color: t.buttonOutline, fontWeight: '600' },
    exitLink: { alignItems: 'center', paddingVertical: 14, backgroundColor: t.cardBackground },
    exitLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },
  });
}
