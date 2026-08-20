import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
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
  const dotScale = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(dotScale, { toValue: active ? 1 : 0, damping: 12, stiffness: 180, useNativeDriver: true }).start();
  }, [active, dotScale]);

  return (
    <AnimatedPressable style={styles.tab} haptic="none" scaleTo={0.92} onPress={onPress}>
      <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </AnimatedPressable>
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
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot, marginBottom: 4 },
    label: { fontSize: 11, color: t.metaText, fontWeight: '600' },
    labelActive: { color: t.wordText },
  });
}
