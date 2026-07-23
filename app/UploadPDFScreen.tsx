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

// ─── API config ────────────────────────────────────────────────
const GROQ_API_KEY    = process.env.EXPO_PUBLIC_GROQ_API_KEY   ?? "";
const GEMINI_API_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GROQ_API_URL    = "https://api.groq.com/openai/v1/chat/completions";

// Gemini endpoints — Flash is primary (fast + cheap), Pro is fallback for heavy docs
const GEMINI_FLASH_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_PRO_ENDPOINT   = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";

// ════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM — unchanged from original
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
//  HELPERS — document structure detection
// ════════════════════════════════════════════════════════════════

/**
 * Determines what kind of academic document this is based on name + AI-returned
 * content so we can pick the right note format.
 *
 * Returns one of: 'lecture' | 'exam_past_paper' | 'textbook_chapter' |
 *                 'lab_report' | 'case_study' | 'research_paper' | 'general'
 */
const detectDocumentType = (filename = "", contentSample = "") => {
  const f = (filename + " " + contentSample).toLowerCase();
  if (/past.?paper|exam.?\d{4}|final.?exam|mid.?term|cat\b|continuous.?assessment/.test(f))
    return "exam_past_paper";
  if (/lab.?report|experiment|apparatus|procedure|hypothesis|results/.test(f))
    return "lab_report";
  if (/case.?study|case.?analysis|scenario/.test(f))
    return "case_study";
  if (/abstract|methodology|references|bibliography|literature.?review/.test(f))
    return "research_paper";
  if (/chapter|textbook|edition|publishers/.test(f))
    return "textbook_chapter";
  if (/lecture|slides?|week\s*\d|topic\s*\d|unit\s*\d/.test(f))
    return "lecture";
  return "general";
};

/**
 * Estimates how detailed the notes should be based on the file size (a rough
 * proxy for content volume on mobile where we can't know page count upfront).
 *
 * Returns: 'brief' | 'standard' | 'comprehensive' | 'deep'
 */
const estimateDepth = (fileSizeBytes) => {
  const kb = fileSizeBytes / 1024;
  if (kb < 200)   return "brief";        // Small image or short doc
  if (kb < 800)   return "standard";     // Typical lecture slide deck (5–20 pages)
  if (kb < 3000)  return "comprehensive"; // Medium PDF (20–60 pages)
  return "deep";                          // Large PDF (60+ pages)
};

/**
 * Builds a tailored system prompt based on detected document type and required
 * depth. This is the engine behind the "dynamic format" requirement.
 */
