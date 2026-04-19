
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Modal, FlatList,
  Image, Animated, Platform, StatusBar, useWindowDimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "./context/ThemeContext";
import { useSubscription } from "./context/SubscriptionContext";
import { FEATURES } from "../RevenueCatConfig";
import TrialBanner from "./components/TrialBanner";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import BackButton from "../components/Backbutton";
import { db, auth } from "../firebaseConfig";
import {
  collection, addDoc, serverTimestamp,
  doc, setDoc, getDoc, query, where, getDocs,
} from "firebase/firestore";

// ─── Keys & IDs from env ────────────────────────────────────
const GEMINI_API_KEY   = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID     ?? "";
const GEMINI_ENDPOINT  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Google Classroom OAuth Scopes (unchanged) ────────────────────────────────
const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/classroom.topics.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

WebBrowser.maybeCompleteAuthSession();

// ════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════

const T = {
  bg:        "#04040a",
  bgEl:      "#090914",
  bgCard:    "#0d0d1a",
  bgCardAlt: "#111120",
  bgInput:   "#14142a",
  border:    "rgba(255,255,255,0.07)",
  borderMid: "rgba(255,255,255,0.13)",
  text:      "#ede9ff",
  textSub:   "rgba(237,233,255,0.68)",
  textMuted: "rgba(237, 233, 255, 0.77)",
  textDim:   "rgba(237, 233, 255, 0.81)",
  scrim:     "rgba(4,4,10,0.94)",

  violet:    "#5b21b6", violetMid: "#7c3aed", violetBr: "#a78bfa",
  ember:     "#ea580c", emberBr:   "#fb923c",
  teal:      "#0d9488", tealBr:    "#2dd4bf",
  gold:      "#d97706", goldBr:    "#fbbf24",
  success:   "#059669", successBr: "#34d399",
  danger:    "#dc2626", dangerBr:  "#f87171",
  blue:      "#1d4ed8", blueBr:    "#60a5fa",

  va: (a) => `rgba(91,33,182,${a})`,
  ea: (a) => `rgba(234,88,12,${a})`,
  ta: (a) => `rgba(13,148,136,${a})`,
  sa: (a) => `rgba(5,150,105,${a})`,
  da: (a) => `rgba(220,38,38,${a})`,
  ga: (a) => `rgba(217,119,6,${a})`,
  bla:(a) => `rgba(29,78,216,${a})`,
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

// ── Material type accent colours ──────────────────────────────
const materialAccent = (type) => ({
  assignment:   T.dangerBr,
  announcement: T.blueBr,
  material:     T.successBr,
}[type] || T.violetBr);

const materialIcon = (type) => ({
  assignment:   "assignment",
  announcement: "campaign",
  material:     "article",
}[type] || "description");

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
      <View style={{ ...base, width: size, height: 1.5, backgroundColor: color, opacity: 0.6 }} />
      <View style={{ ...base, width: 1.5, height: size, backgroundColor: color, opacity: 0.6 }} />
    </View>
  );
};

