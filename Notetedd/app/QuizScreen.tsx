import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import haptics from "./utils/haptics";
import { getFirestore, collection, query, where, orderBy, getDocs, doc, updateDoc } from "firebase/firestore";
import { logUserActivity } from './utils/userActivity';
import { getAuth } from "firebase/auth";

// ==================== API KEYS ====================
const GROQ_API_KEY = "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"; 
const GEMINI_API_KEY = "AIzaSyDQraKwy8C4zbRJ9ys2Xl9DUbzhvmv9Wco"; 

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";

export default function QuizScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  const [quizSessions, setQuizSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [completedQuestions, setCompletedQuestions] = useState({});

  // Firebase
  const auth = getAuth();
  const db = getFirestore();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    console.log("📝 QuizScreen mounted");
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    fetchAllQuizSessions();
  }, []);

  const fetchAllQuizSessions = async () => {
    try {
      console.log("📚 Fetching quiz sessions...");
      setLoading(true);

      const currentUser = auth.currentUser;
      let sessions = [];

      // Try Firestore first
      if (currentUser) {
        const recordingsRef = collection(db, "recordings");
        const q = query(
          recordingsRef,
          where("userId", "==", currentUser.uid),
          orderBy("createdAt", "desc")
        );

        const querySnapshot = await getDocs(q);
        
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          if (data.organizedNotes) {
            const session = {
              id: doc.id,
              title: data.organizedNotes.title || "Untitled Lecture",
              date: data.createdAt?.toDate() || new Date(),
              notes: data.organizedNotes,
              quiz: data.quiz || null,
              source: "firestore",
            };
            sessions.push(session);
          }
        }
      }

      // Fallback to AsyncStorage
      if (sessions.length === 0) {
        const savedNotes = await AsyncStorage.getItem('organizedNotes');
        if (savedNotes) {
          const notes = JSON.parse(savedNotes);
          const savedQuiz = await AsyncStorage.getItem('latestQuiz');
          
          sessions.push({
            id: 'local-1',
            title: notes.title || "Untitled Lecture",
            date: new Date(),
            notes: notes,
            quiz: savedQuiz ? JSON.parse(savedQuiz) : null,
            source: "asyncstorage",
          });
        }
      }

      console.log(`✅ Found ${sessions.length} quiz sessions`);
      setQuizSessions(sessions);

    } catch (error) {
      console.error("❌ Fetch error:", error);
      Alert.alert("Error", "Failed to load quiz sessions");
    } finally {
      setLoading(false);
    }
  };

  // ==================== QUIZ GENERATION ====================
  const generateQuizWithGroq = async (notes) => {
    console.log("⚡ Generating quiz with Groq...");

    const prompt = `Based on these lecture notes, generate a comprehensive quiz.

Notes:
Title: ${notes.title}
Summary: ${notes.summary}
Key Points: ${notes.keyPoints.join(", ")}
Sections: ${notes.sections.map(s => s.title + ": " + s.content).join(" ")}

Generate a JSON quiz with this exact structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Clear, specific question",
      "answer": "Detailed, educational answer",
      "type": "conceptual",
      "difficulty": "medium",
      "topic": "Main topic area"
    }
  ]
}

Requirements:
- Create 10-15 questions
- Mix of types: conceptual, factual, application
- Vary difficulty: easy, medium, hard
- Cover all main topics
- Answers should be 2-3 sentences explaining the concept
- Make questions clear and unambiguous`;

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: "You are a quiz generation expert. Create educational quizzes from lecture notes. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API Error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.choices[0].message.content.trim();
    
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return JSON.parse(responseText);
  };

  const generateQuizWithGemini = async (notes) => {
    console.log("🌟 Generating quiz with Gemini...");

    const prompt = `Based on these lecture notes, generate a comprehensive quiz.

Notes:
Title: ${notes.title}
Summary: ${notes.summary}
Key Points: ${notes.keyPoints.join(", ")}

Return ONLY valid JSON with this structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Clear question text",
      "answer": "Detailed answer explanation",
      "type": "conceptual",
      "difficulty": "medium",
      "topic": "Topic area"
    }
  ]
}

Create 10-15 diverse questions covering all main topics. Mix conceptual, factual, and application questions.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.candidates[0].content.parts[0].text;
    
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return JSON.parse(responseText);
  };

  const generateQuiz = async (session) => {
    try {
      await haptics.impact("Medium");
      setGeneratingQuiz(true);
      console.log("🎯 Generating quiz for:", session.title);

      if (!session.notes) {
        throw new Error("No notes available for this session");
      }

      let quiz = null;

      // Try Groq first
      if (GROQ_API_KEY && GROQ_API_KEY.length > 10) {
        try {
          quiz = await generateQuizWithGroq(session.notes);
          console.log("✅ Groq quiz generated!");
        } catch (error) {
          console.error("❌ Groq failed:", error.message);
        }
      }

      // Fallback to Gemini
      if (!quiz && GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
        try {
          quiz = await generateQuizWithGemini(session.notes);
          console.log("✅ Gemini quiz generated!");
        } catch (error) {
          console.error("❌ Gemini failed:", error.message);
        }
      }

      // Final fallback
      if (!quiz) {
        quiz = createFallbackQuiz(session.notes);
      }

      // Save quiz
      if (session.source === "firestore") {
        const recordingRef = doc(db, "recordings", session.id);
        await updateDoc(recordingRef, { quiz: quiz });
      } else {
        await AsyncStorage.setItem('latestQuiz', JSON.stringify(quiz));
      }

      // Update session
      const updatedSession = { ...session, quiz: quiz };
      setQuizSessions(prev => prev.map(s => s.id === session.id ? updatedSession : s));
      
      setSelectedSession(updatedSession);
      setCurrentQuestions(quiz.questions);
      
      await haptics.notification("Success");
      Alert.alert("Success!", `Generated ${quiz.questions.length} questions`);

    } catch (error) {
      console.error("❌ Quiz generation error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const createFallbackQuiz = (notes) => {
    console.log("🔄 Creating fallback quiz...");
    
    const questions = [];
    let id = 1;

    // Questions from key points
    notes.keyPoints.forEach((point, i) => {
      questions.push({
        id: id++,
        question: `Explain: ${point.substring(0, 80)}${point.length > 80 ? '...' : ''}`,
        answer: point,
        type: "conceptual",
        difficulty: "medium",
        topic: "Key Concepts",
      });
    });

    // Questions from sections
    notes.sections.forEach((section, i) => {
      if (i < 3) {
        questions.push({
          id: id++,
          question: `What are the main points about ${section.title}?`,
          answer: section.content.substring(0, 200) + "...",
          type: "factual",
          difficulty: "easy",
          topic: section.title,
        });
      }
    });

    // Questions from definitions
    Object.entries(notes.definitions).forEach(([term, def], i) => {
      if (i < 3) {
        questions.push({
          id: id++,
          question: `Define: ${term}`,
          answer: def,
          type: "factual",
          difficulty: "easy",
          topic: "Definitions",
        });
      }
    });

    return { questions: questions.slice(0, 12) };
  };

  const handleStartQuiz = async (session) => {
    await haptics.impact("Light");

    if (session.quiz) {
      setSelectedSession(session);
      setCurrentQuestions(session.quiz.questions);
      setRevealedAnswers({});
      setCompletedQuestions({});
      setScore(null);
    } else {
      Alert.alert(
        "Generate Quiz",
        "No quiz exists for this lecture. Generate one now?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Generate", onPress: () => generateQuiz(session) }
        ]
      );
    }
  };

  const toggleAnswer = async (questionId) => {
    await haptics.impact("Light");
    setRevealedAnswers(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const markAsCompleted = async (questionId) => {
    await haptics.impact("Light");
    setCompletedQuestions(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const calculateScore = () => {
    const completed = Object.keys(completedQuestions).filter(k => completedQuestions[k]).length;
    const total = currentQuestions.length;
    const percentage = Math.round((completed / total) * 100);
    setScore({ completed, total, percentage });
    // Log quiz completion activity (counts towards streak)
    try {
      const currentUser = auth.currentUser;
      if (currentUser && completed > 0) {
        logUserActivity(db, currentUser.uid, 'quiz', { completed, total, percentage }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to log quiz activity:', err);
    }
  };

  const handleBackToList = async () => {
    await haptics.impact("Light");
    setSelectedSession(null);
    setCurrentQuestions([]);
    setRevealedAnswers({});
    setCompletedQuestions({});
    setScore(null);
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case "easy": return "#10B981";
      case "medium": return "#F59E0B";
      case "hard": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "conceptual": return "lightbulb";
      case "factual": return "fact-check";
      case "application": return "settings";
      default: return "help-outline";
    }
  };

  // ==================== RENDER ====================
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
            Loading quiz sessions...
          </Text>
        </View>
      </View>
    );
  }

  // Quiz Taking View
  if (selectedSession && currentQuestions.length > 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <LinearGradient
          colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backButton} onPress={handleBackToList}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{selectedSession.title}</Text>
            <Text style={styles.headerSubtitle}>
              {currentQuestions.length} Questions
            </Text>
          </View>
        </LinearGradient>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Progress Card */}
          <Animated.View 
            style={[
              styles.progressCard,
              isDark && styles.progressCardDark,
              { opacity: fadeAnim }
            ]}
          >
            <View style={styles.progressHeader}>
              <MaterialIcons name="emoji-events" size={24} color="#F59E0B" />
              <Text style={[styles.progressTitle, isDark && styles.textDark]}>
                Your Progress
              </Text>
            </View>
            <View style={styles.progressStats}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {Object.values(completedQuestions).filter(Boolean).length}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Completed
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {currentQuestions.length}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Total
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {Math.round((Object.values(completedQuestions).filter(Boolean).length / currentQuestions.length) * 100)}%
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textSecondaryDark]}>
                  Progress
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.calculateButton}
              onPress={calculateScore}
            >
              <LinearGradient
                colors={["#10B981", "#059669"]}
                style={styles.calculateGradient}
              >
                <MaterialIcons name="calculate" size={20} color="#fff" />
                <Text style={styles.calculateText}>Calculate Score</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Questions */}
          {currentQuestions.map((question, index) => (
            <Animated.View
              key={question.id}
              style={[
                styles.questionCard,
                isDark && styles.questionCardDark,
                {
                  opacity: fadeAnim,
                  transform: [{
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 30],
                      outputRange: [0, index * 5],
                    }),
                  }],
                },
              ]}
            >
              {/* Question Header */}
              <View style={styles.questionHeader}>
                <View style={styles.questionNumber}>
                  <Text style={styles.questionNumberText}>Q{index + 1}</Text>
                </View>
                <View style={styles.questionMeta}>
                  <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(question.difficulty) + '20' }]}>
                    <Text style={[styles.difficultyText, { color: getDifficultyColor(question.difficulty) }]}>
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

              {/* Question */}
              <Text style={[styles.questionText, isDark && styles.textDark]}>
                {question.question}
              </Text>

              {/* Topic Tag */}
              <View style={styles.topicTag}>
                <MaterialIcons name="label" size={14} color="#9B5DE5" />
                <Text style={styles.topicText}>{question.topic}</Text>
              </View>

              {/* Answer Toggle */}
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
                  {revealedAnswers[question.id] ? "Hide Answer" : "Show Answer"}
                </Text>
              </TouchableOpacity>

              {/* Answer */}
              {revealedAnswers[question.id] && (
                <Animated.View style={styles.answerContainer}>
                  <View style={styles.answerHeader}>
                    <MaterialIcons name="check-circle" size={20} color="#10B981" />
                    <Text style={[styles.answerLabel, isDark && styles.textDark]}>
                      Answer:
                    </Text>
                  </View>
                  <Text style={[styles.answerText, isDark && styles.textSecondaryDark]}>
                    {question.answer}
                  </Text>
                </Animated.View>
              )}
            </Animated.View>
          ))}

          {/* Completion Message */}
          {Object.values(completedQuestions).filter(Boolean).length === currentQuestions.length && (
            <Animated.View style={[styles.completionCard, isDark && styles.completionCardDark]}>
              <MaterialIcons name="celebration" size={48} color="#F59E0B" />
              <Text style={[styles.completionTitle, isDark && styles.textDark]}>
                🎉 Quiz Completed!
              </Text>
              <Text style={[styles.completionText, isDark && styles.textSecondaryDark]}>
                Great job! You've answered all {currentQuestions.length} questions.
              </Text>
              <TouchableOpacity 
                style={styles.reviewButton}
                onPress={() => {
                  setRevealedAnswers({});
                  setCompletedQuestions({});
                }}
              >
                <LinearGradient
                  colors={["#9B5DE5", "#7C3AED"]}
                  style={styles.reviewGradient}
                >
                  <MaterialIcons name="refresh" size={20} color="#fff" />
                  <Text style={styles.reviewText}>Retake Quiz</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    );
  }

  // Quiz Sessions List View
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
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
            style={[
              styles.emptyContainer,
              isDark && styles.emptyContainerDark,
              { opacity: fadeAnim }
            ]}
          >
            <MaterialIcons name="quiz" size={64} color="#D1D5DB" />
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              No Quizzes Yet
            </Text>
            <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
              Record and organize lectures to generate quizzes automatically
            </Text>
            <TouchableOpacity 
              style={styles.goButton}
              onPress={() => navigation.navigate("RecordScreen")}
            >
              <LinearGradient
                colors={["#10B981", "#059669"]}
                style={styles.goGradient}
              >
                <MaterialIcons name="mic" size={20} color="#fff" />
                <Text style={styles.goText}>Record Lecture</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Info Card */}
            <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
              <MaterialIcons name="info-outline" size={24} color="#9B5DE5" />
              <Text style={[styles.infoText, isDark && styles.textDark]}>
                AI-generated quizzes from your lecture notes. Tap to start or generate new quizzes!
              </Text>
            </View>

            {/* Quiz Sessions */}
            {quizSessions.map((session, index) => (
              <Animated.View
                key={session.id}
                style={[
                  styles.sessionCard,
                  isDark && styles.sessionCardDark,
                  {
                    transform: [{
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 30],
                        outputRange: [0, index * 5],
                      }),
                    }],
                  },
                ]}
              >
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionIcon}>
                    <LinearGradient
                      colors={["#9B5DE5", "#7C3AED"]}
                      style={styles.sessionIconGradient}
                    >
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
                    </View>

                    <TouchableOpacity
                      style={styles.startButton}
                      onPress={() => handleStartQuiz(session)}
                    >
                      <LinearGradient
                        colors={["#10B981", "#059669"]}
                        style={styles.startGradient}
                      >
                        <MaterialIcons name="play-arrow" size={20} color="#fff" />
                        <Text style={styles.startText}>Start Quiz</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={() => generateQuiz(session)}
                    disabled={generatingQuiz}
                  >
                    <LinearGradient
                      colors={["#9B5DE5", "#7C3AED"]}
                      style={styles.generateGradient}
                    >
                      {generatingQuiz ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialIcons name="auto-awesome" size={20} color="#fff" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FE",
  },
  containerDark: {
    backgroundColor: "#0A0E27",
  },
  
  // ==================== HEADER ====================
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.08,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    position: "absolute",
    left: 24,
    top: 60,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(10px)",
  },
  headerContent: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 12,
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  // ==================== CONTENT ====================
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 16,
    fontWeight: "500",
  },

  // ==================== PROGRESS CARD ====================
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
    borderColor: "rgba(155, 93, 229, 0.1)",
  },
  progressCardDark: {
    backgroundColor: "#1E293B",
    borderColor: "rgba(155, 93, 229, 0.2)",
    shadowColor: "#9B5DE5",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginLeft: 12,
    letterSpacing: 0.3,
  },
  progressStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: "rgba(155, 93, 229, 0.05)",
    borderRadius: 16,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#9B5DE5",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(155, 93, 229, 0.2)",
  },
  calculateButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  calculateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  calculateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
    letterSpacing: 0.3,
  },

  // ==================== QUESTION CARDS ====================
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
  questionCardDark: {
    backgroundColor: "#1E293B",
    shadowColor: "#9B5DE5",
    shadowOpacity: 0.15,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  questionNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(155, 93, 229, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#9B5DE5",
  },
  questionNumberText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#9B5DE5",
    letterSpacing: 0.3,
  },
  questionMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
    letterSpacing: 0.5,
  },
  checkButton: {
    padding: 4,
  },
  questionText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1F2937",
    lineHeight: 26,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  topicTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(155, 93, 229, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(155, 93, 229, 0.2)",
  },
  topicText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9B5DE5",
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  answerToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(107, 114, 128, 0.2)",
    marginTop: 8,
  },
  answerToggleActive: {
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    borderColor: "#9B5DE5",
  },
  answerToggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  answerToggleTextActive: {
    color: "#7C3AED",
  },
  answerContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  answerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  answerLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#10B981",
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  answerText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 24,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  // ==================== COMPLETION CARD ====================
  completionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  completionCardDark: {
    backgroundColor: "#1E293B",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  completionTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  completionText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
    fontWeight: "500",
  },
  reviewButton: {
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reviewGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  reviewText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
    letterSpacing: 0.3,
  },

  // ==================== SESSION CARDS ====================
  sessionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(155, 93, 229, 0.08)",
  },
  sessionCardDark: {
    backgroundColor: "#1E293B",
    borderColor: "rgba(155, 93, 229, 0.15)",
    shadowColor: "#9B5DE5",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  sessionIcon: {
    marginRight: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sessionIconGradient: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sessionDate: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
    marginLeft: 4,
  },
  quizInfo: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "rgba(155, 93, 229, 0.05)",
    borderRadius: 14,
    marginBottom: 16,
  },
  quizStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quizStatText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  startButton: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  startGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  startText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  generateButton: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  generateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  generateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
    letterSpacing: 0.3,
  },

  // ==================== INFO & EMPTY STATES ====================
  infoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(155, 93, 229, 0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(155, 93, 229, 0.2)",
  },
  infoCardDark: {
    backgroundColor: "rgba(155, 93, 229, 0.15)",
    borderColor: "rgba(155, 93, 229, 0.3)",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#4B5563",
    marginLeft: 12,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginTop: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyContainerDark: {
    backgroundColor: "#1E293B",
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F2937",
    marginTop: 24,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 20,
    fontWeight: "500",
  },
  goButton: {
    borderRadius: 16,
    overflow: "hidden",
    width: "80%",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  goGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  goText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
    letterSpacing: 0.3,
  },

  // ==================== DARK MODE TEXT ====================
  textDark: {
    color: "#F3F4F6",
  },
  textSecondaryDark: {
    color: "#9CA3AF",
  },
});