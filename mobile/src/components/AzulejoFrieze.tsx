import { StyleSheet, View } from 'react-native';
import type { SolYSombraPalette } from '../theme/solYSombra';

/**
 * Frise géométrique discrète façon azulejo andalou (losanges répétés) —
 * prévue dans le cahier des charges d'origine ("en bas des cartes, en
 * SVG ou en Canvas... pas une image bitmap"), jamais implémentée avant
 * ce chantier. Faite en `View` pures plutôt qu'en SVG pour ne pas
 * ajouter `react-native-svg` comme dépendance supplémentaire — le rendu
 * (petits carrés tournés à 45°) reste vectoriel et léger.
 *
 * Volontairement discrète : opacité faible, aucun symbole national
 * (pas de drapeau, pas de taureau).
 */
export function AzulejoFrieze({ theme, count = 9 }: { theme: SolYSombraPalette; count?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.diamond,
            {
              borderColor: theme.cardBorder,
              backgroundColor: i % 2 === 0 ? theme.cardBorder : 'transparent',
              opacity: i % 2 === 0 ? 0.3 : 0.45,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16 },
  diamond: { width: 6, height: 6, borderWidth: 1, transform: [{ rotate: '45deg' }] },
});
