import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import TeddComponent from "../components/tedd/TeddComponent";
import AchievementModal from "../components/widgets/AchievementModal";
import PomodoroTimerWidget from "../components/widgets/PomodoroTimerWidget";
import StudyAnalyticsWidget from "../components/widgets/StudyAnalyticsWidget";
import Sidebar from "./Sidebar";
import { useTheme } from "./context/ThemeContext";
import { useSidebar } from "./hooks/useSidebar";

// ─── Theme System ─────────────────────────────────────────────────────────────
// Single source of truth — call with isDark to get the full palette
const getC = (isDark) => ({
  // Canvas layers
  bg: isDark ? "#0d0d0f" : "#f4f1ec",
  bgMid: isDark ? "#131315" : "#ebe7e0",
  bgSurf: isDark ? "#191a1c" : "#e2ddd5",
  bgCard: isDark ? "#1e1f22" : "#ffffff",
  bgRim: isDark ? "#2b2c30" : "#cdc8bf",

  // Glassmorphism layers
  glass: isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.65)",
  glassBorder: isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.85)",

  // Typography
  text: isDark ? "#f0ece3" : "#1c1916",
  textSub: isDark ? "#9b958b" : "#5e5a55",
  textMuted: isDark ? "#f4f4ea" : "#070707",

  // THE accent — original #ff6432
  orange: "#ff6432",
  orangeDim: isDark ? "rgba(255,100,50,0.13)" : "rgba(255,100,50,0.10)",
  orangeMid: isDark ? "rgba(255,100,50,0.22)" : "rgba(255,100,50,0.18)",
  orangeShadow: "rgba(255,100,50,0.40)",

  // Support accents
  sage: "#5d8f63",

  // Dividers
  line: isDark ? "#212124" : "#dedad2",
  lineHot: isDark ? "#353538" : "#c5c1b8",

  // System
  statusBar: isDark ? "light-content" : "dark-content",
});

const { width: W } = Dimensions.get("window");

const SERIF = Platform.OS === "ios" ? "Georgia" : "serif";
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const BODY = Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif-light";
const LABEL = Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif-medium";

