import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  Animated,
  StatusBar,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
} from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { logUserActivity } from "./utils/userActivity";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Audio } from "expo-av";
import Sidebar from "./Sidebar";
import { useSidebar } from "../hooks/useSidebar";
import TeddComponent from "../components/tedd/TeddComponent.js";
import StudyAnalyticsWidget from "../components/widgets/StudyAnalyticsWidget";
import PomodoroTimerWidget from "../components/widgets/PomodoroTimerWidget";
import AchievementModal from "../components/widgets/AchievementModal";
import { useTheme } from "./context/ThemeContext";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg:           "#08080f",
  surface:      "rgba(255,255,255,0.04)",
  surfaceWarm:  "rgba(234,88,12,0.08)",
  surfaceCool:  "rgba(124,58,237,0.08)",
  border:       "rgba(255,255,255,0.08)",
  borderWarm:   "rgba(234,88,12,0.25)",
  borderCool:   "rgba(124,58,237,0.25)",
  text:         "#f5f2ff",
  textMuted:    "rgba(245,242,255,0.42)",
  textDim:      "rgba(245,242,255,0.22)",
  purple:       "#7c3aed",
  purpleLight:  "#a855f7",
  orange:       "#ea580c",
  orangeLight:  "#f97316",
  // Glow rgba helpers
  purpleGlow:   "rgba(124,58,237,0.5)",
  orangeGlow:   "rgba(234,88,12,0.45)",
};

const { width: W, height: H } = Dimensions.get("window");
const SERIF = Platform.OS === "ios" ? "Georgia" : "serif";
const MONO  = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── Background task ──────────────────────────────────────────────────────────
const POMODORO_TASK_NAME = "POMODORO_BACKGROUND_TASK";
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});
TaskManager.defineTask(POMODORO_TASK_NAME, async () => {
  try {
    const raw = await AsyncStorage.getItem("pomodoroState");
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;
    const state = JSON.parse(raw);
    if (state.isActive && state.endTime && Date.now() >= state.endTime) {
      await Notifications.scheduleNotificationAsync({
        content: { title: state.type === "work" ? "Session Complete!" : "Break Over!", body: "", sound: true },
        trigger: null,
      });
      await AsyncStorage.setItem("pomodoroState", JSON.stringify({ ...state, isActive: false, timeLeft: 0 }));
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch { return BackgroundFetch.BackgroundFetchResult.Failed; }
});

// ─── Orb: The glowing sphere centerpiece (inspired by image 3) ───────────────
const GlowOrb = ({ size = 220, primaryColor = T.purple, secondaryColor = T.orange }) => {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(0.7)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse1, { toValue: 1.12, duration: 2800, useNativeDriver: true }),
      Animated.timing(pulse1, { toValue: 0.92, duration: 2800, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse2, { toValue: 1.2, duration: 3600, useNativeDriver: true }),
      Animated.timing(pulse2, { toValue: 0.6, duration: 3600, useNativeDriver: true }),
    ])).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 12000, useNativeDriver: true })
    ).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Outer diffuse ring */}
      <Animated.View style={{
        position: "absolute",
        width: size * 1.4, height: size * 1.4, borderRadius: size * 0.7,
        backgroundColor: primaryColor,
        opacity: 0.08,
        transform: [{ scale: pulse2 }],
      }} />
      {/* Mid glow ring */}
      <Animated.View style={{
        position: "absolute",
        width: size * 1.05, height: size * 1.05, borderRadius: size * 0.525,
        backgroundColor: primaryColor,
        opacity: 0.14,
        transform: [{ scale: pulse1 }],
      }} />
      {/* Rotating ring of dots */}
      <Animated.View style={{
        position: "absolute",
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: `${primaryColor}55`,
        borderStyle: "dashed",
        transform: [{ rotate: spin }],
      }} />
      {/* Core sphere */}
      <View style={{
        width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36,
        backgroundColor: T.bg,
        borderWidth: 1.5,
        borderColor: `${primaryColor}60`,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        // Simulated top-left highlight
        shadowColor: primaryColor,
        shadowOffset: { width: -8, height: -8 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 16,
      }}>
        {/* Inner glow bleed */}
        <View style={{
          position: "absolute", top: -20, left: -20,
          width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25,
          backgroundColor: primaryColor, opacity: 0.22,
        }} />
        <View style={{
          position: "absolute", bottom: -20, right: -20,
          width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2,
          backgroundColor: secondaryColor, opacity: 0.18,
        }} />
        {/* Central icon */}
        <MaterialIcons name="school" size={38} color={primaryColor} style={{ opacity: 0.9 }} />
      </View>
      {/* Orbiting accent dot */}
      <Animated.View style={{
        position: "absolute",
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: secondaryColor,
        top: size * 0.08,
        right: size * 0.12,
        shadowColor: secondaryColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        transform: [{ rotate: spin }],
      }} />
    </View>
  );
};

