import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "./context/ThemeContext";
import useFeatureGate from "./hooks/useFeatureGate";
import { FEATURES } from "../RevenueCatConfig";
import TrialBanner from "./components/TrialBanner";
import UsageMeter from "./components/UsageMeter";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Animated, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, StatusBar,
  useWindowDimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import haptics from "./utils/haptics";
import {
  getFirestore, collection, query, where, orderBy,
  getDocs, doc, updateDoc,
} from "firebase/firestore";
import { logUserActivity } from "./utils/userActivity";
import { getAuth } from "firebase/auth";

// ─── Keys from env — never hardcode ──────────────────────────────────────────
const GROQ_API_KEY   = process.env.EXPO_PUBLIC_GROQ_API_KEY   ?? "";
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GROQ_API_URL   = "https://api.groq.com/openai/v1/chat/completions";
// I use v1beta which is the stable path for gemini-2.0-flash
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ════════════════════════════════════════════════════════════════
//  SECTION 1 — CONSTANTS (unchanged from original)
// ════════════════════════════════════════════════════════════════

const DIFFICULTY_MODES = {
  simple: {
    label: "Simple", icon: "sentiment-satisfied",
    color: "#10B981", gradient: ["#10B981", "#059669"],
    description: "Recall & basic understanding", count: "8–10 questions",
  },
  medium: {
    label: "Medium", icon: "sentiment-neutral",
    color: "#F59E0B", gradient: ["#F59E0B", "#D97706"],
    description: "Application & analysis", count: "10–12 questions",
  },
  difficult: {
    label: "Difficult", icon: "sentiment-very-dissatisfied",
    color: "#EF4444", gradient: ["#EF4444", "#DC2626"],
    description: "Synthesis & evaluation", count: "12–15 questions",
  },
};

const ANSWER_STATE = {
  IDLE: "idle", TYPING: "typing", SUBMITTED: "submitted",
  CORRECT: "correct", PARTIAL: "partial", INCORRECT: "incorrect",
};

// ════════════════════════════════════════════════════════════════
//  SECTION 2 — SECURITY HELPERS (unchanged from original)
// ════════════════════════════════════════════════════════════════

const sanitiseInput = (text, maxLength = 500) => {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
};

const createRateLimiter = (limitMs = 2000) => {
  const lastCall = {};
  return (key) => {
    const now = Date.now();
    if (lastCall[key] && now - lastCall[key] < limitMs) return false;
    lastCall[key] = now;
    return true;
  };
};

const apiRateLimiter = createRateLimiter(2000);

// ════════════════════════════════════════════════════════════════
//  SECTION 3 — DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════

/**
 * I keep a flat token object for dark surfaces and a separate
 * override object for light surfaces. useC(isDark) merges them
 * at the point of use so every colour reference is always correct.
 */
const T = {
  bg:         "#04040a",
  bgEl:       "#090914",
  bgCard:     "#0d0d1a",
  bgCardAlt:  "#111120",
  bgInput:    "#14142a",
  glass:      "rgba(255,255,255,0.025)",
  border:     "rgba(255,255,255,0.07)",
  borderMid:  "rgba(255,255,255,0.13)",
  text:       "#ede9ff",
  textSub:    "rgba(237,233,255,0.68)",
  textMuted:  "rgba(237, 233, 255, 0.71)",
  textDim:    "rgba(237, 233, 255, 0.62)",
  scrim:      "rgba(4,4,10,0.94)",

  // Brand
  violet:     "#5b21b6", violetMid: "#7c3aed", violetBr: "#a78bfa",
  ember:      "#ea580c", emberBr:   "#fb923c",
  teal:       "#0d9488", tealBr:    "#2dd4bf",
  gold:       "#d97706", goldBr:    "#fbbf24",
  success:    "#059669", successBr: "#34d399",
  danger:     "#dc2626", dangerBr:  "#f87171",
  rose:       "#e11d48", roseBr:    "#fb7185",

  // Alpha helpers
  va: (a) => `rgba(91,33,182,${a})`,
  ea: (a) => `rgba(234,88,12,${a})`,
  ta: (a) => `rgba(13,148,136,${a})`,
  ga: (a) => `rgba(217,119,6,${a})`,
  sa: (a) => `rgba(5,150,105,${a})`,
  da: (a) => `rgba(220,38,38,${a})`,
  wa: (a) => `rgba(255,255,255,${a})`,
  ba: (a) => `rgba(0,0,0,${a})`,
};

const L = {
  bg:        "#f5f3ff", bgEl:      "#ffffff", bgCard:    "#ffffff",
  bgCardAlt: "#f0ecff", bgInput:   "#ede9ff",
  glass:     "rgba(91,33,182,0.03)",
  border:    "rgba(91,33,182,0.08)", borderMid: "rgba(91,33,182,0.18)",
  text:      "#1e1033", textSub:   "rgba(30,16,51,0.68)",
  textMuted: "rgba(30,16,51,0.44)", textDim:   "rgba(30,16,51,0.24)",
  scrim:     "rgba(245,243,255,0.96)",
};

const useC = (isDark) => ({ ...T, ...(isDark ? {} : L) });

// I use platform-native typefaces for authenticity on each OS.
const DISPLAY = Platform.select({ ios: "Georgia",        default: "serif" });
const SANS    = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const MONO    = Platform.select({ ios: "Menlo",          default: "monospace" });

// I use an 8-pt spacing grid throughout.
const sp = (n) => n * 8;

// ════════════════════════════════════════════════════════════════
//  SECTION 4 — SHARED ATOMS
//  I define these outside the component so they never re-mount.
// ════════════════════════════════════════════════════════════════

const Label = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 3.5, textTransform: "uppercase", color }, style]}>
    {children}
  </Text>
);