// ─── Background task ──────────────────────────────────────────────────────────
const POMODORO_TASK_NAME = "POMODORO_BACKGROUND_TASK";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
TaskManager.defineTask(POMODORO_TASK_NAME, async () => {
  try {
    const raw = await AsyncStorage.getItem("pomodoroState");
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;
    const state = JSON.parse(raw);
    if (state.isActive && state.endTime && Date.now() >= state.endTime) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: state.type === "work" ? "Session Complete!" : "Break Over!",
          body: "",
          sound: true,
        },
        trigger: null,
      });
      await AsyncStorage.setItem(
        "pomodoroState",
        JSON.stringify({ ...state, isActive: false, timeLeft: 0 }),
      );
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── CARTOON AVATAR ───────────────────────────────────────────────────────────
// Warm, friendly character with graduation cap — built from Views
const CartoonAvatar = ({ C, size = 82 }) => {
  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -6,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 2,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    const doBlink = () => {
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.08,
          duration: 75,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 75,
          useNativeDriver: true,
        }),
      ]).start(() => setTimeout(doBlink, 2400 + Math.random() * 2800));
    };
    const t = setTimeout(doBlink, 1200);
    return () => clearTimeout(t);
  }, []);

  const s = size;
  const skinTone = "#FDDBB4";
  const hairColor = "#3b2418";
  const capColor = C.orange;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: float }],
        alignItems: "center",
        marginTop: 8,
      }}
    >
      {/* Soft halo ring behind avatar */}
      <View
        style={{
          width: s + 22,
          height: s + 22,
          borderRadius: (s + 22) / 2,
          backgroundColor: C.orangeDim,
          borderWidth: 1.5,
          borderColor: C.orangeMid,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* HEAD */}
        <View
          style={{
            width: s,
            height: s,
            borderRadius: s / 2,
            backgroundColor: skinTone,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          {/* HAIR — main top mass */}
          <View
            style={{
              position: "absolute",
              top: -s * 0.06,
              width: s * 0.62,
              height: s * 0.3,
              borderRadius: s * 0.15,
              backgroundColor: hairColor,
            }}
          />
          {/* Side hair left */}
          <View
            style={{
              position: "absolute",
              top: s * 0.06,
              left: -s * 0.03,
              width: s * 0.16,
              height: s * 0.35,
              borderRadius: s * 0.08,
              backgroundColor: hairColor,
            }}
          />
          {/* Side hair right */}
          <View
            style={{
              position: "absolute",
              top: s * 0.06,
              right: -s * 0.03,
              width: s * 0.16,
              height: s * 0.35,
              borderRadius: s * 0.08,
              backgroundColor: hairColor,
            }}
          />

          {/* CHEEK BLUSHES */}
          <View
            style={{
              position: "absolute",
              bottom: s * 0.22,
              left: s * 0.07,
              width: s * 0.2,
              height: s * 0.1,
              borderRadius: s * 0.05,
              backgroundColor: "#f59090",
              opacity: 0.5,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: s * 0.22,
              right: s * 0.07,
              width: s * 0.2,
              height: s * 0.1,
              borderRadius: s * 0.05,
              backgroundColor: "#f59090",
              opacity: 0.5,
            }}
          />

          {/* EYES */}
          <View
            style={{
              position: "absolute",
              top: s * 0.3,
              flexDirection: "row",
              gap: s * 0.18,
            }}
          >
            {[0, 1].map((idx) => (
              <Animated.View
                key={idx}
                style={{ transform: [{ scaleY: blink }] }}
              >
                <View
                  style={{
                    width: s * 0.17,
                    height: s * 0.17,
                    borderRadius: s * 0.085,
                    backgroundColor: "#2b1a0a",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Eye shine */}
                  <View
                    style={{
                      position: "absolute",
                      top: 1.5,
                      right: 1.5,
                      width: s * 0.055,
                      height: s * 0.055,
                      borderRadius: s * 0.028,
                      backgroundColor: "#fff",
                    }}
                  />
                </View>
              </Animated.View>
            ))}
          </View>

          {/* SMILE */}
          <View
            style={{
              position: "absolute",
              bottom: s * 0.16,
              width: s * 0.4,
              height: s * 0.2,
              borderBottomLeftRadius: s * 0.2,
              borderBottomRightRadius: s * 0.2,
              borderWidth: 2.5,
              borderColor: "#2b1a0a",
              borderTopWidth: 0,
            }}
          />

          {/* GRADUATION CAP */}
          <View
            style={{
              position: "absolute",
              top: -s * 0.24,
              alignItems: "center",
            }}
          >
            {/* Board (flat top) */}
            <View
              style={{
                width: s * 0.72,
                height: s * 0.11,
                backgroundColor: capColor,
                borderRadius: 3,
                shadowColor: capColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 6,
              }}
            />
            {/* Cap body */}
            <View
              style={{
                marginTop: 1,
                width: s * 0.46,
                height: s * 0.2,
                backgroundColor: capColor,
                borderRadius: 4,
              }}
            />
            {/* Tassel string */}
            <View
              style={{
                position: "absolute",
                right: s * 0.06,
                top: s * 0.06,
                width: 1.5,
                height: s * 0.22,
                backgroundColor: skinTone,
              }}
            />
            {/* Tassel end */}
            <View
              style={{
                position: "absolute",
                right: s * 0.04,
                top: s * 0.26,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: skinTone,
              }}
            />
          </View>
        </View>
      </View>

      {/* Speech bubble */}
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          backgroundColor: C.bgCard,
          borderWidth: 1,
          borderColor: C.glassBorder,
          borderRadius: 10,
          paddingHorizontal: 7,
          paddingVertical: 3,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 6,
          elevation: 4,
        }}
      >
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 10,
            color: C.orange,
            fontStyle: "italic",
          }}
        >
          hi!
        </Text>
      </View>
    </Animated.View>
  );
};

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
const LoadingScreen = ({ isDark }) => {
  const C = getC(isDark);
  const opa = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opa, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(bar, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        opacity: opa,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StatusBar
        barStyle={C.statusBar}
        backgroundColor="transparent"
        translucent
      />
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 54,
          fontWeight: "700",
          color: C.text,
          letterSpacing: -2,
          marginBottom: 6,
        }}
      >
        NoteTedd
      </Text>
      <Text
        style={{
          fontFamily: LABEL,
          fontSize: 11,
          letterSpacing: 6,
          color: C.textMuted,
          textTransform: "uppercase",
          marginBottom: 52,
        }}
      >
        Learning Made Easier
      </Text>
      <View style={{ width: 120, height: 1.5, backgroundColor: C.bgRim }}>
        <Animated.View
          style={{
            height: 1.5,
            backgroundColor: C.orange,
            width: bar.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          }}
        />
      </View>
    </Animated.View>
  );
};

