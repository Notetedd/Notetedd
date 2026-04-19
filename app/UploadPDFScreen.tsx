import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, Image, ActivityIndicator, Modal,
  FlatList, TextInput, Animated, Platform, StatusBar,
  useWindowDimensions,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useTheme } from "./context/ThemeContext";
import useFeatureGate from "./hooks/useFeatureGate";
import { FEATURES } from "../RevenueCatConfig";
import TrialBanner from "./components/TrialBanner";
import UsageMeter from "./components/UsageMeter";
import BackButton from "../components/Backbutton";
import { db, auth } from "../firebaseConfig";
import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, where, serverTimestamp,
} from "firebase/firestore";

// ─── Key from env — ───────────────────────────────────────────
// After
const GROQ_API_KEY    = process.env.EXPO_PUBLIC_GROQ_API_KEY   ?? "";
const GEMINI_API_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GROQ_API_URL    = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
// ════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════

const T = {
  bg:         "#04040a",
  bgEl:       "#090914",
  bgCard:     "#0d0d1a",
  bgCardAlt:  "#111120",
  bgInput:    "#14142a",
  border:     "rgba(255,255,255,0.07)",
  borderMid:  "rgba(255,255,255,0.13)",
  text:       "#ede9ff",
  textSub:    "rgba(237,233,255,0.68)",
  textMuted:  "rgba(237, 233, 255, 0.83)",
  textDim:    "rgba(237, 233, 255, 0.72)",
  scrim:      "rgba(4,4,10,0.94)",

  violet:     "#5b21b6", violetMid: "#7c3aed", violetBr: "#a78bfa",
  ember:      "#ea580c", emberBr:   "#fb923c",
  teal:       "#0d9488", tealBr:    "#2dd4bf",
  gold:       "#d97706", goldBr:    "#fbbf24",
  success:    "#059669", successBr: "#34d399",
  danger:     "#dc2626", dangerBr:  "#f87171",

  va: (a) => `rgba(91,33,182,${a})`,
  ea: (a) => `rgba(234,88,12,${a})`,
  ta: (a) => `rgba(13,148,136,${a})`,
  sa: (a) => `rgba(5,150,105,${a})`,
  da: (a) => `rgba(220,38,38,${a})`,
  ga: (a) => `rgba(217,119,6,${a})`,
  wa: (a) => `rgba(255,255,255,${a})`,
  ba: (a) => `rgba(0,0,0,${a})`,
};

const L = {
  bg:        "#f5f3ff", bgEl:      "#ffffff", bgCard:    "#ffffff",
  bgCardAlt: "#f0ecff", bgInput:   "#ede9ff",
  border:    "rgba(91,33,182,0.08)", borderMid: "rgba(91,33,182,0.18)",
  text:      "#1e1033", textSub:   "rgba(30,16,51,0.68)",
  textMuted: "rgba(30,16,51,0.44)", textDim:   "rgba(30,16,51,0.24)",
  scrim:     "rgba(245,243,255,0.96)",
};

const useC = (isDark) => ({ ...T, ...(isDark ? {} : L) });

const DISPLAY = Platform.select({ ios: "Georgia",        default: "serif" });
const SANS    = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const MONO    = Platform.select({ ios: "Menlo",          default: "monospace" });

const sp = (n) => n * 8;

