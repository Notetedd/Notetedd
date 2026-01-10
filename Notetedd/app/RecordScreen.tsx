import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Animated,
  Dimensions,
  Share,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import haptics from "./utils/haptics";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useTheme } from "./context/ThemeContext";

const { width } = Dimensions.get("window");

//  AssemblyAI API key
const ASSEMBLYAI_API_KEY = "83b66f41846a49c19d62893c24e0ce34";

const RECORDING_OPTIONS = {
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
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸", speechCode: "en-US" },
  { code: "es", name: "Spanish", flag: "🇪🇸", speechCode: "es-ES" },
  { code: "fr", name: "French", flag: "🇫🇷", speechCode: "fr-FR" },
  { code: "de", name: "German", flag: "🇩🇪", speechCode: "de-DE" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪", speechCode: "sw-KE" },
  { code: "ar", name: "Arabic", flag: "🇸🇦", speechCode: "ar-SA" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", speechCode: "zh-CN" },
  { code: "hi", name: "Hindi", flag: "🇮🇳", speechCode: "hi-IN" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", speechCode: "pt-BR" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", speechCode: "ja-JP" },
];

export default function RecordScreen({ route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const navigation = useNavigation();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingUri, setRecordingUri] = useState(null);
  const [useWebSpeech, setUseWebSpeech] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [detectedLanguages, setDetectedLanguages] = useState([]);
  const [previousRecordings, setPreviousRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);
  const [showAllRecordings, setShowAllRecordings] = useState(false);
  const [continuingRecordingId, setContinuingRecordingId] = useState(null);
  
  const recordingRef = useRef(null);
  const webSpeechRef = useRef(null);
  const timerRef = useRef(null);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Firebase instances
  const auth = getAuth();
  const storage = getStorage();
  const db = getFirestore();

  useEffect(() => {
    console.log("🎙️ RecordScreen mounted");
    
    // Entrance animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Load previous recordings
    loadPreviousRecordings();

    return () => {
      if (recordingRef.current) {
        stopRecording().catch(console.error);
      }
      if (webSpeechRef.current) {
        webSpeechRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      pulseAnim.setValue(1);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ==================== LANGUAGE DETECTION ====================
  const detectLanguageFromText = (text) => {
    const patterns = {
      'sw': /\b(sasa|habari|asante|tafadhali|ndiyo|hapana|kwaheri|karibu|pole|shikamoo)\b/i,
      'es': /\b(gracias|por favor|sí|no|hola|adiós|buenos días|buenas tardes|cómo estás)\b/i,
      'fr': /\b(merci|s'il vous plaît|oui|non|bonjour|au revoir|comment allez-vous)\b/i,
      'de': /\b(danke|bitte|ja|nein|hallo|auf wiedersehen|guten tag|wie geht es)\b/i,
      'ar': /[\u0600-\u06FF]/,
      'zh': /[\u4e00-\u9fa5]/,
      'hi': /[\u0900-\u097F]/,
      'ja': /[\u3040-\u309F\u30A0-\u30FF]/,
      'pt': /\b(obrigado|por favor|sim|não|olá|tchau|bom dia)\b/i,
    };

    const detected = new Set(['en']); // Default to English
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        detected.add(lang);
      }
    }

    return Array.from(detected);
  };

  // ==================== LOAD PREVIOUS RECORDINGS ====================
  const loadPreviousRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.log("⚠️ No user logged in");
        setLoadingRecordings(false);
        return;
      }

      console.log("📚 Loading recordings for user:", currentUser.uid);
      
      const recordingsRef = collection(db, "recordings");
      const q = query(
        recordingsRef,
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const recordings = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        recordings.push({
          id: doc.id,
          ...data,
          formattedDate: formatRelativeDate(data.createdAt?.toDate()),
        });
      });
      
      console.log("✅ Loaded", recordings.length, "recordings");
      setPreviousRecordings(recordings);
    } catch (error) {
      console.error("❌ Error loading recordings:", error);
    } finally {
      setLoadingRecordings(false);
    }
  };

  const formatRelativeDate = (date) => {
    if (!date) return "Unknown date";
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  };

  const requestPermissions = async () => {
    try {
      console.log("🎤 Requesting permissions...");
      if (Platform.OS !== "web") {
        const { status } = await Audio.requestPermissionsAsync();
        console.log("🎤 Permission status:", status);
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Microphone access is required to record lectures."
          );
          return false;
        }
      }
      console.log("✅ Permissions granted");
      return true;
    } catch (error) {
      console.error("❌ Permission error:", error);
      return false;
    }
  };

  // ==================== FIRESTORE SAVE ====================
  const saveRecordingToFirestore = async (audioUri, transcriptionText, duration, detectedLangs) => {
    try {
      console.log("💾 Saving to Firestore...");
      setIsSaving(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated. Please sign in first.");
      }

      // Upload audio file
      let audioUrl = null;
      if (audioUri) {
        try {
          const fileName = `recordings/${currentUser.uid}/${Date.now()}.m4a`;
          const storageRef = ref(storage, fileName);
          
          let blob;
          if (Platform.OS === "web") {
            const response = await fetch(audioUri);
            blob = await response.blob();
          } else {
            const base64 = await FileSystem.readAsStringAsync(audioUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: 'audio/m4a' });
          }

          await uploadBytes(storageRef, blob);
          audioUrl = await getDownloadURL(storageRef);
          console.log("✅ Audio uploaded:", audioUrl);
        } catch (uploadError) {
          console.error("⚠️ Audio upload failed:", uploadError);
        }
      }

      // Save to Firestore
      const recordingData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || "unknown",
        audioUrl: audioUrl || null,
        transcription: transcriptionText || "",
        duration: duration || 0,
        formattedDuration: formatDuration(duration || 0),
        transcriptionMethod: useWebSpeech ? "Web Speech API" : "AssemblyAI",
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        detectedLanguages: detectedLangs || [sourceLanguage],
        createdAt: serverTimestamp(),
        platform: Platform.OS,
        title: `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        organizedNotes: null,
        continuedFrom: continuingRecordingId || null,
      };

      let docRef;
      if (continuingRecordingId) {
        // Update existing recording
        const recordingDocRef = doc(db, "recordings", continuingRecordingId);
        await updateDoc(recordingDocRef, {
          transcription: transcriptionText,
          duration: duration,
          formattedDuration: formatDuration(duration),
          detectedLanguages: detectedLangs,
          updatedAt: serverTimestamp(),
        });
        console.log("✅ Recording updated:", continuingRecordingId);
        docRef = { id: continuingRecordingId };
      } else {
        // Create new recording
        docRef = await addDoc(collection(db, "recordings"), recordingData);
        console.log("✅ Recording saved with ID:", docRef.id);
      }

      await AsyncStorage.setItem('latestTranscription', transcriptionText || "");
      
      await haptics.notification('Success');
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
            onPress: () => {
              setContinuingRecordingId(null);
              loadPreviousRecordings();
            }
          }
        ]
      );

      return docRef.id;
    } catch (error) {
      console.error("❌ Firestore save error:", error);
      Alert.alert(
        "Save Error",
        `Failed to save recording: ${error.message}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== WEB SPEECH API ====================
  const startWebSpeechRecognition = () => {
    console.log("🌐 Starting Web Speech recognition...");
    
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window)) {
      console.error("❌ Web Speech not supported");
      Alert.alert('Not Supported', 'Please use Chrome, Edge, or Safari');
      return false;
    }

    const SpeechRecognition = window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === sourceLanguage);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langConfig?.speechCode || 'en-US';
    recognition.maxAlternatives = 1;

    let finalTranscript = continuingRecordingId && transcription ? transcription + ' ' : '';
    const detectedLangs = new Set([sourceLanguage]);

    recognition.onstart = () => {
      console.log('✅ Web Speech started');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          
          // Detect languages
          const langs = detectLanguageFromText(transcript);
          langs.forEach(lang => detectedLangs.add(lang));
          
          console.log('📝 Final:', transcript);
        } else {
          interimTranscript += transcript;
        }
      }

      const fullTranscript = finalTranscript + interimTranscript;
      setTranscription(fullTranscript);
      setDetectedLanguages(Array.from(detectedLangs));
    };

    recognition.onerror = (event) => {
      console.error('❌ Web Speech error:', event.error);
      
      if (event.error === 'no-speech') {
        console.log('⚠️ No speech detected, continuing...');
      } else if (event.error === 'not-allowed') {
        Alert.alert('Permission Denied', 'Please allow microphone access');
        stopRecording();
      }
    };

    recognition.onend = () => {
      console.log('🏁 Web Speech ended');
      if (isRecording) {
        recognition.start();
      }
    };

    recognition.start();
    webSpeechRef.current = recognition;
    return true;
  };

  const stopWebSpeechRecognition = () => {
    if (webSpeechRef.current) {
      console.log("⏹️ Stopping Web Speech...");
      webSpeechRef.current.stop();
      webSpeechRef.current = null;
    }
  };

 // ==================== ASSEMBLYAI TRANSCRIPTION ====================