const Pill = ({ label, color, icon, style }) => (
  <View style={[{
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}33`,
  }, style]}>
    {icon && <MaterialIcons name={icon} size={10} color={color} />}
    <Label color={color}>{label}</Label>
  </View>
);

// ─── Course card ──────────────────────────────────────────────
const CourseCard = React.memo(({ course, onPress, colors }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, tension: 220 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, tension: 220 }).start();

  // I pick a deterministic accent colour from the course name hash
  // so each course gets its own colour without extra data.
  const accent = [T.violetBr, T.tealBr, T.emberBr, T.blueBr, T.goldBr][
    Math.abs(course.name?.charCodeAt(0) ?? 0) % 5
  ];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[A.courseCard, { backgroundColor: colors.bgCard, borderColor: `${accent}28` }]}
        onPressIn={onIn} onPressOut={onOut}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <Corner pos="top-left"     color={accent}   size={9} />
        <Corner pos="bottom-right" color={colors.borderMid} size={9} />

        <View style={[A.courseIconWrap, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name="book" size={22} color={accent} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[A.courseName, { color: colors.text }]} numberOfLines={1}>
            {course.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {course.section && <Label color={colors.textMuted}>{course.section}</Label>}
            <Label color={colors.textDim}>
              {course.courseState} {course.descriptionHeading ? `· ${course.descriptionHeading.slice(0, 30)}` : ""}
            </Label>
          </View>
        </View>

        <MaterialIcons name="chevron-right" size={18} color={colors.textDim} />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Material row ──────────────────────────────────────────────
const MaterialRow = React.memo(({ item, isSelected, isImported, onPress, colors }) => {
  const accent  = materialAccent(item.type);
  const scale   = useRef(new Animated.Value(1)).current;
  const onIn    = () => !isImported && Animated.spring(scale, { toValue: 0.978, useNativeDriver: true, tension: 220 }).start();
  const onOut   = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 220 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          A.materialRow,
          { backgroundColor: colors.bgCard, borderColor: colors.border },
          isSelected  && { borderColor: `${T.violetBr}55`, backgroundColor: T.va(0.09) },
          isImported  && { opacity: 0.55, borderColor: `${T.successBr}28` },
        ]}
        onPressIn={onIn} onPressOut={onOut}
        onPress={onPress}
        disabled={isImported}
        activeOpacity={0.88}
      >
        <Corner pos="top-left" color={isImported ? T.successBr : isSelected ? T.violetBr : accent} size={8} />

        {/* Type icon */}
        <View style={[A.matIconWrap, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={materialIcon(item.type)} size={18} color={accent} />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <Text style={[A.matTitle, { color: isImported ? colors.textMuted : colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {isImported && <Pill label="Imported" color={T.successBr} icon="check-circle" />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pill label={item.type} color={accent} />
            {item.materials?.length > 0 && (
              <Label color={colors.textDim}>{item.materials.length} attachment{item.materials.length !== 1 ? "s" : ""}</Label>
            )}
          </View>
          {item.description ? (
            <Text style={[A.matDesc, { color: colors.textMuted }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>

        {/* Checkbox */}
        <View style={{ marginLeft: sp(1.5) }}>
          {isImported ? (
            <MaterialIcons name="check-circle" size={22} color={T.successBr} />
          ) : isSelected ? (
            <View style={[A.checkFill, { backgroundColor: T.violetMid, borderColor: T.violetMid }]}>
              <MaterialIcons name="check" size={13} color="#fff" />
            </View>
          ) : (
            <View style={[A.checkEmpty, { borderColor: colors.borderMid }]} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ════════════════════════════════════════════════════════════════

export default function SyncClassroomScreen({ navigation }) {
  const { theme }  = useTheme();
  const isDark     = theme === "dark";
  const colors     = useC(isDark);

  const { isPremium, isInTrial, setShowPaywall, setPaywallFeature } = useSubscription();
  const hasAccess = isPremium || isInTrial;

  const { width: W } = useWindowDimensions();
  const isTablet    = W >= 768;
  const padH        = isTablet ? sp(6) : sp(3);
  const padTop      = Platform.OS === "ios" ? sp(7) : sp(5.5);

  // ── Original state — all untouched ──────────────────────────
  const [isAuthenticated,     setIsAuthenticated]     = useState(false);
  const [accessToken,         setAccessToken]         = useState(null);
  const [courses,             setCourses]             = useState([]);
  const [selectedCourse,      setSelectedCourse]      = useState(null);
  const [courseMaterials,     setCourseMaterials]     = useState([]);
  const [selectedMaterials,   setSelectedMaterials]   = useState([]);
  const [isLoading,           setIsLoading]           = useState(false);
  const [isFetching,          setIsFetching]          = useState(false);
  const [showCourseModal,     setShowCourseModal]     = useState(false);
  const [showMaterialsModal,  setShowMaterialsModal]  = useState(false);
  const [processingProgress,  setProcessingProgress]  = useState("");
  const [userEmail,           setUserEmail]           = useState("");
  const [showRedirectInfo,    setShowRedirectInfo]    = useState(false);
  const [importedMaterials,   setImportedMaterials]   = useState(new Set());

  // ── Animations ──────────────────────────────────────────────
  const masterOpa  = useRef(new Animated.Value(0)).current;
  const slideY     = useRef(new Animated.Value(20)).current;
  const fetchPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 640, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 52, friction: 11, useNativeDriver: true }),
    ]).start();
  }, []);

  // I pulse the processing orb while fetching/processing.
  useEffect(() => {
    if (isLoading || isFetching) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fetchPulse, { toValue: 1.14, duration: 800, useNativeDriver: true }),
          Animated.timing(fetchPulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      fetchPulse.stopAnimation();
      Animated.spring(fetchPulse, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [isLoading, isFetching]);

  // ── OAuth setup ──────────────────────────────────────────────
  const discovery = {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint:         "https://oauth2.googleapis.com/token",
  };

  const redirectUri = useMemo(() => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") return `${window.location.origin}/auth`;
      return "https://app.notetedd.com/auth";
    }
    return AuthSession.makeRedirectUri({ scheme: "notetedd", path: "auth" });
  }, []);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: CLASSROOM_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false,
      extraParams: { prompt: "select_account", access_type: "online" },
    },
    discovery
  );

  // ════════════════════════════════════════════════════════════
  //  ORIGINAL LOGIC — ALL UNTOUCHED
  // ════════════════════════════════════════════════════════════

  useEffect(() => { loadSavedAuth(); }, []);

  const loadSavedAuth = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDoc    = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.googleClassroom) {
          setAccessToken(data.googleClassroom.accessToken);
          setUserEmail(data.googleClassroom.email);
          setIsAuthenticated(true);
          fetchCourses(data.googleClassroom.accessToken);
          await loadImportedMaterials(currentUser.uid);
        }
      }
    } catch (error) { console.error("Error loading saved auth:", error); }
  };

  const loadImportedMaterials = async (userId) => {
    try {
      const q    = query(collection(db, "recordings"), where("userId", "==", userId), where("source", "==", "google_classroom"));
      const snap = await getDocs(q);
      const imported = new Set();
      snap.forEach((d) => { if (d.data().classroomMaterialId) imported.add(d.data().classroomMaterialId); });
      setImportedMaterials(imported);
      console.log(`📚 Loaded ${imported.size} previously imported materials`);
    } catch (error) { console.error("Error loading imported materials:", error); }
  };

  const saveAuthToFirebase = async (token, email) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      await setDoc(doc(db, "users", currentUser.uid), {
        googleClassroom: { accessToken: token, email, connectedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("✅ Auth saved to Firebase");
    } catch (error) { console.error("Error saving auth:", error); }
  };

  const removeAuthFromFirebase = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      await setDoc(doc(db, "users", currentUser.uid), { googleClassroom: null, updatedAt: serverTimestamp() }, { merge: true });
      console.log("✅ Auth removed from Firebase");
    } catch (error) { console.error("Error removing auth:", error); }
  };

  useEffect(() => {
    if (response?.type === "success") {
      const { access_token } = response.params;
      if (access_token) {
        setAccessToken(access_token);
        setIsAuthenticated(true);
        fetchUserProfile(access_token).then(email => {
          if (email) {
            saveAuthToFirebase(access_token, email);
            if (auth.currentUser) loadImportedMaterials(auth.currentUser.uid);
          }
        });
        fetchCourses(access_token);
      }
    } else if (response?.type === "error") {
      console.error("Auth error:", response.error);
      Alert.alert("Authentication Error", `Failed to authenticate: ${response.error?.message || "Unknown error"}`, [
        { text: "Show Setup Info", onPress: () => setShowRedirectInfo(true) },
        { text: "OK", style: "cancel" },
      ]);
    }
  }, [response]);

  const fetchUserProfile = async (token) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch user profile");
      const data = await res.json();
      setUserEmail(data.email);
      return data.email;
    } catch (error) { console.error("Error fetching user profile:", error); return null; }
  };

  const fetchCourses = async (token) => {
    setIsLoading(true);
    try {
      const res = await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=50", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Failed to fetch courses"); }
      const data = await res.json();
      const activeCourses = data.courses || [];
      console.log(`📚 Found ${activeCourses.length} active courses`);
      setCourses(activeCourses);
      if (activeCourses.length > 0) setShowCourseModal(true);
      else Alert.alert("No Courses", "No active courses found in your Google Classroom.");
    } catch (error) { console.error("Error fetching courses:", error); Alert.alert("Error", `Failed to fetch courses: ${error.message}`); }
    finally { setIsLoading(false); }
  };

  const fetchCourseMaterials = async (courseId) => {
    setIsFetching(true);
    setProcessingProgress("Fetching course materials...");
    try {
      const materials = [];

      // 1. Announcements
      setProcessingProgress("Fetching announcements...");
      try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/announcements?pageSize=100`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.ok) {
          const d = await res.json();
          const list = (d.announcements || []).map(item => ({ id:`announcement_${item.id}`, originalId:item.id, type:"announcement", title:item.text?.substring(0,100)||"Untitled Announcement", description:item.text||"", createdTime:item.creationTime, materials:item.materials||[] }));
          materials.push(...list);
          console.log(`📢 Found ${list.length} announcements`);
        }
      } catch (e) { console.log("No announcements found:", e.message); }

      // 2. Course Work
      setProcessingProgress("Fetching assignments and coursework...");
      try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=100`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.ok) {
          const d = await res.json();
          const list = (d.courseWork || []).map(item => ({ id:`coursework_${item.id}`, originalId:item.id, type:"assignment", title:item.title||"Untitled Assignment", description:item.description||"", createdTime:item.creationTime, dueDate:item.dueDate, materials:item.materials||[], workType:item.workType }));
          materials.push(...list);
          console.log(`📝 Found ${list.length} coursework items`);
        }
      } catch (e) { console.log("No course work found:", e.message); }

      // 3. Course Work Materials
      setProcessingProgress("Fetching course materials and notes...");
      try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials?pageSize=100`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.ok) {
          const d = await res.json();
          const list = (d.courseWorkMaterial || []).map(item => ({ id:`material_${item.id}`, originalId:item.id, type:"material", title:item.title||"Untitled Material", description:item.description||"", createdTime:item.creationTime, materials:item.materials||[] }));
          materials.push(...list);
          console.log(`📚 Found ${list.length} course materials`);
        }
      } catch (e) { console.log("No materials found:", e.message); }

      // 4. Topics
      setProcessingProgress("Fetching topics...");
      try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/topics?pageSize=100`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.ok) { const d = await res.json(); console.log(`📂 Found ${(d.topic||[]).length} topics`); }
      } catch (e) { console.log("No topics found:", e.message); }

      console.log(`✅ Total materials found: ${materials.length}`);
      materials.sort((a, b) => new Date(b.createdTime||0) - new Date(a.createdTime||0));
      setCourseMaterials(materials);

      if (materials.length > 0) setShowMaterialsModal(true);
      else Alert.alert("No Materials", "No materials found for this course. The teacher may not have posted any content yet.");
    } catch (error) {
      console.error("Error fetching materials:", error);
      Alert.alert("Error", `Failed to fetch course materials: ${error.message}`);
    } finally { setIsFetching(false); setProcessingProgress(""); }
  };

  const handleCourseSelect = (course) => { setSelectedCourse(course); setShowCourseModal(false); fetchCourseMaterials(course.id); };
  const toggleMaterialSelection = (id) => setSelectedMaterials(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAllMaterials  = () => setSelectedMaterials(courseMaterials.filter(m => !importedMaterials.has(m.id)).map(m => m.id));
  const deselectAllMaterials = () => setSelectedMaterials([]);

  const downloadDriveFile = async (fileId, mimeType) => {
    try {
      console.log(`📥 Downloading file: ${fileId} (${mimeType})`);
      let url;
      if      (mimeType.includes("google-apps.document"))     url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      else if (mimeType.includes("google-apps.spreadsheet"))  url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
      else if (mimeType.includes("google-apps.presentation")) url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      else                                                     url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) { console.warn(`⚠️ Failed to download file ${fileId}: ${res.status}`); return null; }
      const content = await res.text();
      console.log(`✅ Downloaded file ${fileId}: ${content.length} characters`);
      return content;
    } catch (error) { console.error(`❌ Error downloading file ${fileId}:`, error); return null; }
  };

  const formatNotesContent = (rawContent) => {
    if (!rawContent) return "";
    return rawContent
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1").replace(/[""]([^""]+)["\"]/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  };

  const processMaterialWithAI = async (material) => {
    try {
      let contentText = `Title: ${material.title}\n\n`;
      if (material.description) contentText += `Description:\n${material.description}\n\n`;

      if (material.materials?.length > 0) {
        setProcessingProgress(`Processing ${material.materials.length} attachment(s) for: ${material.title}`);
        contentText += "Attached Materials:\n\n";
        for (let i = 0; i < material.materials.length; i++) {
          const mat = material.materials[i];
          if (mat.driveFile?.driveFile) {
            const { id: fileId, title: fileTitle, mimeType = "" } = mat.driveFile.driveFile;
            console.log(`📎 Processing attachment ${i+1}/${material.materials.length}: ${fileTitle}`);
            setProcessingProgress(`Reading: ${fileTitle} (${i+1}/${material.materials.length})`);
            const fileContent = await downloadDriveFile(fileId, mimeType);
            contentText += fileContent
              ? `\n--- Content from: ${fileTitle} ---\n${fileContent}\n\n`
              : `\n--- File: ${fileTitle} (${mimeType}) - Could not extract text content ---\n\n`;
          } else if (mat.link)         contentText += `\n--- Link: ${mat.link.title||"Untitled"} ---\nURL: ${mat.link.url}\n\n`;
          else if (mat.youtubeVideo)   contentText += `\n--- Video: ${mat.youtubeVideo.title||"Untitled"} ---\nURL: ${mat.youtubeVideo.alternateLink}\n\n`;
          else if (mat.form)           contentText += `\n--- Form: ${mat.form.title||"Untitled Form"} ---\nURL: ${mat.form.formUrl}\n\n`;
        }
      }

      if (contentText.trim().length < 100) contentText += "\n\nNote: This material appears to have minimal text content.";
      setProcessingProgress(`Generating AI notes for: ${material.title}`);

      const prompt = `You are an expert note-taking assistant. A student has received the following content from their Google Classroom:

