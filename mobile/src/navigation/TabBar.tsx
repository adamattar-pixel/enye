import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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
 * Remplace l'ancienne barre de pilules fixe en bas d'écran par une icône
 * ☰ en haut de l'écran (demandé le 20/08/2026, puis ajusté le même jour
 * après un premier essai jugé pas assez intégré : l'icône flottait
 * au-dessus du reste avec une ombre/un fond distinct — remplacée par une
 * icône à plat, "sur le même plan" que le reste de l'écran, sans carte ni
 * ombre propre). Un appui ouvre un grand panneau rectangulaire plein
 * (pas de coins très arrondis, pas transparent) listant les onglets les
 * uns sous les autres, séparés par un trait — pas un bandeau horizontal
 * défilant comme la toute première version. Toucher un onglet le
 * sélectionne et referme le panneau ; toucher en dehors referme sans
 * changer d'onglet.
 *
 * Comme l'ancienne barre, ce composant n'est monté que hors session de
 * révision (voir RootTabs.tsx) — pas besoin de le cacher explicitement
 * ici.
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
          <SafeAreaView style={styles.panelSafeArea} pointerEvents="box-none">
            <FadeInView duration={220} direction="up" distance={16} style={styles.panel}>
              {TABS.map((tab, index) => (
                <TabRow
                  key={tab.key}
                  styles={styles}
                  label={tab.label}
                  active={tab.key === current}
                  isLast={index === TABS.length - 1}
                  onPress={() => handleSelect(tab.key)}
                />
              ))}
            </FadeInView>
          </SafeAreaView>
        </>
      )}
    </>
  );
}

function TabRow({
  styles,
  label,
  active,
  isLast,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  active: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.row, !isLast && styles.rowDivider, active && styles.rowActive]}
      haptic="none"
      scaleTo={0.98}
      onPress={onPress}
    >
      <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    hamburgerSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
    hamburgerRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 22, paddingTop: 14 },
    // Icône seule, sans fond/ombre/carte propre — reste "sur le même
    // plan" visuel que le reste de l'écran plutôt que de flotter
    // au-dessus comme un bouton d'action séparé.
    hamburgerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    hamburgerIcon: { fontSize: 22, color: t.wordText, fontWeight: '700' },

    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      zIndex: 20,
    },
    panelSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25 },
    // Grand rectangle plein, coins à peine arrondis (pas la même
    // rondeur que les cartes/pilules ailleurs dans l'app) — demandé
    // explicitement comme "rectangulaire plein et grand", par
    // opposition au bandeau horizontal étroit de la première version.
    panel: {
      marginTop: 60,
      marginHorizontal: 16,
      backgroundColor: t.cardBackground,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 6,
    },
    // Onglets empilés les uns sur les autres, séparés par un trait —
    // demandé explicitement, par opposition aux pilules côte à côte de
    // la version précédente.
    row: { paddingVertical: 20, paddingHorizontal: 24 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
    rowActive: { backgroundColor: t.translationBackground },
    rowLabel: { fontSize: 16, fontWeight: '600', color: t.wordText },
    rowLabelActive: { color: t.buttonFilled, fontWeight: '700' },
  });
}
