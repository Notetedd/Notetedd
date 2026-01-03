import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const { width } = Dimensions.get('window');

const StudyAnalyticsWidget = ({ theme = 'light', weeklyData }) => {
  const isDark = theme === 'dark';
  
  // Sample data if none provided
  const data = weeklyData || [
    { day: 'Mon', hours: 2, label: 'M' },
    { day: 'Tue', hours: 3.5, label: 'T' },
    { day: 'Wed', hours: 1.5, label: 'W' },
    { day: 'Thu', hours: 4, label: 'T' },
    { day: 'Fri', hours: 2.5, label: 'F' },
    { day: 'Sat', hours: 0.5, label: 'S' },
    { day: 'Sun', hours: 1, label: 'S' },
  ];
  
  const maxHours = Math.max(...data.map(d => d.hours));
  const totalWeekHours = data.reduce((sum, d) => sum + d.hours, 0);
  const avgHours = (totalWeekHours / 7).toFixed(1);
  
  // Animation refs
  const barAnims = useRef(data.map(() => new Animated.Value(0))).current;
  
  useEffect(() => {
    // Animate bars on mount
    const animations = barAnims.map((anim, index) => 
      Animated.timing(anim, {
        toValue: 1,
        duration: 800,
        delay: index * 100,
        useNativeDriver: false,
      })
    );
    
    Animated.stagger(100, animations).start();
  }, []);
  
  const getBarHeight = (hours) => {
    const maxHeight = 100;
    return (hours / maxHours) * maxHeight;
  };
  
  const getBarColor = (hours) => {
    if (hours >= 3) return ['#10B981', '#059669']; // Green
    if (hours >= 1.5) return ['#F59E0B', '#D97706']; // Yellow
    return ['#EF4444', '#DC2626']; // Red
  };
  
  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDark && styles.darkText]}>
            This Week
          </Text>
          <Text style={styles.subtitle}>
            {totalWeekHours.toFixed(1)} hours total
          </Text>
        </View>
        <View style={styles.avgBadge}>
          <MaterialIcons name="trending-up" size={16} color="#10B981" />
          <Text style={styles.avgText}>{avgHours}h avg</Text>
        </View>
      </View>
      
      {/* Chart */}
      <View style={styles.chartContainer}>
        <View style={styles.chart}>
          {data.map((item, index) => {
            const barHeight = getBarHeight(item.hours);
            const colors = getBarColor(item.hours);
            const animatedHeight = barAnims[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0, barHeight],
            });
            
            return (
              <View key={item.day} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <Animated.View style={[styles.barTrack, { height: 100 }]}>
                    <Animated.View style={{ height: animatedHeight, width: '100%' }}>
                      <LinearGradient
                        colors={colors}
                        style={styles.bar}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                      >
                        {item.hours > 0 && (
                          <Text style={styles.hourLabel}>
                            {item.hours}h
                          </Text>
                        )}
                      </LinearGradient>
                    </Animated.View>
                  </Animated.View>
                </View>
                <Text style={[styles.dayLabel, isDark && styles.darkLabel]}>
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      
      {/* Insights */}
      <View style={styles.insightsContainer}>
        <View style={styles.insight}>
          <MaterialIcons name="show-chart" size={18} color="#9B5DE5" />
          <Text style={[styles.insightText, isDark && styles.darkLabel]}>
            {data[3].hours > avgHours ? 'Thursday is your best day!' : 'Try studying more on Thursdays'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 24,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
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
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  darkText: {
    color: '#F9FAFB',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  avgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  avgText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  chartContainer: {
    marginBottom: 20,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  barTrack: {
    width: 28,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hourLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  darkLabel: {
    color: '#9CA3AF',
  },
  insightsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
});

export default StudyAnalyticsWidget;