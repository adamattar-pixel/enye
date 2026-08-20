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
 * `react-native-reanimated`) — voir AUDIT.md, 20/08/2026 : suspecté (pas
 * confirmé formellement) d'être la cause de boutons qui ne réagissaient
 * pas au toucher et d'animations invisibles sur device. `Animated` ne
 * dépend d'aucun module natif tiers, donc ne peut pas souffrir du même
 * type de problème de compatibilité avec Expo Go.
 *
 * `hitSlop` élargit la zone tactile au-delà des limites visuelles du
 * bouton — répond aussi au retour "les boutons sont trop petits".
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
    <Pressable
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={(e) => {
        triggerHaptic(haptic);
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : null]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
