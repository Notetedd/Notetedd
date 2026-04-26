import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialIcons } from "@expo/vector-icons";

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const getT = (isDark) => ({
  bg:           isDark ? '#08080f'                : '#f4f1ec',
  surface:      isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
  surfaceUp:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  border:       isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)',
  borderBright: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.18)',
  text:         isDark ? '#f5f2ff'                : '#1a1815',
  textMuted:    isDark ? 'rgba(245, 242, 255, 0.83)' : 'rgba(26,24,21,0.50)',
  textDim:      isDark ? 'rgba(245, 242, 255, 0.71)' : 'rgba(26,24,21,0.28)',
  barEmpty:     isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
  yLine:        isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
  // Accent colors — same in both modes
  purple:       '#7c3aed',
  purpleLight:  '#a855f7',
  purpleDim:    isDark ? 'rgba(124,58,237,0.18)'  : 'rgba(124,58,237,0.12)',
  orange:       '#ff6432',
  orangeLight:  '#ff8c5a',
  orangeDim:    isDark ? 'rgba(255,100,50,0.16)'  : 'rgba(255,100,50,0.10)',
  teal:         '#0d9488',
  tealDim:      isDark ? 'rgba(13,148,136,0.16)'  : 'rgba(13,148,136,0.10)',
  red:          '#e11d48',
});

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const { width: W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Mono = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 2.8, textTransform: 'uppercase', color }, style]}>
    {children}
  </Text>
);

const CB = ({ pos, color, s = 10 }) => {
  const isR = pos.includes('right'), isB = pos.includes('bottom');
  const base = { position: 'absolute' };
  if (pos.includes('top'))    base.top    = 0;
  if (pos.includes('bottom')) base.bottom = 0;
  if (pos.includes('left'))   base.left   = 0;
  if (pos.includes('right'))  base.right  = 0;
  return (
    <View style={[base, { width: s, height: s }]} pointerEvents="none">
      <View style={{ position: 'absolute', top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: s, height: 1.5, backgroundColor: color, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: 1.5, height: s, backgroundColor: color, opacity: 0.5 }} />
    </View>
  );
};

// ─── Bar color logic ──────────────────────────────────────────────────────────
const getBarAccent = (hours, avg, T) => {
  if (hours === 0)        return { color: T.barEmpty, glow: false };
  if (hours >= avg * 1.3) return { color: T.purple,   glow: true  };
  if (hours >= avg * 0.8) return { color: T.teal,     glow: true  };
  return                         { color: T.orange,   glow: false };
};

// ─── Single animated bar ──────────────────────────────────────────────────────
const Bar = ({ item, anim, maxHours, avg, isToday, BAR_MAX_H, T }) => {
  const { color, glow } = getBarAccent(item.hours, avg, T);

  const animH = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, item.hours === 0 ? 4 : Math.max(8, (item.hours / maxHours) * BAR_MAX_H)],
  });

  return (
    <View style={styles.barCol}>
      {item.hours > 0 && (
        <Animated.View style={{ opacity: anim }}>
          <Text style={[styles.barHourLabel, { color: isToday ? color : T.textDim }]}>{item.hours}</Text>
        </Animated.View>
      )}
      <View style={[styles.barTrack, { height: BAR_MAX_H, backgroundColor: T.barEmpty }]}>
        <Animated.View
          style={[styles.barFill, {
            height: animH,
            backgroundColor: color,
            shadowColor: glow ? color : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: glow ? 0.7 : 0,
            shadowRadius: glow ? 8 : 0,
            elevation: glow ? 4 : 0,
          }]}
        />
        {isToday && <View style={[styles.barTodayLine, { backgroundColor: color }]} />}
      </View>
      <Text style={[styles.barDayLabel, { color: isToday ? color : T.textDim, fontWeight: isToday ? '700' : '400' }]}>
        {item.label}
      </Text>
    </View>
  );
};

