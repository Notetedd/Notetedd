import React, { useEffect, useState, useRef } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert,
  TouchableOpacity,
  Animated,
  Share,
  Clipboard,
  RefreshControl,
  TextInput,
  Dimensions,
  Modal,
  FlatList,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import haptics from "./utils/haptics";
import { getFirestore, collection, query, where, orderBy, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useTheme } from "./context/ThemeContext";
import { logUserActivity } from "./utils/userActivity";


const { width, height } = Dimensions.get("window");

const GEMINI_API_KEY = "AIzaSyDQraKwy8C4zbRJ9ys2Xl9DUbzhvmv9Wco"; 
const GROQ_API_KEY = "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";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export default function EnhancedNotesScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  // Check if navigated with specific lecture
  const lectureIdFromRoute = route?.params?.lectureId;
  const lectureDataFromRoute = route?.params?.lectureData;

  // Core state
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawTranscription, setRawTranscription] = useState("");
  const [currentRecordingId, setCurrentRecordingId] = useState(null);
  const [error, setError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [dataSource, setDataSource] = useState("");
  const [aiProvider, setAiProvider] = useState("");

  // Lecture list state
  const [showLectureList, setShowLectureList] = useState(false);
  const [allLectures, setAllLectures] = useState([]);
  const [loadingLectures, setLoadingLectures] = useState(false);

  // Enhanced features state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");
  const [flashcards, setFlashcards] = useState([]);
  const [currentFlashcard, setCurrentFlashcard] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);
  const [editedNotes, setEditedNotes] = useState(null);
  const [showCalculations, setShowCalculations] = useState(true);
  const [showRelatedTopics, setShowRelatedTopics] = useState(true);

  // Diagram generation state
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [generatedDiagram, setGeneratedDiagram] = useState(null);
  const [showDiagramModal, setShowDiagramModal] = useState(false);

  // Firebase instances
  const auth = getAuth();
  const db = getFirestore();
  const readStartRef = useRef(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    console.log("📚 Enhanced NotesScreen mounted");
    console.log("🔍 Lecture ID from route:", lectureIdFromRoute);
    
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

    // If navigated with specific lecture, load that lecture
    if (lectureIdFromRoute) {
      loadSpecificLecture(lectureIdFromRoute, lectureDataFromRoute);
    } else {
      // Otherwise, show lecture list for selection
      loadAllUserLectures();
    }
  }, [lectureIdFromRoute, route?.params?.refresh]);

  useEffect(() => {
    if (notes) {
      generateFlashcards();
      setEditedNotes(notes);
    }
  }, [notes]);

  // Track how long user views/reads the notes. If >= 10 minutes, log a 'note_read' activity.
  useEffect(() => {
    if (notes) {
      readStartRef.current = Date.now();
      console.log('🕒 Note read timer started');
    }

    return () => {
      try {
        if (readStartRef.current) {
          const elapsed = Date.now() - readStartRef.current;
          const TEN_MINUTES = 10 * 60 * 1000;
          console.log('🕒 Note read timer stopped, elapsed ms:', elapsed);
          if (elapsed >= TEN_MINUTES) {
            const currentUser = auth.currentUser;
            if (currentUser) {
              logUserActivity(db, currentUser.uid, 'note_read', {
                recordingId: currentRecordingId,
                durationMs: elapsed,
              });
              console.log('✅ Logged note_read activity');
            }
          }
        }
      } catch (err) {
        console.warn('Failed to log note_read activity:', err);
      } finally {
        readStartRef.current = null;
      }
    };
  }, [notes]);

  // ==================== LOAD SPECIFIC LECTURE ====================
  const loadSpecificLecture = async (lectureId, lectureData = null) => {
    try {
      console.log("📖 Loading specific lecture:", lectureId);
      setLoading(true);
      setError("");

      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "Please sign in to view lecture notes");
        setLoading(false);
        return;
      }

      // If lecture data was passed, use it directly
      if (lectureData) {
        console.log("✅ Using lecture data from route");
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

      // Otherwise, fetch from Firestore
      console.log("☁️ Fetching lecture from Firestore...");
      const lectureRef = doc(db, "recordings", lectureId);
      const lectureDoc = await getDoc(lectureRef);

      if (!lectureDoc.exists()) {
        throw new Error("Lecture not found");
      }

      const data = lectureDoc.data();

      // Verify ownership
      if (data.userId !== currentUser.uid) {
        throw new Error("You don't have permission to view this lecture");
      }

      console.log("✅ Lecture loaded successfully");
      setCurrentRecordingId(lectureId);
      setRawTranscription(data.transcription || "");

      if (data.organizedNotes) {
        setNotes(data.organizedNotes);
        setAiProvider(data.organizedNotes.aiProvider || "cached");
      } else if (data.transcription) {
        await refineWithAI(data.transcription, lectureId);
      }

      setDataSource("firestore");
      setLoading(false);

    } catch (error) {
      console.error("❌ Error loading specific lecture:", error);
      setError(error.message);
      setLoading(false);
      Alert.alert("Error", error.message);
    }
  };

  // ==================== LOAD ALL USER LECTURES ====================
  const loadAllUserLectures = async () => {
    try {
      console.log("📚 Loading all user lectures...");
      setLoadingLectures(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setShowLectureList(true);
        setLoadingLectures(false);
        setLoading(false);
        return;
      }

      const recordingsRef = collection(db, "recordings");
      const q = query(
        recordingsRef,
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log("⚠️ No lectures found");
        setAllLectures([]);
        setShowLectureList(true);
        setLoadingLectures(false);
        setLoading(false);
        return;
      }

      const lectures = [];
      const colors = ["#9B5DE5", "#00B4D8", "#FF006E", "#FFD93D", "#10B981", "#EF4444", "#F59E0B"];

      querySnapshot.forEach((doc, index) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate() || new Date();
        
        lectures.push({
          id: doc.id,
          title: data.organizedNotes?.title || data.title || "Untitled Lecture",
          date: createdAt.toLocaleDateString(),
          timeAgo: getTimeAgo(createdAt),
          duration: data.duration ? Math.round(data.duration / 60) : 30,
          hasNotes: !!data.organizedNotes,
          color: colors[index % colors.length],
          preview: data.organizedNotes?.summary?.substring(0, 100) || data.transcription?.substring(0, 100) || "No preview available",
        });
      });

      console.log(`✅ Loaded ${lectures.length} lectures`);
      setAllLectures(lectures);
      setShowLectureList(true);
      setLoadingLectures(false);
      setLoading(false);

    } catch (error) {
      console.error("❌ Error loading lectures:", error);
      setLoadingLectures(false);
      setLoading(false);
    }
  };

  // ==================== HANDLE LECTURE SELECTION ====================
  const handleLectureSelection = async (lecture) => {
    setShowLectureList(false);
    await loadSpecificLecture(lecture.id);
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // ==================== FIREBASE & DATA FETCHING ====================
  const fetchFromAsyncStorage = async () => {
    try {
      const savedOrganizedNotes = await AsyncStorage.getItem('organizedNotes');
      if (savedOrganizedNotes) {
        const parsedNotes = JSON.parse(savedOrganizedNotes);
        setNotes(parsedNotes);
        setAiProvider(parsedNotes.aiProvider || "cached");
        
        const savedTranscription = await AsyncStorage.getItem('latestTranscription');
        if (savedTranscription) {
          setRawTranscription(savedTranscription);
        }
        return true;
      }
      return null;
    } catch (error) {
      console.error("❌ AsyncStorage fetch error:", error);
      return null;
    }
  };

  // ==================== AI REFINEMENT ====================
  const refineWithAI = async (transcription, recordingId = null) => {
    try {
      console.log("🤖 Processing with AI...");
      
      if (!transcription || transcription.trim().length < 10) {
        throw new Error("Transcription too short to organize");
      }

      let organizedNotes = null;
      let usedProvider = "";

      if (GROQ_API_KEY && GROQ_API_KEY.length > 10) {
        console.log("⚡ Trying Groq...");
        try {
          organizedNotes = await refineWithGroq(transcription);
          usedProvider = "Groq";
          console.log("✅ Groq success!");
        } catch (groqError) {
          console.error("❌ Groq failed:", groqError.message);
        }
      }

      if (!organizedNotes && GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
        console.log("🔄 Trying Google Gemini...");
        try {
          organizedNotes = await refineWithGemini(transcription);
          usedProvider = "Gemini";
          console.log("✅ Gemini success!");
        } catch (geminiError) {
          console.error("❌ Gemini failed:", geminiError.message);
        }
      }

      if (!organizedNotes) {
        console.log("⚠️ All AI providers failed, using fallback");
        organizedNotes = createFallbackNotes(transcription);
        usedProvider = "Fallback";
      }

      organizedNotes.aiProvider = usedProvider;
      setNotes(organizedNotes);
      setAiProvider(usedProvider);
      
      await saveOrganizedNotes(organizedNotes, recordingId);
      await haptics.notification("Success");

    } catch (error) {
      console.error("❌ AI refinement error:", error);
      setError(error.message);
      
      const fallbackNotes = createFallbackNotes(transcription);
      fallbackNotes.aiProvider = "Fallback";
      setNotes(fallbackNotes);
      setAiProvider("Fallback");
      await saveOrganizedNotes(fallbackNotes, recordingId);
    }
  };

  const refineWithGroq = async (transcription) => {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{
          role: "system",
          content: "You are an expert note-taking assistant. Transform lecture transcriptions into well-organized study notes with calculations, related topics, and comprehensive structure. Return ONLY valid JSON with no markdown formatting."
        }, {
          role: "user",
          content: `Transform this lecture transcription into structured JSON study notes.

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "title": "Specific descriptive lecture topic",
  "summary": "2-3 sentence overview",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "sections": [
    {"title": "Section name", "content": "Detailed explanation", "subtopics": ["subtopic1", "subtopic2"]}
  ],
  "definitions": {"term": "definition"},
  "questions": ["question 1", "question 2", "question 3"],
  "calculations": [
    {"problem": "problem statement", "solution": "answer", "steps": ["step 1", "step 2"]}
  ],
  "relatedTopics": ["topic 1", "topic 2", "topic 3"]
}

Transcription:
${transcription}`
        }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Groq API Error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.choices[0].message.content.trim();
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return JSON.parse(responseText);
  };

  const refineWithGemini = async (transcription) => {
    const prompt = `Transform this lecture transcription into well-organized study notes.

Return ONLY valid JSON with this structure:
{
  "title": "Specific descriptive lecture topic",
  "summary": "2-3 sentence overview",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "sections": [
    {"title": "Section name", "content": "Detailed explanation", "subtopics": ["subtopic1", "subtopic2"]}
  ],
  "definitions": {"term": "definition"},
  "questions": ["question 1", "question 2", "question 3"],
  "calculations": [
    {"problem": "problem statement", "solution": "answer", "steps": ["step 1", "step 2"]}
  ],
  "relatedTopics": ["topic 1", "topic 2", "topic 3"]
}

Transcription:
${transcription}`;

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
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.candidates[0].content.parts[0].text;
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return JSON.parse(responseText);
  };

  const createFallbackNotes = (transcription) => {
    const cleanedText = transcription
      .replace(/\b(um|uh|like|you know)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const sentences = cleanedText.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    return {
      title: "Lecture Notes - " + new Date().toLocaleDateString(),
      summary: sentences.slice(0, 3).join(". ").substring(0, 250) + "...",
      keyPoints: sentences.slice(0, 7).map(s => s.trim()).filter(s => s.length > 0),
      sections: [{
        title: "Main Content",
        content: cleanedText.substring(0, 1000),
        subtopics: []
      }],
      definitions: {},
      questions: [
        "What are the main topics covered in this lecture?",
        "What are the key takeaways?",
        "How does this relate to previous material?"
      ],
      calculations: [],
      relatedTopics: []
    };
  };

  const saveOrganizedNotes = async (organizedNotes, recordingId) => {
    try {
      await AsyncStorage.setItem('organizedNotes', JSON.stringify(organizedNotes));

      if (recordingId) {
        try {
          const recordingRef = doc(db, "recordings", recordingId);
          await updateDoc(recordingRef, {
            organizedNotes: organizedNotes,
            lastOrganized: new Date(),
          });
        } catch (firestoreError) {
          console.error("⚠️ Firestore save failed:", firestoreError);
        }
      }
    } catch (error) {
      console.error("❌ Save error:", error);
    }
  };

  // ==================== DIAGRAM GENERATION ====================
  const generateDiagram = async () => {
    try {
      console.log("📊 Generating diagram/flowchart...");
      setGeneratingDiagram(true);
      await haptics.impact("Medium");

      if (!notes) {
        Alert.alert("Error", "No notes available to generate diagram");
        setGeneratingDiagram(false);
        return;
      }

      // Prepare content for diagram generation
      const diagramPrompt = `Based on the following lecture notes, create a Mermaid diagram (flowchart or conceptual diagram).

Lecture Title: ${notes.title}
Key Points: ${notes.keyPoints?.join(', ')}
Sections: ${notes.sections?.map(s => s.title).join(', ')}

Create a Mermaid flowchart that visualizes the main concepts and their relationships.
Return ONLY the Mermaid code without any markdown code blocks or explanations.
Start with "graph TD" or "graph LR" and use proper Mermaid syntax.`;

      let diagramCode = null;

      // Try with Groq first
      if (GROQ_API_KEY && GROQ_API_KEY.length > 10) {
        try {
          const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{
                role: "user",
                content: diagramPrompt
              }],
              temperature: 0.5,
              max_tokens: 1024,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            diagramCode = data.choices[0].message.content.trim();
            diagramCode = diagramCode.replace(/```mermaid\s*/g, '').replace(/```\s*/g, '').trim();
            console.log("✅ Diagram generated with Groq");
          }
        } catch (error) {
          console.error("Groq diagram error:", error);
        }
      }

      // Fallback to Gemini
      if (!diagramCode && GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
        try {
          const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: diagramPrompt }]
              }],
              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 1024,
              }
            }),
          });

          if (response.ok) {
            const data = await response.json();
            diagramCode = data.candidates[0].content.parts[0].text.trim();
            diagramCode = diagramCode.replace(/```mermaid\s*/g, '').replace(/```\s*/g, '').trim();
            console.log("✅ Diagram generated with Gemini");
          }
        } catch (error) {
          console.error("Gemini diagram error:", error);
        }
      }

      // Fallback to simple diagram
      if (!diagramCode) {
        diagramCode = `graph TD
    A[${notes.title}] --> B[${notes.sections?.[0]?.title || 'Section 1'}]
    A --> C[${notes.sections?.[1]?.title || 'Section 2'}]
    A --> D[${notes.sections?.[2]?.title || 'Section 3'}]`;
      }

      setGeneratedDiagram(diagramCode);
      setShowDiagramModal(true);
      setGeneratingDiagram(false);

    } catch (error) {
      console.error("❌ Diagram generation error:", error);
      setGeneratingDiagram(false);
      Alert.alert("Error", "Failed to generate diagram. Please try again.");
    }
  };

  // ==================== ENHANCED FEATURES ====================
  const generateFlashcards = () => {
    if (!notes) return;
    
    const cards = [];
    
    if (notes.definitions) {
      Object.entries(notes.definitions).forEach(([term, definition]) => {
        cards.push({
          front: `What is ${term}?`,
          back: definition,
          type: "definition"
        });
      });
    }

    if (notes.keyPoints) {
      notes.keyPoints.forEach((point, idx) => {
        cards.push({
          front: `Key Point #${idx + 1}`,
          back: point,
          type: "keypoint"
        });
      });
    }

    if (notes.questions) {
      notes.questions.forEach((question, idx) => {
        cards.push({
          front: question,
          back: `Review section ${idx + 1} for the answer`,
          type: "question"
        });
      });
    }

    setFlashcards(cards);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (!query.trim() || !notes) {
      setSearchResults([]);
      return;
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    if (notes.title.toLowerCase().includes(lowerQuery)) {
      results.push({ type: "title", content: notes.title, match: "Title" });
    }

    if (notes.sections) {
      notes.sections.forEach((section, idx) => {
        if (section.title.toLowerCase().includes(lowerQuery)) {
          results.push({ type: "section", content: section.title, match: "Section", index: idx });
        }
        if (section.content.toLowerCase().includes(lowerQuery)) {
          results.push({ type: "section", content: section.title, match: "Content", index: idx });
        }
        if (section.subtopics) {
          section.subtopics.forEach(subtopic => {
            if (subtopic.toLowerCase().includes(lowerQuery)) {
              results.push({ type: "subtopic", content: subtopic, match: "Subtopic", sectionIndex: idx });
            }
          });
        }
      });
    }

    if (notes.definitions) {
      Object.entries(notes.definitions).forEach(([term, def]) => {
        if (term.toLowerCase().includes(lowerQuery) || def.toLowerCase().includes(lowerQuery)) {
          results.push({ type: "definition", content: term, match: "Definition" });
        }
      });
    }

    setSearchResults(results);
  };

  const toggleSection = async (index) => {
    await haptics.impact("Light");
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const nextFlashcard = () => {
    setShowFlashcardAnswer(false);
    setCurrentFlashcard((prev) => (prev + 1) % flashcards.length);
  };

  const previousFlashcard = () => {
    setShowFlashcardAnswer(false);
    setCurrentFlashcard((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const saveEditedNotes = async () => {
    await haptics.notification("Success");
    setNotes(editedNotes);
    setActiveTab("notes");
    await saveOrganizedNotes(editedNotes, currentRecordingId);
    Alert.alert("Success", "Notes saved successfully!");
  };

  const handleRegenerate = async () => {
    if (!rawTranscription) {
      Alert.alert("Error", "No transcription available to regenerate");
      return;
    }

    await haptics.impact("Medium");
    setIsRegenerating(true);
    await refineWithAI(rawTranscription, currentRecordingId);
    setIsRegenerating(false);
  };

  const handleRefresh = async () => {
    await haptics.impact("Light");
    setRefreshing(true);
    if (currentRecordingId) {
      await loadSpecificLecture(currentRecordingId);
    } else {
      await loadAllUserLectures();
    }
    setRefreshing(false);
  };

  const handleCopyNotes = async () => {
    await haptics.impact("Light");
    const notesText = formatNotesAsText(notes);
    Clipboard.setString(notesText);
    Alert.alert("Copied!", "Notes copied to clipboard");
  };

  const handleShareNotes = async () => {
    await haptics.impact("Light");
    try {
      const notesText = formatNotesAsText(notes);
      await Share.share({
        message: notesText,
        title: notes?.title || "My Lecture Notes",
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const formatNotesAsText = (notes) => {
    if (!notes) return "";
    
    let text = `📚 ${notes.title}\n${'='.repeat(notes.title.length + 3)}\n\n`;
    text += `📝 Summary:\n${notes.summary}\n\n`;
    
    if (notes.keyPoints) {
      text += `⭐ Key Points:\n`;
      notes.keyPoints.forEach((p, i) => text += `${i + 1}. ${p}\n`);
      text += '\n';
    }
    
    if (notes.sections) {
      notes.sections.forEach((section) => {
        text += `\n📂 ${section.title}\n${'-'.repeat(section.title.length + 3)}\n${section.content}\n`;
        if (section.subtopics && section.subtopics.length > 0) {
          text += `\nSubtopics:\n`;
          section.subtopics.forEach(st => text += `  • ${st}\n`);
        }
        text += '\n';
      });
    }
    
    if (notes.definitions && Object.keys(notes.definitions).length > 0) {
      text += `\n📖 Key Definitions:\n${'-'.repeat(18)}\n`;
      Object.entries(notes.definitions).forEach(([term, def]) => {
        text += `\n${term}:\n  ${def}\n`;
      });
      text += '\n';
    }
    
    if (notes.questions && notes.questions.length > 0) {
      text += `\n❓ Review Questions:\n${'-'.repeat(20)}\n`;
      notes.questions.forEach((q, i) => text += `${i + 1}. ${q}\n`);
    }
    
    text += `\n\n---\nGenerated by Notetedd • ${new Date().toLocaleDateString()}\n`;
    text += `AI: ${aiProvider} • Storage: ${dataSource === 'firestore' ? 'Cloud' : 'Local'}\n`;
    
    return text;
  };

  const detectCalculations = () => {
    if (!notes) return false;
    const mathKeywords = ["derivative", "integral", "limit", "equation", "formula", "calculate"];
    return notes.sections?.some(section => 
      mathKeywords.some(keyword => section.content.toLowerCase().includes(keyword))
    ) || false;
  };

  // ==================== RENDER LECTURE LIST ====================
  const renderLectureList = () => (
    <View style={styles.lectureListContainer}>
      <Text style={[styles.lectureListTitle, isDark && styles.textDark]}>
        Select a Lecture
      </Text>
      <Text style={[styles.lectureListSubtitle, isDark && styles.textSecondaryDark]}>
        Choose from your recorded lectures
      </Text>

      {loadingLectures ? (
        <View style={styles.lectureListLoading}>
          <MaterialIcons name="hourglass-empty" size={48} color="#9B5DE5" />
          <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
            Loading your lectures...
          </Text>
        </View>
      ) : allLectures.length === 0 ? (
        <View style={styles.noLecturesContainer}>
          <MaterialIcons name="library-books" size={64} color="#D1D5DB" />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            No Lectures Yet
          </Text>
          <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
            Record your first lecture to get started
          </Text>
          <TouchableOpacity 
            style={styles.recordButton}
            onPress={() => navigation.navigate("RecordScreen")}
          >
            <LinearGradient
              colors={["#10B981", "#059669"]}
              style={styles.recordButtonGradient}
            >
              <MaterialIcons name="mic" size={20} color="#fff" />
              <Text style={styles.recordButtonText}>Record Lecture</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={allLectures}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.lectureListItem, isDark && styles.lectureListItemDark]}
              onPress={() => handleLectureSelection(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.lectureListIcon, { backgroundColor: item.color + "20" }]}>
                <MaterialIcons name="description" size={28} color={item.color} />
              </View>
              <View style={styles.lectureListContent}>
                <Text style={[styles.lectureListItemTitle, isDark && styles.textDark]}>
                  {item.title}
                </Text>
                <Text style={[styles.lectureListItemPreview, isDark && styles.textSecondaryDark]}>
                  {item.preview}...
                </Text>
                <View style={styles.lectureListMeta}>
                  <View style={styles.lectureMetaItem}>
                    <MaterialIcons name="schedule" size={14} color="#6B7280" />
                    <Text style={styles.lectureMetaText}>{item.duration} mins</Text>
                  </View>
                  <View style={styles.lectureMetaItem}>
                    <MaterialIcons name="calendar-today" size={14} color="#6B7280" />
                    <Text style={styles.lectureMetaText}>{item.timeAgo}</Text>
                  </View>
                  {item.hasNotes && (
                    <View style={[styles.lectureMetaItem, styles.hasNotesTag]}>
                      <MaterialIcons name="check-circle" size={14} color="#10B981" />
                      <Text style={[styles.lectureMetaText, { color: "#10B981" }]}>Organized</Text>
                    </View>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.lectureListContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  // ==================== RENDER TABS ====================
  const renderNotesTab = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={[styles.actionButton, isDark && styles.actionButtonDark]}
          onPress={handleCopyNotes}
        >
          <MaterialIcons name="content-copy" size={20} color="#9B5DE5" />
          <Text style={[styles.actionButtonText, isDark && styles.textDark]}>Copy</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, isDark && styles.actionButtonDark]}
          onPress={handleShareNotes}
        >
          <MaterialIcons name="share" size={20} color="#10B981" />
          <Text style={[styles.actionButtonText, isDark && styles.textDark]}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, isDark && styles.actionButtonDark]}
          onPress={generateDiagram}
          disabled={generatingDiagram}
        >
          <MaterialIcons 
            name="account-tree" 
            size={20} 
            color={generatingDiagram ? "#9CA3AF" : "#00B4D8"} 
          />
          <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
            {generatingDiagram ? "..." : "Diagram"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, isDark && styles.actionButtonDark]}
          onPress={handleRegenerate}
          disabled={isRegenerating || !rawTranscription}
        >
          <MaterialIcons 
            name="refresh" 
            size={20} 
            color={isRegenerating || !rawTranscription ? "#9CA3AF" : "#EF4444"} 
          />
          <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
            {isRegenerating ? "..." : "Regen"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Title & Summary */}
      <View style={[styles.titleCard, isDark && styles.titleCardDark]}>
        <Text style={[styles.noteTitle, isDark && styles.textDark]}>{notes.title}</Text>
        <View style={styles.summaryContainer}>
          <MaterialIcons name="summarize" size={20} color="#9B5DE5" />
          <Text style={[styles.summary, isDark && styles.textSecondaryDark]}>{notes.summary}</Text>
        </View>
      </View>

      {/* Related Topics */}
      {showRelatedTopics && notes.relatedTopics && notes.relatedTopics.length > 0 && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="link" size={24} color="#10B981" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Related Topics</Text>
          </View>
          <View style={styles.relatedTopicsContainer}>
            {notes.relatedTopics.map((topic, idx) => (
              <TouchableOpacity key={idx} style={styles.relatedTopicChip}>
                <MaterialIcons name="arrow-forward" size={14} color="#10B981" />
                <Text style={styles.relatedTopicText}>{topic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Calculations Section */}
      {showCalculations && detectCalculations() && notes.calculations && notes.calculations.length > 0 && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="calculate" size={24} color="#F59E0B" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Calculations</Text>
          </View>
          {notes.calculations.map((calc, idx) => (
            <View key={idx} style={styles.calculationItem}>
              <Text style={[styles.calculationProblem, isDark && styles.textDark]}>
                {calc.problem}
              </Text>
              <View style={styles.calculationSolution}>
                <MaterialIcons name="arrow-forward" size={16} color="#10B981" />
                <Text style={[styles.calculationAnswer, isDark && styles.textDark]}>
                  {calc.solution}
                </Text>
              </View>
              <View style={styles.calculationSteps}>
                {calc.steps.map((step, stepIdx) => (
                  <Text key={stepIdx} style={[styles.calculationStep, isDark && styles.textSecondaryDark]}>
                    {stepIdx + 1}. {step}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Key Points */}
      {notes.keyPoints && notes.keyPoints.length > 0 && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="star" size={24} color="#F59E0B" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Key Points</Text>
          </View>
          {notes.keyPoints.map((point, index) => (
            <View key={index} style={styles.keyPointItem}>
              <View style={styles.keyPointBullet}>
                <Text style={styles.keyPointNumber}>{index + 1}</Text>
              </View>
              <Text style={[styles.keyPointText, isDark && styles.textDark]}>{point}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Sections */}
      {notes.sections && notes.sections.map((section, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.section, isDark && styles.sectionDark]}
          onPress={() => toggleSection(index)}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeader}>
            <MaterialIcons name="folder" size={24} color="#9B5DE5" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{section.title}</Text>
            <MaterialIcons 
              name={expandedSections[index] ? "expand-less" : "expand-more"} 
              size={24} 
              color={isDark ? "#9CA3AF" : "#6B7280"} 
            />
          </View>

          {expandedSections[index] && (
            <>
              <Text style={[styles.sectionContent, isDark && styles.textSecondaryDark]}>
                {section.content}
              </Text>
              {section.subtopics && section.subtopics.length > 0 && (
                <View style={styles.subtopicsContainer}>
                  {section.subtopics.map((subtopic, subIndex) => (
                    <View key={subIndex} style={styles.subtopicItem}>
                      <MaterialIcons name="chevron-right" size={16} color="#9B5DE5" />
                      <Text style={[styles.subtopicText, isDark && styles.textSecondaryDark]}>
                        {subtopic}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      ))}

      {/* Definitions */}
      {notes.definitions && Object.keys(notes.definitions).length > 0 && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="menu-book" size={24} color="#10B981" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Key Definitions</Text>
          </View>
          {Object.entries(notes.definitions).map(([term, definition], index) => (
            <View key={index} style={styles.definitionItem}>
              <Text style={[styles.definitionTerm, isDark && styles.textDark]}>{term}</Text>
              <Text style={[styles.definitionText, isDark && styles.textSecondaryDark]}>
                {definition}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Review Questions */}
      {notes.questions && notes.questions.length > 0 && (
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="quiz" size={24} color="#EF4444" />
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Review Questions</Text>
          </View>
          {notes.questions.map((question, index) => (
            <View key={index} style={styles.questionItem}>
              <View style={styles.questionNumber}>
                <Text style={styles.questionNumberText}>Q{index + 1}</Text>
              </View>
              <Text style={[styles.questionText, isDark && styles.textDark]}>{question}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );

  const renderFlashcardsTab = () => {
    if (flashcards.length === 0) {
      return (
        <View style={styles.emptyFlashcards}>
          <MaterialIcons name="style" size={64} color="#D1D5DB" />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            No Flashcards Available
          </Text>
          <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
            Flashcards will be generated from your notes
          </Text>
        </View>
      );
    }

    const card = flashcards[currentFlashcard];

    return (
      <View style={styles.flashcardContainer}>
        <Text style={styles.flashcardCounter}>
          Card {currentFlashcard + 1} of {flashcards.length}
        </Text>

        <TouchableOpacity
          style={styles.flashcard}
          onPress={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={showFlashcardAnswer ? ["#10B981", "#059669"] : ["#9B5DE5", "#7C3AED"]}
            style={styles.flashcardGradient}
          >
            <Text style={styles.flashcardLabel}>
              {showFlashcardAnswer ? "Answer" : "Question"}
            </Text>
            <Text style={styles.flashcardText}>
              {showFlashcardAnswer ? card.back : card.front}
            </Text>
            <Text style={styles.flashcardHint}>
              {showFlashcardAnswer ? "Tap to see question" : "Tap to reveal answer"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.flashcardControls}>
          <TouchableOpacity style={styles.flashcardButton} onPress={previousFlashcard}>
            <MaterialIcons name="arrow-back" size={24} color="#9B5DE5" />
            <Text style={styles.flashcardButtonText}>Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.shuffleButton}
            onPress={() => {
              const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
              setFlashcards(shuffled);
              setCurrentFlashcard(0);
              setShowFlashcardAnswer(false);
            }}
          >
            <MaterialIcons name="shuffle" size={24} color="#F59E0B" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.flashcardButton} onPress={nextFlashcard}>
            <Text style={styles.flashcardButtonText}>Next</Text>
            <MaterialIcons name="arrow-forward" size={24} color="#9B5DE5" />
          </TouchableOpacity>
        </View>

        <View style={styles.flashcardStats}>
          <View style={styles.flashcardStat}>
            <MaterialIcons name="style" size={20} color="#9B5DE5" />
            <Text style={styles.flashcardStatText}>{flashcards.length} cards</Text>
          </View>
          <View style={styles.flashcardStat}>
            <MaterialIcons name="trending-up" size={20} color="#10B981" />
            <Text style={styles.flashcardStatText}>Study mode</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderMindMapTab = () => (
    <View style={styles.mindmapContainer}>
      <Text style={styles.mindmapTitle}>Mind Map View</Text>
      
      <View style={styles.centralNode}>
        <Text style={styles.centralNodeText}>{notes.title}</Text>
      </View>

      <View style={styles.branchesContainer}>
        {notes.sections && notes.sections.map((section, idx) => (
          <View key={idx} style={styles.branchNode}>
            <View style={[styles.nodeCircle, { backgroundColor: ['#9B5DE5', '#10B981', '#F59E0B', '#EF4444'][idx % 4] }]}>
              <MaterialIcons name="circle" size={12} color="#FFF" />
            </View>
            <View style={styles.nodeContent}>
              <Text style={styles.nodeTitle}>{section.title}</Text>
              {section.subtopics && section.subtopics.map((sub, subIdx) => (
                <Text key={subIdx} style={styles.nodeSubtopic}>• {sub}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.mindmapLegend}>
        <MaterialIcons name="info-outline" size={16} color="#6B7280" />
        <Text style={styles.mindmapLegendText}>
          Visual representation of lecture structure and connections
        </Text>
      </View>
    </View>
  );

  const renderEditTab = () => (
    <View style={styles.editContainer}>
      <Text style={styles.editTitle}>Edit Notes</Text>
      
      <Text style={styles.editLabel}>Title</Text>
      <TextInput
        style={[styles.editInput, isDark && styles.editInputDark]}
        value={editedNotes?.title || ""}
        onChangeText={(text) => setEditedNotes({...editedNotes, title: text})}
        placeholder="Lecture title"
        placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
      />

      <Text style={styles.editLabel}>Summary</Text>
      <TextInput
        style={[styles.editInput, styles.editTextArea, isDark && styles.editInputDark]}
        value={editedNotes?.summary || ""}
        onChangeText={(text) => setEditedNotes({...editedNotes, summary: text})}
        placeholder="Brief summary"
        placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.editLabel}>Key Points (one per line)</Text>
      <TextInput
        style={[styles.editInput, styles.editTextArea, isDark && styles.editInputDark]}
        value={editedNotes?.keyPoints?.join('\n') || ""}
        onChangeText={(text) => setEditedNotes({...editedNotes, keyPoints: text.split('\n').filter(p => p.trim())})}
        placeholder="Enter key points"
        placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
        multiline
        numberOfLines={5}
      />

      <View style={styles.editButtons}>
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={() => {
            setEditedNotes(notes);
            setActiveTab("notes");
          }}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.saveButton}
          onPress={saveEditedNotes}
        >
          <LinearGradient
            colors={["#10B981", "#059669"]}
            style={styles.saveButtonGradient}
          >
            <MaterialIcons name="save" size={20} color="#FFF" />
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ==================== MAIN RENDER ====================
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
        style={styles.header}
      >
        {/* Back button to lecture list */}
        {notes && !showLectureList && (
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => {
              setNotes(null);
              setCurrentRecordingId(null);
              setShowLectureList(true);
              loadAllUserLectures();
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        <MaterialIcons name="auto-stories" size={32} color="rgba(255,255,255,0.3)" />
        <Text style={styles.headerTitle}>
          {showLectureList ? "My Lectures" : "My Notes"}
        </Text>
        
        {/* Search Bar - only show when viewing notes */}
        {notes && !showLectureList && (
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search in this lecture..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={handleSearch}
              onFocus={() => setShowSearch(true)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); setShowSearch(false); }}>
                <MaterialIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {(dataSource || aiProvider) && notes && !showLectureList && (
          <View style={styles.badgesContainer}>
            {dataSource && (
              <View style={styles.sourceBadge}>
                <MaterialIcons 
                  name={dataSource === 'firestore' ? 'cloud' : 'storage'} 
                  size={12} 
                  color="rgba(255,255,255,0.9)" 
                />
                <Text style={styles.sourceBadgeText}>
                  {dataSource === 'firestore' ? 'Cloud' : 'Local'}
                </Text>
              </View>
            )}
            {aiProvider && (
              <View style={[styles.sourceBadge, { backgroundColor: 'rgba(16, 185, 129, 0.3)' }]}>
                <MaterialIcons name="auto-awesome" size={12} color="rgba(255,255,255,0.9)" />
                <Text style={styles.sourceBadgeText}>{aiProvider}</Text>
              </View>
            )}
          </View>
        )}
      </LinearGradient>

      {/* Search Results Modal */}
      {showSearch && searchResults.length > 0 && !showLectureList && (
        <View style={styles.searchResultsContainer}>
          <ScrollView style={styles.searchResults}>
            <Text style={styles.searchResultsTitle}>
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </Text>
            {searchResults.map((result, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.searchResultItem}
                onPress={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  setActiveTab("notes");
                  if (result.type === "section" && result.index !== undefined) {
                    toggleSection(result.index);
                  }
                }}
              >
                <MaterialIcons 
                  name={result.type === "definition" ? "menu-book" : result.type === "section" ? "folder" : "label"} 
                  size={20} 
                  color="#9B5DE5" 
                />
                <View style={styles.searchResultContent}>
                  <Text style={styles.searchResultText}>{result.content}</Text>
                  <Text style={styles.searchResultMatch}>{result.match}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tab Navigation - only show when viewing notes */}
      {notes && !showLectureList && (
        <View style={styles.tabContainer}>
          {[
            { key: "notes", icon: "article", label: "Notes" },
            { key: "flashcards", icon: "style", label: "Flashcards" },
            { key: "mindmap", icon: "account-tree", label: "Mind Map" },
            { key: "edit", icon: "edit", label: "Edit" }
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialIcons 
                name={tab.icon} 
                size={20} 
                color={activeTab === tab.key ? "#9B5DE5" : "#9CA3AF"} 
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#9B5DE5"]}
            tintColor="#9B5DE5"
          />
        }
      >
        {loading ? (
          <Animated.View 
            style={[
              styles.loadingContainer,
              isDark && styles.loadingContainerDark,
              { opacity: fadeAnim }
            ]}
          >
            <Animated.View style={{ transform: [{ scale: fadeAnim }] }}>
              <MaterialIcons name="auto-awesome" size={48} color="#9B5DE5" />
            </Animated.View>
            <Text style={[styles.loadingTitle, isDark && styles.textDark]}>
              AI Processing Your Lecture
            </Text>
            <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
              Organizing content, extracting key points, creating structure...
            </Text>
          </Animated.View>
        ) : showLectureList ? (
          renderLectureList()
        ) : notes ? (
          <>
            {activeTab === "notes" && renderNotesTab()}
            {activeTab === "flashcards" && renderFlashcardsTab()}
            {activeTab === "mindmap" && renderMindMapTab()}
            {activeTab === "edit" && renderEditTab()}
          </>
        ) : null}
      </ScrollView>

      {/* Diagram Modal */}
      <Modal
        visible={showDiagramModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDiagramModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.diagramModal, isDark && styles.diagramModalDark]}>
            <View style={styles.diagramModalHeader}>
              <Text style={[styles.diagramModalTitle, isDark && styles.textDark]}>
                Generated Diagram
              </Text>
              <TouchableOpacity onPress={() => setShowDiagramModal(false)}>
                <MaterialIcons name="close" size={24} color={isDark ? "#F9FAFB" : "#1F2937"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.diagramContent}>
              <Text style={[styles.diagramCodeLabel, isDark && styles.textSecondaryDark]}>
                Mermaid Diagram Code:
              </Text>
              <View style={[styles.diagramCodeContainer, isDark && styles.diagramCodeContainerDark]}>
                <Text style={[styles.diagramCode, isDark && styles.textDark]}>
                  {generatedDiagram}
                </Text>
              </View>
              
              <Text style={[styles.diagramHint, isDark && styles.textSecondaryDark]}>
                💡 Copy this code and paste it into mermaid.live or any Mermaid-compatible viewer to see the visual diagram.
              </Text>
            </ScrollView>

            <View style={styles.diagramModalActions}>
              <TouchableOpacity 
                style={styles.diagramCopyButton}
                onPress={() => {
                  Clipboard.setString(generatedDiagram);
                  Alert.alert("Copied!", "Diagram code copied to clipboard");
                }}
              >
                <LinearGradient
                  colors={["#9B5DE5", "#7C3AED"]}
                  style={styles.diagramCopyGradient}
                >
                  <MaterialIcons name="content-copy" size={20} color="#FFF" />
                  <Text style={styles.diagramCopyText}>Copy Code</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  containerDark: {
    backgroundColor: "#0F172A",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 8,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
    gap: 8,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 14,
  },
  badgesContainer: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  sourceBadgeText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  
  // Lecture List Styles
  lectureListContainer: {
    flex: 1,
    paddingTop: 20,
  },
  lectureListTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  lectureListSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  lectureListLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  noLecturesContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  lectureListContent: {
    paddingHorizontal: 24,
  },
  lectureListItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  lectureListItemDark: {
    backgroundColor: "#1F2937",
  },
  lectureListIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  lectureListContent: {
    flex: 1,
  },
  lectureListItemTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },
  lectureListItemPreview: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 8,
  },
  lectureListMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  lectureMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lectureMetaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  hasNotesTag: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  
  searchResultsContainer: {
    position: "absolute",
    top: 180,
    left: 24,
    right: 24,
    backgroundColor: "#FFF",
    borderRadius: 16,
    maxHeight: 300,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 1000,
  },
  searchResults: {
    padding: 16,
  },
  searchResultsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  searchResultMatch: {
    fontSize: 12,
    color: "#9B5DE5",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: "#F3E8FF",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  activeTabText: {
    color: "#9B5DE5",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  loadingContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 48,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  loadingContainerDark: {
    backgroundColor: "#1F2937",
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  recordButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 16,
  },
  recordButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 8,
  },
  recordButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  actionsContainer: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  actionButtonDark: {
    backgroundColor: "#1F2937",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 4,
  },
  titleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  titleCardDark: {
    backgroundColor: "#1F2937",
  },
  noteTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 16,
  },
  summaryContainer: {
    flexDirection: "row",
    gap: 12,
  },
  summary: {
    flex: 1,
    fontSize: 15,
    color: "#4B5563",
    lineHeight: 22,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionDark: {
    backgroundColor: "#1F2937",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  sectionContent: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 22,
    marginBottom: 12,
  },
  keyPointItem: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 12,
  },
  keyPointBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3E8FF",
    justifyContent: "center",
    alignItems: "center",
  },
  keyPointNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9B5DE5",
  },
  keyPointText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 22,
  },
  subtopicsContainer: {
    marginTop: 12,
  },
  subtopicItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  subtopicText: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
  },
  definitionItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  definitionTerm: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  definitionText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  questionItem: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 12,
  },
  questionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  questionNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 22,
  },
  relatedTopicsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  relatedTopicChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  relatedTopicText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  calculationItem: {
    backgroundColor: "#FFF7ED",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  calculationProblem: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  calculationSolution: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  calculationAnswer: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10B981",
  },
  calculationSteps: {
    marginTop: 8,
  },
  calculationStep: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  emptyFlashcards: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 48,
    alignItems: "center",
  },
  flashcardContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  flashcardCounter: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 20,
  },
  flashcard: {
    width: width - 48,
    height: 400,
    borderRadius: 24,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 24,
  },
  flashcardGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  flashcardLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 20,
  },
  flashcardText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 32,
    marginBottom: 24,
  },
  flashcardHint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontStyle: "italic",
  },
  flashcardControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: width - 48,
    marginBottom: 24,
  },
  flashcardButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  flashcardButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9B5DE5",
  },
  shuffleButton: {
    backgroundColor: "#FFF7ED",
    padding: 12,
    borderRadius: 12,
  },
  flashcardStats: {
    flexDirection: "row",
    gap: 24,
  },
  flashcardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  flashcardStatText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  mindmapContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  mindmapTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 32,
  },
  centralNode: {
    backgroundColor: "#9B5DE5",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 20,
    marginBottom: 40,
    elevation: 4,
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  centralNodeText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  branchesContainer: {
    width: "100%",
    gap: 20,
  },
  branchNode: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    gap: 12,
  },
  nodeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  nodeContent: {
    flex: 1,
  },
  nodeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  nodeSubtopic: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  mindmapLegend: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  mindmapLegendText: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },
  editContainer: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
  },
  editTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 24,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 8,
    marginTop: 16,
  },
  editInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#1F2937",
  },
  editInputDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
    color: "#F9FAFB",
  },
  editTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  editButtons: {
    flexDirection: "row",
    marginTop: 32,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  
  // Diagram Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  diagramModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    width: "100%",
    maxHeight: "80%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  diagramModalDark: {
    backgroundColor: "#1F2937",
  },
  diagramModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  diagramModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  diagramContent: {
    padding: 24,
  },
  diagramCodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  diagramCodeContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  diagramCodeContainerDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  diagramCode: {
    fontSize: 13,
    color: "#1F2937",
    fontFamily: "monospace",
    lineHeight: 20,
  },
  diagramHint: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
    lineHeight: 20,
  },
  diagramModalActions: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  diagramCopyButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  diagramCopyGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  diagramCopyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  
  textDark: {
    color: "#F9FAFB",
  },
  textSecondaryDark: {
    color: "#D1D5DB",
  },
});