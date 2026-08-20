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
 * ☰ en haut à droite, alignée sur la même ligne que le bouton clair/sombre
 * déjà présent là (`ThemeToggleButton`, dans RootTabs.tsx) — troisième
 * itération du 20/08/2026 : les deux premiers essais plaçaient l'icône en
 * haut à GAUCHE, à la même hauteur que le libellé "LEXIS" de chaque
 * écran, ce qui la faisait visuellement se superposer au logo. Déplacée
 * à droite, sur exactement le même `paddingTop` que le bouton clair/sombre
 * (même ligne, "même plan"), avec un espacement fixe entre les deux pour
 * ne jamais les faire se chevaucher.
 *
 * Un appui ouvre un tiroir plein écran en hauteur mais pas en largeur
 * (~78% de l'écran, ancré à droite, sous l'icône) plutôt que le grand
 * rectangle centré de la version précédente — glisse légèrement depuis la
 * droite. Onglets empilés verticalement, séparés par un trait fin et
 * discret qui ne touche pas les bords du tiroir (pas une bordure pleine
 * largeur). L'onglet actif est marqué par une fine barre de couleur à
 * gauche de la ligne plutôt qu'un bloc de fond plein, pour rester sobre.
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
          <FadeInView duration={220} direction="right" distance={-24} style={styles.drawer}>
            <SafeAreaView style={styles.drawerSafeArea}>
              <View style={styles.drawerHeaderSpace} />
              {TABS.map((tab, index) => (
                <View key={tab.key}>
                  <TabRow
                    styles={styles}
                    label={tab.label}
                    active={tab.key === current}
                    onPress={() => handleSelect(tab.key)}
                  />
                  {index < TABS.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </SafeAreaView>
          </FadeInView>
        </>
      )}
    </>
  );
}

function TabRow({
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
    <AnimatedPressable style={[styles.row, active && styles.rowActive]} haptic="none" scaleTo={0.98} onPress={onPress}>
      <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    hamburgerSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
    // `paddingTop: 6` reproduit exactement celui de `ThemeToggleButton`
    // (RootTabs.tsx) — même ligne horizontale. `paddingRight: 68` réserve
    // la largeur du bouton clair/sombre (38) + une marge (16) + un
    // espacement propre (14) pour qu'ils ne se touchent jamais.
    hamburgerRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 68, paddingTop: 6 },
    // Icône seule, sans fond/ombre/carte propre — reste "sur le même
    // plan" visuel que le reste de l'écran plutôt que de flotter
    // au-dessus comme un bouton d'action séparé.
    hamburgerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    hamburgerIcon: { fontSize: 20, color: t.wordText, fontWeight: '700' },

    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      zIndex: 20,
    },
    // Tiroir plein en hauteur, pas en largeur — ancré au bord droit, sous
    // l'icône qui l'ouvre. Ombre portée vers la gauche (le tiroir
    // recouvre le contenu, pas l'inverse).
    drawer: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '78%',
      maxWidth: 340,
      backgroundColor: t.cardBackground,
      borderLeftWidth: 1,
      borderLeftColor: t.cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: -6, height: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 10,
      zIndex: 25,
    },
    drawerSafeArea: { flex: 1 },
    drawerHeaderSpace: { height: 54 },

    row: { paddingVertical: 18, paddingHorizontal: 24, borderLeftWidth: 3, borderLeftColor: 'transparent' },
    rowActive: { borderLeftColor: t.buttonFilled },
    rowLabel: { fontSize: 16, fontWeight: '600', color: t.wordText },
    rowLabelActive: { color: t.buttonFilled, fontWeight: '700' },

    // Trait sobre et discret entre deux onglets — hairline (le plus fin
    // possible), opacité réduite, et surtout PAS pleine largeur (retiré
    // des bords du tiroir via une marge horizontale) : demandé
    // explicitement en remplacement de la bordure pleine largeur de la
    // version précédente.
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.cardBorder, marginHorizontal: 24, opacity: 0.6 },
  });
}
