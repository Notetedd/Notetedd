import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = 60;

const TeddFloatingButton = ({ 
  state, 
  mode = 'text',
  speechAvailable = false,
  onPress, 
  onLongPress 
}) => {
  const pan = useRef(
    new Animated.ValueXY({
      x: SCREEN_WIDTH - 80,
      y: SCREEN_HEIGHT - 150,
    })
  ).current;

  const [isDragging, setIsDragging] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only start dragging if moved more than 5 pixels
        return (
          Math.abs(gestureState.dx) > 5 ||
          Math.abs(gestureState.dy) > 5
        );
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        Animated.spring(scale, {
          toValue: 1.1,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
        }).start();

        // If barely moved, treat as tap
        if (
          Math.abs(gestureState.dx) < 5 &&
          Math.abs(gestureState.dy) < 5
        ) {
          onPress();
          return;
        }

        // Snap to edge
        const finalX =
          gestureState.moveX < SCREEN_WIDTH / 2
            ? 20
            : SCREEN_WIDTH - BUTTON_SIZE - 20;

        Animated.spring(pan, {
          toValue: {
            x: finalX,
            y: gestureState.moveY - BUTTON_SIZE / 2,
          },
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Animations based on state
  useEffect(() => {
    // Stop all animations first
    pulse.stopAnimation();
    rotate.stopAnimation();

    if (state === 'listening' || state === 'wake-word-detection') {
      // Pulse animation for listening states
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: false,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else if (state === 'processing') {
      // Rotation animation for processing
      Animated.loop(
        Animated.timing(rotate, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        })
      ).start();
    } else if (state === 'speaking') {
      // Gentle pulse for speaking
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      // Reset animations
      pulse.setValue(1);
      rotate.setValue(0);
    }
  }, [state]);

  // Spin interpolation for processing state
  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Get color based on state and mode
  const getStateColor = () => {
    switch (state) {
      case 'listening':
        return '#4CAF50';
      case 'processing':
        return '#FF9800';
      case 'speaking':
        return '#2196F3';
      case 'wake-word-detection':
        return '#9C27B0';
      case 'idle':
      default:
        // Different color for speech vs text mode when idle
        return mode === 'speech' ? '#7C4DFF' : '#6200EE';
    }
  };

  // Get icon based on state and mode
  const getStateIcon = () => {
    switch (state) {
      case 'listening':
        return 'mic';
      case 'processing':
        return 'hourglass';
      case 'speaking':
        return 'volume-high';
      case 'wake-word-detection':
        return 'ear';
      case 'idle':
      default:
        // Different icon for speech vs text mode when idle
        return mode === 'speech' ? 'chatbubbles' : 'chatbubble-ellipses';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: Animated.multiply(scale, pulse) },
            { rotate: state === 'processing' ? spin : '0deg' },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: getStateColor() },
          state === 'listening' && styles.listeningButton,
          state === 'wake-word-detection' && styles.wakeWordButton,
        ]}
        activeOpacity={0.8}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={isDragging}
      >
        <Ionicons name={getStateIcon()} size={32} color="white" />

        {/* Ripple effect for listening */}
        {state === 'listening' && (
          <View style={styles.rippleContainer}>
            <View style={[styles.ripple, styles.ripple1]} />
            <View style={[styles.ripple, styles.ripple2]} />
            <View style={[styles.ripple, styles.ripple3]} />
          </View>
        )}

        {/* Ring indicator for wake word detection */}
        {state === 'wake-word-detection' && (
          <Animated.View
            style={[
              styles.indicatorRing,
              {
                transform: [{ scale: pulse }],
              },
            ]}
          />
        )}
      </TouchableOpacity>

      {/* Mode indicator badge */}
      {state === 'idle' && (
        <View style={[
          styles.modeBadge,
          mode === 'speech' ? styles.speechModeBadge : styles.textModeBadge
        ]}>
          <Ionicons 
            name={mode === 'speech' ? 'mic-outline' : 'text-outline'} 
            size={10} 
            color="#fff" 
          />
        </View>
      )}

      {/* Speech unavailable indicator */}
      {mode === 'speech' && !speechAvailable && state === 'idle' && (
        <View style={styles.unavailableBadge}>
          <Ionicons name="close-circle" size={12} color="#FF3B30" />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    zIndex: 1000,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  listeningButton: {
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  wakeWordButton: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  rippleContainer: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  ripple1: {
    transform: [{ scale: 1.2 }],
  },
  ripple2: {
    transform: [{ scale: 1.5 }],
  },
  ripple3: {
    transform: [{ scale: 1.8 }],
  },
  indicatorRing: {
    position: 'absolute',
    width: BUTTON_SIZE + 10,
    height: BUTTON_SIZE + 10,
    borderRadius: (BUTTON_SIZE + 10) / 2,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    top: -5,
    left: -5,
  },
  modeBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  speechModeBadge: {
    backgroundColor: '#7C4DFF',
  },
  textModeBadge: {
    backgroundColor: '#6200EE',
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export default TeddFloatingButton;