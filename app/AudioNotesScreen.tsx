// ─── Imports ──────────────────────────────────────────────────────────────────
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import { getAuth } from "firebase/auth";
import {
  collection, getDocs, getFirestore,
  orderBy, query, where,
} from "firebase/firestore";
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {MaterialIcons} from "@expo/vector-icons";
import { useTheme } from "./context/ThemeContext";
import useFeatureGate from "./hooks/useFeatureGate";
import { FEATURES } from "../RevenueCatConfig";
import TrialBanner from "./components/TrialBanner";
import UsageMeter from "./components/UsageMeter";
import haptics from "./utils/haptics";

// ════════════════════════════════════════════════════════════════
//  SECTION 1 — SECURITY & CONFIG
// ════════════════════════════════════════════════════════════════

/**
 * I read the TTS key 
 */
const GOOGLE_TTS_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? "";
const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * I sanitise any text before sending it to an external API.
 * This strips control characters and caps the payload length to
 * prevent unexpected billing spikes from very long notes.
 */
function sanitiseScript(raw = "") {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .substring(0, 12_000); // ~8–10 min of speech at normal speed
}

// ════════════════════════════════════════════════════════════════
//  SECTION 2 — DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════

// I pick platform-native typefaces so the app feels at home on every OS.
const DISPLAY = Platform.select({ ios: "Georgia",        default: "serif" });
const SANS    = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const MONO    = Platform.select({ ios: "Menlo",          default: "monospace" });

// I use an 8-point spatial grid throughout.
const U  = 8;
const sp = (n) => U * n;

/**
 * I define every colour in one palette object so a single change
 * here ripples through the entire screen.
 */
const P = {
  // Brand
  violet:    "#5b21b6",
  violetMid: "#7c3aed",
  violetBr:  "#a78bfa",

  teal:      "#0d9488",
  tealBr:    "#2dd4bf",

  ember:     "#ea580c",
  emberBr:   "#fb923c",

  gold:      "#d97706",
  goldBr:    "#fbbf24",

  rose:      "#e11d48",
  roseBr:    "#fb7185",

  success:   "#059669",
  successBr: "#34d399",

  // Alpha helpers
  va: (a) => `rgba(91,33,182,${a})`,
  ta: (a) => `rgba(13,148,136,${a})`,
  ea: (a) => `rgba(234,88,12,${a})`,
  ga: (a) => `rgba(217,119,6,${a})`,
  ra: (a) => `rgba(225,29,72,${a})`,
  sa: (a) => `rgba(5,150,105,${a})`,
  wa: (a) => `rgba(255,255,255,${a})`,
  ba: (a) => `rgba(0,0,0,${a})`,

  // Dark surfaces
  dark: {
    bg:        "#04040a",
    bgEl:      "#090914",
    bgCard:    "#0d0d1a",
    bgInput:   "#111120",
    bgHover:   "#161628",
    border:    "rgba(255,255,255,0.07)",
    borderMid: "rgba(255,255,255,0.13)",
    text:      "#ede9ff",
    textSub:   "rgba(237,233,255,0.68)",
    textMuted: "rgba(237, 233, 255, 0.81)",
    textDim:   "rgba(229, 226, 241, 0.64)",
    scrim:     "rgba(4,4,10,0.92)",
  },

  // Light surfaces
  light: {
    bg:        "#f5f3ff",
    bgEl:      "#ffffff",
    bgCard:    "#ffffff",
    bgInput:   "#ede9ff",
    bgHover:   "#f0ecff",
    border:    "rgba(91,33,182,0.08)",
    borderMid: "rgba(91,33,182,0.18)",
    text:      "#1e1033",
    textSub:   "rgba(30,16,51,0.68)",
    textMuted: "rgba(30,16,51,0.44)",
    textDim:   "rgba(30,16,51,0.25)",
    scrim:     "rgba(245,243,255,0.95)",
  },
};

// I resolve the right surface palette from the current theme flag.
const useColors = (isDark) => (isDark ? P.dark : P.light);

// ════════════════════════════════════════════════════════════════
//  SECTION 2B — ATOMS
//  I define these outside the component so they never re-mount.
// ════════════════════════════════════════════════════════════════

/** I use Label for all caps-monospace metadata text. */
const Label = ({ children, color, style }) => (
  <Text
    style={[
      { fontFamily: MONO, fontSize: 9, letterSpacing: 3.5, textTransform: "uppercase", color },
      style,
    ]}
  >
    {children}
  </Text>
);

/**
 * I render bracket-style corner marks to give cards an
 * editorial "registered" feel.
 */
const Corner = ({ pos, color, size = 10 }) => {
  const isTop = pos.includes("top");
  const isLft = pos.includes("left");
  const base  = {
    position: "absolute",
    [isTop ? "top" : "bottom"]: 0,
    [isLft ? "left" : "right"]: 0,
    width: size, height: size,
  };
  const h = { position: "absolute", [isTop ? "top" : "bottom"]: 0, [isLft ? "left" : "right"]: 0, width: size,  height: 1.5, backgroundColor: color, opacity: 0.55 };
  const v = { position: "absolute", [isTop ? "top" : "bottom"]: 0, [isLft ? "left" : "right"]: 0, width: 1.5, height: size,  backgroundColor: color, opacity: 0.55 };
  return (
    <View style={base} pointerEvents="none">
      <View style={h} /><View style={v} />
    </View>
  );
};

