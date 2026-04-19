import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, getFirestore,
  orderBy, query, updateDoc, where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Clipboard, FlatList, Modal,
  Platform, RefreshControl, ScrollView, Share,
  StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, useWindowDimensions, View,
} from "react-native";
import {MaterialIcons} from "@expo/vector-icons";
import { useTheme } from "./context/ThemeContext";
import haptics from "./utils/haptics";
import { logUserActivity } from "./utils/userActivity";

// ─── API Configuration ────────────────────────────────────────────────────────
// Keys are read from environment variables — see security guide above.
const GROQ_KEY   = process.env.EXPO_PUBLIC_GROQ_API_KEY   ?? "";
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";

// ─── Client-side Rate Limiter ─────────────────────────────────────────────────
// Persists call history in AsyncStorage across app restarts.
// Always pair with server-side enforcement.
class RateLimiter {
  constructor(key, maxCalls, windowMs) {
    this.storageKey = `rl_${key}`;
    this.maxCalls   = maxCalls;
    this.windowMs   = windowMs;
  }
  async check() {
    try {
      const raw  = await AsyncStorage.getItem(this.storageKey);
      const now  = Date.now();
      const prev = raw ? JSON.parse(raw).filter((t) => now - t < this.windowMs) : [];
      if (prev.length >= this.maxCalls) {
        const retryMs = this.windowMs - (now - prev[0]);
        throw new Error(`Rate limit reached. Try again in ${Math.ceil(retryMs / 60000)} min.`);
      }
      prev.push(now);
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(prev));
      return true;
    } catch (e) {
      if (e.message.startsWith("Rate limit")) throw e;
      return true; // fail open on storage errors
    }
  }
}

// 20 AI calls per hour per device
const aiRateLimiter = new RateLimiter("ai_calls", 20, 3600000);

// ─── Cache helpers ────────────────────────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const getCached = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(`cache_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const setCache = async (key, data) => {
  try {
    await AsyncStorage.setItem(`cache_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
};

// ─── Design System ────────────────────────────────────────────────────────────
const DISPLAY = Platform.OS === "ios" ? "Georgia"        : "serif";
const SANS    = Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif";
const MONO    = Platform.OS === "ios" ? "Menlo"          : "monospace";

const BASE = 8;
const sp   = (n) => BASE * n;

const palette = {
  violet:      "#6c2fff",
  violetMid:   "#8b5cf6",
  violetLight: "#a78bfa",
  vs: (a = 0.12) => `rgba(108,47,255,${a})`,

  ember:       "#f95a2c",
  es: (a = 0.12) => `rgba(249,90,44,${a})`,

  teal:        "#14b8a6",
  ts: (a = 0.12) => `rgba(20,184,166,${a})`,

  gold:        "#eab308",
  gs: (a = 0.12) => `rgba(234,179,8,${a})`,

  rose:        "#f43f5e",
  rs: (a = 0.12) => `rgba(244,63,94,${a})`,

  success:     "#10b981",
  warning:     "#f59e0b",
  danger:      "#ef4444",

  dark: {
    bg:        "#060608",
    bgEl:      "#0c0c12",
    bgCard:    "#0f0f18",
    bgInput:   "#12121e",
    border:    "rgba(255,255,255,0.08)",
    borderMid: "rgba(255,255,255,0.14)",
    text:      "#f0eeff",
    textSub:   "rgba(240,238,255,0.65)",
    textMuted: "rgba(215, 213, 226, 0.9)38)",
    textDim:   "rgba(197, 195, 205, 0.58)",
    overlay:   "rgba(6,6,8,0.96)",
  },
  light: {
    bg:        "#f7f6ff",
    bgEl:      "#ffffff",
    bgCard:    "#ffffff",
    bgInput:   "#f0eeff",
    border:    "rgba(108,47,255,0.09)",
    borderMid: "rgba(108,47,255,0.2)",
    text:      "#140d2b",
    textSub:   "rgba(20,13,43,0.65)",
    textMuted: "rgba(20,13,43,0.42)",
    textDim:   "rgba(20,13,43,0.22)",
    overlay:   "rgba(247,246,255,0.96)",
  },
};

const useC = (isDark) => (isDark ? palette.dark : palette.light);

// Field accent map
const FIELD_MAP = {
  medical:     { color: palette.rose,    icon: "science",      label: "Medical / Biology" },
  engineering: { color: palette.violet,  icon: "engineering",  label: "Engineering / Math" },
  finance:     { color: palette.gold,    icon: "attach-money", label: "Finance" },
  law:         { color: palette.danger,  icon: "gavel",        label: "Law" },
  general:     { color: palette.teal,    icon: "school",       label: "General" },
};

// Flashcard gradient map
const CARD_GRADIENTS = {
  definition: [palette.violetMid, palette.violet],
  formula:    ["#7c3aed", "#5b21b6"],
  chemistry:  ["#db2777", "#be185d"],
  law:        [palette.danger, "#b91c1c"],
  question:   [palette.warning, "#b45309"],
  keypoint:   [palette.success, "#047857"],
};

// ─── Tiny atoms ───────────────────────────────────────────────────────────────
const Label = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 3.2, textTransform: "uppercase", color }, style]}>
    {children}
  </Text>
);

const Corner = ({ pos, color, size = 12 }) => {
  const s = { position: "absolute" };
  if (pos.includes("top"))  s.top    = 0; else s.bottom = 0;
  if (pos.includes("left")) s.left   = 0; else s.right  = 0;
  const isB = pos.includes("bottom"), isR = pos.includes("right");
  return (
    <View style={[s, { width: size, height: size }]} pointerEvents="none">
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: size,  height: 1.5, backgroundColor: color, opacity: 0.6 }} />
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: 1.5, height: size,  backgroundColor: color, opacity: 0.6 }} />
    </View>
  );
};

const Divider = ({ colors, mx = 0 }) => (
  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: mx }} />
);

const Pill = ({ label, color, icon, style }) => (
  <View style={[{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${color}16`, borderWidth: 1, borderColor: `${color}30` }, style]}>
    {icon && <MaterialIcons name={icon} size={11} color={color} />}
    <Label color={color}>{label}</Label>
  </View>
);

// ─── Section Card wrapper ─────────────────────────────────────────────────────
const Card = ({ children, colors, accent, style }) => (
  <View style={[cs.card, { backgroundColor: colors.bgCard, borderColor: accent ? `${accent}22` : colors.border }, style]}>
    {accent && <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.03, borderRadius: 20 }} />}
    {children}
  </View>
);

// ─── Expandable section ───────────────────────────────────────────────────────
const ExpandableSection = ({ title, icon, color, colors, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const rot = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const ht  = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    const toVal = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(rot, { toValue: toVal, useNativeDriver: true }),
      Animated.timing(ht,  { toValue: toVal, duration: 260, useNativeDriver: false }),
    ]).start();
    setOpen(!open);
    haptics.impact?.("Light");
  };

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Card colors={colors} accent={color} style={{ marginBottom: sp(1.5) }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={cs.sectionHeader}>
        <View style={[cs.sectionIconWrap, { backgroundColor: `${color}16` }]}>
          <MaterialIcons name={icon} size={17} color={color} />
        </View>
        <Text style={[cs.sectionTitle, { color: colors.text }]}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={{ paddingTop: 4 }}>{children}</View>}
    </Card>
  );
};

// ─── Key point item ───────────────────────────────────────────────────────────
const KPItem = ({ n, text, colors }) => (
  <View style={cs.kpRow}>
    <View style={[cs.kpNum, { backgroundColor: palette.vs(0.14) }]}>
      <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: "700", color: palette.violet }}>{n}</Text>
    </View>
    <Text style={[cs.kpText, { color: colors.textSub }]}>{text}</Text>
  </View>
);

