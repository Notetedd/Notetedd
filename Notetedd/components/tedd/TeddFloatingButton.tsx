import React, { useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TeddState } from '../../app/services/Tedd/TeddManager';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = 60;

interface TeddFloatingButtonProps {
  state: TeddState;
  onPress: () => void;
  onLongPress?: () => void;
}

const TeddFloatingButton: React.FC<TeddFloatingButtonProps> = ({
  state,
  onPress,
  onLongPress,
}) => {
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 80, y: SCREEN_HEIGHT - 150 })).current;
  const [isDragging, setIsDragging] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only start dragging if moved more than 5 pixels
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
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
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          onPress();
          return;
        }

        // Snap to edge
        const finalX = gestureState.moveX < SCREEN_WIDTH / 2 ? 20 : SCREEN_WIDTH - BUTTON_SIZE - 20;
        
        Animated.spring(pan, {
          toValue: { x: finalX, y: gestureState.moveY - BUTTON_SIZE / 2 },
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Pulse animation for listening state
  React.useEffect(() => {
    if (state === 'listening' || state === 'wake-word-detection') {
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
    } else {
      pulse.setValue(1);
    }
  }, [state]);

  // Get color based on state
  const getStateColor = () => {
    switch (state) {
      case 'listening':
        return '#4CAF50'; // Green
      case 'processing':
        return '#FF9800'; // Orange
      case 'speaking':
        return '#2196F3'; // Blue
      case 'wake-word-detection':
        return '#9C27B0'; // Purple
      default:
        return '#6200EE'; // Primary purple
    }
  };

  // Get icon based on state
  const getStateIcon = () => {
    switch (state) {
      case 'listening':
        return 'mic';
      case 'processing':
        return 'hourglass';
      case 'speaking':
        return 'chatbubbles';
      case 'wake-word-detection':
        return 'ear';
      default:
        return 'chatbubble-ellipses';
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
        ]}
        activeOpacity={0.8}
        onLongPress={onLongPress}
        disabled={isDragging}
      >
        <Ionicons name={getStateIcon()} size={32} color="white" />
        
        {/* Listening ripple effect */}
        {state === 'listening' && (
          <View style={styles.rippleContainer}>
            <View style={[styles.ripple, styles.ripple1]} />
            <View style={[styles.ripple, styles.ripple2]} />
            <View style={[styles.ripple, styles.ripple3]} />
          </View>
        )}
      </TouchableOpacity>
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
});

export default TeddFloatingButton;