const Corner = ({ pos, color, size = 10 }) => {
  const isTop = pos.includes("top"), isLft = pos.includes("left");
  const base  = { position: "absolute", [isTop ? "top" : "bottom"]: 0, [isLft ? "left" : "right"]: 0 };
  return (
    <View style={[base, { width: size, height: size }]} pointerEvents="none">
      <View style={{ ...base, width: size, height: 1.5, backgroundColor: color, opacity: 0.55 }} />
      <View style={{ ...base, width: 1.5, height: size,  backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
};

const Pill = ({ label, color, icon, small, style }) => (
  <View style={[{
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 3 : 5,
    borderRadius: 999,
    backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}33`,
  }, style]}>
    {icon && <MaterialIcons name={icon} size={small ? 9 : 10} color={color} />}
    <Label color={color} style={small && { fontSize: 8 }}>{label}</Label>
  </View>
);

// ─── Difficulty accent colours ─────────────────────────────────
// I centralise this so both the session list and quiz header
// can reference it consistently.
const diffColor = (d) => ({
  simple: "#10B981", easy: "#10B981",
  medium: "#F59E0B",
  difficult: "#EF4444", hard: "#EF4444",
}[d] || T.violetBr);

// I map question types to Material icon names.
const typeIcon = (type) => ({
  conceptual: "lightbulb", factual: "fact-check",
  application: "settings",  analysis: "analytics",
}[type] || "help-outline");

// ────────────────────────────────────────────────────────────────
//  ANSWER STATE STYLE — returns visual tokens for each result state.
// ────────────────────────────────────────────────────────────────
const answerStateConfig = (state) => ({
  [ANSWER_STATE.CORRECT]:   { accentColor: T.success,  bg: T.sa(0.09), icon: "check-circle",  label: "Correct" },
  [ANSWER_STATE.PARTIAL]:   { accentColor: T.gold,     bg: T.ga(0.09), icon: "adjust",        label: "Partial Credit" },
  [ANSWER_STATE.INCORRECT]: { accentColor: T.danger,   bg: T.da(0.09), icon: "cancel",        label: "Incorrect" },
}[state] || null);

// ════════════════════════════════════════════════════════════════
//  SECTION 5 — SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════

/** I render each session card in the list view. */
const SessionCard = ({ session, onStart, onGenerate, onRegen, generatingQuiz, canUse, colors, style }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, tension: 220 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, tension: 220 }).start();
  const hasQuiz  = !!session.quiz;
  const dc       = session.quiz?.difficulty ? diffColor(session.quiz.difficulty) : T.violetBr;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <View style={[A.sessionCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Corner pos="top-left"     color={T.violetBr} size={9} />
        <Corner pos="bottom-right" color={T.tealBr}   size={9} />

        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(2) }}>
          <View style={[A.sessionIconWrap, { backgroundColor: T.va(0.14) }]}>
            <MaterialIcons name="school" size={22} color={T.violetBr} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[A.sessionTitle, { color: colors.text }]} numberOfLines={1}>
              {session.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="calendar-today" size={11} color={colors.textDim} />
                <Label color={colors.textDim}>{session.date.toLocaleDateString()}</Label>
              </View>
              {hasQuiz && (
                <Pill small label={session.quiz.difficulty} color={dc} />
              )}
            </View>
          </View>
        </View>

        {/* Quiz stats or generate prompt */}
        {hasQuiz ? (
          <>
            <View style={[A.statsRow, { backgroundColor: T.va(0.06), borderColor: T.va(0.14) }]}>
              {[
                { icon: "quiz",         color: T.violetBr, text: `${session.quiz.questions.length} Qs` },
                { icon: "timelapse",    color: T.goldBr,   text: `~${Math.ceil(session.quiz.questions.length * 1.5)}m` },
                { icon: "psychology",   color: T.tealBr,   text: "AI graded" },
              ].map(({ icon, color, text }) => (
                <View key={icon} style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1, justifyContent: "center" }}>
                  <MaterialIcons name={icon} size={13} color={color} />
                  <Label color={colors.textMuted}>{text}</Label>
                </View>
              ))}
            </View>

            {/* I give start the majority of the width and make Regenerate a proper labelled button */}
            <View style={{ flexDirection: "row", gap: sp(1.5), marginTop: sp(2) }}>
              <TouchableOpacity
                style={[A.startBtn, { flex: 1, shadowColor: T.success }]}
                onPressIn={pressIn} onPressOut={pressOut}
                onPress={onStart}
                activeOpacity={0.85}
              >
                <View style={[A.startBtnInner, { backgroundColor: T.success }]}>
                  <MaterialIcons name="play-arrow" size={18} color="#fff" />
                  <Text style={A.startBtnTxt}>Start Quiz</Text>
                </View>
              </TouchableOpacity>

              {/* I replaced the icon-only regen button with a proper labelled pill */}
              <TouchableOpacity
                style={[A.regenBtn, { backgroundColor: T.va(0.1), borderColor: T.va(0.28) }]}
                onPress={onRegen}
                disabled={generatingQuiz || !canUse}
                activeOpacity={0.75}
              >
                {generatingQuiz
                  ? <ActivityIndicator size="small" color={T.violetBr} />
                  : <>
                      <MaterialIcons name="refresh" size={14} color={T.violetBr} />
                      <Text style={A.regenBtnTxt}>Regenerate</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity
            style={[A.generateBtn, { shadowColor: T.violet }]}
            onPress={onGenerate}
            disabled={generatingQuiz || !canUse}
            activeOpacity={0.85}
          >
            <View style={[A.generateBtnInner, { backgroundColor: T.violetMid, opacity: !canUse ? 0.5 : 1 }]}>
              {generatingQuiz
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <MaterialIcons name="auto-awesome" size={16} color="#fff" />
                    <Text style={A.generateBtnTxt}>
                      {canUse ? "Generate Quiz" : "Weekly Limit Reached"}
                    </Text>
                  </>
              }
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

/** I render a single question card during the quiz-taking view. */
const QuestionCard = React.memo(({
  question, index, colors, isDark,
  qState, isRevealed,
  onToggleInput, onTextChange, onSubmit, onToggleAnswer, onMarkComplete,
  completedQuestions, fadeAnim,
}) => {
  const stateConf   = answerStateConfig(qState?.state);
  const isAnswered  = [ANSWER_STATE.CORRECT, ANSWER_STATE.PARTIAL, ANSWER_STATE.INCORRECT].includes(qState?.state);
  const isTyping    = qState?.state === ANSWER_STATE.TYPING;
  const isCompleted = !!completedQuestions[question.id];
  const dc          = diffColor(question.difficulty);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={[
        A.questionCard,
        { backgroundColor: colors.bgCard, borderColor: stateConf ? `${stateConf.accentColor}30` : colors.border },
        stateConf && { borderLeftColor: stateConf.accentColor, borderLeftWidth: 3 },
      ]}>
        {/* Corner marks change colour when answered */}
        <Corner pos="top-left"     color={stateConf ? stateConf.accentColor : T.violetBr} size={9} />
        <Corner pos="bottom-right" color={stateConf ? T.goldBr : T.tealBr}                size={9} />

        {/* Question header */}
        <View style={A.qHead}>
          <View style={[A.qBubble, {
            backgroundColor: stateConf ? `${stateConf.accentColor}18` : T.va(0.12),
            borderColor:     stateConf ? `${stateConf.accentColor}44` : T.va(0.3),
          }]}>
            {stateConf
              ? <MaterialIcons name={stateConf.icon} size={20} color={stateConf.accentColor} />
              : <Text style={[A.qNum, { color: T.violetBr }]}>Q{index + 1}</Text>
            }
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Pill small label={question.difficulty || "—"} color={dc} />
            <MaterialIcons name={typeIcon(question.type)} size={14} color={colors.textDim} />
          </View>

          {/* Manual complete toggle */}
          <TouchableOpacity
            onPress={() => onMarkComplete(question.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name={isCompleted ? "check-circle" : "radio-button-unchecked"}
              size={22}
              color={isCompleted ? T.successBr : colors.textDim}
            />
          </TouchableOpacity>
        </View>

        {/* Question text */}
        <Text style={[A.qText, { color: colors.text }]}>{question.question}</Text>

        {/* Topic chip */}
        <View style={[A.topicChip, { backgroundColor: T.va(0.09), borderColor: T.va(0.2) }]}>
          <MaterialIcons name="label" size={11} color={T.violetBr} />
          <Label color={T.violetBr} style={{ letterSpacing: 2 }}>{question.topic}</Label>
        </View>

        {/* ── Answer input (only when not yet answered) ── */}
        {!isAnswered && (
          <View style={{ marginTop: sp(1.5) }}>
            <TouchableOpacity
              style={[A.typeBtn, {
                backgroundColor: isTyping ? T.va(0.1) : colors.bgCardAlt,
                borderColor:     isTyping ? T.va(0.35) : colors.borderMid,
              }]}
              onPress={() => onToggleInput(question.id)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={isTyping ? "edit-off" : "edit"} size={15} color={isTyping ? T.violetBr : colors.textMuted} />
              <Text style={[A.typeBtnTxt, { color: isTyping ? T.violetBr : colors.textMuted }]}>
                {isTyping ? "Cancel" : "Type your answer (optional)"}
              </Text>
            </TouchableOpacity>

            {isTyping && (
              <View style={[A.inputBox, { backgroundColor: colors.bgInput, borderColor: T.va(0.3) }]}>
                <Corner pos="top-left"  color={T.violetBr} size={8} />
                <TextInput
                  style={[A.textInput, { color: colors.text }]}
                  placeholder="Type your answer here…"
                  placeholderTextColor={colors.textDim}
                  value={qState?.text || ""}
                  onChangeText={(t) => onTextChange(question.id, t)}
                  multiline
                  maxLength={500}
                  returnKeyType="done"
                  blurOnSubmit
                  autoFocus
                />
                <View style={[A.inputFooter, { borderTopColor: colors.border }]}>
                  <Label color={colors.textDim}>{(qState?.text || "").length}/500</Label>
                  <TouchableOpacity
                    style={[A.submitBtn, {
                      backgroundColor: T.violetMid,
                      shadowColor: T.violet,
                      opacity: qState?.verifying ? 0.7 : 1,
                    }]}
                    onPress={() => onSubmit(question)}
                    disabled={qState?.verifying}
                    activeOpacity={0.85}
                  >
                    {qState?.verifying
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <MaterialIcons name="send" size={13} color="#fff" />
                          <Label color="#fff" style={{ letterSpacing: 2.5 }}>Submit</Label>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── AI feedback after submission ── */}
        {isAnswered && stateConf && (
          <View style={[A.feedbackBox, { backgroundColor: stateConf.bg, borderColor: `${stateConf.accentColor}33` }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <MaterialIcons name={stateConf.icon} size={16} color={stateConf.accentColor} />
              <Label color={stateConf.accentColor} style={{ letterSpacing: 3 }}>{stateConf.label}</Label>
            </View>
            {qState?.text ? (
              <Text style={[A.yourAnswerTxt, { color: colors.textMuted }]}>
                You wrote:{" "}
                <Text style={{ fontStyle: "italic", color: colors.textSub }}>"{qState.text}"</Text>
              </Text>
            ) : null}
            <Text style={[A.feedbackTxt, { color: colors.textSub }]}>{qState?.feedback}</Text>
          </View>
        )}

        {/* ── Show / hide model answer ── */}
        <TouchableOpacity
          style={[A.revealBtn, {
            backgroundColor: isRevealed ? T.va(0.1) : colors.bgCardAlt,
            borderColor:     isRevealed ? T.va(0.32) : colors.borderMid,
          }]}
          onPress={() => onToggleAnswer(question.id)}
          activeOpacity={0.75}
        >
          <MaterialIcons
            name={isRevealed ? "visibility-off" : "visibility"}
            size={15}
            color={isRevealed ? T.violetBr : colors.textMuted}
          />
          <Text style={[A.revealBtnTxt, { color: isRevealed ? T.violetBr : colors.textMuted }]}>
            {isRevealed ? "Hide Model Answer" : "Show Model Answer"}
          </Text>
        </TouchableOpacity>

        {/* Model answer panel */}
        {isRevealed && (
          <View style={[A.answerPanel, { backgroundColor: T.sa(0.07), borderColor: T.sa(0.22) }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: sp(1.25) }}>
              <MaterialIcons name="check-circle" size={15} color={T.successBr} />
              <Label color={T.successBr}>Model Answer</Label>
            </View>
            <Text style={[A.answerTxt, { color: colors.textSub }]}>{question.answer}</Text>
            {question.rubric && (
              <View style={[A.rubricRow, { backgroundColor: T.va(0.08), borderColor: T.va(0.2) }]}>
                <MaterialIcons name="rule" size={11} color={T.violetBr} />
                <Text style={[A.rubricTxt, { color: T.violetBr }]}>{question.rubric}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  SECTION 6 — MAIN SCREEN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function QuizScreen({ navigation, route }) {
  const { theme } = useTheme();
  const isDark    = theme === "dark";
  const colors    = useC(isDark);

  const { width: W } = useWindowDimensions();
  const isTablet = W >= 768;
  const padH     = isTablet ? sp(6) : sp(3);
  const padTop   = Platform.OS === "ios" ? sp(7) : sp(5.5);

  // ── Original state  ────────────────────────────
  const [quizSessions,         setQuizSessions]         = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [generatingQuiz,       setGeneratingQuiz]       = useState(false);
  const [selectedSession,      setSelectedSession]      = useState(null);
  const [currentQuestions,     setCurrentQuestions]     = useState([]);
  const [revealedAnswers,      setRevealedAnswers]      = useState({});
  const [score,                setScore]                = useState(null);
  const [completedQuestions,   setCompletedQuestions]   = useState({});
  const [selectedDifficulty,   setSelectedDifficulty]   = useState(null);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [pendingSession,       setPendingSession]       = useState(null);
  const [answerMap,            setAnswerMap]            = useState({});

  const auth = getAuth();
  const db   = getFirestore();
  const { gate, track, canUse } = useFeatureGate(FEATURES.QUIZ);

  // ── Animations ────────────────────────────────────────────────
  const fadeAnim              = useRef(new Animated.Value(0)).current;
  const slideAnim             = useRef(new Animated.Value(24)).current;
  const difficultySheetAnim   = useRef(new Animated.Value(0)).current;
  // I use a separate pulse ref for the generating indicator.
  const genPulse              = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
    fetchAllQuizSessions();
  }, []);

  useEffect(() => {
    Animated.timing(difficultySheetAnim, {
      toValue: showDifficultyPicker ? 1 : 0,
      duration: 320, useNativeDriver: true,
    }).start();
  }, [showDifficultyPicker]);

  // I pulse the generating indicator when a quiz is being built.
  useEffect(() => {
    if (generatingQuiz) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(genPulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(genPulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      genPulse.stopAnimation();
      Animated.spring(genPulse, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [generatingQuiz]);

  // ════════════════════════════════════════════════════════════
  //  FUNCTIONS
  // ════════════════════════════════════════════════════════════

  const fetchAllQuizSessions = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;
      let sessions = [];

      if (currentUser) {
        const q = query(collection(db, "recordings"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          const data = d.data();
          if (data.organizedNotes) {
            sessions.push({
              id: d.id,
              title: data.organizedNotes.title || "Untitled Lecture",
              date: data.createdAt?.toDate() || new Date(),
              notes: data.organizedNotes,
              quiz: data.quiz || null,
              source: "firestore",
            });
          }
        }
      }

      if (sessions.length === 0) {
        const savedNotes = await AsyncStorage.getItem("organizedNotes");
        if (savedNotes) {
          const notes    = JSON.parse(savedNotes);
          const savedQ   = await AsyncStorage.getItem("latestQuiz");
          sessions.push({ id:"local-1", title: notes.title||"Untitled Lecture", date: new Date(), notes, quiz: savedQ ? JSON.parse(savedQ) : null, source:"asyncstorage" });
        }
      }

      setQuizSessions(sessions);
    } catch (error) {
      console.error("Fetch error:", error);
      Alert.alert("Error", "Failed to load quiz sessions");
    } finally {
      setLoading(false);
    }
  };

  // I keep the prompt lean — llama3-70b has an 8 k context so I
  // truncate aggressively to stay well under the token budget.
  const buildPrompt = useCallback((notes, difficulty) => {
    const configs = {
      simple:   { count:"8 to 10",  types:"factual recall and basic comprehension",       instruction:"Test straightforward recall of definitions, names, dates, and simple facts. Avoid multi-step reasoning." },
      medium:   { count:"10 to 12", types:"conceptual understanding and application",     instruction:"Ask students to explain WHY or HOW something works, compare two ideas, or apply a concept to a scenario." },
      difficult:{ count:"12 to 15", types:"synthesis, evaluation, and critical analysis", instruction:"Require deep reasoning: evaluating tradeoffs, critiquing a claim, synthesising across sections, or predicting outcomes. Answers should be 2+ sentences with nuance." },
    };
    const cfg   = configs[difficulty] || configs.medium;
    // I truncate each section tightly so the total prompt stays < 2 000 tokens
    const trunc = (str, max = 400) => str && str.length > max ? str.slice(0, max) + "…" : str || "";
    return `You are a quiz generation expert. Return ONLY valid JSON — no markdown, no preamble.

LECTURE: ${trunc(notes.title, 80)}
SUMMARY: ${trunc(notes.summary, 300)}
KEY POINTS: ${trunc((notes.keyPoints || []).join("; "), 400)}
SECTIONS: ${trunc((notes.sections || []).map(s => `${s.title}: ${s.content}`).join(" "), 500)}

TASK: Generate a "${difficulty}" quiz.
Question types: ${cfg.types}
Instruction: ${cfg.instruction}
Count: ${cfg.count}

Each question needs: id, question, answer, keywords (3-6 strings), rubric (1 sentence), type (conceptual|factual|application|analysis), difficulty, topic.

JSON schema (return ONLY this, no wrapper text):
{"difficulty":"${difficulty}","questions":[{"id":1,"question":"...","answer":"...","keywords":["kw1"],"rubric":"...","type":"conceptual","difficulty":"${difficulty}","topic":"Topic"}]}`;
  }, []);

  // I use llama3-70b-8192 which has a larger effective context than llama3-8b
  // and handles JSON-only output far more reliably.
  const generateWithGroq = async (notes, difficulty) => {
    const prompt = buildPrompt(notes, difficulty);
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a quiz generation expert. Return only valid JSON, no markdown, no commentary." },
          { role: "user",   content: prompt },
        ],
        temperature: 0.55,
        max_tokens: 3000,
      }),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Groq ${response.status}: ${errBody.slice(0, 120)}`);
    }
    const data = await response.json();
    const text = data.choices[0].message.content.trim()
      .replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(text);
  };

  // I wrap the Gemini call in exponential-backoff retry logic to handle
  // the free-tier 429 rate limit gracefully before falling back.
  const generateWithGemini = async (notes, difficulty, attempt = 0) => {
    const prompt = buildPrompt(notes, difficulty);
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.55, maxOutputTokens: 3000 },
      }),
    });

    // I retry up to 3 times on 429 with exponential back-off (2s, 4s, 8s)
    if (response.status === 429 && attempt < 3) {
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`Gemini 429 — retrying in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise(res => setTimeout(res, delay));
      return generateWithGemini(notes, difficulty, attempt + 1);
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini ${response.status}: ${errBody.slice(0, 120)}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text
      .replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(text);
  };

  const createFallbackQuiz = (notes, difficulty) => {
    const questions = [], id = { n: 1 }, diffMap = { simple: "easy", medium: "medium", difficult: "hard" };
    (notes.keyPoints || []).forEach(p => questions.push({ id: id.n++, question: `Explain: ${p.slice(0, 100)}${p.length > 100 ? "…" : ""}`, answer: p, keywords: p.split(" ").slice(0, 5), rubric: "Answer should address the core concept described in the key point.", type: "conceptual", difficulty: diffMap[difficulty] || "medium", topic: "Key Concepts" }));
    (notes.sections  || []).slice(0, 4).forEach(s => questions.push({ id: id.n++, question: `What are the main points about "${s.title}"?`, answer: (s.content || "").slice(0, 300) + "…", keywords: s.title.split(" "), rubric: `Answer should cover the key ideas in the ${s.title} section.`, type: "factual", difficulty: diffMap[difficulty] || "medium", topic: s.title }));
    Object.entries(notes.definitions || {}).slice(0, 4).forEach(([t, d]) => questions.push({ id: id.n++, question: `Define: ${t}`, answer: d, keywords: [t], rubric: `Answer must correctly define "${t}".`, type: "factual", difficulty: diffMap[difficulty] || "medium", topic: "Definitions" }));
    return { difficulty, questions: questions.slice(0, 15) };
  };

  const generateQuiz = async (session, difficulty) => {
    if (!apiRateLimiter("generate")) { Alert.alert("Please wait", "Generation is cooling down. Try again shortly."); return; }

    const allowed = gate();
    if (!allowed) return;

    try {
      await haptics.impact("Medium");
      setGeneratingQuiz(true);
      if (!session.notes) throw new Error("No notes available for this session");

      let quiz = null;
      try       { quiz = await generateWithGroq(session.notes, difficulty); }
      catch (e) { console.warn("Groq failed, trying Gemini:", e.message); }
      if (!quiz) {
        try       { quiz = await generateWithGemini(session.notes, difficulty); }
        catch (e) { console.warn("Gemini failed, using fallback:", e.message); }
      }
      if (!quiz) quiz = createFallbackQuiz(session.notes, difficulty);

      if (session.source === "firestore") {
        await updateDoc(doc(db, "recordings", session.id), { quiz });
      } else {
        await AsyncStorage.setItem("latestQuiz", JSON.stringify(quiz));
      }
      await track();

      const updated = { ...session, quiz };
      setQuizSessions(prev => prev.map(s => s.id === session.id ? updated : s));
      setSelectedSession(updated);
      setCurrentQuestions(quiz.questions);
      setAnswerMap({}); setRevealedAnswers({}); setCompletedQuestions({}); setScore(null);

      await haptics.notification("Success");
      Alert.alert("Quiz Ready!", `Generated ${quiz.questions.length} ${difficulty} questions.`);
    } catch (error) {
      console.error("Quiz generation error:", error);
      Alert.alert("Error", error.message || "Failed to generate quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const verifyAnswerWithAI = async (question, studentAnswer) => {
    const cleanAnswer = sanitiseInput(studentAnswer, 500);
    if (!cleanAnswer) return { score: 0, feedback: "No answer provided." };

    const verifyPrompt = `You are an educational assessment assistant. Evaluate whether the student's answer demonstrates understanding of the concept.

QUESTION: ${sanitiseInput(question.question, 300)}
MODEL ANSWER: ${sanitiseInput(question.answer, 400)}
RUBRIC: ${sanitiseInput(question.rubric, 200)}
KEY CONCEPTS: ${(question.keywords || []).join(", ")}
STUDENT'S ANSWER: ${cleanAnswer}

Evaluate strictly but fairly. Conceptual understanding matters more than exact wording.
Respond ONLY with valid JSON (no markdown):
{"score":<0,1,or 2>,"feedback":"<1-2 sentence constructive feedback>"}
Score: 2=Correct, 1=Partial, 0=Incorrect`;

    try {
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            { role: "system", content: "You are an educational evaluator. Return only valid JSON with keys 'score' (integer 0-2) and 'feedback' (string). No other text." },
            { role: "user",   content: verifyPrompt },
          ],
          temperature: 0.2, max_tokens: 200,
        }),
      });
      if (!res.ok) throw new Error(`Groq verify ${res.status}`);
      const data = await res.json();
      const text = data.choices[0].message.content.trim()
        .replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const result = JSON.parse(text);
      if (typeof result.score !== "number" || typeof result.feedback !== "string") throw new Error("Bad shape");
      return result;
    } catch (e) {
      console.warn("AI verification failed, using keyword fallback:", e.message);
    }
    return keywordFallbackCheck(question, cleanAnswer);
  };

  const keywordFallbackCheck = (question, studentAnswer) => {
    const lower      = studentAnswer.toLowerCase();
    const keywords   = (question.keywords || []).map(k => k.toLowerCase());
    const matchCount = keywords.filter(kw => lower.includes(kw)).length;
    const ratio      = keywords.length > 0 ? matchCount / keywords.length : 0;
    if (ratio >= 0.65) return { score: 2, feedback: "Good answer! You covered the key concepts." };
    if (ratio >= 0.3)  return { score: 1, feedback: `Partial credit. Try to also mention: ${keywords.filter(kw => !lower.includes(kw)).join(", ")}.` };
    return { score: 0, feedback: `Incorrect or too vague. Key concepts to cover: ${keywords.join(", ")}.` };
  };

  const handleSubmitAnswer = async (question) => {
    const state     = answerMap[question.id] || {};
    const cleanText = sanitiseInput(state.text || "", 500);
    if (!cleanText.trim()) { Alert.alert("Empty Answer", "Please type something before submitting."); return; }
    if (!apiRateLimiter(`verify-${question.id}`)) { Alert.alert("Too fast", "Please wait a moment before re-submitting."); return; }

    Keyboard.dismiss();
    setAnswerMap(prev => ({ ...prev, [question.id]: { ...prev[question.id], state: ANSWER_STATE.SUBMITTED, verifying: true } }));
    await haptics.impact("Light");

    const result   = await verifyAnswerWithAI(question, cleanText);
    const newState = result.score === 2 ? ANSWER_STATE.CORRECT : result.score === 1 ? ANSWER_STATE.PARTIAL : ANSWER_STATE.INCORRECT;

    setAnswerMap(prev => ({ ...prev, [question.id]: { ...prev[question.id], state: newState, feedback: result.feedback, score: result.score, verifying: false } }));
    setRevealedAnswers(prev => ({ ...prev, [question.id]: true }));
    setCompletedQuestions(prev => ({ ...prev, [question.id]: result.score >= 1 }));
    await haptics.notification(result.score >= 1 ? "Success" : "Error");
  };

  const handleToggleInput = async (questionId) => {
    await haptics.impact("Light");
    setAnswerMap(prev => {
      const current = prev[questionId] || {};
      if (current.state && current.state !== ANSWER_STATE.IDLE) return prev;
      return { ...prev, [questionId]: { ...current, state: current.state === ANSWER_STATE.TYPING ? ANSWER_STATE.IDLE : ANSWER_STATE.TYPING, text: current.text || "" } };
    });
  };

  const handleAnswerTextChange = (questionId, text) => {
    setAnswerMap(prev => ({ ...prev, [questionId]: { ...(prev[questionId] || {}), text: text.slice(0, 500) } }));
  };

  const toggleAnswer    = async (qid) => { await haptics.impact("Light"); setRevealedAnswers(prev => ({ ...prev, [qid]: !prev[qid] })); };
  const markAsCompleted = async (qid) => { await haptics.impact("Light"); setCompletedQuestions(prev => ({ ...prev, [qid]: !prev[qid] })); };

  const calculateScore = () => {
    const completed  = Object.values(completedQuestions).filter(Boolean).length;
    const aiCorrect  = Object.values(answerMap).filter(a => a.score === 2).length;
    const aiPartial  = Object.values(answerMap).filter(a => a.score === 1).length;
    const total      = currentQuestions.length;
    const percentage = Math.round((completed / total) * 100);
    setScore({ completed, total, percentage, aiCorrect, aiPartial });
    try {
      const currentUser = auth.currentUser;
      if (currentUser && completed > 0) logUserActivity(db, currentUser.uid, "quiz", { completed, total, percentage, aiCorrect, aiPartial }).catch(() => {});
    } catch (_) {}
  };

  const handleStartQuiz = async (session) => {
    await haptics.impact("Light");
    if (session.quiz) {
      setSelectedSession(session); setCurrentQuestions(session.quiz.questions);
      setRevealedAnswers({}); setCompletedQuestions({}); setAnswerMap({}); setScore(null);
    } else {
      setPendingSession(session); setShowDifficultyPicker(true);
    }
  };

  const handleGenerateWithDifficulty = async (difficulty) => {
    setShowDifficultyPicker(false);
    setSelectedDifficulty(difficulty);
    const session = pendingSession;
    setPendingSession(null);
    await generateQuiz(session, difficulty);
  };

  const handleRegenerateQuiz = (session) => {
    Alert.alert("Regenerate Quiz", "Replace the existing quiz with a new one?",
      [{ text: "Cancel", style: "cancel" }, { text: "Regenerate", onPress: () => { setPendingSession(session); setShowDifficultyPicker(true); } }]
    );
  };

  const handleBackToList = async () => {
    await haptics.impact("Light");
    setSelectedSession(null); setCurrentQuestions([]);
    setRevealedAnswers({}); setCompletedQuestions({}); setAnswerMap({}); setScore(null);
  };

  // ── Derived values ────────────────────────────────────────────
  const completedCount = Object.values(completedQuestions).filter(Boolean).length;
  const progressPct    = currentQuestions.length > 0 ? completedCount / currentQuestions.length : 0;

  // ════════════════════════════════════════════════════════════
  //  RENDER — LOADING
  // ════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={[A.root, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Animated.View style={{ opacity: fadeAnim, alignItems: "center" }}>
          <View style={[A.loadOrb, { backgroundColor: T.va(0.12), borderColor: T.va(0.28) }]}>
            <MaterialIcons name="quiz" size={28} color={T.violetBr} />
          </View>
          <Label color={T.violetBr} style={{ marginTop: sp(2.5), letterSpacing: 5, marginBottom: 8 }}>Loading</Label>
          <Text style={[A.heroTitle, { color: colors.text, fontSize: 22 }]}>
            Quiz{" "}<Text style={{ fontStyle: "italic", color: T.violetBr }}>Sessions</Text>
          </Text>
          <ActivityIndicator color={T.violetBr} style={{ marginTop: sp(2.5) }} />
        </Animated.View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  DIFFICULTY PICKER BOTTOM SHEET
  //  I render this as a floating overlay on top of either view.
  // ════════════════════════════════════════════════════════════

  const DifficultyPicker = () => (
    <Animated.View style={[A.pickerOverlay, { opacity: difficultySheetAnim, pointerEvents: showDifficultyPicker ? "auto" : "none" }]}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDifficultyPicker(false)} activeOpacity={1} />
      <Animated.View style={[
        A.pickerSheet,
        { backgroundColor: colors.bgEl, borderTopColor: colors.borderMid },
        { transform: [{ translateY: difficultySheetAnim.interpolate({ inputRange: [0, 1], outputRange: [340, 0] }) }] },
      ]}>
        <View style={[A.sheetHandle, { backgroundColor: colors.borderMid }]} />
        <Label color={colors.textDim} style={{ textAlign: "center", marginBottom: 8, letterSpacing: 5 }}>— Select</Label>
        <Text style={[A.sheetTitle, { color: colors.text }]}>
          Choose{" "}<Text style={{ fontStyle: "italic", color: T.violetBr }}>Difficulty</Text>
        </Text>
        <Text style={[A.sheetSub, { color: colors.textMuted }]}>
          The AI tailors questions to the level you select.
        </Text>

        {Object.entries(DIFFICULTY_MODES).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[A.diffOption, { backgroundColor: `${cfg.color}0d`, borderColor: `${cfg.color}28` }]}
            onPress={() => handleGenerateWithDifficulty(key)}
            disabled={generatingQuiz}
            activeOpacity={0.82}
          >
            <View style={[A.diffIconCircle, { backgroundColor: `${cfg.color}20`, borderColor: `${cfg.color}55` }]}>
              <MaterialIcons name={cfg.icon} size={24} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "800", color: cfg.color, marginBottom: 2 }}>{cfg.label}</Text>
              <Text style={{ fontFamily: SANS, fontSize: 12, color: colors.textMuted }}>{cfg.description}</Text>
              <Label color={`${cfg.color}aa`} style={{ marginTop: 3 }}>{cfg.count}</Label>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={`${cfg.color}88`} />
          </TouchableOpacity>
        ))}

        {generatingQuiz && (
          <View style={[A.generatingRow, { borderColor: T.va(0.2), backgroundColor: T.va(0.07) }]}>
            <Animated.View style={{ transform: [{ scale: genPulse }] }}>
              <MaterialIcons name="auto-awesome" size={16} color={T.violetBr} />
            </Animated.View>
            <Text style={[A.generatingTxt, { color: colors.textSub }]}>Generating your quiz…</Text>
            <ActivityIndicator size="small" color={T.violetBr} />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );

  // ════════════════════════════════════════════════════════════
  //  RENDER — QUIZ-TAKING VIEW
  // ════════════════════════════════════════════════════════════

  if (selectedSession && currentQuestions.length > 0) {
    const dc = selectedSession.quiz?.difficulty ? diffColor(selectedSession.quiz.difficulty) : T.violetBr;

    return (
      <KeyboardAvoidingView
        style={[A.root, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        {showDifficultyPicker && <DifficultyPicker />}

        {/* ── Quiz header ──────────────────────────────────── */}
        <View style={[A.quizNav, { backgroundColor: colors.bg + "f0", borderBottomColor: colors.border, paddingTop: padTop }]}>
          <TouchableOpacity
            style={[A.navBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={handleBackToList}
            activeOpacity={0.75}
          >
            <MaterialIcons name="arrow-back" size={17} color={colors.textSub} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[A.navTitle, { color: colors.text }]} numberOfLines={1}>
              {selectedSession.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
              {selectedSession.quiz?.difficulty && <Pill small label={selectedSession.quiz.difficulty} color={dc} />}
              <Label color={colors.textDim}>{currentQuestions.length} questions</Label>
            </View>
          </View>

          {/* I label the header regen button explicitly so its purpose is clear */}
          <TouchableOpacity
            style={[A.navRegenBtn, { backgroundColor: T.va(0.12), borderColor: T.va(0.28) }]}
            onPress={() => { setPendingSession(selectedSession); setShowDifficultyPicker(true); }}
            activeOpacity={0.75}
          >
            <MaterialIcons name="refresh" size={14} color={T.violetBr} />
            <Text style={A.navRegenTxt}>Regen</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(16) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Score results card */}
          {score && (
            <Animated.View style={[A.scoreCard, { backgroundColor: colors.bgCard, borderColor: colors.borderMid, opacity: fadeAnim }]}>
              <Corner pos="top-left"     color={T.goldBr}    size={10} />
              <Corner pos="bottom-right" color={T.successBr} size={10} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: sp(2) }}>
                <MaterialIcons name="emoji-events" size={18} color={T.goldBr} />
                <Label color={T.goldBr} style={{ letterSpacing: 4 }}>Session Results</Label>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
                {[
                  { val: score.aiCorrect,        label: "Correct",  color: T.successBr },
                  { val: score.aiPartial,         label: "Partial",  color: T.goldBr    },
                  { val: `${score.percentage}%`,  label: "Overall",  color: T.violetBr  },
                ].map(({ val, label, color }) => (
                  <View key={label} style={{ alignItems: "center" }}>
                    <Text style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: "900", color, letterSpacing: -1 }}>{val}</Text>
                    <Label color={colors.textDim} style={{ marginTop: 5 }}>{label}</Label>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Progress card */}
          <Animated.View style={[A.progressCard, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: fadeAnim }]}>
            <Corner pos="top-right" color={T.goldBr} size={9} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: sp(2) }}>
              <MaterialIcons name="emoji-events" size={16} color={T.goldBr} />
              <Text style={[A.sectionTitle, { color: colors.text }]}>Progress</Text>
              <View style={{ flex: 1 }} />
              <Label color={colors.textDim}>{completedCount}/{currentQuestions.length}</Label>
            </View>

            {/* Progress bar */}
            <View style={[A.progressTrack, { backgroundColor: colors.border }]}>
              <Animated.View style={[
                A.progressFill,
                {
                  width: `${Math.round(progressPct * 100)}%`,
                  backgroundColor: progressPct === 1 ? T.successBr : T.violetMid,
                },
              ]} />
            </View>

            {/* Stats row */}
            <View style={[A.statsRow, { backgroundColor: T.va(0.06), borderColor: T.va(0.14), marginTop: sp(2), marginBottom: sp(2.5) }]}>
              {[
                { val: completedCount,                     label: "Done",     color: T.violetBr  },
                { val: currentQuestions.length,            label: "Total",    color: colors.text },
                { val: `${Math.round(progressPct * 100)}%`, label: "Progress", color: T.goldBr   },
              ].map(({ val, label, color }, i, arr) => (
                <React.Fragment key={label}>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: "900", color, letterSpacing: -0.5 }}>{val}</Text>
                    <Label color={colors.textDim} style={{ marginTop: 3 }}>{label}</Label>
                  </View>
                  {i < arr.length - 1 && <View style={[A.divider, { backgroundColor: colors.border, height: 36 }]} />}
                </React.Fragment>
              ))}
            </View>

            <TouchableOpacity
              style={[A.calcBtn, { backgroundColor: T.success, shadowColor: T.success }]}
              onPress={calculateScore}
              activeOpacity={0.85}
            >
              <MaterialIcons name="calculate" size={15} color="#fff" />
              <Label color="#fff" style={{ letterSpacing: 3 }}>Calculate Score</Label>
            </TouchableOpacity>
          </Animated.View>

          {/* Questions */}
          {currentQuestions.map((question, index) => (
            <View key={question.id} style={{ marginBottom: sp(2) }}>
              <QuestionCard
                question={question}
                index={index}
                colors={colors}
                isDark={isDark}
                qState={answerMap[question.id]}
                isRevealed={!!revealedAnswers[question.id]}
                completedQuestions={completedQuestions}
                onToggleInput={handleToggleInput}
                onTextChange={handleAnswerTextChange}
                onSubmit={handleSubmitAnswer}
                onToggleAnswer={toggleAnswer}
                onMarkComplete={markAsCompleted}
                fadeAnim={fadeAnim}
              />
            </View>
          ))}

          {/* Completion celebration */}
          {completedCount === currentQuestions.length && currentQuestions.length > 0 && (
            <Animated.View style={[A.completionCard, { backgroundColor: colors.bgCard, borderColor: T.ga(0.35), opacity: fadeAnim }]}>
              <Corner pos="top-left"     color={T.goldBr} size={12} />
              <Corner pos="top-right"    color={T.goldBr} size={12} />
              <Corner pos="bottom-left"  color={T.goldBr} size={12} />
              <Corner pos="bottom-right" color={T.goldBr} size={12} />
              <View style={[A.celebOrb, { backgroundColor: T.ga(0.14), borderColor: T.ga(0.28) }]}>
                <MaterialIcons name="celebration" size={28} color={T.goldBr} />
              </View>
              <Text style={[A.completionTitle, { color: colors.text }]}>Quiz Completed!</Text>
              <Text style={[A.completionSub, { color: colors.textMuted }]}>
                You've answered all {currentQuestions.length} questions.
              </Text>
              <TouchableOpacity
                style={[A.retakeBtn, { backgroundColor: T.violetMid, shadowColor: T.violet }]}
                onPress={() => { setRevealedAnswers({}); setCompletedQuestions({}); setAnswerMap({}); setScore(null); }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="refresh" size={16} color="#fff" />
                <Label color="#fff" style={{ letterSpacing: 3 }}>Retake Quiz</Label>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER — SESSION LIST VIEW
  // ════════════════════════════════════════════════════════════

  return (
    <View style={[A.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
      {showDifficultyPicker && <DifficultyPicker />}

      {/* ── Top navbar ──────────────────────────────────────── */}
      <View style={[A.quizNav, { backgroundColor: colors.bg + "f0", borderBottomColor: colors.border, paddingTop: padTop }]}>
        <View style={{ width: 38 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Label color={colors.textDim} style={{ marginBottom: 4, letterSpacing: 5 }}>— NoteTedd</Label>
          <Text style={[A.navTitle, { color: colors.text }]}>
            Quiz{" "}<Text style={{ fontStyle: "italic", color: T.violetBr }}>Center</Text>
          </Text>
        </View>
        <View style={[A.navBtn, { backgroundColor: T.va(0.12), borderColor: T.va(0.25) }]}>
          <MaterialIcons name="quiz" size={17} color={T.violetBr} />
        </View>
      </View>

      <TrialBanner />
      <UsageMeter
        feature={FEATURES.QUIZ}
        style={{ marginHorizontal: sp(3), marginTop: sp(1.5), marginBottom: sp(0.5) }}
      />

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(14) }}
        >
          {/* Hero */}
          <View style={{ marginBottom: sp(3) }}>
            <Text style={[A.heroTitle, { color: colors.text }]}>
              Test Your{" "}
              <Text style={{ fontStyle: "italic", color: T.violetBr }}>Knowledge</Text>
            </Text>
            <Text style={[A.heroSub, { color: colors.textMuted }]}>
              {quizSessions.length} lecture{quizSessions.length !== 1 ? "s" : ""} available
            </Text>
          </View>

          {quizSessions.length === 0 ? (
            /* Empty state */
            <View style={[A.emptyBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Corner pos="top-left"     color={T.violetBr} size={10} />
              <Corner pos="bottom-right" color={T.tealBr}   size={10} />
              <View style={[A.emptyOrb, { borderColor: colors.border }]}>
                <MaterialIcons name="quiz" size={28} color={colors.textMuted} />
              </View>
              <Text style={[A.emptyTitle, { color: colors.text }]}>No Quizzes Yet</Text>
              <Text style={[A.emptySub,   { color: colors.textMuted }]}>
                Record and organise lectures to generate AI-powered quizzes.
              </Text>
              <TouchableOpacity
                style={[A.goBtn, { backgroundColor: T.teal, shadowColor: T.teal }]}
                onPress={() => navigation.navigate("RecordScreen")}
                activeOpacity={0.85}
              >
                <MaterialIcons name="mic" size={14} color="#fff" />
                <Label color="#fff" style={{ letterSpacing: 3 }}>Record Lecture</Label>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Info banner */}
              <View style={[A.infoBanner, { backgroundColor: T.va(0.08), borderColor: T.va(0.2) }]}>
                <MaterialIcons name="auto-awesome" size={15} color={T.violetBr} />
                <Text style={[A.infoBannerTxt, { color: colors.textSub }]}>
                  AI-generated quizzes with conceptual answer grading. Choose Simple, Medium, or Difficult.
                </Text>
              </View>

              {/* Session list */}
              {quizSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  colors={colors}
                  generatingQuiz={generatingQuiz}
                  canUse={canUse}
                  onStart={() => handleStartQuiz(session)}
                  onGenerate={() => { setPendingSession(session); setShowDifficultyPicker(true); }}
                  onRegen={() => handleRegenerateQuiz(session)}
                  style={{ marginBottom: sp(2) }}
                />
              ))}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
// ════════════════════════════════════════════════════════════════

const A = StyleSheet.create({
  root: { flex: 1 },

  // Navbar
  quizNav: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:    { fontFamily: DISPLAY, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  navBtn:      { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  // I size the header regen button to fit the icon + short label comfortably
  navRegenBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 19, borderWidth: 1,
  },
  navRegenTxt: { fontFamily: MONO, fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: T.violetBr },

  // Loading
  loadOrb: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  heroTitle: { fontFamily: DISPLAY, fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  heroSub:   { fontFamily: SANS, fontSize: 13, marginTop: sp(0.75) },

  // Session card
  sessionCard:     { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  sessionIconWrap: { width: 48, height: 48, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sessionTitle:    { fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  statsRow: {
    flexDirection: "row", justifyContent: "space-around",
    borderRadius: 12, borderWidth: 1, paddingVertical: sp(1.5),
  },

  // Session action buttons
  startBtn:      { borderRadius: 13, overflow: "hidden", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  startBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: sp(1.75), paddingHorizontal: sp(2.5), borderRadius: 13 },
  startBtnTxt:   { fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },
  // I made the regen button a proper pill with an icon and text label
  regenBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingHorizontal: sp(1.75), paddingVertical: sp(1.25),
    borderRadius: 13, borderWidth: 1,
  },
  regenBtnTxt:   { fontFamily: MONO, fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: T.violetBr, fontWeight: "700" },
  generateBtn:     { borderRadius: 13, overflow: "hidden", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  generateBtnInner:{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: sp(1.75), borderRadius: 13 },
  generateBtnTxt:  { fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },

  // Info banner
  infoBanner:    { flexDirection: "row", alignItems: "center", gap: sp(1.5), borderRadius: 14, borderWidth: 1, padding: sp(2), marginBottom: sp(2.5) },
  infoBannerTxt: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 18 },

  // Empty state
  emptyBox:   { borderRadius: 22, borderWidth: 1, padding: sp(5), alignItems: "center", position: "relative", overflow: "hidden" },
  emptyOrb:   { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2.5) },
  emptyTitle: { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", marginBottom: 6, letterSpacing: -0.3 },
  emptySub:   { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: sp(3), marginBottom: sp(3) },
  goBtn:      { flexDirection: "row", alignItems: "center", gap: sp(1), paddingHorizontal: sp(3), paddingVertical: sp(1.75), borderRadius: 13, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },

  // Difficulty picker
  pickerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.62)", zIndex: 999, justifyContent: "flex-end" },
  pickerSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, padding: sp(3), paddingBottom: sp(7),
  },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: sp(2.5) },
  sheetTitle:    { fontFamily: DISPLAY, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, textAlign: "center", marginBottom: 6 },
  sheetSub:      { fontFamily: SANS, fontSize: 13, textAlign: "center", marginBottom: sp(3), lineHeight: 20 },
  diffOption: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderWidth: 1, borderRadius: 18, padding: sp(2), marginBottom: sp(1.5),
  },
  diffIconCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  generatingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.5), borderRadius: 12, borderWidth: 1, padding: sp(1.75), marginTop: sp(1),
  },
  generatingTxt: { fontFamily: SANS, fontSize: 13, fontWeight: "600" },

  // Quiz-taking — score card
  scoreCard: {
    borderRadius: 20, borderWidth: 1, padding: sp(2.5),
    marginBottom: sp(2), position: "relative", overflow: "hidden",
  },

  // Quiz-taking — progress card
  progressCard:  { borderRadius: 20, borderWidth: 1, padding: sp(2.5), marginBottom: sp(2.5), position: "relative", overflow: "hidden" },
  sectionTitle:  { fontFamily: DISPLAY, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: "100%", borderRadius: 2, minWidth: 8 },
  divider:       { width: 1, alignSelf: "center" },
  calcBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(1),
    borderRadius: 14, paddingVertical: sp(1.75),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },

  // Question card
  questionCard: { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  qHead:        { flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(2) },
  qBubble:      { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  qNum:         { fontFamily: MONO, fontSize: 12, fontWeight: "900" },
  qText:        { fontFamily: SANS, fontSize: 15, fontWeight: "600", lineHeight: 24, marginBottom: sp(1.5) },
  topicChip: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: sp(1.5),
  },

  // Answer input
  typeBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1.5, borderRadius: 12, padding: sp(1.5), marginBottom: sp(1),
  },
  typeBtnTxt:  { fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  inputBox:    { borderRadius: 16, borderWidth: 1.5, overflow: "hidden", position: "relative" },
  textInput:   { fontFamily: SANS, padding: sp(2), fontSize: 14, lineHeight: 22, minHeight: 90, textAlignVertical: "top" },
  inputFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: sp(2), paddingVertical: sp(1), borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: 10,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },

  // Feedback
  feedbackBox:   { borderRadius: 14, borderWidth: 1, padding: sp(2), marginBottom: sp(1.5) },
  yourAnswerTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 18, marginBottom: 6 },
  feedbackTxt:   { fontFamily: SANS, fontSize: 13, lineHeight: 20, fontWeight: "500" },

  // Reveal answer
  revealBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderRadius: 13, paddingVertical: sp(1.5), marginTop: sp(1.5),
  },
  revealBtnTxt: { fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  answerPanel:  { borderRadius: 14, borderWidth: 1, padding: sp(2), marginTop: sp(1.5) },
  answerTxt:    { fontFamily: SANS, fontSize: 14, lineHeight: 22, fontWeight: "500", marginBottom: sp(1) },
  rubricRow:    { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 9, borderWidth: 1, padding: sp(1.25), marginTop: sp(0.5) },
  rubricTxt:    { flex: 1, fontFamily: SANS, fontSize: 11, fontWeight: "600", lineHeight: 17 },

  // Completion card
  completionCard: {
    borderRadius: 24, borderWidth: 1.5, padding: sp(4),
    alignItems: "center", marginTop: sp(2), marginBottom: sp(3),
    position: "relative", overflow: "hidden",
  },
  celebOrb:       { width: 66, height: 66, borderRadius: 33, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2.5) },
  completionTitle:{ fontFamily: DISPLAY, fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8, textAlign: "center" },
  completionSub:  { fontFamily: SANS, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: sp(3) },
  retakeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(1),
    paddingVertical: sp(1.75), paddingHorizontal: sp(4), borderRadius: 14,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
    width: "100%",
  },
});