// ─── Definition item ──────────────────────────────────────────────────────────
const DefItem = ({ term, def, colors, last }) => (
  <View style={[cs.defItem, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
    <Text style={[cs.defTerm, { color: colors.text }]}>{term}</Text>
    <Text style={[cs.defText, { color: colors.textSub }]}>{def}</Text>
  </View>
);

// ─── Formula item ─────────────────────────────────────────────────────────────
const FormulaItem = ({ formula, colors }) => (
  <View style={[cs.formulaItem, { backgroundColor: palette.vs(0.07), borderColor: palette.vs(0.18) }]}>
    <Text style={[cs.formulaName, { color: palette.violetLight }]}>{formula.name}</Text>
    <View style={[cs.formulaBox, { backgroundColor: colors.bgInput, borderColor: palette.vs(0.2) }]}>
      <Text style={{ fontFamily: MONO, fontSize: 15, color: palette.violetMid, letterSpacing: 0.5 }}>{formula.formula}</Text>
    </View>
    {formula.variables && Object.keys(formula.variables).length > 0 && (
      <View style={{ gap: 2, marginBottom: 6 }}>
        {Object.entries(formula.variables).map(([v, d]) => (
          <Text key={v} style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted }}>
            <Text style={{ color: palette.violetLight, fontWeight: "700" }}>{v}</Text>
            {" — "}{d}
          </Text>
        ))}
      </View>
    )}
    {formula.applications && <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>Use: {formula.applications}</Text>}
    {formula.derivation && <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textDim, lineHeight: 18, marginTop: 3 }}>Derivation: {formula.derivation}</Text>}
  </View>
);

// ─── Chemistry item ───────────────────────────────────────────────────────────
const ChemItem = ({ eq, colors }) => (
  <View style={[cs.chemItem, { backgroundColor: palette.rs(0.07), borderColor: palette.rs(0.18) }]}>
    <Text style={{ fontFamily: MONO, fontSize: 15, color: palette.rose, marginBottom: 8, letterSpacing: 0.5 }}>{eq.reaction}</Text>
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
      <Pill label={eq.reactionType} color={palette.rose} />
    </View>
    <Text style={{ fontFamily: SANS, fontSize: 13, color: colors.textSub, lineHeight: 20 }}>{eq.explanation}</Text>
    {eq.conditions && <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Conditions: {eq.conditions}</Text>}
    {eq.applications && <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Applications: {eq.applications}</Text>}
  </View>
);

// ─── Case Law item ────────────────────────────────────────────────────────────
const CaseItem = ({ caseData, colors }) => (
  <View style={[cs.caseItem, { backgroundColor: palette.rs(0.05), borderColor: palette.rs(0.15) }]}>
    <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", color: palette.danger, marginBottom: 10 }}>{caseData.caseName}</Text>
    {[
      { label: "Facts",       value: caseData.facts },
      { label: "Issue",       value: caseData.issue },
      { label: "Holding",     value: caseData.holding },
      { label: "Reasoning",   value: caseData.reasoning },
    ].map(({ label, value }) => value ? (
      <View key={label} style={{ marginBottom: 8 }}>
        <Label color={palette.danger} style={{ marginBottom: 3 }}>{label}</Label>
        <Text style={{ fontFamily: SANS, fontSize: 13, color: colors.textSub, lineHeight: 20 }}>{value}</Text>
      </View>
    ) : null)}
    {caseData.significance && (
      <View style={[cs.significance, { backgroundColor: palette.gs(0.15), borderColor: palette.gs(0.3) }]}>
        <MaterialIcons name="star" size={14} color={palette.gold} />
        <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12, color: colors.textSub, lineHeight: 18 }}>{caseData.significance}</Text>
      </View>
    )}
  </View>
);

// ─── Calculation item ─────────────────────────────────────────────────────────
const CalcItem = ({ calc, colors }) => (
  <View style={[cs.calcItem, { backgroundColor: palette.gs(0.07), borderColor: palette.gs(0.2) }]}>
    <Text style={{ fontFamily: SANS, fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8 }}>{calc.problem}</Text>
    {calc.formula && <Text style={{ fontFamily: MONO, fontSize: 13, color: palette.gold, marginBottom: 8 }}>{calc.formula}</Text>}
    {calc.steps?.length > 0 && (
      <View style={{ gap: 3, marginBottom: 8 }}>
        {calc.steps.map((step, i) => (
          <Text key={i} style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted }}>
            <Text style={{ color: palette.gold, fontWeight: "700" }}>{i + 1}.</Text> {step}
          </Text>
        ))}
      </View>
    )}
    <View style={[cs.solutionRow, { backgroundColor: palette.gs(0.15), borderColor: palette.gs(0.3) }]}>
      <MaterialIcons name="check-circle" size={16} color={palette.success} />
      <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: "700", color: palette.success }}>{calc.solution}</Text>
    </View>
  </View>
);

// ─── Question item ────────────────────────────────────────────────────────────
const QItem = ({ n, question, colors }) => (
  <View style={cs.qRow}>
    <View style={[cs.qBadge, { backgroundColor: palette.rs(0.14) }]}>
      <Text style={{ fontFamily: MONO, fontSize: 9, fontWeight: "700", color: palette.rose }}>Q{n}</Text>
    </View>
    <Text style={[cs.qText, { color: colors.textSub }]}>{question}</Text>
  </View>
);

