import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TextInput,
  Modal,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const getT = (isDark) => ({
  bg:           isDark ? '#08080f'                    : '#f4f1ec',
  surface:      isDark ? 'rgba(255,255,255,0.04)'     : 'rgba(0,0,0,0.04)',
  surfaceUp:    isDark ? 'rgba(255,255,255,0.07)'     : 'rgba(0,0,0,0.06)',
  border:       isDark ? 'rgba(255,255,255,0.08)'     : 'rgba(0,0,0,0.10)',
  borderBright: isDark ? 'rgba(255,255,255,0.14)'     : 'rgba(0,0,0,0.18)',
  text:         isDark ? '#f5f2ff'                    : '#1a1815',
  textMuted:    isDark ? 'rgba(245, 242, 255, 0.69)'     : 'rgba(26,24,21,0.50)',
  textDim:      isDark ? 'rgba(245, 242, 255, 0.77)'     : 'rgba(26,24,21,0.30)',
  // Fixed accent colors — same in both modes
  purple:       '#7c3aed',
  purpleLight:  '#a855f7',
  purpleDim:    isDark ? 'rgba(124,58,237,0.18)'      : 'rgba(124,58,237,0.12)',
  purpleGlow:   'rgba(124,58,237,0.45)',
  orange:       '#ff6432',
  orangeLight:  '#ff8c5a',
  orangeDim:    isDark ? 'rgba(255,100,50,0.18)'      : 'rgba(255,100,50,0.12)',
  orangeGlow:   'rgba(255,100,50,0.40)',
  teal:         '#0d9488',
  tealDim:      isDark ? 'rgba(13,148,136,0.18)'      : 'rgba(13,148,136,0.12)',
  // Modal sheet bg
  sheetBg:      isDark ? '#0e0e1a'                    : '#ffffff',
  handleColor:  isDark ? 'rgba(255,255,255,0.14)'     : 'rgba(0,0,0,0.14)',
});

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const { width: W } = Dimensions.get('window');

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Mono label ──────────────────────────────────────────────────────────────
const Mono = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 2.8, textTransform: 'uppercase', color }, style]}>
    {children}
  </Text>
);