// ─── Insight chip ─────────────────────────────────────────────────────────────
const InsightChip = ({ label, value, accent, delay, T }) => {
  const opa = useRef(new Animated.Value(0)).current;
  const tx  = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opa, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(tx,  { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.insightChip, { borderColor: `${accent}28`, backgroundColor: T.surface, opacity: opa, transform: [{ translateX: tx }] }]}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.06, borderRadius: 12 }} />
      <CB pos="top-left"     color={accent} s={8} />
      <CB pos="bottom-right" color={accent} s={8} />
      <Text style={[styles.insightValue, { color: accent }]}>{value}</Text>
      <Text style={[styles.insightLabel, { color: T.textDim }]}>{label}</Text>
    </Animated.View>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const StudyAnalyticsWidget = ({ theme = 'dark', weeklyData }) => {
  const isDark = theme !== 'light';
  const T = getT(isDark);
  const BAR_MAX_H = 96;

  const defaultData = [
    { day: 'Sun', hours: 1.0, label: 'S' },
    { day: 'Mon', hours: 2.0, label: 'M' },
    { day: 'Tue', hours: 3.5, label: 'T' },
    { day: 'Wed', hours: 1.5, label: 'W' },
    { day: 'Thu', hours: 4.0, label: 'T' },
    { day: 'Fri', hours: 2.5, label: 'F' },
    { day: 'Sat', hours: 0.5, label: 'S' },
  ];

  const data       = (weeklyData && weeklyData.length === 7) ? weeklyData : defaultData;
  const maxHours   = Math.max(...data.map((d) => d.hours), 0.1);
  const totalHours = data.reduce((s, d) => s + d.hours, 0);
  const avg        = totalHours / 7;
  const todayIdx   = new Date().getDay();
  const bestIdx    = data.reduce((best, d, i) => (d.hours > data[best].hours ? i : best), 0);
  const bestDay    = data[bestIdx];

  let streak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].hours > 0) streak++;
    else break;
  }

  const first3  = data.slice(0, 3).reduce((s, d) => s + d.hours, 0);
  const last3   = data.slice(4).reduce((s, d) => s + d.hours, 0);
  const trendUp = last3 >= first3;

  const barAnims  = useRef(data.map(() => new Animated.Value(0))).current;
  const headerOpa = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.stagger(80, barAnims.map((a) => Animated.spring(a, { toValue: 1, tension: 50, friction: 9, useNativeDriver: false }))).start();
    Animated.timing(headerOpa, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowPulse, { toValue: 1,   duration: 1800, useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0.4, duration: 1800, useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: T.surface, borderColor: T.border }]}>
      <CB pos="top-left"     color={T.purple} s={14} />
      <CB pos="top-right"    color={T.orange}  s={14} />
      <CB pos="bottom-left"  color={T.orange}  s={14} />
      <CB pos="bottom-right" color={T.purple}  s={14} />

      <Animated.View style={[styles.ambientGlow, { opacity: Animated.multiply(glowPulse, new Animated.Value(0.12)) }]} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpa }]}>
        <View>
          <Mono color={T.textDim} style={{ marginBottom: 6 }}>— Analytics</Mono>
          <Text style={[styles.title, { color: T.text }]}>
            This <Text style={{ fontStyle: 'italic', color: T.orange }}>week.</Text>
          </Text>
        </View>
        <View style={[styles.trendBadge, {
          backgroundColor: trendUp ? T.purpleDim : T.orangeDim,
          borderColor:     trendUp ? `${T.purple}35` : `${T.orange}35`,
        }]}>
          <MaterialIcons name={trendUp ? 'trending-up' : 'trending-down'} size={14} color={trendUp ? T.purple : T.orange} />
          <Mono color={trendUp ? T.purple : T.orange} style={{ letterSpacing: 1.5 }}>
            {trendUp ? 'Trending up' : 'Slowing down'}
          </Mono>
        </View>
      </Animated.View>

      {/* Stat strip */}
      <View style={[styles.statStrip, { backgroundColor: T.surfaceUp, borderColor: T.border }]}>
        <View style={styles.statStripItem}>
          <Text style={[styles.statStripValue, { color: T.text }]}>{totalHours.toFixed(1)}<Text style={[styles.statStripUnit, { color: T.textMuted }]}>h</Text></Text>
          <Mono color={T.textDim}>Total</Mono>
        </View>
        <View style={[styles.statStripDivider, { backgroundColor: T.border }]} />
        <View style={styles.statStripItem}>
          <Text style={[styles.statStripValue, { color: T.text }]}>{avg.toFixed(1)}<Text style={[styles.statStripUnit, { color: T.textMuted }]}>h</Text></Text>
          <Mono color={T.textDim}>Daily avg</Mono>
        </View>
        <View style={[styles.statStripDivider, { backgroundColor: T.border }]} />
        <View style={styles.statStripItem}>
          <Text style={[styles.statStripValue, { color: T.text }]}>{bestDay.hours}<Text style={[styles.statStripUnit, { color: T.textMuted }]}>h</Text></Text>
          <Mono color={T.textDim}>Best day</Mono>
        </View>
      </View>

      {/* Bar chart */}
      <View style={styles.chartWrap}>
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <View key={frac} style={[styles.yLine, { bottom: frac * BAR_MAX_H + 28, backgroundColor: T.yLine }]} />
        ))}
        <View style={styles.chart}>
          {data.map((item, i) => (
            <Bar
              key={item.day}
              item={item}
              anim={barAnims[i]}
              maxHours={maxHours}
              avg={avg}
              isToday={i === todayIdx}
              BAR_MAX_H={BAR_MAX_H}
              T={T}
            />
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: T.border }]} />

      {/* Insight chips */}
      <View style={styles.insightRow}>
        <InsightChip label={`${streak}-day run`} value={streak > 0 ? `🔥` : '—'} accent={T.orange}  delay={600} T={T} />
        <InsightChip label={`best: ${bestDay.day}`} value={`${bestDay.hours}h`}   accent={T.purple} delay={700} T={T} />
        <InsightChip label="weekly"  value={`${totalHours.toFixed(1)}h`}           accent={T.teal}   delay={800} T={T} />
      </View>

      {/* Insight sentence */}
      <View style={styles.insightSentence}>
        <View style={[styles.insightBar, { backgroundColor: trendUp ? T.purple : T.orange }]} />
        <Text style={[styles.insightText, { color: T.textMuted }]}>
          {trendUp
            ? `Your best day was ${bestDay.day} with ${bestDay.hours}h. Keep it up!`
            : `Try to match ${bestDay.day}'s ${bestDay.hours}h — your personal best this week.`}
        </Text>
      </View>
    </View>
  );
};

// ─── Styles (structure only — no hardcoded colors) ────────────────────────────
const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  ambientGlow: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 200,
    height: 160,
    borderRadius: 100,
    backgroundColor: '#7c3aed',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
  },
  statStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  statStripItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statStripDivider: {
    width: 1,
    height: 28,
  },
  statStripValue: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  statStripUnit: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '400',
  },
  chartWrap: {
    position: 'relative',
    marginBottom: 18,
  },
  yLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    zIndex: 0,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barHourLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  barTrack: {
    width: 20,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
    marginBottom: 6,
  },
  barFill: {
    width: '100%',
    borderRadius: 10,
    position: 'absolute',
    bottom: 0,
  },
  barTodayLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    opacity: 0.9,
  },
  barDayLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  insightChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    gap: 4,
  },
  insightValue: {
    fontFamily: SERIF,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  insightLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  insightSentence: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  insightBar: {
    width: 2,
    height: 32,
    borderRadius: 1,
    marginTop: 2,
    opacity: 0.75,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  insightText: {
    fontFamily: SERIF,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
    fontStyle: 'italic',
  },
});

export default StudyAnalyticsWidget;