${contentText}

IMPORTANT FORMATTING RULES:
- DO NOT use asterisks (*) for formatting
- DO NOT use backticks (\`)
- DO NOT add quotes around text
- Use plain text with clear structure

Create organized study notes with: TITLE, OVERVIEW, MAIN CONTENT, KEY CONCEPTS, IMPORTANT DETAILS, SUMMARY, STUDY TIPS.
Format as clean, readable plain text.`;

      const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }], generationConfig:{ temperature:0.4, topK:40, topP:0.95, maxOutputTokens:8192 } }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Failed to generate notes"); }
      const data = await res.json();
      if (data.candidates?.length > 0) {
        const text = data.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join("\n");
        const formatted = formatNotesContent(text);
        if (formatted.length < 50) throw new Error("Generated notes are too short");
        return formatted;
      }
      throw new Error("No content generated");
    } catch (error) {
      console.error("Error processing material:", error);
      return `${material.title}\n\n${material.description || ""}\n\nNote: AI processing encountered an error. Original content preserved.`;
    }
  };

  const processAndSaveMaterials = async () => {

    if (!hasAccess) {
      setPaywallFeature(FEATURES.CLASSROOM_SYNC);
      setShowPaywall(true);
      return;
    }
    if (selectedMaterials.length === 0) { Alert.alert("No Selection", "Please select at least one material to import."); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) { Alert.alert("Sign In Required", "Please sign in to save notes."); return; }

    setIsFetching(true);
    const toProcess    = courseMaterials.filter(m => selectedMaterials.includes(m.id));
    const newMaterials = toProcess.filter(m => !importedMaterials.has(m.id));

    if (newMaterials.length === 0) {
      setIsFetching(false);
      Alert.alert("Already Imported", "All selected materials have already been imported to your notes.", [{ text: "OK" }]);
      return;
    }

    if (newMaterials.length < toProcess.length) {
      const skipped = toProcess.length - newMaterials.length;
      Alert.alert(
        "Some Materials Skipped",
        `${skipped} material(s) already imported will be skipped. ${newMaterials.length} new material(s) will be imported.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsFetching(false) },
          { text: "Continue", onPress: () => processNewMaterials(newMaterials, currentUser) },
        ]
      );
    } else {
      processNewMaterials(newMaterials, currentUser);
    }
  };

  const processNewMaterials = async (materials, currentUser) => {
    const successfulImports = [], failedImports = [];
    try {
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        setProcessingProgress(`Processing ${i+1} of ${materials.length}: ${material.title}`);
        try {
          const notesContent = await processMaterialWithAI(material);
          if (!notesContent || notesContent.length < 50) throw new Error("Generated content is too short or empty");
          const parsedNotes = parseAIGeneratedNotes(notesContent, material.title);

          await addDoc(collection(db, "recordings"), {
            userId: currentUser.uid,
            title: material.title,
            transcription: notesContent,
            organizedNotes: parsedNotes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            source: "google_classroom",
            classroomCourseId: selectedCourse?.id,
            classroomCourseName: selectedCourse?.name,
            classroomMaterialType: material.type,
            classroomMaterialId: material.id,
            status: "completed",
          });

          setImportedMaterials(prev => new Set([...prev, material.id]));
          successfulImports.push(material.title);
          console.log(`✅ Saved: ${material.title}`);
        } catch (materialError) {
          console.error(`Failed to process ${material.title}:`, materialError);
          failedImports.push(material.title);
        }
      }

      if (successfulImports.length > 0) {
        let message = `${successfulImports.length} material(s) imported successfully!`;
        if (failedImports.length > 0) message += `\n\n${failedImports.length} material(s) failed to import.`;
        Alert.alert(failedImports.length > 0 ? "Partially Complete" : "Success! 🎉", message, [
          { text: "View Notes",   onPress: () => { navigation.navigate("Notesscreen"); resetState(); } },
          { text: "Import More",  onPress: () => { setShowMaterialsModal(false); setShowCourseModal(true); resetState(); } },
        ]);
      } else {
        Alert.alert("Import Failed", "Failed to import any materials. Please try again.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Processing error:", error);
      Alert.alert("Error", `Failed to process materials: ${error.message}`);
    } finally { setIsFetching(false); setProcessingProgress(""); }
  };

  const parseAIGeneratedNotes = (content, title) => ({
    title,
    sections: [{ heading: "Notes", content }],
  });

  const resetState = () => { setSelectedMaterials([]); setCourseMaterials([]); setSelectedCourse(null); };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect from Google Classroom",
      "This will remove your Google Classroom connection. Your imported notes will remain saved. You can reconnect anytime.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: async () => {
          try {
            await removeAuthFromFirebase();
            setIsAuthenticated(false); setAccessToken(null); setCourses([]); setUserEmail(""); setImportedMaterials(new Set()); resetState();
            Alert.alert("Disconnected", "Successfully disconnected from Google Classroom.", [{ text: "OK" }]);
          } catch (error) { console.error("Error disconnecting:", error); Alert.alert("Error", "Failed to disconnect. Please try again."); }
        }},
      ]
    );
  };

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  const isBusy = isLoading || isFetching;

  return (
    <View style={[A.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      {/* ── Navbar ─────────────────────────────────────────── */}
      <View style={[A.navbar, { backgroundColor: colors.bg + "f0", borderBottomColor: colors.border, paddingTop: padTop }]}>
        <BackButton color={T.violetBr} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Label color={colors.textDim} style={{ marginBottom: 4, letterSpacing: 5 }}>— NoteTedd</Label>
          <Text style={[A.navTitle, { color: colors.text }]}>
            Classroom{" "}
            <Text style={{ fontStyle: "italic", color: T.violetBr }}>Sync</Text>
          </Text>
        </View>
        <View style={[A.navBadge, { backgroundColor: T.va(0.12), borderColor: T.va(0.25) }]}>
          <MaterialIcons name="school" size={17} color={T.violetBr} />
        </View>
      </View>

      <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: slideY }], flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(3), paddingBottom: sp(14) }}
        >

                    {/* ── ADD TRIAL BANNER ───────────────────────────────── */}
          <TrialBanner />

          {/* ── PREMIUM GATE OVERLAY ───────────────────────────── */}
          {!hasAccess && (
            <View style={{
              borderRadius: 20, borderWidth: 1,
              borderColor: `${T.violetBr}35`,
              backgroundColor: T.va(0.08),
              padding: sp(3), marginBottom: sp(3),
              alignItems: "center",
              position: "relative", overflow: "hidden",
            }}>
              <Corner pos="top-left"     color={T.violetBr} size={10} />
              <Corner pos="bottom-right" color={T.tealBr}   size={10} />

              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: T.va(0.16), borderWidth: 1, borderColor: T.va(0.35),
                alignItems: "center", justifyContent: "center", marginBottom: sp(2),
              }}>
                <MaterialIcons name="lock" size={28} color={T.violetBr} />
              </View>

              <Label color={T.violetBr} style={{ letterSpacing: 4, marginBottom: sp(1) }}>
                Premium Feature
              </Label>
              <Text style={{
                fontFamily: DISPLAY, fontSize: 22, fontWeight: "900",
                color: colors.text, textAlign: "center",
                letterSpacing: -0.5, marginBottom: sp(1),
              }}>
                Classroom{" "}
                <Text style={{ fontStyle: "italic", color: T.violetBr }}>Sync</Text>
              </Text>
              <Text style={{
                fontFamily: SANS, fontSize: 13, color: colors.textMuted,
                textAlign: "center", lineHeight: 20, marginBottom: sp(3),
                paddingHorizontal: sp(2),
              }}>
                Connect Google Classroom and convert course materials into AI-structured notes — premium only.
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: "row", alignItems: "center", gap: sp(1),
                  backgroundColor: T.violetMid, borderRadius: 14,
                  paddingVertical: sp(1.75), paddingHorizontal: sp(3),
                  shadowColor: T.violet,
                  shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
                }}
                onPress={() => {
                  setPaywallFeature(FEATURES.CLASSROOM_SYNC);
                  setShowPaywall(true);
                }}
                activeOpacity={0.88}
              >
                <MaterialIcons name="star" size={16} color="#fff" />
                <Label color="#fff" style={{ letterSpacing: 3 }}>Unlock Premium</Label>
              </TouchableOpacity>
            </View>
          )}
          {/* ── END PREMIUM GATE ───────────────────────────────── */}
          {/* ── Hero ─────────────────────────────────────────── */}
          <View style={{ marginBottom: sp(3.5) }}>
            <Text style={[A.heroTitle, { color: colors.text }]}>
              Import &{" "}
              <Text style={{ fontStyle: "italic", color: T.violetBr }}>Organise</Text>
            </Text>
            <Text style={[A.heroSub, { color: colors.textMuted }]}>
              Connect Google Classroom and convert course materials into AI-structured study notes.
            </Text>
          </View>

          {/* ── Auth: unauthenticated ─────────────────────────── */}
          {!isAuthenticated ? (
            <>
              <View style={[A.card, { backgroundColor: colors.bgCard, borderColor: colors.border, marginBottom: sp(2) }]}>
                <Corner pos="top-left"     color={T.violetBr} size={9} />
                <Corner pos="bottom-right" color={T.tealBr}   size={9} />

                {/* Feature list */}
                {[
                  { icon: "auto-awesome",   color: T.violetBr, text: "AI-powered note generation" },
                  { icon: "check-circle",   color: T.successBr, text: "Automatic organisation & formatting" },
                  { icon: "lock",           color: T.goldBr,   text: "Read-only access — your data is safe" },
                  { icon: "sync",           color: T.tealBr,   text: "Tracks previously imported materials" },
                ].map(({ icon, color, text }) => (
                  <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(1.5) }}>
                    <View style={[A.featureIconWrap, { backgroundColor: `${color}14` }]}>
                      <MaterialIcons name={icon} size={16} color={color} />
                    </View>
                    <Text style={[A.featureTxt, { color: colors.textSub }]}>{text}</Text>
                  </View>
                ))}

                {/* Connect button */}
                <TouchableOpacity
                  style={[A.connectBtn, { borderColor: colors.borderMid, backgroundColor: colors.bgCardAlt }]}
                  onPress={() => 
                    {
                    if (!hasAccess) {
                      setPaywallFeature(FEATURES.CLASSROOM_SYNC);
                      setShowPaywall(true);
                      return;
                    }
                    promptAsync();
                  }}
                  disabled={!request || isLoading}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: "https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" }}
                    style={{ width: 22, height: 22 }}
                  />
                  <Text style={[A.connectBtnTxt, { color: colors.text }]}>
                    {isLoading ? "Connecting…" : "Connect with Google Classroom"}
                  </Text>
                  {isLoading && <ActivityIndicator size="small" color={T.violetBr} />}
                </TouchableOpacity>

                <View style={[A.privacyRow, { borderTopColor: colors.border }]}>
                  <MaterialIcons name="lock" size={13} color={colors.textDim} />
                  <Text style={[A.privacyTxt, { color: colors.textDim }]}>
                    Read-only access. We never modify your classroom data.
                  </Text>
                </View>
              </View>

              {/* How it works */}
              <View style={[A.howCard, { backgroundColor: T.va(0.07), borderColor: T.va(0.18) }]}>
                <Corner pos="top-right" color={T.violetBr} size={9} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(2) }}>
                  <MaterialIcons name="info" size={14} color={T.goldBr} />
                  <Label color={T.goldBr} style={{ letterSpacing: 3 }}>How it works</Label>
                </View>
                {["Connect your Google account", "Select a course to import", "Choose materials to convert", "AI generates organised notes"].map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(1) }}>
                    <View style={[A.stepNum, { backgroundColor: T.va(0.15), borderColor: T.va(0.3) }]}>
                      <Label color={T.violetBr}>{i + 1}</Label>
                    </View>
                    <Text style={[A.stepTxt, { color: colors.textSub }]}>{step}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            /* ── Auth: connected ───────────────────────────── */
            <>
              {/* Account card */}
              <View style={[A.card, { backgroundColor: colors.bgCard, borderColor: T.va(0.22), marginBottom: sp(2) }]}>
                <Corner pos="top-left"     color={T.violetBr} size={9} />
                <Corner pos="bottom-right" color={T.tealBr}   size={9} />

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.75), flex: 1 }}>
                    <View style={[A.avatarWrap, { backgroundColor: T.va(0.14), borderColor: T.va(0.3) }]}>
                      <MaterialIcons name="account-circle" size={28} color={T.violetBr} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label color={colors.textDim} style={{ marginBottom: 3 }}>Connected as</Label>
                      <Text style={[A.emailTxt, { color: colors.text }]} numberOfLines={1}>{userEmail}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[A.disconnectBtn, { backgroundColor: T.da(0.1), borderColor: T.da(0.28) }]}
                    onPress={handleDisconnect}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons name="logout" size={14} color={T.dangerBr} />
                    <Label color={T.dangerBr} style={{ letterSpacing: 2 }}>Disconnect</Label>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Browse courses button */}
              {courses.length > 0 && (
                <TouchableOpacity
                  style={[A.browseBtn, { backgroundColor: T.violetMid, shadowColor: T.violet }]}
                  onPress={() => setShowCourseModal(true)}
                  activeOpacity={0.88}
                >
                  <MaterialIcons name="library-books" size={17} color="#fff" />
                  <Text style={A.browseBtnTxt}>Browse Courses</Text>
                  <View style={[A.courseBadge, { backgroundColor: T.wa(0.2) }]}>
                    <Label color="#fff" style={{ letterSpacing: 1.5 }}>{courses.length}</Label>
                  </View>
                </TouchableOpacity>
              )}

              {/* Stats card */}
              <View style={[A.statsCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Corner pos="top-right" color={T.goldBr} size={9} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.25), marginBottom: sp(2) }}>
                  <MaterialIcons name="bar-chart" size={14} color={T.goldBr} />
                  <Label color={T.goldBr} style={{ letterSpacing: 3 }}>Quick Stats</Label>
                </View>
                <View style={[A.statsRow, { backgroundColor: T.va(0.06), borderColor: T.va(0.14) }]}>
                  {[
                    { val: courses.length,           label: "Active Courses",  color: T.violetBr  },
                    { val: importedMaterials.size,   label: "Imported",        color: T.successBr },
                    { val: selectedCourse ? "1" : "—", label: "Selected",     color: T.goldBr    },
                  ].map(({ val, label, color }, i, arr) => (
                    <React.Fragment key={label}>
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: "900", color, letterSpacing: -0.5 }}>{val}</Text>
                        <Label color={colors.textDim} style={{ marginTop: 3 }}>{label}</Label>
                      </View>
                      {i < arr.length - 1 && <View style={[A.statDivider, { backgroundColor: colors.border }]} />}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* ── Processing / loading state ──────────────────── */}
          {isBusy && (
            <View style={[A.fetchCard, { backgroundColor: colors.bgCard, borderColor: T.va(0.28) }]}>
              <Corner pos="top-left"     color={T.violetBr} size={10} />
              <Corner pos="bottom-right" color={T.tealBr}   size={10} />
              <Animated.View style={[A.fetchOrb, { backgroundColor: T.va(0.16), borderColor: T.va(0.35), transform: [{ scale: fetchPulse }] }]}>
                <MaterialIcons name="sync" size={26} color={T.violetBr} />
              </Animated.View>
              <Label color={T.violetBr} style={{ letterSpacing: 4, marginTop: sp(2.5), marginBottom: sp(0.75) }}>
                {isLoading ? "Loading" : "Processing"}
              </Label>
              <Text style={[A.fetchTxt, { color: colors.text }]}>{processingProgress || "Please wait…"}</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* ══════════════════════════════════════════════════════
          COURSE SELECTION MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showCourseModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[A.modalFull, { backgroundColor: colors.bg }]}>
          {/* Header */}
          <View style={[A.modalHead, { borderBottomColor: colors.border, paddingTop: padTop, backgroundColor: colors.bg + "f0" }]}>
            <View style={{ flex: 1 }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— Select</Label>
              <Text style={[A.modalTitle, { color: colors.text }]}>
                Your{" "}
                <Text style={{ fontStyle: "italic", color: T.violetBr }}>Courses</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[A.navBadge, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowCourseModal(false)}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={17} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          {/* Course list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(2.5), paddingBottom: sp(10) }}
          >
            <Label color={colors.textDim} style={{ marginBottom: sp(2) }}>
              {courses.length} active course{courses.length !== 1 ? "s" : ""} found
            </Label>
            {courses.map(course => (
              <View key={course.id} style={{ marginBottom: sp(1.5) }}>
                <CourseCard
                  course={course}
                  colors={colors}
                  onPress={() => handleCourseSelect(course)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MATERIALS SELECTION MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showMaterialsModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[A.modalFull, { backgroundColor: colors.bg }]}>
          {/* Header */}
          <View style={[A.modalHead, { borderBottomColor: colors.border, paddingTop: padTop, backgroundColor: colors.bg + "f0" }]}>
            <View style={{ flex: 1 }}>
              <Label color={colors.textDim} style={{ marginBottom: 4 }}>— Select</Label>
              <Text style={[A.modalTitle, { color: colors.text }]}>
                Course{" "}
                <Text style={{ fontStyle: "italic", color: T.violetBr }}>Materials</Text>
              </Text>
              {selectedCourse?.name && (
                <Text style={[A.modalSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {selectedCourse.name}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[A.navBadge, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowMaterialsModal(false)}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={17} color={colors.textSub} />
            </TouchableOpacity>
          </View>

          {/* Selection controls bar */}
          <View style={[A.selectionBar, { backgroundColor: colors.bgCardAlt, borderBottomColor: colors.border }]}>
            <Label color={colors.textMuted}>
              {selectedMaterials.length} of {courseMaterials.length} selected
            </Label>
            <View style={{ flexDirection: "row", gap: sp(1.25) }}>
              <TouchableOpacity
                style={[A.selBtn, { backgroundColor: T.va(0.1), borderColor: T.va(0.28) }]}
                onPress={selectAllMaterials}
                activeOpacity={0.75}
              >
                <Label color={T.violetBr} style={{ letterSpacing: 2 }}>All</Label>
              </TouchableOpacity>
              <TouchableOpacity
                style={[A.selBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                onPress={deselectAllMaterials}
                activeOpacity={0.75}
              >
                <Label color={colors.textMuted} style={{ letterSpacing: 2 }}>Clear</Label>
              </TouchableOpacity>
            </View>
          </View>

          {/* Materials FlatList */}
          <FlatList
            data={courseMaterials}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(2), paddingBottom: sp(14) }}
            ItemSeparatorComponent={() => <View style={{ height: sp(1.5) }} />}
            renderItem={({ item }) => (
              <MaterialRow
                item={item}
                isSelected={selectedMaterials.includes(item.id)}
                isImported={importedMaterials.has(item.id)}
                onPress={() => toggleMaterialSelection(item.id)}
                colors={colors}
              />
            )}
          />

          {/* Modal actions */}
          <View style={[A.modalActions, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: padH, paddingBottom: Platform.OS === "ios" ? sp(5) : sp(2.5) }]}>
            <TouchableOpacity
              style={[A.modalBtnSecondary, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => setShowMaterialsModal(false)}
              activeOpacity={0.75}
            >
              <Label color={colors.textMuted}>Cancel</Label>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                A.modalBtnPrimary,
                { backgroundColor: selectedMaterials.length === 0 ? colors.bgCardAlt : T.violetMid, shadowColor: T.violet, flex: 2 },
              ]}
              onPress={processAndSaveMaterials}
              disabled={selectedMaterials.length === 0 || isFetching}
              activeOpacity={0.88}
            >
              {isFetching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="download" size={16} color={selectedMaterials.length === 0 ? colors.textDim : "#fff"} />
                  <Label
                    color={selectedMaterials.length === 0 ? colors.textDim : "#fff"}
                    style={{ letterSpacing: 2.5 }}
                  >
                    {selectedMaterials.length === 0 ? "Select Materials" : `Import ${selectedMaterials.length}`}
                  </Label>
                </>
              )}
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
  root:             { flex: 1 },

  // Navbar
  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:         { fontFamily: DISPLAY, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  navBadge:         { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  heroTitle:        { fontFamily: DISPLAY, fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  heroSub:          { fontFamily: SANS, fontSize: 13, marginTop: sp(0.75), lineHeight: 20 },

  // Generic card
  card:             { borderRadius: 20, borderWidth: 1, padding: sp(2.5), marginBottom: sp(2.5), position: "relative", overflow: "hidden" },

  // Feature list
  featureIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureTxt:       { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 20 },

  // Connect button
  connectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.5), borderWidth: 1.5, borderRadius: 15,
    paddingVertical: sp(2), marginTop: sp(2.5), marginBottom: sp(1.5),
  },
  connectBtnTxt:    { fontFamily: SANS, fontSize: 14, fontWeight: "700" },

  // Privacy row
  privacyRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingTop: sp(2), borderTopWidth: 1, marginTop: sp(0.5),
  },
  privacyTxt:       { flex: 1, fontFamily: SANS, fontSize: 11, lineHeight: 16 },

  // How it works card
  howCard:          { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  stepNum:          { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepTxt:          { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 20 },

  // Account card
  avatarWrap:       { width: 50, height: 50, borderRadius: 25, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emailTxt:         { fontFamily: SANS, fontSize: 14, fontWeight: "700" },
  disconnectBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1,
  },

  // Browse button
  browseBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: sp(1.25), borderRadius: 16, paddingVertical: sp(2.25), marginBottom: sp(2.5),
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  browseBtnTxt:     { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#fff", fontWeight: "700" },
  courseBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 4 },

  // Stats card
  statsCard:        { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },
  statsRow: {
    flexDirection: "row", justifyContent: "space-around",
    borderRadius: 14, borderWidth: 1,
    paddingVertical: sp(2),
  },
  statDivider:      { width: 1, alignSelf: "stretch" },

  // Processing card
  fetchCard: {
    borderRadius: 22, borderWidth: 1, padding: sp(4),
    alignItems: "center", marginTop: sp(2),
    position: "relative", overflow: "hidden",
  },
  fetchOrb:         { width: 66, height: 66, borderRadius: 33, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fetchTxt:         { fontFamily: SANS, fontSize: 13, fontWeight: "600", textAlign: "center" },

  // Course card
  courseCard: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 18, borderWidth: 1, padding: sp(2.25),
    position: "relative", overflow: "hidden",
  },
  courseIconWrap:   { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  courseName:       { fontFamily: DISPLAY, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },

  // Material row
  materialRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderRadius: 18, borderWidth: 1, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  matIconWrap:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  matTitle:         { fontFamily: SANS, fontSize: 13, fontWeight: "700" },
  matDesc:          { fontFamily: SANS, fontSize: 11, lineHeight: 17, marginTop: 4 },
  checkFill:        { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkEmpty:       { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },

  // Modal — full screen
  modalFull:        { flex: 1 },
  modalHead: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  modalTitle:       { fontFamily: DISPLAY, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  modalSub:         { fontFamily: SANS, fontSize: 12, marginTop: 3 },

  // Selection bar
  selectionBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingVertical: sp(1.5),
    borderBottomWidth: 1,
  },
  selBtn:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },

  // Modal actions
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
});