// ─── Corner bracket ───────────────────────────────────────────────────────────
const CB = ({ pos, color, s = 11 }) => {
  const isR = pos.includes('right'), isB = pos.includes('bottom');
  const base = { position: 'absolute' };
  if (pos.includes('top'))    base.top    = 0;
  if (pos.includes('bottom')) base.bottom = 0;
  if (pos.includes('left'))   base.left   = 0;
  if (pos.includes('right'))  base.right  = 0;
  return (
    <View style={[base, { width: s, height: s }]} pointerEvents="none">
      <View style={{ position: 'absolute', top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: s, height: 1.5, backgroundColor: color, opacity: 0.55 }} />
      <View style={{ position: 'absolute', top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: 1.5, height: s, backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
};

// ─── Mode config (colors are theme-independent) ───────────────────────────────
const getModeConfig = (T) => ({
  focus: {
    label:       'Focus',
    sublabel:    'Deep work',
    color:       T.purple,
    colorLight:  T.purpleLight,
    colorDim:    T.purpleDim,
    colorGlow:   T.purpleGlow,
    defaultMins: 25,
    icon:        'psychology',
  },
  short: {
    label:       'Short Break',
    sublabel:    'Quick rest',
    color:       T.teal,
    colorLight:  '#14b8a6',
    colorDim:    T.tealDim,
    colorGlow:   'rgba(13,148,136,0.38)',
    defaultMins: 5,
    icon:        'coffee',
  },
  long: {
    label:       'Long Break',
    sublabel:    'Recharge',
    color:       T.orange,
    colorLight:  T.orangeLight,
    colorDim:    T.orangeDim,
    colorGlow:   T.orangeGlow,
    defaultMins: 15,
    icon:        'self-improvement',
  },
});

// ─── Custom Time Modal ────────────────────────────────────────────────────────
const CustomTimeModal = ({ visible, onClose, customTimes, onSave, T }) => {
  const [focusMins, setFocusMins] = useState(String(customTimes.focus));
  const [shortMins, setShortMins] = useState(String(customTimes.short));
  const [longMins,  setLongMins]  = useState(String(customTimes.long));

  const slideAnim = useRef(new Animated.Value(300)).current;
  const opacity   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setFocusMins(String(customTimes.focus));
      setShortMins(String(customTimes.short));
      setLongMins(String(customTimes.long));
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const clamp = (val, min = 1, max = 120) => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return min;
    return Math.min(Math.max(n, min), max);
  };

  const handleSave = () => {
    onSave({ focus: clamp(focusMins), short: clamp(shortMins, 1, 60), long: clamp(longMins, 1, 60) });
    onClose();
  };

  const fields = [
    { key: 'focus', label: 'Focus Session', value: focusMins, set: setFocusMins, color: T.purple, min: 1,  max: 120, hint: '1–120 min' },
    { key: 'short', label: 'Short Break',   value: shortMins, set: setShortMins, color: T.teal,   min: 1,  max: 60,  hint: '1–60 min'  },
    { key: 'long',  label: 'Long Break',    value: longMins,  set: setLongMins,  color: T.orange,  min: 1,  max: 60,  hint: '1–60 min'  },
  ];

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, { opacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
          <Animated.View style={[styles.modalSheet, { backgroundColor: T.sheetBg, borderColor: T.border, transform: [{ translateY: slideAnim }] }]}>
            <CB pos="top-left"     color={T.purple} s={14} />
            <CB pos="top-right"    color={T.orange}  s={14} />
            <CB pos="bottom-left"  color={T.orange}  s={14} />
            <CB pos="bottom-right" color={T.purple}  s={14} />

            <View style={[styles.modalHandle, { backgroundColor: T.handleColor }]} />

            <View style={styles.modalHeader}>
              <View>
                <Mono color={T.purple} style={{ marginBottom: 6 }}>— Customise</Mono>
                <Text style={[styles.modalTitle, { color: T.text }]}>Set your{'\n'}<Text style={{ fontStyle: 'italic', color: T.orange }}>own times.</Text></Text>
              </View>
              <TouchableOpacity onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: T.surface, borderColor: T.border }]} activeOpacity={0.7}>
                <MaterialIcons name="close" size={18} color={T.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalFields}>
              {fields.map(({ key, label, value, set, color, hint }) => (
                <View key={key} style={[styles.modalField, { borderColor: `${color}25`, backgroundColor: T.surface }]}>
                  <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: color, opacity: 0.05, borderRadius: 14 }} />
                  <CB pos="top-left"     color={color} s={9} />
                  <CB pos="bottom-right" color={color} s={9} />
                  <View style={styles.modalFieldLeft}>
                    <Mono color={color} style={{ marginBottom: 6 }}>{label}</Mono>
                    <Text style={[styles.modalFieldHint, { color: T.textDim }]}>{hint}</Text>
                  </View>
                  <View style={styles.modalInputRow}>
                    <TouchableOpacity
                      onPress={() => set(String(Math.max(1, parseInt(value || '1', 10) - 1)))}
                      style={[styles.stepperBtn, { borderColor: `${color}30`, backgroundColor: T.surface }]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="remove" size={16} color={color} />
                    </TouchableOpacity>
                    <TextInput
                      value={value}
                      onChangeText={(v) => set(v.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      style={[styles.modalInput, { borderBottomColor: value ? color : T.border, color: value ? T.text : T.textMuted }]}
                      placeholderTextColor={T.textDim}
                      selectTextOnFocus
                      maxLength={3}
                    />
                    <Text style={[styles.modalInputUnit, { color: T.textDim }]}>min</Text>
                    <TouchableOpacity
                      onPress={() => set(String(Math.min(120, parseInt(value || '0', 10) + 1)))}
                      style={[styles.stepperBtn, { borderColor: `${color}30`, backgroundColor: T.surface }]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="add" size={16} color={color} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity onPress={handleSave} activeOpacity={0.85} style={styles.modalSaveBtn}>
              <View style={[styles.modalSaveBtnInner, { backgroundColor: T.purple, shadowColor: T.purple }]}>
                <MaterialIcons name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.modalSaveBtnText, { color: '#fff' }]}>Apply Times</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setFocusMins('25'); setShortMins('5'); setLongMins('15'); }}
              activeOpacity={0.7}
              style={{ alignSelf: 'center', marginTop: 14 }}
            >
              <Mono color={T.textDim}>Reset to defaults</Mono>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Main Widget ──────────────────────────────────────────────────────────────
const PomodoroTimerWidget = ({ theme = 'dark', onSessionComplete, onStart, onPause }) => {
  const isDark = theme !== 'light';
  const T = getT(isDark);
  const MODE_CONFIG = getModeConfig(T);

  const [customTimes,        setCustomTimes]        = useState({ focus: 25, short: 5, long: 15 });
  const [showCustomModal,    setShowCustomModal]     = useState(false);
  const [mode,               setMode]               = useState('focus');
  const [timeLeft,           setTimeLeft]           = useState(25 * 60);
  const [isActive,           setIsActive]           = useState(false);
  const [isPaused,           setIsPaused]           = useState(false);
  const [sessionsCompleted,  setSessionsCompleted]  = useState(0);
  const [sessionHistory,     setSessionHistory]     = useState([]);

  const intervalRef  = useRef(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const glowOpacity  = useRef(new Animated.Value(0.4)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const modeSlide    = useRef(new Animated.Value(0)).current;

  const cfg = MODE_CONFIG[mode];

  const RADIUS   = 72;
  const STROKE_W = 7;
  const SVG_SIZE = (RADIUS + STROKE_W) * 2 + 4;
  const CIRCUMF  = 2 * Math.PI * RADIUS;

  const totalSeconds = customTimes[mode] * 60;
  const progress     = totalSeconds > 0 ? 1 - timeLeft / totalSeconds : 0;
  const dashOffset   = CIRCUMF * (1 - progress);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { clearInterval(intervalRef.current); handleSessionComplete(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isActive, isPaused]);

  useEffect(() => {
    Animated.timing(ringProgress, { toValue: progress, duration: 600, useNativeDriver: true }).start();
  }, [progress]);

  useEffect(() => {
    if (isActive && !isPaused) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim,   { toValue: 1.03, duration: 900,  useNativeDriver: true }),
        Animated.timing(pulseAnim,   { toValue: 1.0,  duration: 900,  useNativeDriver: true }),
      ]));
      const glowLoop = Animated.loop(Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1,   duration: 1200, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
      ]));
      loop.start(); glowLoop.start();
      return () => { loop.stop(); glowLoop.stop(); };
    } else {
      pulseAnim.setValue(1); glowOpacity.setValue(0.4);
    }
  }, [isActive, isPaused]);

  const modeOrder = ['focus', 'short', 'long'];
  useEffect(() => {
    const idx = modeOrder.indexOf(mode);
    Animated.spring(modeSlide, { toValue: idx * ((W - 40) / 3), tension: 60, friction: 10, useNativeDriver: true }).start();
  }, [mode]);

  useEffect(() => { if (!isActive) setTimeLeft(customTimes[mode] * 60); }, [customTimes]);
  useEffect(() => { if (!isActive) setTimeLeft(customTimes[mode] * 60); }, [mode]);

  const handleSessionComplete = useCallback(() => {
    setIsActive(false); setIsPaused(false);
    if (mode === 'focus') {
      setSessionsCompleted((p) => p + 1);
      setSessionHistory((h) => [...h.slice(-7), { mode: 'focus', time: Date.now() }]);
    }
    if (onSessionComplete) onSessionComplete(mode);
    if (mode === 'focus') {
      const newSessions = sessionsCompleted + 1;
      switchMode(newSessions % 4 === 0 ? 'long' : 'short', false);
    } else {
      switchMode('focus', false);
    }
  }, [mode, sessionsCompleted, onSessionComplete]);

  const switchMode = (newMode, resetTimer = true) => {
    setMode(newMode); setIsActive(false); setIsPaused(false);
    if (resetTimer) setTimeLeft(customTimes[newMode] * 60);
  };

  const toggleTimer = () => {
    if (!isActive) { setIsActive(true); setIsPaused(false); if (onStart) onStart(customTimes[mode], mode); }
    else if (isPaused) { setIsPaused(false); }
    else { setIsPaused(true); if (onPause) onPause(); }
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current);
    setIsActive(false); setIsPaused(false);
    setTimeLeft(customTimes[mode] * 60);
    if (onPause) onPause();
  };

  const handleSaveCustomTimes = (newTimes) => {
    setCustomTimes(newTimes);
    if (!isActive) setTimeLeft(newTimes[mode] * 60);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const percentDone = Math.round(progress * 100);

  return (
    <View style={[styles.container, { backgroundColor: T.surface, borderColor: T.border }]}>
      <CB pos="top-left"     color={cfg.color} s={14} />
      <CB pos="top-right"    color={T.orange}  s={14} />
      <CB pos="bottom-left"  color={T.orange}  s={14} />
      <CB pos="bottom-right" color={cfg.color} s={14} />

      <Animated.View style={[styles.ambientGlow, { backgroundColor: cfg.color, opacity: glowOpacity }]} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Mono color={T.textDim} style={{ marginBottom: 4 }}>— Pomodoro</Mono>
          <Text style={[styles.widgetTitle, { color: T.text }]}>
            Focus <Text style={{ fontStyle: 'italic', color: cfg.color }}>Timer.</Text>
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowCustomModal(true)}
            style={[styles.headerBtn, { backgroundColor: T.surface, borderColor: `${T.purple}35` }]}
            activeOpacity={0.7}
          >
            <MaterialIcons name="tune" size={16} color={T.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={resetTimer}
            style={[styles.headerBtn, { backgroundColor: T.surface, borderColor: T.border }]}
            activeOpacity={0.7}
            disabled={!isActive && timeLeft === customTimes[mode] * 60}
          >
            <MaterialIcons name="replay" size={16} color={!isActive && timeLeft === customTimes[mode] * 60 ? T.textDim : T.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode tabs */}
      <View style={[styles.modeTabs, { borderBottomColor: T.border }]}>
        <Animated.View style={[styles.modeTabIndicator, { width: (W - 40) / 3, backgroundColor: cfg.color, transform: [{ translateX: modeSlide }] }]} />
        {modeOrder.map((m) => {
          const c = MODE_CONFIG[m];
          const isSelected = mode === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => switchMode(m)}
              style={styles.modeTab}
              activeOpacity={0.7}
              disabled={isActive && !isPaused}
            >
              <Text style={[styles.modeTabText, { color: isSelected ? c.color : T.textMuted }]}>{c.label}</Text>
              <Text style={[styles.modeTabSub, { color: isSelected ? c.color : T.textDim, opacity: isSelected ? 0.7 : 1 }]}>{customTimes[m]}m</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Timer ring */}
      <Animated.View style={[styles.ringWrap, { transform: [{ scale: pulseAnim }] }]}>
        <Animated.View style={[styles.ringGlow, { backgroundColor: cfg.color, opacity: Animated.multiply(glowOpacity, new Animated.Value(0.15)), width: SVG_SIZE + 32, height: SVG_SIZE + 32, borderRadius: (SVG_SIZE + 32) / 2 }]} />
        <Svg width={SVG_SIZE} height={SVG_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={cfg.colorLight} />
              <Stop offset="100%" stopColor={cfg.color} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS} stroke={T.border} strokeWidth={STROKE_W} fill="none" />
          <Circle cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS} stroke="url(#ringGrad)" strokeWidth={STROKE_W} fill="none" strokeDasharray={CIRCUMF} strokeDashoffset={dashOffset} strokeLinecap="round" />
        </Svg>
        <View style={styles.ringCenter}>
          <MaterialIcons name={cfg.icon} size={20} color={cfg.color} style={{ opacity: 0.7, marginBottom: 4 }} />
          <Text style={[styles.timeDisplay, { color: T.text }]}>{formatTime(timeLeft)}</Text>
          <Text style={[styles.timeSubLabel, { color: cfg.color }]}>
            {isActive && !isPaused ? `${percentDone}% done` : cfg.sublabel}
          </Text>
          {isActive && !isPaused && <View style={[styles.runningDot, { backgroundColor: cfg.color }]} />}
        </View>
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => setTimeLeft((p) => Math.max(0, p - 60))}
          style={[styles.ctrlBtn, { backgroundColor: T.surface, borderColor: T.border }]}
          activeOpacity={0.7}
          disabled={!isActive}
        >
          <MaterialIcons name="skip-previous" size={20} color={!isActive ? T.textDim : T.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleTimer} activeOpacity={0.85} style={styles.playBtnWrap}>
          <Animated.View style={[styles.playBtnGlow, { backgroundColor: cfg.color, opacity: glowOpacity }]} />
          <View style={[styles.playBtn, { backgroundColor: cfg.color, borderColor: `${cfg.colorLight}60`, shadowColor: cfg.color }]}>
            <MaterialIcons name={!isActive || isPaused ? 'play-arrow' : 'pause'} size={32} color="#fff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTimeLeft((p) => Math.min(customTimes[mode] * 60, p + 60))}
          style={[styles.ctrlBtn, { backgroundColor: T.surface, borderColor: T.border }]}
          activeOpacity={0.7}
          disabled={isActive && !isPaused}
        >
          <MaterialIcons name="skip-next" size={20} color={isActive && !isPaused ? T.textDim : T.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Session tracker */}
      <View style={[styles.sessionRow, { borderTopColor: T.border }]}>
        <View style={styles.sessionLeft}>
          <Mono color={T.textDim} style={{ marginBottom: 5 }}>Today's Sessions</Mono>
          <Text style={[styles.sessionCount, { color: T.text }]}>
            {sessionsCompleted}
            <Text style={{ fontSize: 14, color: T.textMuted, fontFamily: SERIF }}> focus{sessionsCompleted !== 1 ? ' sessions' : ' session'}</Text>
          </Text>
        </View>
        <View style={styles.sessionDots}>
          {[0, 1, 2, 3].map((i) => {
            const filled    = i < (sessionsCompleted % 4);
            const isCurrent = i === (sessionsCompleted % 4) && isActive && !isPaused && mode === 'focus';
            return (
              <Animated.View
                key={i}
                style={[
                  styles.sessionDot,
                  filled
                    ? { backgroundColor: cfg.color, shadowColor: cfg.color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 }
                    : isCurrent
                    ? { backgroundColor: `${cfg.color}55`, borderWidth: 1, borderColor: cfg.color }
                    : { backgroundColor: T.surfaceUp },
                ]}
              />
            );
          })}
          <Mono color={T.textDim} style={{ marginLeft: 6 }}>{sessionsCompleted % 4}/4</Mono>
        </View>
      </View>

      {/* Until long break */}
      {mode === 'focus' && (
        <View style={styles.longBreakHint}>
          <View style={[styles.longBreakHintBar, { backgroundColor: T.orange }]} />
          <Mono color={T.textDim}>
            {4 - (sessionsCompleted % 4)} session{4 - (sessionsCompleted % 4) !== 1 ? 's' : ''} until long break ({customTimes.long}m)
          </Mono>
        </View>
      )}

      <CustomTimeModal
        visible={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        customTimes={customTimes}
        onSave={handleSaveCustomTimes}
        T={T}
      />
    </View>
  );
};

