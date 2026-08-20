import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

export type TabKey = 'today' | 'stats' | 'decks';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'stats', label: 'Statistiques' },
  { key: 'decks', label: 'Decks & mots' },
];

export function TabBar({ current, onChange }: { current: TabKey; onChange: (tab: TabKey) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            <View style={[styles.dot, active && styles.dotActive]} />
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: t.translationBackground,
      backgroundColor: t.cardBackground,
      paddingTop: 8,
      paddingBottom: 20,
    },
    tab: { flex: 1, alignItems: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent', marginBottom: 4 },
    dotActive: { backgroundColor: t.dot },
    label: { fontSize: 11, color: t.metaText, fontWeight: '600' },
    labelActive: { color: t.wordText },
  });
}