// ─── GLASS CARD ───────────────────────────────────────────────────────────────
const GlassCard = ({ children, C, style, p = 18 }) => (
  <View
    style={[
      {
        backgroundColor: C.glass,
        borderWidth: 1,
        borderColor: C.glassBorder,
        borderRadius: 18,
        padding: p,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 4,
      },
      style,
    ]}
  >
    {children}
  </View>
);

// ─── STAT BLOCK ───────────────────────────────────────────────────────────────
const StatBlock = ({ value, label, accent, C, delay = 0 }) => {
  const opa = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opa, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.spring(y, {
          toValue: 0,
          tension: 80,
          friction: 12,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);
  return (
    <Animated.View
      style={{
        flex: 1,
        alignItems: "center",
        opacity: opa,
        transform: [{ translateY: y }],
      }}
    >
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 27,
          fontWeight: "700",
          color: accent ? C.orange : C.text,
          letterSpacing: -1,
          lineHeight: 33,
        }}
      >
        {value}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
        }}
      >
        {accent && (
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: C.orange,
            }}
          />
        )}
        <Text
          style={{
            fontFamily: LABEL,
            fontSize: 10,
            letterSpacing: 1.5,
            color: C.textMuted,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
};

// ─── ACTIVITY BARS ────────────────────────────────────────────────────────────
const ActivityBars = ({ data = [], C }) => {
  const vals = data.slice(-7);
  const max = Math.max(...vals.map((d) => d.hours || 0), 0.1);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 7,
        height: 68,
      }}
    >
      {vals.map((d, i) => {
        const isToday = i === vals.length - 1;
        const pct = Math.max(5, ((d.hours || 0) / max) * 100);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 6,
              height: "100%",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                flex: 1,
                width: "100%",
                backgroundColor: C.bgSurf,
                borderRadius: 5,
                justifyContent: "flex-end",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: "100%",
                  height: `${pct}%`,
                  borderRadius: 5,
                  backgroundColor: isToday ? C.orange : C.bgRim,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: isToday ? C.orange : C.textMuted,
                letterSpacing: 0.5,
              }}
            >
              {d.label || d.day?.[0] || "?"}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ─── LECTURE ROW ──────────────────────────────────────────────────────────────
const LectureRow = ({ lecture, onPress, index, C }) => {
  const opa = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 70 + 200),
      Animated.parallel([
        Animated.timing(opa, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.spring(x, {
          toValue: 0,
          tension: 80,
          friction: 13,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.985, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  const indexLabel = String(index + 1).padStart(2, "0");
  return (
    <Animated.View
      style={{ opacity: opa, transform: [{ translateX: x }, { scale }] }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
            gap: 14,
          }}
        >
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: C.textMuted,
              width: 24,
            }}
          >
            {indexLabel}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: SERIF,
                fontSize: 15,
                color: C.text,
                letterSpacing: -0.2,
                marginBottom: 3,
              }}
            >
              {lecture.title}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                style={{ fontFamily: BODY, fontSize: 11, color: C.textMuted }}
              >
                {lecture.duration}
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 12 }}>·</Text>
              <Text
                style={{ fontFamily: BODY, fontSize: 11, color: C.textMuted }}
              >
                {lecture.date}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 0.5,
                color: lecture.progress >= 100 ? C.sage : C.textSub,
              }}
            >
              {lecture.progress}%
            </Text>
            <MaterialIcons
              name="arrow-forward"
              size={13}
              color={C.textMuted}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── ACTION TILE ──────────────────────────────────────────────────────────────