// ════════════════════════════════════════════════════════════════
//  ATOMS
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
      <View style={{ ...base, width: 1.5, height: size, backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
};

const Pill = ({ label, color, icon, style }) => (
  <View style={[{
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}33`,
  }, style]}>
    {icon && <MaterialIcons name={icon} size={10} color={color} />}
    <Label color={color}>{label}</Label>
  </View>
);

// I map MIME types to the right icon name.
const fileIcon = (type) => {
  if (type?.includes("image"))    return "image";
  if (type?.includes("pdf"))      return "picture-as-pdf";
  if (type?.includes("word") || type?.includes("document")) return "description";
  return "insert-drive-file";
};

// I pick the right accent colour per file type.
const fileAccent = (type) => {
  if (type?.includes("image")) return T.tealBr;
  if (type?.includes("pdf"))   return T.dangerBr;
  return T.violetBr;
};

// ─── Upload pill card ─────────────────────────────────────────
const UploadRow = ({ item, onRemove, colors }) => {
  const isImage = item.type?.includes("image");
  const accent  = fileAccent(item.type);

  return (
    <View style={[A.uploadRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Corner pos="top-left"     color={accent} size={8} />
      <Corner pos="bottom-right" color={colors.borderMid} size={8} />

      {isImage ? (
        <Image source={{ uri: item.uri }} style={A.uploadThumb} />
      ) : (
        <View style={[A.uploadIconWrap, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={fileIcon(item.type)} size={22} color={accent} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={[A.uploadName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Pill label={isImage ? "Image" : item.type?.includes("pdf") ? "PDF" : "Doc"} color={accent} />
          <Label color={colors.textDim}>{(item.size / 1024).toFixed(0)} KB</Label>
        </View>
      </View>

      <TouchableOpacity
        style={[A.removeBtn, { backgroundColor: T.da(0.12), borderColor: T.da(0.25) }]}
        onPress={() => onRemove(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.75}
      >
        <MaterialIcons name="close" size={14} color={T.dangerBr} />
      </TouchableOpacity>
    </View>
  );
};

// ─── Upload source button ─────────────────────────────────────
const SourceBtn = ({ icon, label, accent, onPress, colors }) => (
  <TouchableOpacity
    style={[A.sourceBtn, { backgroundColor: colors.bgCard, borderColor: `${accent}30` }]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={[A.sourceBtnIcon, { backgroundColor: `${accent}14` }]}>
      <MaterialIcons name={icon} size={22} color={accent} />
    </View>
    <Label color={colors.textSub} style={{ marginTop: 6, letterSpacing: 2 }}>{label}</Label>
  </TouchableOpacity>
);

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ════════════════════════════════════════════════════════════════

export default function UploadPDFScreen({ navigation }) {
  const { theme }   = useTheme();
  const isDark      = theme === "dark";
  const colors      = useC(isDark);

  const { width: W } = useWindowDimensions();
  const isTablet     = W >= 768;
  const padH         = isTablet ? sp(6) : sp(3);
  const padTop       = Platform.OS === "ios" ? sp(7) : sp(5.5);

  // ── Original state — untouched ────────────────────────────────
  const [uploads,              setUploads]              = useState([]);
  const [isProcessing,         setIsProcessing]         = useState(false);
  const [generatedNotes,       setGeneratedNotes]       = useState(null);
  const [showMergeModal,       setShowMergeModal]       = useState(false);
  const [showNotesPreview,     setShowNotesPreview]     = useState(false);
  const [matchingNotes,        setMatchingNotes]        = useState([]);
  const [processingProgress,   setProcessingProgress]   = useState("");
  const [noteTitle,            setNoteTitle]            = useState("");

  const fileInputRef = useRef(null);
  const { gate, track, canUse } = useFeatureGate(FEATURES.UPLOAD);

  // ── Animations ────────────────────────────────────────────────
  const masterOpa = useRef(new Animated.Value(0)).current;
  const slideY    = useRef(new Animated.Value(20)).current;
  // I use a subtle pulse on the processing orb.
  const procPulse = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 640, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 52, friction: 11, useNativeDriver: true }),
    ]).start();
  }, []);

  React.useEffect(() => {
    if (isProcessing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(procPulse, { toValue: 1.14, duration: 800, useNativeDriver: true }),
          Animated.timing(procPulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      procPulse.stopAnimation();
      Animated.spring(procPulse, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [isProcessing]);

  // ════════════════════════════════════════════════════════════
  //  FUNCTIONS
  // ════════════════════════════════════════════════════════════

  const handleWebFileUpload = (event) => {
    const files = Array.from(event.target.files);
    const newUploads = files.map((file) => ({
      id: Date.now() + Math.random(),
      uri: URL.createObjectURL(file),
      name: file.name,
      type: file.type,
      size: file.size,
      webFile: file,
    }));
    setUploads([...uploads, ...newUploads]);
  };

  const pickImages = async (fromCamera = false) => {
    try {
      if (Platform.OS === "web" && fromCamera) {
        Alert.alert("Not Available", "Camera is not available on web. Please use gallery or file upload.");
        return;
      }
      let result;
      if (fromCamera) {
        const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraStatus.status !== "granted") { Alert.alert("Permission Denied", "We need camera permissions."); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, quality: 0.8 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
      }
      if (!result.canceled) {
        const newUploads = result.assets.map((asset) => ({
          id: Date.now() + Math.random(),
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: asset.type || asset.mimeType || "image/jpeg",
          size: asset.fileSize || 0,
        }));
        setUploads([...uploads, ...newUploads]);
      }
    } catch (error) {
      console.error("ImagePicker Error:", error);
      Alert.alert("Error", "Could not open image picker.");
    }
  };

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*", "application/docx"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.type === "success" || result.assets) {
        const files = result.assets || [result];
        const newUploads = files.map((file) => ({
          id: Date.now() + Math.random(),
          uri: file.uri,
          name: file.name,
          type: file.mimeType || "application/pdf",
          size: file.size,
        }));
        setUploads([...uploads, ...newUploads]);
      }
    } catch (error) {
      console.error("DocumentPicker Error:", error);
      Alert.alert("Error", "Could not open document picker.");
    }
  };

  const removeUpload = (id) => setUploads(uploads.filter((item) => item.id !== id));

  const fileToBase64 = async (uri, webFile = null) => {
    try {
      console.log("Converting to base64:", uri);
      if (Platform.OS === "web") {
        if (webFile) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(webFile);
          });
        } else {
          const response = await fetch(uri);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } else {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          if (!base64 || base64.length === 0) throw new Error("Conversion resulted in empty string");
          console.log("✅ Successfully converted to base64");
          return base64;
        } catch (fsError) {
          console.error("Direct read failed, trying fetch method:", fsError);
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => { const base64 = reader.result.split(",")[1]; console.log("✅ Converted via fetch method"); resolve(base64); };
              reader.onerror  = (error) => { console.error("FileReader error:", error); reject(new Error("Failed to read file as base64")); };
              reader.readAsDataURL(blob);
            });
          } catch (fetchError) {
            console.error("Fetch method also failed:", fetchError);
            throw new Error("Unable to read file. Please try a different image or file format.");
          }
        }
      }
    } catch (error) {
      console.error("fileToBase64 error:", error);
      throw new Error(`Could not convert file: ${error.message}`);
    }
  };

  const formatNotesContent = (rawContent) => {
    if (!rawContent) return "";
    return rawContent
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[""]([^""]+)["\"]/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
const analyzeImage = async (file) => {
  try {
    console.log("Analyzing image:", file.name, file.type);
    const base64 = await fileToBase64(file.uri, file.webFile);
    if (!base64) throw new Error("Could not convert image to base64");

    let mimeType = file.type;
    if (!mimeType || mimeType === "image") {
      const ext = file.name.toLowerCase().split(".").pop();
      mimeType = ({ jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", gif:"image/gif", webp:"image/webp", heic:"image/heic", heif:"image/heif" })[ext] || "image/jpeg";
    }
    console.log("Using MIME type:", mimeType);

    const imagePrompt = `You are an expert note-taking assistant. Analyze this image and extract ALL visible content.

IMPORTANT FORMATTING RULES:
- DO NOT use asterisks (*) for bold or italic
- DO NOT use backticks (\`) for code
- DO NOT add extra quotes around text
- Use plain text with clear hierarchy
- Use simple formatting with line breaks and indentation

Extract and organize the content with:
1. Title: [Clear title on first line]
2. Main topics with subtopics (use proper indentation)
3. Key points and definitions
4. Formulas or equations (if present)
5. Examples (if present)
6. Summary (if sufficient content)

ONLY include sections that have actual content from the image.
Format as clean, readable plain text suitable for students.`;

    // ── Primary: Groq (vision) ─────────────────────────────
    if (GROQ_API_KEY) {
      try {
        console.log("🟡 Trying Groq for image analysis…");
        const groqRes = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: imagePrompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                ],
              },
            ],
            temperature: 0.3,
            max_tokens: 4096,
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const text = groqData.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log("✅ Groq image analysis succeeded");
            return formatNotesContent(text);
          }
        } else {
          const err = await groqRes.json().catch(() => ({}));
          console.warn("⚠️ Groq image error:", err.error?.message || groqRes.statusText);
        }
      } catch (groqErr) {
        console.warn("⚠️ Groq image request failed, falling back to Gemini:", groqErr.message);
      }
    }

    // ── Fallback: Gemini ───────────────────────────────────
    console.log("🔵 Falling back to Gemini for image analysis…");
    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: imagePrompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0.3, topK: 20, topP: 0.8, maxOutputTokens: 4096 },
      }),
    });

    if (!geminiRes.ok) {
      const errorData = await geminiRes.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${errorData.error?.message || geminiRes.statusText}`);
    }

    const geminiData = await geminiRes.json();
    console.log("✅ Gemini image response received");
    if (geminiData.candidates?.[0]?.content) {
      const text = geminiData.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join("\n");
      if (text) return formatNotesContent(text);
    }
    throw new Error("Both Groq and Gemini returned no content");
  } catch (error) {
    console.error("Image analysis error:", error);
    throw error;
  }
};
const analyzeDocument = async (file) => {
  const docPrompt = `You are an expert note-taking assistant. A student has uploaded: "${file.name}"

IMPORTANT FORMATTING RULES:
- DO NOT use asterisks (*) for formatting
- DO NOT use backticks (\`)
- DO NOT add quotes around text
- Use plain text with clear structure

Create organized notes with:
1. Title based on the document name
2. Main sections (only if content allows):
   - Overview
   - Key Concepts
   - Important Points
   - Examples (if applicable)
   - Summary

Format as clean, readable plain text.`;

  // ── Primary: Groq ──────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      console.log("🟡 Trying Groq for document analysis…");
      const groqRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: docPrompt }],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log("✅ Groq document analysis succeeded");
          return formatNotesContent(text);
        }
      } else {
        const err = await groqRes.json().catch(() => ({}));
        console.warn("⚠️ Groq document error:", err.error?.message || groqRes.statusText);
      }
    } catch (groqErr) {
      console.warn("⚠️ Groq document request failed, falling back to Gemini:", groqErr.message);
    }
  }

  // ── Fallback: Gemini ───────────────────────────────────
  console.log("🔵 Falling back to Gemini for document analysis…");
  const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: docPrompt }] }],
      generationConfig: { temperature: 0.3, topK: 20, topP: 0.8, maxOutputTokens: 2048 },
    }),
  });

  if (!geminiRes.ok) {
    const e = await geminiRes.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${e.error?.message || geminiRes.statusText}`);
  }

  const geminiData = await geminiRes.json();
  if (geminiData.candidates?.[0]?.content) {
    const text = geminiData.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join("\n");
    if (text) return formatNotesContent(text);
  }
  throw new Error("Both Groq and Gemini returned no content for this document");
};

  const checkForMatches = async (generatedContent) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { console.log("No user signed in"); return []; }
      console.log("🔍 Checking for matching notes...");
      const q = query(collection(db, "recordings"), where("userId", "==", currentUser.uid));
      const snap = await getDocs(q);
      const existingNotes = snap.docs.map(d => ({ id: d.id, title: d.data().title || d.data().organizedNotes?.title || "Untitled", content: d.data().organizedNotes?.content || d.data().transcription || "", ...d.data() }));
      console.log(`📚 Found ${existingNotes.length} existing notes`);
      const keywords = generatedContent.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 4);
      const matches = existingNotes.filter(note => {
        const noteContent = (note.title + " " + note.content).toLowerCase();
        const matchCount = keywords.filter(kw => noteContent.includes(kw)).length;
        return matchCount / Math.max(keywords.length, 1) > 0.25;
      });
      console.log(`✨ Found ${matches.length} matching notes`);
      return matches;
    } catch (error) { console.error("Error checking for matches:", error); return []; }
  };

  const processUploads = async () => {
    if (uploads.length === 0) { Alert.alert("No Files", "Please upload at least one file."); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) { Alert.alert("Sign In Required", "Please sign in to generate notes."); return; }

    setIsProcessing(true);
    let allNotes = "", successCount = 0, failCount = 0;

    try {
      for (let i = 0; i < uploads.length; i++) {
        const file = uploads[i];
        setProcessingProgress(`Processing ${i + 1} of ${uploads.length}: ${file.name}`);
        try {
          let notes;
          if (file.type.includes("image")) notes = await analyzeImage(file);
          else if (file.type.includes("pdf") || file.type.includes("document")) notes = await analyzeDocument(file);
          else notes = `Unable to process file type: ${file.type}`;

          if (uploads.length === 1) {
            allNotes = notes;
          } else {
            allNotes += `\n\n${"─".repeat(50)}\n📄 ${file.name}\n${"─".repeat(50)}\n\n` + notes;
          }
          successCount++;
          console.log(`✅ Successfully processed: ${file.name}`);
        } catch (fileError) {
          console.error(`❌ Failed to process ${file.name}:`, fileError);
          failCount++;
          if (uploads.length > 1) allNotes += `\n\n${"─".repeat(50)}\n📄 ${file.name} - Processing Failed\n${"─".repeat(50)}\n\nError: ${fileError.message}\n`;
        }
      }

      if (successCount === 0) throw new Error("Failed to process any files. Please try different files or formats.");
      if (failCount > 0) Alert.alert("Partial Success", `Successfully processed ${successCount} file(s). ${failCount} file(s) failed.`);

      setGeneratedNotes(allNotes);
      const lines = allNotes.split("\n").filter(l => l.trim());
      const extractedTitle = lines[0]?.replace(/^#+\s*/, "")?.replace(/^Title:\s*/i, "")?.substring(0, 100) || "";
      setNoteTitle(extractedTitle || `AI Notes - ${new Date().toLocaleDateString()}`);

      const matches = await checkForMatches(allNotes);
      if (matches.length > 0) { setMatchingNotes(matches); setShowMergeModal(true); }
      else setShowNotesPreview(true);
    } catch (error) {
      console.error("Processing error:", error);
      Alert.alert("Processing Failed", error.message || "Failed to process uploads. Please try again.", [{ text: "OK" }]);
    } finally {
      setIsProcessing(false);
      setProcessingProgress("");
    }
  };

  const saveNotes = async (content, mergeWithId = null) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { Alert.alert("Error", "Please sign in to save notes."); return; }

      if (mergeWithId) {
        console.log("🔄 Merging with existing note:", mergeWithId);
        const noteRef      = doc(db, "recordings", mergeWithId);
        const existingNote = matchingNotes.find(n => n.id === mergeWithId);
        const updatedContent = existingNote.organizedNotes?.content
          ? existingNote.organizedNotes.content + "\n\n" + "─".repeat(50) + "\n\n📎 Merged Content\n\n" + content
          : content;

        await updateDoc(noteRef, {
          organizedNotes: {
            title: existingNote.organizedNotes?.title || noteTitle,
            content: updatedContent,
            summary: content.substring(0, 200) + "...",
            aiProvider: "gemini",
            sections: [{ title: "Content", content: updatedContent, subtopics: [] }],
            keyPoints: [], definitions: {}, questions: [], calculations: [], relatedTopics: [],
          },
          updatedAt: serverTimestamp(),
        });

        Alert.alert("Success! 🎉", "Notes merged successfully!", [
          { text: "View Notes", onPress: () => { navigation.navigate("Notes"); resetState(); } },
          { text: "OK", onPress: resetState },
        ]);
      } else {
        console.log("💾 Saving new note to Firebase with proper structure");
        const organizedNotes = {
          title: noteTitle,
          content,
          summary: content.substring(0, 200) + "...",
          aiProvider: "gemini",
          sections: [{ title: "Content", content, subtopics: [] }],
          keyPoints: content.split("\n").filter(line => line.trim().length > 20 && (line.includes("•") || line.includes("-") || /^\d+\./.test(line.trim()))).slice(0, 5),
          definitions: {},
          questions: ["What are the main topics covered in this content?", "What are the key takeaways?", "How does this relate to other material?"],
          calculations: [], relatedTopics: [],
        };

        await addDoc(collection(db, "recordings"), {
          userId:         currentUser.uid,
          title:          noteTitle,
          transcription:  content,
          organizedNotes,
          createdAt:      serverTimestamp(),
          updatedAt:      serverTimestamp(),
          source:         "ai_upload",
          status:         "completed",
          duration:       0,
        });
        await track();
        console.log("✅ Note saved successfully with proper structure");
        Alert.alert("Success! 🎉", "Notes saved successfully!", [
          { text: "View Notes",   onPress: () => { navigation.navigate("Notes"); resetState(); } },
          { text: "Upload More",  onPress: resetState },
        ]);
      }
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", `Failed to save notes: ${error.message}`);
    }
  };

  const resetState = () => {
    setUploads([]); setGeneratedNotes(null);
    setShowMergeModal(false); setShowNotesPreview(false);
    setMatchingNotes([]); setNoteTitle("");
  };

  const handleMergeDecision = (noteId) => {
    Alert.alert("Merge Notes", "Do you want to merge the generated content with the existing note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Create New", onPress: () => { setShowMergeModal(false); setShowNotesPreview(true); } },
      { text: "Merge", onPress: () => { setShowMergeModal(false); saveNotes(generatedNotes, noteId); } },
    ]);
  };

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <View style={[A.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      {/* ── Navbar ──────────────────────────────────────────── */}
      <View style={[A.navbar, { backgroundColor: colors.bg + "f0", borderBottomColor: colors.border, paddingTop: padTop }]}>
        <BackButton color={T.violetBr} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Label color={colors.textDim} style={{ marginBottom: 4, letterSpacing: 5 }}>— NoteTedd</Label>
          <Text style={[A.navTitle, { color: colors.text }]}>
            Image to{" "}
            <Text style={{ fontStyle: "italic", color: T.violetBr }}>Notes</Text>
          </Text>
        </View>
        <View style={[A.navBadge, { backgroundColor: T.va(0.12), borderColor: T.va(0.25) }]}>
          <MaterialIcons name="auto-awesome" size={17} color={T.violetBr} />
        </View>
      </View>

      <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: slideY }], flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(14) }}
        >

          <TrialBanner />
          <UsageMeter
            feature={FEATURES.UPLOAD}
            style={{ marginBottom: sp(2) }}
          />
          {/* ── Hero ────────────────────────────────────────── */}
          <View style={{ marginBottom: sp(3.5) }}>
            <Text style={[A.heroTitle, { color: colors.text }]}>
              Capture &{" "}
              <Text style={{ fontStyle: "italic", color: T.violetBr }}>Learn</Text>
            </Text>
            <Text style={[A.heroSub, { color: colors.textMuted }]}>
              Upload whiteboard photos, diagrams, or PDFs — AI converts them into structured study notes.
            </Text>
          </View>

          {/* ── Upload source buttons ────────────────────────── */}
          <View style={[A.sourceRow, { marginBottom: sp(2) }]}>
            {Platform.OS !== "web" && (
              <SourceBtn
                icon="camera-alt"
                label="Camera"
                accent={T.emberBr}
                colors={colors}
                onPress={() => pickImages(false)}
              />
            )}
            <SourceBtn icon="photo-library" label="Gallery"  accent={T.tealBr}   colors={colors} onPress={() => pickImages(false)} />
            <SourceBtn icon="description"   label="Files"    accent={T.violetBr} colors={colors} onPress={async () => {
  const allowed = gate();
  if (!allowed) return;
  pickDocuments();
}} />
          </View>

          {/* Web file input */}
          {Platform.OS === "web" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                multiple
                style={{ display: "none" }}
                onChange={handleWebFileUpload}
              />
              <TouchableOpacity
                style={[A.webUploadBtn, { backgroundColor: T.violetMid, shadowColor: T.violet }]}
                onPress={() => {
  const allowed = gate();
  if (!allowed) return;
  fileInputRef.current?.click();
}}
                activeOpacity={0.85}
              >
                <MaterialIcons name="cloud-upload" size={18} color="#fff" />
                <Text style={A.webUploadBtnTxt}>Choose Files from Computer</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Uploaded files list ──────────────────────────── */}
          {uploads.length > 0 && (
            <View style={{ marginBottom: sp(2.5) }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: sp(1.5) }}>
                <Label color={colors.textDim}>— {uploads.length} file{uploads.length !== 1 ? "s" : ""} ready</Label>
                <TouchableOpacity onPress={() => setUploads([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Label color={T.dangerBr}>Clear all</Label>
                </TouchableOpacity>
              </View>
              {uploads.map(item => (
                <View key={item.id} style={{ marginBottom: sp(1.5) }}>
                  <UploadRow item={item} onRemove={removeUpload} colors={colors} />
                </View>
              ))}
            </View>
          )}

          {/* ── Process button ───────────────────────────────── */}
          {uploads.length > 0 && !isProcessing && (
            <TouchableOpacity
              style={[A.processBtn, { backgroundColor: T.violetMid, shadowColor: T.violet }]}
              onPress={canUse ? processUploads : () => gate()}
              activeOpacity={0.88}
              disabled={!canUse}
            >
              <MaterialIcons name="auto-fix-high" size={18} color="#fff" />
              <Text style={A.processBtnTxt}>Generate Notes with AI</Text>
            </TouchableOpacity>
          )}

          {/* ── Processing state ─────────────────────────────── */}
          {isProcessing && (
            <View style={[A.processingCard, { backgroundColor: colors.bgCard, borderColor: T.va(0.28) }]}>
              <Corner pos="top-left"     color={T.violetBr} size={10} />
              <Corner pos="bottom-right" color={T.tealBr}   size={10} />
              <Animated.View style={[A.processingOrb, { backgroundColor: T.va(0.16), borderColor: T.va(0.35), transform: [{ scale: procPulse }] }]}>
                <MaterialIcons name="auto-awesome" size={28} color={T.violetBr} />
              </Animated.View>
              <Label color={T.violetBr} style={{ letterSpacing: 4, marginTop: sp(2.5), marginBottom: sp(1) }}>
                Processing
              </Label>
              <Text style={[A.processingTxt, { color: colors.text }]}>{processingProgress}</Text>
              <Text style={[A.processingSub, { color: colors.textMuted }]}>AI is analysing your content…</Text>
            </View>
          )}

          {/* ── Tips / empty state ───────────────────────────── */}
          {uploads.length === 0 && !isProcessing && (
            <View style={[A.tipsCard, { backgroundColor: T.va(0.07), borderColor: T.va(0.18) }]}>
              <Corner pos="top-right" color={T.violetBr} size={9} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(2) }}>
                <MaterialIcons name="lightbulb" size={16} color={T.goldBr} />
                <Label color={T.goldBr} style={{ letterSpacing: 3 }}>Tips for best results</Label>
              </View>
              {[
                "Take clear, well-lit photos of whiteboards",
                "Ensure text is readable and not blurry",
                "Upload multiple images for comprehensive notes",
                "Works with diagrams, charts, and mind maps",
              ].map((tip, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 7 }}>
                  <View style={[A.tipDot, { backgroundColor: T.violetBr }]} />
                  <Text style={[A.tipTxt, { color: colors.textSub }]}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* ══════════════════════════════════════════════════════
          NOTES PREVIEW MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showNotesPreview} animationType="slide" presentationStyle="pageSheet">
        <View style={[A.modalFull, { backgroundColor: colors.bg }]}>
          {/* Modal header */}
          <View style={[A.modalHead, { borderBottomColor: colors.border, paddingTop: padTop, backgroundColor: colors.bg + "f0" }]}>
            <View style={{ flex: 1 }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— Preview</Label>
              <Text style={[A.modalTitle, { color: colors.text }]}>
                Generated{" "}
                <Text style={{ fontStyle: "italic", color: T.violetBr }}>Notes</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[A.navBadge, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowNotesPreview(false)}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={17} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(16) }}
            showsVerticalScrollIndicator={false}
          >
            {/* Title input */}
            <View style={[A.section, { backgroundColor: colors.bgCard, borderColor: colors.border, marginBottom: sp(2) }]}>
              <Corner pos="top-left" color={T.violetBr} size={9} />
              <Label color={colors.textDim} style={{ marginBottom: sp(1.5) }}>Note Title</Label>
              <TextInput
                style={[A.titleInput, { color: colors.text, backgroundColor: colors.bgInput, borderColor: colors.borderMid }]}
                value={noteTitle}
                onChangeText={setNoteTitle}
                placeholder="Enter note title…"
                placeholderTextColor={colors.textDim}
              />
            </View>

            {/* Notes content */}
            <View style={[A.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Corner pos="top-right"    color={T.tealBr}   size={9} />
              <Corner pos="bottom-left"  color={T.violetBr} size={9} />
              <Label color={colors.textDim} style={{ marginBottom: sp(1.5) }}>Generated Content</Label>
              <ScrollView
                style={[A.notesScroll, { backgroundColor: colors.bgInput, borderColor: colors.borderMid }]}
                nestedScrollEnabled
              >
                <Text style={[A.notesTxt, { color: colors.textSub }]}>{generatedNotes}</Text>
              </ScrollView>
            </View>
          </ScrollView>

          {/* Modal actions */}
          <View style={[A.modalActions, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: padH, paddingBottom: Platform.OS === "ios" ? sp(5) : sp(2.5) }]}>
            <TouchableOpacity
              style={[A.modalBtnSecondary, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowNotesPreview(false)}
              activeOpacity={0.75}
            >
              <Label color={colors.textMuted}>Cancel</Label>
            </TouchableOpacity>
            <TouchableOpacity
              style={[A.modalBtnPrimary, { backgroundColor: T.violetMid, shadowColor: T.violet, flex: 2 }]}
              onPress={() => { setShowNotesPreview(false); saveNotes(generatedNotes, null); }}
              activeOpacity={0.88}
            >
              <MaterialIcons name="save" size={16} color="#fff" />
              <Label color="#fff" style={{ letterSpacing: 3 }}>Save Notes</Label>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MERGE MODAL (bottom sheet)
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={[A.mergeOverlay, { backgroundColor: T.ba(0.65) }]}>
          <View style={[A.mergeSheet, { backgroundColor: colors.bgEl, borderTopColor: colors.borderMid }]}>
            <View style={[A.sheetHandle, { backgroundColor: colors.borderMid }]} />

            <Label color={colors.textDim} style={{ textAlign: "center", marginBottom: sp(1), letterSpacing: 5 }}>— Smart Merge</Label>
            <Text style={[A.mergeTitle, { color: colors.text }]}>
              Similar{" "}
              <Text style={{ fontStyle: "italic", color: T.violetBr }}>Notes Found</Text>
            </Text>
            <Text style={[A.mergeSub, { color: colors.textMuted }]}>
              {matchingNotes.length} existing note{matchingNotes.length !== 1 ? "s" : ""} match your content. Merge or create a new note.
            </Text>

            <FlatList
              data={matchingNotes}
              keyExtractor={item => item.id}
              style={{ maxHeight: 260, marginBottom: sp(2) }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[A.matchRow, { backgroundColor: colors.bgCard, borderColor: T.va(0.2) }]}
                  onPress={() => handleMergeDecision(item.id)}
                  activeOpacity={0.8}
                >
                  <Corner pos="top-left" color={T.violetBr} size={8} />
                  <View style={[A.matchIcon, { backgroundColor: T.va(0.14) }]}>
                    <MaterialIcons name="auto-stories" size={18} color={T.violetBr} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[A.matchTitle, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[A.matchPreview, { color: colors.textMuted }]} numberOfLines={2}>
                      {item.content?.substring(0, 100)}…
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={colors.textDim} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: sp(1.25) }} />}
            />

            <TouchableOpacity
              style={[A.modalBtnPrimary, { backgroundColor: T.teal, shadowColor: T.teal }]}
              onPress={() => { setShowMergeModal(false); setShowNotesPreview(true); }}
              activeOpacity={0.88}
            >
              <MaterialIcons name="add" size={16} color="#fff" />
              <Label color="#fff" style={{ letterSpacing: 3 }}>Create New Note</Label>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
// ════════════════════════════════════════════════════════════════

const A = StyleSheet.create({
  root:           { flex: 1 },

  // Navbar
  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:       { fontFamily: DISPLAY, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  navBadge:       { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  heroTitle:      { fontFamily: DISPLAY, fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  heroSub:        { fontFamily: SANS, fontSize: 13, marginTop: sp(0.75), lineHeight: 20 },

  // Source buttons
  sourceRow:      { flexDirection: "row", gap: sp(1.5) },
  sourceBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 18, borderWidth: 1,
    paddingVertical: sp(2.5),
  },
  sourceBtnIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  // Web upload button
  webUploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.25), borderRadius: 16, padding: sp(2.25), marginBottom: sp(3),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.42, shadowRadius: 12, elevation: 8,
  },
  webUploadBtnTxt:{ fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },

  // Upload row
  uploadRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 18, borderWidth: 1, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  uploadThumb:    { width: 46, height: 46, borderRadius: 11 },
  uploadIconWrap: { width: 46, height: 46, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  uploadName:     { fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  removeBtn:      { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Process button
  processBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.25), borderRadius: 16, padding: sp(2.25), marginBottom: sp(3),
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  processBtnTxt:  { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },

  // Processing card
  processingCard: {
    borderRadius: 22, borderWidth: 1, padding: sp(4),
    alignItems: "center", marginBottom: sp(3),
    position: "relative", overflow: "hidden",
  },
  processingOrb:  { width: 70, height: 70, borderRadius: 35, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  processingTxt:  { fontFamily: SANS, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  processingSub:  { fontFamily: SANS, fontSize: 12, textAlign: "center" },

  // Tips card
  tipsCard:       { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  tipDot:         { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  tipTxt:         { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 20 },

  // Modal — full screen (preview)
  modalFull:      { flex: 1 },
  modalHead: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  modalTitle:     { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  section:        { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  titleInput: {
    fontFamily: SANS, fontSize: 15, fontWeight: "600",
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: sp(2), paddingVertical: sp(1.5),
  },
  notesScroll:    { maxHeight: 380, borderRadius: 12, borderWidth: 1, padding: sp(2) },
  notesTxt:       { fontFamily: SANS, fontSize: 13, lineHeight: 22 },
  modalActions: {
    flexDirection: "row", gap: sp(1.5),
    paddingTop: sp(2), borderTopWidth: 1,
  },
  modalBtnSecondary: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.75),
  },
  modalBtnPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1), borderRadius: 14, paddingVertical: sp(1.75),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },

  // Modal — merge sheet
  mergeOverlay:   { flex: 1, justifyContent: "flex-end" },
  mergeSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, padding: sp(3), paddingBottom: sp(7),
  },
  sheetHandle:    { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: sp(2.5) },
  mergeTitle:     { fontFamily: DISPLAY, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center", marginBottom: 6 },
  mergeSub:       { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: sp(2.5) },
  matchRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 16, borderWidth: 1, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  matchIcon:      { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  matchTitle:     { fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 3 },
  matchPreview:   { fontFamily: SANS, fontSize: 12, lineHeight: 17 },
});