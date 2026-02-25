import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "./context/ThemeContext";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import haptics from "./utils/haptics";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { logUserActivity } from "./utils/userActivity";
import { getAuth } from "firebase/auth";

// ==================== CONSTANTS ====================
const GROQ_API_KEY = "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";
const GEMINI_API_KEY = "AIzaSyDQraKwy8C4zbRJ9ys2Xl9DUbzhvmv9Wco";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";

// Difficulty mode config
const DIFFICULTY_MODES = {
  simple: {
    label: "Simple",
    icon: "sentiment-satisfied",
    color: "#10B981",
    gradient: ["#10B981", "#059669"],
    description: "Recall & basic understanding",
    count: "8–10 questions",
  },
  medium: {
    label: "Medium",
    icon: "sentiment-neutral",
    color: "#F59E0B",
    gradient: ["#F59E0B", "#D97706"],
    description: "Application & analysis",
    count: "10–12 questions",
  },
  difficult: {
    label: "Difficult",
    icon: "sentiment-very-dissatisfied",
    color: "#EF4444",
    gradient: ["#EF4444", "#DC2626"],
    description: "Synthesis & evaluation",
    count: "12–15 questions",
  },
};

// Answer state enum
const ANSWER_STATE = {
  IDLE: "idle",
  TYPING: "typing",
  SUBMITTED: "submitted",
  CORRECT: "correct",
  PARTIAL: "partial",
  INCORRECT: "incorrect",
};

// ==================== HELPERS ====================

/**
 * Sanitise user text input — strip control chars, limit length.
 * Prevents prompt injection / excessively large payloads.
 */
const sanitiseInput = (text, maxLength = 500) => {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ") // strip control chars
    .replace(/[<>]/g, "")                            // strip angle brackets
    .trim()
    .slice(0, maxLength);
};

/**
 * Rate limiter — returns false if the action is throttled.
 * Keyed by a string identifier stored in a ref object.
 */
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

