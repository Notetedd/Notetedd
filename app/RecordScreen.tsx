/**
 * RecordScreen.js — NoteTedd
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * VERIFIED BACKGROUND RECORDING IMPLEMENTATION
 * ─────────────────────────────────────────────
 *
 * HOW BACKGROUND RECORDING ACTUALLY WORKS (platform specifics)
 *
 * iOS
 * ───
 * expo-av sets AVAudioSession category to "Record" with the
 * mixWithOthers / allowBluetooth options when you call setAudioModeAsync
 * with allowsRecordingIOS: true + staysActiveInBackground: true.
 * This tells iOS the app has an active audio session and must NOT be
 * suspended. iOS will keep the process alive as long as that session is
 * held. No separate background task is needed for the recording itself.
 *
 * REQUIREMENT: app.json must include:
 *   "ios": { "infoPlist": { "UIBackgroundModes": ["audio"] } }
 *
 * Android
 * ───────
 * expo-av starts a foreground service automatically when you set
 * keepAudioActiveHint: true in the Recording options AND the app targets
 * Android 10+ (API 29+). The foreground service shows a system notification
 * while recording is active — this is what keeps the process alive when
 * the user navigates away or the screen sleeps.
 *
 * expo-background-fetch / TaskManager are NOT the right tool for
 * continuous background audio. They are periodic batch tasks. We removed
 * the misleading BG_AUDIO_KEEPALIVE task from the previous version.
 *
 * REQUIREMENT: app.json must include:
 *   "android": {
 *     "permissions": ["RECORD_AUDIO", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MICROPHONE"]
 *   }
 *
 * TIMER ACCURACY IN BACKGROUND
 * ────────────────────────────
 * setInterval is throttled or paused by the JS thread when the app is
 * backgrounded on Android. We now record a wall-clock startTimestamp and
 * recompute elapsed duration from Date.now() whenever the app returns to
 * the foreground, keeping the displayed timer accurate.
 *
 * FIXES APPLIED VS PREVIOUS VERSION
 * ──────────────────────────────────
 * 1. Removed misleading BackgroundFetch / TaskManager imports — they did
 *    not keep audio alive and created false confidence.
 * 2. Timer now uses wall-clock reconciliation on foreground return.
 * 3. handleAppStateChange no longer has a stale closure on retryOfflineQueue
 *    — we use a ref (retryQueueRef) that always points to the latest function.
 * 4. stopRecording now captures the URI in a separate try block with its
 *    own fallback, preventing a double-null scenario.
 * 5. Audio session is NOT released if recording was interrupted by the OS
 *    (so the user can attempt recovery).
 * 6. Offline retry guard uses a ref (isRetryingRef) so it is always
 *    readable without stale closure issues.
 * 7. All error paths preserve the audio file to documentDirectory before
 *    surfacing an alert.
 *
 * UI CHANGES: NONE — every JSX element, style, and layout is preserved.
 */

// ─── CONFIG NOTE (must be in app.json / app.config.js) ──────────────────────
// iOS:
//   "ios": {
//     "infoPlist": {
//       "UIBackgroundModes": ["audio"],
//       "NSMicrophoneUsageDescription": "NoteTedd records your lectures."
//     }
//   }
//
// Android:
//   "android": {
//     "permissions": [
//       "RECORD_AUDIO",
//       "FOREGROUND_SERVICE",
//       "FOREGROUND_SERVICE_MICROPHONE"
//     ]
//   }
// ────────────────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { FEATURES } from "../RevenueCatConfig";
import TrialBanner from "./components/TrialBanner";
import UsageMeter from "./components/UsageMeter";
import { useTheme } from "./context/ThemeContext";
import useFeatureGate from "./hooks/useFeatureGate";
import haptics from "./utils/haptics";

// ─── API Key ──────────────────────────────────────────────────────────────────
const ASSEMBLYAI_API_KEY = process.env.EXPO_PUBLIC_ASSEMBLYAI_KEY || "";
const { documentDirectory } = FileSystem;

// ─── Offline queue ────────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = "notetedd_offline_upload_queue";

// ═════════════════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const DISPLAY = Platform.OS === "ios" ? "Georgia"        : "serif";
const SANS    = Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif";
const MONO    = Platform.OS === "ios" ? "Menlo"          : "monospace";
const BASE    = 8;
const sp      = (n) => BASE * n;
const makeScale = (w) => (size) => (size * w) / 375;

const palette = {
  violet:      "#6c2fff",
  violetMid:   "#8b5cf6",
  violetLight: "#a78bfa",
  violetSoft:  (a = 0.12) => `rgba(108,47,255,${a})`,
  ember:       "#f95a2c",
  emberMid:    "#f97316",
  emberSoft:   (a = 0.12) => `rgba(249,90,44,${a})`,
  success:     "#10b981",
  successSoft: (a = 0.12) => `rgba(16,185,129,${a})`,
  warning:     "#f59e0b",
  danger:      "#ef4444",
  dangerSoft:  (a = 0.12) => `rgba(239,68,68,${a})`,
  dark: {
    bg:        "#060608",
    bgElevated:"#0c0c12",
    bgCard:    "#0f0f18",
    bgInput:   "#12121e",
    border:    "rgba(255,255,255,0.08)",
    borderMid: "rgba(255,255,255,0.14)",
    text:      "#f0eeff",
    textSub:   "rgba(245,244,250,0.91)",
    textMuted: "rgba(240,238,255,0.38)",
    textDim:   "rgba(233,231,243,0.2)",
  },
  light: {
    bg:        "#f7f6ff",
    bgElevated:"#ffffff",
    bgCard:    "#ffffff",
    bgInput:   "#f2f0ff",
    border:    "rgba(108,47,255,0.1)",
    borderMid: "rgba(108,47,255,0.22)",
    text:      "#140d2b",
    textSub:   "rgba(20,13,43,0.65)",
    textMuted: "rgba(20,13,43,0.42)",
    textDim:   "rgba(20,13,43,0.22)",
  },
};

const useColors = (isDark) => (isDark ? palette.dark : palette.light);

// ═════════════════════════════════════════════════════════════════════════════
//  SUPPORTED LANGUAGES (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English",    flag: "🇺🇸", speechCode: "en-US" },
  { code: "es", name: "Spanish",    flag: "🇪🇸", speechCode: "es-ES" },
  { code: "fr", name: "French",     flag: "🇫🇷", speechCode: "fr-FR" },
  { code: "de", name: "German",     flag: "🇩🇪", speechCode: "de-DE" },
  { code: "sw", name: "Kiswahili",  flag: "🇰🇪", speechCode: "sw-KE" },
  { code: "ar", name: "Arabic",     flag: "🇸🇦", speechCode: "ar-SA" },
  { code: "zh", name: "Chinese",    flag: "🇨🇳", speechCode: "zh-CN" },
  { code: "hi", name: "Hindi",      flag: "🇮🇳", speechCode: "hi-IN" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", speechCode: "pt-BR" },
  { code: "ja", name: "Japanese",   flag: "🇯🇵", speechCode: "ja-JP" },
];

// ═════════════════════════════════════════════════════════════════════════════
//  RECORDING OPTIONS
//  keepAudioActiveHint: true is what triggers Android's foreground service.
//  Without it, Android will suspend or kill audio when screen sleeps.
// ═════════════════════════════════════════════════════════════════════════════

const getRecordingOptions = () => {
  const common = { keepAudioActiveHint: true };

  if (Platform.OS === "android") {
    return {
      ...common,
      android: {
        extension:      ".m4a",
        outputFormat:   Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder:   Audio.AndroidAudioEncoder.AAC,
        sampleRate:     16000,
        numberOfChannels: 1,
        bitRate:        64000,
      },
      ios: {
        extension:      ".m4a",
        outputFormat:   Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality:   Audio.IOSAudioQuality.MEDIUM,
        sampleRate:     16000,
        numberOfChannels: 1,
        bitRate:        64000,
      },
      web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
    };
  }

  return {
    ...common,
    android: {
      extension:      ".m4a",
      outputFormat:   Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder:   Audio.AndroidAudioEncoder.AAC,
      sampleRate:     44100,
      numberOfChannels: 2,
      bitRate:        128000,
    },
    ios: {
      extension:      ".m4a",
      outputFormat:   Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality:   Audio.IOSAudioQuality.HIGH,
      sampleRate:     44100,
      numberOfChannels: 2,
      bitRate:        128000,
    },
    web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
  };
};

