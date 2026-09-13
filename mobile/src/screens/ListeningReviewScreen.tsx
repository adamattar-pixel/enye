import { useMemo, useRef, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { AzulejoFrieze } from '../components/AzulejoFrieze';
import { YouTubePlayer, type YouTubePlayerHandle } from '../components/YouTubePlayer';
import { isExactMatch } from '../validation/textAnswer';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';
import type { SM2Grade } from '../sm2/types';

export type ListeningCardData = {
  videoId: string;
  videoTitle: string;
  startTime: number;
  endTime: number;
  transcript: string;
};

type Props = {
  card: ListeningCardData;
  onGrade: (grade: SM2Grade) => void;
};

/**
 * Flashcard de compréhension orale — même carte « Sol y sombra » que la
 * conjugaison ([ConjugationReviewScreen.tsx](./ConjugationReviewScreen.tsx))
 * mais le prompt est un lecteur YouTube (le segment se joue seul,
 * démarre/s'arrête à `startTime`/`endTime`) plutôt qu'un texte, et la
 * transcription reste cachée jusqu'à validation.
 *
 * **Notation automatique, pas 4 boutons** — contrairement au
 * vocabulaire/à la conjugaison : la maquette UX de la mission ne montre
 * que ✓/✗ suivi de "Réécouter"/"Exercice suivant", sans grille de 4
 * notes. Mappage retenu (option A du plan, docs/PLAN.md point ouvert #3) :
 * correct → "Bien", incorrect → "Otra vez". Assumé, pas confirmé
 * explicitement par l'utilisateur — à ajuster si jugé trop strict/laxiste
 * à l'usage (par exemple si une erreur mineure d'accent devrait plutôt
 * valoir "Difícil" qu'un échec complet).
 */
export function ListeningReviewScreen({ card, onGrade }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  const handleVerify = () => {
    if (!answer.trim()) return;
    const correct = isExactMatch(answer, card.transcript);
    setIsCorrect(correct);
    setSubmitted(true);
    Haptics.impactAsync(correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleNext = () => {
    const grade: SM2Grade = isCorrect ? 'good' : 'again';
    (isCorrect ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    onGrade(grade);
  };

  // Filet de secours tant que la lecture intégrée échoue (voir docs/AUDIT.md,
  // itérations 8-17) : ouvre la vraie vidéo YouTube au bon timestamp de
  // départ (`&t=Xs`, paramètre standard reconnu par l'app/le navigateur
  // YouTube). Limite assumée : YouTube ne fournit aucun moyen fiable de
  // couper automatiquement à `endTime` depuis un lien externe (seul le
  // player intégré le permet) — l'utilisateur devra mettre en pause
  // manuellement à la fin du segment souhaité.
  const openInYouTubeApp = () => {
    Linking.openURL(`https://www.youtube.com/watch?v=${card.videoId}&t=${Math.floor(card.startTime)}s`).catch(
      (err) => console.log('[ListeningReviewScreen] échec ouverture YouTube:', err)
    );
  };

  return (
    // Toucher en dehors du champ de saisie ferme le clavier — même
    // correctif que ConjugationReviewScreen.tsx, demandé explicitement.
    <Pressable style={styles.screenPressable} onPress={Keyboard.dismiss}>
      <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={28} paddingVertical={32} style={styles.screen}>
      {/* Filet de sécurité au cas où le contenu déborde encore malgré le
       * plafond de largeur du lecteur (YouTubePlayer.tsx) — sur une
       * fenêtre étroite/basse, garantit que le champ de saisie et les
       * boutons restent atteignables par défilement plutôt qu'invisibles
       * hors écran sans aucun moyen d'y accéder. */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <FadeInView duration={350} distance={20} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>LEXIS · COMPRÉHENSION ORALE</Text>
          <View style={styles.dot} />
        </View>

        <Text style={styles.videoTitle} numberOfLines={2}>
          {card.videoTitle}
        </Text>

        {playerError ? (
          <View style={styles.playerErrorBox}>
            <Text style={styles.playerErrorText}>
              La lecture intégrée n'a pas pu démarrer. Écoute le passage directement dans l'app YouTube — il
              démarrera au bon moment, pense juste à arrêter à la fin du passage.
            </Text>
            <AnimatedPressable style={styles.openYoutubeButton} haptic="none" onPress={openInYouTubeApp}>
              <Text style={styles.openYoutubeButtonText}>▶ Écouter sur YouTube</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <YouTubePlayer
            ref={playerRef}
            videoId={card.videoId}
            startTime={card.startTime}
            endTime={card.endTime}
            onError={() => setPlayerError(true)}
          />
        )}

        {!submitted ? (
          <FadeInView duration={250}>
            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Tape ce que tu as entendu…"
              placeholderTextColor={theme.metaText}
              keyboardAppearance="dark"
              onSubmitEditing={handleVerify}
              returnKeyType="done"
              multiline
            />
            <View style={styles.rowButtons}>
              <AnimatedPressable
                style={styles.replayButton}
                haptic="none"
                onPress={() => playerRef.current?.replay()}
                disabled={playerError}
              >
                <Text style={styles.replayButtonText}>↻ Réécouter</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.verifyButton, !answer.trim() && styles.buttonDisabled]}
                haptic="none"
                disabled={!answer.trim()}
                onPress={handleVerify}
              >
                <Text style={styles.verifyButtonText}>Vérifier</Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        ) : (
          <>
            <FadeInView
              duration={300}
              style={[styles.translationBlock, isCorrect ? styles.resultCorrect : styles.resultWrong]}
            >
              <Text style={styles.resultLabel}>{isCorrect ? '✓ Correct' : `✗ Ta réponse : ${answer}`}</Text>
              <Text style={styles.translationText}>{card.transcript}</Text>
            </FadeInView>

            <View style={styles.ticketDash} />

            <FadeInView duration={300} delay={80} style={styles.rowButtons}>
              <AnimatedPressable style={styles.replayButton} haptic="none" onPress={() => playerRef.current?.replay()}>
                <Text style={styles.replayButtonText}>↻ Réécouter</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.verifyButton} haptic="none" onPress={handleNext}>
                <Text style={styles.verifyButtonText}>Exercice suivant</Text>
              </AnimatedPressable>
            </FadeInView>
          </>
        )}

        <AzulejoFrieze theme={theme} />
      </FadeInView>
      </ScrollView>
      </ScreenContainer>
    </Pressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    screenPressable: { flex: 1 },
    screen: {},
    scrollContent: { flexGrow: 1, justifyContent: 'center' },
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
    videoTitle: { fontSize: 14, fontWeight: '600', color: t.wordText, marginBottom: 14 },
    playerErrorBox: {
      backgroundColor: t.translationBackground,
      borderRadius: 14,
      padding: 20,
      alignItems: 'center',
      aspectRatio: 16 / 9,
      justifyContent: 'center',
    },
    playerErrorText: { fontSize: 13, color: t.metaText, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
    openYoutubeButton: {
      height: 44,
      paddingHorizontal: 20,
      borderRadius: 22,
      backgroundColor: t.buttonFilled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    openYoutubeButtonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 14 },
    input: {
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: t.wordText,
      backgroundColor: t.cardBackground,
      marginTop: 16,
      marginBottom: 16,
      minHeight: 56,
    },
    rowButtons: { flexDirection: 'row', gap: 12 },
    replayButton: {
      flex: 1,
      height: 52,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: t.buttonOutline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replayButtonText: { color: t.buttonOutline, fontWeight: '600', fontSize: 14 },
    verifyButton: {
      flex: 1,
      height: 52,
      borderRadius: 24,
      backgroundColor: t.buttonFilled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    verifyButtonText: { color: t.buttonFilledText, fontWeight: '600', fontSize: 14 },
    buttonDisabled: { opacity: 0.5 },
    translationBlock: { backgroundColor: t.translationBackground, borderRadius: 14, padding: 16, width: '100%', marginTop: 16 },
    resultLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6, color: t.translationText },
    resultCorrect: { borderWidth: 1.5, borderColor: '#4C7A5E' },
    resultWrong: { borderWidth: 1.5, borderColor: t.dot },
    translationText: { fontSize: 18, fontWeight: '700', color: t.translationText },
    ticketDash: { borderTopWidth: 1.5, borderTopColor: t.ticketDash, borderStyle: 'dashed', marginTop: 20, marginBottom: 16 },
  });
}
