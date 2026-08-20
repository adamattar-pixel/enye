import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { SQLiteDatabase } from 'expo-sqlite';
import { TodayScreen } from '../screens/TodayScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { DecksScreen } from '../screens/DecksScreen';
import { ReviewScreenContainer } from '../screens/ReviewScreenContainer';
import { TabBar, type TabKey } from './TabBar';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

/** Les 4 écrans du cahier des charges : Aujourd'hui / Statistiques /
 * Decks & mots vivent derrière une barre d'onglets ; Session (la
 * révision plein écran) est un écran plein qui masque la barre, lancé
 * depuis Aujourd'hui et qui y ramène en sortant. */
export function RootTabs({ db }: { db: SQLiteDatabase }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [tab, setTab] = useState<TabKey>('today');
  const [sessionActive, setSessionActive] = useState(false);

  if (sessionActive) {
    return (
      <Animated.View entering={FadeIn.duration(250)} style={styles.root}>
        <ReviewScreenContainer db={db} onExit={() => setSessionActive(false)} />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={styles.root}>
      {/* `key={tab}` force un remontage à chaque changement d'onglet
       * pour rejouer l'entrée en fondu plutôt qu'un changement instantané. */}
      <Animated.View key={tab} entering={FadeIn.duration(200)} style={styles.content}>
        {tab === 'today' && <TodayScreen db={db} onStartSession={() => setSessionActive(true)} />}
        {tab === 'stats' && <StatsScreen db={db} />}
        {tab === 'decks' && <DecksScreen db={db} />}
      </Animated.View>
      <TabBar current={tab} onChange={setTab} />
    </Animated.View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.cardBackground },
    content: { flex: 1 },
  });
}