const ActionTile = ({
  icon,
  label,
  sublabel,
  onPress,
  primary = false,
  C,
  delay = 0,
}) => {
  const opa = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(opa, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  return (
    <Animated.View
      style={{ width: (W - 48 - 10) / 2, opacity: opa, transform: [{ scale }] }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        style={{ flex: 1 }}
      >
        <View
          style={{
            borderRadius: 16,
            padding: 18,
            minHeight: 108,
            justifyContent: "space-between",
            borderWidth: 1,
            backgroundColor: primary ? C.orange : C.glass,
            borderColor: primary ? C.orange : C.glassBorder,
            shadowColor: primary ? C.orangeShadow : "#000",
            shadowOffset: { width: 0, height: primary ? 5 : 2 },
            shadowOpacity: primary ? 0.38 : 0.07,
            shadowRadius: primary ? 16 : 10,
            elevation: primary ? 9 : 3,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              marginBottom: 12,
              backgroundColor: primary ? "rgba(0,0,0,0.14)" : C.bgSurf,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons
              name={icon}
              size={18}
              color={primary ? "#fff" : C.textSub}
            />
          </View>
          <View>
            <Text
              style={{
                fontFamily: LABEL,
                fontSize: 14,
                fontWeight: "700",
                letterSpacing: 0.2,
                marginBottom: 2,
                color: primary ? "#fff" : C.text,
              }}
            >
              {label}
            </Text>
            {sublabel ? (
              <Text
                style={{
                  fontFamily: BODY,
                  fontSize: 11,
                  color: primary ? "rgba(255,255,255,0.72)" : C.textMuted,
                }}
              >
                {sublabel}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── SECTION RULE ─────────────────────────────────────────────────────────────
const Rule = ({ label, C }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    }}
  >
    <Text
      style={{
        fontFamily: LABEL,
        fontSize: 10,
        letterSpacing: 3,
        color: C.textMuted,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
  </View>
);

// ─── ICON BUTTON ──────────────────────────────────────────────────────────────
const IconBtn = ({ name, onPress, C }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    style={{
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: C.glass,
      borderWidth: 1,
      borderColor: C.glassBorder,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <MaterialIcons name={name} size={18} color={C.textSub} />
  </TouchableOpacity>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { isOpen, openSidebar, closeSidebar } = useSidebar();
  const navigation = useNavigation();
  const auth = getAuth();
  const db = getFirestore();
  const { theme, setTheme } = useTheme();

  const isDark = theme !== "light";
  const C = getC(isDark);

  const [fullName, setFullName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [quizzesCount, setQuizzesCount] = useState(0);
  const [weeklyData, setWeeklyData] = useState([]);
  const [recentLectures, setRecentLectures] = useState([]);
  const [showAchievement, setShowAchievement] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState(null);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);

  const appStateRef = useRef(AppState.currentState);
  const soundRef = useRef(null);
  const notifRef = useRef(null);

  const masterOpa = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(headerY, {
        toValue: 0,
        tension: 55,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    setupNotifications();
    setupBackgroundFetch();
    checkPomodoroState();
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      try {
        notifRef.current?.remove();
      } catch {}
      soundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFullName(user?.displayName || "User");
        loadAllData().catch(() => setLoading(false));
      } else setLoading(false);
    });
    return () => unsub();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (auth.currentUser) {
        loadAllData().catch(() => {});
        checkPomodoroState();
      }
    }, []),
  );

  const setupNotifications = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const final =
        status !== "granted"
          ? (await Notifications.requestPermissionsAsync()).status
          : status;
      if (final !== "granted") return;
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("pomodoro", {
          name: "Pomodoro",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
        }).catch(() => {});
      notifRef.current = Notifications.addNotificationResponseReceivedListener(
        () => {
          try {
            navigation.navigate("HomeScreen");
          } catch {}
        },
      );
    } catch {}
  };

  const setupBackgroundFetch = async () => {
    try {
      if (!(await TaskManager.isTaskRegisteredAsync(POMODORO_TASK_NAME)))
        await BackgroundFetch.registerTaskAsync(POMODORO_TASK_NAME, {
          minimumInterval: 60,
          stopOnTerminate: false,
          startOnBoot: true,
        });
    } catch {}
  };

  const checkPomodoroState = async () => {
    try {
      const raw = await AsyncStorage.getItem("pomodoroState");
      if (raw) setPomodoroRunning(JSON.parse(raw).isActive || false);
    } catch {}
  };

  const handleAppStateChange = (next) => {
    if (appStateRef.current.match(/inactive|background/) && next === "active") {
      checkPomodoroState();
      if (auth.currentUser) loadAllData().catch(() => {});
    }
    appStateRef.current = next;
  };

  const playNotificationSound = async () => {
    try {
      if (Platform.OS === "android") return;
      let a;
      try {
        a = require("../assets/notification.mp3");
      } catch {
        return;
      }
      const { sound } = await Audio.Sound.createAsync(a, { shouldPlay: true });
      soundRef.current = sound;
    } catch {}
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      await Promise.all([
        calculateStreak(),
        loadStats(),
        loadWeeklyActivity(),
        loadRecentLectures(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const calculateStreak = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDocs(
        query(
          collection(db, "recordings"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
        ),
      );
      const days = new Set();
      const addDay = (ts) => {
        const d = ts.toDate();
        days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      };
      snap.forEach((d) => {
        if (d.data().createdAt) addDay(d.data().createdAt);
      });
      try {
        const as = await getDocs(
          query(
            collection(db, "userActivities"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
          ),
        );
        as.forEach((d) => {
          if (d.data().createdAt && d.data().type) addDay(d.data().createdAt);
        });
      } catch {}
      const sorted = Array.from(days).sort().reverse();
      const today = new Date(),
        key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const yday = new Date(today);
      yday.setDate(today.getDate() - 1);
      if (!sorted.includes(key(today)) && !sorted.includes(key(yday))) {
        setStreakCount(0);
        return;
      }
      let streak = 0,
        check = new Date(today);
      for (let i = 0; i < 365; i++) {
        if (sorted.includes(key(check))) {
          streak++;
          check.setDate(check.getDate() - 1);
        } else break;
      }
      setStreakCount(streak);
      await AsyncStorage.setItem("userStreak", streak.toString());
    } catch {
      const s = await AsyncStorage.getItem("userStreak");
      setStreakCount(s ? parseInt(s) : 0);
    }
  };

  const loadStats = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDocs(
        query(collection(db, "recordings"), where("userId", "==", user.uid)),
      );
      let dur = 0,
        notes = 0,
        quizzes = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.organizedNotes) notes++;
        if (data.quiz) quizzes++;
        dur += data.duration || (data.audioUrl ? 1800 : 0);
      });
      const hours = (dur / 3600).toFixed(1);
      setTotalHours(hours);
      setNotesCount(notes);
      setQuizzesCount(quizzes);
      await AsyncStorage.setItem(
        "stats",
        JSON.stringify({ hours, notes, quizzes }),
      );
    } catch {
      const s = await AsyncStorage.getItem("stats");
      if (s) {
        const p = JSON.parse(s);
        setTotalHours(p.hours || 0);
        setNotesCount(p.notes || 0);
        setQuizzesCount(p.quizzes || 0);
      }
    }
  };

  const loadWeeklyActivity = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const ago = new Date();
      ago.setDate(ago.getDate() - 7);
      const snap = await getDocs(
        query(
          collection(db, "recordings"),
          where("userId", "==", user.uid),
          where("createdAt", ">=", ago),
          orderBy("createdAt", "asc"),
        ),
      );
      const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const week = labels.map((day, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { day, label: day[0], hours: 0, date: d.toDateString() };
      });
      snap.forEach((d) => {
        const data = d.data();
        if (data.createdAt) {
          const ad = data.createdAt.toDate();
          const slot = week.find(
            (w) => new Date(w.date).toDateString() === ad.toDateString(),
          );
          if (slot) slot.hours += (data.duration || 1800) / 3600;
        }
      });
      week.forEach((w) => {
        w.hours = Math.round(w.hours * 10) / 10;
      });
      setWeeklyData(week);
    } catch {
      setWeeklyData(
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => ({
          day: d,
          label: d[0],
          hours: 0,
        })),
      );
    }
  };

  const loadRecentLectures = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDocs(
        query(
          collection(db, "recordings"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(6),
        ),
      );
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.organizedNotes) {
          const created = data.createdAt?.toDate() || new Date();
          list.push({
            id: d.id,
            title: data.organizedNotes.title || "Untitled Lecture",
            duration: `${Math.round((data.duration || 1800) / 60)} min`,
            date: getTimeAgo(created),
            progress: data.quiz ? 100 : 75,
          });
        }
      });
      setRecentLectures(list);
      await AsyncStorage.setItem("recentLectures", JSON.stringify(list));
    } catch {
      const s = await AsyncStorage.getItem("recentLectures");
      if (s) setRecentLectures(JSON.parse(s));
    }
  };

  const getTimeAgo = (date) => {
    const diff = new Date() - date,
      h = Math.floor(diff / 3600000),
      d = Math.floor(diff / 86400000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d}d ago`;
    return date.toLocaleDateString();
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 5) return "Night owl";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Night owl";
  };

  const getDayDate = () =>
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  const handleLecturePress = async (lecture) => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "Sign in required");
        setLoading(false);
        return;
      }
      const docSnap = await getDoc(doc(db, "recordings", lecture.id));
      if (!docSnap.exists() || docSnap.data().userId !== user.uid) {
        Alert.alert("Error", "Lecture unavailable");
        setLoading(false);
        return;
      }
      const data = docSnap.data();
      await AsyncStorage.setItem(
        "selectedLecture",
        JSON.stringify({ id: lecture.id, ...data }),
      );
      setLoading(false);
      navigation.navigate("NotesScreen", {
        theme,
        lectureId: lecture.id,
        lectureData: data,
        refresh: Date.now(),
      });
    } catch {
      setLoading(false);
      Alert.alert("Error", "Failed to load lecture.");
    }
  };

  const handlePomodoroComplete = async (sessionType) => {
    await playNotificationSound();
    setCurrentAchievement({
      id: "pomo",
      icon: "timer",
      title: "Focused",
      description: `${sessionType} session done.`,
      color: C.orange,
      points: 25,
    });
    setShowAchievement(true);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: sessionType === "work" ? "Session complete." : "Break over.",
          body: "",
        },
        trigger: null,
      });
    } catch {}
    loadStats();
    setPomodoroRunning(false);
    await AsyncStorage.setItem(
      "pomodoroState",
      JSON.stringify({ isActive: false, timeLeft: 0 }),
    );
  };

  const handlePomodoroStart = async (duration, type) => {
    const endTime = Date.now() + duration * 60000;
    await AsyncStorage.setItem(
      "pomodoroState",
      JSON.stringify({
        isActive: true,
        endTime,
        type,
        timeLeft: duration * 60,
      }),
    );
    setPomodoroRunning(true);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: type === "work" ? "Session complete." : "Break over.",
          body: "",
        },
        trigger: { seconds: duration * 60 },
      });
    } catch {}
  };

  const handlePomodoroPause = async () => {
    await AsyncStorage.setItem(
      "pomodoroState",
      JSON.stringify({ isActive: false }),
    );
    setPomodoroRunning(false);
    await Notifications.cancelAllScheduledNotificationsAsync();
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  const toggleSidebar = () => setIsSidebarOpen((p) => !p);
  const firstName = fullName.split(" ")[0];

  if (loading) return <LoadingScreen isDark={isDark} />;

  return (
    <>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar
          barStyle={C.statusBar}
          backgroundColor="transparent"
          translucent
        />

        {/* Focus banner */}
        {pomodoroRunning && (
          <View
            style={{
              backgroundColor: C.orangeDim,
              borderBottomWidth: 1,
              borderBottomColor: C.orangeMid,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 10,
              paddingTop: Platform.OS === "ios" ? 54 : 42,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: C.orange,
              }}
            />
            <Text
              style={{
                fontFamily: LABEL,
                fontSize: 10,
                letterSpacing: 3,
                color: C.orange,
                textTransform: "uppercase",
              }}
            >
              Focus Session Active
            </Text>
          </View>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {/* ══════════════════════════════════════
              HERO
          ══════════════════════════════════════ */}
          <Animated.View
            style={{ opacity: masterOpa, transform: [{ translateY: headerY }] }}
          >
            {/* Subtle warm wash across top — not a bright orb */}
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 240,
                backgroundColor: isDark
                  ? "rgba(255,100,50,0.035)"
                  : "rgba(255,100,50,0.05)",
                borderBottomLeftRadius: 40,
                borderBottomRightRadius: 40,
              }}
            />

            {/* Top bar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 22,
                paddingTop: Platform.OS === "ios" ? 62 : 50,
                marginBottom: 22,
              }}
            >
              <IconBtn name="menu" onPress={toggleSidebar} C={C} />
              <Text
                style={{
                  fontFamily: LABEL,
                  fontSize: 11,
                  letterSpacing: 5,
                  color: C.textMuted,
                  textTransform: "uppercase",
                }}
              >
                NoteTedd
              </Text>
              <IconBtn
                name={isDark ? "wb-sunny" : "brightness-3"}
                onPress={toggleTheme}
                C={C}
              />
            </View>

            {/* Hero glass card */}
            <View style={{ paddingHorizontal: 22, marginBottom: 6 }}>
              <GlassCard C={C}>
                {/* Avatar + greeting row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 20,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text
                      style={{
                        fontFamily: LABEL,
                        fontSize: 10,
                        letterSpacing: 2,
                        color: C.textMuted,
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      {getDayDate()}
                    </Text>
                    <Text
                      style={{
                        fontFamily: SERIF,
                        fontSize: 30,
                        fontWeight: "400",
                        color: C.text,
                        lineHeight: 38,
                        letterSpacing: -0.8,
                      }}
                    >
                      {getGreeting()},{"\n"}
                      <Text style={{ fontStyle: "italic", color: C.orange }}>
                        {firstName}.
                      </Text>
                    </Text>

                    {streakCount > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          marginTop: 12,
                          alignSelf: "flex-start",
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          backgroundColor: C.orangeDim,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: C.orangeMid,
                        }}
                      >
                        <MaterialIcons
                          name="local-fire-department"
                          size={12}
                          color={C.orange}
                        />
                        <Text
                          style={{
                            fontFamily: LABEL,
                            fontSize: 11,
                            color: C.orange,
                          }}
                        >
                          {streakCount}-day streak
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Cartoon avatar — playful, warm */}
                  <CartoonAvatar C={C} size={82} />
                </View>

                {/* Record CTA */}
                <TouchableOpacity
                  onPress={() => navigation.navigate("RecordScreen")}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    backgroundColor: C.orange,
                    borderRadius: 12,
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    shadowColor: C.orangeShadow,
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.42,
                    shadowRadius: 14,
                    elevation: 9,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: "rgba(0,0,0,0.12)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons name="mic" size={16} color="#fff" />
                  </View>
                  <Text
                    style={{
                      fontFamily: LABEL,
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#fff",
                      letterSpacing: 0.2,
                    }}
                  >
                    Start Recording
                  </Text>
                  <MaterialIcons
                    name="arrow-forward"
                    size={16}
                    color="rgba(255,255,255,0.7)"
                    style={{ marginLeft: "auto" }}
                  />
                </TouchableOpacity>
              </GlassCard>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: masterOpa }}>
            {/* ══════════════════════════════════════
                STATS
            ══════════════════════════════════════ */}
            <View
              style={{ paddingHorizontal: 22, marginTop: 10, marginBottom: 4 }}
            >
              <GlassCard C={C} p={18}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <StatBlock
                    value={totalHours.toString()}
                    label="Hours"
                    accent
                    C={C}
                    delay={100}
                  />
                  <View
                    style={{ width: 1, height: 34, backgroundColor: C.line }}
                  />
                  <StatBlock
                    value={notesCount.toString()}
                    label="Notes"
                    C={C}
                    delay={200}
                  />
                  <View
                    style={{ width: 1, height: 34, backgroundColor: C.line }}
                  />
                  <StatBlock
                    value={quizzesCount.toString()}
                    label="Quizzes"
                    C={C}
                    delay={300}
                  />
                  {streakCount > 0 && (
                    <>
                      <View
                        style={{
                          width: 1,
                          height: 34,
                          backgroundColor: C.line,
                        }}
                      />
                      <StatBlock
                        value={`${streakCount}d`}
                        label="Streak"
                        C={C}
                        delay={400}
                      />
                    </>
                  )}
                </View>
              </GlassCard>
            </View>

            {/* ══════════════════════════════════════
                WEEKLY ACTIVITY
            ══════════════════════════════════════ */}
            {weeklyData.length > 0 && (
              <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                <Rule label="This Week" C={C} />
                <GlassCard C={C}>
                  <ActivityBars data={weeklyData} C={C} />
                </GlassCard>
              </View>
            )}

            {/* ══════════════════════════════════════
                RECENT LECTURES
            ══════════════════════════════════════ */}
            {recentLectures.length > 0 && (
              <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                <Rule label="Recent Lectures" C={C} />
                <GlassCard
                  C={C}
                  p={0}
                  style={{ paddingHorizontal: 18, paddingTop: 4 }}
                >
                  {recentLectures.map((lec, i) => (
                    <LectureRow
                      key={lec.id}
                      lecture={lec}
                      index={i}
                      C={C}
                      onPress={() => handleLecturePress(lec)}
                    />
                  ))}
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("NotesScreen", { theme })
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 16,
                      alignSelf: "flex-start",
                    }}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={{
                        fontFamily: LABEL,
                        fontSize: 11,
                        letterSpacing: 1.5,
                        color: C.orange,
                        textTransform: "uppercase",
                      }}
                    >
                      All notes
                    </Text>
                    <MaterialIcons
                      name="arrow-forward-ios"
                      size={10}
                      color={C.orange}
                    />
                  </TouchableOpacity>
                </GlassCard>
              </View>
            )}

            {/* ══════════════════════════════════════
                FOCUS TIMER
            ══════════════════════════════════════ */}
            <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
              <Rule label="Focus Timer" C={C} />
              <GlassCard C={C} p={0} style={{ overflow: "hidden" }}>
                <PomodoroTimerWidget
                  theme={theme}
                  onSessionComplete={handlePomodoroComplete}
                  onStart={handlePomodoroStart}
                  onPause={handlePomodoroPause}
                />
              </GlassCard>
            </View>

            {/* ══════════════════════════════════════
                ANALYTICS
            ══════════════════════════════════════ */}
            <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
              <Rule label="Analytics" C={C} />
              <GlassCard C={C} p={0} style={{ overflow: "hidden" }}>
                <StudyAnalyticsWidget theme={theme} weeklyData={weeklyData} />
              </GlassCard>
            </View>

            {/* ══════════════════════════════════════
                ACTIONS
            ══════════════════════════════════════ */}
            <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
              <Rule label="Quick Actions" C={C} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <ActionTile
                  icon="mic"
                  label="Record"
                  sublabel="New session"
                  primary
                  C={C}
                  delay={300}
                  onPress={() => navigation.navigate("RecordScreen")}
                />
                <ActionTile
                  icon="quiz"
                  label="Quiz"
                  sublabel="Test recall"
                  C={C}
                  delay={380}
                  onPress={() => navigation.navigate("QuizScreen", { theme })}
                />
                <ActionTile
                  icon="auto-stories"
                  label="Notes"
                  sublabel="Your library"
                  C={C}
                  delay={460}
                  onPress={() => navigation.navigate("NotesScreen", { theme })}
                />
                <ActionTile
                  icon="event"
                  label="Schedule"
                  sublabel="Coming soon"
                  C={C}
                  delay={540}
                  onPress={() =>
                    Alert.alert("Coming Soon", "Schedule is on the way.")
                  }
                />
              </View>
            </View>

            {/* ══════════════════════════════════════
                DAILY TIP
            ══════════════════════════════════════ */}
            <View
              style={{
                paddingHorizontal: 22,
                paddingTop: 20,
                paddingBottom: 20,
              }}
            >
              <Rule label="Daily Insight" C={C} />
              <GlassCard C={C}>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={{
                      width: 2.5,
                      backgroundColor: C.orange,
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: SERIF,
                        fontStyle: "italic",
                        fontSize: 16,
                        color: C.textSub,
                        lineHeight: 25,
                        letterSpacing: -0.2,
                      }}
                    >
                      "Review within 24 hours. Long-term retention jumps by up
                      to 80%."
                    </Text>
                    <Text
                      style={{
                        fontFamily: LABEL,
                        fontSize: 10,
                        letterSpacing: 2,
                        color: C.textMuted,
                        textTransform: "uppercase",
                        marginTop: 12,
                      }}
                    >
                      Spaced Repetition Research
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </View>
          </Animated.View>
        </ScrollView>

        {/* Sidebar */}
        <Modal
          animationType="slide"
          transparent
          visible={isSidebarOpen}
          onRequestClose={toggleSidebar}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
            activeOpacity={1}
            onPress={toggleSidebar}
          >
            <Sidebar
              isOpen={isSidebarOpen}
              onClose={toggleSidebar}
              theme={theme}
              navigation={navigation}
              onThemeToggle={toggleTheme}
            />
          </TouchableOpacity>
        </Modal>

        <AchievementModal
          visible={showAchievement}
          achievement={currentAchievement}
          onClose={() => setShowAchievement(false)}
          theme={theme}
        />
      </View>

      {auth.currentUser && (
        <TeddComponent
          userId={auth.currentUser.uid}
          geminiApiKey={
            process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY
          }
          currentScreen="Home"
          context={{
            userName: fullName,
            studyAnalytics: {
              currentStreak: streakCount,
              totalHours: parseFloat(totalHours),
            },
            recentActivity: recentLectures
              .slice(0, 1)
              .map((l) => ({
                type: "lecture_viewed",
                description: `Viewing: ${l.title}`,
                timestamp: new Date(),
              })),
          }}
          onNavigate={(screen, params) => navigation.navigate(screen, params)}
          onActionExecute={(actionType) => {
            if (actionType === "startRecording")
              navigation.navigate("RecordScreen");
          }}
        />
      )}
    </>
  );
}
