import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

export type TabKey = 'today' | 'stats' | 'decks' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'stats', label: 'Statistiques' },
  { key: 'decks', label: 'Decks & mots' },
  { key: 'settings', label: 'Réglages' },
];

export function TabBar({ current, onChange }: { current: TabKey; onChange: (tab: TabKey) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.key}
          styles={styles}
          label={tab.label}
          active={tab.key === current}
          onPress={() => {
            if (tab.key !== current) {
              Haptics.selectionAsync();
              onChange(tab.key);
            }
          }}
        />
      ))}
    </View>
  );
}

function TabButton({
  styles,
  label,
  active,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.tab, active ? styles.tabActive : styles.tabInactive]}
      haptic="none"
      scaleTo={0.94}
      onPress={onPress}
    >
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      // Resserré (10 → 6) en passant à 4 onglets (ajout de Réglages,
      // séparé de Decks & mots — demandé explicitement le 20/08/2026)
      // pour garder assez de place à chaque libellé.
      gap: 6,
      borderTopWidth: 1,
      borderTopColor: t.translationBackground,
      backgroundColor: t.cardBackground,
      // Barre agrandie verticalement, demandé explicitement le
      // 20/08/2026 (18/16 → 20/34, plus le padding vertical propre à
      // chaque pilule ci-dessous).
      paddingTop: 20,
      paddingBottom: 34,
      paddingHorizontal: 10,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: 18,
    },
    // Même couleur que l'état sélectionné, en plus clair — demandé
    // explicitement, remplace l'ancien indicateur (petit point qui
    // grandissait) par une pilule pleine dont seule l'intensité change.
    tabActive: { backgroundColor: t.buttonFilled },
    tabInactive: { backgroundColor: t.buttonFilledLight },
    label: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    labelActive: { color: t.buttonFilledText },
    labelInactive: { color: t.buttonFilled },
  });
}
