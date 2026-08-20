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

// Hauteur de l'icône ☰ (`hamburgerRow.paddingTop` + `hamburgerButton.height`,
// voir plus bas) + un espace visible en dessous — le tiroir doit
// commencer nettement sous l'icône, pas à une valeur devinée depuis le
// haut de l'écran (bug signalé le 20/08/2026 : un décalage fixe en
// pixels depuis le tout haut de l'écran ignore la hauteur réelle de
// l'encoche/l'île dynamique selon l'appareil, donc le tiroir pouvait
// démarrer plus haut que l'icône). L'espace sous l'icône est passé de
// 16 à 40px après un deuxième retour ("encore plus bas, bien sous le
// bouton") — 16px restait perçu comme trop proche/collé.
const DRAWER_TOP_OFFSET = 6 + 38 + 40;

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
          <SlideInFromRight style={styles.drawerPositioner}>
            <SafeAreaView style={[styles.drawer, { width: DRAWER_WIDTH }]}>
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
          </SlideInFromRight>
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
    // Boîte de positionnement pure (pas de fond/bordure ici) — un
    // `SafeAreaView` sans `left` défini n'a pas de largeur propre contre
    // laquelle résoudre un `%`, donc toute l'apparence visuelle (fond,
    // bordure, ombre) vit sur le `SafeAreaView` enfant (`drawer`
    // ci-dessous), avec une largeur en pixels calculée une fois
    // (`DRAWER_WIDTH`).
    drawerPositioner: { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 25 },
    // Tiroir ancré au bord droit, du bas de l'icône ☰ jusqu'en bas de
    // l'écran. `marginTop: DRAWER_TOP_OFFSET` s'ajoute au padding de
    // sécurité automatique du `SafeAreaView` (encoche/île dynamique) —
    // aligne le bord haut du tiroir exactement sur le bord bas de
    // l'icône, quelle que soit la taille de l'encoche de l'appareil,
    // plutôt qu'un décalage fixe en pixels depuis le tout haut de
    // l'écran (bug signalé : le tiroir démarrait trop haut, "borné par
    // le haut" de l'icône plutôt que par son bas).
    drawer: {
      marginTop: DRAWER_TOP_OFFSET,
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