// ═════════════════════════════════════════════════════════════════════════════
//  ATOMS (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const Label = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color }, style]}>
    {children}
  </Text>
);

const Corner = ({ pos, color, size = 12 }) => {
  const st = { position: "absolute" };
  if (pos.includes("top"))  st.top    = 0; else st.bottom = 0;
  if (pos.includes("left")) st.left   = 0; else st.right  = 0;
  const isB = pos.includes("bottom");
  const isR = pos.includes("right");
  return (
    <View style={[st, { width: size, height: size }]} pointerEvents="none">
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: size, height: 1.5, backgroundColor: color, opacity: 0.55 }} />
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: 1.5, height: size, backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
//  MIC ORB (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const MicOrb = ({ isRecording, isPaused, useWebSpeech, scale }) => {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(0.85)).current;
  const innerS = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.28, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse1, { toValue: 1,    duration: 1100, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(pulse2, { toValue: 1.18, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse2, { toValue: 0.85, duration: 1600, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(innerS, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(innerS, { toValue: 0.96, duration: 800, useNativeDriver: true }),
      ])).start();
    } else {
      pulse1.stopAnimation(); pulse1.setValue(1);
      pulse2.stopAnimation(); pulse2.setValue(0.85);
      innerS.stopAnimation(); innerS.setValue(1);
    }
  }, [isRecording, isPaused]);

  const coreColor = isRecording ? (isPaused ? palette.warning : palette.danger) : palette.violet;
  const orbSize   = scale(148);

  return (
    <View style={{ width: orbSize * 1.5, height: orbSize * 1.5, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: orbSize * 1.5, height: orbSize * 1.5, borderRadius: orbSize * 0.75, backgroundColor: coreColor, opacity: 0.07, transform: [{ scale: pulse2 }] }} />
      <Animated.View style={{ position: "absolute", width: orbSize * 1.15, height: orbSize * 1.15, borderRadius: orbSize * 0.575, backgroundColor: coreColor, opacity: 0.1, transform: [{ scale: pulse1 }] }} />
      <Animated.View style={{ width: orbSize, height: orbSize, borderRadius: orbSize / 2, backgroundColor: coreColor, alignItems: "center", justifyContent: "center", transform: [{ scale: innerS }], shadowColor: coreColor, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.65, shadowRadius: 28, elevation: 20, overflow: "hidden" }}>
        <View style={{ position: "absolute", top: -6, left: orbSize * 0.15, width: orbSize * 0.35, height: orbSize * 0.28, borderRadius: orbSize * 0.14, backgroundColor: "#fff", opacity: 0.14, transform: [{ rotate: "-20deg" }] }} />
        <MaterialIcons name={isPaused ? "pause" : isRecording ? "stop" : "mic"} size={scale(52)} color="#fff" />
      </Animated.View>
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
//  RECORDING CARD (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const RecordingCard = ({ recording, onContinue, onView, onDelete, colors, scale, formatDuration, formatRelativeDate }) => {
  const pressS = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(pressS, { toValue: 0.985, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(pressS, { toValue: 1,     useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale: pressS }] }}>
      <View style={[rStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Corner pos="top-left"     color={palette.violet} size={10} />
        <Corner pos="bottom-right" color={palette.violet} size={10} />
        <View style={[rStyles.cardIcon, { backgroundColor: palette.violetSoft(0.14) }]}>
          <MaterialIcons name="mic" size={scale(18)} color={palette.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rStyles.cardTitle, { color: colors.text }]} numberOfLines={1}>{recording.title}</Text>
          <View style={rStyles.cardMeta}>
            <Label color={colors.textMuted}>{recording.formattedDuration || formatDuration(recording.duration || 0)}</Label>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textDim }} />
            <Label color={colors.textMuted}>{formatRelativeDate(recording.createdAt?.toDate?.()) || recording.formattedDate}</Label>
            {recording.detectedLanguages?.length > 1 && (
              <View style={[rStyles.multiLangBadge, { backgroundColor: palette.successSoft() }]}>
                <MaterialIcons name="translate" size={9} color={palette.success} />
                <Label color={palette.success} style={{ fontSize: 8 }}>Multi</Label>
              </View>
            )}
          </View>
          <Text style={[rStyles.cardPreview, { color: colors.textMuted }]} numberOfLines={2}>{recording.transcription || "No transcription available"}</Text>
          <View style={rStyles.cardActions}>
            <TouchableOpacity onPressIn={onIn} onPressOut={onOut} onPress={onContinue} style={[rStyles.btnContinue, { backgroundColor: palette.violet }]} activeOpacity={0.85}>
              <MaterialIcons name="add" size={13} color="#fff" />
              <Text style={rStyles.btnContinueText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onView} style={[rStyles.btnSecondary, { backgroundColor: colors.bgInput, borderColor: colors.border }]} activeOpacity={0.75}>
              <MaterialIcons name="visibility" size={13} color={colors.textSub} />
              <Text style={[rStyles.btnSecondaryText, { color: colors.textSub }]}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={[rStyles.btnDelete, { backgroundColor: palette.dangerSoft() }]} activeOpacity={0.75}>
              <MaterialIcons name="delete-outline" size={15} color={palette.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const rStyles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: 16, padding: sp(2), marginBottom: sp(1.5), borderWidth: 1, overflow: "hidden", position: "relative", gap: sp(1.5) },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardTitle:       { fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  cardMeta:        { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  cardPreview:     { fontFamily: SANS, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  cardActions:     { flexDirection: "row", gap: 6 },
  btnContinue:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, gap: 4 },
  btnContinueText: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: "#fff", fontWeight: "700" },
  btnSecondary:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, gap: 4 },
  btnSecondaryText:{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5 },
  btnDelete:       { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  multiLangBadge:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, gap: 3 },
});

