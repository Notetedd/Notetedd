

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
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
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

// ═════════════════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM  (from File 2)
// ═════════════════════════════════════════════════════════════════════════════

const DISPLAY = Platform.OS === "ios" ? "Georgia"        : "serif";
const SANS    = Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif";
const MONO    = Platform.OS === "ios" ? "Menlo"          : "monospace";

const BASE = 8;
const sp   = (n) => BASE * n;

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
    textSub:   "rgba(245, 244, 250, 0.91)",
    textMuted: "rgba(240,238,255,0.38)",
    textDim:   "rgba(233, 231, 243, 0.2)",
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
//  SUPPORTED LANGUAGES  (from File 1 — identical in both, kept verbatim)
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
//  RECORDING OPTIONS  (from File 1 — verbatim)
// ═════════════════════════════════════════════════════════════════════════════

const getRecordingOptions = () => {
  if (Platform.OS === "android") {
    return {
      android: {
        extension: ".m4a",
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      ios: {
        extension: ".m4a",
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.MEDIUM,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
      keepAudioActiveHint: true,
    };
  }
  return {
    android: {
      extension: ".m4a",
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    ios: {
      extension: ".m4a",
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
    keepAudioActiveHint: true,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
//  ATOMS  (from File 2)
// ═════════════════════════════════════════════════════════════════════════════

const Label = ({ children, color, style }) => (
  <Text
    style={[
      { fontFamily: MONO, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color },
      style,
    ]}
  >
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
      <View
        style={{
          position: "absolute",
          top:    isB ? undefined : 0,
          bottom: isB ? 0 : undefined,
          left:   isR ? undefined : 0,
          right:  isR ? 0 : undefined,
          width: size, height: 1.5,
          backgroundColor: color, opacity: 0.55,
        }}
      />
      <View
        style={{
          position: "absolute",
          top:    isB ? undefined : 0,
          bottom: isB ? 0 : undefined,
          left:   isR ? undefined : 0,
          right:  isR ? 0 : undefined,
          width: 1.5, height: size,
          backgroundColor: color, opacity: 0.55,
        }}
      />
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
//  MIC ORB  (from File 2)
// ═════════════════════════════════════════════════════════════════════════════

const MicOrb = ({ isRecording, isPaused, useWebSpeech, scale }) => {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(0.85)).current;
  const innerS = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1.28, duration: 1100, useNativeDriver: true }),
          Animated.timing(pulse1, { toValue: 1,    duration: 1100, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse2, { toValue: 1.18, duration: 1600, useNativeDriver: true }),
          Animated.timing(pulse2, { toValue: 0.85, duration: 1600, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(innerS, { toValue: 1.06, duration: 800, useNativeDriver: true }),
          Animated.timing(innerS, { toValue: 0.96, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse1.stopAnimation(); pulse1.setValue(1);
      pulse2.stopAnimation(); pulse2.setValue(0.85);
      innerS.stopAnimation(); innerS.setValue(1);
    }
  }, [isRecording, isPaused]);

  const coreColor = isRecording ? (isPaused ? palette.warning : palette.danger) : palette.violet;
  const haloColor = coreColor;
  const orbSize   = scale(148);

  return (
    <View style={{ width: orbSize * 1.5, height: orbSize * 1.5, alignItems: "center", justifyContent: "center" }}>
      {/* Outermost halo */}
      <Animated.View
        style={{
          position: "absolute",
          width: orbSize * 1.5, height: orbSize * 1.5,
          borderRadius: orbSize * 0.75,
          backgroundColor: haloColor, opacity: 0.07,
          transform: [{ scale: pulse2 }],
        }}
      />
      {/* Mid ring */}
      <Animated.View
        style={{
          position: "absolute",
          width: orbSize * 1.15, height: orbSize * 1.15,
          borderRadius: orbSize * 0.575,
          backgroundColor: haloColor, opacity: 0.1,
          transform: [{ scale: pulse1 }],
        }}
      />
      {/* Core */}
      <Animated.View
        style={{
          width: orbSize, height: orbSize,
          borderRadius: orbSize / 2,
          backgroundColor: coreColor,
          alignItems: "center", justifyContent: "center",
          transform: [{ scale: innerS }],
          shadowColor: coreColor,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.65, shadowRadius: 28,
          elevation: 20, overflow: "hidden",
        }}
      >
        {/* Shine highlight */}
        <View
          style={{
            position: "absolute", top: -6, left: orbSize * 0.15,
            width: orbSize * 0.35, height: orbSize * 0.28,
            borderRadius: orbSize * 0.14,
            backgroundColor: "#fff", opacity: 0.14,
            transform: [{ rotate: "-20deg" }],
          }}
        />
        <MaterialIcons
          name={isPaused ? "pause" : isRecording ? "stop" : "mic"}
          size={scale(52)}
          color="#fff"
        />
      </Animated.View>
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
//  RECORDING CARD  (from File 2)
// ═════════════════════════════════════════════════════════════════════════════

const RecordingCard = ({
  recording,
  onContinue,
  onView,
  onDelete,
  colors,
  scale,
  formatDuration,
  formatRelativeDate,
}) => {
  const pressS = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(pressS, { toValue: 0.985, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(pressS, { toValue: 1,     useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: pressS }] }}>
      <View style={[rStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Corner pos="top-left"     color={palette.violet} size={10} />
        <Corner pos="bottom-right" color={palette.violet} size={10} />

        {/* Icon */}
        <View style={[rStyles.cardIcon, { backgroundColor: palette.violetSoft(0.14) }]}>
          <MaterialIcons name="mic" size={scale(18)} color={palette.violet} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[rStyles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {recording.title}
          </Text>

          <View style={rStyles.cardMeta}>
            <Label color={colors.textMuted}>
              {recording.formattedDuration || formatDuration(recording.duration || 0)}
            </Label>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textDim }} />
            <Label color={colors.textMuted}>
              {formatRelativeDate(recording.createdAt?.toDate?.()) || recording.formattedDate}
            </Label>
            {recording.detectedLanguages?.length > 1 && (
              <View style={[rStyles.multiLangBadge, { backgroundColor: palette.successSoft() }]}>
                <MaterialIcons name="translate" size={9} color={palette.success} />
                <Label color={palette.success} style={{ fontSize: 8 }}>Multi</Label>
              </View>
            )}
          </View>

          <Text style={[rStyles.cardPreview, { color: colors.textMuted }]} numberOfLines={2}>
            {recording.transcription || "No transcription available"}
          </Text>

          <View style={rStyles.cardActions}>
            {/* Continue */}
            <TouchableOpacity
              onPressIn={onIn}
              onPressOut={onOut}
              onPress={onContinue}
              style={[rStyles.btnContinue, { backgroundColor: palette.violet }]}
              activeOpacity={0.85}
            >
              <MaterialIcons name="add" size={13} color="#fff" />
              <Text style={rStyles.btnContinueText}>Continue</Text>
            </TouchableOpacity>

            {/* View */}
            <TouchableOpacity
              onPress={onView}
              style={[rStyles.btnSecondary, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
              activeOpacity={0.75}
            >
              <MaterialIcons name="visibility" size={13} color={colors.textSub} />
              <Text style={[rStyles.btnSecondaryText, { color: colors.textSub }]}>View</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={onDelete}
              style={[rStyles.btnDelete, { backgroundColor: palette.dangerSoft() }]}
              activeOpacity={0.75}
            >
              <MaterialIcons name="delete-outline" size={15} color={palette.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const rStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 16,
    padding: sp(2),
    marginBottom: sp(1.5),
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    gap: sp(1.5),
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  cardTitle:   { fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  cardMeta:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  cardPreview: { fontFamily: SANS, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  cardActions: { flexDirection: "row", gap: 6 },
  btnContinue: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, gap: 4,
  },
  btnContinueText: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: "#fff", fontWeight: "700" },
  btnSecondary: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, gap: 4,
  },
  btnSecondaryText: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5 },
  btnDelete: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginLeft: "auto",
  },
  multiLangBadge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, gap: 3,
  },
});

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function RecordScreen({ route }) {
  // ── Theme (File 2 approach: own useColors hook) ───────────────────────────
  const { theme } = useTheme();
  const isDark    = theme === "dark";
  const colors    = useColors(isDark);

  const navigation = useNavigation();
  const { width: W, height: H } = useWindowDimensions();
  const scale    = makeScale(W);
  const isTablet = W >= 768;
  const padH     = scale(isTablet ? 40 : 24);
  const padTop   = Platform.OS === "ios" ? scale(60) : scale(46);

  // ── Feature gate (File 1) ─────────────────────────────────────────────────
  const { gate, track, canUse } = useFeatureGate(FEATURES.TRANSCRIPTION);

  // ── State (File 1 — verbatim) ─────────────────────────────────────────────
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

  const recordingRef  = useRef(null);
  const webSpeechRef  = useRef(null);
  const timerRef      = useRef(null);
  const isStoppingRef = useRef(false);

  // ── Animations (File 2 — entry fade + spring) ─────────────────────────────
  const masterOpa = useRef(new Animated.Value(0)).current;
  const heroY     = useRef(new Animated.Value(30)).current;

  // ── Firebase (File 1) ─────────────────────────────────────────────────────
  const auth    = getAuth();
  const storage = getStorage();
  const db      = getFirestore();

  // ═══════════════════════════════════════════════════════════════════════════
  //  LIFECYCLE  (File 1 logic + File 2 animations)
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    console.log("🎙️ RecordScreen mounted");

    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroY, { toValue: 0, tension: 42, friction: 9, useNativeDriver: true }),
    ]).start();

    loadPreviousRecordings();

    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (webSpeechRef.current) {
        webSpeechRef.current.stop();
        webSpeechRef.current = null;
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, isPaused]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

  const formatDuration = (seconds) => {
    const hrs  = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatRelativeDate = (date) => {
    if (!date) return "Unknown date";
    const now      = new Date();
    const diffMs   = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)  return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHrs  < 24) return `${diffHrs} hour${diffHrs > 1 ? "s" : ""} ago`;
    if (diffDays === 1)return "Yesterday";
    if (diffDays < 7)  return `${diffDays} days ago`;
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
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) detected.add(lang);
    }
    return Array.from(detected);
  };

  const getLanguageDisplay = (langCode) => {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    return lang ? `${lang.flag} ${lang.name}` : langCode;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  DATA  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

  const loadPreviousRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoadingRecordings(false);
        return;
      }
      const recordingsRef = collection(db, "recordings");
      const q = query(
        recordingsRef,
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const recordings = [];
      querySnapshot.forEach((docSnap) => {
        recordings.push({
          id: docSnap.id,
          ...docSnap.data(),
          formattedDate: formatRelativeDate(docSnap.data().createdAt?.toDate()),
        });
      });
      setPreviousRecordings(recordings);
    } catch (error) {
      console.error("❌ Error loading recordings:", error);
    } finally {
      setLoadingRecordings(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  PERMISSIONS  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

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
    } catch (error) {
      console.error("❌ Permission error:", error);
      return false;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  FIRESTORE SAVE  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

  const saveRecordingToFirestore = async (audioUri, transcriptionText, duration, detectedLangs) => {
    try {
      setIsSaving(true);
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
            let audioFileInfo = { exists: true };
            try {
              audioFileInfo = await FileSystem.getInfoAsync(audioUri);
            } catch (infoErr) {
              console.warn("⚠️ Audio file stat warning:", infoErr.message);
            }
            if (!audioFileInfo.exists) {
              console.warn("⚠️ Audio file not found for storage upload, skipping");
              audioUrl = null;
            } else {
              const base64Data = await FileSystem.readAsStringAsync(audioUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
              blob = new Blob([bytes], { type: "audio/m4a" });
              await uploadBytes(storageRef, blob);
              audioUrl = await getDownloadURL(storageRef);
              console.log("✅ Audio uploaded:", audioUrl);
            }
          }
        } catch (uploadError) {
          console.error("⚠️ Audio upload failed (non-fatal):", uploadError);
        }
      }

      const recordingData = {
        userId:              currentUser.uid,
        userEmail:           currentUser.email || "unknown",
        audioUrl:            audioUrl || null,
        transcription:       transcriptionText || "",
        duration:            duration || 0,
        formattedDuration:   formatDuration(duration || 0),
        transcriptionMethod: useWebSpeech ? "Web Speech API" : "AssemblyAI",
        sourceLanguage,
        targetLanguage,
        detectedLanguages:   detectedLangs || [sourceLanguage],
        createdAt:           serverTimestamp(),
        platform:            Platform.OS,
        title:               `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        organizedNotes:      null,
        continuedFrom:       continuingRecordingId || null,
      };

      let docRef;
      if (continuingRecordingId) {
        const recordingDocRef = doc(db, "recordings", continuingRecordingId);
        await updateDoc(recordingDocRef, {
          transcription:     transcriptionText,
          duration,
          formattedDuration: formatDuration(duration),
          detectedLanguages: detectedLangs,
          updatedAt:         serverTimestamp(),
        });
        docRef = { id: continuingRecordingId };
      } else {
        docRef = await addDoc(collection(db, "recordings"), recordingData);
      }

      await AsyncStorage.setItem("latestTranscription", transcriptionText || "");
      await haptics.notification("Success");

      Alert.alert(
        "Success! 🎉",
        continuingRecordingId
          ? "Recording continued and saved successfully!"
          : "Recording and transcription saved successfully!",
        [
          {
            text: "View Notes",
            onPress: () => {
              if (navigation?.navigate) {
                navigation.navigate("NotesScreen", { refresh: Date.now() });
              }
            },
          },
          {
            text: "OK",
            onPress: () => { setContinuingRecordingId(null); loadPreviousRecordings(); },
          },
        ]
      );

      return docRef.id;
    } catch (error) {
      console.error("❌ Firestore save error:", error);
      Alert.alert("Save Error", `Failed to save recording: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  WEB SPEECH  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

  const startWebSpeechRecognition = () => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      Alert.alert("Not Supported", "Web Speech API not available. Please use Chrome or Edge.");
      return false;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition       = new SpeechRecognition();
    const langConfig        = SUPPORTED_LANGUAGES.find((l) => l.code === sourceLanguage);
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = langConfig?.speechCode || "en-US";
    recognition.maxAlternatives = 1;
    let finalTranscript = continuingRecordingId && transcription ? transcription + " " : "";
    const detectedLangs = new Set([sourceLanguage]);
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + " ";
          detectLanguageFromText(t).forEach((lang) => detectedLangs.add(lang));
        } else {
          interimTranscript += t;
        }
      }
      setTranscription(finalTranscript + interimTranscript);
      setDetectedLanguages(Array.from(detectedLangs));
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        Alert.alert("Permission Denied", "Please allow microphone access.");
        stopRecording();
      }
    };
    recognition.onend = () => {
      if (isRecording && !isPaused) { try { recognition.start(); } catch (_) {} }
    };
    recognition.start();
    webSpeechRef.current = recognition;
    return true;
  };

  const stopWebSpeechRecognition = () => {
    if (webSpeechRef.current) {
      try { webSpeechRef.current.abort(); } catch (_) {}
      webSpeechRef.current = null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  ASSEMBLYAI  (File 1 — verbatim)
  // ═══════════════════════════════════════════════════════════════════════════

  const transcribeWithAssemblyAI = async (uri) => {
    try {
      console.log("🎯 Starting AssemblyAI transcription for URI:", uri);
      if (!ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY.length < 10) {
        throw new Error("AssemblyAI API key not configured.");
      }

      let fileUri = uri;
      if (Platform.OS !== "web") {
        let fileInfo = { exists: true };
        try {
          fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
          console.log("📁 AssemblyAI file info:", JSON.stringify(fileInfo));
        } catch (infoErr) {
          console.warn("⚠️ getInfoAsync warning (non-fatal):", infoErr.message);
        }
        if (!fileInfo.exists) {
          const fileName = uri.split("/").pop();
          const altUri   = `${documentDirectory}${fileName}`;
          let altInfo    = { exists: false };
          try { altInfo = await FileSystem.getInfoAsync(altUri); } catch (_) {}
          if (altInfo.exists) {
            fileUri = altUri;
            console.log("✅ Found at alternate path:", fileUri);
          } else {
            throw new Error("Recording file not found. Please ensure the recording completed successfully and try again.");
          }
        }
        const stableUri = `${documentDirectory}upload_${Date.now()}.m4a`;
        try {
          await FileSystem.copyAsync({ from: fileUri, to: stableUri });
          fileUri = stableUri;
          console.log("✅ Copied to stable path:", fileUri);
        } catch (copyErr) {
          console.warn("⚠️ Copy failed, using original URI:", copyErr.message);
        }
      }

      let base64Audio;
      if (Platform.OS === "web") {
        const response = await fetch(fileUri);
        const blob     = await response.blob();
        base64Audio    = await new Promise((resolve, reject) => {
          const reader     = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.onerror   = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Audio = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      if (!base64Audio || base64Audio.length < 100) {
        throw new Error("Audio file appears to be empty or too short.");
      }
      console.log(`✅ Read ${base64Audio.length} base64 chars`);

      const binaryString = atob(base64Audio);
      const bytes        = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      console.log(`⬆️ Uploading ${bytes.length} bytes to AssemblyAI…`);

      const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: {
          authorization:     ASSEMBLYAI_API_KEY,
          "content-type":    "application/octet-stream",
          "transfer-encoding":"chunked",
        },
        body: bytes.buffer,
      });
      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`AssemblyAI upload failed (${uploadResponse.status}): ${errText}`);
      }
      const uploadData = await uploadResponse.json();
      const uploadUrl  = uploadData.upload_url;
      if (!uploadUrl) throw new Error("AssemblyAI did not return an upload URL");
      console.log("✅ AssemblyAI upload_url:", uploadUrl);

      const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: { authorization: ASSEMBLYAI_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          audio_url:         uploadUrl,
          punctuate:         true,
          format_text:       true,
          language_detection:true,
        }),
      });
      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Transcription request failed: ${transcriptResponse.status} – ${errorText}`);
      }
      const transcriptData = await transcriptResponse.json();
      console.log("🆔 Transcript ID:", transcriptData.id);

      let attempts   = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const pollResponse = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptData.id}`,
          { headers: { authorization: ASSEMBLYAI_API_KEY } }
        );
        if (!pollResponse.ok) throw new Error(`Poll failed: ${pollResponse.status}`);
        const transcript = await pollResponse.json();
        console.log(`📊 Status (${attempts + 1}/${maxAttempts}):`, transcript.status);
        if (transcript.status === "completed") {
          console.log("✅ Transcription complete! Language:", transcript.language_code);
          const detectedLangs = detectLanguageFromText(transcript.text);
          setDetectedLanguages(detectedLangs);
          if (Platform.OS !== "web" && fileUri !== uri) {
            FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
          }
          return {
            text:              transcript.text || "",
            detectedLanguage:  transcript.language_code || sourceLanguage,
            detectedLanguages: detectedLangs,
          };
        } else if (transcript.status === "error") {
          throw new Error(`AssemblyAI error: ${transcript.error}`);
        }
        attempts++;
      }
      throw new Error("Transcription timed out after 3 minutes.");
    } catch (error) {
      console.error("❌ AssemblyAI error:", error);
      throw error;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECORDING CONTROLS  (File 1 — verbatim, including gate/track calls)
  // ═══════════════════════════════════════════════════════════════════════════

  const startRecording = async () => {
    try {
      console.log("▶️ Starting recording…");
      await haptics.impact("Medium");
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid:    true,
        interruptionModeIOS:  1,
        interruptionModeAndroid: 1,
      });
      if (useWebSpeech && Platform.OS === "web") startWebSpeechRecognition();
      const recording        = new Audio.Recording();
      const recordingOptions = getRecordingOptions();
      await recording.prepareToRecordAsync(recordingOptions);
      await recording.startAsync();
      recordingRef.current  = recording;
      isStoppingRef.current = false;
      setIsRecording(true);
      setRecordingDuration(0);
      if (!useWebSpeech && !continuingRecordingId) setTranscription("");
      setRecordingUri(null);
      console.log("✅ Recording started");
    } catch (error) {
      console.error("❌ Start recording failed:", error);
      Alert.alert("Error", `Failed to start recording: ${error.message}`);
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
        }
      }
      stopWebSpeechRecognition();
    } catch (error) { console.error("❌ Pause failed:", error); }
  };

  const resumeRecording = async () => {
    try {
      await haptics.impact("Light");
      if (recordingRef.current) { await recordingRef.current.startAsync(); setIsPaused(false); }
      if (useWebSpeech && Platform.OS === "web") startWebSpeechRecognition();
    } catch (error) { console.error("❌ Resume failed:", error); }
  };

  const stopRecording = async () => {
    if (isStoppingRef.current) { console.log("⚠️ Already stopping, ignoring duplicate call"); return; }
    isStoppingRef.current = true;
    try {
      console.log("⏹️ Stopping recording…");
      await haptics.notification("Success");
      setIsRecording(false);
      setIsPaused(false);
      stopWebSpeechRecognition();
      if (!recordingRef.current) { console.log("⚠️ No active recording ref"); return; }

      let uri = null;
      try {
        const status = await recordingRef.current.getStatusAsync();
        console.log("📊 Recording status before stop:", JSON.stringify(status));
        if (status.isRecording || status.isDoneRecording === false) {
          await recordingRef.current.stopAndUnloadAsync();
        }
        uri = recordingRef.current.getURI();
      } catch (stopErr) {
        console.error("⚠️ Error stopping recording:", stopErr);
        try { uri = recordingRef.current.getURI(); } catch (_) {}
      }

      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }); } catch (_) {}
      recordingRef.current = null;
      console.log("📁 Raw recording URI:", uri);

      if (!uri) {
        Alert.alert("Recording Error", "Could not retrieve the recording file. Please try again.", [{ text: "OK" }]);
        return;
      }

      if (Platform.OS === "android") await new Promise((resolve) => setTimeout(resolve, 1200));
      else if (Platform.OS === "ios") await new Promise((resolve) => setTimeout(resolve, 400));

      if (Platform.OS !== "web") {
        let fileInfo = { exists: true, size: 9999 };
        try {
          fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
          console.log("📁 File info:", JSON.stringify(fileInfo));
        } catch (infoErr) {
          console.warn("⚠️ getInfoAsync failed (non-fatal):", infoErr.message);
        }
        if (!fileInfo.exists) {
          Alert.alert("Recording Error", "The recording file was not saved to disk. Please check microphone permissions and try again.", [{ text: "OK" }]);
          return;
        }
        if (fileInfo.size !== undefined && fileInfo.size < 1000) {
          Alert.alert("Recording Too Short", "The recording appears to be empty. Please speak for at least 2 seconds and then tap Finish.", [{ text: "OK" }]);
          return;
        }
      }

      setRecordingUri(uri);
      const finalDuration = recordingDuration;

      if (useWebSpeech && transcription) {
        console.log("✅ Using Web Speech transcription");
        await saveRecordingToFirestore(uri, transcription, finalDuration, detectedLanguages);
        return;
      }
      await transcribeAudio(uri, finalDuration);
      await track();
    } catch (error) {
      console.error("❌ Stop recording failed:", error);
      Alert.alert("Error", `Failed to stop recording: ${error.message}`);
    } finally {
      isStoppingRef.current = false;
    }
  };

  const transcribeAudio = async (uri, duration) => {
    try {
      setIsTranscribing(true);
      console.log("🎯 Transcribing:", uri);
      const result = await transcribeWithAssemblyAI(uri);
      const finalText = continuingRecordingId
        ? (transcription ? transcription + " " : "") + result.text
        : result.text;
      setTranscription(finalText || "No speech detected.");
      if (result.text && result.text.trim().length > 0) {
        await saveRecordingToFirestore(uri, finalText, duration, result.detectedLanguages);
      } else {
        Alert.alert("No Speech Detected", "The transcription returned no text. Please ensure you spoke clearly during the recording.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("❌ Transcription error:", error);
      Alert.alert("Transcription Error", error.message || "An unknown error occurred during transcription.", [{ text: "OK" }]);
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
            setIsRecording(false); setIsPaused(false); setRecordingDuration(0);
            if (!continuingRecordingId) setTranscription("");
            setRecordingUri(null); setContinuingRecordingId(null);
            stopWebSpeechRecognition();
            if (recordingRef.current) {
              try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
              recordingRef.current = null;
            }
            try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) {}
          },
        },
      ]);
    } catch (error) { console.error("❌ Cancel failed:", error); }
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
            Alert.alert("Ready", "Press 'Continue Recording' to add to this lecture.", [{ text: "OK" }]);
          },
        },
      ]
    );
  };

  const deleteRecording = async (recordingId) => {
    Alert.alert("Delete Recording", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            setPreviousRecordings((prev) => prev.filter((r) => r.id !== recordingId));
            await haptics.notification("Success");
            Alert.alert("Deleted", "Recording deleted successfully.");
          } catch (error) {
            console.error("❌ Delete failed:", error);
            Alert.alert("Error", "Failed to delete recording.");
          }
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
    try { await Share.share({ message: transcription, title: "Lecture Transcription" }); } catch (error) { console.error("Share error:", error); }
  };

  // ── Derived display values ────────────────────────────────────────────────
  const displayedRecordings = showAllRecordings ? previousRecordings : previousRecordings.slice(0, 3);

  const recordStatus = isRecording
    ? isPaused ? "Paused" : useWebSpeech ? "Recording — Live" : "Recording"
    : continuingRecordingId ? "Ready to Continue" : "Ready to Record";

  const timerColor = isRecording ? (isPaused ? palette.warning : palette.danger) : colors.text;

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER  (File 2 layout/styling — no LinearGradient, uses palette atoms)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* ── Monetisation banners (File 1) ─────────────────────────────── */}
      <TrialBanner />
      <UsageMeter
        feature={FEATURES.TRANSCRIPTION}
        style={{ marginHorizontal: 0, marginBottom: 12 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: padTop, paddingHorizontal: padH, paddingBottom: sp(14) },
        ]}
      >
        <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: heroY }] }}>

          {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
          <View style={s.pageHeader}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[s.iconBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              activeOpacity={0.75}
            >
              <MaterialIcons name="arrow-back" size={18} color={colors.textSub} />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: "center" }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— NoteTedd</Label>
              <Text style={[s.pageTitle, { color: colors.text }]}>Record</Text>
            </View>

            {/* Current language badge */}
            <View style={[s.langBadge, { backgroundColor: palette.violetSoft(), borderColor: palette.violetSoft(0.3) }]}>
              <Text style={{ fontSize: 13 }}>
                {SUPPORTED_LANGUAGES.find((l) => l.code === sourceLanguage)?.flag || "🌐"}
              </Text>
            </View>
          </View>

          {/* ── CONTINUING BANNER ─────────────────────────────────────────── */}
          {continuingRecordingId && (
            <View style={[s.continuingBanner, { backgroundColor: palette.successSoft(0.15), borderColor: `${palette.success}30` }]}>
              <MaterialIcons name="add-circle-outline" size={16} color={palette.success} />
              <Text style={[s.continuingText, { color: palette.success }]}>
                Continuing previous recording
              </Text>
              <TouchableOpacity
                onPress={() => { setContinuingRecordingId(null); if (!isRecording) setTranscription(""); }}
              >
                <MaterialIcons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── MAIN RECORD CARD ──────────────────────────────────────────── */}
          <View
            style={[
              s.recordCard,
              {
                backgroundColor: colors.bgCard,
                borderColor: isRecording
                  ? isPaused ? `${palette.warning}35` : `${palette.danger}35`
                  : colors.border,
              },
            ]}
          >
            {/* Corner marks — colour changes with recording state */}
            {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
              <Corner
                key={pos}
                pos={pos}
                color={isRecording ? (isPaused ? palette.warning : palette.danger) : palette.violet}
                size={13}
              />
            ))}

            {/* State tint overlay */}
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: 22,
                backgroundColor: isRecording
                  ? isPaused ? palette.warning : palette.danger
                  : palette.violet,
                opacity: 0.035,
              }}
            />

            {/* Language display (shown when not recording, from File 1) */}
            {!isRecording && (
              <View style={[s.langStrip, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <MaterialIcons name="language" size={14} color={palette.violetMid} />
                <Text style={[s.langStripText, { color: colors.textSub }]}>
                  {getLanguageDisplay(sourceLanguage)}
                </Text>
                <MaterialIcons name="arrow-forward" size={12} color={colors.textDim} />
                <Text style={[s.langStripText, { color: colors.textSub }]}>
                  {getLanguageDisplay(targetLanguage)}
                </Text>
              </View>
            )}

            {/* Detected languages indicator */}
            {detectedLanguages.length > 1 && (
              <View style={[s.detectedRow, { backgroundColor: palette.successSoft(), borderColor: `${palette.success}25` }]}>
                <MaterialIcons name="info-outline" size={13} color={palette.success} />
                <Label color={palette.success}>
                  Multi-lang:{" "}
                  {detectedLanguages
                    .map((l) => SUPPORTED_LANGUAGES.find((x) => x.code === l)?.flag || "🌐")
                    .join(" ")}
                </Label>
              </View>
            )}

            {/* Timer */}
            <View style={s.timerRow}>
              {isRecording && (
                <View
                  style={[
                    s.recDot,
                    {
                      backgroundColor: isPaused ? palette.warning : palette.danger,
                      shadowColor: isPaused ? palette.warning : palette.danger,
                    },
                  ]}
                />
              )}
              <Text style={[s.timerText, { color: timerColor, fontSize: scale(isTablet ? 64 : 54) }]}>
                {formatDuration(recordingDuration)}
              </Text>
              <Label color={colors.textMuted} style={{ marginTop: 6 }}>{recordStatus}</Label>
            </View>

            {/* Pulsing mic orb */}
            <View style={{ alignItems: "center", marginVertical: sp(3) }}>
              <MicOrb
                isRecording={isRecording}
                isPaused={isPaused}
                useWebSpeech={useWebSpeech}
                scale={scale}
              />
            </View>

            {/* Action buttons */}
            <View style={s.btnRow}>
              {!isRecording ? (
                <TouchableOpacity
                  onPress={startRecording}
                  style={[s.primaryBtn, { backgroundColor: palette.violet, shadowColor: palette.violet }]}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="fiber-manual-record" size={18} color="#fff" />
                  <Text style={s.primaryBtnText}>
                    {continuingRecordingId ? "Continue Recording" : "Start Recording"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={s.controlRow}>
                  <TouchableOpacity
                    onPress={cancelRecording}
                    style={[s.ctrlBtn, { backgroundColor: palette.dangerSoft(), borderColor: `${palette.danger}30` }]}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={20} color={palette.danger} />
                    <Label color={palette.danger}>Cancel</Label>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={isPaused ? resumeRecording : pauseRecording}
                    style={[s.ctrlBtn, { backgroundColor: palette.violetSoft(), borderColor: `${palette.violet}30` }]}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name={isPaused ? "play-arrow" : "pause"} size={20} color={palette.violet} />
                    <Label color={palette.violet}>{isPaused ? "Resume" : "Pause"}</Label>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={stopRecording}
                    style={[s.ctrlBtn, { backgroundColor: palette.dangerSoft(0.18), borderColor: `${palette.danger}40`, flex: 1.3 }]}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="stop" size={20} color={palette.danger} />
                    <Label color={palette.danger}>Finish</Label>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Web Speech toggle (web-only, from File 1 condition) */}
            {Platform.OS === "web" &&
              !isRecording &&
              typeof window !== "undefined" &&
              ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) && (
              <View style={[s.modeRow, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <MaterialIcons
                  name={useWebSpeech ? "flash-on" : "schedule"}
                  size={16}
                  color={useWebSpeech ? palette.success : palette.violet}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.modeLabel, { color: colors.text }]}>
                    {useWebSpeech ? "Live Mode" : "Post-processing Mode"}
                  </Text>
                  <Label color={colors.textMuted}>
                    {useWebSpeech ? "Real-time transcription" : "AssemblyAI — better accuracy"}
                  </Label>
                </View>
                <Switch
                  value={useWebSpeech}
                  onValueChange={(v) => { haptics.impact("Light"); setUseWebSpeech(v); }}
                  trackColor={{ false: colors.border, true: palette.success }}
                  thumbColor="#fff"
                  ios_backgroundColor={colors.bgInput}
                />
              </View>
            )}

            {/* Tip */}
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

          {/* ── TRANSCRIPTION CARD ────────────────────────────────────────── */}
          {(transcription || isTranscribing || isSaving) && (
            <View style={[s.txCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Corner pos="top-left"  color={useWebSpeech ? palette.success : palette.violet} size={12} />
              <Corner pos="top-right" color={useWebSpeech ? palette.success : palette.violet} size={12} />

              <View style={s.txHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <MaterialIcons
                    name="article"
                    size={18}
                    color={useWebSpeech ? palette.success : palette.violet}
                  />
                  <Text style={[s.txTitle, { color: colors.text }]}>
                    {useWebSpeech ? "Live Transcription" : "Transcription"}
                  </Text>
                </View>
                {!isTranscribing && !isSaving && transcription && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={copyTranscription}
                      style={[s.txBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
                    >
                      <MaterialIcons name="content-copy" size={14} color={colors.textSub} />
                      <Label color={colors.textMuted}>Copy</Label>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={shareTranscription}
                      style={[s.txBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
                    >
                      <MaterialIcons name="share" size={14} color={colors.textSub} />
                      <Label color={colors.textMuted}>Share</Label>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {isTranscribing ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={palette.violet} />
                  <Text style={[s.loadingLabel, { color: colors.textMuted }]}>
                    Detecting languages and transcribing…
                  </Text>
                  <Label color={colors.textDim}>This may take a moment</Label>
                </View>
              ) : isSaving ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={palette.success} />
                  <Text style={[s.loadingLabel, { color: colors.textMuted }]}>
                    Saving to cloud storage…
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView style={{ maxHeight: scale(260) }}>
                    <Text style={[s.txBody, { color: colors.textSub }]}>{transcription}</Text>
                  </ScrollView>
                  <View style={[s.methodRow, { borderTopColor: colors.border }]}>
                    <MaterialIcons name={useWebSpeech ? "flash-on" : "cloud"} size={11} color={colors.textDim} />
                    <Label color={colors.textDim}>
                      {useWebSpeech ? "Web Speech API" : "AssemblyAI"} · Multi-language
                    </Label>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── PREVIOUS RECORDINGS ───────────────────────────────────────── */}
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
                  <TouchableOpacity
                    onPress={() => setShowAllRecordings((p) => !p)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Label color={palette.violet}>{showAllRecordings ? "Less" : "View All"}</Label>
                    <MaterialIcons
                      name={showAllRecordings ? "expand-less" : "expand-more"}
                      size={16}
                      color={palette.violet}
                    />
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
                  {displayedRecordings.map((recording) => (
                    <RecordingCard
                      key={recording.id}
                      recording={recording}
                      colors={colors}
                      scale={scale}
                      formatDuration={formatDuration}
                      formatRelativeDate={formatRelativeDate}
                      onContinue={() => continueRecording(recording)}
                      onView={() =>
                        Alert.alert(recording.title, recording.transcription, [{ text: "Close" }])
                      }
                      onDelete={() => deleteRecording(recording.id)}
                    />
                  ))}
                  {!showAllRecordings && previousRecordings.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setShowAllRecordings(true)}
                      style={[s.showMoreBtn, { borderColor: colors.border }]}
                    >
                      <Label color={palette.violet}>
                        + {previousRecordings.length - 3} more recordings
                      </Label>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
          {!transcription &&
            !isTranscribing &&
            !isRecording &&
            previousRecordings.length === 0 &&
            !loadingRecordings && (
            <View style={s.emptyState}>
              <View style={[s.emptyOrbOuter, { borderColor: colors.border }]}>
                <View style={[s.emptyOrb, { backgroundColor: palette.violetSoft(0.18) }]}>
                  <MaterialIcons name="mic-none" size={scale(40)} color={palette.violetMid} />
                </View>
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No recordings yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                Start recording to capture and transcribe lectures in multiple languages
              </Text>

              {/* Feature card */}
              <View style={[s.featureCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Corner pos="top-left"  color={palette.ember}  size={11} />
                <Corner pos="top-right" color={palette.violet} size={11} />
                <Label color={colors.textDim} style={{ marginBottom: 14 }}>— Multi-Language Features</Label>
                {[
                  {
                    icon: "language",
                    color: palette.violet,
                    t: "Automatic Detection",
                    d: "System detects all languages spoken during recording",
                  },
                  {
                    icon: "translate",
                    color: palette.ember,
                    t: "Smart Translation",
                    d: "Converts all content to your selected target language",
                  },
                  {
                    icon: "cloud-done",
                    color: palette.success,
                    t: "Cloud Storage",
                    d: "All recordings automatically synced across devices",
                  },
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
//  STYLESHEET  (from File 2)
// ═════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1 },

  // ── Header ────────────────────────────────────────────────────────────────
  pageHeader: { flexDirection: "row", alignItems: "center", marginBottom: sp(3), gap: 12 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  pageTitle: { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  langBadge: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  // ── Continuing banner ─────────────────────────────────────────────────────
  continuingBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: sp(2), paddingVertical: sp(1.5),
    marginBottom: sp(2),
  },
  continuingText: { flex: 1, fontFamily: SANS, fontSize: 13, fontWeight: "600" },

  // ── Record card ───────────────────────────────────────────────────────────
  recordCard: {
    borderRadius: 22, borderWidth: 1, padding: sp(3),
    marginBottom: sp(2.5), overflow: "hidden", position: "relative",
  },
  langStrip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: sp(2),
  },
  langStripText: { fontFamily: SANS, fontSize: 13, fontWeight: "500" },
  detectedRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: sp(2), alignSelf: "center",
  },
  timerRow: { alignItems: "center", paddingVertical: sp(1) },
  recDot: {
    width: 10, height: 10, borderRadius: 5, marginBottom: 8,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
  },
  timerText: { fontFamily: MONO, fontWeight: "900", letterSpacing: -2 },

  btnRow:     { gap: sp(1.5) },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 16, paddingVertical: sp(2),
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 10,
  },
  primaryBtnText: {
    fontFamily: MONO, fontSize: 11, fontWeight: "700",
    letterSpacing: 2, color: "#fff", textTransform: "uppercase",
  },
  controlRow: { flexDirection: "row", gap: 10 },
  ctrlBtn: {
    flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 4, borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.75),
  },
  modeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: sp(1.5),
  },
  modeLabel: { fontFamily: SANS, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  tipRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginTop: sp(2),
  },
  tipText: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 18 },

  // ── Transcription card ────────────────────────────────────────────────────
  txCard: {
    borderRadius: 20, borderWidth: 1, padding: sp(2.5),
    marginBottom: sp(2.5), overflow: "hidden", position: "relative",
  },
  txHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: sp(2),
  },
  txTitle: { fontFamily: DISPLAY, fontSize: 18, fontWeight: "800" },
  txBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  txBody:    { fontFamily: SANS, fontSize: 14, lineHeight: 24 },
  methodRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingTop: sp(1.5), borderTopWidth: 1, marginTop: sp(1.5),
  },

  loadingBox:   { alignItems: "center", paddingVertical: sp(4) },
  loadingLabel: { fontFamily: SANS, fontSize: 14, marginTop: 12, marginBottom: 4 },

  // ── History card ──────────────────────────────────────────────────────────
  historyCard: {
    borderRadius: 20, borderWidth: 1, padding: sp(2.5), marginBottom: sp(2.5),
  },
  historyHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: sp(2),
  },
  historyTitle: { fontFamily: DISPLAY, fontSize: 18, fontWeight: "800" },
  countBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  showMoreBtn: {
    alignItems: "center", paddingVertical: sp(1.5),
    borderWidth: 1, borderRadius: 12, marginTop: 4,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState:    { alignItems: "center", paddingTop: sp(4) },
  emptyOrbOuter: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginBottom: sp(2.5),
  },
  emptyOrb: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", marginBottom: 8 },
  emptySub: {
    fontFamily: SANS, fontSize: 14, lineHeight: 22,
    textAlign: "center", paddingHorizontal: sp(3), marginBottom: sp(3),
  },
  featureCard: {
    width: "100%", borderRadius: 18, borderWidth: 1,
    padding: sp(2.5), position: "relative", overflow: "hidden",
  },
  featureRow:  { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: sp(2) },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  featureTitle:{ fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  featureSub:  { fontFamily: SANS, fontSize: 12, lineHeight: 18 },
});