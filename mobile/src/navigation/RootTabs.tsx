import { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { TodayScreen } from '../screens/TodayScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { DecksScreen } from '../screens/DecksScreen';
import { ConjugationScreen } from '../screens/ConjugationScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ReviewScreenContainer } from '../screens/ReviewScreenContainer';
import { ConjugationReviewContainer } from '../screens/ConjugationReviewContainer';
import { TabBar, type TabKey } from './TabBar';
import { FadeInView } from '../components/FadeInView';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme, useThemeToggle, type SolYSombraPalette } from '../theme/solYSombra';

type ActiveSession = 'none' | 'vocab' | 'conjugation';

/** Aujourd'hui / Statistiques / Decks & mots / Conjugaison / Réglages
 * vivent derrière une barre d'onglets (Conjugaison ajouté le
 * 20/08/2026 — entraînement SM-2 + référence statique en sous-onglets,
 * voir ConjugationScreen.tsx ; Réglages séparé de Decks & mots le même
 * jour, regroupe réglages/historique/prochaine notification à part de
 * la liste de mots) ; Session (révision vocabulaire OU conjugaison,
 * plein écran) masque la barre, lancée depuis Aujourd'hui/Conjugaison
 * et y ramène en sortant. */
export function RootTabs({ db }: { db: SQLiteDatabase }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [tab, setTab] = useState<TabKey>('today');
  const [activeSession, setActiveSession] = useState<ActiveSession>('none');

  return (
    <View style={styles.root}>
      {activeSession !== 'none' ? (
        <FadeInView duration={250} direction="none" style={styles.root}>
          {activeSession === 'vocab' && <ReviewScreenContainer db={db} onExit={() => setActiveSession('none')} />}
          {activeSession === 'conjugation' && <ConjugationReviewContainer db={db} onExit={() => setActiveSession('none')} />}
        </FadeInView>
      ) : (
        <FadeInView duration={0} direction="none" style={styles.root}>
          {/* `key={tab}` force un remontage à chaque changement d'onglet
           * pour rejouer l'entrée en fondu plutôt qu'un changement instantané. */}
          <FadeInView key={tab} duration={200} direction="none" style={styles.content}>
            {tab === 'today' && <TodayScreen db={db} onStartSession={() => setActiveSession('vocab')} />}
            {tab === 'stats' && <StatsScreen db={db} />}
            {tab === 'decks' && <DecksScreen db={db} />}
            {tab === 'conjugation' && <ConjugationScreen db={db} onStartSession={() => setActiveSession('conjugation')} />}
            {tab === 'settings' && <SettingsScreen db={db} />}
          </FadeInView>
          <TabBar current={tab} onChange={setTab} />
        </FadeInView>
      )}
      <ThemeToggleButton />
    </View>
  );
}

/** Bouton en haut à droite qui inverse clair/sombre indépendamment du
 * réglage système iOS — demandé explicitement le 20/08/2026. Posé en
 * superposition au-dessus de tout (Aujourd'hui/Statistiques/Decks ET
 * l'écran de session), pas par écran, pour rester visible partout sans
 * dupliquer le bouton. `SafeAreaView` gère l'encoche/l'île dynamique ;
 * `pointerEvents="box-none"` laisse passer les touches vers l'écran en
 * dessous partout sauf sur le bouton lui-même. */
function ThemeToggleButton() {
  const theme = useTheme();
  const { isDark, toggleTheme } = useThemeToggle();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.toggleSafeArea} pointerEvents="box-none">
      <View style={styles.toggleRow} pointerEvents="box-none">
        <AnimatedPressable
          style={styles.toggleButton}
          haptic="selection"
          scaleTo={0.9}
          accessibilityLabel={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
          onPress={toggleTheme}
        >
          <Text style={styles.toggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.cardBackground },
    content: { flex: 1 },
    toggleSafeArea: { position: 'absolute', top: 0, left: 0, right: 0 },
    toggleRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 6 },
    toggleButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.translationBackground,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    toggleIcon: { fontSize: 16 },
  });
}