const buildDocumentPrompt = (filename, docType, depth) => {
  // ── Depth preamble ───────────────────────────────────────────
  const depthInstructions = {
    brief: `
This appears to be a small document. Produce CONCISE notes:
- 1 clear title
- A 2–3 sentence overview
- Key points as a simple numbered list (max 10 items)
- 3 likely exam questions at the end
Do NOT pad with unnecessary sections.`,

    standard: `
Produce WELL-STRUCTURED study notes:
- 1 clear title
- A short overview paragraph (3–5 sentences)
- Main sections with headings and bullet sub-points
- Important definitions clearly marked
- 3–5 exam-style questions at the end`,

    comprehensive: `
This is a substantial document. Produce THOROUGH study notes across multiple
sections. Do NOT truncate or summarise lazily — cover ALL meaningful content:
- Title and course context
- Detailed overview (what this document covers and why it matters)
- Full breakdown by topic/section with sub-points
- Definitions, formulas, and examples from the content
- Connections between topics
- 5–8 exam-style questions ranging from recall to application`,

    deep: `
This is a LARGE document (likely 60+ pages). You MUST produce EXTENSIVE,
multi-section notes. Do NOT produce a one-page summary — that defeats the
purpose. Structure your output as a proper study guide:

REQUIRED structure:
1. TITLE & COURSE CONTEXT
2. DOCUMENT OVERVIEW (half page — what it covers, who it's for, why it matters)
3. SECTION-BY-SECTION BREAKDOWN
   - For each major section/chapter: heading, key ideas, sub-points, examples
   - Include formulas, diagrams described in text, data trends
4. MASTER CONCEPT MAP (bullet tree showing how all topics relate)
5. KEY DEFINITIONS GLOSSARY (term: definition format, alphabetical)
6. FORMULAS & EQUATIONS (if present — clearly formatted)
7. CRITICAL ANALYSIS (what the document argues or concludes)
8. EXAM PREPARATION
   - 10 exam questions from recall to analysis level
   - Answers or answer hints for each
9. FURTHER STUDY SUGGESTIONS

Use clear headings. Be thorough. A student should be able to study for an exam
using ONLY these notes.`,
  }[depth];

  // ── Document-type-specific instructions ──────────────────────
  const typeInstructions = {
    exam_past_paper: `
This is a PAST EXAMINATION PAPER. Format accordingly:
- List every question clearly numbered
- Group by section if sections exist
- For each question: note the marks allocated, the topic it tests, and a
  concise model answer or answer approach
- At the end: list all topics examined, frequency of each, and study priorities`,

    lab_report: `
This is a LAB REPORT or experimental document. Structure as:
- Aim / Hypothesis
- Materials & Apparatus
- Step-by-step Procedure (numbered)
- Results summary (tables described in text, key values)
- Discussion & Analysis points
- Conclusion
- Common exam questions about this type of experiment`,

    case_study: `
This is a CASE STUDY. Structure as:
- Case Overview (who, what, where, when)
- Key Facts & Data Points
- Issues / Problems Identified
- Analysis Framework (SWOT, PESTLE, or relevant theory if detectable)
- Recommendations or Outcomes
- Lessons Learned / Takeaways
- Discussion questions`,

    research_paper: `
This is an ACADEMIC RESEARCH PAPER. Structure as:
- Research Question / Hypothesis
- Methodology Summary
- Key Findings (bullet points)
- Data / Evidence Highlights
- Conclusions & Implications
- Limitations noted
- How to cite or reference this work
- Questions this paper might generate in an exam`,

    textbook_chapter: `
This is a TEXTBOOK CHAPTER. Treat it as core curriculum content:
- Chapter title and number
- Learning objectives (if stated)
- Concept-by-concept breakdown with clear explanations
- All definitions (bold term: explanation)
- All formulas with variable explanations
- Worked examples described
- End-of-chapter summary
- Practice questions`,

    lecture: `
This is LECTURE CONTENT. Format as lecture notes a student would take:
- Lecture title and topic
- Learning outcomes
- Concept flow in the order the lecturer presented them
- Key points per slide/section
- Any examples or case studies mentioned
- "Remember this" callouts for likely exam content
- Quick revision checklist`,

    general: `
Format as clean, well-organised study notes appropriate for the content.
Use headings and sub-points. Prioritise clarity for a university student.`,
  }[docType] || `Format as clean study notes.`;

  return `You are an expert academic note-taking assistant helping Kenyan university students.
The student has uploaded: "${filename}"

CRITICAL FORMATTING RULES — STRICTLY FOLLOW:
- NO asterisks (*) for bold or italic
- NO backticks (\`) 
- NO markdown hash symbols (#) for headings — use plain text headings in CAPS followed by a colon
- NO extra quotes around text
- Use plain text with clear hierarchy: CAPS HEADINGS, indented sub-points
- Separate major sections with a line of dashes (----)
- Numbers and bullet points are fine

DEPTH REQUIRED:
${depthInstructions}

DOCUMENT TYPE SPECIFIC FORMAT:
${typeInstructions}

IMPORTANT: Never truncate. If the content is large, keep going. A student who paid
for premium AI note generation deserves comprehensive output, not a lazy summary.
Write everything.`;
};

// ════════════════════════════════════════════════════════════════
//  ATOMS — unchanged
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

const fileIcon = (type) => {
  if (type?.includes("image"))    return "image";
  if (type?.includes("pdf"))      return "picture-as-pdf";
  if (type?.includes("word") || type?.includes("document")) return "description";
  return "insert-drive-file";
};

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
          {item.size > 3_000_000 && (
            <Pill label="Large file" color={T.goldBr} icon="info" />
          )}
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