const transcribeWithAssemblyAI = async (uri) => {
  try {
    console.log("🎯 Starting AssemblyAI transcription...");

    if (!ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY.length < 10) {
      throw new Error("AssemblyAI API key not configured.");
    }

    // Read the file as base64
    console.log("📱 Reading file from:", uri);
    const base64Audio = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    console.log("✅ File read successfully");

    // Upload using XMLHttpRequest for better binary handling
    const uploadUrl = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log("✅ File uploaded");
            resolve(response.upload_url);
          } catch (e) {
            reject(new Error('Failed to parse upload response'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} - ${xhr.responseText}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during upload'));
      
      xhr.open('POST', 'https://api.assemblyai.com/v2/upload');
      xhr.setRequestHeader('authorization', ASSEMBLYAI_API_KEY);
      
      // Convert base64 to binary string
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log("⬆️ Uploading", bytes.length, "bytes to AssemblyAI...");
      xhr.send(bytes.buffer);
    });

    console.log("✅ Upload URL received:", uploadUrl);

    // Request transcription with language detection
    console.log("🎬 Requesting transcription...");
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        punctuate: true,
        format_text: true,
        language_detection: true,
      }),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      throw new Error(`Transcription request failed: ${transcriptResponse.status} - ${errorText}`);
    }

    const transcriptData = await transcriptResponse.json();
    console.log("🆔 Transcript ID:", transcriptData.id);

    // Poll for result
    let transcript = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
        headers: { 'authorization': ASSEMBLYAI_API_KEY },
      });

      if (!pollResponse.ok) {
        throw new Error(`Poll request failed: ${pollResponse.status}`);
      }

      transcript = await pollResponse.json();
      console.log("📊 Status:", transcript.status);

      if (transcript.status === 'completed') {
        console.log("✅ Transcription completed!");
        console.log("🌍 Detected language:", transcript.language_code);
        
        // Detect languages in the text
        const detectedLangs = detectLanguageFromText(transcript.text);
        setDetectedLanguages(detectedLangs);
        
        return {
          text: transcript.text,
          detectedLanguage: transcript.language_code || sourceLanguage,
          detectedLanguages: detectedLangs,
        };
      } else if (transcript.status === 'error') {
        throw new Error(`Transcription error: ${transcript.error}`);
      }

      attempts++;
    }

    throw new Error("Transcription timeout");
  } catch (error) {
    console.error("❌ AssemblyAI error:", error);
    throw error;
  }
};

  // ==================== RECORDING CONTROLS ====================
  const startRecording = async () => {
    try {
      console.log("▶️ Starting recording...");
      await haptics.impact('Medium');
      
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      if (useWebSpeech && Platform.OS === "web") {
        const webSpeechStarted = startWebSpeechRecognition();
        if (!webSpeechStarted) {
          Alert.alert(
            "Web Speech Unavailable",
            "Falling back to post-recording transcription"
          );
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        ...RECORDING_OPTIONS[Platform.OS],
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      if (!useWebSpeech && !continuingRecordingId) {
        setTranscription("");
      }
      setRecordingUri(null);
      console.log("✅ Recording started");
    } catch (error) {
      console.error("❌ Start recording failed:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  };

  const pauseRecording = async () => {
    try {
      await haptics.impact('Light');
      if (recordingRef.current) {
        await recordingRef.current.pauseAsync();
        setIsPaused(true);
      }
      if (webSpeechRef.current) {
        webSpeechRef.current.stop();
      }
    } catch (error) {
      console.error("❌ Pause failed:", error);
    }
  };

  const resumeRecording = async () => {
    try {
      await haptics.impact('Light');
      if (recordingRef.current) {
        await recordingRef.current.startAsync();
        setIsPaused(false);
      }
      if (useWebSpeech && Platform.OS === "web") {
        startWebSpeechRecognition();
      }
    } catch (error) {
      console.error("❌ Resume failed:", error);
    }
  };

  const stopRecording = async () => {
    try {
      console.log("⏹️ Stopping...");
      await haptics.notification('Success');
      setIsRecording(false);
      setIsPaused(false);

      stopWebSpeechRecognition();

      if (!recordingRef.current) {
        console.log("⚠️ No active recording");
        return;
      }

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      console.log("📁 Recording URI:", uri);
      
      if (!uri) throw new Error("No recording URI found");

      setRecordingUri(uri);
      const finalDuration = recordingDuration;

      if (useWebSpeech && transcription) {
        console.log("✅ Using Web Speech transcription");
        await saveRecordingToFirestore(uri, transcription, finalDuration, detectedLanguages);
        return;
      }

      console.log("✅ Recording stopped, starting transcription...");
      await transcribeAudio(uri, finalDuration);
    } catch (error) {
      console.error("❌ Stop recording failed:", error);
      Alert.alert("Error", "Failed to stop recording. Please try again.");
    }
  };

  const transcribeAudio = async (uri, duration) => {
    try {
      setIsTranscribing(true);
      console.log("🎯 Starting transcription...");

      let result = { text: "", detectedLanguages: [sourceLanguage] };

      if (ASSEMBLYAI_API_KEY && ASSEMBLYAI_API_KEY.length > 10) {
        try {
          result = await transcribeWithAssemblyAI(uri);
        } catch (error) {
          console.error("❌ AssemblyAI failed:", error);
          throw error;
        }
      } else {
        throw new Error("No API key configured");
      }

      const finalText = continuingRecordingId ? transcription + ' ' + result.text : result.text;
      setTranscription(finalText || "No speech detected");
      
      if (result.text) {
        await saveRecordingToFirestore(uri, finalText, duration, result.detectedLanguages);
      }
    } catch (error) {
      console.error("❌ Transcription error:", error);
      Alert.alert(
        "Transcription Error",
        `${error.message}\n\nTip: Enable "Real-time Mode" for instant transcription!`
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const cancelRecording = async () => {
    try {
      await haptics.impact('Heavy');
      
      Alert.alert(
        "Cancel Recording",
        "Are you sure you want to discard this recording?",
        [
          { text: "Keep Recording", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              setIsRecording(false);
              setIsPaused(false);
              setRecordingDuration(0);
              if (!continuingRecordingId) {
                setTranscription("");
              }
              setRecordingUri(null);
              setContinuingRecordingId(null);
              
              stopWebSpeechRecognition();
              
              if (recordingRef.current) {
                await recordingRef.current.stopAndUnloadAsync();
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ Cancel failed:", error);
    }
  };

  // ==================== CONTINUE RECORDING ====================
  const continueRecording = async (recording) => {
    try {
      await haptics.impact('Medium');
      
      Alert.alert(
        "Continue Recording",
        `Continue recording: ${recording.title}?\n\nYour new recording will be added to the existing transcription.`,
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
              
              // Scroll to top to show recording UI
              Alert.alert(
                "Ready to Continue",
                "Press 'Start Recording' to add to this lecture.",
                [{ text: "OK" }]
              );
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ Continue recording failed:", error);
    }
  };

  // ==================== DELETE RECORDING ====================
  const deleteRecording = async (recordingId) => {
    try {
      Alert.alert(
        "Delete Recording",
        "Are you sure you want to delete this recording? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setPreviousRecordings(prev => prev.filter(r => r.id !== recordingId));
                await haptics.notification('Success');
                Alert.alert("Deleted", "Recording deleted successfully");
              } catch (error) {
                console.error("❌ Delete failed:", error);
                Alert.alert("Error", "Failed to delete recording");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ Delete error:", error);
    }
  };

  const copyTranscription = async () => {
    await haptics.impact("Light");
    await AsyncStorage.setItem('clipboard', transcription);
    Alert.alert("Copied!", "Transcription copied to clipboard.");
  };

  const shareTranscription = async () => {
    await haptics.impact("Light");
    try {
      await Share.share({
        message: transcription,
        title: "Lecture Transcription",
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const displayedRecordings = showAllRecordings ? previousRecordings : previousRecordings.slice(0, 3);

  const getLanguageDisplay = (langCode) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
    return lang ? `${lang.flag} ${lang.name}` : langCode;
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#6B21A8"]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <MaterialIcons name="mic" size={32} color="rgba(255,255,255,0.3)" />
        <Text style={styles.headerText}>Record Lecture</Text>
        <Text style={styles.headerSubtext}>
          {useWebSpeech ? "Real-time multi-language transcription" : "Record & transcribe with language detection"}
        </Text>
      </LinearGradient>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View 
          style={[
            styles.recordContainer,
            isDark && { backgroundColor: "#1F2937" },
            { opacity: fadeAnim },
          ]}
        >
          {/* Continuing Banner */}
          {continuingRecordingId && (
            <View style={styles.continuingBanner}>
              <MaterialIcons name="add-circle" size={20} color="#10B981" />
              <Text style={styles.continuingText}>
                Continuing previous recording
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setContinuingRecordingId(null);
                  if (!isRecording) setTranscription("");
                }}
              >
                <MaterialIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {/* Language Selection */}
          {!isRecording && (
            <View style={styles.languageContainer}>
              <View style={styles.languageSection}>
                <View style={styles.languageHeader}>
                  <MaterialIcons name="language" size={18} color="#9B5DE5" />
                  <Text style={[styles.languageLabel, isDark && styles.textDark]}>
                    Source Language
                  </Text>
                </View>
                <View style={[styles.languagePicker, isDark && styles.languagePickerDark]}>
                  <Text style={styles.languageValue}>
                    {getLanguageDisplay(sourceLanguage)}
                  </Text>
                </View>
              </View>

              <MaterialIcons name="arrow-forward" size={20} color="#9CA3AF" />

              <View style={styles.languageSection}>
                <View style={styles.languageHeader}>
                  <MaterialIcons name="translate" size={18} color="#10B981" />
                  <Text style={[styles.languageLabel, isDark && styles.textDark]}>
                    Convert To
                  </Text>
                </View>
                <View style={[styles.languagePicker, isDark && styles.languagePickerDark]}>
                  <Text style={styles.languageValue}>
                    {getLanguageDisplay(targetLanguage)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Detected Languages Display */}
          {detectedLanguages.length > 1 && (
            <View style={styles.detectedLanguagesContainer}>
              <MaterialIcons name="info-outline" size={16} color="#10B981" />
              <Text style={[styles.detectedLanguagesText, isDark && styles.textSecondaryDark]}>
                Multi-language detected: {detectedLanguages.map(l => getLanguageDisplay(l).split(' ')[0]).join(' ')}
              </Text>
            </View>
          )}

          {/* Real-time Mode Toggle */}
          {Platform.OS === "web" && typeof window !== 'undefined' && 'webkitSpeechRecognition' in window && !isRecording && (
            <View style={[styles.modeToggle, isDark && styles.modeToggleDark]}>
              <View style={styles.modeInfo}>
                <MaterialIcons 
                  name={useWebSpeech ? "flash-on" : "schedule"} 
                  size={20} 
                  color={useWebSpeech ? "#10B981" : "#9B5DE5"} 
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeLabel, isDark && styles.textDark]}>
                    {useWebSpeech ? "Real-time Mode" : "Post-recording Mode"}
                  </Text>
                  <Text style={[styles.modeDescription, isDark && styles.textSecondaryDark]}>
                    {useWebSpeech 
                      ? "Live transcription as you speak"
                      : "Better accuracy with AssemblyAI"}
                  </Text>
                </View>
              </View>
              <Switch
                value={useWebSpeech}
                onValueChange={(value) => {
                  haptics.impact("Light");
                  setUseWebSpeech(value);
                }}
                trackColor={{ false: "#D1D5DB", true: "#10B981" }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          {/* Timer */}
          {isRecording && (
            <View style={styles.timerContainer}>
              <View style={[styles.recordingIndicator, isPaused && styles.pausedIndicator]} />
              <Text style={[styles.timerText, isDark && styles.textDark]}>
                {formatDuration(recordingDuration)}
              </Text>
              <Text style={styles.timerLabel}>
                {isPaused ? "Paused" : useWebSpeech ? "Recording (Live)" : "Recording"}
              </Text>
            </View>
          )}

          {/* Microphone Icon */}
          <View style={styles.micContainer}>
            <Animated.View
              style={[
                styles.recordIconContainer,
                isRecording && styles.recordingActive,
                isPaused && styles.recordingPaused,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <LinearGradient
                colors={
                  isRecording
                    ? isPaused
                      ? ["#F59E0B", "#D97706"]
                      : useWebSpeech
                      ? ["#10B981", "#059669"]
                      : ["#EF4444", "#DC2626"]
                    : ["#6B7280", "#4B5563"]
                }
                style={styles.iconGradient}
              >
                <MaterialIcons
                  name={isPaused ? "pause" : "mic"}
                  size={56}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Status Text */}
          <Text style={[styles.recordStatus, isDark && styles.textDark]}>
            {isRecording
              ? isPaused
                ? "Recording Paused"
                : useWebSpeech
                ? "Recording (Live Multi-Language)"
                : "Recording in Progress"
              : continuingRecordingId
              ? "Ready to Continue"
              : "Ready to Record"}
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {!isRecording ? (
              <TouchableOpacity
                onPress={startRecording}
                style={styles.primaryButton}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={useWebSpeech ? ["#10B981", "#059669"] : ["#9B5DE5", "#7C3AED"]}
                  style={styles.buttonGradient}
                >
                  <MaterialIcons name="fiber-manual-record" size={24} color="#fff" />
                  <Text style={styles.buttonText}>
                    {continuingRecordingId ? "Continue Recording" : "Start Recording"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.controlButtons}>
                <TouchableOpacity
                  onPress={cancelRecording}
                  style={styles.secondaryButton}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="close" size={24} color="#EF4444" />
                  <Text style={[styles.secondaryButtonText, { color: "#EF4444" }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={isPaused ? resumeRecording : pauseRecording}
                  style={styles.secondaryButton}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={isPaused ? "play-arrow" : "pause"}
                    size={24}
                    color="#9B5DE5"
                  />
                  <Text style={[styles.secondaryButtonText, { color: "#9B5DE5" }]}>
                    {isPaused ? "Resume" : "Pause"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={stopRecording}
                  style={styles.primaryButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={["#EF4444", "#DC2626"]}
                    style={styles.buttonGradient}
                  >
                    <MaterialIcons name="stop" size={24} color="#fff" />
                    <Text style={styles.buttonText}>Finish</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Tips */}
          {!isRecording && (
            <View style={[styles.tipsContainer, isDark && styles.tipsContainerDark]}>
              <MaterialIcons name="lightbulb-outline" size={18} color="#9B5DE5" />
              <Text style={[styles.tipsText, isDark && styles.textSecondaryDark]}>
                {useWebSpeech 
                  ? "Tip: Speak in multiple languages! System auto-detects and translates to your target language."
                  : "Tip: AssemblyAI provides superior accuracy and automatic language detection."}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Transcription Container */}
        {(transcription || isTranscribing || isSaving) && (
          <Animated.View
            style={[
              styles.transcriptionContainer,
              isDark && styles.transcriptionContainerDark,
              { opacity: fadeAnim },
            ]}
          >
            <View style={styles.transcriptionHeader}>
              <MaterialIcons name="article" size={24} color={useWebSpeech ? "#10B981" : "#9B5DE5"} />
              <Text style={[styles.transcriptionTitle, isDark && styles.textDark]}>
                {useWebSpeech ? "Live Transcription" : "Transcription"}
              </Text>
            </View>

            {isTranscribing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#9B5DE5" />
                <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
                  Detecting languages and transcribing...
                </Text>
              </View>
            ) : isSaving ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
                  Saving to cloud storage...
                </Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.transcriptionScroll}>
                  <Text style={[styles.transcriptionText, isDark && styles.textDark]}>
                    {transcription}
                  </Text>
                </ScrollView>

                <View style={styles.transcriptionActions}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={copyTranscription}
                  >
                    <MaterialIcons name="content-copy" size={20} color="#6B7280" />
                    <Text style={[styles.actionButtonText, isDark && styles.textSecondaryDark]}>
                      Copy
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={shareTranscription}
                  >
                    <MaterialIcons name="share" size={20} color="#6B7280" />
                    <Text style={[styles.actionButtonText, isDark && styles.textSecondaryDark]}>
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.methodBadge}>
                  <MaterialIcons 
                    name={useWebSpeech ? "flash-on" : "cloud"} 
                    size={12} 
                    color={useWebSpeech ? "#10B981" : "#9B5DE5"} 
                  />
                  <Text style={styles.methodText}>
                    {useWebSpeech ? "Web Speech API" : "AssemblyAI"} • Multi-Language
                  </Text>
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Previous Recordings */}
        {previousRecordings.length > 0 && (
          <View style={[styles.recordingsListContainer, isDark && styles.recordingsListContainerDark]}>
            <View style={styles.recordingsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="history" size={24} color="#9B5DE5" />
                <Text style={[styles.recordingsTitle, isDark && styles.textDark]}>
                  Previous Recordings
                </Text>
                <View style={styles.recordingsBadge}>
                  <Text style={styles.recordingsBadgeText}>{previousRecordings.length}</Text>
                </View>
              </View>
              {previousRecordings.length > 3 && (
                <TouchableOpacity 
                  onPress={() => setShowAllRecordings(!showAllRecordings)}
                  style={styles.viewAllButton}
                >
                  <Text style={styles.viewAllText}>
                    {showAllRecordings ? 'Show Less' : 'View All'}
                  </Text>
                  <MaterialIcons 
                    name={showAllRecordings ? "expand-less" : "expand-more"} 
                    size={20} 
                    color="#9B5DE5" 
                  />
                </TouchableOpacity>
              )}
            </View>

            {loadingRecordings ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#9B5DE5" />
                <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
                  Loading recordings...
                </Text>
              </View>
            ) : (
              <>
                {displayedRecordings.map((recording) => (
                  <View 
                    key={recording.id}
                    style={[styles.recordingCard, isDark && styles.recordingCardDark]}
                  >
                    <View style={styles.recordingIconContainer}>
                      <MaterialIcons name="mic" size={20} color="#9B5DE5" />
                    </View>
                    
                    <View style={styles.recordingContent}>
                      <Text style={[styles.recordingTitle, isDark && styles.textDark]} numberOfLines={1}>
                        {recording.title}
                      </Text>
                      
                      <View style={styles.recordingMeta}>
                        <Text style={[styles.recordingMetaText, isDark && styles.textSecondaryDark]}>
                          <MaterialIcons name="schedule" size={12} /> {recording.formattedDuration || recording.duration}
                        </Text>
                        <Text style={[styles.recordingMetaText, isDark && styles.textSecondaryDark]}>
                          {recording.formattedDate}
                        </Text>
                        {recording.detectedLanguages && recording.detectedLanguages.length > 1 && (
                          <View style={styles.multiLangBadge}>
                            <MaterialIcons name="translate" size={10} color="#10B981" />
                            <Text style={styles.multiLangText}>Multi</Text>
                          </View>
                        )}
                      </View>
                      
                      <Text style={[styles.recordingTranscript, isDark && styles.textSecondaryDark]} numberOfLines={2}>
                        {recording.transcription || "No transcription available"}
                      </Text>
                      
                      <View style={styles.recordingActions}>
                        <TouchableOpacity
                          onPress={() => continueRecording(recording)}
                          style={styles.continueButton}
                        >
                          <MaterialIcons name="play-arrow" size={16} color="#FFFFFF" />
                          <Text style={styles.continueButtonText}>Continue</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              recording.title,
                              recording.transcription,
                              [{ text: "Close" }]
                            );
                          }}
                          style={styles.viewButton}
                        >
                          <MaterialIcons name="visibility" size={16} color="#6B7280" />
                          <Text style={styles.viewButtonText}>View</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={() => deleteRecording(recording.id)}
                          style={styles.deleteButton}
                        >
                          <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                
                {!showAllRecordings && previousRecordings.length > 3 && (
                  <TouchableOpacity
                    onPress={() => setShowAllRecordings(true)}
                    style={styles.showMoreButton}
                  >
                    <Text style={styles.showMoreText}>
                      + {previousRecordings.length - 3} more recordings
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Empty State */}
        {!transcription && !isTranscribing && !isRecording && previousRecordings.length === 0 && !loadingRecordings && (
          <View style={styles.placeholderContainer}>
            <MaterialIcons name="mic-none" size={64} color="#D1D5DB" />
            <Text style={[styles.placeholderText, isDark && styles.textSecondaryDark]}>
              No recordings yet
            </Text>
            <Text style={[styles.placeholderSubtext, isDark && styles.textSecondaryDark]}>
              Start recording to capture and transcribe lectures in multiple languages
            </Text>
            
            <View style={[styles.setupCard, isDark && styles.setupCardDark]}>
              <Text style={[styles.setupTitle, isDark && styles.textDark]}>
                Multi-Language Features
              </Text>
              <View style={styles.setupStep}>
                <Text style={styles.setupNumber}>1</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.setupStepTitle, isDark && styles.textDark]}>
                    Automatic Detection
                  </Text>
                  <Text style={[styles.setupStepText, isDark && styles.textSecondaryDark]}>
                    System detects all languages spoken during recording
                  </Text>
                </View>
              </View>
              <View style={styles.setupStep}>
                <Text style={styles.setupNumber}>2</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.setupStepTitle, isDark && styles.textDark]}>
                    Smart Translation
                  </Text>
                  <Text style={[styles.setupStepText, isDark && styles.textSecondaryDark]}>
                    Converts all content to your selected target language
                  </Text>
                </View>
              </View>
              <View style={styles.setupStep}>
                <Text style={styles.setupNumber}>3</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.setupStepTitle, isDark && styles.textDark]}>
                    Cloud Storage
                  </Text>
                  <Text style={[styles.setupStepText, isDark && styles.textSecondaryDark]}>
                    All recordings automatically synced across devices
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
    paddingTop: 30,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  headerText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 8,
  },
  headerSubtext: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  recordContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    marginBottom: 24,
  },
  continuingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  continuingText: {
    flex: 1,
    fontSize: 13,
    color: "#059669",
    fontWeight: "600",
  },
  languageContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  languageSection: {
    flex: 1,
  },
  languageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  languagePicker: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  languagePickerDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  languageValue: {
    fontSize: 13,
    color: "#1F2937",
    fontWeight: "500",
  },
  detectedLanguagesContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
    gap: 6,
  },
  detectedLanguagesText: {
    flex: 1,
    fontSize: 11,
    color: "#059669",
    fontWeight: "500",
  },
  modeToggle: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeToggleDark: {
    backgroundColor: "#374151",
  },
  modeInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  modeDescription: {
    fontSize: 12,
    color: "#6B7280",
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
    marginBottom: 8,
  },
  pausedIndicator: {
    backgroundColor: "#F59E0B",
  },
  timerText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#1F2937",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
    marginTop: 4,
  },
  micContainer: {
    alignItems: "center",
    marginVertical: 32,
  },
  recordIconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  recordingActive: {
    shadowColor: "#EF4444",
  },
  recordingPaused: {
    shadowColor: "#F59E0B",
  },
  iconGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
  },
  recordStatus: {
    fontSize: 20,
    color: "#1F2937",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 32,
  },
  buttonContainer: {
    marginBottom: 16,
  },
  controlButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    gap: 4,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tipsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F3E8FF",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  tipsContainerDark: {
    backgroundColor: "#374151",
  },
  tipsText: {
    flex: 1,
    fontSize: 12,
    color: "#6B21A8",
    lineHeight: 18,
  },
  transcriptionContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    marginBottom: 24,
  },
  transcriptionContainerDark: {
    backgroundColor: "#1F2937",
  },
  transcriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  transcriptionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 12,
    textAlign: "center",
  },
  transcriptionScroll: {
    maxHeight: 300,
    marginBottom: 16,
  },
  transcriptionText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 24,
  },
  transcriptionActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  methodText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  recordingsListContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    marginBottom: 24,
  },
  recordingsListContainerDark: {
    backgroundColor: "#1F2937",
  },
  recordingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  recordingsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  recordingsBadge: {
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recordingsBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9B5DE5",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9B5DE5",
  },
  recordingCard: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  recordingCardDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  recordingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3E8FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  recordingContent: {
    flex: 1,
  },
  recordingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  recordingMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  recordingMetaText: {
    fontSize: 11,
    color: "#6B7280",
  },
  multiLangBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  multiLangText: {
    fontSize: 9,
    color: "#10B981",
    fontWeight: "600",
  },
  recordingTranscript: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 10,
  },
  recordingActions: {
    flexDirection: "row",
    gap: 8,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#9B5DE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  continueButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  deleteButton: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: "auto",
  },
  showMoreButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9B5DE5",
  },
  placeholderContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  placeholderText: {
    fontSize: 18,
    color: "#9CA3AF",
    fontWeight: "600",
    marginTop: 16,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: "#D1D5DB",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  setupCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    width: "100%",
    maxWidth: 400,
  },
  setupCardDark: {
    backgroundColor: "#374151",
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
    textAlign: "center",
  },
  setupStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  setupNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#9B5DE5",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 28,
  },
  setupStepTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  setupStepText: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  textDark: {
    color: "#F9FAFB",
  },
  textSecondaryDark: {
    color: "#D1D5DB",
  },
});