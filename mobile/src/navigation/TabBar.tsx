import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, SafeAreaView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
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

// Largeur en pixels plutôt qu'en pourcentage — un `SafeAreaView` sans
// `left` défini n'a pas de largeur propre à résoudre un `%` contre (voir
// commentaire sur `drawerPositioner`), donc calculée une fois ici à
// partir de la largeur d'écran réelle. Pas de gestion de rotation
// d'écran (app téléphone en portrait uniquement, pas un besoin réel ici).
const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.7);

// Hauteur de l'icône ☰/du bouton clair-sombre (`paddingTop: 6` +
// `height: 38`, identique pour les deux, voir plus bas) + un espace
// visible en dessous. Après deux retours ("encore trop proche", "encore
// en dessous du bouton thème sombre/clair") malgré des tiroirs
// grandissants, le vrai problème n'était probablement pas la valeur mais
// la MÉCANIQUE : un `SafeAreaView` ancré seulement à droite (pas
// pleine largeur) peut calculer une marge de sécurité différente de
// celle d'un `SafeAreaView` pleine largeur comme celui de l'icône
// (`hamburgerSafeArea` ci-dessous, jamais signalé mal placé) — l'encoche/
// l'île dynamique est détectée sur toute la largeur de l'écran, pas
// forcément sur une bande étroite ancrée à droite. Le tiroir utilise
// maintenant EXACTEMENT le même `SafeAreaView` pleine largeur que
// l'icône (`drawerSafeArea`), avec un espaceur explicite de la même
// hauteur avant son contenu, plutôt qu'un deuxième `SafeAreaView`
// imbriqué et étroit.
const DRAWER_TOP_OFFSET = 6 + 38 + 48;

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
 * Un appui ouvre un tiroir ancré au bord droit, du bas de l'icône ☰
 * jusqu'en bas de l'écran (70% de la largeur) — une carte dimensionnée à
 * son contenu a été essayée entre-temps mais jugée trop petite ; ce
 * tiroir plein en hauteur est le format retenu, avec juste une largeur
 * légèrement réduite par rapport à la toute première version (78%→70%).
 * Onglets empilés verticalement, séparés par un trait fin et discret qui
 * ne touche pas les bords du tiroir (pas une bordure pleine largeur).
 * L'onglet actif est marqué par une fine barre de couleur à gauche de la
 * ligne plutôt qu'un bloc de fond plein, pour rester sobre.
 *
 * Entrée en glissement pur (droite → gauche), sans fondu — demandé
 * explicitement en remplacement de `FadeInView` (qui couple toujours
 * fondu + translation, pas d'option pour l'un sans l'autre). Implémenté
 * ici avec `Animated` directement plutôt que d'ajouter un mode à
 * `FadeInView`, pour ne pas changer le comportement des autres écrans qui
 * l'utilisent avec fondu intentionnellement.
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
          <SafeAreaView style={styles.drawerSafeArea} pointerEvents="box-none">
            <View style={styles.drawerSpacer} pointerEvents="box-none" />
            <SlideInFromRight style={[styles.drawer, { width: DRAWER_WIDTH }]}>
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
            </SlideInFromRight>
          </SafeAreaView>
        </>
      )}
    </>
  );
}

/** Glissement pur (translateX), aucune animation d'opacité — voir le
 * commentaire au-dessus de `TabBar`. Décélération `Easing.out(cubic)`
 * plutôt que l'accélération/décélération par défaut d'`Animated.timing`
 * — demandé explicitement ("smooth"), une courbe qui ralentit en douceur
 * en approchant de sa position finale se sent plus fluide qu'une vitesse
 * quasi constante sur toute la durée. */
function SlideInFromRight({ style, children }: { style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  useEffect(() => {
    const animation = Animated.timing(translateX, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={[style, { transform: [{ translateX }] }]}>{children}</Animated.View>;
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
    // Pleine largeur (`left: 0, right: 0`), exactement comme
    // `hamburgerSafeArea` ci-dessus — pas une bande étroite ancrée à
    // droite (ancienne version). Une encoche/île dynamique est détectée
    // par rapport à toute la largeur de l'écran ; un `SafeAreaView`
    // étroit ancré à droite peut ne pas calculer la même marge de
    // sécurité qu'un `SafeAreaView` pleine largeur, ce qui a
    // probablement causé les retours répétés ("encore trop proche")
    // malgré des valeurs d'espacement grandissantes. `alignItems:
    // 'flex-end'` pousse le tiroir (largeur fixe `DRAWER_WIDTH`) contre
    // le bord droit à l'intérieur de cette zone pleine largeur.
    drawerSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'flex-end', zIndex: 25 },
    // Espaceur explicite (icône + espace visible) plutôt qu'une marge
    // qui pourrait se combiner de façon imprévisible avec le padding de
    // sécurité automatique — même hauteur que `hamburgerRow.paddingTop`
    // + `hamburgerButton.height` + une marge généreuse.
    drawerSpacer: { height: DRAWER_TOP_OFFSET },
    // Tiroir ancré au bord droit, du bas de l'espaceur jusqu'en bas de
    // l'écran (le `SafeAreaView` parent gère déjà l'espace de sécurité
    // du bas, ex. l'indicateur d'accueil).
    drawer: {
      flex: 1,
      backgroundColor: t.cardBackground,
      borderLeftWidth: 1,
      borderLeftColor: t.cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: -6, height: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 10,
    },

    row: { paddingVertical: 18, paddingHorizontal: 24, borderLeftWidth: 3, borderLeftColor: 'transparent' },
    rowActive: { borderLeftColor: t.buttonFilled },
    rowLabel: { fontSize: 16, fontWeight: '600', color: t.wordText },
    rowLabelActive: { color: t.buttonFilled, fontWeight: '700' },

    // Trait sobre et discret entre deux onglets — hairline (le plus fin
    // possible), opacité réduite, et surtout PAS pleine largeur (retiré
    // des bords du tiroir via une marge horizontale).
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.cardBorder, marginHorizontal: 24, opacity: 0.6 },
  });
}
