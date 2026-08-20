import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
    return <ReviewScreenContainer db={db} onExit={() => setSessionActive(false)} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {tab === 'today' && <TodayScreen db={db} onStartSession={() => setSessionActive(true)} />}
        {tab === 'stats' && <StatsScreen db={db} />}
        {tab === 'decks' && <DecksScreen db={db} />}
      </View>
      <TabBar current={tab} onChange={setTab} />
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.cardBackground },
    content: { flex: 1 },
  });
}