// ─── Stylesheet (structure only — no colors) ──────────────────────────────────
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
    top: -60,
    alignSelf: 'center',
    width: 180,
    height: 140,
    borderRadius: 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    zIndex: 2,
  },
  widgetTitle: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    position: 'relative',
    borderBottomWidth: 1,
    marginBottom: 28,
  },
  modeTabIndicator: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    borderRadius: 1,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 10,
  },
  modeTabText: {
    fontFamily: SERIF,
    fontSize: 13,
    fontWeight: '700',
  },
  modeTabSub: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  ringWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  ringGlow: { position: 'absolute' },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    fontFamily: MONO,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
  },
  timeSubLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 24,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  sessionLeft: {},
  sessionCount: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sessionDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  longBreakHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  longBreakHintBar: {
    width: 2,
    height: 14,
    borderRadius: 1,
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 20,
    borderTopWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalFields: {
    gap: 12,
    marginBottom: 24,
  },
  modalField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  modalFieldLeft: { flex: 1 },
  modalFieldHint: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalInput: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: '700',
    width: 52,
    textAlign: 'center',
    borderBottomWidth: 1.5,
    paddingBottom: 2,
    letterSpacing: -0.5,
  },
  modalInputUnit: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginLeft: -4,
  },
  modalSaveBtn: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  modalSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  modalSaveBtnText: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});

export default PomodoroTimerWidget;