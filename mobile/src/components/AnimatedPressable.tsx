import { useRef } from 'react';
import { Animated, Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

type HapticOption = Haptics.ImpactFeedbackStyle | Haptics.NotificationFeedbackType | 'selection' | 'none';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** `'none'` pour désactiver le retour haptique (liens texte discrets,
   * boutons répétés dans une liste) — actif par défaut ailleurs. Accepte
   * aussi un `NotificationFeedbackType` (ex. `Success` pour une action
   * de sauvegarde) ou `'selection'`, pas seulement `ImpactFeedbackStyle`. */
  haptic?: HapticOption;
  scaleTo?: number;
  accessibilityLabel?: string;
};

const IMPACT_STYLES = new Set(Object.values(Haptics.ImpactFeedbackStyle));
const NOTIFICATION_TYPES = new Set(Object.values(Haptics.NotificationFeedbackType));

// `Pressable` animée directement (pas un `Pressable` qui contient un
// `Animated.View` séparé) — voir le commentaire plus bas sur pourquoi ce
// n'est pas juste une préférence de style.
const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

function triggerHaptic(haptic: HapticOption) {
  if (haptic === 'none') return;
  if (haptic === 'selection') {
    Haptics.selectionAsync();
    return;
  }
  if (IMPACT_STYLES.has(haptic as Haptics.ImpactFeedbackStyle)) {
    Haptics.impactAsync(haptic as Haptics.ImpactFeedbackStyle);
    return;
  }
  if (NOTIFICATION_TYPES.has(haptic as Haptics.NotificationFeedbackType)) {
    Haptics.notificationAsync(haptic as Haptics.NotificationFeedbackType);
  }
}

/**
 * Bouton avec un léger retrait au toucher + retour haptique — remplace
 * `TouchableOpacity` sur les interactions principales.
 *
 * Basé sur l'API `Animated` intégrée à React Native (pas
 * `react-native-reanimated`) — voir docs/AUDIT.md, 20/08/2026 : suspecté (pas
 * confirmé formellement) d'être la cause de boutons qui ne réagissaient
 * pas au toucher et d'animations invisibles sur device. `Animated` ne
 * dépend d'aucun module natif tiers, donc ne peut pas souffrir du même
 * type de problème de compatibilité avec Expo Go.
 *
 * `hitSlop` élargit la zone tactile au-delà des limites visuelles du
 * bouton — répond aussi au retour "les boutons sont trop petits".
 *
 * **Un seul composant animé, pas un `Pressable` qui enveloppe un
 * `Animated.View` séparé.** La version précédente appliquait `style`
 * (donc `flex`, `height`, `borderRadius`...) uniquement à l'`Animated.View`
 * intérieur, pas au `Pressable` extérieur — qui, sans aucun style propre,
 * n'avait pas de taille déterminée dans une rangée flex (`flexDirection:
 * 'row'`). Résultat rapporté : "les boutons apparaissent comme des traits
 * entassés" (le `Pressable` s'écrase à la taille de son contenu, le
 * `flex: 1` de l'enfant ne peut pas se résoudre contre un parent sans
 * taille propre). Fixé en rendant le `Pressable` lui-même animable via
 * `Animated.createAnimatedComponent` : `style` (mise en page + visuel) et
 * le `transform` de l'animation vivent maintenant sur le même élément,
 * qui est bien celui positionné dans la rangée.
 */
export function AnimatedPressable({
  children,
  style,
  onPress,
  disabled,
  haptic = Haptics.ImpactFeedbackStyle.Light,
  scaleTo = 0.96,
  accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, { toValue: scaleTo, duration: 90, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  return (
    <AnimatedPressableBase
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={(e: GestureResponderEvent) => {
        triggerHaptic(haptic);
        onPress?.(e);
      }}
      style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : null]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
