import { SafeAreaView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Espace par défaut entre le contenu et le bord de l'écran, sur les 4
 * côtés. Centralisé dans un seul composant après un retour utilisateur
 * indiquant que le padding ajouté séparément dans le style de chaque
 * écran ne se voyait pas — ici il est posé sur la vraie racine visuelle
 * de l'écran (à l'intérieur du `SafeAreaView`, en dehors de toute liste
 * ou zone défilante qui aurait pu appliquer le sien indépendamment). */
export const SCREEN_EDGE_PADDING = 22;

type Props = {
  children: React.ReactNode;
  backgroundColor: string;
  style?: StyleProp<ViewStyle>;
  paddingHorizontal?: number;
  paddingVertical?: number;
};

export function ScreenContainer({
  children,
  backgroundColor,
  style,
  paddingHorizontal = SCREEN_EDGE_PADDING,
  paddingVertical = SCREEN_EDGE_PADDING,
}: Props) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]}>
      <View style={[styles.inner, { paddingHorizontal, paddingVertical }, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1 },
});