// ─── Per-file progress indicator ─────────────────────────────
const FileProgressRow = ({ fileName, status, colors }) => {
  const statusConfig = {
    pending:    { icon: "hourglass-empty", color: colors.textDim,    label: "Waiting" },
    processing: { icon: "sync",            color: T.violetBr,        label: "Processing" },
    done:       { icon: "check-circle",    color: T.successBr,       label: "Done" },
    error:      { icon: "error",           color: T.dangerBr,        label: "Failed" },
  }[status] ?? { icon: "hourglass-empty", color: colors.textDim, label: "Waiting" };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(1) }}>
      <MaterialIcons name={statusConfig.icon} size={16} color={statusConfig.color} />
      <Text style={{ fontFamily: SANS, fontSize: 12, color: statusConfig.color, flex: 1 }} numberOfLines={1}>
        {fileName}
      </Text>
      <Label color={statusConfig.color}>{statusConfig.label}</Label>
    </View>
  );
};

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

  // ── State ─────────────────────────────────────────────────────
  const [uploads,            setUploads]            = useState([]);
  const [isProcessing,       setIsProcessing]       = useState(false);
  const [generatedNotes,     setGeneratedNotes]     = useState(null);
  const [showMergeModal,     setShowMergeModal]     = useState(false);
  const [showNotesPreview,   setShowNotesPreview]   = useState(false);
  const [matchingNotes,      setMatchingNotes]      = useState([]);
  const [processingProgress, setProcessingProgress] = useState("");
  const [noteTitle,          setNoteTitle]          = useState("");
  const [editableNotes,      setEditableNotes]      = useState("");   // NEW: editable content
  const [fileStatuses,       setFileStatuses]       = useState({});   // NEW: per-file progress
  const [detectedDocInfo,    setDetectedDocInfo]    = useState(null); // NEW: doc type info

  const fileInputRef = useRef(null);
  const { gate, track, canUse } = useFeatureGate(FEATURES.UPLOAD);

  // ── Animations ────────────────────────────────────────────────
  const masterOpa = useRef(new Animated.Value(0)).current;
  const slideY    = useRef(new Animated.Value(20)).current;
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

  // ── Helper: update a single file's status ────────────────────
  const setFileStatus = (id, status) =>
    setFileStatuses(prev => ({ ...prev, [id]: status }));

  // ════════════════════════════════════════════════════════════
  //  PICK FUNCTIONS — all unchanged in logic
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
    setUploads(prev => [...prev, ...newUploads]);
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
        setUploads(prev => [...prev, ...newUploads]);
      }
    } catch (error) {
      console.error("ImagePicker Error:", error);
      Alert.alert("Error", "Could not open image picker.");
    }
  };

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "image/*",
          "application/*",
        ],
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
          size: file.size || 0,
        }));
        setUploads(prev => [...prev, ...newUploads]);
      }
    } catch (error) {
      console.error("DocumentPicker Error:", error);
      Alert.alert("Error", "Could not open document picker.");
    }
  };

  const removeUpload = (id) => setUploads(uploads.filter((item) => item.id !== id));

  // ════════════════════════════════════════════════════════════
  //  BASE64 CONVERSION — unchanged, reliable
  // ════════════════════════════════════════════════════════════
  const fileToBase64 = async (uri, webFile = null) => {
    try {
      if (Platform.OS === "web") {
        const source = webFile ?? await fetch(uri).then(r => r.blob());
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(source instanceof Blob ? source : webFile);
        });
      }
      // Native path
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        if (base64?.length > 0) return base64;
        throw new Error("Empty base64");
      } catch {
        // Fallback: fetch → blob → FileReader
        const response = await fetch(uri);
        const blob     = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (error) {
      throw new Error(`Could not read file: ${error.message}`);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  FORMAT HELPER — strips markdown formatting artifacts
  // ════════════════════════════════════════════════════════════
  const formatNotesContent = (raw = "") =>
    raw
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[""]([^""]+)["\"]/g, "$1")
      .replace(/^#+\s*/gm, "")          // strip markdown headings
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

  // ════════════════════════════════════════════════════════════
  //  IMAGE ANALYSIS
  //  Priority: Gemini Flash → Groq vision → Gemini Pro
  // ════════════════════════════════════════════════════════════
  const analyzeImage = async (file) => {
    const base64 = await fileToBase64(file.uri, file.webFile);
    if (!base64) throw new Error("Could not convert image to base64");

    let mimeType = file.type;
    if (!mimeType || mimeType === "image") {
      const ext = (file.name ?? "").toLowerCase().split(".").pop();
      mimeType = ({
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif",  webp: "image/webp", heic: "image/heic", heif: "image/heif",
      })[ext] ?? "image/jpeg";
    }

    const depth  = estimateDepth(file.size);
    const docType = detectDocumentType(file.name, "");
    const prompt  = buildDocumentPrompt(file.name, docType, depth);

    // ── 1. Gemini Flash (primary) ──────────────────────────
    if (GEMINI_API_KEY) {
      try {
        console.log("🔵 Gemini Flash — image analysis");
        const res = await fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            }],
            generationConfig: {
              temperature: 0.25, topK: 20, topP: 0.85,
              maxOutputTokens: depth === "deep" ? 8192 : depth === "comprehensive" ? 6144 : 4096,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts
            ?.filter(p => p.text).map(p => p.text).join("\n");
          if (text?.trim()) {
            console.log("✅ Gemini Flash image — success");
            return formatNotesContent(text);
          }
          // Check for safety/recitation blocks
          const finishReason = data.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== "STOP") {
            console.warn("⚠️ Gemini Flash blocked:", finishReason);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn("⚠️ Gemini Flash image HTTP error:", err?.error?.message ?? res.status);
        }
      } catch (e) {
        console.warn("⚠️ Gemini Flash image exception:", e.message);
      }
    }

    // ── 2. Groq vision (first fallback) ───────────────────
    if (GROQ_API_KEY) {
      try {
        console.log("🟡 Groq vision fallback — image analysis");
        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [{
              role: "user",
              content: [
                { type: "text",      text: prompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            }],
            temperature: 0.25,
            max_tokens: 4096,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log("✅ Groq vision — success");
            return formatNotesContent(text);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn("⚠️ Groq vision HTTP error:", err?.error?.message ?? res.status);
        }
      } catch (e) {
        console.warn("⚠️ Groq vision exception:", e.message);
      }
    }

    // ── 3. Gemini Pro (final fallback for images) ──────────
    if (GEMINI_API_KEY) {
      try {
        console.log("🔵 Gemini Pro fallback — image analysis");
        const res = await fetch(`${GEMINI_PRO_ENDPOINT}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            }],
            generationConfig: { temperature: 0.25, maxOutputTokens: 8192 },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts
            ?.filter(p => p.text).map(p => p.text).join("\n");
          if (text?.trim()) {
            console.log("✅ Gemini Pro image — success");
            return formatNotesContent(text);
          }
        }
      } catch (e) {
        console.warn("⚠️ Gemini Pro image exception:", e.message);
      }
    }

    throw new Error("All AI providers failed for this image. Please try again or use a clearer image.");
  };

  // ════════════════════════════════════════════════════════════
  //  DOCUMENT ANALYSIS (PDF / DOCX)
  //
  //  KEY FIX: Gemini natively reads PDF base64. We pass the
  //  actual file bytes, not just the filename. Groq cannot do
  //  this so it is the fallback with a text-only prompt.
  //
  //  For large docs (>3MB / "deep" depth) we chunk the prompt
  //  in two passes with Gemini, then concatenate.
  // ════════════════════════════════════════════════════════════
  const analyzeDocument = async (file) => {
    const depth   = estimateDepth(file.size);
    const docType = detectDocumentType(file.name, "");
    const prompt  = buildDocumentPrompt(file.name, docType, depth);

    console.log(`📄 Document: ${file.name} | type: ${docType} | depth: ${depth} | size: ${(file.size/1024).toFixed(0)}KB`);
    setDetectedDocInfo({ docType, depth });

    const maxTokens = {
      brief:         4096,
      standard:      6144,
      comprehensive: 8192,
      deep:          8192, // Gemini Flash max; we do two passes for "deep"
    }[depth];

    // Convert to base64 once — reused across providers
    let base64 = null;
    let base64Error = null;
    try {
      base64 = await fileToBase64(file.uri, file.webFile);
    } catch (e) {
      base64Error = e.message;
      console.warn("⚠️ Could not read file to base64:", base64Error);
    }

    // Determine real MIME type
    let mimeType = file.type;
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = (file.name ?? "").toLowerCase().split(".").pop();
      mimeType = ({
        pdf:  "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        doc:  "application/msword",
      })[ext] ?? "application/pdf";
    }

    // ── 1. Gemini Flash with actual file bytes (primary) ───
    if (GEMINI_API_KEY && base64) {
      try {
        console.log("🔵 Gemini Flash — document analysis (native PDF/Doc reading)");

        // For "deep" docs: two-pass strategy to maximise coverage
        if (depth === "deep") {
          const pass1Prompt = `${prompt}\n\nPASS 1 OF 2: Cover the FIRST HALF of this document thoroughly.
Start from the beginning and go as deep as possible. End with "--- CONTINUED ---".`;
          const pass2Prompt = `${prompt}\n\nPASS 2 OF 2: Cover the SECOND HALF of this document thoroughly.
Continue from where the previous analysis would have ended. Be just as detailed.`;

          const [pass1Res, pass2Res] = await Promise.allSettled([
            fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: pass1Prompt },
                    { inline_data: { mime_type: mimeType, data: base64 } },
                  ],
                }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
              }),
            }),
            fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: pass2Prompt },
                    { inline_data: { mime_type: mimeType, data: base64 } },
                  ],
                }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
              }),
            }),
          ]);

          let combined = "";
          for (const result of [pass1Res, pass2Res]) {
            if (result.status === "fulfilled" && result.value.ok) {
              const data = await result.value.json();
              const text = data.candidates?.[0]?.content?.parts
                ?.filter(p => p.text).map(p => p.text).join("\n");
              if (text?.trim()) combined += text + "\n\n";
            }
          }
          if (combined.trim()) {
            console.log("✅ Gemini Flash two-pass document — success");
            return formatNotesContent(combined);
          }
        }

        // Single pass for brief/standard/comprehensive
        const res = await fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            }],
            generationConfig: {
              temperature: 0.2, topK: 20, topP: 0.85,
              maxOutputTokens: maxTokens,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts
            ?.filter(p => p.text).map(p => p.text).join("\n");
          if (text?.trim()) {
            console.log("✅ Gemini Flash document — success");
            return formatNotesContent(text);
          }
          const finishReason = data.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== "STOP") {
            console.warn("⚠️ Gemini Flash document blocked:", finishReason);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn("⚠️ Gemini Flash document HTTP error:", err?.error?.message ?? res.status);
        }
      } catch (e) {
        console.warn("⚠️ Gemini Flash document exception:", e.message);
      }
    }

    // ── 2. Gemini Pro with file bytes (second option) ──────
    if (GEMINI_API_KEY && base64) {
      try {
        console.log("🔵 Gemini Pro fallback — document analysis");
        const res = await fetch(`${GEMINI_PRO_ENDPOINT}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts
            ?.filter(p => p.text).map(p => p.text).join("\n");
          if (text?.trim()) {
            console.log("✅ Gemini Pro document — success");
            return formatNotesContent(text);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn("⚠️ Gemini Pro document HTTP error:", err?.error?.message ?? res.status);
        }
      } catch (e) {
        console.warn("⚠️ Gemini Pro document exception:", e.message);
      }
    }

    // ── 3. Groq text-only fallback ─────────────────────────
    // Groq cannot read PDF bytes. We send only the filename + a content-aware
    // prompt. This is a genuine last resort — notes will be generic, so we
    // surface a warning to the user.
    if (GROQ_API_KEY) {
      try {
        console.log("🟡 Groq text-only fallback (file bytes unavailable or Gemini failed)");
        const groqFallbackPrompt = `${prompt}

NOTE: You do not have access to the file's raw content. Generate the best
possible study note template and framework for a document called "${file.name}",
filling in what you can infer from the filename, document type (${docType}),
and common academic content for Kenyan universities. Clearly mark inferred
sections with [INFERRED - verify against your document].`;

        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: groqFallbackPrompt }],
            temperature: 0.3,
            max_tokens: 4096,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log("✅ Groq text-only fallback — success (template mode)");
            // Prepend a clear warning
            return formatNotesContent(
              "⚠️ NOTICE: AI could not read this file's content directly. " +
              "The notes below are a framework based on the document name. " +
              "Please verify against your actual document.\n\n" + text
            );
          }
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn("⚠️ Groq fallback HTTP error:", err?.error?.message ?? res.status);
        }
      } catch (e) {
        console.warn("⚠️ Groq fallback exception:", e.message);
      }
    }

    throw new Error(
      "Could not generate notes for this file. " +
      (base64Error ? `File read error: ${base64Error}. ` : "") +
      "Please check your internet connection and try again."
    );
  };

  // ════════════════════════════════════════════════════════════
  //  MERGE MATCHING — improved with weighted scoring
  // ════════════════════════════════════════════════════════════
  const checkForMatches = async (generatedContent) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];

      const q    = query(collection(db, "recordings"), where("userId", "==", currentUser.uid));
      const snap = await getDocs(q);
      const existingNotes = snap.docs.map(d => ({
        id:      d.id,
        title:   d.data().title || d.data().organizedNotes?.title || "Untitled",
        content: d.data().organizedNotes?.content || d.data().transcription || "",
        ...d.data(),
      }));

      // Extract meaningful academic keywords (>5 chars, not common stopwords)
      const STOPWORDS = new Set(["about","after","again","along","also","another","around",
        "because","before","being","between","during","every","first","found","given",
        "going","group","having","important","include","large","later","learn","might",
        "never","often","other","point","right","should","since","small","still","study",
        "their","there","these","thing","think","those","three","through","under","using",
        "which","while","within","would","could","should"]);

      const keywords = [...new Set(
        generatedContent
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
          .filter(w => w.length > 5 && !STOPWORDS.has(w))
      )];

      if (keywords.length === 0) return [];

      const matches = existingNotes.filter(note => {
        const noteWords = (note.title + " " + note.content).toLowerCase();
        const matchCount = keywords.filter(kw => noteWords.includes(kw)).length;
        // Require 35% keyword overlap — more conservative to avoid false merges
        return matchCount / keywords.length > 0.35;
      });

      return matches;
    } catch (error) {
      console.error("Match check error:", error);
      return [];
    }
  };

  // ════════════════════════════════════════════════════════════
  //  PROCESS UPLOADS
  //  Fix: single gate check at entry, parallel processing,
  //       per-file status tracking
  // ════════════════════════════════════════════════════════════
  const processUploads = async () => {
    if (uploads.length === 0) { Alert.alert("No Files", "Please upload at least one file."); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) { Alert.alert("Sign In Required", "Please sign in to generate notes."); return; }

    // ── Single gate check at entry point ──────────────────
    const allowed = gate();
    if (!allowed) return;

    setIsProcessing(true);
    setFileStatuses(Object.fromEntries(uploads.map(f => [f.id, "pending"])));

    try {
      // Process in parallel with Promise.allSettled for resilience
      setProcessingProgress(`Analysing ${uploads.length} file${uploads.length !== 1 ? "s" : ""}…`);

      const results = await Promise.allSettled(
        uploads.map(async (file) => {
          setFileStatus(file.id, "processing");
          try {
            let notes;
            if (file.type?.includes("image")) {
              notes = await analyzeImage(file);
            } else {
              notes = await analyzeDocument(file);
            }
            setFileStatus(file.id, "done");
            return { file, notes, success: true };
          } catch (err) {
            setFileStatus(file.id, "error");
            return { file, notes: null, success: false, error: err.message };
          }
        })
      );

      const successes = results
        .filter(r => r.status === "fulfilled" && r.value.success)
        .map(r => r.value);
      const failures = results
        .filter(r => r.status === "fulfilled" && !r.value.success || r.status === "rejected")
        .map(r => r.status === "fulfilled" ? r.value : { file: null, error: r.reason?.message });

      if (successes.length === 0) {
        throw new Error("Could not process any of the uploaded files. Please check your internet connection and try again.");
      }

      if (failures.length > 0) {
        const failedNames = failures
          .filter(f => f.file)
          .map(f => f.file.name)
          .join(", ");
        Alert.alert(
          "Some Files Failed",
          `${successes.length} file(s) processed successfully.\nFailed: ${failedNames}`
        );
      }

      // Combine notes from all successful files
      const allNotes = successes.length === 1
        ? successes[0].notes
        : successes.map(({ file, notes }) =>
            `${"═".repeat(55)}\n📄 ${file.name}\n${"═".repeat(55)}\n\n${notes}`
          ).join("\n\n");

      setGeneratedNotes(allNotes);
      setEditableNotes(allNotes);

      // Extract title from first meaningful line
      const firstLine = allNotes
        .split("\n")
        .map(l => l.trim())
        .find(l =>
          l.length > 5 &&
          !l.startsWith("⚠️") &&
          !l.startsWith("═") &&
          !l.startsWith("─") &&
          !l.startsWith("📄")
        ) ?? "";
      setNoteTitle(
        firstLine
          .replace(/^(title:|note:|topic:)\s*/i, "")
          .substring(0, 100)
          .trim() ||
        `AI Notes — ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`
      );

      const matches = await checkForMatches(allNotes);
      if (matches.length > 0) {
        setMatchingNotes(matches);
        setShowMergeModal(true);
      } else {
        setShowNotesPreview(true);
      }
    } catch (error) {
      console.error("Processing error:", error);
      Alert.alert("Processing Failed", error.message || "Failed to process uploads. Please try again.");
    } finally {
      setIsProcessing(false);
      setProcessingProgress("");
    }
  };

  // ════════════════════════════════════════════════════════════
  //  SAVE NOTES
  // ════════════════════════════════════════════════════════════
  const saveNotes = async (content, mergeWithId = null) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { Alert.alert("Error", "Please sign in to save notes."); return; }

      if (mergeWithId) {
        const noteRef      = doc(db, "recordings", mergeWithId);
        const existingNote = matchingNotes.find(n => n.id === mergeWithId);
        const updatedContent = existingNote?.organizedNotes?.content
          ? existingNote.organizedNotes.content +
            "\n\n" + "─".repeat(50) + "\n\n📎 Merged Content\n\n" + content
          : content;

        await updateDoc(noteRef, {
          organizedNotes: {
            title:     existingNote?.organizedNotes?.title || noteTitle,
            content:   updatedContent,
            summary:   content.substring(0, 200) + "…",
            aiProvider: "gemini",
            sections:  [{ title: "Content", content: updatedContent, subtopics: [] }],
            keyPoints: [], definitions: {}, questions: [], calculations: [], relatedTopics: [],
          },
          updatedAt: serverTimestamp(),
        });

        Alert.alert("Merged! 🎉", "Notes merged successfully!", [
          { text: "View Notes", onPress: () => { navigation.navigate("Notes"); resetState(); } },
          { text: "OK",         onPress: resetState },
        ]);
      } else {
        const organizedNotes = {
          title:   noteTitle,
          content,
          summary: content.substring(0, 200) + "…",
          aiProvider: "gemini",
          sections: [{ title: "Content", content, subtopics: [] }],
          keyPoints: content
            .split("\n")
            .filter(l =>
              l.trim().length > 20 &&
              (l.includes("•") || l.includes("-") || /^\d+\./.test(l.trim()))
            )
            .slice(0, 8),
          definitions: {},
          questions: [
            "What are the main topics covered in this content?",
            "What are the key takeaways and concepts?",
            "How does this improve my knowledge in this topic?",
          ],
          calculations: [],
          relatedTopics: [],
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

        Alert.alert("Saved! 🎉", "Your notes are ready to study.", [
          { text: "View Notes",  onPress: () => { navigation.navigate("Notes"); resetState(); } },
          { text: "Upload More", onPress: resetState },
        ]);
      }
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", `Failed to save notes: ${error.message}`);
    }
  };

  const resetState = () => {
    setUploads([]);
    setGeneratedNotes(null);
    setEditableNotes("");
    setShowMergeModal(false);
    setShowNotesPreview(false);
    setMatchingNotes([]);
    setNoteTitle("");
    setFileStatuses({});
    setDetectedDocInfo(null);
  };

  const handleMergeDecision = (noteId) => {
    Alert.alert(
      "Merge Notes",
      "Do you want to merge the generated content with the existing note?",
      [
        { text: "Cancel",     style: "cancel" },
        { text: "Create New", onPress: () => { setShowMergeModal(false); setShowNotesPreview(true); } },
        { text: "Merge",      onPress: () => { setShowMergeModal(false); saveNotes(editableNotes, noteId); } },
      ]
    );
  };

  // ════════════════════════════════════════════════════════════
  //  DEPTH LABEL — shown in the processing card
  // ════════════════════════════════════════════════════════════
  const depthLabel = {
    brief:         "Quick Summary",
    standard:      "Full Notes",
    comprehensive: "Comprehensive Study Guide",
    deep:          "Deep Study Guide (multi-pass)",
  };

  const docTypeLabel = {
    exam_past_paper:  "Past Paper",
    lab_report:       "Lab Report",
    case_study:       "Case Study",
    research_paper:   "Research Paper",
    textbook_chapter: "Textbook Chapter",
    lecture:          "Lecture Notes",
    general:          "Study Notes",
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
            Upload to{" "}
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
          <UsageMeter feature={FEATURES.UPLOAD} style={{ marginBottom: sp(2) }} />

          {/* ── Hero ────────────────────────────────────────── */}
          <View style={{ marginBottom: sp(3.5) }}>
            <Text style={[A.heroTitle, { color: colors.text }]}>
              Capture &{" "}
              <Text style={{ fontStyle: "italic", color: T.violetBr }}>Learn</Text>
            </Text>
            <Text style={[A.heroSub, { color: colors.textMuted }]}>
              Upload whiteboard photos, PDFs, or docs — AI reads the actual content and builds real study notes sized to your material.
            </Text>
          </View>

          {/* ── Upload source buttons ────────────────────────── */}
          <View style={[A.sourceRow, { marginBottom: sp(2) }]}>
            {Platform.OS !== "web" && (
              <SourceBtn icon="camera-alt" label="Camera" accent={T.emberBr} colors={colors} onPress={() => pickImages(true)} />
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
                <Label color={colors.textDim}>
                  — {uploads.length} file{uploads.length !== 1 ? "s" : ""} ready
                </Label>
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
              onPress={processUploads}
              activeOpacity={0.88}
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
                {detectedDocInfo ? docTypeLabel[detectedDocInfo.docType] ?? "Processing" : "Processing"}
              </Label>
              {detectedDocInfo && (
                <Pill
                  label={depthLabel[detectedDocInfo.depth] ?? "Analysing"}
                  color={T.tealBr}
                  style={{ marginBottom: sp(1) }}
                />
              )}
              <Text style={[A.processingTxt, { color: colors.text }]}>{processingProgress}</Text>
              <Text style={[A.processingSub, { color: colors.textMuted }]}>
                AI is reading your content…
              </Text>

              {/* Per-file status list */}
              {uploads.length > 1 && (
                <View style={{ width: "100%", marginTop: sp(2), borderTopWidth: 1, borderTopColor: T.va(0.15), paddingTop: sp(2) }}>
                  {uploads.map(f => (
                    <FileProgressRow
                      key={f.id}
                      fileName={f.name}
                      status={fileStatuses[f.id] ?? "pending"}
                      colors={colors}
                    />
                  ))}
                </View>
              )}
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
                "Take clear, well-lit photos of whiteboards or chalkboards",                
                "Past papers are formatted as Q&A with model answer approaches",
                "Upload multiple files together for one combined set of notes",
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
          NOTES PREVIEW MODAL — now with editable content
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showNotesPreview} animationType="slide" presentationStyle="pageSheet">
        <View style={[A.modalFull, { backgroundColor: colors.bg }]}>
          <View style={[A.modalHead, { borderBottomColor: colors.border, paddingTop: padTop, backgroundColor: colors.bg + "f0" }]}>
            <View style={{ flex: 1 }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— Preview & Edit</Label>
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
            {/* Doc type badge */}
            {detectedDocInfo && (
              <View style={{ flexDirection: "row", gap: sp(1.5), marginBottom: sp(2), flexWrap: "wrap" }}>
                <Pill label={docTypeLabel[detectedDocInfo.docType] ?? "Notes"} color={T.violetBr} icon="auto-awesome" />
                <Pill label={depthLabel[detectedDocInfo.depth] ?? ""}         color={T.tealBr}   />
              </View>
            )}

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

            {/* Notes content — NOW EDITABLE */}
            <View style={[A.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Corner pos="top-right"   color={T.tealBr}   size={9} />
              <Corner pos="bottom-left" color={T.violetBr} size={9} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: sp(1.5) }}>
                <Label color={colors.textDim}>Generated Content</Label>
                <Label color={T.tealBr} style={{ fontSize: 8 }}>Tap to edit</Label>
              </View>
              <TextInput
                style={[A.notesEditInput, {
                  color: colors.textSub,
                  backgroundColor: colors.bgInput,
                  borderColor: colors.borderMid,
                }]}
                value={editableNotes}
                onChangeText={setEditableNotes}
                multiline
                textAlignVertical="top"
                placeholder="Notes will appear here…"
                placeholderTextColor={colors.textDim}
                scrollEnabled
              />
            </View>
          </ScrollView>

          {/* Modal actions */}
          <View style={[A.modalActions, {
            borderTopColor: colors.border, backgroundColor: colors.bg,
            paddingHorizontal: padH,
            paddingBottom: Platform.OS === "ios" ? sp(5) : sp(2.5),
          }]}>
            <TouchableOpacity
              style={[A.modalBtnSecondary, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowNotesPreview(false)}
              activeOpacity={0.75}
            >
              <Label color={colors.textMuted}>Cancel</Label>
            </TouchableOpacity>
            <TouchableOpacity
              style={[A.modalBtnPrimary, { backgroundColor: T.violetMid, shadowColor: T.violet, flex: 2 }]}
              onPress={() => { setShowNotesPreview(false); saveNotes(editableNotes, null); }}
              activeOpacity={0.88}
            >
              <MaterialIcons name="save" size={16} color="#fff" />
              <Label color="#fff" style={{ letterSpacing: 3 }}>Save Notes</Label>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MERGE MODAL
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
  root:     { flex: 1 },
  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:  { fontFamily: DISPLAY, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  navBadge:  { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: DISPLAY, fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  heroSub:   { fontFamily: SANS, fontSize: 13, marginTop: sp(0.75), lineHeight: 20 },
  sourceRow:    { flexDirection: "row", gap: sp(1.5) },
  sourceBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 18, borderWidth: 1, paddingVertical: sp(2.5),
  },
  sourceBtnIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  webUploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.25), borderRadius: 16, padding: sp(2.25), marginBottom: sp(3),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.42, shadowRadius: 12, elevation: 8,
  },
  webUploadBtnTxt: { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },
  uploadRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 18, borderWidth: 1, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  uploadThumb:    { width: 46, height: 46, borderRadius: 11 },
  uploadIconWrap: { width: 46, height: 46, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  uploadName:     { fontFamily: SANS, fontSize: 13, fontWeight: "600" },
  removeBtn:      { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  processBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.25), borderRadius: 16, padding: sp(2.25), marginBottom: sp(3),
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  processBtnTxt: { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },
  processingCard: {
    borderRadius: 22, borderWidth: 1, padding: sp(4),
    alignItems: "center", marginBottom: sp(3),
    position: "relative", overflow: "hidden",
  },
  processingOrb:  { width: 70, height: 70, borderRadius: 35, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  processingTxt:  { fontFamily: SANS, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  processingSub:  { fontFamily: SANS, fontSize: 12, textAlign: "center" },
  tipsCard:       { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  tipDot:         { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  tipTxt:         { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 20 },
  modalFull:      { flex: 1 },
  modalHead: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  modalTitle:  { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  section:     { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  titleInput: {
    fontFamily: SANS, fontSize: 15, fontWeight: "600",
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: sp(2), paddingVertical: sp(1.5),
  },
  // NEW: editable multiline notes field
  notesEditInput: {
    fontFamily: SANS, fontSize: 13, lineHeight: 22,
    borderWidth: 1, borderRadius: 12,
    padding: sp(2),
    minHeight: 360,
    maxHeight: 520,
  },
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
  mergeOverlay: { flex: 1, justifyContent: "flex-end" },
  mergeSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, padding: sp(3), paddingBottom: sp(7),
  },
  sheetHandle:  { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: sp(2.5) },
  mergeTitle:   { fontFamily: DISPLAY, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center", marginBottom: 6 },
  mergeSub:     { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: sp(2.5) },
  matchRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 16, borderWidth: 1, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  matchIcon:    { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  matchTitle:   { fontFamily: SANS, fontSize: 14, fontWeight: "700", marginBottom: 3 },
  matchPreview: { fontFamily: SANS, fontSize: 12, lineHeight: 17 },
});