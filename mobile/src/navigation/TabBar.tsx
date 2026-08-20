import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

export type TabKey = 'today' | 'stats' | 'decks' | 'conjugation' | 'listening' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'stats', label: 'Statistiques' },
  { key: 'decks', label: 'Decks & mots' },
  { key: 'conjugation', label: 'Conjugaison' },
  { key: 'listening', label: 'Écoute' },
  { key: 'settings', label: 'Réglages' },
];

/**
 * Remplace l'ancienne barre de pilules fixe en bas d'écran (demandé
 * explicitement le 20/08/2026, en remplacement d'une première version à
 * onglets fixes) par une icône ☰ en haut de l'écran : appuyer dessus
 * ouvre un bandeau d'onglets qu'on fait défiler horizontalement du
 * doigt, toucher un onglet le sélectionne et referme le bandeau. Comme
 * l'ancienne barre, ce composant n'est monté que hors session de
 * révision (voir RootTabs.tsx) — pas besoin de le cacher explicitement
 * ici.
 *
 * Les libellés complets tiennent maintenant sans avoir besoin d'être
 * raccourcis pour la place ("Decks & mots" gardé en entier, contrairement
 * à l'ancienne barre à 6 pilules fixes).
 */
export function TabBar({ current, onChange }: { current: TabKey; onChange: (tab: TabKey) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const handleSelect = (key: TabKey) => {
    if (key !== current) {
      Haptics.selectionAsync();
      onChange(key);
    }
    setOpen(false);
  };

  return (
    <>
      <SafeAreaView style={styles.hamburgerSafeArea} pointerEvents="box-none">
        <View style={styles.hamburgerRow} pointerEvents="box-none">
          <AnimatedPressable
            style={styles.hamburgerButton}
            haptic="selection"
            scaleTo={0.9}
            accessibilityLabel={open ? 'Fermer le menu des onglets' : 'Ouvrir le menu des onglets'}
            onPress={() => setOpen((v) => !v)}
          >
            <Text style={styles.hamburgerIcon}>☰</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer le menu des onglets" />
          <SafeAreaView style={styles.stripSafeArea} pointerEvents="box-none">
            <FadeInView duration={200} direction="right" distance={20} style={styles.stripCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
                {TABS.map((tab) => (
                  <TabPill
                    key={tab.key}
                    styles={styles}
                    label={tab.label}
                    active={tab.key === current}
                    onPress={() => handleSelect(tab.key)}
                  />
                ))}
              </ScrollView>
            </FadeInView>
          </SafeAreaView>
        </>
      )}
    </>
  );
}

function TabPill({
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
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
      haptic="none"
      scaleTo={0.94}
      onPress={onPress}
    >
      <Text style={[styles.pillLabel, active ? styles.pillLabelActive : styles.pillLabelInactive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    hamburgerSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
    hamburgerRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16, paddingTop: 6 },
    hamburgerButton: {
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
    hamburgerIcon: { fontSize: 18, color: t.buttonFilled, fontWeight: '700' },

    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.25)',
      zIndex: 20,
    },
    stripSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25 },
    stripCard: {
      marginTop: 54,
      marginHorizontal: 12,
      backgroundColor: t.cardBackground,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    stripContent: { flexDirection: 'row', gap: 8, padding: 10 },
    pill: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16 },
    pillActive: { backgroundColor: t.buttonFilled },
    pillInactive: { backgroundColor: t.buttonFilledLight },
    pillLabel: { fontSize: 13, fontWeight: '700' },
    pillLabelActive: { color: t.buttonFilledText },
    pillLabelInactive: { color: t.buttonFilled },
  });
}