/** I use Pill for compact badge labels throughout the screen. */
const Pill = ({ label, color, icon, style }) => (
  <View
    style={[
      {
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: `${color}18`,
        borderWidth: 1, borderColor: `${color}35`,
      },
      style,
    ]}
  >
    {icon && <MaterialIcons name={icon} size={10} color={color} />}
    <Label color={color}>{label}</Label>
  </View>
);

/** I use Card as the consistent surface wrapper across all sections. */
const Card = ({ children, colors, accent, style }) => (
  <View
    style={[
      A.card,
      {
        backgroundColor: colors.bgCard,
        borderColor: accent ? `${accent}20` : colors.border,
      },
      style,
    ]}
  >
    {accent && (
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.025, borderRadius: 20 }} />
    )}
    {children}
  </View>
);

/**
 * I memoize the note card row so unchanged entries skip re-render
 * entirely during list scrolls.
 */
const NoteCard = React.memo(({ item, onPress, colors }) => {
  const notes         = item.organizedNotes;
  const keyPtsCount   = notes?.keyPoints?.length ?? 0;
  const sectionsCount = notes?.sections?.length ?? 0;
  const scale         = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, tension: 200 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, tension: 200 }).start();

  if (!notes) return null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        activeOpacity={1}
      >
        <View style={[A.noteCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {/* I apply a subtle violet tint so the card reads as "audio content" */}
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: P.violet, opacity: 0.025, borderRadius: 18 }} />
          <Corner pos="top-left"     color={P.violetBr} size={9} />
          <Corner pos="bottom-right" color={P.tealBr}   size={9} />

          {/* Header row */}
          <View style={A.noteCardHeader}>
            <View style={[A.noteIconWrap, { backgroundColor: P.va(0.13) }]}>
              <MaterialIcons name="headphones" size={20} color={P.violetBr} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[A.noteCardTitle, { color: colors.text }]} numberOfLines={1}>
                {notes.title ?? "Untitled Note"}
              </Text>
              <Label color={colors.textDim}>{item.timeAgo}</Label>
            </View>
            <MaterialIcons name="chevron-right" size={17} color={colors.textDim} />
          </View>

          {/* Summary */}
          <Text style={[A.noteCardSummary, { color: colors.textMuted }]} numberOfLines={2}>
            {notes.summary ?? "No summary available"}
          </Text>

          {/* Stats + badge row */}
          <View style={A.noteCardFooter}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <MaterialIcons name="star-outline" size={12} color={P.goldBr} />
                <Label color={colors.textDim}>{keyPtsCount} pts</Label>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <MaterialIcons name="folder-open" size={12} color={P.tealBr} />
                <Label color={colors.textDim}>{sectionsCount} sections</Label>
              </View>
            </View>
            <Pill
              label={item.source === "firestore" ? "Cloud" : "Local"}
              color={item.source === "firestore" ? P.success : P.gold}
              icon={item.source === "firestore" ? "cloud" : "phone-android"}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  SECTION 3 — MAIN SCREEN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function AudioNotesScreen({ navigation, route }) {
  const { theme } = useTheme();
  const isDark    = theme === "dark";
  const colors    = useColors(isDark);

  // I use useWindowDimensions so the layout reacts to orientation
  // changes and split-screen mode at runtime.
  const { width: W } = useWindowDimensions();
  const isTablet = W >= 768;
  const padH     = isTablet ? sp(6) : sp(3);
  const padTop   = Platform.OS === "ios" ? sp(7) : sp(5.5);

  // ── View & list state ───────────────────────────────────────
  const [viewMode,    setViewMode]    = useState("selection");
  const [allNotes,    setAllNotes]    = useState([]);
  const [selectedNote,setSelectedNote]= useState(null);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Player state ────────────────────────────────────────────
  const [isPlaying,        setIsPlaying]        = useState(false);
  const [isPaused,         setIsPaused]          = useState(false);
  const [generatingAudio,  setGeneratingAudio]   = useState(false);
  const [playbackSpeed,    setPlaybackSpeed]     = useState(1.0);
  const [selectedVoice,    setSelectedVoice]     = useState("default");
  const [audioFormat,      setAudioFormat]       = useState("summary");
  const [playbackPosition, setPlaybackPosition]  = useState(0);
  const [playbackDuration, setPlaybackDuration]  = useState(0);
  const [useCloudTTS,      setUseCloudTTS]       = useState(false);

  // ── Firebase ────────────────────────────────────────────────
  const auth = getAuth();
  const db   = getFirestore();
  const { gate, track, canUse } = useFeatureGate(FEATURES.AUDIO_NOTES);

  // ── Refs ────────────────────────────────────────────────────
  const soundRef    = useRef(null);
  const speechRef   = useRef(null);

  // ── Animations ──────────────────────────────────────────────
  const masterOpa  = useRef(new Animated.Value(0)).current;
  const slideY     = useRef(new Animated.Value(16)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const orbScale   = useRef(new Animated.Value(1)).current;
  // I allocate 7 wave bars — odd count looks more musical than even.
  const waveAnims  = useRef([...Array(7)].map(() => new Animated.Value(0.2))).current;

  // ════════════════════════════════════════════════════════════
  //  EFFECTS
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 620, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 50, friction: 11, useNativeDriver: true }),
    ]).start();

    setupAudio();
    fetchAllNotes();

    return () => { cleanupAudio(); };
  }, []);

  // I drive wave and pulse animations from a single isPlaying flag.
  useEffect(() => {
    if (isPlaying && !isPaused) {
      startWaveAnimation();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900,  useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900,  useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.14, duration: 1200, useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 1,    duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      orbScale.stopAnimation();
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true }).start();
      Animated.spring(orbScale,  { toValue: 1, useNativeDriver: true }).start();
      // I reset waves to their resting state.
      waveAnims.forEach((a) => Animated.spring(a, { toValue: 0.2, useNativeDriver: true }).start());
    }
  }, [isPlaying, isPaused]);

  // ════════════════════════════════════════════════════════════
  //  AUDIO SETUP / CLEANUP  (original logic — untouched)
  // ════════════════════════════════════════════════════════════

  const setupAudio = async () => {
    if (Platform.OS !== "web") {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS:      false,
          playsInSilentModeIOS:    true,
          staysActiveInBackground: true,
          shouldDuckAndroid:       true,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        console.error("Audio setup error:", err);
      }
    }
  };

  const cleanupAudio = async () => {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } else {
        if (await Speech.isSpeakingAsync()) Speech.stop();
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
      }
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  DATA FETCHING  (original logic — untouched)
  // ════════════════════════════════════════════════════════════

  const fetchAllNotes = async () => {
    try {
      setLoading(true);
      const notes = [];
      const user  = auth.currentUser;

      if (user) {
        try {
          const snap = await getDocs(
            query(
              collection(db, "recordings"),
              where("userId", "==", user.uid),
              orderBy("createdAt", "desc")
            )
          );
          snap.forEach((d) => {
            const data = d.data();
            if (data.organizedNotes) {
              notes.push({
                id: d.id,
                ...data,
                source:  "firestore",
                timeAgo: formatDate(data.createdAt),
              });
            }
          });
        } catch (e) { console.warn("Firestore fetch:", e); }
      }

      try {
        const saved = await AsyncStorage.getItem("organizedNotes");
        if (saved && notes.length === 0) {
          const parsed = JSON.parse(saved);
          notes.push({
            id:            "local-1",
            organizedNotes: parsed,
            title:          parsed.title ?? "Local Note",
            createdAt:      new Date(),
            source:         "local",
            timeAgo:        "Just now",
          });
        }
      } catch (e) { console.warn("AsyncStorage fetch:", e); }

      setAllNotes(notes);
    } catch (err) {
      console.error("fetchAllNotes:", err);
      Alert.alert("Error", "Failed to load notes. Please pull down to refresh.");
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  FILTERING  — I memoize this so it only recomputes when
  //  the notes list or the search query actually changes.
  // ════════════════════════════════════════════════════════════

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return allNotes;
    const lq = searchQuery.toLowerCase();
    return allNotes.filter((n) => {
      const title   = (n.organizedNotes?.title ?? n.title ?? "").toLowerCase();
      const summary = (n.organizedNotes?.summary ?? "").toLowerCase();
      return title.includes(lq) || summary.includes(lq);
    });
  }, [allNotes, searchQuery]);

  // ════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════

  /** I convert a Firestore timestamp or plain Date into a short relative string. */
  function formatDate(date) {
    if (!date) return "";
    const d       = date?.toDate ? date.toDate() : new Date(date);
    const diffMs  = Date.now() - d;
    const mins    = Math.floor(diffMs / 60_000);
    const hours   = Math.floor(diffMs / 3_600_000);
    const days    = Math.floor(diffMs / 86_400_000);
    if (mins  < 1)  return "Just now";
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  === 1) return "Yesterday";
    if (days  < 7)  return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  /** I build and sanitise the TTS script from the selected note. */
  const generateAudioScript = useCallback(() => {
    if (!selectedNote?.organizedNotes) return "";
    const n   = selectedNote.organizedNotes;
    let script = "";

    switch (audioFormat) {
      case "summary":
        script = `${n.title}. ${n.summary}. `;
        script += `Key points: ${(n.keyPoints ?? []).slice(0, 5).join(". ")}. `;
        break;
      case "keypoints":
        script = `${n.title}. Here are the key points: `;
        (n.keyPoints ?? []).forEach((pt, i) => { script += `Point ${i + 1}: ${pt}. `; });
        break;
      case "full":
        script = `${n.title}. ${n.summary}. `;
        script += `Key points: ${(n.keyPoints ?? []).join(". ")}. `;
        (n.sections ?? []).forEach((s, i) => { script += `Section ${i + 1}: ${s.title}. ${s.content}. `; });
        if (n.definitions && Object.keys(n.definitions).length > 0) {
          script += "Key definitions: ";
          Object.entries(n.definitions).forEach(([t, d]) => { script += `${t}: ${d}. `; });
        }
        break;
    }
    // I sanitise before sending to any external API.
    return sanitiseScript(script);
  }, [selectedNote, audioFormat]);

  // ════════════════════════════════════════════════════════════
  //  WAVE ANIMATION
  // ════════════════════════════════════════════════════════════

  const startWaveAnimation = () => {
    const animations = waveAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1,   duration: 500 + i * 80, delay: i * 70, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15,duration: 500 + i * 80, useNativeDriver: true }),
        ])
      )
    );
    Animated.parallel(animations).start();
  };

  // ════════════════════════════════════════════════════════════
  //  AUDIO GENERATION  (original logic — untouched)
  // ════════════════════════════════════════════════════════════

  const generateAudioWithWebSpeech = async () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      throw new Error("Text-to-Speech not supported in this browser.");

    window.speechSynthesis.cancel();
    const script     = generateAudioScript();
    const utterance  = new SpeechSynthesisUtterance(script);
    const voices     = window.speechSynthesis.getVoices();

    if (selectedVoice === "female" && voices.length > 0) {
      const v = voices.find((v) => /female|samantha|victoria/i.test(v.name));
      if (v) utterance.voice = v;
    } else if (selectedVoice === "male" && voices.length > 0) {
      const v = voices.find((v) => /male|daniel|alex/i.test(v.name));
      if (v) utterance.voice = v;
    }

    utterance.rate   = playbackSpeed;
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => { setIsPlaying(true);  setIsPaused(false);  setGeneratingAudio(false); };
    utterance.onend   = () => { setIsPlaying(false); setIsPaused(false); };
    utterance.onerror = (e) => {
      console.error("Web Speech error:", e.error);
      setGeneratingAudio(false);
      track();
      setIsPlaying(false);
      Alert.alert("Error", "Failed to generate audio.");
    };

    window.speechSynthesis.speak(utterance);
  };

  const generateAudioWithExpoSpeech = async () => {
    const script = generateAudioScript();
    const voices = await Speech.getAvailableVoicesAsync();
    let voiceId  = null;

    if (voices.length > 0) {
      if (selectedVoice === "female") {
        voiceId = voices.find((v) => /female|samantha/i.test(v.identifier ?? v.name ?? ""))?.identifier;
      } else if (selectedVoice === "male") {
        voiceId = voices.find((v) => /male|daniel/i.test(v.identifier ?? v.name ?? ""))?.identifier;
      }
    }

    await Speech.speak(script, {
      rate:     playbackSpeed,
      pitch:    1.0,
      language: "en-US",
      voice:    voiceId,
      onStart:   () => { setIsPlaying(true);  setIsPaused(false);  setGeneratingAudio(false); track();},
      onDone:    () => { setIsPlaying(false); setIsPaused(false);  setPlaybackPosition(0); },
      onStopped: () => { setIsPlaying(false); setIsPaused(false);  setPlaybackPosition(0); },
      onError:   (e) => { console.error("Expo Speech:", e); setGeneratingAudio(false); setIsPlaying(false); Alert.alert("Error", "Device TTS failed."); },
    });
    speechRef.current = script;
  };

  const generateAudioWithCloudTTS = async () => {
    const script = generateAudioScript();

    const voiceMap = {
      female:  { name: "en-US-Neural2-F", ssmlGender: "FEMALE" },
      male:    { name: "en-US-Neural2-D", ssmlGender: "MALE"   },
      default: { name: "en-US-Neural2-C", ssmlGender: "NEUTRAL"},
    };
    const voice = voiceMap[selectedVoice] ?? voiceMap.default;

    const res = await fetch(`${GOOGLE_TTS_URL}?key=${GOOGLE_TTS_KEY}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input:       { text: script },
        voice:       { languageCode: "en-US", ...voice },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate:  playbackSpeed,
          pitch:         0,
          volumeGainDb:  0,
          effectsProfileId: ["headphone-class-device"],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? `Cloud TTS ${res.status}`);
    }

    const data       = await res.json();
    const audioBase64 = data.audioContent;
    if (!audioBase64) throw new Error("No audio content received.");

    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mp3;base64,${audioBase64}` },
      { shouldPlay: false, rate: playbackSpeed, progressUpdateIntervalMillis: 150 },
      onPlaybackStatusUpdate
    );
    soundRef.current = sound;
    await sound.playAsync();
    setIsPlaying(true);
    setIsPaused(false);
    setGeneratingAudio(false);
    await track();
  };

  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) return;
    setPlaybackPosition(status.positionMillis / 1000);
    setPlaybackDuration(status.durationMillis  / 1000);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setIsPaused(false);
      setPlaybackPosition(0);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  PLAYBACK CONTROLS  (original logic — untouched)
  // ════════════════════════════════════════════════════════════

  const handlePlay = async () => {
    try {
      haptics.impact?.("Light");
       const allowed = gate();
    if (!allowed) return;
      setGeneratingAudio(true);

      if (Platform.OS === "web") {
        if (isPlaying && isPaused) {
          window.speechSynthesis.resume();
          setIsPaused(false);
          setGeneratingAudio(false);
        } else if (!isPlaying) {
          await generateAudioWithWebSpeech();
        }
      } else if (useCloudTTS) {
        if (soundRef.current && isPaused) {
          await soundRef.current.playAsync();
          setIsPaused(false);
          setGeneratingAudio(false);
        } else {
          await generateAudioWithCloudTTS();
        }
      } else {
        await generateAudioWithExpoSpeech();
        setGeneratingAudio(false);
      }
    } catch (err) {
      console.error("Play error:", err);
      Alert.alert("Playback Error", "Failed to play audio. Please try again.");
      setGeneratingAudio(false);
    }
  };

  const handlePause = async () => {
    try {
      haptics.impact?.("Light");
      if (Platform.OS === "web") {
        if (window.speechSynthesis && isPlaying) { window.speechSynthesis.pause(); setIsPaused(true); }
      } else if (useCloudTTS && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPaused(true);
      } else {
        if (await Speech.isSpeakingAsync()) { Speech.stop(); setIsPlaying(false); setIsPaused(false); }
      }
    } catch (err) { console.error("Pause error:", err); }
  };

  const handleStop = async () => {
    try {
      haptics.impact?.("Light");
      if (Platform.OS === "web") {
        window.speechSynthesis?.cancel();
      } else if (useCloudTTS && soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.setPositionAsync(0);
      } else {
        if (await Speech.isSpeakingAsync()) Speech.stop();
      }
      setIsPlaying(false);
      setIsPaused(false);
      setPlaybackPosition(0);
    } catch (err) { console.error("Stop error:", err); }
  };

  const changePlaybackSpeed = async () => {
    haptics.impact?.("Light");
    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.75];
    const next   = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (isPlaying) { await handleStop(); setTimeout(handlePlay, 120); }
  };

  const toggleTTSMode = async () => {
    if (Platform.OS === "web") return;
    haptics.impact?.("Light");
    if (isPlaying) await handleStop();
    const switching = !useCloudTTS;
    setUseCloudTTS(switching);
    Alert.alert(
      "TTS Mode Changed",
      switching ? "Switched to Cloud TTS (higher quality)." : "Switched to device TTS.",
      [{ text: "OK" }]
    );
  };

  // ════════════════════════════════════════════════════════════
  //  NAVIGATION HELPERS
  // ════════════════════════════════════════════════════════════

  const selectNote = async (note) => {
    haptics.impact?.("Medium");
    setSelectedNote(note);
    setViewMode("player");
  };

  const backToSelection = async () => {
    haptics.impact?.("Light");
    await cleanupAudio();
    setIsPlaying(false);
    setIsPaused(false);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    setSelectedNote(null);
    setViewMode("selection");
  };

  // I memoize the keyExtractor to avoid allocation on every render.
  const keyExtractor = useCallback((item) => item.id, []);

  // ════════════════════════════════════════════════════════════
  //  RENDER — LIBRARY VIEW
  // ════════════════════════════════════════════════════════════

  const renderLibrary = () => (
    <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: slideY }] }}>

 <TrialBanner />
    <UsageMeter
      feature={FEATURES.AUDIO_NOTES}
      style={{ marginBottom: sp(2) }}
    />
      {/* Search bar */}
      <View style={[A.searchBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <MaterialIcons name="search" size={16} color={P.violetBr} />
        <TextInput
          style={[A.searchInput, { color: colors.text }]}
          placeholder="Search notes…"
          placeholderTextColor={colors.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats row */}
      <View style={[A.statsRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Corner pos="top-left"  color={P.violetBr} size={9} />
        <Corner pos="top-right" color={P.tealBr}   size={9} />

        {[
          { value: allNotes.length,                                      label: "Total",   color: P.violetBr },
          { value: allNotes.filter((n) => n.source === "firestore").length, label: "Cloud", color: P.tealBr   },
          { value: allNotes.filter((n) => n.source === "local").length,    label: "Local",  color: P.goldBr   },
        ].map(({ value, label, color }, i, arr) => (
          <React.Fragment key={label}>
            <View style={A.statCell}>
              <Text style={[A.statValue, { color }]}>{value}</Text>
              <Label color={colors.textDim}>{label}</Label>
            </View>
            {i < arr.length - 1 && (
              <View style={[A.statDivider, { backgroundColor: colors.border }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* Note list or empty state */}
      {filteredNotes.length === 0 ? (
        <View style={A.centeredBox}>
          <View style={[A.emptyOrb, { borderColor: colors.border }]}>
            <MaterialIcons name="library-music" size={28} color={colors.textMuted} />
          </View>
          <Text style={[A.emptyTitle, { color: colors.text }]}>
            {searchQuery ? "No matching notes" : "No Notes Yet"}
          </Text>
          <Text style={[A.emptySub, { color: colors.textMuted }]}>
            {searchQuery
              ? "Try a different search term."
              : "Record and organise a lecture to create audio notes."}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              onPress={() => navigation.navigate("RecordScreen")}
              style={[A.emptyBtn, { backgroundColor: P.violet, shadowColor: P.violet }]}
              activeOpacity={0.85}
            >
              <MaterialIcons name="mic" size={14} color="#fff" />
              <Text style={A.emptyBtnText}>Record Lecture</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => (
            <NoteCard item={item} colors={colors} onPress={() => selectNote(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: sp(1.5) }} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      )}
    </Animated.View>
  );

  // ════════════════════════════════════════════════════════════
  //  RENDER — PLAYER VIEW
  // ════════════════════════════════════════════════════════════

  const renderPlayer = () => {
    if (!selectedNote?.organizedNotes) return null;
    const notes       = selectedNote.organizedNotes;
    const accentColor = isPlaying && !isPaused ? P.ember : P.teal;
    const isActive    = isPlaying && !isPaused;

    return (
      <Animated.View style={{ opacity: masterOpa }}>

        {/* Back button */}
        <TouchableOpacity
          onPress={backToSelection}
          style={[A.backBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={16} color={colors.textSub} />
          <Label color={colors.textMuted}>Library</Label>
        </TouchableOpacity>

        {/* ── Player card ─────────────────────────────────── */}
        <Card colors={colors} accent={accentColor} style={A.playerCard}>
          <Corner pos="top-left"     color={P.violetBr} size={11} />
          <Corner pos="bottom-right" color={P.tealBr}   size={11} />

          {/* Lecture info */}
          <View style={{ width: "100%", marginBottom: sp(3) }}>
            <Text style={[A.playerTitle, { color: colors.text }]} numberOfLines={2}>
              {notes.title}
            </Text>
            <Text style={[A.playerSummary, { color: colors.textMuted }]} numberOfLines={2}>
              {notes.summary?.substring(0, 130)}
              {notes.summary?.length > 130 ? "…" : ""}
            </Text>
          </View>

          {/* Wave visualiser */}
          <View style={A.visualiser}>
            {waveAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  A.waveBar,
                  {
                    backgroundColor: isActive ? (i % 2 === 0 ? P.violetBr : P.tealBr) : colors.border,
                    transform: [{
                      scaleY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 1],
                      }),
                    }],
                  },
                ]}
              />
            ))}
          </View>

          {/* Progress bar (Cloud TTS only) */}
          {Platform.OS !== "web" && useCloudTTS && playbackDuration > 0 && (
            <View style={A.progressRow}>
              <Text style={[A.timeLabel, { color: colors.textDim }]}>
                {formatTime(playbackPosition)}
              </Text>
              <View style={[A.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    A.progressFill,
                    {
                      width: `${Math.min((playbackPosition / playbackDuration) * 100, 100)}%`,
                      backgroundColor: P.violetBr,
                    },
                  ]}
                />
              </View>
              <Text style={[A.timeLabel, { color: colors.textDim }]}>
                {formatTime(playbackDuration)}
              </Text>
            </View>
          )}

          {/* Play / pause orb */}
          <Animated.View style={{ transform: [{ scale: orbScale }], marginBottom: sp(3) }}>
            <TouchableOpacity
              onPress={isActive ? handlePause : handlePlay}
              disabled={generatingAudio ||  !canUse}
              activeOpacity={0.85}
              style={[
                A.playOrb,
                {
                  backgroundColor: isActive ? P.ember :canUse? P.violet : "#555",
                  shadowColor:     isActive ? P.ember : P.violet,
                  opacity: generatingAudio || !canUse ? 0.7 : 1,
                },
              ]}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                {generatingAudio ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) :!canUse ? (
                  <MaterialIcons name="lock" size={42} color="#fff" />
                ) : (
                  <MaterialIcons
                    name={isActive ? "pause" : "play-arrow"}
                    size={42}
                    color="#fff"
                  />
                )}
              </Animated.View>
              {/* I add a subtle shine ring to the orb for depth */}
              <View style={[A.playOrbRing, { borderColor: P.wa(0.18) }]} />
            </TouchableOpacity>
          </Animated.View>

          {/* Secondary controls */}
          <View style={A.secondaryControls}>
            {/* Stop */}
            <TouchableOpacity
              onPress={handleStop}
              disabled={!isPlaying}
              style={[
                A.controlBtn,
                { backgroundColor: colors.bgInput, borderColor: colors.border, opacity: isPlaying ? 1 : 0.38 },
              ]}
              activeOpacity={0.75}
            >
              <MaterialIcons name="stop" size={20} color={colors.textSub} />
            </TouchableOpacity>

            {/* Speed */}
            <TouchableOpacity
              onPress={changePlaybackSpeed}
              style={[A.controlBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
              activeOpacity={0.75}
            >
              <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: "700", color: P.violetBr }}>
                {playbackSpeed}×
              </Text>
            </TouchableOpacity>
          </View>

          {/* Status chip */}
          <View style={{ marginTop: sp(1.5) }}>
            <Pill
              label={
                generatingAudio ? "Generating…" :
                isPlaying && isPaused ? "Paused" :
                isPlaying ? "Playing" : "Ready"
              }
              color={
                generatingAudio ? P.gold :
                isPlaying && isPaused ? P.ember :
                isPlaying ? P.success : colors.textDim
              }
              icon={
                generatingAudio ? "hourglass-empty" :
                isPlaying && isPaused ? "pause-circle-outline" :
                isPlaying ? "graphic-eq" : "radio-button-unchecked"
              }
            />
          </View>
        </Card>

        {/* ── Audio Content selector ───────────────────────── */}
        <Card colors={colors} style={{ marginBottom: sp(2) }}>
          <View style={A.sectionHeader}>
            <View style={[A.sectionIconBox, { backgroundColor: P.va(0.13) }]}>
              <MaterialIcons name="tune" size={15} color={P.violetBr} />
            </View>
            <Text style={[A.sectionTitle, { color: colors.text }]}>Audio Content</Text>
          </View>

          <View style={{ gap: sp(1.5) }}>
            {[
              { key: "summary",   icon: "notes",    label: "Summary",    time: "~2 min" },
              { key: "keypoints", icon: "star",     label: "Key Points", time: "~3 min" },
              { key: "full",      icon: "article",  label: "Full Notes", time: "~5 min" },
            ].map(({ key, icon, label, time }) => {
              const active = audioFormat === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={async () => {
                    haptics.impact?.("Light");
                    setAudioFormat(key);
                    if (isPlaying) handleStop();
                  }}
                  style={[
                    A.formatRow,
                    {
                      backgroundColor: active ? P.va(0.1) : colors.bgInput,
                      borderColor:     active ? P.va(0.3) : colors.border,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <View style={[A.formatIconBox, { backgroundColor: active ? P.va(0.2) : colors.bgCard }]}>
                    <MaterialIcons name={icon} size={15} color={active ? P.violetBr : colors.textMuted} />
                  </View>
                  <Text style={[A.formatLabel, { color: active ? P.violetBr : colors.textSub }]}>{label}</Text>
                  <Label color={active ? P.violetBr : colors.textDim}>{time}</Label>
                  {active && <View style={[A.formatActiveDot, { backgroundColor: P.violetBr }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* ── Voice selector (Web) ─────────────────────────── */}
        {Platform.OS === "web" && (
          <Card colors={colors} style={{ marginBottom: sp(2) }}>
            <View style={A.sectionHeader}>
              <View style={[A.sectionIconBox, { backgroundColor: P.ta(0.12) }]}>
                <MaterialIcons name="record-voice-over" size={15} color={P.tealBr} />
              </View>
              <Text style={[A.sectionTitle, { color: colors.text }]}>Voice Style</Text>
            </View>
            <View style={{ flexDirection: "row", gap: sp(1.5) }}>
              {["default", "female", "male"].map((v) => {
                const active = selectedVoice === v;
                return (
                  <TouchableOpacity
                    key={v}
                    onPress={async () => { haptics.impact?.("Light"); setSelectedVoice(v); if (isPlaying) handleStop(); }}
                    style={[
                      A.voiceBtn,
                      {
                        backgroundColor: active ? P.ta(0.12) : colors.bgInput,
                        borderColor:     active ? P.ta(0.3)  : colors.border,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons
                      name={v === "female" ? "person" : v === "male" ? "person-outline" : "person-search"}
                      size={16}
                      color={active ? P.tealBr : colors.textMuted}
                    />
                    <Text style={[A.voiceBtnText, { color: active ? P.tealBr : colors.textSub }]}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        )}

        {/* ── TTS Mode toggle (native only) ────────────────── */}
        {Platform.OS !== "web" && (
          <Card colors={colors} style={{ marginBottom: sp(2) }}>
            <View style={A.sectionHeader}>
              <View style={[A.sectionIconBox, { backgroundColor: P.ga(0.12) }]}>
                <MaterialIcons name="cloud-queue" size={15} color={P.goldBr} />
              </View>
              <Text style={[A.sectionTitle, { color: colors.text }]}>TTS Mode</Text>
            </View>
            <TouchableOpacity
              onPress={toggleTTSMode}
              style={[A.ttsToggle, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
              activeOpacity={0.75}
            >
              <View style={[A.ttsIconWrap, { backgroundColor: useCloudTTS ? P.sa(0.14) : P.va(0.14) }]}>
                <MaterialIcons
                  name={useCloudTTS ? "cloud" : "phone-android"}
                  size={18}
                  color={useCloudTTS ? P.successBr : P.violetBr}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[A.ttsTitle, { color: colors.text }]}>
                  {useCloudTTS ? "Cloud TTS" : "Device TTS"}
                </Text>
                <Text style={[A.ttsSub, { color: colors.textMuted }]}>
                  {useCloudTTS ? "High quality — Google voices" : "Native device voices"}
                </Text>
              </View>
              <View style={[A.ttsChevron, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <MaterialIcons name="swap-horiz" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        )}

        {/* ── Info notice ──────────────────────────────────── */}
        <View style={[A.noticeRow, { backgroundColor: P.sa(0.1), borderColor: P.sa(0.22) }]}>
          <MaterialIcons name="info-outline" size={15} color={P.successBr} />
          <Text style={[A.noticeText, { color: colors.textSub }]}>
            {Platform.OS === "web"
              ? "I'm using browser text-to-speech for audio playback."
              : useCloudTTS
              ? "I'm using Google Cloud TTS for premium audio quality."
              : "I'm using device TTS. Switch to Cloud TTS for richer voices."}
          </Text>
        </View>

      </Animated.View>
    );
  };

  // ════════════════════════════════════════════════════════════
  //  MAIN RETURN
  // ════════════════════════════════════════════════════════════

  return (
    <View style={[A.root, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* ── Top bar ──────────────────────────────────────────── */}
      <View
        style={[
          A.navbar,
          {
            backgroundColor: colors.scrim,
            borderBottomColor: colors.border,
            paddingTop: padTop,
          },
        ]}
      >
        {/* Left: back from player or spacer */}
        {viewMode === "player" ? (
          <TouchableOpacity
            onPress={backToSelection}
            style={[A.iconBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={17} color={colors.textSub} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}

        {/* Centre: title */}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Label color={colors.textDim} style={{ marginBottom: 4 }}>— NoteTedd</Label>
          <Text style={[A.navTitle, { color: colors.text }]}>
            {viewMode === "selection" ? "Audio Library" : "Now Playing"}
          </Text>
        </View>

        {/* Right: headphone icon badge */}
        <View style={[A.iconBtn, { backgroundColor: P.va(0.13), borderColor: P.va(0.22) }]}>
          <MaterialIcons name="headphones" size={17} color={P.violetBr} />
        </View>
      </View>

      {/* ── Scrollable content ──────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: padH,
          paddingTop:        sp(3),
          paddingBottom:     sp(14),
        }}
      >
        {loading ? (
          <View style={[A.centeredBox, { paddingTop: sp(10) }]}>
            <View style={[A.emptyOrb, { borderColor: P.va(0.25), backgroundColor: P.va(0.1) }]}>
              <MaterialIcons name="headphones" size={26} color={P.violetBr} />
            </View>
            <Label color={P.violetBr} style={{ marginTop: 20, marginBottom: 6, letterSpacing: 5 }}>
              Loading
            </Label>
            <Text style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", color: colors.text, textAlign: "center" }}>
              Your{" "}
              <Text style={{ fontStyle: "italic", color: P.violetBr }}>audio library</Text>
            </Text>
            <ActivityIndicator color={P.violetBr} style={{ marginTop: sp(3) }} />
          </View>
        ) : viewMode === "selection" ? (
          renderLibrary()
        ) : (
          renderPlayer()
        )}
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
//  I keep all style definitions here so they compile once and
//  hot-reload correctly across the full file.
// ════════════════════════════════════════════════════════════════

const A = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────
  root:           { flex: 1 },

  // ── Navbar ────────────────────────────────────────────────────
  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:       { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  iconBtn:        { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // ── Card ──────────────────────────────────────────────────────
  card:           { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },

  // ── Search bar ────────────────────────────────────────────────
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 16,
    paddingHorizontal: sp(2), paddingVertical: sp(1.5),
    marginBottom: sp(2),
  },
  searchInput:    { flex: 1, fontFamily: SANS, fontSize: 14 },

  // ── Stats row ─────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    paddingVertical: sp(2.5), paddingHorizontal: sp(2),
    marginBottom: sp(3), position: "relative", overflow: "hidden",
  },
  statCell:       { flex: 1, alignItems: "center", gap: 4 },
  statValue:      { fontFamily: DISPLAY, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  statDivider:    { width: 1, height: "60%", alignSelf: "center" },

  // ── Note card ─────────────────────────────────────────────────
  noteCard: {
    borderRadius: 18, borderWidth: 1,
    padding: sp(2.25), position: "relative", overflow: "hidden",
  },
  noteCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: sp(1.25) },
  noteIconWrap:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  noteCardTitle:  { fontFamily: DISPLAY, fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  noteCardSummary:{ fontFamily: SANS, fontSize: 12, lineHeight: 18, marginBottom: sp(1.5) },
  noteCardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // ── Player card ───────────────────────────────────────────────
  playerCard:     { borderRadius: 22, borderWidth: 1, padding: sp(3), alignItems: "center", marginBottom: sp(2.5), position: "relative", overflow: "hidden" },
  playerTitle:    { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: -0.5, marginBottom: 8, lineHeight: 26 },
  playerSummary:  { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20 },

  // ── Visualiser ────────────────────────────────────────────────
  visualiser: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", height: 56,
    gap: 5, marginVertical: sp(3), width: "80%",
  },
  waveBar:        { width: 5, height: 44, borderRadius: 3 },

  // ── Progress ──────────────────────────────────────────────────
  progressRow:    { flexDirection: "row", alignItems: "center", gap: 10, width: "100%", marginBottom: sp(2.5) },
  progressTrack:  { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill:   { height: "100%", borderRadius: 2 },
  timeLabel:      { fontFamily: MONO, fontSize: 9, letterSpacing: 1 },

  // ── Play orb ──────────────────────────────────────────────────
  playOrb: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 20, elevation: 14,
    position: "relative",
  },
  playOrbRing: {
    position: "absolute", top: 4, left: 4, right: 4, bottom: 4,
    borderRadius: 41, borderWidth: 1.5,
  },

  // ── Secondary controls ────────────────────────────────────────
  secondaryControls: { flexDirection: "row", gap: 16, marginTop: sp(0.5) },
  controlBtn: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  // ── Back button ───────────────────────────────────────────────
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: sp(1.75), paddingVertical: sp(1),
    marginBottom: sp(2.5),
  },

  // ── Section header ────────────────────────────────────────────
  sectionHeader:  { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: sp(2) },
  sectionIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle:   { flex: 1, fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },

  // ── Format rows ───────────────────────────────────────────────
  formatRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 14, padding: sp(1.75),
    position: "relative", overflow: "hidden",
  },
  formatIconBox:  { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  formatLabel:    { flex: 1, fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  formatActiveDot:{ position: "absolute", right: sp(1.5), top: "50%", width: 5, height: 5, borderRadius: 2.5, marginTop: -2.5 },

  // ── Voice buttons ─────────────────────────────────────────────
  voiceBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderWidth: 1, borderRadius: 13, paddingVertical: sp(1.5),
  },
  voiceBtnText:   { fontFamily: SANS, fontSize: 12, fontWeight: "600" },

  // ── TTS toggle ────────────────────────────────────────────────
  ttsToggle:      { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 14, padding: sp(2) },
  ttsIconWrap:    { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ttsTitle:       { fontFamily: SANS, fontSize: 14, fontWeight: "700" },
  ttsSub:         { fontFamily: SANS, fontSize: 12, marginTop: 2 },
  ttsChevron:     { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // ── Notice row ────────────────────────────────────────────────
  noticeRow: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    borderWidth: 1, borderRadius: 14, padding: sp(2),
    marginBottom: sp(2),
  },
  noticeText:     { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 18 },

  // ── Empty / loading states ────────────────────────────────────
  centeredBox:    { alignItems: "center", paddingVertical: sp(6) },
  emptyOrb:       { width: 74, height: 74, borderRadius: 37, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2) },
  emptyTitle:     { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", marginBottom: 6, letterSpacing: -0.3 },
  emptySub:       { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: sp(3), marginBottom: sp(3) },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: sp(3), paddingVertical: sp(1.75),
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },
  emptyBtnText:   { fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },
});