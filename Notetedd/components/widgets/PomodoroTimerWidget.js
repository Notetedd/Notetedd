import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PomodoroTimerWidget = ({ theme = 'light', onSessionComplete }) => {
  const isDark = theme === 'dark';
  
  // Timer states
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes in seconds
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState('focus'); // 'focus' or 'break'
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  
  // Animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  const FOCUS_TIME = 25 * 60;
  const BREAK_TIME = 5 * 60;
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  
  useEffect(() => {
    let interval = null;
    
    if (isActive && !isPaused && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => {
          if (time <= 1) {
            handleSessionComplete();
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    
    return () => clearInterval(interval);
  }, [isActive, isPaused, timeLeft]);
  
  useEffect(() => {
    // Update progress animation
    const totalTime = mode === 'focus' ? FOCUS_TIME : BREAK_TIME;
    const progress = 1 - (timeLeft / totalTime);
    
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [timeLeft, mode]);
  
  useEffect(() => {
    // Pulse animation when active
    if (isActive && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, isPaused]);
  
  const handleSessionComplete = () => {
    setIsActive(false);
    
    if (mode === 'focus') {
      setSessionsCompleted(prev => prev + 1);
      setMode('break');
      setTimeLeft(BREAK_TIME);
      if (onSessionComplete) onSessionComplete('focus');
    } else {
      setMode('focus');
      setTimeLeft(FOCUS_TIME);
      if (onSessionComplete) onSessionComplete('break');
    }
  };
  
  const toggleTimer = () => {
    if (!isActive) {
      setIsActive(true);
      setIsPaused(false);
    } else if (isPaused) {
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  };
  
  const resetTimer = () => {
    setIsActive(false);
    setIsPaused(false);
    setTimeLeft(mode === 'focus' ? FOCUS_TIME : BREAK_TIME);
  };
  
  const switchMode = () => {
    setIsActive(false);
    setIsPaused(false);
    const newMode = mode === 'focus' ? 'break' : 'focus';
    setMode(newMode);
    setTimeLeft(newMode === 'focus' ? FOCUS_TIME : BREAK_TIME);
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const totalTime = mode === 'focus' ? FOCUS_TIME : BREAK_TIME;
  const progress = 1 - (timeLeft / totalTime);
  const strokeDashoffset = circumference * (1 - progress);
  
  const modeColors = mode === 'focus' 
    ? { primary: '#9B5DE5', secondary: '#6B21A8', bg: '#F3E8FF' }
    : { primary: '#10B981', secondary: '#059669', bg: '#ECFDF5' };
  
  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.modeContainer}>
          <View style={[styles.modeDot, { backgroundColor: modeColors.primary }]} />
          <Text style={[styles.modeText, isDark && styles.darkText]}>
            {mode === 'focus' ? 'Focus Time' : 'Break Time'}
          </Text>
        </View>
        
        <TouchableOpacity 
          style={styles.switchButton}
          onPress={switchMode}
          disabled={isActive}
        >
          <MaterialIcons 
            name="swap-horiz" 
            size={20} 
            color={isActive ? '#9CA3AF' : modeColors.primary} 
          />
        </TouchableOpacity>
      </View>
      
      {/* Timer Circle */}
      <Animated.View 
        style={[
          styles.timerContainer,
          { transform: [{ scale: pulseAnim }] }
        ]}
      >
        <Svg width={radius * 2 + 20} height={radius * 2 + 20}>
          {/* Background circle */}
          <Circle
            cx={(radius * 2 + 20) / 2}
            cy={(radius * 2 + 20) / 2}
            r={radius}
            stroke={isDark ? '#374151' : '#E5E7EB'}
            strokeWidth={strokeWidth}
            fill="none"
          />
          
          {/* Progress circle */}
          <Circle
            cx={(radius * 2 + 20) / 2}
            cy={(radius * 2 + 20) / 2}
            r={radius}
            stroke={modeColors.primary}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${(radius * 2 + 20) / 2} ${(radius * 2 + 20) / 2})`}
          />
        </Svg>
        
        <View style={styles.timerContent}>
          <Text style={[styles.timeText, isDark && styles.darkText]}>
            {formatTime(timeLeft)}
          </Text>
          <Text style={[styles.timeLabel, { color: modeColors.primary }]}>
            {mode === 'focus' ? 'Stay focused!' : 'Take a break'}
          </Text>
        </View>
      </Animated.View>
      
      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.controlButton, styles.secondaryButton]}
          onPress={resetTimer}
          disabled={!isActive && timeLeft === totalTime}
        >
          <MaterialIcons 
            name="replay" 
            size={24} 
            color={!isActive && timeLeft === totalTime ? '#9CA3AF' : '#6B7280'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={toggleTimer}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[modeColors.primary, modeColors.secondary]}
            style={styles.playButton}
          >
            <MaterialIcons 
              name={!isActive || isPaused ? 'play-arrow' : 'pause'} 
              size={32} 
              color="#fff" 
            />
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.controlButton, styles.secondaryButton]}
          onPress={() => setTimeLeft(prev => Math.min(prev + 60, totalTime))}
          disabled={isActive}
        >
          <MaterialIcons 
            name="add" 
            size={24} 
            color={isActive ? '#9CA3AF' : '#6B7280'} 
          />
        </TouchableOpacity>
      </View>
      
      {/* Sessions Counter */}
      <View style={styles.sessionsContainer}>
        <MaterialIcons name="check-circle" size={18} color={modeColors.primary} />
        <Text style={[styles.sessionsText, isDark && styles.darkText]}>
          {sessionsCompleted} session{sessionsCompleted !== 1 ? 's' : ''} completed today
        </Text>
      </View>
      
      {/* Session dots indicator */}
      <View style={styles.dotsContainer}>
        {[...Array(4)].map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < (sessionsCompleted % 4) && { backgroundColor: modeColors.primary },
              index >= (sessionsCompleted % 4) && { 
                backgroundColor: isDark ? '#374151' : '#E5E7EB' 
              }
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 24,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    alignItems: 'center',
  },
  darkContainer: {
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  modeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  darkText: {
    color: '#F9FAFB',
  },
  switchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  timerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1F2937',
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 20,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sessionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  sessionsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default PomodoroTimerWidget;