// ─── Lecture list row ─────────────────────────────────────────────────────────
const LectureRow = ({ item, onPress, colors }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPressIn={onIn} onPressOut={onOut} onPress={onPress} activeOpacity={1}>
        <View style={[cs.lectureRow, { backgroundColor: colors.bgCard, borderColor: `${item.color}20` }]}>
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: item.color, opacity: 0.04, borderRadius: 18 }} />
          <Corner pos="top-left"     color={item.color} size={10} />
          <Corner pos="bottom-right" color={item.color} size={10} />
          <View style={[cs.lectureIcon, { backgroundColor: `${item.color}18` }]}>
            <MaterialIcons name="auto-stories" size={22} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[cs.lectureTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[cs.lecturePreview, { color: colors.textMuted }]} numberOfLines={2}>{item.preview}</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="schedule" size={12} color={colors.textDim} />
                <Label color={colors.textDim}>{item.duration}m</Label>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="calendar-today" size={12} color={colors.textDim} />
                <Label color={colors.textDim}>{item.timeAgo}</Label>
              </View>
              {item.hasNotes && <Pill label="Organized" color={palette.success} icon="check-circle" />}
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.textDim} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════
export default function EnhancedNotesScreen({ navigation, route }) {
  const { theme } = useTheme();
  const isDark    = theme === "dark";
  const colors    = useC(isDark);
  const { width: W } = useWindowDimensions();
  const isTablet  = W >= 768;
  const padH      = isTablet ? sp(5) : sp(3);

  const lectureIdFromRoute   = route?.params?.lectureId;
  const lectureDataFromRoute = route?.params?.lectureData;

  // ── Core state ──────────────────────────────────────────────────
  const [notes,              setNotes]              = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [refreshing,         setRefreshing]         = useState(false);
  const [rawTranscription,   setRawTranscription]   = useState("");
  const [currentRecordingId, setCurrentRecordingId] = useState(null);
  const [error,              setError]              = useState("");
  const [isRegenerating,     setIsRegenerating]     = useState(false);
  const [expandedSections,   setExpandedSections]   = useState({});
  const [dataSource,         setDataSource]         = useState("");
  const [aiProvider,         setAiProvider]         = useState("");
  const [viewMode,           setViewMode]           = useState("organized");
  const [academicField,      setAcademicField]      = useState("general");
  const [showFormulas,       setShowFormulas]       = useState(true);
  const [showChemistry,      setShowChemistry]      = useState(true);
  const [showCaseLaw,        setShowCaseLaw]        = useState(true);
  const [showCalculations,   setShowCalculations]   = useState(true);
  const [showRelatedTopics,  setShowRelatedTopics]  = useState(true);

  // ── Lecture list ────────────────────────────────────────────────
  const [showLectureList,   setShowLectureList]   = useState(false);
  const [allLectures,       setAllLectures]       = useState([]);
  const [loadingLectures,   setLoadingLectures]   = useState(false);

  // ── Features ────────────────────────────────────────────────────
  const [searchQuery,          setSearchQuery]          = useState("");
  const [searchResults,        setSearchResults]        = useState([]);
  const [showSearch,           setShowSearch]           = useState(false);
  const [activeTab,            setActiveTab]            = useState("notes");
  const [flashcards,           setFlashcards]           = useState([]);
  const [currentFlashcard,     setCurrentFlashcard]     = useState(0);
  const [showFlashcardAnswer,  setShowFlashcardAnswer]  = useState(false);
  const [editedNotes,          setEditedNotes]          = useState(null);
  const [generatingDiagram,    setGeneratingDiagram]    = useState(false);
  const [generatedDiagram,     setGeneratedDiagram]     = useState(null);
  const [showDiagramModal,     setShowDiagramModal]     = useState(false);
  const [showSearchModal,      setShowSearchModal]      = useState(false);

  const auth        = getAuth();
  const db          = getFirestore();
  const readStartRef = useRef(null);

  // ── Animations ──────────────────────────────────────────────────
  const masterOpa = useRef(new Animated.Value(0)).current;
  const heroY     = useRef(new Animated.Value(24)).current;

  // ── Effects ─────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroY,     { toValue: 0, tension: 45, friction: 10, useNativeDriver: true }),
    ]).start();

    if (lectureIdFromRoute) {
      loadSpecificLecture(lectureIdFromRoute, lectureDataFromRoute);
    } else {
      loadAllUserLectures();
    }
  }, [lectureIdFromRoute, route?.params?.refresh]);

  useEffect(() => {
    if (notes) {
      setAcademicField(detectAcademicField(notes));
      generateFlashcards(notes);
      setEditedNotes(notes);
    }
  }, [notes]);

  // Read-time tracking
  useEffect(() => {
    if (notes) readStartRef.current = Date.now();
    return () => {
      try {
        if (!readStartRef.current) return;
        const elapsed = Date.now() - readStartRef.current;
        if (elapsed >= 10 * 60 * 1000 && auth.currentUser) {
          logUserActivity(db, auth.currentUser.uid, "note_read", {
            recordingId: currentRecordingId, durationMs: elapsed,
          });
        }
      } catch {}
      readStartRef.current = null;
    };
  }, [notes]);

  // ── Academic field detection (unchanged logic) ──────────────────
  function detectAcademicField(n) {
    if (!n) return "general";
    if (n.chemicalEquations?.length > 0) return "medical";
    if ((n.formulas?.length > 0 || n.calculations?.length > 0)) {
      if (n.formulas?.some((f) => /finance|interest|roi|market|investment/i.test(f.name + f.applications))) return "finance";
      return "engineering";
    }
    if (n.caseLaw?.length > 0) return "law";
    return "general";
  }

  // ── Load specific lecture ───────────────────────────────────────
  const loadSpecificLecture = async (lectureId, lectureData = null) => {
    try {
      setLoading(true); setError("");
      const user = auth.currentUser;
      if (!user) { Alert.alert("Error", "Please sign in."); setLoading(false); return; }

      if (lectureData) {
        setCurrentRecordingId(lectureId);
        setRawTranscription(lectureData.transcription || "");
        if (lectureData.organizedNotes) {
          setNotes(lectureData.organizedNotes);
          setAiProvider(lectureData.organizedNotes.aiProvider || "cached");
          setDataSource("firestore");
        } else if (lectureData.transcription) {
          await refineWithAI(lectureData.transcription, lectureId);
        }
        setLoading(false);
        return;
      }

      // Try cache first
      const cached = await getCached(`lecture_${lectureId}`);
      if (cached) {
        setCurrentRecordingId(lectureId);
        setRawTranscription(cached.transcription || "");
        if (cached.organizedNotes) {
          setNotes(cached.organizedNotes);
          setAiProvider(cached.organizedNotes.aiProvider || "cached");
          setDataSource("cache");
          setLoading(false);
          return;
        }
      }

      const lectureRef = doc(db, "recordings", lectureId);
      const lectureDoc = await getDoc(lectureRef);
      if (!lectureDoc.exists()) throw new Error("Lecture not found");
      const data = lectureDoc.data();
      if (data.userId !== user.uid) throw new Error("Access denied.");

      await setCache(`lecture_${lectureId}`, data);

      setCurrentRecordingId(lectureId);
      setRawTranscription(data.transcription || "");
      if (data.organizedNotes) {
        setNotes(data.organizedNotes);
        setAiProvider(data.organizedNotes.aiProvider || "cached");
      } else if (data.transcription) {
        await refineWithAI(data.transcription, lectureId);
      }
      setDataSource("firestore");
    } catch (err) {
      setError(err.message);
      Alert.alert("Error", err.message);
    } finally { setLoading(false); }
  };

  // ── Load all lectures ───────────────────────────────────────────
  const loadAllUserLectures = async () => {
    try {
      setLoadingLectures(true);
      const user = auth.currentUser;
      if (!user) { setShowLectureList(true); setLoadingLectures(false); setLoading(false); return; }

      const snap = await getDocs(query(
        collection(db, "recordings"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
      ));

      const cols = [palette.violet, palette.teal, palette.rose, palette.gold, palette.success, palette.danger, palette.ember];
      const lectures = [];
      snap.forEach((d, i) => {
        const data = d.data();
        const createdAt = data.createdAt?.toDate() || new Date();
        lectures.push({
          id: d.id,
          title:    data.organizedNotes?.title || data.title || "Untitled Lecture",
          date:     createdAt.toLocaleDateString(),
          timeAgo:  getTimeAgo(createdAt),
          duration: data.duration ? Math.round(data.duration / 60) : 30,
          hasNotes: !!data.organizedNotes,
          color:    cols[lectures.length % cols.length],
          preview:  data.organizedNotes?.summary?.substring(0, 100) || data.transcription?.substring(0, 100) || "No preview",
        });
      });
      setAllLectures(lectures);
      setShowLectureList(true);
    } catch (err) { console.error(err); }
    finally { setLoadingLectures(false); setLoading(false); }
  };

  const handleLectureSelection = async (lecture) => {
    setShowLectureList(false);
    await loadSpecificLecture(lecture.id);
  };

  const getTimeAgo = (date) => {
    const diff  = Date.now() - date;
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (hours < 1)  return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7)   return `${days}d ago`;
    if (days < 30)  return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
  };

  // ── AI refinement ───────────────────────────────────────────────
  const refineWithAI = async (transcription, recordingId = null) => {
    if (!transcription || transcription.trim().length < 10) {
      throw new Error("Transcription too short.");
    }

    // Client-side rate limit check
    await aiRateLimiter.check();

    let organized = null, provider = "";

    if (GROQ_KEY?.length > 10) {
      try { organized = await refineWithGroq(transcription); provider = "Groq"; }
      catch (e) { console.warn("Groq failed:", e.message); }
    }
    if (!organized && GEMINI_KEY?.length > 10) {
      try { organized = await refineWithGemini(transcription); provider = "Gemini"; }
      catch (e) { console.warn("Gemini failed:", e.message); }
    }
    if (!organized) { organized = createFallbackNotes(transcription); provider = "Fallback"; }

    organized.aiProvider = provider;
    setNotes(organized);
    setAiProvider(provider);
    await saveOrganizedNotes(organized, recordingId);
    await haptics.notification?.("Success");
  };

  const refineWithGroq = async (transcription) => {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: `You are an expert note-taking assistant. Return ONLY valid JSON with no markdown.` },
          { role: "user", content: buildPrompt(transcription) },
        ],
        temperature: 0.7, max_tokens: 4096,
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Groq ${res.status}`); }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  };

  const refineWithGemini = async (transcription) => {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(transcription) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Gemini ${res.status}`); }
    const data = await res.json();
    return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  };

  const buildPrompt = (transcription) => `Transform this lecture transcription into structured JSON study notes.
Return ONLY valid JSON (no markdown). Structure:
{
  "title":"...", "summary":"...","fullTranscript":"...","organizedSummary":"...",
  "keyPoints":["..."],"sections":[{"title":"...","content":"...","subtopics":[]}],
  "definitions":{"Term":"def"},"calculations":[{"problem":"...","solution":"...","steps":[],"formula":"...","variables":{}}],
  "chemicalEquations":[{"reaction":"...","reactionType":"...","explanation":"...","conditions":"...","applications":"..."}],
  "formulas":[{"name":"...","formula":"...","variables":{},"applications":"...","derivation":"..."}],
  "caseLaw":[{"caseName":"...","facts":"...","issue":"...","holding":"...","reasoning":"...","significance":"..."}],
  "relatedTopics":["..."],"studyTips":["..."],"mnemonics":["..."],"questions":["..."]
}
Transcription:\n${transcription}`;

  const createFallbackNotes = (transcription) => {
    const clean = transcription.replace(/\b(um|uh|like|you know)\b/gi, "").replace(/\s+/g, " ").trim();
    const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 15);
    return {
      title: "Lecture Notes — " + new Date().toLocaleDateString(),
      summary: sentences.slice(0, 3).join(". ").substring(0, 250) + "...",
      keyPoints: sentences.slice(0, 7).map((s) => s.trim()).filter(Boolean),
      sections: [{ title: "Main Content", content: clean.substring(0, 1000), subtopics: [] }],
      definitions: {},
      questions: ["What are the main topics?", "What are the key takeaways?", "How does this relate to prior material?"],
      calculations: [], relatedTopics: [],
    };
  };

  const saveOrganizedNotes = async (organized, recordingId) => {
    await AsyncStorage.setItem("organizedNotes", JSON.stringify(organized));
    if (recordingId) {
      try {
        await updateDoc(doc(db, "recordings", recordingId), { organizedNotes: organized, lastOrganized: new Date() });
        await setCache(`lecture_${recordingId}`, { organizedNotes: organized, transcription: rawTranscription });
      } catch (e) { console.warn("Firestore update failed:", e); }
    }
  };

  // ── Diagram generation (unchanged logic) ────────────────────────
  const generateDiagram = async () => {
    try {
      setGeneratingDiagram(true);
      await haptics.impact?.("Medium");
      if (!notes) { Alert.alert("Error", "No notes to diagram."); return; }

      await aiRateLimiter.check();

      const prompt = `Based on this lecture, create a Mermaid flowchart. Return ONLY Mermaid code starting with "graph TD" or "graph LR".
Title: ${notes.title}
Key Points: ${notes.keyPoints?.join(", ")}
Sections: ${notes.sections?.map((s) => s.title).join(", ")}`;

      let code = null;
      if (GROQ_KEY?.length > 10) {
        try {
          const r = await fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.5, max_tokens: 1024 }) });
          if (r.ok) { const d = await r.json(); code = d.choices[0].message.content.replace(/```mermaid\s*/g, "").replace(/```\s*/g, "").trim(); }
        } catch {}
      }
      if (!code && GEMINI_KEY?.length > 10) {
        try {
          const r = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } }) });
          if (r.ok) { const d = await r.json(); code = d.candidates[0].content.parts[0].text.replace(/```mermaid\s*/g, "").replace(/```\s*/g, "").trim(); }
        } catch {}
      }
      if (!code) code = `graph TD\n  A[${notes.title}] --> B[${notes.sections?.[0]?.title || "Concept 1"}]\n  A --> C[${notes.sections?.[1]?.title || "Concept 2"}]`;

      setGeneratedDiagram(code);
      setShowDiagramModal(true);
    } catch (err) {
      if (err.message.startsWith("Rate limit")) Alert.alert("Rate Limited", err.message);
      else Alert.alert("Error", "Diagram generation failed.");
    } finally { setGeneratingDiagram(false); }
  };

  // ── Flashcard generation (unchanged logic) ──────────────────────
  const generateFlashcards = (n) => {
    if (!n) return;
    const cards = [];
    if (n.definitions) Object.entries(n.definitions).forEach(([t, d]) => cards.push({ front: `What is ${t}?`, back: d, type: "definition" }));
    if (n.keyPoints)   n.keyPoints.forEach((p, i)  => cards.push({ front: `Key Point #${i + 1}`, back: p, type: "keypoint" }));
    if (n.questions)   n.questions.forEach((q)      => cards.push({ front: q, back: "Review the relevant section.", type: "question" }));
    if (n.formulas)    n.formulas.forEach((f)        => cards.push({ front: `Formula: ${f.name}\n${f.formula}`, back: `Variables: ${Object.entries(f.variables || {}).map(([v, d]) => `${v}: ${d}`).join(", ")}\nUse: ${f.applications}`, type: "formula" }));
    if (n.chemicalEquations) n.chemicalEquations.forEach((e) => cards.push({ front: `Reaction: ${e.reaction}`, back: `Type: ${e.reactionType}\n${e.explanation}\nConditions: ${e.conditions}`, type: "chemistry" }));
    if (n.caseLaw)     n.caseLaw.forEach((c)         => cards.push({ front: `Case: ${c.caseName}`, back: `Facts: ${c.facts}\nIssue: ${c.issue}\nHolding: ${c.holding}`, type: "law" }));
    setFlashcards(cards);
  };

  // ── Search (unchanged logic) ────────────────────────────────────
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (!q.trim() || !notes) { setSearchResults([]); return; }
    const results = [];
    const lq = q.toLowerCase();
    const push = (r) => results.push(r);
    if (notes.title?.toLowerCase().includes(lq)) push({ type: "title", content: notes.title, match: "Title" });
    notes.sections?.forEach((s, i) => {
      if (s.title?.toLowerCase().includes(lq)) push({ type: "section", content: s.title, match: "Section", index: i });
      if (s.content?.toLowerCase().includes(lq)) push({ type: "section", content: s.title, match: "Content", index: i });
      s.subtopics?.forEach((st) => {
        const name = typeof st === "string" ? st : st?.name || "";
        if (name.toLowerCase().includes(lq)) push({ type: "subtopic", content: name, match: "Subtopic", sectionIndex: i });
      });
    });
    if (notes.definitions) Object.entries(notes.definitions).forEach(([t, d]) => {
      if (t.toLowerCase().includes(lq) || d.toLowerCase().includes(lq)) push({ type: "definition", content: t, match: "Definition" });
    });
    notes.formulas?.forEach((f, i) => { if ((f.name + f.formula).toLowerCase().includes(lq)) push({ type: "formula", content: f.name, match: "Formula", index: i }); });
    notes.chemicalEquations?.forEach((e, i) => { if (e.reaction?.toLowerCase().includes(lq)) push({ type: "chemistry", content: e.reaction, match: "Equation", index: i }); });
    notes.caseLaw?.forEach((c, i) => { if (c.caseName?.toLowerCase().includes(lq)) push({ type: "caseLaw", content: c.caseName, match: "Case", index: i }); });
    setSearchResults(results);
  };

  // ── Other handlers ──────────────────────────────────────────────
  const toggleSection = async (index) => {
    await haptics.impact?.("Light");
    setExpandedSections((p) => ({ ...p, [index]: !p[index] }));
  };

  const nextFlashcard = () => {
    setShowFlashcardAnswer(false);
    setCurrentFlashcard((p) => (p + 1) % flashcards.length);
  };
  const prevFlashcard = () => {
    setShowFlashcardAnswer(false);
    setCurrentFlashcard((p) => (p - 1 + flashcards.length) % flashcards.length);
  };

  const saveEditedNotes = async () => {
    await haptics.notification?.("Success");
    setNotes(editedNotes);
    setActiveTab("notes");
    await saveOrganizedNotes(editedNotes, currentRecordingId);
    Alert.alert("Saved ✓", "Notes updated successfully.");
  };

  const handleRegenerate = async () => {
    if (!rawTranscription) { Alert.alert("Error", "No transcription available."); return; }
    await haptics.impact?.("Medium");
    setIsRegenerating(true);
    try { await refineWithAI(rawTranscription, currentRecordingId); }
    catch (err) { Alert.alert("Error", err.message); }
    finally { setIsRegenerating(false); }
  };

  const handleRefresh = async () => {
    await haptics.impact?.("Light");
    setRefreshing(true);
    if (currentRecordingId) await loadSpecificLecture(currentRecordingId);
    else await loadAllUserLectures();
    setRefreshing(false);
  };

  const formatNotesAsText = (n) => {
    if (!n) return "";
    let t = `${n.title}\n${"─".repeat(40)}\n\n`;
    t += `SUMMARY\n${n.summary}\n\n`;
    n.keyPoints?.forEach((p, i) => (t += `${i + 1}. ${p}\n`));
    n.sections?.forEach((s) => {
      t += `\n${s.title}\n${s.content}\n`;
      s.subtopics?.forEach((st) => (t += `  • ${typeof st === "string" ? st : st?.name}\n`));
    });
    if (n.definitions && Object.keys(n.definitions).length) {
      t += "\nDEFINITIONS\n";
      Object.entries(n.definitions).forEach(([k, v]) => (t += `${k}: ${v}\n`));
    }
    n.formulas?.forEach((f) => (t += `\n${f.name}: ${f.formula}\n`));
    n.questions?.forEach((q, i) => (t += `Q${i + 1}. ${q}\n`));
    t += `\n─ NoteTedd · ${aiProvider} · ${new Date().toLocaleDateString()}\n`;
    return t;
  };

  const handleCopyNotes   = async () => { await haptics.impact?.("Light"); Clipboard.setString(formatNotesAsText(notes)); Alert.alert("Copied!", "Notes copied to clipboard."); };
  const handleShareNotes  = async () => { await haptics.impact?.("Light"); try { await Share.share({ message: formatNotesAsText(notes), title: notes?.title }); } catch {} };

  const generateFallbackDiagram = () => {
    const field = academicField;
    if (field === "medical")     return `graph TD\n  A[${notes.title}] --> B[Concepts]\n  B --> C[Clinical Application]`;
    if (field === "law")         return `graph TD\n  A[${notes.title}] --> B[Issue]\n  B --> C[Holding]`;
    if (field === "engineering") return `graph TD\n  A[${notes.title}] --> B[Formula]\n  A --> C[Derivation]`;
    if (field === "finance")     return `graph TD\n  A[${notes.title}] --> B[Market Concept]\n  B --> C[Calculation]`;
    return `graph TD\n  A[${notes.title}] --> B[${notes.sections?.[0]?.title || "Section 1"}]\n  A --> C[${notes.sections?.[1]?.title || "Section 2"}]`;
  };

  // ════════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ════════════════════════════════════════════════════════════════

  const renderLectureList = () => (
    <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: heroY }], paddingHorizontal: padH }}>
      {/* Header copy */}
      <View style={{ marginBottom: sp(3) }}>
        <Label color={colors.textDim} style={{ marginBottom: 8 }}>— Your Library</Label>
        <Text style={[cs.heroTitle, { color: colors.text }]}>
          My{" "}
          <Text style={{ fontStyle: "italic", color: palette.violetLight }}>Lectures</Text>
        </Text>
        <Text style={[cs.heroSub, { color: colors.textMuted, marginTop: 6 }]}>
          {allLectures.length} recording{allLectures.length !== 1 ? "s" : ""} · tap to open notes
        </Text>
      </View>

      {loadingLectures ? (
        <View style={cs.centeredBox}>
          <View style={[cs.loadingOrb, { backgroundColor: palette.vs(0.14), borderColor: palette.vs(0.25) }]}>
            <MaterialIcons name="auto-awesome" size={28} color={palette.violet} />
          </View>
          <Label color={colors.textDim} style={{ marginTop: 16 }}>Loading lectures…</Label>
        </View>
      ) : allLectures.length === 0 ? (
        <View style={cs.centeredBox}>
          <View style={[cs.emptyOrb, { borderColor: colors.border }]}>
            <MaterialIcons name="library-books" size={32} color={colors.textMuted} />
          </View>
          <Text style={[cs.emptyTitle, { color: colors.text }]}>No Lectures Yet</Text>
          <Text style={[cs.emptySub,   { color: colors.textMuted }]}>
            Record a lecture to get started.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("RecordScreen")}
            style={[cs.emptyBtn, { backgroundColor: palette.violet, shadowColor: palette.violet }]}
            activeOpacity={0.85}
          >
            <MaterialIcons name="mic" size={16} color="#fff" />
            <Text style={cs.emptyBtnText}>Record Lecture</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={allLectures}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LectureRow item={item} colors={colors} onPress={() => handleLectureSelection(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: sp(1.5) }} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      )}
    </Animated.View>
  );

  const renderViewModeBar = () => (
    <View style={[cs.viewModeBar, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
      {[
        { mode: "full",       icon: "article",      label: "Full" },
        { mode: "summary",    icon: "notes",        label: "Summary" },
        { mode: "organized",  icon: "account-tree", label: "Organized" },
      ].map(({ mode, icon, label }) => {
        const active = viewMode === mode;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => { setViewMode(mode); haptics.impact?.("Light"); }}
            style={[cs.vmBtn, active && { backgroundColor: colors.bgCard, shadowColor: palette.violet, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 }]}
            activeOpacity={0.8}
          >
            <MaterialIcons name={icon} size={14} color={active ? palette.violet : colors.textMuted} />
            <Label color={active ? palette.violet : colors.textMuted}>{label}</Label>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderActionBar = () => {
    const actions = [
      { icon: "content-copy", label: "Copy",    onPress: handleCopyNotes,       color: palette.violet },
      { icon: "share",        label: "Share",   onPress: handleShareNotes,      color: palette.teal },
      { icon: "account-tree", label: generatingDiagram ? "…" : "Diagram", onPress: generateDiagram, color: palette.ember, disabled: generatingDiagram },
      { icon: "refresh",      label: isRegenerating ? "…" : "Regen",     onPress: handleRegenerate, color: palette.rose,  disabled: isRegenerating || !rawTranscription },
    ];
    return (
      <View style={cs.actionBar}>
        {actions.map(({ icon, label, onPress, color, disabled }) => (
          <TouchableOpacity
            key={label}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.75}
            style={[cs.actionBtn, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: disabled ? 0.4 : 1 }]}
          >
            <View style={[cs.actionIcon, { backgroundColor: `${color}14` }]}>
              <MaterialIcons name={icon} size={16} color={color} />
            </View>
            <Label color={colors.textMuted} style={{ marginTop: 4 }}>{label}</Label>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderNotesTab = () => {
    const field = FIELD_MAP[academicField] || FIELD_MAP.general;
    const summaryContent = viewMode === "full"
      ? (notes.fullTranscript || notes.summary)
      : (notes.organizedSummary || notes.summary);

    return (
      <Animated.View style={{ opacity: masterOpa }}>

        {/* View mode bar */}
        {renderViewModeBar()}

        {/* Field badge */}
        {academicField !== "general" && (
          <View style={{ alignItems: "center", marginBottom: sp(2) }}>
            <Pill label={field.label} color={field.color} icon={field.icon} />
          </View>
        )}

        {/* Action bar */}
        {renderActionBar()}

        {/* Title + summary card */}
        <Card colors={colors} accent={palette.violet} style={{ marginBottom: sp(2) }}>
          <Corner pos="top-left"  color={palette.violet} size={12} />
          <Corner pos="top-right" color={palette.ember}  size={12} />
          <Text style={[cs.noteTitle, { color: colors.text }]}>{notes.title}</Text>
          {dataSource === "cache" && <Pill label="Cached" color={colors.textDim} icon="storage" style={{ alignSelf: "flex-start", marginBottom: 8 }} />}
          <Text style={[cs.noteSummary, { color: colors.textSub }]}>{summaryContent}</Text>
        </Card>

        {/* AI / source badges */}
        {(aiProvider || dataSource) && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: sp(2), flexWrap: "wrap" }}>
            {aiProvider && <Pill label={aiProvider} color={palette.teal}   icon="auto-awesome" />}
            {dataSource && <Pill label={dataSource === "firestore" ? "Cloud" : dataSource} color={palette.violet} icon="cloud" />}
          </View>
        )}

        {/* Related Topics */}
        {showRelatedTopics && notes.relatedTopics?.length > 0 && (
          <ExpandableSection title="Related Topics" icon="link" color={palette.teal} colors={colors} defaultOpen>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: sp(1) }}>
              {notes.relatedTopics.map((t, i) => (
                <Pill key={i} label={t} color={palette.teal} />
              ))}
            </View>
          </ExpandableSection>
        )}

        {/* Key Points */}
        {notes.keyPoints?.length > 0 && (
          <ExpandableSection title="Key Points" icon="star" color={palette.gold} colors={colors} defaultOpen>
            <View style={{ gap: sp(1) }}>
              {notes.keyPoints.map((p, i) => <KPItem key={i} n={i + 1} text={p} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Sections */}
        {notes.sections?.map((section, index) => (
          <ExpandableSection key={index} title={section.title} icon="folder-open" color={palette.violet} colors={colors}>
            <Text style={[cs.sectionContent, { color: colors.textSub }]}>{section.content}</Text>
            {section.subtopics?.length > 0 && (
              <View style={{ gap: sp(0.75), marginTop: sp(1) }}>
                {section.subtopics.map((st, si) => (
                  <View key={si} style={cs.subtopicRow}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.violetMid, marginTop: 8 }} />
                    <Text style={[cs.subtopicText, { color: colors.textMuted }]}>
                      {typeof st === "string"
                        ? st
                        : `${st?.name || ""}${st?.explanation ? ": " + st.explanation : ""}${st?.examples?.length ? "\nExamples: " + st.examples.join(", ") : ""}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ExpandableSection>
        ))}

        {/* Definitions */}
        {notes.definitions && Object.keys(notes.definitions).length > 0 && (
          <ExpandableSection title="Key Definitions" icon="menu-book" color={palette.success} colors={colors}>
            {Object.entries(notes.definitions).map(([term, def], i, arr) => (
              <DefItem key={i} term={term} def={def} colors={colors} last={i === arr.length - 1} />
            ))}
          </ExpandableSection>
        )}

        {/* Formulas */}
        {notes.formulas?.length > 0 && (
          <ExpandableSection title="Formulas" icon="functions" color={palette.violet} colors={colors}>
            <View style={{ gap: sp(1.5) }}>
              {notes.formulas.map((f, i) => <FormulaItem key={i} formula={f} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Chemical Equations */}
        {notes.chemicalEquations?.length > 0 && (
          <ExpandableSection title="Chemical Equations" icon="science" color={palette.rose} colors={colors}>
            <View style={{ gap: sp(1.5) }}>
              {notes.chemicalEquations.map((e, i) => <ChemItem key={i} eq={e} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Calculations */}
        {notes.calculations?.length > 0 && (
          <ExpandableSection title="Calculations" icon="calculate" color={palette.gold} colors={colors}>
            <View style={{ gap: sp(1.5) }}>
              {notes.calculations.map((c, i) => <CalcItem key={i} calc={c} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Case Law */}
        {notes.caseLaw?.length > 0 && (
          <ExpandableSection title="Case Law" icon="gavel" color={palette.danger} colors={colors}>
            <View style={{ gap: sp(2) }}>
              {notes.caseLaw.map((c, i) => <CaseItem key={i} caseData={c} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Review Questions */}
        {notes.questions?.length > 0 && (
          <ExpandableSection title="Review Questions" icon="quiz" color={palette.rose} colors={colors}>
            <View style={{ gap: sp(1) }}>
              {notes.questions.map((q, i) => <QItem key={i} n={i + 1} question={q} colors={colors} />)}
            </View>
          </ExpandableSection>
        )}

        {/* Study Tips */}
        {notes.studyTips?.length > 0 && (
          <ExpandableSection title="Study Tips" icon="lightbulb" color={palette.ember} colors={colors}>
            <View style={{ gap: sp(1) }}>
              {notes.studyTips.map((tip, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <MaterialIcons name="lightbulb-outline" size={14} color={palette.ember} style={{ marginTop: 3 }} />
                  <Text style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: colors.textSub, lineHeight: 20 }}>{tip}</Text>
                </View>
              ))}
            </View>
          </ExpandableSection>
        )}
      </Animated.View>
    );
  };

  const renderFlashcardsTab = () => {
    if (flashcards.length === 0) return (
      <View style={cs.centeredBox}>
        <View style={[cs.emptyOrb, { borderColor: colors.border }]}>
          <MaterialIcons name="style" size={30} color={colors.textMuted} />
        </View>
        <Text style={[cs.emptyTitle, { color: colors.text }]}>No Flashcards</Text>
        <Text style={[cs.emptySub, { color: colors.textMuted }]}>Generate notes first to create flashcards.</Text>
      </View>
    );

    const card     = flashcards[currentFlashcard];
    const gradient = CARD_GRADIENTS[card.type] || CARD_GRADIENTS.keypoint;

    return (
      <View style={{ alignItems: "center", paddingTop: sp(2) }}>
        {/* Counter */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: sp(2.5) }}>
          <Label color={colors.textDim}>{currentFlashcard + 1} of {flashcards.length}</Label>
          <View style={{ flex: 1 }}>
            <View style={[cs.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[cs.progressFill, { width: `${((currentFlashcard + 1) / flashcards.length) * 100}%`, backgroundColor: gradient[0] }]} />
            </View>
          </View>
          <Pill label={card.type} color={gradient[0]} />
        </View>

        {/* Card */}
        <TouchableOpacity
          style={[cs.flashcard, { shadowColor: gradient[0] }]}
          onPress={() => setShowFlashcardAnswer((p) => !p)}
          activeOpacity={0.9}
        >
          <View style={[cs.flashcardInner, { backgroundColor: gradient[0] }]}>
            {/* Shine */}
            <View style={cs.flashcardShine} />
            <View style={cs.flashcardCornerDeco} />
            <Label color="rgba(255,255,255,0.6)" style={{ marginBottom: 16 }}>
              {showFlashcardAnswer ? "Answer" : "Question"}
            </Label>
            <Text style={cs.flashcardText}>{showFlashcardAnswer ? card.back : card.front}</Text>
            <Text style={cs.flashcardHint}>{showFlashcardAnswer ? "Tap for question" : "Tap to reveal"}</Text>
          </View>
        </TouchableOpacity>

        {/* Controls */}
        <View style={cs.fcControls}>
          <TouchableOpacity onPress={prevFlashcard} style={[cs.fcBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <MaterialIcons name="arrow-back" size={18} color={palette.violet} />
            <Label color={palette.violet}>Prev</Label>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setFlashcards((p) => [...p].sort(() => Math.random() - 0.5)); setCurrentFlashcard(0); setShowFlashcardAnswer(false); }}
            style={[cs.fcShuffleBtn, { backgroundColor: palette.gs(0.18), borderColor: palette.gs(0.3) }]}
          >
            <MaterialIcons name="shuffle" size={18} color={palette.gold} />
          </TouchableOpacity>

          <TouchableOpacity onPress={nextFlashcard} style={[cs.fcBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Label color={palette.violet}>Next</Label>
            <MaterialIcons name="arrow-forward" size={18} color={palette.violet} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMindMapTab = () => (
    <View>
      {/* Central node */}
      <View style={{ alignItems: "center", marginBottom: sp(4) }}>
        <View style={[cs.centralNode, { backgroundColor: palette.violet, shadowColor: palette.violet }]}>
          <Corner pos="top-left"     color="rgba(255,255,255,0.3)" size={10} />
          <Corner pos="bottom-right" color="rgba(255,255,255,0.3)" size={10} />
          <Text style={cs.centralNodeText}>{notes.title}</Text>
        </View>
      </View>

      {/* Branches */}
      {notes.sections?.map((section, idx) => {
        const branchColors = [palette.violet, palette.teal, palette.gold, palette.rose, palette.ember, palette.success];
        const col = branchColors[idx % branchColors.length];
        return (
          <Card key={idx} colors={colors} accent={col} style={{ marginBottom: sp(1.5) }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={[cs.branchDot, { backgroundColor: col, shadowColor: col }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: 6 }}>{section.title}</Text>
                {section.subtopics?.slice(0, 3).map((st, si) => (
                  <Text key={si} style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>
                    · {typeof st === "string" ? st : st?.name}
                  </Text>
                ))}
              </View>
            </View>
          </Card>
        );
      })}

      {/* Fallback mermaid code */}
      <Card colors={colors} style={{ marginTop: sp(2) }}>
        <Label color={colors.textDim} style={{ marginBottom: 10 }}>— Mermaid Code</Label>
        <View style={[cs.codeBox, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: colors.textSub, lineHeight: 18 }}>
            {generateFallbackDiagram()}
          </Text>
        </View>
        <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textDim, marginTop: 8, lineHeight: 18 }}>
          Paste into mermaid.live to visualize
        </Text>
      </Card>
    </View>
  );

  const renderEditTab = () => (
    <Card colors={colors}>
      <Text style={[cs.editSectionTitle, { color: colors.text }]}>Edit Notes</Text>

      {[
        { label: "Title",   key: "title",   multi: false },
        { label: "Summary", key: "summary", multi: true, lines: 4 },
      ].map(({ label, key, multi, lines }) => (
        <View key={key} style={{ marginBottom: sp(2) }}>
          <Label color={colors.textDim} style={{ marginBottom: 8 }}>{label}</Label>
          <TextInput
            style={[cs.editInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text, minHeight: multi ? lines * 24 : 44 }]}
            value={editedNotes?.[key] || ""}
            onChangeText={(v) => setEditedNotes((p) => ({ ...p, [key]: v }))}
            placeholder={label}
            placeholderTextColor={colors.textDim}
            multiline={multi}
            textAlignVertical={multi ? "top" : undefined}
          />
        </View>
      ))}

      <View style={{ marginBottom: sp(3) }}>
        <Label color={colors.textDim} style={{ marginBottom: 8 }}>Key Points (one per line)</Label>
        <TextInput
          style={[cs.editInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.text, minHeight: 120 }]}
          value={editedNotes?.keyPoints?.join("\n") || ""}
          onChangeText={(v) => setEditedNotes((p) => ({ ...p, keyPoints: v.split("\n").filter((x) => x.trim()) }))}
          placeholder="One key point per line"
          placeholderTextColor={colors.textDim}
          multiline textAlignVertical="top"
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <TouchableOpacity
          onPress={() => { setEditedNotes(notes); setActiveTab("notes"); }}
          style={[cs.cancelBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
          activeOpacity={0.75}
        >
          <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: colors.textMuted }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={saveEditedNotes} style={[cs.saveBtn, { backgroundColor: palette.violet, shadowColor: palette.violet }]} activeOpacity={0.85}>
          <MaterialIcons name="save" size={16} color="#fff" />
          <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: "#fff" }}>Save</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  // ── Loading screen ──────────────────────────────────────────────
  if (loading) return (
    <View style={[cs.root, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
      <Animated.View style={{ opacity: masterOpa, alignItems: "center", gap: sp(2) }}>
        <View style={[cs.loadingOrb, { backgroundColor: palette.vs(0.14), borderColor: palette.vs(0.3) }]}>
          <Animated.View>
            <MaterialIcons name="auto-awesome" size={30} color={palette.violet} />
          </Animated.View>
        </View>
        <Label color={palette.violet} style={{ letterSpacing: 4 }}>Processing</Label>
        <Text style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center", lineHeight: 28 }}>
          AI is organizing{"\n"}
          <Text style={{ fontStyle: "italic", color: palette.violetLight }}>your lecture</Text>
        </Text>
        <Text style={{ fontFamily: SANS, fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
          Extracting key points, definitions & structure…
        </Text>
      </Animated.View>
    </View>
  );

  // ── Main render ─────────────────────────────────────────────────
  return (
    <View style={[cs.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <View style={[cs.topBar, { backgroundColor: colors.overlay, borderBottomColor: colors.border, paddingTop: Platform.OS === "ios" ? sp(7) : sp(5.5) }]}>
        {notes && !showLectureList ? (
          <TouchableOpacity
            onPress={() => { setNotes(null); setCurrentRecordingId(null); setShowLectureList(true); loadAllUserLectures(); }}
            style={[cs.topBarBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.textSub} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={{ flex: 1, alignItems: "center", gap: 3 }}>
          <Label color={colors.textDim}>— NoteTedd</Label>
          <Text style={[cs.topBarTitle, { color: colors.text }]}>
            {showLectureList ? "Library" : "Notes"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowSearchModal(true)}
          style={[cs.topBarBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <MaterialIcons name="search" size={18} color={notes ? colors.textSub : colors.textDim} />
        </TouchableOpacity>
      </View>

      {/* ── Tab bar (when viewing notes) ─────────────────────────── */}
      {notes && !showLectureList && (
        <View style={[cs.tabBar, { backgroundColor: colors.overlay, borderBottomColor: colors.border }]}>
          {[
            { key: "notes",      icon: "article",      label: "Notes" },
            { key: "flashcards", icon: "style",        label: "Cards" },
            { key: "mindmap",    icon: "account-tree", label: "Map" },
            { key: "edit",       icon: "edit",         label: "Edit" },
          ].map(({ key, icon, label }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => { setActiveTab(key); haptics.impact?.("Light"); }}
                style={[cs.tabItem, active && cs.tabItemActive]}
                activeOpacity={0.75}
              >
                <MaterialIcons name={icon} size={17} color={active ? palette.violet : colors.textDim} />
                <Label color={active ? palette.violet : colors.textDim} style={{ marginTop: 2 }}>{label}</Label>
                {active && <View style={[cs.tabIndicator, { backgroundColor: palette.violet }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Content ──────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[cs.scrollContent, { paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(14) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[palette.violet]} tintColor={palette.violet} />
        }
      >
        {showLectureList
          ? renderLectureList()
          : notes
          ? (
            <>
              {activeTab === "notes"      && renderNotesTab()}
              {activeTab === "flashcards" && renderFlashcardsTab()}
              {activeTab === "mindmap"    && renderMindMapTab()}
              {activeTab === "edit"       && renderEditTab()}
            </>
          )
          : null}
      </ScrollView>

      {/* ── Search Modal ─────────────────────────────────────────── */}
      <Modal visible={showSearchModal} transparent animationType="fade" onRequestClose={() => setShowSearchModal(false)}>
        <TouchableOpacity style={cs.modalOverlay} activeOpacity={1} onPress={() => setShowSearchModal(false)}>
          <View style={[cs.searchModal, { backgroundColor: colors.bgCard, borderColor: colors.borderMid }]} onStartShouldSetResponder={() => true}>
            <Corner pos="top-left"     color={palette.violet} size={12} />
            <Corner pos="bottom-right" color={palette.ember}  size={12} />

            <View style={[cs.searchInputRow, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              <MaterialIcons name="search" size={17} color={palette.violet} />
              <TextInput
                style={[cs.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={handleSearch}
                placeholder="Search in this lecture…"
                placeholderTextColor={colors.textDim}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                  <MaterialIcons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {searchResults.length > 0 && (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                <Label color={colors.textDim} style={{ marginVertical: 10 }}>{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</Label>
                {searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setShowSearchModal(false); setSearchQuery(""); setActiveTab("notes"); if (r.index !== undefined) toggleSection(r.index); }}
                    style={[cs.searchResult, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons name={r.type === "definition" ? "menu-book" : r.type === "section" ? "folder-open" : "label"} size={15} color={palette.violet} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: SANS, fontSize: 13, fontWeight: "600", color: colors.text }} numberOfLines={1}>{r.content}</Text>
                      <Label color={palette.violetLight}>{r.match}</Label>
                    </View>
                    <MaterialIcons name="chevron-right" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {searchQuery.length > 0 && searchResults.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: sp(3) }}>
                <MaterialIcons name="search-off" size={28} color={colors.textDim} />
                <Text style={{ fontFamily: SANS, fontSize: 13, color: colors.textMuted, marginTop: 8 }}>No results found</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Diagram Modal ─────────────────────────────────────────── */}
      <Modal visible={showDiagramModal} transparent animationType="slide" onRequestClose={() => setShowDiagramModal(false)}>
        <View style={cs.modalOverlay}>
          <View style={[cs.diagramModal, { backgroundColor: colors.bgCard, borderColor: colors.borderMid }]}>
            <Corner pos="top-left"  color={palette.violet} size={12} />
            <Corner pos="top-right" color={palette.ember}  size={12} />

            <View style={[cs.diagramHeader, { borderBottomColor: colors.border }]}>
              <Text style={[cs.diagramTitle, { color: colors.text }]}>Generated Diagram</Text>
              <TouchableOpacity onPress={() => setShowDiagramModal(false)} style={[cs.topBarBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <MaterialIcons name="close" size={16} color={colors.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: sp(2.5), maxHeight: 300 }}>
              <Label color={colors.textDim} style={{ marginBottom: 10 }}>Mermaid Code</Label>
              <View style={[cs.codeBox, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                <Text style={{ fontFamily: MONO, fontSize: 12, color: colors.textSub, lineHeight: 20 }}>
                  {generatedDiagram}
                </Text>
              </View>
              <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted, marginTop: 12, lineHeight: 18 }}>
                💡 Paste into mermaid.live to render the diagram visually.
              </Text>
            </ScrollView>

            <View style={[cs.diagramFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => { Clipboard.setString(generatedDiagram); Alert.alert("Copied!", "Diagram code copied."); }}
                style={[cs.saveBtn, { flex: 1, backgroundColor: palette.violet, shadowColor: palette.violet }]}
                activeOpacity={0.85}
              >
                <MaterialIcons name="content-copy" size={16} color="#fff" />
                <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: "#fff" }}>Copy Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Shared component styles ──────────────────────────────────────────────────
const cs = StyleSheet.create({
  root:           { flex: 1 },

  // Top bar
  topBar:         { flexDirection: "row", alignItems: "center", paddingHorizontal: sp(2.5), paddingBottom: sp(2), borderBottomWidth: 1 },
  topBarBtn:      { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarTitle:    { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },

  // Tab bar
  tabBar:         { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: sp(2) },
  tabItem:        { flex: 1, alignItems: "center", paddingVertical: sp(1.5), position: "relative" },
  tabItemActive:  {},
  tabIndicator:   { position: "absolute", bottom: 0, left: "25%", right: "25%", height: 2, borderRadius: 1 },

  // Scroll
  scrollContent:  { flexGrow: 1 },

  // Hero text
  heroTitle:      { fontFamily: DISPLAY, fontSize: 32, fontWeight: "900", letterSpacing: -1, lineHeight: 38 },
  heroSub:        { fontFamily: SANS, fontSize: 14 },

  // Card
  card:           { borderRadius: 20, borderWidth: 1, padding: sp(2.5), overflow: "hidden", position: "relative" },

  // Section
  sectionHeader:  { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: sp(1.5) },
  sectionIconWrap:{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle:   { flex: 1, fontFamily: DISPLAY, fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  sectionContent: { fontFamily: SANS, fontSize: 13, lineHeight: 22, paddingBottom: sp(1) },

  // Subtopic
  subtopicRow:    { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  subtopicText:   { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 20 },

  // Key points
  kpRow:          { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: sp(0.75) },
  kpNum:          { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  kpText:         { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 22 },

  // Definitions
  defItem:        { paddingVertical: sp(1.5) },
  defTerm:        { fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  defText:        { fontFamily: SANS, fontSize: 13, lineHeight: 20 },

  // Formula
  formulaItem:    { borderRadius: 14, borderWidth: 1, padding: sp(2), gap: sp(0.75) },
  formulaName:    { fontFamily: DISPLAY, fontSize: 14, fontWeight: "800", marginBottom: 2 },
  formulaBox:     { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },

  // Chemistry
  chemItem:       { borderRadius: 14, borderWidth: 1, padding: sp(2) },

  // Case law
  caseItem:       { borderRadius: 14, borderWidth: 1, padding: sp(2) },
  significance:   { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: sp(1) },

  // Calculation
  calcItem:       { borderRadius: 14, borderWidth: 1, padding: sp(2) },
  solutionRow:    { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: sp(0.5) },

  // Questions
  qRow:           { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: sp(1) },
  qBadge:         { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  qText:          { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 22 },

  // Note title / summary
  noteTitle:      { fontFamily: DISPLAY, fontSize: 24, fontWeight: "900", letterSpacing: -0.8, marginBottom: 12, lineHeight: 30 },
  noteSummary:    { fontFamily: SANS, fontSize: 14, lineHeight: 24 },

  // View mode bar
  viewModeBar:    { flexDirection: "row", borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: sp(2), gap: 4 },
  vmBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: sp(1.25), borderRadius: 12 },

  // Action bar
  actionBar:      { flexDirection: "row", gap: 10, marginBottom: sp(2.5) },
  actionBtn:      { flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: sp(1.5) },
  actionIcon:     { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Lecture row
  lectureRow:     { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, borderWidth: 1, padding: sp(2), overflow: "hidden", position: "relative" },
  lectureIcon:    { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lectureTitle:   { fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  lecturePreview: { fontFamily: SANS, fontSize: 12, lineHeight: 18 },

  // Flashcards
  flashcard:      { width: "100%", borderRadius: 24, overflow: "hidden", marginBottom: sp(3), shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 24, elevation: 14 },
  flashcardInner: { minHeight: 300, padding: sp(4), justifyContent: "center", alignItems: "center", position: "relative" },
  flashcardShine: { position: "absolute", top: -10, left: "15%", width: "40%", height: "30%", borderRadius: 60, backgroundColor: "#fff", opacity: 0.08, transform: [{ rotate: "-20deg" }] },
  flashcardCornerDeco: { position: "absolute", bottom: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: "#000", opacity: 0.08 },
  flashcardText:  { fontFamily: DISPLAY, fontSize: 19, fontWeight: "900", color: "#fff", textAlign: "center", lineHeight: 28, zIndex: 1 },
  flashcardHint:  { fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.5)", marginTop: 20 },
  fcControls:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: sp(2) },
  fcBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.5) },
  fcShuffleBtn:   { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  progressTrack:  { height: 3, borderRadius: 1.5, overflow: "hidden", flex: 1 },
  progressFill:   { height: "100%", borderRadius: 1.5 },

  // Mind map
  centralNode:    { borderRadius: 18, paddingHorizontal: sp(4), paddingVertical: sp(2), shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 12, position: "relative", overflow: "hidden" },
  centralNodeText:{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "900", color: "#fff", textAlign: "center" },
  branchDot:      { width: 12, height: 12, borderRadius: 6, marginTop: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 },

  // Edit
  editSectionTitle: { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", marginBottom: sp(2.5) },
  editInput:      { borderWidth: 1, borderRadius: 14, padding: sp(1.5), fontFamily: SANS, fontSize: 14 },
  cancelBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.75), gap: 6 },
  saveBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: sp(1.75), gap: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },

  // Empty / loading states
  centeredBox:    { alignItems: "center", paddingVertical: sp(6) },
  loadingOrb:     { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2) },
  emptyOrb:       { width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2) },
  emptyTitle:     { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", marginBottom: 6 },
  emptySub:       { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: sp(3), marginBottom: sp(3) },
  emptyBtn:       { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: sp(3), paddingVertical: sp(1.75), borderRadius: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  emptyBtnText:   { fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: "#fff", fontWeight: "700" },

  // Modals
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: sp(3) },
  searchModal:    { borderRadius: 22, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  searchInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: sp(1) },
  searchInput:    { flex: 1, fontFamily: SANS, fontSize: 14 },
  searchResult:   { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  diagramModal:   { borderRadius: 22, borderWidth: 1, overflow: "hidden", position: "relative" },
  diagramHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: sp(2.5), borderBottomWidth: 1 },
  diagramTitle:   { fontFamily: DISPLAY, fontSize: 18, fontWeight: "800" },
  diagramFooter:  { padding: sp(2.5), borderTopWidth: 1 },
  codeBox:        { borderWidth: 1, borderRadius: 12, padding: 14 },
});