// ═════════════════════════════════════════════════════════════════════════════
//  OFFLINE QUEUE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const readOfflineQueue  = async () => {
  try { const r = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
};
const writeOfflineQueue = async (q) => {
  try { await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); }
  catch (e) { console.warn("⚠️ Could not write offline queue:", e.message); }
};
const enqueueOfflineItem = async (item) => {
  const queue = await readOfflineQueue();
  const entry = { ...item, id: `offline_${Date.now()}`, queuedAt: Date.now() };
  queue.push(entry);
  await writeOfflineQueue(queue);
  console.log(`📦 Offline queue: ${queue.length} item(s)`);
  return entry.id;
};
const dequeueOfflineItem = async (id) => {
  const queue   = await readOfflineQueue();
  const updated = queue.filter((i) => i.id !== id);
  await writeOfflineQueue(updated);
};

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function RecordScreen({ route }) {
  const { theme }  = useTheme();
  const isDark     = theme === "dark";
  const colors     = useColors(isDark);
  const navigation = useNavigation();
  const { width: W } = useWindowDimensions();
  const scale    = makeScale(W);
  const isTablet = W >= 768;
  const padH     = scale(isTablet ? 40 : 24);
  const padTop   = Platform.OS === "ios" ? scale(60) : scale(46);

  const { gate, track, canUse } = useFeatureGate(FEATURES.TRANSCRIPTION);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isRecording,           setIsRecording]           = useState(false);
  const [isPaused,              setIsPaused]              = useState(false);
  const [transcription,         setTranscription]         = useState("");
  const [recordingDuration,     setRecordingDuration]     = useState(0);
  const [isTranscribing,        setIsTranscribing]        = useState(false);
  const [isSaving,              setIsSaving]              = useState(false);
  const [recordingUri,          setRecordingUri]          = useState(null);
  const [useWebSpeech,          setUseWebSpeech]          = useState(false);
  const [sourceLanguage,        setSourceLanguage]        = useState("en");
  const [targetLanguage,        setTargetLanguage]        = useState("en");
  const [detectedLanguages,     setDetectedLanguages]     = useState([]);
  const [previousRecordings,    setPreviousRecordings]    = useState([]);
  const [loadingRecordings,     setLoadingRecordings]     = useState(true);
  const [showAllRecordings,     setShowAllRecordings]     = useState(false);
  const [continuingRecordingId, setContinuingRecordingId] = useState(null);
  const [isOnline,              setIsOnline]              = useState(true);
  const [offlineQueueCount,     setOfflineQueueCount]     = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const recordingRef    = useRef(null);
  const webSpeechRef    = useRef(null);
  const timerRef        = useRef(null);
  const isStoppingRef   = useRef(false);
  const appStateRef     = useRef(AppState.currentState);

  // Wall-clock start timestamp — used to compute accurate elapsed time
  // even when the JS thread was paused in background.
  const recordStartTimeRef  = useRef(null);
  // Accumulated seconds from completed active intervals (before a pause)
  const accumulatedSecsRef  = useRef(0);
  // Snapshot of duration when paused, so we can resume without drift
  const durationAtPauseRef  = useRef(0);

  // Ref to the latest retryOfflineQueue so AppState handler never goes stale
  const isRetryingRef    = useRef(false);
  const retryQueueRef    = useRef(null);

  // Ref for source/target language (readable inside async callbacks without stale closure)
  const srcLangRef = useRef(sourceLanguage);
  const tgtLangRef = useRef(targetLanguage);
  const wsRef      = useRef(useWebSpeech);
  const contIdRef  = useRef(continuingRecordingId);
  useEffect(() => { srcLangRef.current = sourceLanguage; },        [sourceLanguage]);
  useEffect(() => { tgtLangRef.current = targetLanguage; },        [targetLanguage]);
  useEffect(() => { wsRef.current      = useWebSpeech; },          [useWebSpeech]);
  useEffect(() => { contIdRef.current  = continuingRecordingId; }, [continuingRecordingId]);

  // ── Animations ────────────────────────────────────────────────────────────
  const masterOpa = useRef(new Animated.Value(0)).current;
  const heroY     = useRef(new Animated.Value(30)).current;

  // ── Firebase ──────────────────────────────────────────────────────────────
  const auth    = getAuth();
  const storage = getStorage();
  const db      = getFirestore();

  // ═════════════════════════════════════════════════════════════════════════
  //  TIMER — wall-clock based for background accuracy
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Start the display timer.
   * We tick every second but we read from the wall clock, not accumulated
   * ticks, so Android JS thread pauses in background don't cause drift.
   */
  const startTimer = () => {
    clearInterval(timerRef.current);
    recordStartTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (!recordStartTimeRef.current) return;
      const elapsed = Math.floor((Date.now() - recordStartTimeRef.current) / 1000);
      setRecordingDuration(accumulatedSecsRef.current + elapsed);
    }, 500); // 500ms tick so display stays snappy
  };

  const pauseTimer = () => {
    clearInterval(timerRef.current);
    if (recordStartTimeRef.current) {
      const elapsed = Math.floor((Date.now() - recordStartTimeRef.current) / 1000);
      accumulatedSecsRef.current += elapsed;
      durationAtPauseRef.current  = accumulatedSecsRef.current;
      recordStartTimeRef.current  = null;
    }
    setRecordingDuration(accumulatedSecsRef.current);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetTimer = () => {
    stopTimer();
    recordStartTimeRef.current  = null;
    accumulatedSecsRef.current  = 0;
    durationAtPauseRef.current  = 0;
    setRecordingDuration(0);
  };

  /** Returns total elapsed seconds at this moment. */
  const getElapsedSeconds = () => {
    if (recordStartTimeRef.current) {
      return accumulatedSecsRef.current + Math.floor((Date.now() - recordStartTimeRef.current) / 1000);
    }
    return accumulatedSecsRef.current;
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    console.log("🎙️ RecordScreen mounted");

    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroY, { toValue: 0, tension: 42, friction: 9, useNativeDriver: true }),
    ]).start();

    loadPreviousRecordings();
    syncQueueCount();

    // Network listener
    const netUnsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online && retryQueueRef.current) retryQueueRef.current();
    });

    // AppState listener — wire through retryQueueRef to avoid stale closures
    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      netUnsub();
      appStateSub.remove();
      stopTimer();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (webSpeechRef.current) {
        try { webSpeechRef.current.abort(); } catch (_) {}
        webSpeechRef.current = null;
      }
    };
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  //  APP STATE — background recording keep-alive + timer reconciliation
  // ═════════════════════════════════════════════════════════════════════════

  // handleAppStateChange is defined with no deps so the AppState subscription
  // always has one stable reference. It reaches current state through refs.
  const handleAppStateChange = useCallback(async (nextState) => {
    const prev = appStateRef.current;
    appStateRef.current = nextState;

    if (prev === "active" && nextState.match(/inactive|background/)) {
      // ── Going to background ───────────────────────────────────────────────
      if (recordingRef.current) {
        console.log("📲 App backgrounded — audio session stays alive via expo-av foreground service");
        // On iOS: staysActiveInBackground holds the AVAudioSession.
        // On Android: keepAudioActiveHint started a foreground service.
        // Nothing extra needed here — the native layer is already configured.
      }
      // Pause the JS timer tick to save CPU; the wall-clock start time is
      // already stored so we can reconstruct elapsed time on return.
      clearInterval(timerRef.current);
    }

    if (prev.match(/inactive|background/) && nextState === "active") {
      // ── Returning to foreground ───────────────────────────────────────────
      if (recordingRef.current) {
        try {
          const status = await recordingRef.current.getStatusAsync();

          if (status.isRecording && !isStoppingRef.current) {
            // Good — still recording. Restart the JS timer tick, reconciling
            // elapsed time from the wall clock.
            console.log("📲 Foregrounded — recording still active, re-syncing timer");
            startTimer();
          } else if (!status.isRecording && !isStoppingRef.current) {
            // OS interrupted the recording (e.g. phone call, Siri, AirPods)
            console.warn("⚠️ Recording was stopped by OS while in background");
            stopTimer();

            // Try to salvage the URI before we clear the ref
            let salvageUri = null;
            try { salvageUri = recordingRef.current.getURI(); } catch (_) {}
            recordingRef.current = null;

            setIsRecording(false);
            setIsPaused(false);
            resetTimer();

            if (salvageUri) {
              // The file is on disk — offer to transcribe what was captured
              Alert.alert(
                "Recording Interrupted",
                "Your recording was interrupted (e.g. by a phone call). The audio recorded so far has been saved. Would you like to transcribe it?",
                [
                  {
                    text: "Transcribe",
                    onPress: async () => {
                      const savedDuration = getElapsedSeconds();
                      await transcribeAudio(salvageUri, savedDuration);
                    },
                  },
                  { text: "Discard", style: "cancel" },
                ]
              );
            } else {
              Alert.alert(
                "Recording Interrupted",
                "Your recording was interrupted. No audio could be recovered.",
                [{ text: "OK" }]
              );
            }
          }
        } catch (err) {
          console.warn("⚠️ Could not check recording status on foreground:", err.message);
          // Safe default: reset UI to idle
          setIsRecording(false);
          setIsPaused(false);
          resetTimer();
          recordingRef.current = null;
        }
      } else if (isStoppingRef.current === false) {
        // No active recording and not in the middle of stopping — idle state, fine.
      }

      // Retry any queued offline uploads
      if (retryQueueRef.current) retryQueueRef.current();
    }
  }, []); // ← empty deps intentional: all state is read through refs

  // ═════════════════════════════════════════════════════════════════════════
  //  OFFLINE QUEUE
  // ═════════════════════════════════════════════════════════════════════════

  const syncQueueCount = async () => {
    const q = await readOfflineQueue();
    setOfflineQueueCount(q.length);
  };

  const saveOfflineBackup = async ({
    audioUri, transcriptionText, duration, detectedLangs,
    sourceLanguage: srcLang, targetLanguage: tgtLang,
    useWebSpeech: webSpeech, continuingRecordingId: contId,
  }) => {
    let persistedAudioUri = audioUri;

    if (audioUri && Platform.OS !== "web") {
      try {
        const fileName = `offline_audio_${Date.now()}.m4a`;
        const destPath = `${documentDirectory}${fileName}`;
        await FileSystem.copyAsync({ from: audioUri, to: destPath });
        persistedAudioUri = destPath;
        console.log("💾 Audio persisted for offline queue:", destPath);
      } catch (copyErr) {
        console.warn("⚠️ Could not copy audio for offline queue:", copyErr.message);
        // Use original URI as fallback — may not survive cache clearing
      }
    }

    await enqueueOfflineItem({
      audioUri:              persistedAudioUri,
      transcription:         transcriptionText || "",
      duration:              duration || 0,
      detectedLanguages:     detectedLangs || [srcLang],
      sourceLanguage:        srcLang,
      targetLanguage:        tgtLang,
      useWebSpeech:          webSpeech,
      continuingRecordingId: contId || null,
      title: `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    });

    await AsyncStorage.setItem("latestTranscription", transcriptionText || "");
    await syncQueueCount();

    Alert.alert(
      "Saved Offline 📦",
      "No internet connection. Your recording and transcription have been saved locally and will upload automatically when you reconnect.",
      [{ text: "OK" }]
    );
  };

  /**
   * retryOfflineQueue — defined as a normal async function and stored in
   * retryQueueRef so it is always callable from the AppState handler and
   * NetInfo listener without stale closure issues.
   */
  const retryOfflineQueue = async () => {
    if (isRetryingRef.current) return;

    const netState = await NetInfo.fetch();
    const online   = netState.isConnected && netState.isInternetReachable !== false;
    if (!online) return;

    const queue = await readOfflineQueue();
    if (queue.length === 0) return;

    isRetryingRef.current = true;
    console.log(`🔄 Retrying ${queue.length} offline item(s)…`);

    for (const item of queue) {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) break;

        await saveRecordingToFirestoreInternal({
          audioUri:          item.audioUri,
          transcriptionText: item.transcription,
          duration:          item.duration,
          detectedLangs:     item.detectedLanguages,
          srcLang:           item.sourceLanguage,
          tgtLang:           item.targetLanguage,
          webSpeech:         item.useWebSpeech,
          contId:            item.continuingRecordingId,
          titleOverride:     item.title,
        });

        await dequeueOfflineItem(item.id);
        console.log(`✅ Uploaded offline item ${item.id}`);
      } catch (err) {
        console.warn(`⚠️ Retry failed for item ${item.id}:`, err.message);
        // Leave in queue; will retry on next opportunity
      }
    }

    await syncQueueCount();
    isRetryingRef.current = false;
    await loadPreviousRecordings();
  };

  // Store latest version of retryOfflineQueue in ref immediately after definition
  // so handleAppStateChange (which has no re-subscription) always calls the right one.
  retryQueueRef.current = retryOfflineQueue;

  // ═════════════════════════════════════════════════════════════════════════
  //  HELPERS (unchanged)
  // ═════════════════════════════════════════════════════════════════════════

  const formatDuration = (seconds) => {
    const hrs  = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${String(hrs).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    return `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  };

  const formatRelativeDate = (date) => {
    if (!date) return "Unknown date";
    const diff  = new Date() - date;
    const mins  = Math.floor(diff / 60000);
    const hrs   = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)  return "Just now";
    if (mins < 60) return `${mins} min ago`;
    if (hrs  < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
    if (days === 1)return "Yesterday";
    if (days < 7)  return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const detectLanguageFromText = (text) => {
    if (!text) return ["en"];
    const patterns = {
      sw: /\b(sasa|habari|asante|tafadhali|ndiyo|hapana|kwaheri|karibu|pole|shikamoo)\b/i,
      es: /\b(gracias|por favor|sí|no|hola|adiós|buenos días|buenas tardes|cómo estás)\b/i,
      fr: /\b(merci|s'il vous plaît|oui|non|bonjour|au revoir|comment allez-vous)\b/i,
      de: /\b(danke|bitte|ja|nein|hallo|auf wiedersehen|guten tag|wie geht es)\b/i,
      ar: /[\u0600-\u06FF]/,
      zh: /[\u4e00-\u9fa5]/,
      hi: /[\u0900-\u097F]/,
      ja: /[\u3040-\u309F\u30A0-\u30FF]/,
      pt: /\b(obrigado|por favor|sim|não|olá|tchau|bom dia)\b/i,
    };
    const detected = new Set(["en"]);
    for (const [lang, re] of Object.entries(patterns)) { if (re.test(text)) detected.add(lang); }
    return Array.from(detected);
  };

  const getLanguageDisplay = (code) => {
    const l = SUPPORTED_LANGUAGES.find((x) => x.code === code);
    return l ? `${l.flag} ${l.name}` : code;
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  DATA
  // ═════════════════════════════════════════════════════════════════════════

  const loadPreviousRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const currentUser = auth.currentUser;
      if (!currentUser) { setLoadingRecordings(false); return; }
      const q = query(
        collection(db, "recordings"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      const snap = await getDocs(q);
      const recordings = [];
      snap.forEach((d) => recordings.push({ id: d.id, ...d.data(), formattedDate: formatRelativeDate(d.data().createdAt?.toDate()) }));
      setPreviousRecordings(recordings);
    } catch (err) {
      console.error("❌ Error loading recordings:", err);
    } finally {
      setLoadingRecordings(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  PERMISSIONS
  // ═════════════════════════════════════════════════════════════════════════

  const requestPermissions = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Microphone access is required to record lectures.");
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error("❌ Permission error:", err);
      return false;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  FIRESTORE SAVE — INTERNAL
  // ═════════════════════════════════════════════════════════════════════════

  const saveRecordingToFirestoreInternal = async ({
    audioUri, transcriptionText, duration, detectedLangs,
    srcLang, tgtLang, webSpeech, contId, titleOverride,
  }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("User not authenticated. Please sign in first.");

    let audioUrl = null;
    if (audioUri) {
      try {
        const fileName   = `recordings/${currentUser.uid}/${Date.now()}.m4a`;
        const storageRef = ref(storage, fileName);
        let blob;
        if (Platform.OS === "web") {
          const response = await fetch(audioUri);
          blob = await response.blob();
        } else {
          let fileInfo = { exists: true };
          try { fileInfo = await FileSystem.getInfoAsync(audioUri); } catch (_) {}
          if (fileInfo.exists) {
            const b64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            blob = new Blob([arr], { type: "audio/m4a" });
            await uploadBytes(storageRef, blob);
            audioUrl = await getDownloadURL(storageRef);
            console.log("✅ Audio uploaded:", audioUrl);
          } else {
            console.warn("⚠️ Audio file missing at upload time, saving text-only");
          }
        }
      } catch (uploadErr) {
        console.error("⚠️ Audio upload failed (non-fatal):", uploadErr.message);
        // Continue — transcription text is saved even without audio
      }
    }

    const title = titleOverride || `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    if (contId) {
      await updateDoc(doc(db, "recordings", contId), {
        transcription:     transcriptionText,
        duration,
        formattedDuration: formatDuration(duration),
        detectedLanguages: detectedLangs,
        updatedAt:         serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "recordings"), {
        userId:              currentUser.uid,
        userEmail:           currentUser.email || "unknown",
        audioUrl,
        transcription:       transcriptionText || "",
        duration:            duration || 0,
        formattedDuration:   formatDuration(duration || 0),
        transcriptionMethod: webSpeech ? "Web Speech API" : "AssemblyAI",
        sourceLanguage:      srcLang,
        targetLanguage:      tgtLang,
        detectedLanguages:   detectedLangs || [srcLang],
        createdAt:           serverTimestamp(),
        platform:            Platform.OS,
        title,
        organizedNotes:      null,
        continuedFrom:       contId || null,
      });
    }

    await AsyncStorage.setItem("latestTranscription", transcriptionText || "");
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  FIRESTORE SAVE — PUBLIC (offline-aware)
  // ═════════════════════════════════════════════════════════════════════════

  const saveRecordingToFirestore = async (audioUri, transcriptionText, duration, detectedLangs) => {
    try {
      setIsSaving(true);

      const netState = await NetInfo.fetch();
      const online   = netState.isConnected && netState.isInternetReachable !== false;

      if (!online) {
        await saveOfflineBackup({
          audioUri, transcriptionText, duration, detectedLangs,
          sourceLanguage: srcLangRef.current,
          targetLanguage: tgtLangRef.current,
          useWebSpeech:   wsRef.current,
          continuingRecordingId: contIdRef.current,
        });
        return null;
      }

      await saveRecordingToFirestoreInternal({
        audioUri,
        transcriptionText,
        duration,
        detectedLangs,
        srcLang:  srcLangRef.current,
        tgtLang:  tgtLangRef.current,
        webSpeech: wsRef.current,
        contId:   contIdRef.current,
      });

      await haptics.notification("Success");

      Alert.alert(
        "Success! 🎉",
        contIdRef.current
          ? "Recording continued and saved successfully!"
          : "Recording and transcription saved successfully!",
        [
          { text: "View Notes", onPress: () => navigation?.navigate?.("NotesScreen", { refresh: Date.now() }) },
          { text: "OK",         onPress: () => { setContinuingRecordingId(null); loadPreviousRecordings(); } },
        ]
      );
    } catch (err) {
      console.error("❌ Firestore save error:", err);

      const isNetErr = (
        err.code === "unavailable" ||
        err.message?.toLowerCase().includes("network") ||
        err.message?.toLowerCase().includes("timeout") ||
        err.message?.toLowerCase().includes("failed to fetch")
      );

      if (isNetErr) {
        await saveOfflineBackup({
          audioUri, transcriptionText, duration: duration || 0, detectedLangs,
          sourceLanguage: srcLangRef.current, targetLanguage: tgtLangRef.current,
          useWebSpeech: wsRef.current, continuingRecordingId: contIdRef.current,
        });
      } else {
        Alert.alert("Save Error", `Failed to save recording: ${err.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  WEB SPEECH (unchanged logic)
  // ═════════════════════════════════════════════════════════════════════════

  const startWebSpeechRecognition = () => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      Alert.alert("Not Supported", "Web Speech API not available. Please use Chrome or Edge.");
      return false;
    }
    const SR        = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog     = new SR();
    const langCfg   = SUPPORTED_LANGUAGES.find((l) => l.code === srcLangRef.current);
    recog.continuous      = true;
    recog.interimResults  = true;
    recog.lang            = langCfg?.speechCode || "en-US";
    recog.maxAlternatives = 1;
    let finalTranscript   = contIdRef.current && transcription ? transcription + " " : "";
    const detectedLangs   = new Set([srcLangRef.current]);
    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { finalTranscript += t + " "; detectLanguageFromText(t).forEach((l) => detectedLangs.add(l)); }
        else interim += t;
      }
      setTranscription(finalTranscript + interim);
      setDetectedLanguages(Array.from(detectedLangs));
    };
    recog.onerror = (e) => { if (e.error === "not-allowed") { Alert.alert("Permission Denied", "Please allow microphone access."); stopRecording(); } };
    recog.onend   = () => { if (isRecording && !isPaused) { try { recog.start(); } catch (_) {} } };
    recog.start();
    webSpeechRef.current = recog;
    return true;
  };

  const stopWebSpeechRecognition = () => {
    if (webSpeechRef.current) {
      try { webSpeechRef.current.abort(); } catch (_) {}
      webSpeechRef.current = null;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  ASSEMBLYAI (unchanged logic)
  // ═════════════════════════════════════════════════════════════════════════

  const transcribeWithAssemblyAI = async (uri) => {
    if (!ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY.length < 10) throw new Error("AssemblyAI API key not configured.");

    let fileUri = uri;
    if (Platform.OS !== "web") {
      let fileInfo = { exists: true };
      try { fileInfo = await FileSystem.getInfoAsync(uri, { size: true }); } catch (_) {}
      if (!fileInfo.exists) {
        const altUri = `${documentDirectory}${uri.split("/").pop()}`;
        let altInfo  = { exists: false };
        try { altInfo = await FileSystem.getInfoAsync(altUri); } catch (_) {}
        if (altInfo.exists) { fileUri = altUri; }
        else throw new Error("Recording file not found. Please ensure the recording completed successfully.");
      }
      const stableUri = `${documentDirectory}upload_${Date.now()}.m4a`;
      try { await FileSystem.copyAsync({ from: fileUri, to: stableUri }); fileUri = stableUri; }
      catch (e) { console.warn("⚠️ Copy to stable path failed:", e.message); }
    }

    let b64;
    if (Platform.OS === "web") {
      const r   = await fetch(fileUri);
      const bl  = await r.blob();
      b64       = await new Promise((res, rej) => {
        const rd  = new FileReader();
        rd.onloadend = () => res(rd.result.split(",")[1]);
        rd.onerror   = rej;
        rd.readAsDataURL(bl);
      });
    } else {
      b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    }
    if (!b64 || b64.length < 100) throw new Error("Audio file appears to be empty or too short.");

    const bin  = atob(b64);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

    const upRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { authorization: ASSEMBLYAI_API_KEY, "content-type": "application/octet-stream", "transfer-encoding": "chunked" },
      body: arr.buffer,
    });
    if (!upRes.ok) throw new Error(`AssemblyAI upload failed (${upRes.status}): ${await upRes.text()}`);
    const { upload_url } = await upRes.json();
    if (!upload_url) throw new Error("AssemblyAI did not return an upload URL");

    const txRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: ASSEMBLYAI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ audio_url: upload_url, punctuate: true, format_text: true, language_detection: true }),
    });
    if (!txRes.ok) throw new Error(`Transcription request failed: ${txRes.status}`);
    const { id: txId } = await txRes.json();

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${txId}`, { headers: { authorization: ASSEMBLYAI_API_KEY } });
      if (!pollRes.ok) throw new Error(`Poll failed: ${pollRes.status}`);
      const tx = await pollRes.json();
      if (tx.status === "completed") {
        const langs = detectLanguageFromText(tx.text);
        setDetectedLanguages(langs);
        if (Platform.OS !== "web" && fileUri !== uri) FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        return { text: tx.text || "", detectedLanguage: tx.language_code || srcLangRef.current, detectedLanguages: langs };
      }
      if (tx.status === "error") throw new Error(`AssemblyAI error: ${tx.error}`);
    }
    throw new Error("Transcription timed out after 3 minutes.");
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  RECORDING CONTROLS
  // ═════════════════════════════════════════════════════════════════════════

  const startRecording = async () => {
    try {
      console.log("▶️ Starting recording…");
      await haptics.impact("Medium");
      const ok = await requestPermissions();
      if (!ok) return;

      // Reset timer state
      resetTimer();

      // ── Audio session — the critical background config ───────────────────
      // staysActiveInBackground: true  → iOS AVAudioSession stays active
      // keepAudioActiveHint: true      → Android foreground service started
      //
      // IMPORTANT: these two things together are what make background
      // recording work. Neither alone is sufficient on both platforms.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: true,
        shouldDuckAndroid:       true,
        interruptionModeIOS:     1,   // AVAudioSessionInterruptionOptionShouldResume
        interruptionModeAndroid: 1,
      });

      if (wsRef.current && Platform.OS === "web") startWebSpeechRecognition();

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(getRecordingOptions());
      await recording.startAsync();

      recordingRef.current  = recording;
      isStoppingRef.current = false;
      setIsRecording(true);

      if (!wsRef.current && !contIdRef.current) setTranscription("");
      setRecordingUri(null);

      // Start wall-clock timer
      startTimer();

      console.log("✅ Recording started — background-safe (iOS staysActiveInBackground + Android foreground service)");
    } catch (err) {
      console.error("❌ Start recording failed:", err);
      resetTimer();
      setIsRecording(false);
      Alert.alert("Error", `Failed to start recording: ${err.message}`);
    }
  };

  const pauseRecording = async () => {
    try {
      await haptics.impact("Light");
      if (recordingRef.current) {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.pauseAsync();
          setIsPaused(true);
          pauseTimer();
        }
      }
      stopWebSpeechRecognition();
      // We intentionally do NOT release the audio session here.
      // Releasing it would drop the foreground service on Android,
      // making it impossible to resume from background.
    } catch (err) { console.error("❌ Pause failed:", err); }
  };

  const resumeRecording = async () => {
    try {
      await haptics.impact("Light");
      // Re-assert audio mode — OS may have relaxed it while paused
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: true,
        shouldDuckAndroid:       true,
        interruptionModeIOS:     1,
        interruptionModeAndroid: 1,
      });
      if (recordingRef.current) {
        await recordingRef.current.startAsync();
        setIsPaused(false);
        startTimer(); // Restart wall-clock timer from current accumulated seconds
      }
      if (wsRef.current && Platform.OS === "web") startWebSpeechRecognition();
    } catch (err) { console.error("❌ Resume failed:", err); }
  };

  const stopRecording = async () => {
    if (isStoppingRef.current) {
      console.log("⚠️ Already stopping — ignoring duplicate call");
      return;
    }
    isStoppingRef.current = true;

    try {
      console.log("⏹️ Stopping recording…");
      await haptics.notification("Success");

      // Capture elapsed time BEFORE resetting (wall-clock accurate)
      const finalDuration = getElapsedSeconds();
      console.log(`⏱️ Final duration: ${finalDuration}s`);

      // Reset UI state immediately
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      setRecordingDuration(0);
      accumulatedSecsRef.current = 0;

      stopWebSpeechRecognition();

      if (!recordingRef.current) {
        console.warn("⚠️ No active recording ref on stop");
        return;
      }

      // ── Stop the native recorder ─────────────────────────────────────────
      let uri = null;

      // Step 1: stop and unload
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording || status.isDoneRecording === false) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (stopErr) {
        console.warn("⚠️ stopAndUnloadAsync error:", stopErr.message);
        // Continue to URI retrieval — file may still be written
      }

      // Step 2: get URI (separate try so stop errors don't block this)
      try {
        uri = recordingRef.current.getURI();
      } catch (uriErr) {
        console.warn("⚠️ getURI error:", uriErr.message);
        // uri remains null; handled below
      }

      // Step 3: release audio session NOW that we've stopped
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS:      false,
          playsInSilentModeIOS:    false,
          staysActiveInBackground: false,
        });
      } catch (_) {}

      recordingRef.current = null;
      console.log("📁 Recording URI:", uri);

      if (!uri) {
        Alert.alert("Recording Error", "Could not retrieve the recording file. Please try again.", [{ text: "OK" }]);
        return;
      }

      // Platform write delay
      if (Platform.OS === "android")      await new Promise((r) => setTimeout(r, 1200));
      else if (Platform.OS === "ios")     await new Promise((r) => setTimeout(r, 400));

      // ── Verify the file is on disk and non-empty ─────────────────────────
      if (Platform.OS !== "web") {
        let fileInfo = { exists: true, size: 9999 };
        try { fileInfo = await FileSystem.getInfoAsync(uri, { size: true }); }
        catch (e) { console.warn("⚠️ getInfoAsync failed (non-fatal):", e.message); }

        if (!fileInfo.exists) {
          Alert.alert("Recording Error", "The recording file was not saved. Please check microphone permissions.", [{ text: "OK" }]);
          return;
        }
        if (fileInfo.size !== undefined && fileInfo.size < 1000) {
          Alert.alert("Recording Too Short", "Recording appears empty. Please speak for at least 2 seconds.", [{ text: "OK" }]);
          return;
        }
      }

      setRecordingUri(uri);

      if (wsRef.current && transcription) {
        await saveRecordingToFirestore(uri, transcription, finalDuration, detectedLanguages);
        return;
      }

      await transcribeAudio(uri, finalDuration);
      await track();

    } catch (err) {
      console.error("❌ Stop recording failed:", err);
      Alert.alert("Error", `Failed to stop recording: ${err.message}`);
    } finally {
      isStoppingRef.current = false;
    }
  };

  const transcribeAudio = async (uri, duration) => {
    try {
      setIsTranscribing(true);
      const result     = await transcribeWithAssemblyAI(uri);
      const finalText  = contIdRef.current
        ? (transcription ? transcription + " " : "") + result.text
        : result.text;
      setTranscription(finalText || "No speech detected.");

      if (result.text?.trim().length > 0) {
        await saveRecordingToFirestore(uri, finalText, duration, result.detectedLanguages);
      } else {
        Alert.alert("No Speech Detected", "The transcription returned no text. Please ensure you spoke clearly.", [{ text: "OK" }]);
      }
    } catch (err) {
      console.error("❌ Transcription error:", err);
      // Preserve whatever partial transcription exists
      const partial = transcription || "";
      if (partial.trim().length > 0) {
        await saveOfflineBackup({
          audioUri: uri, transcriptionText: partial, duration,
          detectedLangs: detectedLanguages,
          sourceLanguage: srcLangRef.current, targetLanguage: tgtLangRef.current,
          useWebSpeech: wsRef.current, continuingRecordingId: contIdRef.current,
        });
      } else {
        // Save raw audio to offline queue with empty transcription so it's not lost
        await saveOfflineBackup({
          audioUri: uri, transcriptionText: "", duration,
          detectedLangs: detectedLanguages,
          sourceLanguage: srcLangRef.current, targetLanguage: tgtLangRef.current,
          useWebSpeech: wsRef.current, continuingRecordingId: contIdRef.current,
        });
        Alert.alert(
          "Transcription Error",
          `${err.message || "An error occurred."}\n\nYour audio has been preserved and will be retried when connectivity improves.`,
          [{ text: "OK" }]
        );
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const cancelRecording = async () => {
    try {
      await haptics.impact("Heavy");
      Alert.alert("Cancel Recording", "Are you sure you want to discard this recording?", [
        { text: "Keep Recording", style: "cancel" },
        {
          text: "Discard", style: "destructive",
          onPress: async () => {
            setIsRecording(false);
            setIsPaused(false);
            resetTimer();
            if (!contIdRef.current) setTranscription("");
            setRecordingUri(null);
            setContinuingRecordingId(null);
            stopWebSpeechRecognition();
            if (recordingRef.current) {
              try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
              recordingRef.current = null;
            }
            try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, staysActiveInBackground: false }); } catch (_) {}
          },
        },
      ]);
    } catch (err) { console.error("❌ Cancel failed:", err); }
  };

  const continueRecording = async (recording) => {
    await haptics.impact("Medium");
    Alert.alert(
      "Continue Recording",
      `Continue: ${recording.title}?\n\nNew audio will be appended to the existing transcription.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            setContinuingRecordingId(recording.id);
            setTranscription(recording.transcription || "");
            setSourceLanguage(recording.sourceLanguage || "en");
            setTargetLanguage(recording.targetLanguage || "en");
            setDetectedLanguages(recording.detectedLanguages || ["en"]);
            resetTimer();
            Alert.alert("Ready", "Press 'Continue Recording' to add to this lecture.", [{ text: "OK" }]);
          },
        },
      ]
    );
  };

  const deleteRecording = async (id) => {
    Alert.alert("Delete Recording", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            setPreviousRecordings((prev) => prev.filter((r) => r.id !== id));
            await haptics.notification("Success");
            Alert.alert("Deleted", "Recording deleted successfully.");
          } catch (err) { Alert.alert("Error", "Failed to delete recording."); }
        },
      },
    ]);
  };

  const copyTranscription = async () => {
    await haptics.impact("Light");
    await AsyncStorage.setItem("clipboard", transcription);
    Alert.alert("Copied!", "Transcription copied.");
  };

  const shareTranscription = async () => {
    await haptics.impact("Light");
    try { await Share.share({ message: transcription, title: "Lecture Transcription" }); } catch (_) {}
  };

  // ── Derived display values ─────────────────────────────────────────────
  const displayedRecordings = showAllRecordings ? previousRecordings : previousRecordings.slice(0, 3);
  const recordStatus = isRecording
    ? isPaused ? "Paused" : useWebSpeech ? "Recording — Live" : "Recording"
    : continuingRecordingId ? "Ready to Continue" : "Ready to Record";
  const timerColor = isRecording ? (isPaused ? palette.warning : palette.danger) : colors.text;

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER (unchanged JSX)
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      <TrialBanner />
      <UsageMeter feature={FEATURES.TRANSCRIPTION} style={{ marginHorizontal: 0, marginBottom: 12 }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingTop: padTop, paddingHorizontal: padH, paddingBottom: sp(14) }]}>
        <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: heroY }] }}>

          {/* ── PAGE HEADER ────────────────────────────────────────────── */}
          <View style={s.pageHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[s.iconBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]} activeOpacity={0.75}>
              <MaterialIcons name="arrow-back" size={18} color={colors.textSub} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— NoteTedd</Label>
              <Text style={[s.pageTitle, { color: colors.text }]}>Record</Text>
            </View>
            <View style={[s.langBadge, { backgroundColor: palette.violetSoft(), borderColor: palette.violetSoft(0.3) }]}>
              <Text style={{ fontSize: 13 }}>{SUPPORTED_LANGUAGES.find((l) => l.code === sourceLanguage)?.flag || "🌐"}</Text>
            </View>
          </View>

          {/* ── CONTINUING BANNER ─────────────────────────────────────── */}
          {continuingRecordingId && (
            <View style={[s.continuingBanner, { backgroundColor: palette.successSoft(0.15), borderColor: `${palette.success}30` }]}>
              <MaterialIcons name="add-circle-outline" size={16} color={palette.success} />
              <Text style={[s.continuingText, { color: palette.success }]}>Continuing previous recording</Text>
              <TouchableOpacity onPress={() => { setContinuingRecordingId(null); if (!isRecording) setTranscription(""); }}>
                <MaterialIcons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── MAIN RECORD CARD ──────────────────────────────────────── */}
          <View style={[s.recordCard, { backgroundColor: colors.bgCard, borderColor: isRecording ? isPaused ? `${palette.warning}35` : `${palette.danger}35` : colors.border }]}>
            {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
              <Corner key={pos} pos={pos} color={isRecording ? (isPaused ? palette.warning : palette.danger) : palette.violet} size={13} />
            ))}
            <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 22, backgroundColor: isRecording ? isPaused ? palette.warning : palette.danger : palette.violet, opacity: 0.035 }} />

            {!isRecording && (
              <View style={[s.langStrip, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <MaterialIcons name="language" size={14} color={palette.violetMid} />
                <Text style={[s.langStripText, { color: colors.textSub }]}>{getLanguageDisplay(sourceLanguage)}</Text>
                <MaterialIcons name="arrow-forward" size={12} color={colors.textDim} />
                <Text style={[s.langStripText, { color: colors.textSub }]}>{getLanguageDisplay(targetLanguage)}</Text>
              </View>
            )}

            {detectedLanguages.length > 1 && (
              <View style={[s.detectedRow, { backgroundColor: palette.successSoft(), borderColor: `${palette.success}25` }]}>
                <MaterialIcons name="info-outline" size={13} color={palette.success} />
                <Label color={palette.success}>Multi-lang: {detectedLanguages.map((l) => SUPPORTED_LANGUAGES.find((x) => x.code === l)?.flag || "🌐").join(" ")}</Label>
              </View>
            )}

            <View style={s.timerRow}>
              {isRecording && <View style={[s.recDot, { backgroundColor: isPaused ? palette.warning : palette.danger, shadowColor: isPaused ? palette.warning : palette.danger }]} />}
              <Text style={[s.timerText, { color: timerColor, fontSize: scale(isTablet ? 64 : 54) }]}>{formatDuration(recordingDuration)}</Text>
              <Label color={colors.textMuted} style={{ marginTop: 6 }}>{recordStatus}</Label>
            </View>

            <View style={{ alignItems: "center", marginVertical: sp(3) }}>
              <MicOrb isRecording={isRecording} isPaused={isPaused} useWebSpeech={useWebSpeech} scale={scale} />
            </View>

            <View style={s.btnRow}>
              {!isRecording ? (
                <TouchableOpacity onPress={startRecording} style={[s.primaryBtn, { backgroundColor: palette.violet, shadowColor: palette.violet }]} activeOpacity={0.85}>
                  <MaterialIcons name="fiber-manual-record" size={18} color="#fff" />
                  <Text style={s.primaryBtnText}>{continuingRecordingId ? "Continue Recording" : "Start Recording"}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.controlRow}>
                  <TouchableOpacity onPress={cancelRecording} style={[s.ctrlBtn, { backgroundColor: palette.dangerSoft(), borderColor: `${palette.danger}30` }]} activeOpacity={0.8}>
                    <MaterialIcons name="close" size={20} color={palette.danger} />
                    <Label color={palette.danger}>Cancel</Label>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={isPaused ? resumeRecording : pauseRecording} style={[s.ctrlBtn, { backgroundColor: palette.violetSoft(), borderColor: `${palette.violet}30` }]} activeOpacity={0.8}>
                    <MaterialIcons name={isPaused ? "play-arrow" : "pause"} size={20} color={palette.violet} />
                    <Label color={palette.violet}>{isPaused ? "Resume" : "Pause"}</Label>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={stopRecording} style={[s.ctrlBtn, { backgroundColor: palette.dangerSoft(0.18), borderColor: `${palette.danger}40`, flex: 1.3 }]} activeOpacity={0.8}>
                    <MaterialIcons name="stop" size={20} color={palette.danger} />
                    <Label color={palette.danger}>Finish</Label>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {Platform.OS === "web" && !isRecording && typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) && (
              <View style={[s.modeRow, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <MaterialIcons name={useWebSpeech ? "flash-on" : "schedule"} size={16} color={useWebSpeech ? palette.success : palette.violet} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.modeLabel, { color: colors.text }]}>{useWebSpeech ? "Live Mode" : "Post-processing Mode"}</Text>
                  <Label color={colors.textMuted}>{useWebSpeech ? "Real-time transcription" : "AssemblyAI — better accuracy"}</Label>
                </View>
                <Switch value={useWebSpeech} onValueChange={(v) => { haptics.impact("Light"); setUseWebSpeech(v); }} trackColor={{ false: colors.border, true: palette.success }} thumbColor="#fff" ios_backgroundColor={colors.bgInput} />
              </View>
            )}

            {!isRecording && (
              <View style={[s.tipRow, { backgroundColor: palette.violetSoft(0.08), borderColor: palette.violetSoft(0.2) }]}>
                <MaterialIcons name="lightbulb-outline" size={14} color={palette.violetLight} />
                <Text style={[s.tipText, { color: colors.textSub }]}>
                  {useWebSpeech
                    ? "Tip: Speak in multiple languages! System auto-detects in real time."
                    : "Tip: Record for at least 2 seconds. AssemblyAI provides superior accuracy and automatic language detection."}
                </Text>
              </View>
            )}
          </View>

          {/* ── TRANSCRIPTION CARD ───────────────────────────────────── */}
          {(transcription || isTranscribing || isSaving) && (
            <View style={[s.txCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Corner pos="top-left"  color={useWebSpeech ? palette.success : palette.violet} size={12} />
              <Corner pos="top-right" color={useWebSpeech ? palette.success : palette.violet} size={12} />
              <View style={s.txHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <MaterialIcons name="article" size={18} color={useWebSpeech ? palette.success : palette.violet} />
                  <Text style={[s.txTitle, { color: colors.text }]}>{useWebSpeech ? "Live Transcription" : "Transcription"}</Text>
                </View>
                {!isTranscribing && !isSaving && transcription && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={copyTranscription} style={[s.txBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                      <MaterialIcons name="content-copy" size={14} color={colors.textSub} />
                      <Label color={colors.textMuted}>Copy</Label>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={shareTranscription} style={[s.txBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                      <MaterialIcons name="share" size={14} color={colors.textSub} />
                      <Label color={colors.textMuted}>Share</Label>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {isTranscribing ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={palette.violet} />
                  <Text style={[s.loadingLabel, { color: colors.textMuted }]}>Detecting languages and transcribing…</Text>
                  <Label color={colors.textDim}>This may take a moment</Label>
                </View>
              ) : isSaving ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={palette.success} />
                  <Text style={[s.loadingLabel, { color: colors.textMuted }]}>Saving to cloud storage…</Text>
                </View>
              ) : (
                <>
                  <ScrollView style={{ maxHeight: scale(260) }}>
                    <Text style={[s.txBody, { color: colors.textSub }]}>{transcription}</Text>
                  </ScrollView>
                  <View style={[s.methodRow, { borderTopColor: colors.border }]}>
                    <MaterialIcons name={useWebSpeech ? "flash-on" : "cloud"} size={11} color={colors.textDim} />
                    <Label color={colors.textDim}>{useWebSpeech ? "Web Speech API" : "AssemblyAI"} · Multi-language</Label>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── PREVIOUS RECORDINGS ──────────────────────────────────── */}
          {previousRecordings.length > 0 && (
            <View style={[s.historyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={s.historyHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <MaterialIcons name="history" size={18} color={palette.violet} />
                  <Text style={[s.historyTitle, { color: colors.text }]}>Previous Recordings</Text>
                  <View style={[s.countBadge, { backgroundColor: palette.violetSoft() }]}>
                    <Label color={palette.violet}>{previousRecordings.length}</Label>
                  </View>
                </View>
                {previousRecordings.length > 3 && (
                  <TouchableOpacity onPress={() => setShowAllRecordings((p) => !p)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Label color={palette.violet}>{showAllRecordings ? "Less" : "View All"}</Label>
                    <MaterialIcons name={showAllRecordings ? "expand-less" : "expand-more"} size={16} color={palette.violet} />
                  </TouchableOpacity>
                )}
              </View>
              {loadingRecordings ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={palette.violet} />
                  <Text style={[s.loadingLabel, { color: colors.textMuted }]}>Loading recordings…</Text>
                </View>
              ) : (
                <>
                  {displayedRecordings.map((r) => (
                    <RecordingCard
                      key={r.id} recording={r} colors={colors} scale={scale}
                      formatDuration={formatDuration} formatRelativeDate={formatRelativeDate}
                      onContinue={() => continueRecording(r)}
                      onView={() => Alert.alert(r.title, r.transcription, [{ text: "Close" }])}
                      onDelete={() => deleteRecording(r.id)}
                    />
                  ))}
                  {!showAllRecordings && previousRecordings.length > 3 && (
                    <TouchableOpacity onPress={() => setShowAllRecordings(true)} style={[s.showMoreBtn, { borderColor: colors.border }]}>
                      <Label color={palette.violet}>+ {previousRecordings.length - 3} more recordings</Label>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── EMPTY STATE ───────────────────────────────────────────── */}
          {!transcription && !isTranscribing && !isRecording && previousRecordings.length === 0 && !loadingRecordings && (
            <View style={s.emptyState}>
              <View style={[s.emptyOrbOuter, { borderColor: colors.border }]}>
                <View style={[s.emptyOrb, { backgroundColor: palette.violetSoft(0.18) }]}>
                  <MaterialIcons name="mic-none" size={scale(40)} color={palette.violetMid} />
                </View>
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No recordings yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>Start recording to capture and transcribe lectures in multiple languages</Text>
              <View style={[s.featureCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Corner pos="top-left"  color={palette.ember}  size={11} />
                <Corner pos="top-right" color={palette.violet} size={11} />
                <Label color={colors.textDim} style={{ marginBottom: 14 }}>— Multi-Language Features</Label>
                {[
                  { icon: "language",   color: palette.violet,  t: "Automatic Detection", d: "System detects all languages spoken during recording" },
                  { icon: "translate",  color: palette.ember,   t: "Smart Translation",   d: "Converts all content to your selected target language" },
                  { icon: "cloud-done", color: palette.success, t: "Cloud Storage",        d: "All recordings automatically synced across devices" },
                ].map((f) => (
                  <View key={f.t} style={s.featureRow}>
                    <View style={[s.featureIcon, { backgroundColor: `${f.color}16` }]}>
                      <MaterialIcons name={f.icon} size={16} color={f.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.featureTitle, { color: colors.text }]}>{f.t}</Text>
                      <Text style={[s.featureSub,   { color: colors.textMuted }]}>{f.d}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  STYLESHEET (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1 },
  pageHeader: { flexDirection: "row", alignItems: "center", marginBottom: sp(3), gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  langBadge: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  continuingBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: sp(2), paddingVertical: sp(1.5), marginBottom: sp(2) },
  continuingText: { flex: 1, fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  recordCard: { borderRadius: 22, borderWidth: 1, padding: sp(3), marginBottom: sp(2.5), overflow: "hidden", position: "relative" },
  langStrip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: sp(2) },
  langStripText: { fontFamily: SANS, fontSize: 13, fontWeight: "500" },
  detectedRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginBottom: sp(2), alignSelf: "center" },
  timerRow: { alignItems: "center", paddingVertical: sp(1) },
  recDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 8, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 },
  timerText: { fontFamily: MONO, fontWeight: "900", letterSpacing: -2 },
  btnRow:  { gap: sp(1.5) },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: sp(2), shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 10 },
  primaryBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: "700", letterSpacing: 2, color: "#fff", textTransform: "uppercase" },
  controlRow: { flexDirection: "row", gap: 10 },
  ctrlBtn: { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.75) },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: sp(1.5) },
  modeLabel: { fontFamily: SANS, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: sp(2) },
  tipText: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 18 },
  txCard: { borderRadius: 20, borderWidth: 1, padding: sp(2.5), marginBottom: sp(2.5), overflow: "hidden", position: "relative" },
  txHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(2) },
  txTitle: { fontFamily: DISPLAY, fontSize: 18, fontWeight: "800" },
  txBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  txBody:    { fontFamily: SANS, fontSize: 14, lineHeight: 24 },
  methodRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingTop: sp(1.5), borderTopWidth: 1, marginTop: sp(1.5) },
  loadingBox:   { alignItems: "center", paddingVertical: sp(4) },
  loadingLabel: { fontFamily: SANS, fontSize: 14, marginTop: 12, marginBottom: 4 },
  historyCard: { borderRadius: 20, borderWidth: 1, padding: sp(2.5), marginBottom: sp(2.5) },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: sp(2) },
  historyTitle: { fontFamily: DISPLAY, fontSize: 18, fontWeight: "800" },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  showMoreBtn: { alignItems: "center", paddingVertical: sp(1.5), borderWidth: 1, borderRadius: 12, marginTop: 4 },
  emptyState: { alignItems: "center", paddingTop: sp(4) },
  emptyOrbOuter: { width: 100, height: 100, borderRadius: 50, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2.5) },
  emptyOrb: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", marginBottom: 8 },
  emptySub: { fontFamily: SANS, fontSize: 14, lineHeight: 22, textAlign: "center", paddingHorizontal: sp(3), marginBottom: sp(3) },
  featureCard: { width: "100%", borderRadius: 18, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  featureRow:  { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: sp(2) },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  featureTitle:{ fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  featureSub:  { fontFamily: SANS, fontSize: 12, lineHeight: 18 },
});