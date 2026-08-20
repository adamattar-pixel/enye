import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type HapticOption = Haptics.ImpactFeedbackStyle | Haptics.NotificationFeedbackType | 'selection' | 'none';

type Props = {
  children: ReactNode;
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

/** Bouton avec un léger retrait au toucher (spring) et un retour
 * haptique — remplace `TouchableOpacity` sur les interactions
 * principales pour une sensation plus « app native » que l'opacité seule. */
export function AnimatedPressable({
  children,
  style,
  onPress,
  disabled,
  haptic = Haptics.ImpactFeedbackStyle.Light,
  scaleTo = 0.96,
  accessibilityLabel,
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        scale.value = withTiming(scaleTo, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 180 });
      }}
      onPress={(e) => {
        triggerHaptic(haptic);
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, animatedStyle, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}
