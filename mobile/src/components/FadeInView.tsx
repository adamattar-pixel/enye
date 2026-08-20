import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

type Direction = 'up' | 'right' | 'none';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
  distance?: number;
  direction?: Direction;
};

/**
 * Rejoue un fondu (+ léger glissement) à chaque montage — remplace les
 * props `entering={FadeInDown/FadeInUp/FadeInRight...}` de
 * react-native-reanimated par l'API `Animated` intégrée à React Native
 * (voir AnimatedPressable.tsx pour le pourquoi de ce choix).
 *
 * Se déclenche au montage : pour rejouer l'animation sur un contenu qui
 * change sans démonter/remonter le composant parent, passer une `key`
 * différente depuis l'appelant (déjà fait pour la carte de révision,
 * par ex.).
 */
export function FadeInView({ children, style, delay = 0, duration = 350, distance = 16, direction = 'up' }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration, delay, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transform =
    direction === 'up'
      ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }]
      : direction === 'right'
        ? [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }]
        : [];

  return <Animated.View style={[style, { opacity: progress, transform }]}>{children}</Animated.View>;
}