// ─── Mini chart bars (inspired by image 2 activity cards) ─────────────────────
const MiniChart = ({ data = [], color = T.purple, height = 32 }) => {
  const max = Math.max(...data, 1);
  const bars = data.slice(-7);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height }}>
      {bars.map((v, i) => {
        const h = Math.max(3, (v / max) * height);
        const isLast = i === bars.length - 1;
        return (
          <View key={i} style={{
            width: 4,
            height: h,
            borderRadius: 2,
            backgroundColor: isLast ? color : `${color}55`,
          }} />
        );
      })}
    </View>
  );
};

// ─── Corner bracket ───────────────────────────────────────────────────────────
const CB = ({ pos, color = T.purple, s = 12 }) => {
  const isR = pos.includes("right"), isB = pos.includes("bottom");
  const base = { position: "absolute" };
  if (pos.includes("top"))    base.top    = 0;
  if (pos.includes("bottom")) base.bottom = 0;
  if (pos.includes("left"))   base.left   = 0;
  if (pos.includes("right"))  base.right  = 0;
  return (
    <View style={[base, { width: s, height: s }]} pointerEvents="none">
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: s, height: 1.5, backgroundColor: color, opacity: 0.5 }} />
      <View style={{ position: "absolute", top: isB ? undefined : 0, bottom: isB ? 0 : undefined, left: isR ? undefined : 0, right: isR ? 0 : undefined, width: 1.5, height: s, backgroundColor: color, opacity: 0.5 }} />
    </View>
  );
};

// ─── Mono label ───────────────────────────────────────────────────────────────
const Mono = ({ children, color = T.purple, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 2.8, textTransform: "uppercase", color }, style]}>
    {children}
  </Text>
);

// ─── Horizontal rule ─────────────────────────────────────────────────────────
const HR = ({ mx = 20, mt = 0 }) => (
  <View style={{ height: 1, backgroundColor: T.border, marginHorizontal: mx, marginTop: mt }} />
);

// ─── Stat Tile (image-3 style: large number, warm glow card) ─────────────────
const StatTile = ({ label, value, accent, delay, chartData = [] }) => {
  const opa = useRef(new Animated.Value(0)).current;
  const ty  = useRef(new Animated.Value(20)).current;
  const glow = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opa, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.5, duration: 2200, useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: opa, transform: [{ translateY: ty }] }}>
      <View style={[styles.statTile, { borderColor: `${accent}30` }]}>
        {/* Warm glow at top-center */}
        <Animated.View style={{
          position: "absolute", top: -30, alignSelf: "center",
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: accent,
          opacity: Animated.multiply(glow, new Animated.Value(0.2)),
        }} />
        {/* Color wash */}
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.06, borderRadius: 16 }} />

        <CB pos="top-left"     color={accent} s={10} />
        <CB pos="bottom-right" color={accent} s={10} />

        <Mono color={accent} style={{ marginBottom: 10 }}>{label}</Mono>
        <Text style={[styles.statNum, { color: T.text }]}>{value}</Text>

        {chartData.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <MiniChart data={chartData} color={accent} height={28} />
          </View>
        )}
      </View>
    </Animated.View>
  );
};

// ─── Lecture scroll card (image-1 style: full bleed color, bold) ─────────────
const LectureScrollCard = ({ lecture, onPress }) => {
  const pressScale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
        <View style={[styles.lectureScrollCard, { borderColor: `${lecture.color}30` }]}>
          {/* Color tint background */}
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: lecture.color, opacity: 0.09, borderRadius: 20 }} />
          {/* Top glow */}
          <View style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: lecture.color, opacity: 0.18 }} />

          <CB pos="top-left"  color={lecture.color} s={12} />
          <CB pos="top-right" color={lecture.color} s={12} />

          <View style={styles.lectureScrollTop}>
            <Mono color={lecture.color}>{lecture.date}</Mono>
            <View style={[styles.progressPill, { backgroundColor: `${lecture.color}22`, borderColor: `${lecture.color}40` }]}>
              <Text style={[styles.progressPillText, { color: lecture.color }]}>{lecture.progress}%</Text>
            </View>
          </View>

          <Text style={styles.lectureScrollTitle} numberOfLines={2}>{lecture.title}</Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <Mono color={T.textDim}>{lecture.duration}</Mono>
            <View style={[styles.lectureArrowBtn, { backgroundColor: `${lecture.color}20`, borderColor: `${lecture.color}40` }]}>
              <MaterialIcons name="arrow-forward" size={14} color={lecture.color} />
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.lectureProgressTrack}>
            <View style={[styles.lectureProgressFill, { width: `${lecture.progress}%`, backgroundColor: lecture.color }]} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Quick action row button (bold + glowing like image 1 CTAs) ───────────────
