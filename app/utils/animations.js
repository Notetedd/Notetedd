import { Animated } from 'react-native';

export const fadeIn = (animatedValue, duration = 300) => {
  return Animated.timing(animatedValue, {
    toValue: 1,
    duration,
    useNativeDriver: true,
  });
};

export const scaleUp = (animatedValue, toValue = 1) => {
  return Animated.spring(animatedValue, {
    toValue,
    tension: 50,
    friction: 7,
    useNativeDriver: true,
  });
};

export const slideIn = (animatedValue, direction = 'up') => {
  const toValue = 0;
  return Animated.timing(animatedValue, {
    toValue,
    duration: 400,
    useNativeDriver: true,
  });
};

// Composite animation
export const entranceAnimation = (fadeAnim, scaleAnim, slideAnim) => {
  return Animated.parallel([
    fadeIn(fadeAnim, 800),
    scaleUp(scaleAnim),
    slideIn(slideAnim),
  ]);
};

// Default export
export default {
  fadeIn,
  scaleUp,
  slideIn,
  entranceAnimation,
};