// ==================== MAIN COMPONENT ====================
export default function QuizScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  // ---- State ----
  const [quizSessions, setQuizSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [completedQuestions, setCompletedQuestions] = useState({});
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [pendingSession, setPendingSession] = useState(null);

  // Per-question answer state: { [questionId]: { text, state, feedback, verifying } }
  const [answerMap, setAnswerMap] = useState({});

  // Firebase
  const auth = getAuth();
  const db = getFirestore();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const difficultySheetAnim = useRef(new Animated.Value(0)).current;

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
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showDifficultyPicker]);

  // ==================== DATA FETCHING ====================
  const fetchAllQuizSessions = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;
      let sessions = [];

      if (currentUser) {
        const recordingsRef = collection(db, "recordings");
        const q = query(
          recordingsRef,
          where("userId", "==", currentUser.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);

        for (const d of querySnapshot.docs) {
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
          const notes = JSON.parse(savedNotes);
          const savedQuiz = await AsyncStorage.getItem("latestQuiz");
          sessions.push({
            id: "local-1",
            title: notes.title || "Untitled Lecture",
            date: new Date(),
            notes,
            quiz: savedQuiz ? JSON.parse(savedQuiz) : null,
            source: "asyncstorage",
          });
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

  // ==================== QUIZ GENERATION ====================

  /**
   * Build the generation prompt scoped to a difficulty level.
   * We keep this centralised so both API paths use the same instructions.
   */
  const buildPrompt = useCallback((notes, difficulty) => {
    const configs = {
      simple: {
        count: "8 to 10",
        types: "factual recall and basic comprehension",
        instruction:
          "Questions should test straightforward recall of definitions, names, dates, and simple facts. Avoid multi-step reasoning. Answers should be 1–2 sentences.",
      },
      medium: {
        count: "10 to 12",
        types: "conceptual understanding and application",
        instruction:
          "Questions should ask students to explain WHY or HOW something works, compare two ideas, or apply a concept to a scenario. Answers should be 2–3 sentences.",
      },
      difficult: {
        count: "12 to 15",
        types: "synthesis, evaluation, and critical analysis",
        instruction:
          "Questions should require deep reasoning: evaluating tradeoffs, critiquing a claim, synthesising information from multiple sections, or predicting outcomes. Answers should be 3–4 sentences with nuance.",
      },
    };
    const cfg = configs[difficulty] || configs.medium;

    // Truncate large note content to stay within safe token budgets
    const truncate = (str, max = 800) =>
      str && str.length > max ? str.slice(0, max) + "…" : str || "";

    return `You are an expert educational quiz creator. Based on the lecture notes below, generate a quiz at "${difficulty}" difficulty.

LECTURE NOTES:
Title: ${truncate(notes.title, 100)}
Summary: ${truncate(notes.summary, 400)}
Key Points: ${truncate((notes.keyPoints || []).join(", "), 600)}
Sections: ${truncate((notes.sections || []).map((s) => s.title + ": " + s.content).join(" "), 800)}

DIFFICULTY: ${difficulty.toUpperCase()}
Question types: ${cfg.types}
Instructions: ${cfg.instruction}
Number of questions: ${cfg.count}

REQUIREMENTS:
- Each answer must be a model answer (not the only correct wording, but conceptually complete)
- Include a "keywords" array of 3–6 key concepts that a correct answer should mention
- Include a "rubric" field: a 1-sentence description of what makes an answer correct
- Vary question types across: conceptual, factual, application, analysis
- Make questions unambiguous and self-contained

Return ONLY valid JSON (no markdown fences, no preamble):
{
  "difficulty": "${difficulty}",
  "questions": [
    {
      "id": 1,
      "question": "Question text here",
      "answer": "Model answer here",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "rubric": "One sentence describing what a correct answer must address",
      "type": "conceptual",
      "difficulty": "${difficulty}",
      "topic": "Topic area"
    }
  ]
}`;
  }, []);

  const generateWithGroq = async (notes, difficulty) => {
    const prompt = buildPrompt(notes, difficulty);
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content:
              "You are a quiz generation expert. Return only valid JSON, no markdown, no commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.65,
        max_tokens: 3000,
      }),
    });
    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    let text = data.choices[0].message.content.trim();
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(text);
  };

  const generateWithGemini = async (notes, difficulty) => {
    const prompt = buildPrompt(notes, difficulty);
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 3000 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(text);
  };

  const createFallbackQuiz = (notes, difficulty) => {
    const questions = [];
    let id = 1;
    const diffMap = { simple: "easy", medium: "medium", difficult: "hard" };

    (notes.keyPoints || []).forEach((point) => {
      questions.push({
        id: id++,
        question: `Explain: ${point.slice(0, 100)}${point.length > 100 ? "…" : ""}`,
        answer: point,
        keywords: point.split(" ").slice(0, 5),
        rubric: "Answer should address the core concept described in the key point.",
        type: "conceptual",
        difficulty: diffMap[difficulty] || "medium",
        topic: "Key Concepts",
      });
    });

    (notes.sections || []).slice(0, 4).forEach((section) => {
      questions.push({
        id: id++,
        question: `What are the main points about "${section.title}"?`,
        answer: (section.content || "").slice(0, 300) + "…",
        keywords: section.title.split(" "),
        rubric: `Answer should cover the key ideas in the ${section.title} section.`,
        type: "factual",
        difficulty: diffMap[difficulty] || "medium",
        topic: section.title,
      });
    });

    Object.entries(notes.definitions || {})
      .slice(0, 4)
      .forEach(([term, def]) => {
        questions.push({
          id: id++,
          question: `Define: ${term}`,
          answer: def,
          keywords: [term],
          rubric: `Answer must correctly define "${term}".`,
          type: "factual",
          difficulty: diffMap[difficulty] || "medium",
          topic: "Definitions",
        });
      });

    return { difficulty, questions: questions.slice(0, 15) };
  };

  const generateQuiz = async (session, difficulty) => {
    if (!apiRateLimiter("generate")) {
      Alert.alert("Please wait", "Generation is cooling down. Try again shortly.");
      return;
    }
    try {
      await haptics.impact("Medium");
      setGeneratingQuiz(true);

      if (!session.notes) throw new Error("No notes available for this session");

      let quiz = null;

      try {
        quiz = await generateWithGroq(session.notes, difficulty);
      } catch (e) {
        console.warn("Groq failed, trying Gemini:", e.message);
      }

      if (!quiz) {
        try {
          quiz = await generateWithGemini(session.notes, difficulty);
        } catch (e) {
          console.warn("Gemini failed, using fallback:", e.message);
        }
      }

      if (!quiz) quiz = createFallbackQuiz(session.notes, difficulty);

      // Persist
      if (session.source === "firestore") {
        const recordingRef = doc(db, "recordings", session.id);
        await updateDoc(recordingRef, { quiz });
      } else {
        await AsyncStorage.setItem("latestQuiz", JSON.stringify(quiz));
      }

      const updatedSession = { ...session, quiz };
      setQuizSessions((prev) =>
        prev.map((s) => (s.id === session.id ? updatedSession : s))
      );
      setSelectedSession(updatedSession);
      setCurrentQuestions(quiz.questions);
      setAnswerMap({});
      setRevealedAnswers({});
      setCompletedQuestions({});
      setScore(null);

      await haptics.notification("Success");
      Alert.alert("Quiz Ready!", `Generated ${quiz.questions.length} ${difficulty} questions.`);
    } catch (error) {
      console.error("Quiz generation error:", error);
      Alert.alert("Error", error.message || "Failed to generate quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // ==================== ANSWER VERIFICATION ====================

  /**
   * Verify a student answer conceptually using the AI.
   * We send the question, model answer, rubric, keywords, and student answer.
   * The AI returns { score: 0|1|2, feedback: string } where
   *   2 = correct, 1 = partial, 0 = incorrect.
   * 
   * Security: user input is sanitised before being sent.
   * Rate-limited per question.
   */
  const verifyAnswerWithAI = async (question, studentAnswer) => {
    const cleanAnswer = sanitiseInput(studentAnswer, 500);
    if (!cleanAnswer) return { score: 0, feedback: "No answer provided." };

    const verifyPrompt = `You are an educational assessment assistant. Evaluate whether the student's answer demonstrates understanding of the concept.

QUESTION: ${sanitiseInput(question.question, 300)}
MODEL ANSWER: ${sanitiseInput(question.answer, 400)}
RUBRIC: ${sanitiseInput(question.rubric, 200)}
KEY CONCEPTS that should be addressed: ${(question.keywords || []).join(", ")}

STUDENT'S ANSWER: ${cleanAnswer}

Evaluate strictly but fairly. The student does NOT need to use exact words — conceptual understanding matters.

Respond ONLY with valid JSON (no markdown):
{
  "score": <0, 1, or 2>,
  "feedback": "<1-2 sentence constructive feedback>"
}

Score meanings:
2 = Correct (demonstrates clear understanding, covers key concepts)
1 = Partial (shows some understanding but misses important aspects)  
0 = Incorrect (misses the point, fundamentally wrong, or too vague)`;

    // Try Groq first for speed
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content:
                "You are an educational evaluator. Return only valid JSON with keys 'score' (integer 0-2) and 'feedback' (string). No other text.",
            },
            { role: "user", content: verifyPrompt },
          ],
          temperature: 0.2,
          max_tokens: 200,
        }),
      });
      if (!response.ok) throw new Error(`Groq verify ${response.status}`);
      const data = await response.json();
      let text = data.choices[0].message.content.trim();
      text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const result = JSON.parse(text);
      // Validate shape
      if (typeof result.score !== "number" || typeof result.feedback !== "string") {
        throw new Error("Bad shape");
      }
      return result;
    } catch (e) {
      console.warn("AI verification failed, using keyword fallback:", e.message);
    }

    // Keyword fallback — no external call
    return keywordFallbackCheck(question, cleanAnswer);
  };

  /**
   * Offline fallback: check how many keywords appear in the student's answer.
   */
  const keywordFallbackCheck = (question, studentAnswer) => {
    const lower = studentAnswer.toLowerCase();
    const keywords = (question.keywords || []).map((k) => k.toLowerCase());
    const matchCount = keywords.filter((kw) => lower.includes(kw)).length;
    const ratio = keywords.length > 0 ? matchCount / keywords.length : 0;

    if (ratio >= 0.65) {
      return {
        score: 2,
        feedback: "Good answer! You covered the key concepts.",
      };
    } else if (ratio >= 0.3) {
      return {
        score: 1,
        feedback: `Partial credit. Try to also mention: ${keywords
          .filter((kw) => !lower.includes(kw))
          .join(", ")}.`,
      };
    } else {
      return {
        score: 0,
        feedback: `Incorrect or too vague. Key concepts to cover: ${keywords.join(", ")}.`,
      };
    }
  };

  const handleSubmitAnswer = async (question) => {
    const state = answerMap[question.id] || {};
    const rawText = state.text || "";
    const cleanText = sanitiseInput(rawText, 500);

    if (!cleanText.trim()) {
      Alert.alert("Empty Answer", "Please type something before submitting.");
      return;
    }

    if (!apiRateLimiter(`verify-${question.id}`)) {
      Alert.alert("Too fast", "Please wait a moment before re-submitting.");
      return;
    }

    Keyboard.dismiss();
    setAnswerMap((prev) => ({
      ...prev,
      [question.id]: { ...prev[question.id], state: ANSWER_STATE.SUBMITTED, verifying: true },
    }));

    await haptics.impact("Light");
    const result = await verifyAnswerWithAI(question, cleanText);

    const newState =
      result.score === 2
        ? ANSWER_STATE.CORRECT
        : result.score === 1
        ? ANSWER_STATE.PARTIAL
        : ANSWER_STATE.INCORRECT;

    setAnswerMap((prev) => ({
      ...prev,
      [question.id]: {
        ...prev[question.id],
        state: newState,
        feedback: result.feedback,
        score: result.score,
        verifying: false,
      },
    }));

    // Auto-reveal model answer after submission
    setRevealedAnswers((prev) => ({ ...prev, [question.id]: true }));

    // Auto-mark as completed and set check state
    setCompletedQuestions((prev) => ({
      ...prev,
      [question.id]: result.score >= 1, // credit for partial+correct
    }));

    await haptics.notification(result.score >= 1 ? "Success" : "Error");
  };

  const handleToggleInput = async (questionId) => {
    await haptics.impact("Light");
    setAnswerMap((prev) => {
      const current = prev[questionId] || {};
      if (current.state && current.state !== ANSWER_STATE.IDLE) return prev;
      return {
        ...prev,
        [questionId]: {
          ...current,
          state: current.state === ANSWER_STATE.TYPING ? ANSWER_STATE.IDLE : ANSWER_STATE.TYPING,
          text: current.text || "",
        },
      };
    });
  };

  const handleAnswerTextChange = (questionId, text) => {
    // Sanitise length on the fly (visual)
    const safe = text.slice(0, 500);
    setAnswerMap((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] || {}), text: safe },
    }));
  };

  const toggleAnswer = async (questionId) => {
    await haptics.impact("Light");
    setRevealedAnswers((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const markAsCompleted = async (questionId) => {
    await haptics.impact("Light");
    setCompletedQuestions((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const calculateScore = () => {
    const completed = Object.values(completedQuestions).filter(Boolean).length;
    // Count verified correct/partial
    const aiCorrect = Object.values(answerMap).filter((a) => a.score === 2).length;
    const aiPartial = Object.values(answerMap).filter((a) => a.score === 1).length;
    const total = currentQuestions.length;
    const percentage = Math.round((completed / total) * 100);
    setScore({ completed, total, percentage, aiCorrect, aiPartial });

    try {
      const currentUser = auth.currentUser;
      if (currentUser && completed > 0) {
        logUserActivity(db, currentUser.uid, "quiz", {
          completed,
          total,
          percentage,
          aiCorrect,
          aiPartial,
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const handleStartQuiz = async (session) => {
    await haptics.impact("Light");
    if (session.quiz) {
      setSelectedSession(session);
      setCurrentQuestions(session.quiz.questions);
      setRevealedAnswers({});
      setCompletedQuestions({});
      setAnswerMap({});
      setScore(null);
    } else {
      setPendingSession(session);
      setShowDifficultyPicker(true);
    }
  };

  const handleGenerateWithDifficulty = async (difficulty) => {
    setShowDifficultyPicker(false);
    setSelectedDifficulty(difficulty);
    const session = pendingSession;
    setPendingSession(null);
    await generateQuiz(session, difficulty);
  };

  const handleRegenerateQuiz = (session, difficulty) => {
    Alert.alert(
      "Regenerate Quiz",
      `Replace the existing quiz with a new "${difficulty}" quiz?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: () => generateQuiz(session, difficulty),
        },
      ]
    );
  };

  const handleBackToList = async () => {
    await haptics.impact("Light");
    setSelectedSession(null);
    setCurrentQuestions([]);
    setRevealedAnswers({});
    setCompletedQuestions({});
    setAnswerMap({});
    setScore(null);
  };

  // ==================== UI HELPERS ====================
  const getDifficultyColor = (difficulty) => {
    const map = { easy: "#10B981", medium: "#F59E0B", hard: "#EF4444", simple: "#10B981", difficult: "#EF4444" };
    return map[difficulty] || "#6B7280";
  };

  const getTypeIcon = (type) => {
    const map = { conceptual: "lightbulb", factual: "fact-check", application: "settings", analysis: "analytics" };
    return map[type] || "help-outline";
  };

  const getAnswerStateStyle = (state) => {
    switch (state) {
      case ANSWER_STATE.CORRECT: return { border: "#10B981", bg: "rgba(16,185,129,0.08)", icon: "check-circle", iconColor: "#10B981", label: "Correct!" };
      case ANSWER_STATE.PARTIAL: return { border: "#F59E0B", bg: "rgba(245,158,11,0.08)", icon: "adjust", iconColor: "#F59E0B", label: "Partial Credit" };
      case ANSWER_STATE.INCORRECT: return { border: "#EF4444", bg: "rgba(239,68,68,0.08)", icon: "cancel", iconColor: "#EF4444", label: "Incorrect" };
      default: return null;
    }
  };

  const completedCount = Object.values(completedQuestions).filter(Boolean).length;
  const progressPct = currentQuestions.length > 0 ? completedCount / currentQuestions.length : 0;

  // ==================== LOADING ====================
  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <LinearGradient
          colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
          style={styles.header}
        >
          <MaterialIcons name="quiz" size={32} color="rgba(255,255,255,0.3)" />
          <Text style={styles.headerTitle}>Quiz</Text>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9B5DE5" />
          <Text style={[styles.loadingText, isDark && styles.textDark]}>
            Loading quiz sessions…
          </Text>
        </View>
      </View>
    );
  }

  // ==================== DIFFICULTY PICKER MODAL ====================
  const DifficultyPicker = () => (
    <Animated.View
      style={[
        styles.difficultyOverlay,
        {
          opacity: difficultySheetAnim,
          pointerEvents: showDifficultyPicker ? "auto" : "none",
        },
      ]}
    >
      <TouchableOpacity
        style={styles.overlayDismiss}
        onPress={() => setShowDifficultyPicker(false)}
        activeOpacity={1}
      />
      <Animated.View
        style={[
          styles.difficultySheet,
          isDark && styles.difficultySheetDark,
          {
            transform: [
              {
                translateY: difficultySheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <Text style={[styles.sheetTitle, isDark && styles.textDark]}>
          Choose Difficulty
        </Text>
        <Text style={[styles.sheetSubtitle, isDark && styles.textSecondaryDark]}>
          The AI will tailor questions to the level you select.
        </Text>

        {Object.entries(DIFFICULTY_MODES).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[styles.difficultyOption, isDark && styles.difficultyOptionDark]}
            onPress={() => handleGenerateWithDifficulty(key)}
            disabled={generatingQuiz}
          >
            <LinearGradient
              colors={[cfg.color + "22", cfg.color + "11"]}
              style={styles.difficultyOptionGradient}
            >
              <View style={[styles.difficultyIconCircle, { backgroundColor: cfg.color + "25", borderColor: cfg.color }]}>
                <MaterialIcons name={cfg.icon} size={26} color={cfg.color} />
              </View>
              <View style={styles.difficultyOptionInfo}>
                <Text style={[styles.difficultyOptionLabel, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
                <Text style={[styles.difficultyOptionDesc, isDark && styles.textSecondaryDark]}>
                  {cfg.description}
                </Text>
                <Text style={[styles.difficultyOptionCount, { color: cfg.color + "CC" }]}>
                  {cfg.count}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={cfg.color} />
            </LinearGradient>
          </TouchableOpacity>
        ))}

        {generatingQuiz && (
          <View style={styles.generatingRow}>
            <ActivityIndicator size="small" color="#9B5DE5" />
            <Text style={[styles.generatingText, isDark && styles.textSecondaryDark]}>
              Generating your quiz…
            </Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );

  // ==================== QUIZ TAKING VIEW ====================
  if (selectedSession && currentQuestions.length > 0) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, isDark && styles.containerDark]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {showDifficultyPicker && <DifficultyPicker />}

        <LinearGradient
          colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backButton} onPress={handleBackToList}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {selectedSession.title}
            </Text>
            <View style={styles.headerBadgeRow}>
              {selectedSession.quiz?.difficulty && (
                <View
                  style={[
                    styles.headerBadge,
                    { backgroundColor: getDifficultyColor(selectedSession.quiz.difficulty) + "33" },
                  ]}
                >
                  <Text
                    style={[
                      styles.headerBadgeText,
                      { color: getDifficultyColor(selectedSession.quiz.difficulty) },
                    ]}
                  >
                    {selectedSession.quiz.difficulty}
                  </Text>
                </View>
              )}
              <Text style={styles.headerSubtitle}>
                {currentQuestions.length} Questions
              </Text>
            </View>
          </View>
          {/* Regenerate button */}
          <TouchableOpacity
            style={styles.regenButton}
            onPress={() => {
              setPendingSession(selectedSession);
              setShowDifficultyPicker(true);
            }}
          >
            <MaterialIcons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Score Result Card */}
          {score && (
            <Animated.View style={[styles.scoreCard, isDark && styles.scoreCardDark, { opacity: fadeAnim }]}>
              <Text style={[styles.scoreTitleText, isDark && styles.textDark]}>
                📊 Session Results
              </Text>
              <View style={styles.scoreRow}>
                <View style={styles.scoreItem}>
                  <Text style={[styles.scoreValue, { color: "#10B981" }]}>{score.aiCorrect}</Text>
                  <Text style={[styles.scoreLabel, isDark && styles.textSecondaryDark]}>Correct</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={[styles.scoreValue, { color: "#F59E0B" }]}>{score.aiPartial}</Text>
                  <Text style={[styles.scoreLabel, isDark && styles.textSecondaryDark]}>Partial</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={[styles.scoreValue, { color: "#9B5DE5" }]}>{score.percentage}%</Text>
                  <Text style={[styles.scoreLabel, isDark && styles.textSecondaryDark]}>Overall</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Progress Card */}
          <Animated.View
            style={[styles.progressCard, isDark && styles.progressCardDark, { opacity: fadeAnim }]}
          >
            <View style={styles.progressHeader}>
              <MaterialIcons name="emoji-events" size={24} color="#F59E0B" />
              <Text style={[styles.progressTitle, isDark && styles.textDark]}>Your Progress</Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBarBg}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.round(progressPct * 100)}%` },
                  progressPct === 1 && { backgroundColor: "#10B981" },
                ]}
              />
            </View>

            <View style={styles.progressStats}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>{completedCount}</Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Done</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {currentQuestions.length}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {Math.round(progressPct * 100)}%
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>Progress</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.calculateButton} onPress={calculateScore}>
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.calculateGradient}>
                <MaterialIcons name="calculate" size={20} color="#fff" />
                <Text style={styles.calculateText}>Calculate Score</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Questions */}
          {currentQuestions.map((question, index) => {
            const qState = answerMap[question.id] || {};
            const stateStyle = getAnswerStateStyle(qState.state);
            const isAnswered = [ANSWER_STATE.CORRECT, ANSWER_STATE.PARTIAL, ANSWER_STATE.INCORRECT].includes(qState.state);
            const isTyping = qState.state === ANSWER_STATE.TYPING;

            return (
              <Animated.View
                key={question.id}
                style={[
                  styles.questionCard,
                  isDark && styles.questionCardDark,
                  stateStyle && { borderLeftColor: stateStyle.border },
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 30],
                          outputRange: [0, index * 3],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {/* Question Header */}
                <View style={styles.questionHeader}>
                  <View
                    style={[
                      styles.questionNumber,
                      stateStyle && { borderColor: stateStyle.border, backgroundColor: stateStyle.bg },
                    ]}
                  >
                    {stateStyle ? (
                      <MaterialIcons name={stateStyle.icon} size={22} color={stateStyle.iconColor} />
                    ) : (
                      <Text style={styles.questionNumberText}>Q{index + 1}</Text>
                    )}
                  </View>
                  <View style={styles.questionMeta}>
                    <View
                      style={[
                        styles.difficultyBadge,
                        { backgroundColor: getDifficultyColor(question.difficulty) + "20" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.difficultyText,
                          { color: getDifficultyColor(question.difficulty) },
                        ]}
                      >
                        {question.difficulty}
                      </Text>
                    </View>
                    <MaterialIcons
                      name={getTypeIcon(question.type)}
                      size={18}
                      color={isDark ? "#9CA3AF" : "#6B7280"}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.checkButton}
                    onPress={() => markAsCompleted(question.id)}
                  >
                    <MaterialIcons
                      name={completedQuestions[question.id] ? "check-circle" : "radio-button-unchecked"}
                      size={24}
                      color={completedQuestions[question.id] ? "#10B981" : "#D1D5DB"}
                    />
                  </TouchableOpacity>
                </View>

                {/* Question Text */}
                <Text style={[styles.questionText, isDark && styles.textDark]}>
                  {question.question}
                </Text>

                {/* Topic Tag */}
                <View style={styles.topicTag}>
                  <MaterialIcons name="label" size={14} color="#9B5DE5" />
                  <Text style={styles.topicText}>{question.topic}</Text>
                </View>

                {/* ---- Answer Input Section ---- */}
                {!isAnswered && (
                  <View style={styles.answerInputSection}>
                    <TouchableOpacity
                      style={[styles.typeAnswerButton, isTyping && styles.typeAnswerButtonActive]}
                      onPress={() => handleToggleInput(question.id)}
                    >
                      <MaterialIcons
                        name={isTyping ? "edit-off" : "edit"}
                        size={18}
                        color={isTyping ? "#9B5DE5" : "#6B7280"}
                      />
                      <Text
                        style={[
                          styles.typeAnswerText,
                          isTyping && styles.typeAnswerTextActive,
                        ]}
                      >
                        {isTyping ? "Cancel typing" : "Type your answer (optional)"}
                      </Text>
                    </TouchableOpacity>

                    {isTyping && (
                      <View style={[styles.inputWrapper, isDark && styles.inputWrapperDark]}>
                        <TextInput
                          style={[styles.answerInput, isDark && styles.answerInputDark]}
                          placeholder="Type your answer here…"
                          placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                          value={qState.text || ""}
                          onChangeText={(t) => handleAnswerTextChange(question.id, t)}
                          multiline
                          maxLength={500}
                          returnKeyType="done"
                          blurOnSubmit
                          autoFocus
                        />
                        <View style={styles.inputFooter}>
                          <Text style={styles.charCount}>
                            {(qState.text || "").length}/500
                          </Text>
                          <TouchableOpacity
                            style={styles.submitAnswerButton}
                            onPress={() => handleSubmitAnswer(question)}
                            disabled={qState.verifying}
                          >
                            <LinearGradient
                              colors={["#9B5DE5", "#7C3AED"]}
                              style={styles.submitGradient}
                            >
                              {qState.verifying ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <>
                                  <MaterialIcons name="send" size={16} color="#fff" />
                                  <Text style={styles.submitText}>Submit</Text>
                                </>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* ---- AI Feedback after submission ---- */}
                {isAnswered && stateStyle && (
                  <View
                    style={[
                      styles.feedbackCard,
                      { backgroundColor: stateStyle.bg, borderColor: stateStyle.border },
                    ]}
                  >
                    <View style={styles.feedbackHeader}>
                      <MaterialIcons name={stateStyle.icon} size={20} color={stateStyle.iconColor} />
                      <Text style={[styles.feedbackLabel, { color: stateStyle.iconColor }]}>
                        {stateStyle.label}
                      </Text>
                    </View>
                    {qState.text ? (
                      <Text style={[styles.studentAnswerText, isDark && styles.textSecondaryDark]}>
                        Your answer: <Text style={{ fontStyle: "italic" }}>"{qState.text}"</Text>
                      </Text>
                    ) : null}
                    <Text style={[styles.feedbackText, isDark && styles.textSecondaryDark]}>
                      {qState.feedback}
                    </Text>
                  </View>
                )}

                {/* ---- Show/Hide Answer Toggle ---- */}
                <TouchableOpacity
                  style={[
                    styles.answerToggle,
                    revealedAnswers[question.id] && styles.answerToggleActive,
                  ]}
                  onPress={() => toggleAnswer(question.id)}
                >
                  <MaterialIcons
                    name={revealedAnswers[question.id] ? "visibility-off" : "visibility"}
                    size={20}
                    color={revealedAnswers[question.id] ? "#7C3AED" : "#6B7280"}
                  />
                  <Text
                    style={[
                      styles.answerToggleText,
                      revealedAnswers[question.id] && styles.answerToggleTextActive,
                    ]}
                  >
                    {revealedAnswers[question.id] ? "Hide Model Answer" : "Show Model Answer"}
                  </Text>
                </TouchableOpacity>

                {revealedAnswers[question.id] && (
                  <View style={styles.answerContainer}>
                    <View style={styles.answerHeader}>
                      <MaterialIcons name="check-circle" size={20} color="#10B981" />
                      <Text style={[styles.answerLabel, isDark && styles.textDark]}>
                        Model Answer:
                      </Text>
                    </View>
                    <Text style={[styles.answerText, isDark && styles.textSecondaryDark]}>
                      {question.answer}
                    </Text>
                    {question.rubric ? (
                      <View style={styles.rubricRow}>
                        <MaterialIcons name="rule" size={14} color="#9B5DE5" />
                        <Text style={styles.rubricText}>{question.rubric}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </Animated.View>
            );
          })}

          {/* Completion */}
          {completedCount === currentQuestions.length && currentQuestions.length > 0 && (
            <Animated.View style={[styles.completionCard, isDark && styles.completionCardDark]}>
              <MaterialIcons name="celebration" size={48} color="#F59E0B" />
              <Text style={[styles.completionTitle, isDark && styles.textDark]}>
                🎉 Quiz Completed!
              </Text>
              <Text style={[styles.completionText, isDark && styles.textSecondaryDark]}>
                You've answered all {currentQuestions.length} questions.
              </Text>
              <TouchableOpacity
                style={styles.reviewButton}
                onPress={() => {
                  setRevealedAnswers({});
                  setCompletedQuestions({});
                  setAnswerMap({});
                  setScore(null);
                }}
              >
                <LinearGradient colors={["#9B5DE5", "#7C3AED"]} style={styles.reviewGradient}>
                  <MaterialIcons name="refresh" size={20} color="#fff" />
                  <Text style={styles.reviewText}>Retake Quiz</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ==================== SESSION LIST VIEW ====================
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {showDifficultyPicker && <DifficultyPicker />}

      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
        style={styles.header}
      >
        <View style={styles.headerPattern} />
        <MaterialIcons name="quiz" size={32} color="rgba(255,255,255,0.3)" />
        <Text style={styles.headerTitle}>Quiz</Text>
        <Text style={styles.headerSubtitle}>Test your knowledge</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {quizSessions.length === 0 ? (
          <Animated.View
            style={[styles.emptyContainer, isDark && styles.emptyContainerDark, { opacity: fadeAnim }]}
          >
            <MaterialIcons name="quiz" size={64} color="#D1D5DB" />
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No Quizzes Yet</Text>
            <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
              Record and organise lectures to generate AI quizzes automatically.
            </Text>
            <TouchableOpacity
              style={styles.goButton}
              onPress={() => navigation.navigate("RecordScreen")}
            >
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.goGradient}>
                <MaterialIcons name="mic" size={20} color="#fff" />
                <Text style={styles.goText}>Record Lecture</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
              <MaterialIcons name="auto-awesome" size={24} color="#9B5DE5" />
              <Text style={[styles.infoText, isDark && styles.textDark]}>
                AI-generated quizzes with conceptual answer grading. Choose Simple, Medium, or Difficult.
              </Text>
            </View>

            {quizSessions.map((session, index) => (
              <Animated.View
                key={session.id}
                style={[
                  styles.sessionCard,
                  isDark && styles.sessionCardDark,
                  {
                    transform: [
                      {
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 30],
                          outputRange: [0, index * 5],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionIcon}>
                    <LinearGradient colors={["#9B5DE5", "#7C3AED"]} style={styles.sessionIconGradient}>
                      <MaterialIcons name="school" size={24} color="#fff" />
                    </LinearGradient>
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionTitle, isDark && styles.textDark]}>
                      {session.title}
                    </Text>
                    <View style={styles.sessionMeta}>
                      <MaterialIcons name="calendar-today" size={14} color="#9CA3AF" />
                      <Text style={styles.sessionDate}>
                        {session.date.toLocaleDateString()}
                      </Text>
                      {session.quiz?.difficulty && (
                        <View
                          style={[
                            styles.sessionDiffBadge,
                            { backgroundColor: getDifficultyColor(session.quiz.difficulty) + "22" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sessionDiffText,
                              { color: getDifficultyColor(session.quiz.difficulty) },
                            ]}
                          >
                            {session.quiz.difficulty}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {session.quiz ? (
                  <>
                    <View style={styles.quizInfo}>
                      <View style={styles.quizStat}>
                        <MaterialIcons name="question-answer" size={18} color="#10B981" />
                        <Text style={[styles.quizStatText, isDark && styles.textSecondaryDark]}>
                          {session.quiz.questions.length} Questions
                        </Text>
                      </View>
                      <View style={styles.quizStat}>
                        <MaterialIcons name="timelapse" size={18} color="#F59E0B" />
                        <Text style={[styles.quizStatText, isDark && styles.textSecondaryDark]}>
                          ~{Math.ceil(session.quiz.questions.length * 1.5)} min
                        </Text>
                      </View>
                      <View style={styles.quizStat}>
                        <MaterialIcons name="psychology" size={18} color="#9B5DE5" />
                        <Text style={[styles.quizStatText, isDark && styles.textSecondaryDark]}>
                          AI graded
                        </Text>
                      </View>
                    </View>

                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={[styles.startButton, { flex: 2 }]}
                        onPress={() => handleStartQuiz(session)}
                      >
                        <LinearGradient colors={["#10B981", "#059669"]} style={styles.startGradient}>
                          <MaterialIcons name="play-arrow" size={20} color="#fff" />
                          <Text style={styles.startText}>Start Quiz</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.regenSmallButton}
                        onPress={() => {
                          setPendingSession(session);
                          setShowDifficultyPicker(true);
                        }}
                        disabled={generatingQuiz}
                      >
                        <LinearGradient
                          colors={isDark ? ["#374151", "#1F2937"] : ["#F3F4F6", "#E5E7EB"]}
                          style={styles.regenSmallGradient}
                        >
                          {generatingQuiz ? (
                            <ActivityIndicator size="small" color="#9B5DE5" />
                          ) : (
                            <MaterialIcons name="refresh" size={20} color="#9B5DE5" />
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={() => {
                      setPendingSession(session);
                      setShowDifficultyPicker(true);
                    }}
                    disabled={generatingQuiz}
                  >
                    <LinearGradient colors={["#9B5DE5", "#7C3AED"]} style={styles.generateGradient}>
                      {generatingQuiz ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          {/* <MaterialIcons name="auto-awesome" size={20} color="#fff" /> */}
                          <Text style={styles.generateText}>Generate Quiz</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FE" },
  containerDark: { backgroundColor: "#0A0E27" },

  // Header
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  headerPattern: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.08,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    position: "absolute",
    left: 24, top: 60, zIndex: 10,
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  regenButton: {
    position: "absolute",
    right: 24, top: 60, zIndex: 10,
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerContent: { alignItems: "center", paddingHorizontal: 60 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 12,
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    fontWeight: "500",
  },
  headerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },

  // Content
  content: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  loadingText: { fontSize: 16, color: "#6B7280", marginTop: 16, fontWeight: "500" },

  // Score Card
  scoreCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(155,93,229,0.15)",
  },
  scoreCardDark: { backgroundColor: "#1E293B", borderColor: "rgba(155,93,229,0.25)" },
  scoreTitleText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
    textAlign: "center",
  },
  scoreRow: { flexDirection: "row", justifyContent: "space-around" },
  scoreItem: { alignItems: "center" },
  scoreValue: { fontSize: 32, fontWeight: "800" },
  scoreLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600", marginTop: 4 },

  // Progress Card
  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(155,93,229,0.1)",
  },
  progressCardDark: { backgroundColor: "#1E293B", borderColor: "rgba(155,93,229,0.2)" },
  progressHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  progressTitle: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginLeft: 12 },
  progressBarBg: {
    height: 8,
    backgroundColor: "rgba(155,93,229,0.12)",
    borderRadius: 4,
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#9B5DE5",
    borderRadius: 4,
    minWidth: 8,
  },
  progressStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: "rgba(155,93,229,0.05)",
    borderRadius: 16,
  },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 32, fontWeight: "800", color: "#9B5DE5", marginBottom: 4 },
  statLabel: {
    fontSize: 13, color: "#6B7280", fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  statDivider: { width: 1, height: 40, backgroundColor: "rgba(155,93,229,0.2)" },
  calculateButton: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  calculateGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 16, paddingHorizontal: 24,
  },
  calculateText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 8 },

  // Question Card
  questionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#9B5DE5",
  },
  questionCardDark: { backgroundColor: "#1E293B", shadowColor: "#9B5DE5", shadowOpacity: 0.15 },
  questionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  questionNumber: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(155,93,229,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#9B5DE5",
  },
  questionNumberText: { fontSize: 16, fontWeight: "800", color: "#9B5DE5" },
  questionMeta: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  difficultyBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  difficultyText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  checkButton: { padding: 4 },
  questionText: { fontSize: 17, fontWeight: "600", color: "#1F2937", lineHeight: 26, marginBottom: 12 },
  topicTag: {
    flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(155,93,229,0.1)",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, marginBottom: 16,
    borderWidth: 1, borderColor: "rgba(155,93,229,0.2)",
  },
  topicText: { fontSize: 13, fontWeight: "600", color: "#9B5DE5", marginLeft: 6 },

  // Answer Input Section
  answerInputSection: { marginBottom: 12 },
  typeAnswerButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(107,114,128,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(107,114,128,0.18)",
    marginBottom: 8,
    gap: 8,
  },
  typeAnswerButtonActive: {
    backgroundColor: "rgba(155,93,229,0.08)",
    borderColor: "#9B5DE5",
  },
  typeAnswerText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  typeAnswerTextActive: { color: "#9B5DE5" },
  inputWrapper: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  inputWrapperDark: { backgroundColor: "#0F172A", borderColor: "#374151" },
  answerInput: {
    padding: 16,
    fontSize: 15,
    color: "#1F2937",
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
  },
  answerInputDark: { color: "#F3F4F6" },
  inputFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  charCount: { fontSize: 12, color: "#9CA3AF", fontWeight: "500" },
  submitAnswerButton: { borderRadius: 10, overflow: "hidden" },
  submitGradient: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 8, gap: 6,
  },
  submitText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // Feedback Card
  feedbackCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
  },
  feedbackHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  feedbackLabel: { fontSize: 15, fontWeight: "700" },
  studentAnswerText: { fontSize: 13, color: "#6B7280", marginBottom: 8, lineHeight: 20 },
  feedbackText: { fontSize: 14, color: "#374151", lineHeight: 21, fontWeight: "500" },

  // Answer Toggle
  answerToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 14, marginTop: 8,
    backgroundColor: "rgba(107,114,128,0.1)",
    borderWidth: 1.5, borderColor: "rgba(107,114,128,0.2)",
  },
  answerToggleActive: {
    backgroundColor: "rgba(124,58,237,0.12)",
    borderColor: "#9B5DE5",
  },
  answerToggleText: { fontSize: 15, fontWeight: "600", color: "#6B7280", marginLeft: 8 },
  answerToggleTextActive: { color: "#7C3AED" },
  answerContainer: {
    marginTop: 16, padding: 16,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)",
  },
  answerHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  answerLabel: { fontSize: 15, fontWeight: "700", color: "#10B981", marginLeft: 8 },
  answerText: { fontSize: 15, color: "#374151", lineHeight: 24, fontWeight: "500" },
  rubricRow: {
    flexDirection: "row", alignItems: "flex-start",
    marginTop: 10, gap: 6,
    backgroundColor: "rgba(155,93,229,0.08)",
    borderRadius: 8, padding: 10,
  },
  rubricText: { flex: 1, fontSize: 12, color: "#9B5DE5", fontWeight: "600", lineHeight: 18 },

  // Completion Card
  completionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24, padding: 32,
    alignItems: "center",
    marginTop: 16, marginBottom: 24,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
    borderWidth: 2, borderColor: "rgba(245,158,11,0.3)",
  },
  completionCardDark: { backgroundColor: "#1E293B", borderColor: "rgba(245,158,11,0.4)" },
  completionTitle: { fontSize: 26, fontWeight: "800", color: "#1F2937", marginTop: 16, marginBottom: 8, textAlign: "center" },
  completionText: { fontSize: 15, color: "#6B7280", textAlign: "center", marginBottom: 24, lineHeight: 22 },
  reviewButton: { borderRadius: 16, overflow: "hidden", width: "100%", shadowColor: "#9B5DE5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  reviewGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  reviewText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 8 },

  // Session Cards
  sessionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
    borderWidth: 1, borderColor: "rgba(155,93,229,0.08)",
  },
  sessionCardDark: { backgroundColor: "#1E293B", borderColor: "rgba(155,93,229,0.15)" },
  sessionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  sessionIcon: { marginRight: 16, borderRadius: 16, overflow: "hidden" },
  sessionIconGradient: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  sessionInfo: { flex: 1 },
  sessionTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937", marginBottom: 6 },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  sessionDate: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  sessionDiffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sessionDiffText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  quizInfo: {
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 14, paddingHorizontal: 12,
    backgroundColor: "rgba(155,93,229,0.05)",
    borderRadius: 14, marginBottom: 16,
  },
  quizStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  quizStatText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  buttonRow: { flexDirection: "row", gap: 10 },
  startButton: { borderRadius: 14, overflow: "hidden", flex: 2, shadowColor: "#10B981", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
  startGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  startText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 8 },
  regenSmallButton: { borderRadius: 14, overflow: "hidden", width: 50 },
  regenSmallGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  generateButton: { borderRadius: 14, overflow: "hidden", shadowColor: "#9B5DE5", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
  generateGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  generateText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 8 },

  // Difficulty Picker
  difficultyOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999, justifyContent: "flex-end",
  },
  overlayDismiss: { flex: 1 },
  difficultySheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  difficultySheetDark: { backgroundColor: "#1E293B" },
  sheetHandle: {
    width: 40, height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center", marginBottom: 24,
  },
  sheetTitle: { fontSize: 24, fontWeight: "800", color: "#1F2937", marginBottom: 6, textAlign: "center" },
  sheetSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  difficultyOption: { borderRadius: 20, overflow: "hidden", marginBottom: 12 },
  difficultyOptionDark: {},
  difficultyOptionGradient: {
    flexDirection: "row", alignItems: "center",
    padding: 16, gap: 14,
    borderRadius: 20,
    borderWidth: 1.5, borderColor: "transparent",
  },
  difficultyIconCircle: {
    width: 52, height: 52,
    borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  difficultyOptionInfo: { flex: 1 },
  difficultyOptionLabel: { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  difficultyOptionDesc: { fontSize: 13, color: "#6B7280", marginBottom: 2 },
  difficultyOptionCount: { fontSize: 12, fontWeight: "600" },
  generatingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  generatingText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },

  // Info & Empty
  infoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(155,93,229,0.1)",
    borderRadius: 16, padding: 16, marginBottom: 24,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(155,93,229,0.2)",
  },
  infoCardDark: { backgroundColor: "rgba(155,93,229,0.15)", borderColor: "rgba(155,93,229,0.3)" },
  infoText: { flex: 1, fontSize: 14, color: "#4B5563", marginLeft: 12, lineHeight: 20, fontWeight: "500" },
  emptyContainer: {
    alignItems: "center", justifyContent: "center",
    padding: 48, backgroundColor: "#FFFFFF",
    borderRadius: 24, marginTop: 40,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  emptyContainerDark: { backgroundColor: "#1E293B" },
  emptyTitle: { fontSize: 24, fontWeight: "800", color: "#1F2937", marginTop: 24, marginBottom: 8 },
  emptyText: { fontSize: 15, color: "#6B7280", textAlign: "center", marginBottom: 32, lineHeight: 22, paddingHorizontal: 20 },
  goButton: { borderRadius: 16, overflow: "hidden", width: "80%", shadowColor: "#10B981", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  goGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  goText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 8 },

  // Dark Mode Text
  textDark: { color: "#F3F4F6" },
  textSecondaryDark: { color: "#9CA3AF" },
});