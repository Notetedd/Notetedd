import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

export const AchievementModal = ({ visible, achievement, onClose, theme = 'light' }) => {
  const isDark = theme === 'dark';
  
  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const confettiAnims = useRef(
    [...Array(12)].map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rotate: new Animated.Value(0),
      scale: new Animated.Value(1),
    }))
  ).current;
  
  useEffect(() => {
    if (visible && achievement) {
      // Reset animations
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      rotateAnim.setValue(0);
      bounceAnim.setValue(0);
      
      // Start animations
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(bounceAnim, {
            toValue: 1,
            tension: 100,
            friction: 4,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
      
      // Confetti animation
      animateConfetti();
    }
  }, [visible, achievement]);
  
  const animateConfetti = () => {
    const animations = confettiAnims.map((anim, index) => {
      const angle = (index / confettiAnims.length) * Math.PI * 2;
      const distance = 150;
      
      return Animated.parallel([
        Animated.timing(anim.x, {
          toValue: Math.cos(angle) * distance,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(anim.y, {
          toValue: Math.sin(angle) * distance - 100,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(anim.rotate, {
          toValue: Math.random() * 720,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(anim.scale, {
            toValue: 1.5,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(anim.scale, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    
    Animated.parallel(animations).start();
  };
  
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  const bounce = bounceAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -20, 0],
  });
  
  if (!achievement) return null;
  
  const confettiColors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#9B5DE5', '#FFD93D', '#00B4D8'];
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Confetti particles */}
          <View style={styles.confettiContainer}>
            {confettiAnims.map((anim, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.confetti,
                  {
                    backgroundColor: confettiColors[index % confettiColors.length],
                    transform: [
                      { translateX: anim.x },
                      { translateY: anim.y },
                      { rotate: anim.rotate.interpolate({
                          inputRange: [0, 720],
                          outputRange: ['0deg', '720deg'],
                        })
                      },
                      { scale: anim.scale },
                    ],
                  },
                ]}
              />
            ))}
          </View>
          
          <LinearGradient
            colors={
              isDark 
                ? ['#1F2937', '#374151']
                : ['#FFFFFF', '#F9FAFB']
            }
            style={styles.card}
          >
            {/* Header glow */}
            <View style={[styles.glowCircle, { backgroundColor: achievement.color + '20' }]} />
            
            {/* Achievement Icon */}
            <Animated.View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: achievement.color + '20',
                  transform: [
                    { rotate },
                    { translateY: bounce },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[achievement.color, achievement.color + 'CC']}
                style={styles.iconGradient}
              >
                <MaterialIcons 
                  name={achievement.icon} 
                  size={64} 
                  color="#fff" 
                />
              </LinearGradient>
            </Animated.View>
            
            {/* Text Content */}
            <Text style={styles.achievementUnlocked}>Achievement Unlocked!</Text>
            
            <Text style={[styles.achievementTitle, isDark && styles.darkText]}>
              {achievement.title}
            </Text>
            
            <Text style={[styles.achievementDescription, isDark && styles.darkDescription]}>
              {achievement.description}
            </Text>
            
            {/* Points badge */}
            {achievement.points && (
              <View style={styles.pointsBadge}>
                <MaterialIcons name="stars" size={16} color="#FFD700" />
                <Text style={styles.pointsText}>+{achievement.points} XP</Text>
              </View>
            )}
            
            {/* Close button */}
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[achievement.color, achievement.color + 'DD']}
                style={styles.closeButtonGradient}
              >
                <Text style={styles.closeButtonText}>Awesome!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.85,
    maxWidth: 400,
    position: 'relative',
  },
  confettiContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 1,
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  card: {
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    overflow: 'hidden',
  },
  glowCircle: {
    position: 'absolute',
    top: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.3,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementUnlocked: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B5DE5',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  achievementTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  darkText: {
    color: '#F9FAFB',
  },
  achievementDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  darkDescription: {
    color: '#D1D5DB',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
    gap: 6,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  closeButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  closeButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AchievementModal;