const ActionBtn = ({ icon, label, accent, onPress, delay }) => {
  const opa = useRef(new Animated.Value(0)).current;
  const tx  = useRef(new Animated.Value(-16)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opa, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(tx, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const onIn  = () => Animated.spring(pressScale, { toValue: 0.95, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ opacity: opa, transform: [{ translateX: tx }, { scale: pressScale }] }}>
      <TouchableOpacity activeOpacity={1} onPressIn={onIn} onPressOut={onOut} onPress={onPress}>
        <View style={[styles.actionBtn, { borderColor: `${accent}30` }]}>
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.07, borderRadius: 16 }} />
          <View style={[styles.actionBtnIcon, { backgroundColor: `${accent}18`, borderColor: `${accent}35` }]}>
            <MaterialIcons name={icon} size={20} color={accent} />
          </View>
          <Text style={styles.actionBtnLabel}>{label}</Text>
          <MaterialIcons name="arrow-forward-ios" size={11} color={T.textDim} style={{ marginLeft: "auto" }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { isOpen, openSidebar, closeSidebar } = useSidebar();
  const navigation   = useNavigation();
  const auth         = getAuth();
  const db           = getFirestore();
  const { theme, setTheme } = useTheme();

  const [fullName,          setFullName]          = useState("User");
  const [loading,           setLoading]           = useState(true);
  const [isSidebarOpen,     setIsSidebarOpen]     = useState(false);
  const [streakCount,       setStreakCount]       = useState(0);
  const [totalHours,        setTotalHours]        = useState(0);
  const [notesCount,        setNotesCount]        = useState(0);
  const [quizzesCount,      setQuizzesCount]      = useState(0);
  const [weeklyData,        setWeeklyData]        = useState([]);
  const [recentLectures,    setRecentLectures]    = useState([]);
  const [showAchievement,   setShowAchievement]   = useState(false);
  const [currentAchievement,setCurrentAchievement]= useState(null);
  const [pomodoroRunning,   setPomodoroRunning]   = useState(false);
  const [activeTab,         setActiveTab]         = useState("home");

  const appStateRef = useRef(AppState.currentState);
  const soundRef    = useRef(null);
  const notifRef    = useRef(null);

  // ── Animations ─────────────────────────────────────────────────────────────
  const masterOpa   = useRef(new Animated.Value(0)).current;
  const heroSlide   = useRef(new Animated.Value(30)).current;
  const streakScale = useRef(new Animated.Value(0)).current;
  const streakPulse = useRef(new Animated.Value(1)).current;
  const orbFloat    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(heroSlide,  { toValue: 0, tension: 38, friction: 9, useNativeDriver: true }),
    ]).start();
    // Orb floating
    Animated.loop(Animated.sequence([
      Animated.timing(orbFloat, { toValue: -10, duration: 3000, useNativeDriver: true }),
      Animated.timing(orbFloat, { toValue: 0,   duration: 3000, useNativeDriver: true }),
    ])).start();
    // Streak pulse
    Animated.loop(Animated.sequence([
      Animated.timing(streakPulse, { toValue: 1.08, duration: 1300, useNativeDriver: true }),
      Animated.timing(streakPulse, { toValue: 1.0,  duration: 1300, useNativeDriver: true }),
    ])).start();
  }, []);

  useEffect(() => {
    if (!loading && streakCount > 0) {
      Animated.spring(streakScale, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }).start();
    }
  }, [loading, streakCount]);

  // ── Setup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setupNotifications();
    setupBackgroundFetch();
    checkPomodoroState();
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => { sub.remove(); try { notifRef.current?.remove(); } catch {} soundRef.current?.unloadAsync(); };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { setFullName(user?.displayName || "User"); loadAllData().catch(() => setLoading(false)); }
      else setLoading(false);
    });
    return () => unsub();
  }, []);

  useFocusEffect(useCallback(() => {
    if (auth.currentUser) { loadAllData().catch(() => {}); checkPomodoroState(); }
  }, []));

  // ── Notification helpers ───────────────────────────────────────────────────
  const setupNotifications = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const final = status !== "granted" ? (await Notifications.requestPermissionsAsync()).status : status;
      if (final !== "granted") return;
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("pomodoro", { name: "Pomodoro", importance: Notifications.AndroidImportance.MAX, sound: "default" }).catch(() => {});
      notifRef.current = Notifications.addNotificationResponseReceivedListener(() => { try { navigation.navigate("HomeScreen"); } catch {} });
    } catch {}
  };
  const setupBackgroundFetch = async () => {
    try { if (!await TaskManager.isTaskRegisteredAsync(POMODORO_TASK_NAME)) await BackgroundFetch.registerTaskAsync(POMODORO_TASK_NAME, { minimumInterval: 60, stopOnTerminate: false, startOnBoot: true }); } catch {}
  };
  const checkPomodoroState = async () => {
    try { const raw = await AsyncStorage.getItem("pomodoroState"); if (raw) setPomodoroRunning(JSON.parse(raw).isActive || false); } catch {}
  };
  const handleAppStateChange = (next) => {
    if (appStateRef.current.match(/inactive|background/) && next === "active") { checkPomodoroState(); if (auth.currentUser) loadAllData().catch(() => {}); }
    appStateRef.current = next;
  };
  const playNotificationSound = async () => {
    try { if (Platform.OS === "android") return; let a; try { a = require("../assets/notification.mp3"); } catch { return; } const { sound } = await Audio.Sound.createAsync(a, { shouldPlay: true }); soundRef.current = sound; } catch {}
  };

  // ── Data ───────────────────────────────────────────────────────────────────
  const loadAllData = async () => {
    try { setLoading(true); if (!auth.currentUser) { setLoading(false); return; } await Promise.all([calculateStreak(), loadStats(), loadWeeklyActivity(), loadRecentLectures()]); } finally { setLoading(false); }
  };

  const calculateStreak = async () => {
    try {
      const user = auth.currentUser; if (!user) return;
      const snap = await getDocs(query(collection(db, "recordings"), where("userId", "==", user.uid), orderBy("createdAt", "desc")));
      const days = new Set();
      const addDay = (ts) => { const d = ts.toDate(); days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`); };
      snap.forEach((d) => { if (d.data().createdAt) addDay(d.data().createdAt); });
      try { const as = await getDocs(query(collection(db, "userActivities"), where("userId", "==", user.uid), orderBy("createdAt", "desc"))); as.forEach((d) => { if (d.data().createdAt && d.data().type) addDay(d.data().createdAt); }); } catch {}
      const sorted = Array.from(days).sort().reverse();
      const today = new Date(), key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const yday = new Date(today); yday.setDate(today.getDate() - 1);
      if (!sorted.includes(key(today)) && !sorted.includes(key(yday))) { setStreakCount(0); return; }
      let streak = 0, check = new Date(today);
      for (let i = 0; i < 365; i++) { if (sorted.includes(key(check))) { streak++; check.setDate(check.getDate() - 1); } else break; }
      setStreakCount(streak); await AsyncStorage.setItem("userStreak", streak.toString());
    } catch { const s = await AsyncStorage.getItem("userStreak"); setStreakCount(s ? parseInt(s) : 0); }
  };

  const loadStats = async () => {
    try {
      const user = auth.currentUser; if (!user) return;
      const snap = await getDocs(query(collection(db, "recordings"), where("userId", "==", user.uid)));
      let dur = 0, notes = 0, quizzes = 0;
      snap.forEach((d) => { const data = d.data(); if (data.organizedNotes) notes++; if (data.quiz) quizzes++; dur += data.duration || (data.audioUrl ? 1800 : 0); });
      const hours = (dur / 3600).toFixed(1);
      setTotalHours(hours); setNotesCount(notes); setQuizzesCount(quizzes);
      await AsyncStorage.setItem("stats", JSON.stringify({ hours, notes, quizzes }));
    } catch { const s = await AsyncStorage.getItem("stats"); if (s) { const p = JSON.parse(s); setTotalHours(p.hours||0); setNotesCount(p.notes||0); setQuizzesCount(p.quizzes||0); } }
  };

  const loadWeeklyActivity = async () => {
    try {
      const user = auth.currentUser; if (!user) return;
      const ago = new Date(); ago.setDate(ago.getDate() - 7);
      const snap = await getDocs(query(collection(db, "recordings"), where("userId", "==", user.uid), where("createdAt", ">=", ago), orderBy("createdAt", "asc")));
      const labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const week = labels.map((day, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { day, label: day[0], hours: 0, date: d.toDateString() }; });
      snap.forEach((d) => { const data = d.data(); if (data.createdAt) { const ad = data.createdAt.toDate(); const slot = week.find((w) => new Date(w.date).toDateString() === ad.toDateString()); if (slot) slot.hours += (data.duration || 1800) / 3600; } });
      week.forEach((w) => { w.hours = Math.round(w.hours * 10) / 10; });
      setWeeklyData(week);
    } catch { setWeeklyData(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => ({ day: d, label: d[0], hours: 0 }))); }
  };

  const loadRecentLectures = async () => {
    try {
      const user = auth.currentUser; if (!user) return;
      const snap = await getDocs(query(collection(db, "recordings"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(6)));
      const palette = [T.purple, T.orange, "#0d9488", "#be123c", "#7c3aed", "#b45309"];
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.organizedNotes) {
          const created = data.createdAt?.toDate() || new Date();
          list.push({ id: d.id, title: data.organizedNotes.title || "Untitled Lecture", duration: `${Math.round((data.duration || 1800) / 60)} min`, date: getTimeAgo(created), progress: data.quiz ? 100 : 75, color: palette[list.length % palette.length] });
        }
      });
      setRecentLectures(list);
      await AsyncStorage.setItem("recentLectures", JSON.stringify(list));
    } catch { const s = await AsyncStorage.getItem("recentLectures"); if (s) setRecentLectures(JSON.parse(s)); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getTimeAgo = (date) => {
    const diff = new Date() - date, h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
    if (h < 1) return "Just now"; if (h < 24) return `${h}h ago`; if (d === 1) return "Yesterday"; if (d < 7) return `${d}d ago`; return date.toLocaleDateString();
  };
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 5) return "Night grind"; if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; if (h < 21) return "Good evening"; return "Night owl";
  };
  const getMotivation = () => {
    const lines = ["You're on a wave\nof knowledge.", "Knowledge is your\nsuperpower.", "Every note is a\nstep forward.", "Your mind is\nunstoppable."];
    return lines[new Date().getHours() % lines.length];
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleQuickAction = (label) => {
    if (label === "Record")   return navigation.navigate("RecordScreen");
    if (label === "Quiz")     return navigation.navigate("QuizScreen", { theme });
    if (label === "Notes")    return navigation.navigate("NotesScreen", { theme });
    if (label === "Schedule") return Alert.alert("Coming Soon", "Schedule is on the way.");
  };

  const handleLecturePress = async (lecture) => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) { Alert.alert("Error", "Sign in required"); setLoading(false); return; }
      const docSnap = await getDoc(doc(db, "recordings", lecture.id));
      if (!docSnap.exists() || docSnap.data().userId !== user.uid) { Alert.alert("Error", "Lecture unavailable"); setLoading(false); return; }
      const data = docSnap.data();
      await AsyncStorage.setItem("selectedLecture", JSON.stringify({ id: lecture.id, ...data }));
      setLoading(false);
      navigation.navigate("NotesScreen", { theme, lectureId: lecture.id, lectureData: data, refresh: Date.now() });
    } catch { setLoading(false); Alert.alert("Error", "Failed to load lecture."); }
  };

  const handlePomodoroComplete = async (sessionType) => {
    await playNotificationSound();
    setCurrentAchievement({ id: "pomo", icon: "timer", title: "Focused", description: `${sessionType} session done.`, color: T.purple, points: 25 });
    setShowAchievement(true);
    try { await Notifications.scheduleNotificationAsync({ content: { title: sessionType === "work" ? "Session complete." : "Break over.", body: "" }, trigger: null }); } catch {}
    loadStats();
    setPomodoroRunning(false);
    await AsyncStorage.setItem("pomodoroState", JSON.stringify({ isActive: false, timeLeft: 0 }));
  };
  const handlePomodoroStart = async (duration, type) => {
    const endTime = Date.now() + duration * 60000;
    await AsyncStorage.setItem("pomodoroState", JSON.stringify({ isActive: true, endTime, type, timeLeft: duration * 60 }));
    setPomodoroRunning(true);
    try { await Notifications.scheduleNotificationAsync({ content: { title: type === "work" ? "Session complete." : "Break over.", body: "" }, trigger: { seconds: duration * 60 } }); } catch {}
  };
  const handlePomodoroPause = async () => {
    await AsyncStorage.setItem("pomodoroState", JSON.stringify({ isActive: false }));
    setPomodoroRunning(false);
    await Notifications.cancelAllScheduledNotificationsAsync();
  };

  const toggleTheme   = () => setTheme(theme === "light" ? "dark" : "light");
  const toggleSidebar = () => setIsSidebarOpen((p) => !p);
  const firstName     = fullName.split(" ")[0];
  const weeklyHours   = weeklyData.map((d) => d.hours);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <GlowOrb size={160} primaryColor={T.purple} secondaryColor={T.orange} />
        <Mono color={T.purple} style={{ marginTop: 32, marginBottom: 8 }}>— Loading</Mono>
        <Text style={[styles.heroHeadline, { fontSize: 28, textAlign: "center", marginBottom: 16 }]}>
          Preparing your{"\n"}study space.
        </Text>
        <ActivityIndicator size="small" color={T.purple} />
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Pomodoro pill */}
        {pomodoroRunning && (
          <View style={styles.pomodoroPill}>
            <View style={styles.pomodoroDot} />
            <Text style={styles.pomodoroPillText}>Focus active</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ════════════════════════════════════════════════════════════════
              HERO — orb + greeting + streak  (inspired by images 2 & 3)
          ════════════════════════════════════════════════════════════════ */}
          <Animated.View style={[styles.heroSection, { opacity: masterOpa, transform: [{ translateY: heroSlide }] }]}>

            {/* Background glow bleeds */}
            <View style={[styles.heroBgBleed, { left: -60, backgroundColor: T.purple }]} />
            <View style={[styles.heroBgBleed, { right: -40, top: 40, backgroundColor: T.orange, width: 200, height: 200 }]} />

            {/* Top bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={toggleSidebar} style={styles.topBarBtn} activeOpacity={0.7}>
                <MaterialIcons name="menu" size={20} color={T.textMuted} />
              </TouchableOpacity>
              <View style={styles.topBarCenter}>
                <View style={styles.topBarDot} />
                <Text style={styles.topBarLabel}>NoteTedd</Text>
              </View>
              <TouchableOpacity onPress={toggleTheme} style={styles.topBarBtn} activeOpacity={0.7}>
                <MaterialIcons name={theme === "dark" ? "wb-sunny" : "brightness-3"} size={18} color={T.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Greeting + headline row */}
            <View style={styles.greetingRow}>
              <View style={styles.greetingLeft}>
                <Mono color={T.purple} style={{ marginBottom: 10 }}>— {getGreeting()}</Mono>
                {/* Image-2 style: massive italic headline */}
                <Text style={styles.heroHeadline}>{getMotivation()}</Text>
                {/* Orange bar divider */}
                <View style={styles.heroDividerRow}>
                  <View style={styles.orangeAccentBar} />
                  <Text style={styles.heroNameLine}>{firstName}</Text>
                </View>
              </View>

              {/* Floating orb — image 3 inspiration */}
              <Animated.View style={{ transform: [{ translateY: orbFloat }] }}>
                <GlowOrb size={130} primaryColor={T.purple} secondaryColor={T.orange} />
              </Animated.View>
            </View>

            {/* Streak pill + activity row */}
            <View style={styles.heroBottomRow}>
              {streakCount > 0 && (
                <Animated.View style={{ transform: [{ scale: Animated.multiply(streakScale, streakPulse) }] }}>
                  <View style={[styles.streakPill, {
                    backgroundColor: streakCount >= 25 ? "rgba(124,58,237,0.18)" : "rgba(234,88,12,0.18)",
                    borderColor:     streakCount >= 25 ? `${T.purple}55` : `${T.orange}55`,
                    shadowColor:     streakCount >= 25 ? T.purple : T.orange,
                  }]}>
                    <View style={[styles.streakDot, { backgroundColor: streakCount >= 25 ? T.purple : T.orange, shadowColor: streakCount >= 25 ? T.purple : T.orange }]} />
                    <Mono color={streakCount >= 25 ? T.purple : T.orange}>{streakCount}-day streak</Mono>
                  </View>
                </Animated.View>
              )}
              <TouchableOpacity onPress={() => navigation.navigate("RecordScreen")} activeOpacity={0.8} style={styles.heroRecordBtn}>
                <MaterialIcons name="mic" size={15} color={T.text} />
                <Text style={styles.heroRecordBtnText}>Record</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: masterOpa }}>

            {/* ════════════════════════════════════════════════════════════════
                STATS — 3 tiles, image-3 style with mini charts
            ════════════════════════════════════════════════════════════════ */}
            <View style={styles.statsSection}>
              <View style={styles.statsGrid}>
                <StatTile label="Hours"   value={totalHours.toString()} accent={T.orange} delay={200} chartData={weeklyHours} />
                <StatTile label="Notes"   value={notesCount.toString()} accent={T.purple} delay={310} />
                <StatTile label="Quizzes" value={quizzesCount.toString()} accent={T.orange} delay={420} />
              </View>
            </View>

            <HR mx={20} mt={8} />

            {/* ════════════════════════════════════════════════════════════════
                RECENT LECTURES — horizontal scroll cards (image-1 style)
            ════════════════════════════════════════════════════════════════ */}
            {recentLectures.length > 0 && (
              <View style={styles.lectureSection}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Mono color={T.textDim} style={{ marginBottom: 6 }}>— Recent Lectures</Mono>
                    <Text style={styles.sectionHeading}>
                      Continue where{"\n"}
                      <Text style={{ fontStyle: "italic", color: T.orange }}>you left off.</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate("NotesScreen", { theme })} activeOpacity={0.7} style={styles.seeAllBtn}>
                    <Mono color={T.purple}>All</Mono>
                    <MaterialIcons name="arrow-forward-ios" size={10} color={T.purple} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.lectureScrollRow}
                  snapToInterval={W * 0.64 + 12}
                  decelerationRate="fast"
                >
                  {recentLectures.map((lec) => (
                    <LectureScrollCard key={lec.id} lecture={lec} onPress={() => handleLecturePress(lec)} />
                  ))}
                </ScrollView>
              </View>
            )}

            <HR mx={20} mt={0} />

            {/* ════════════════════════════════════════════════════════════════
                FOCUS TIMER
            ════════════════════════════════════════════════════════════════ */}
            <View style={styles.widgetSection}>
              <Mono color={T.textDim} style={{ marginBottom: 14 }}>— Focus Timer</Mono>
              <PomodoroTimerWidget theme={theme} onSessionComplete={handlePomodoroComplete} onStart={handlePomodoroStart} onPause={handlePomodoroPause} />
            </View>

            <HR mx={20} mt={4} />

            {/* ════════════════════════════════════════════════════════════════
                WEEKLY ACTIVITY
            ════════════════════════════════════════════════════════════════ */}
            <View style={styles.widgetSection}>
              <Mono color={T.textDim} style={{ marginBottom: 14 }}>— Weekly Activity</Mono>
              <StudyAnalyticsWidget theme={theme} weeklyData={weeklyData} />
            </View>

            <HR mx={20} mt={4} />

            {/* ════════════════════════════════════════════════════════════════
                QUICK ACTIONS — vertical list (image-3 style, warm toned)
            ════════════════════════════════════════════════════════════════ */}
            <View style={styles.widgetSection}>
              <Mono color={T.textDim} style={{ marginBottom: 6 }}>— Quick Actions</Mono>
              <Text style={[styles.sectionHeading, { marginBottom: 20, fontSize: 22 }]}>
                What will you{" "}
                <Text style={{ fontStyle: "italic", color: T.purple }}>conquer?</Text>
              </Text>
              <View style={{ gap: 10 }}>
                <ActionBtn icon="mic"          label="Start Recording"   accent={T.purple} delay={600} onPress={() => handleQuickAction("Record")} />
                <ActionBtn icon="quiz"         label="Take a Quiz"        accent={T.orange} delay={680} onPress={() => handleQuickAction("Quiz")} />
                <ActionBtn icon="auto-stories" label="Browse Notes"       accent={T.purple} delay={760} onPress={() => handleQuickAction("Notes")} />
                <ActionBtn icon="event"        label="Schedule"           accent={T.orange} delay={840} onPress={() => handleQuickAction("Schedule")} />
              </View>
            </View>

            <HR mx={20} mt={4} />

            {/* ════════════════════════════════════════════════════════════════
                STUDY TIP
            ════════════════════════════════════════════════════════════════ */}
            <View style={[styles.widgetSection, { paddingBottom: 44 }]}>
              <View style={styles.tipCard}>
                {/* Inner glow top */}
                <View style={{ position: "absolute", top: -20, left: W * 0.1, width: 120, height: 80, borderRadius: 40, backgroundColor: T.orange, opacity: 0.08 }} />
                <CB pos="top-left"     color={T.orange} s={12} />
                <CB pos="top-right"    color={T.orange} s={12} />
                <CB pos="bottom-left"  color={T.purple} s={12} />
                <CB pos="bottom-right" color={T.purple} s={12} />
                <Mono color={T.orange} style={{ marginBottom: 12 }}>— Daily Tip</Mono>
                <Text style={styles.tipText}>
                  Review your notes within{" "}
                  <Text style={{ color: T.orange, fontStyle: "italic" }}>24 hours</Text>
                  {" "}of recording to boost long-term retention by up to 80%. Spaced repetition is your secret weapon.
                </Text>
              </View>
            </View>

          </Animated.View>
        </ScrollView>

        {/* ── Bottom Nav (image-2 style) ────────────────────────────────── */}
        <View style={styles.bottomNav}>
          {[
            { id: "home", icon: "home", label: "Home" },
            { id: "notes", icon: "auto-stories", label: "Notes" },
            { id: "record", icon: "mic", label: "Record", accent: true },
            { id: "quiz", icon: "quiz", label: "Quiz" },
            { id: "analytics", icon: "bar-chart", label: "Stats" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const isAccent = tab.accent;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "notes")     navigation.navigate("NotesScreen", { theme });
                  if (tab.id === "record")    navigation.navigate("RecordScreen");
                  if (tab.id === "quiz")      navigation.navigate("QuizScreen", { theme });
                }}
                style={styles.bottomNavItem}
                activeOpacity={0.7}
              >
                {isAccent ? (
                  <View style={styles.bottomNavAccentBtn}>
                    <MaterialIcons name={tab.icon} size={22} color="#fff" />
                  </View>
                ) : (
                  <>
                    <MaterialIcons
                      name={tab.icon}
                      size={22}
                      color={isActive ? T.purple : T.textDim}
                    />
                    {isActive && <View style={styles.bottomNavDot} />}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Modals */}
        <Modal animationType="slide" transparent visible={isSidebarOpen} onRequestClose={toggleSidebar}>
          <TouchableOpacity style={styles.sidebarOverlay} activeOpacity={1} onPress={toggleSidebar}>
            <Sidebar isOpen={isSidebarOpen} onClose={toggleSidebar} theme={theme} navigation={navigation} onThemeToggle={toggleTheme} />
          </TouchableOpacity>
        </Modal>
        <AchievementModal visible={showAchievement} achievement={currentAchievement} onClose={() => setShowAchievement(false)} theme={theme} />
      </View>

      {auth.currentUser && (
        <TeddComponent
          userId={auth.currentUser.uid}
          geminiApiKey={process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY}
          currentScreen="Home"
          context={{ userName: fullName, studyAnalytics: { currentStreak: streakCount, totalHours: parseFloat(totalHours) }, recentActivity: recentLectures.slice(0,1).map((l) => ({ type: "lecture_viewed", description: `Viewing: ${l.title}`, timestamp: new Date() })) }}
          onNavigate={(screen, params) => navigation.navigate(screen, params)}
          onActionExecute={(actionType) => { if (actionType === "startRecording") navigation.navigate("RecordScreen"); }}
        />
      )}
    </>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  scroll: { paddingBottom: 90 },

  // ── Pomodoro ────────────────────────────────────────────────────────────────
  pomodoroPill: {
    position: "absolute", top: Platform.OS === "ios" ? 54 : 42, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(124,58,237,0.14)", borderWidth: 1, borderColor: "rgba(124,58,237,0.3)",
    zIndex: 200,
  },
  pomodoroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.purple, shadowColor: T.purple, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 5 },
  pomodoroPillText: { fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", color: T.text },

  // ── Hero ────────────────────────────────────────────────────────────────────
  heroSection: {
    paddingTop: Platform.OS === "ios" ? 60 : 46,
    paddingHorizontal: 20,
    paddingBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  heroBgBleed: {
    position: "absolute", top: -30, width: 240, height: 240, borderRadius: 120, opacity: 0.13,
  },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  topBarBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: T.border, justifyContent: "center", alignItems: "center" },
  topBarCenter: { flexDirection: "row", alignItems: "center", gap: 7 },
  topBarDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: T.purple, shadowColor: T.purple, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6 },
  topBarLabel: { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: T.textMuted },

  greetingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  greetingLeft: { flex: 1, paddingRight: 12 },

  // Image 2 style: massive headline
  heroHeadline: { fontFamily: SERIF, fontSize: 34, fontWeight: "900", color: T.text, lineHeight: 40, letterSpacing: -1, marginBottom: 18 },
  heroDividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  orangeAccentBar: { width: 2, height: 24, backgroundColor: T.orange, borderRadius: 1, shadowColor: T.orange, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6 },
  heroNameLine: { fontFamily: SERIF, fontSize: 17, fontWeight: "700", color: T.textMuted, fontStyle: "italic" },

  heroBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 4 },
  streakDot: { width: 7, height: 7, borderRadius: 3.5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5 },
  heroRecordBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: T.purple, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, shadowColor: T.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  heroRecordBtnText: { fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: T.text, fontWeight: "600" },

  // ── Stats ────────────────────────────────────────────────────────────────────
  statsSection: { paddingHorizontal: 20, paddingVertical: 20 },
  statsGrid: { flexDirection: "row", gap: 10 },
  statTile: {
    flex: 1, borderRadius: 16, padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, position: "relative", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  statNum: { fontFamily: SERIF, fontSize: 30, fontWeight: "900", letterSpacing: -1 },

  // ── Lecture cards ─────────────────────────────────────────────────────────────
  lectureSection: { paddingTop: 24, paddingBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, marginBottom: 16 },
  sectionHeading: { fontFamily: SERIF, fontSize: 24, fontWeight: "900", color: T.text, lineHeight: 30, letterSpacing: -0.5 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  lectureScrollRow: { paddingLeft: 20, paddingRight: 8, gap: 12 },
  lectureScrollCard: {
    width: W * 0.62, borderRadius: 20, padding: 20, borderWidth: 1,
    overflow: "hidden", position: "relative",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  lectureScrollTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  progressPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  progressPillText: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, fontWeight: "700" },
  lectureScrollTitle: { fontFamily: SERIF, fontSize: 16, fontWeight: "700", color: T.text, lineHeight: 22 },
  lectureArrowBtn: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  lectureProgressTrack: { height: 2, backgroundColor: T.border, borderRadius: 1, overflow: "hidden", marginTop: 14 },
  lectureProgressFill: { height: "100%", borderRadius: 1 },

  // ── Widgets ──────────────────────────────────────────────────────────────────
  widgetSection: { paddingHorizontal: 20, paddingTop: 24 },

  // ── Action buttons ────────────────────────────────────────────────────────────
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1, padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden", position: "relative",
  },
  actionBtnIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  actionBtnLabel: { fontFamily: SERIF, fontSize: 16, fontWeight: "700", color: T.text },

  // ── Tip ───────────────────────────────────────────────────────────────────────
  tipCard: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: T.border, borderRadius: 18, padding: 22, position: "relative", overflow: "hidden" },
  tipText: { fontFamily: SERIF, fontSize: 14, color: T.textMuted, lineHeight: 22 },

  // ── Bottom nav ────────────────────────────────────────────────────────────────
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingHorizontal: 16, paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    backgroundColor: "rgba(8,8,15,0.96)",
    borderTopWidth: 1, borderTopColor: T.border,
    backdropFilter: "blur(20px)",
  },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  bottomNavDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: T.purple, marginTop: 4 },
  bottomNavAccentBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: T.purple,
    justifyContent: "center", alignItems: "center",
    shadowColor: T.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 14, elevation: 10,
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  sidebarOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
});