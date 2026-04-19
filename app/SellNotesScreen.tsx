

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Alert, Modal, ActivityIndicator, ScrollView,
  Animated, StatusBar, Platform, useWindowDimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "./context/ThemeContext";
import BackButton from "../components/Backbutton";
import {
  getFirestore, collection, doc, setDoc, getDoc,
  onSnapshot, updateDoc, deleteDoc, getDocs,
  query, where, orderBy,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ════════════════════════════════════════════════════════════════
//  SECTION 1 — DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════


const P = {
  // ── Brand ─────────────────────────────────────────────────────
  violet:      "#5b21b6",
  violetMid:   "#7c3aed",
  violetBr:    "#a78bfa",
  ink:         "#2e1065",

  ember:       "#ea580c",
  emberBr:     "#fb923c",

  teal:        "#0d9488",
  tealBr:      "#2dd4bf",

  gold:        "#d97706",
  goldBr:      "#fbbf24",

  rose:        "#e11d48",
  roseBr:      "#fb7185",

  success:     "#059669",
  successBr:   "#34d399",

  danger:      "#dc2626",
  dangerBr:    "#f87171",

  // ── Alpha helpers ─────────────────────────────────────────────
  va: (a) => `rgba(91,33,182,${a})`,
  ea: (a) => `rgba(234,88,12,${a})`,
  ta: (a) => `rgba(13,148,136,${a})`,
  ga: (a) => `rgba(217,119,6,${a})`,
  sa: (a) => `rgba(5,150,105,${a})`,
  da: (a) => `rgba(220,38,38,${a})`,
  wa: (a) => `rgba(255,255,255,${a})`,
  ba: (a) => `rgba(0,0,0,${a})`,

  // ── Dark surfaces ─────────────────────────────────────────────
  dark: {
    bg:        "#04040a",
    bgEl:      "#090914",
    bgCard:    "#0d0d1a",
    bgInput:   "#111120",
    bgHover:   "#161628",
    border:    "rgba(255,255,255,0.07)",
    borderMid: "rgba(255,255,255,0.13)",
    text:      "#ede9ff",
    textSub:   "rgba(237,233,255,0.68)",
    textMuted: "rgba(237,233,255,0.40)",
    textDim:   "rgba(237, 233, 255, 0.91)",
    scrim:     "rgba(4,4,10,0.92)",
  },

  // ── Light surfaces ────────────────────────────────────────────
  light: {
    bg:        "#f5f3ff",
    bgEl:      "#ffffff",
    bgCard:    "#ffffff",
    bgInput:   "#ede9ff",
    bgHover:   "#f0ecff",
    border:    "rgba(91,33,182,0.08)",
    borderMid: "rgba(91,33,182,0.18)",
    text:      "#1e1033",
    textSub:   "rgba(30,16,51,0.68)",
    textMuted: "rgba(30,16,51,0.44)",
    textDim:   "rgba(30,16,51,0.25)",
    scrim:     "rgba(245,243,255,0.95)",
  },
};

// I resolve the correct surface palette from the current theme flag.
const useColors = (isDark) => (isDark ? P.dark : P.light);

// I use platform-native typefaces so the app feels at home on every OS.
const DISPLAY = Platform.select({ ios: "Georgia",        default: "serif" });
const SANS    = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const MONO    = Platform.select({ ios: "Menlo",          default: "monospace" });

// I use an 8-point grid throughout.
const sp = (n) => n * 8;

// ════════════════════════════════════════════════════════════════
//  SECTION 2 — ATOMS
//  I define these outside the component so they never re-mount on
//  parent re-renders.
// ════════════════════════════════════════════════════════════════

/** I use Label for all caps-monospace metadata. */
const Label = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 3.5, textTransform: "uppercase", color }, style]}>
    {children}
  </Text>
);

/**
 * I render bracket-style corner marks to give cards an
 * editorial registered aesthetic.
 */
const Corner = ({ pos, color, size = 10 }) => {
  const isTop = pos.includes("top"), isLft = pos.includes("left");
  const base  = { position: "absolute", [isTop ? "top" : "bottom"]: 0, [isLft ? "left" : "right"]: 0 };
  const h = { ...base, width: size,  height: 1.5, backgroundColor: color, opacity: 0.55 };
  const v = { ...base, width: 1.5, height: size,  backgroundColor: color, opacity: 0.55 };
  return (
    <View style={[base, { width: size, height: size }]} pointerEvents="none">
      <View style={h} /><View style={v} />
    </View>
  );
};

/** I use Pill for compact badge labels throughout the screen. */
const Pill = ({ label, color, icon, style }) => (
  <View style={[{
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${color}18`,
    borderWidth: 1, borderColor: `${color}33`,
  }, style]}>
    {icon && <MaterialIcons name={icon} size={10} color={color} />}
    <Label color={color}>{label}</Label>
  </View>
);

/** I use Card as the consistent surface wrapper for every section. */
const Card = ({ children, colors, accent, style }) => (
  <View style={[
    A.card,
    {
      backgroundColor: colors.bgCard,
      borderColor: accent ? `${accent}22` : colors.border,
    },
    style,
  ]}>
    {accent && (
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: accent, opacity: 0.025, borderRadius: 20 }} />
    )}
    {children}
  </View>
);

/**
 * I memoize NoteSelectRow so unchanged rows skip re-render during
 * selection toggles on long lists.
 */
const NoteSelectRow = React.memo(({ item, isSelected, onPress, colors }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, tension: 220 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, tension: 220 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} activeOpacity={1}>
        <View style={[
          A.noteRow,
          {
            backgroundColor: isSelected ? P.va(0.08) : colors.bgCard,
            borderColor:     isSelected ? P.va(0.35)  : colors.border,
          },
        ]}>
          {/* I tint selected rows with a faint violet wash for identity. */}
          {isSelected && (
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: P.violet, opacity: 0.04, borderRadius: 18 }} />
          )}
          <Corner pos="top-left"     color={isSelected ? P.violetBr : colors.borderMid} size={9} />
          <Corner pos="bottom-right" color={isSelected ? P.tealBr   : colors.borderMid} size={9} />

          {/* Checkbox */}
          <View style={[
            A.checkbox,
            {
              backgroundColor: isSelected ? P.violetMid : colors.bgInput,
              borderColor:     isSelected ? P.violetMid : colors.borderMid,
            },
          ]}>
            {isSelected && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={[A.noteRowTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="school" size={11} color={colors.textDim} />
                <Label color={colors.textDim}>{item.subject}</Label>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="format-list-bulleted" size={11} color={colors.textDim} />
                <Label color={colors.textDim}>{item.pages} pts</Label>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="schedule" size={11} color={colors.textDim} />
                <Label color={colors.textDim}>{item.duration}m</Label>
              </View>
            </View>
          </View>

          {/* Price badge */}
          <View style={[A.priceChip, { backgroundColor: P.sa(0.14), borderColor: P.sa(0.28) }]}>
            <Label color={P.successBr}>KES {item.price}</Label>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

/** I render a single received note card in the transfer view. */
const ReceivedNoteRow = ({ item, colors }) => (
  <View style={[A.receivedRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
    <View style={[A.receivedIcon, { backgroundColor: P.va(0.12) }]}>
      <MaterialIcons name="auto-stories" size={18} color={P.violetBr} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[A.receivedTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
      <Text style={[A.receivedSub, { color: colors.textMuted }]}>{item.subject} · {item.duration}m</Text>
    </View>
    <View style={[A.priceChip, { backgroundColor: P.sa(0.14), borderColor: P.sa(0.28) }]}>
      <Label color={P.successBr}>KES {item.price}</Label>
    </View>
  </View>
);

// ════════════════════════════════════════════════════════════════
//  SECTION 3 — MAIN SCREEN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function SellNotesScreen({ navigation }) {
  const { theme, colors: themeColors } = useTheme();
  const isDark  = theme === "dark";
  const colors  = useColors(isDark);

  // I use useWindowDimensions so layout adapts to orientation changes
  // and split-screen mode without a restart.
  const { width: W } = useWindowDimensions();
  const isTablet = W >= 768;
  const padH     = isTablet ? sp(6) : sp(3);
  const padTop   = Platform.OS === "ios" ? sp(7) : sp(5.5);

  // ── Original state — untouched ────────────────────────────────
  const [mode,             setMode]             = useState("selection");
  const [notes,            setNotes]            = useState([]);
  const [selectedNotes,    setSelectedNotes]    = useState([]);
  const [shareCode,        setShareCode]        = useState("");
  const [inputCode,        setInputCode]        = useState("");
  const [loading,          setLoading]          = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [receivedNotes,    setReceivedNotes]    = useState([]);
  const [showPriceModal,   setShowPriceModal]   = useState(false);
  const [totalPrice,       setTotalPrice]       = useState(0);
  const [sessionListener,  setSessionListener]  = useState(null);

  const db   = getFirestore();
  const auth = getAuth();

  // ── Animations ────────────────────────────────────────────────
  const masterOpa  = useRef(new Animated.Value(0)).current;
  const slideY     = useRef(new Animated.Value(18)).current;
  // I use a looping pulse for the "waiting" state orb.
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpa   = useRef(new Animated.Value(0.6)).current;

  // ── Effects ───────────────────────────────────────────────────

  useEffect(() => {
    Animated.parallel([
      Animated.timing(masterOpa, { toValue: 1, duration: 640, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 52, friction: 11, useNativeDriver: true }),
    ]).start();

    fetchUserNotes();

    return () => {
      // I clean up the Firestore listener on unmount.
      if (sessionListener) sessionListener();
    };
  }, []);

  // I start / stop the waiting-state pulse animation based on status.
  useEffect(() => {
    if (connectionStatus === "waiting") {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.18, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseScale, { toValue: 1,    duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpa, { toValue: 1,   duration: 900, useNativeDriver: true }),
            Animated.timing(pulseOpa, { toValue: 0.5, duration: 900, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      pulseScale.stopAnimation();
      pulseOpa.stopAnimation();
      Animated.spring(pulseScale, { toValue: 1,   useNativeDriver: true }).start();
      Animated.spring(pulseOpa,   { toValue: 0.6, useNativeDriver: true }).start();
    }
  }, [connectionStatus]);

  // ════════════════════════════════════════════════════════════
  //  ORIGINAL LOGIC — ALL UNTOUCHED
  // ════════════════════════════════════════════════════════════

  const fetchUserNotes = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "Please sign in to continue");
        setLoading(false);
        return;
      }

      console.log("📚 Fetching recordings for user:", currentUser.uid);

      const recordingsRef = collection(db, "recordings");
      const q = query(recordingsRef, where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log("⚠️ No recordings found");
        setNotes([]);
        setLoading(false);
        return;
      }

      const fetchedNotes = [];
      querySnapshot.forEach((docSnap) => {
        const data      = docSnap.data();
        const createdAt = data.createdAt?.toDate() || new Date();
        if (data.organizedNotes) {
          fetchedNotes.push({
            id:             docSnap.id,
            title:          data.organizedNotes.title || data.title || "Untitled Lecture",
            subject:        data.organizedNotes.subject || "General",
            date:           createdAt.toLocaleDateString(),
            pages:          data.organizedNotes.keyPoints?.length || 0,
            price:          calculateNotePrice(data.organizedNotes),
            duration:       data.duration ? Math.round(data.duration / 60) : 0,
            transcription:  data.transcription || "",
            organizedNotes: data.organizedNotes,
            createdAt,
          });
        }
      });

      console.log(`✅ Loaded ${fetchedNotes.length} notes with organized content`);
      setNotes(fetchedNotes);
    } catch (error) {
      console.error("❌ Error fetching notes:", error);
      Alert.alert("Error", "Failed to load notes: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // I calculate note price from content depth, rounded to nearest 50.
  const calculateNotePrice = (organizedNotes) => {
    let basePrice = 20;
    if (organizedNotes.keyPoints?.length > 0)  basePrice += organizedNotes.keyPoints.length * 10;
    if (organizedNotes.summary?.length > 200)   basePrice += 50;
    if (organizedNotes.examples?.length > 0)    basePrice += organizedNotes.examples.length * 30;
    return Math.round(basePrice / 50) * 50;
  };

  const toggleNoteSelection = (noteId) => {
    setSelectedNotes(prev =>
      prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]
    );
  };

  const calculateTotalPrice = () => {
    const total = notes
      .filter(note => selectedNotes.includes(note.id))
      .reduce((sum, note) => sum + (note.price || 0), 0);
    setTotalPrice(total);
  };

  const generateShareCode = () => {
    if (selectedNotes.length === 0) {
      Alert.alert("No Notes Selected", "Please select at least one note to share.");
      return;
    }
    calculateTotalPrice();
    setShowPriceModal(true);
  };

  const createShareSession = async () => {
    setShowPriceModal(false);
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { Alert.alert("Error", "Please sign in to continue"); return; }

      const code              = Math.random().toString(36).substring(2, 8).toUpperCase();
      const selectedNotesData = notes.filter(note => selectedNotes.includes(note.id));
      const notesToShare      = selectedNotesData.map(note => ({
        id:             note.id,
        title:          note.title,
        subject:        note.subject,
        date:           note.date,
        price:          note.price,
        duration:       note.duration,
        organizedNotes: note.organizedNotes,
        transcription:  note.transcription,
      }));

      console.log("🔐 Creating share session with code:", code);

      const sessionRef = doc(db, "shareSessions", code);
      await setDoc(sessionRef, {
        hostId:      currentUser.uid,
        hostName:    currentUser.displayName || currentUser.email || "Anonymous",
        notes:       notesToShare,
        noteIds:     selectedNotes,
        totalPrice,
        status:      "waiting",
        receiverId:  null,
        createdAt:   new Date(),
        expiresAt:   new Date(Date.now() + 15 * 60 * 1000),
      });

      console.log("✅ Share session created successfully");
      setShareCode(code);
      setMode("share");
      setConnectionStatus("waiting");
      listenForConnection(code);
    } catch (error) {
      console.error("❌ Error creating share session:", error);
      Alert.alert("Error", "Failed to generate share code: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const listenForConnection = (code) => {
    console.log("👂 Listening for connections on code:", code);
    const sessionRef  = doc(db, "shareSessions", code);
    const unsubscribe = onSnapshot(sessionRef, async (docSnapshot) => {
      if (!docSnapshot.exists()) {
        console.log("❌ Session expired or deleted");
        Alert.alert("Session Expired", "This share session has expired.");
        resetScreen();
        return;
      }
      const data = docSnapshot.data();
      console.log("📡 Session status:", data.status);

      if (data.receiverId && data.status === "connected") {
        console.log("✅ Receiver connected!");
        setConnectionStatus("connected");
        setTimeout(async () => {
          setConnectionStatus("transferring");
          console.log("📤 Starting transfer...");
          await updateDoc(sessionRef, { status: "transferring" });
          setTimeout(async () => { await completeTransfer(code, true); }, 2000);
        }, 1000);
      }
    }, error => { console.error("❌ Listener error:", error); });

    setSessionListener(() => unsubscribe);
  };

  const joinSession = async () => {
    if (!inputCode.trim() || inputCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter a valid 6-character code.");
      return;
    }
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { Alert.alert("Error", "Please sign in to continue"); setLoading(false); return; }

      console.log("🔍 Attempting to join session:", inputCode.toUpperCase());
      const sessionRef = doc(db, "shareSessions", inputCode.toUpperCase());
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        Alert.alert("Invalid Code", "Share session not found or has expired.");
        setLoading(false);
        return;
      }

      const sessionData = sessionDoc.data();

      if (new Date() > sessionData.expiresAt.toDate()) {
        Alert.alert("Session Expired", "This share code has expired.");
        await deleteDoc(sessionRef);
        setLoading(false);
        return;
      }

      if (sessionData.hostId === currentUser.uid) {
        Alert.alert("Error", "You cannot receive notes from yourself.");
        setLoading(false);
        return;
      }

      console.log("✅ Valid session found, connecting...");
      await updateDoc(sessionRef, {
        receiverId:   currentUser.uid,
        receiverName: currentUser.displayName || currentUser.email || "Anonymous",
        status:       "connected",
      });

      setReceivedNotes(sessionData.notes);
      setTotalPrice(sessionData.totalPrice);
      setMode("receive");
      setConnectionStatus("connected");

      const unsubscribe = onSnapshot(sessionRef, async (docSnapshot) => {
        if (!docSnapshot.exists()) return;
        const data = docSnapshot.data();
        console.log("📡 Receiver - Session status:", data.status);
        if (data.status === "transferring") setConnectionStatus("transferring");
        else if (data.status === "completed") await completeTransfer(inputCode.toUpperCase(), false);
      });

      setSessionListener(() => unsubscribe);
    } catch (error) {
      console.error("❌ Error joining session:", error);
      Alert.alert("Error", "Failed to join session: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const completeTransfer = async (code, isHost) => {
    try {
      console.log(`📥 Completing transfer... (${isHost ? "Host" : "Receiver"})`);
      const sessionRef = doc(db, "shareSessions", code);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) { console.log("⚠️ Session already deleted"); return; }

      const sessionData = sessionDoc.data();
      const currentUser = auth.currentUser;

      if (!isHost) {
        console.log("💾 Saving received notes to receiver's collection...");
        for (const note of sessionData.notes) {
          const newNoteRef = doc(collection(db, "recordings"));
          await setDoc(newNoteRef, {
            userId:         currentUser.uid,
            title:          note.title,
            transcription:  note.transcription || "",
            organizedNotes: { ...note.organizedNotes, receivedFrom: sessionData.hostName, originalOwnerId: sessionData.hostId },
            duration:       note.duration || 0,
            createdAt:      new Date(),
            receivedAt:     new Date(),
            receivedFrom:   sessionData.hostId,
            paidAmount:     note.price,
            isReceived:     true,
          });
        }
        console.log("✅ Notes saved to receiver's collection");
        await setDoc(doc(collection(db, "transactions")), {
          type:        "note_purchase",
          buyerId:     currentUser.uid,
          buyerName:   currentUser.displayName || currentUser.email,
          sellerId:    sessionData.hostId,
          sellerName:  sessionData.hostName,
          noteIds:     sessionData.noteIds,
          noteCount:   sessionData.notes.length,
          amount:      sessionData.totalPrice,
          timestamp:   new Date(),
        });
      } else {
        console.log("💰 Logging sale transaction for host...");
        await setDoc(doc(collection(db, "transactions")), {
          type:        "note_sale",
          sellerId:    currentUser.uid,
          sellerName:  currentUser.displayName || currentUser.email,
          buyerId:     sessionData.receiverId,
          buyerName:   sessionData.receiverName,
          noteIds:     sessionData.noteIds,
          noteCount:   sessionData.notes.length,
          amount:      sessionData.totalPrice,
          timestamp:   new Date(),
        });
      }

      await updateDoc(sessionRef, { status: "completed" });
      setTimeout(async () => {
        try { await deleteDoc(sessionRef); console.log("🗑️ Session deleted"); }
        catch { console.log("Session already deleted"); }
      }, 3000);

      if (sessionListener) sessionListener();

      console.log("✅ Transfer completed successfully!");
      Alert.alert(
        "Success!",
        isHost
          ? `Notes shared successfully!\n\nYou earned: KES ${totalPrice}\nNotes shared: ${selectedNotes.length}`
          : `${receivedNotes.length} note${receivedNotes.length > 1 ? "s" : ""} received!\n\nTotal paid: KES ${totalPrice}\n\nCheck your Notes screen to view them!`,
        [{ text: "OK", onPress: resetScreen }]
      );
    } catch (error) {
      console.error("❌ Error completing transfer:", error);
      Alert.alert("Error", "Transfer issue: " + error.message);
      resetScreen();
    }
  };

  const resetScreen = () => {
    setMode("selection");
    setSelectedNotes([]);
    setShareCode("");
    setInputCode("");
    setConnectionStatus("idle");
    setReceivedNotes([]);
    setTotalPrice(0);
    if (sessionListener) { sessionListener(); setSessionListener(null); }
    fetchUserNotes();
  };

  const cancelShareSession = async () => {
    if (shareCode) {
      try { await deleteDoc(doc(db, "shareSessions", shareCode)); console.log("❌ Session cancelled by host"); }
      catch (error) { console.error("Error canceling session:", error); }
    }
    resetScreen();
  };

  // I memoize keyExtractor to avoid allocation on every render.
  const keyExtractor        = useCallback(item => item.id, []);
  const keyExtractorReceived = useCallback((item, index) => `${item.id}_${index}`, []);

  // ════════════════════════════════════════════════════════════
  //  COMPUTED VALUES
  // ════════════════════════════════════════════════════════════

  // I derive the live total from the selection array rather than
  // waiting for calculateTotalPrice() — keeps the summary reactive.
  const liveTotal = notes
    .filter(n => selectedNotes.includes(n.id))
    .reduce((sum, n) => sum + (n.price || 0), 0);

  // ════════════════════════════════════════════════════════════
  //  RENDER — LOADING STATE
  // ════════════════════════════════════════════════════════════

  if (loading && notes.length === 0 && mode === "selection") {
    return (
      <View style={[A.root, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
        <Animated.View style={{ opacity: masterOpa, alignItems: "center" }}>
          <View style={[A.loadOrb, { backgroundColor: P.va(0.12), borderColor: P.va(0.25) }]}>
            <MaterialIcons name="share" size={28} color={P.violetBr} />
          </View>
          <Label color={P.violetBr} style={{ marginTop: sp(2.5), marginBottom: sp(1), letterSpacing: 5 }}>
            Loading
          </Label>
          <Text style={[A.loadTitle, { color: colors.text }]}>
            Your{" "}
            <Text style={{ fontStyle: "italic", color: P.violetBr }}>notes</Text>
          </Text>
          <ActivityIndicator color={P.violetBr} style={{ marginTop: sp(3) }} />
        </Animated.View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER — SELECTION MODE
  // ════════════════════════════════════════════════════════════

  if (mode === "selection") {
    return (
      <View style={[A.root, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

        {/* ── Navbar ────────────────────────────────────────── */}
        <View style={[A.navbar, { backgroundColor: colors.scrim, borderBottomColor: colors.border, paddingTop: padTop }]}>
          <BackButton />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Label color={colors.textDim} style={{ marginBottom: 4 }}>— NoteTedd</Label>
            <Text style={[A.navTitle, { color: colors.text }]}>Share Notes</Text>
          </View>
          {/* I show a live selection count badge on the right. */}
          {selectedNotes.length > 0 ? (
            <View style={[A.countBadge, { backgroundColor: P.va(0.18), borderColor: P.va(0.35) }]}>
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: "900", color: P.violetBr }}>
                {selectedNotes.length}
              </Text>
            </View>
          ) : (
            <View style={{ width: 38 }} />
          )}
        </View>

        <Animated.View style={{ opacity: masterOpa, transform: [{ translateY: slideY }], flex: 1 }}>

          {/* ── Hero copy + action buttons ───────────────────── */}
          <View style={{ paddingHorizontal: padH, paddingTop: sp(3) }}>

            <View style={{ marginBottom: sp(3) }}>
              <Text style={[A.heroTitle, { color: colors.text }]}>
                Share &{" "}
                <Text style={{ fontStyle: "italic", color: P.violetBr }}>Earn</Text>
              </Text>
              <Text style={[A.heroSub, { color: colors.textMuted }]}>
                Select lectures to share with classmates
              </Text>
            </View>

            {/* Action buttons row */}
            <View style={A.actionRow}>
              {/* Share (primary) */}
              <TouchableOpacity
                style={[
                  A.actionBtn,
                  {
                    backgroundColor: selectedNotes.length > 0 ? P.violet : colors.bgCard,
                    borderColor:     selectedNotes.length > 0 ? P.va(0.5) : colors.border,
                    shadowColor:     selectedNotes.length > 0 ? P.violet  : "transparent",
                    opacity:         1,
                  },
                ]}
                onPress={generateShareCode}
                activeOpacity={0.85}
              >
                <View style={[A.actionBtnIcon, { backgroundColor: selectedNotes.length > 0 ? P.wa(0.18) : P.va(0.12) }]}>
                  <MaterialIcons name="send" size={17} color={selectedNotes.length > 0 ? "#fff" : P.violetBr} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[A.actionBtnLabel, { color: selectedNotes.length > 0 ? "#fff" : colors.textSub }]}>
                    Share Notes
                  </Text>
                  <Label color={selectedNotes.length > 0 ? P.wa(0.6) : colors.textDim}>
                    {selectedNotes.length > 0 ? `${selectedNotes.length} selected · KES ${liveTotal}` : "select notes below"}
                  </Label>
                </View>
                <MaterialIcons
                  name="chevron-right" size={18}
                  color={selectedNotes.length > 0 ? P.wa(0.7) : colors.textDim}
                />
              </TouchableOpacity>

              {/* Receive (secondary) */}
              <TouchableOpacity
                style={[A.actionBtn, { backgroundColor: colors.bgCard, borderColor: P.ta(0.35) }]}
                onPress={() => setMode("receive")}
                activeOpacity={0.85}
              >
                <View style={[A.actionBtnIcon, { backgroundColor: P.ta(0.14) }]}>
                  <MaterialIcons name="call-received" size={17} color={P.tealBr} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[A.actionBtnLabel, { color: colors.textSub }]}>Receive Notes</Text>
                  <Label color={colors.textDim}>enter a share code</Label>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={colors.textDim} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Note list ────────────────────────────────────── */}
          <FlatList
            data={notes}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => (
              <NoteSelectRow
                item={item}
                isSelected={selectedNotes.includes(item.id)}
                colors={colors}
                onPress={() => toggleNoteSelection(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: sp(1.5) }} />}
            contentContainerStyle={{ paddingHorizontal: padH, paddingTop: sp(2.5), paddingBottom: sp(14) }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              notes.length > 0 ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: sp(2) }}>
                  <Label color={colors.textDim}>— {notes.length} lecture{notes.length !== 1 ? "s" : ""}</Label>
                  {selectedNotes.length > 0 && (
                    <TouchableOpacity onPress={() => setSelectedNotes([])}>
                      <Label color={P.roseBr}>Clear</Label>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={A.emptyBox}>
                <View style={[A.emptyOrb, { borderColor: colors.border }]}>
                  <MaterialIcons name="note-add" size={28} color={colors.textMuted} />
                </View>
                <Text style={[A.emptyTitle, { color: colors.text }]}>No Notes to Share</Text>
                <Text style={[A.emptySub,   { color: colors.textMuted }]}>
                  Record and organise a lecture first, then come back here.
                </Text>
              </View>
            }
          />
        </Animated.View>

        {/* ── Price confirmation modal ─────────────────────── */}
        <Modal visible={showPriceModal} transparent animationType="fade" onRequestClose={() => setShowPriceModal(false)}>
          <View style={[A.modalScrim, { backgroundColor: P.ba(0.72) }]}>
            <View style={[A.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.borderMid }]}>
              <Corner pos="top-left"     color={P.violetBr} size={12} />
              <Corner pos="bottom-right" color={P.tealBr}   size={12} />

              <View style={[A.modalIconWrap, { backgroundColor: P.va(0.14) }]}>
                <MaterialIcons name="local-offer" size={22} color={P.violetBr} />
              </View>

              <Text style={[A.modalTitle, { color: colors.text }]}>Confirm Share</Text>
              <Text style={[A.modalSub, { color: colors.textMuted }]}>
                You're about to share{" "}
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {selectedNotes.length} note{selectedNotes.length > 1 ? "s" : ""}
                </Text>
              </Text>

              {/* Price display */}
              <View style={[A.priceDisplay, { backgroundColor: P.sa(0.08), borderColor: P.sa(0.22) }]}>
                <Label color={colors.textDim} style={{ marginBottom: 8 }}>Total Value</Label>
                <Text style={[A.priceAmount, { color: P.successBr }]}>KES {totalPrice}</Text>
              </View>

              <Text style={[A.modalInfo, { color: colors.textDim }]}>
                The receiver will see this price when they connect.
              </Text>

              <View style={A.modalBtns}>
                <TouchableOpacity
                  style={[A.modalBtnCancel, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
                  onPress={() => setShowPriceModal(false)}
                  activeOpacity={0.75}
                >
                  <Label color={colors.textMuted}>Cancel</Label>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[A.modalBtnConfirm, { backgroundColor: P.violet, shadowColor: P.violet }]}
                  onPress={createShareSession}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="bolt" size={15} color="#fff" />
                  <Label color="#fff">Generate Code</Label>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER — SHARE MODE  (host displaying the code)
  // ════════════════════════════════════════════════════════════

  if (mode === "share") {
    return (
      <View style={[A.root, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

        {/* Cancel button — floating top-left */}
        <TouchableOpacity
          style={[A.floatBtn, { top: padTop, left: padH, backgroundColor: P.da(0.14), borderColor: P.da(0.28) }]}
          onPress={cancelShareSession}
          activeOpacity={0.75}
        >
          <MaterialIcons name="close" size={15} color={P.dangerBr} />
          <Label color={P.dangerBr}>Cancel</Label>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[A.centreScroll, { paddingHorizontal: padH, paddingTop: padTop + sp(8) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Waiting state ─────────────────────────────── */}
          {connectionStatus === "waiting" && (
            <Animated.View style={{ opacity: masterOpa, alignItems: "center", width: "100%" }}>
              <Label color={colors.textDim} style={{ marginBottom: sp(2) }}>— Waiting</Label>
              <Text style={[A.statusTitle, { color: colors.text }]}>
                Share this{" "}
                <Text style={{ fontStyle: "italic", color: P.violetBr }}>code</Text>
              </Text>
              <Text style={[A.statusSub, { color: colors.textMuted }]}>
                The receiver enters it to connect.
              </Text>

              {/* Animated code block */}
              <View style={{ position: "relative", marginVertical: sp(5) }}>
                <Animated.View style={[
                  A.codeGlow,
                  { borderColor: P.va(0.45), transform: [{ scale: pulseScale }], opacity: pulseOpa },
                ]} />
                <View style={[A.codeBlock, { backgroundColor: P.violet, shadowColor: P.violet }]}>
                  <Corner pos="top-left"     color={P.wa(0.3)} size={14} />
                  <Corner pos="top-right"    color={P.wa(0.2)} size={14} />
                  <Corner pos="bottom-left"  color={P.wa(0.2)} size={14} />
                  <Corner pos="bottom-right" color={P.wa(0.3)} size={14} />
                  <Text style={A.codeText}>{shareCode}</Text>
                  <Label color={P.wa(0.45)} style={{ marginTop: sp(1.5) }}>share code</Label>
                </View>
              </View>

              {/* Session summary card */}
              <Card colors={colors} accent={P.violet} style={{ width: "100%", marginBottom: sp(3) }}>
                <Corner pos="top-left" color={P.violetBr} size={9} />
                <View style={{ gap: sp(1.5) }}>
                  {[
                    { icon: "auto-stories",  color: P.violetBr, label: `${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""}` },
                    { icon: "paid",          color: P.successBr,label: `KES ${totalPrice}` },
                    { icon: "timer",         color: P.goldBr,   label: "Expires in 15 min" },
                  ].map(({ icon, color, label }) => (
                    <View key={icon} style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5) }}>
                      <View style={[A.sessionInfoIcon, { backgroundColor: `${color}16` }]}>
                        <MaterialIcons name={icon} size={14} color={color} />
                      </View>
                      <Text style={[A.sessionInfoText, { color: colors.textSub }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <View style={[A.noticeRow, { backgroundColor: P.va(0.08), borderColor: P.va(0.22) }]}>
                <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                  <MaterialIcons name="wifi-tethering" size={16} color={P.violetBr} />
                </Animated.View>
                <Text style={[A.noticeTxt, { color: colors.textSub }]}>
                  Listening for a receiver to connect…
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Connected state ────────────────────────────── */}
          {connectionStatus === "connected" && (
            <View style={{ alignItems: "center", gap: sp(2) }}>
              <View style={[A.statusOrb, { backgroundColor: P.sa(0.14), borderColor: P.sa(0.35) }]}>
                <MaterialIcons name="link" size={30} color={P.successBr} />
              </View>
              <Text style={[A.statusTitle, { color: colors.text }]}>Connected!</Text>
              <Text style={[A.statusSub, { color: colors.textMuted }]}>
                Device connected. Preparing transfer…
              </Text>
              <ActivityIndicator color={P.successBr} style={{ marginTop: sp(1) }} />
            </View>
          )}

          {/* ── Transferring state ─────────────────────────── */}
          {connectionStatus === "transferring" && (
            <View style={{ alignItems: "center", gap: sp(2), width: "100%" }}>
              <View style={[A.statusOrb, { backgroundColor: P.va(0.14), borderColor: P.va(0.35) }]}>
                <MaterialIcons name="upload" size={30} color={P.violetBr} />
              </View>
              <Text style={[A.statusTitle, { color: colors.text }]}>Transferring</Text>
              <Text style={[A.statusSub, { color: colors.textMuted }]}>
                Securely sending {selectedNotes.length} note{selectedNotes.length > 1 ? "s" : ""}…
              </Text>
              {/* Animated progress bar */}
              <View style={[A.progressTrack, { backgroundColor: colors.border, width: "80%" }]}>
                <Animated.View style={[A.progressFill, { backgroundColor: P.violetMid, width: "72%" }]} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER — RECEIVE MODE
  // ════════════════════════════════════════════════════════════

  if (mode === "receive") {

    // ── Enter code view ──────────────────────────────────────
    if (connectionStatus === "idle") {
      return (
        <View style={[A.root, { backgroundColor: colors.bg }]}>
          <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

          {/* Back */}
          <TouchableOpacity
            style={[A.floatBtn, { top: padTop, left: padH, backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={resetScreen}
            activeOpacity={0.75}
          >
            <MaterialIcons name="arrow-back" size={15} color={colors.textSub} />
            <Label color={colors.textMuted}>Back</Label>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={[A.centreScroll, { paddingHorizontal: padH, paddingTop: padTop + sp(8) }]}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={{ opacity: masterOpa, alignItems: "center", width: "100%" }}>
              <View style={[A.statusOrb, { backgroundColor: P.ta(0.14), borderColor: P.ta(0.35), marginBottom: sp(3) }]}>
                <MaterialIcons name="qr-code-scanner" size={30} color={P.tealBr} />
              </View>

              <Label color={colors.textDim} style={{ marginBottom: 10 }}>— Receive Notes</Label>
              <Text style={[A.statusTitle, { color: colors.text }]}>
                Enter the{" "}
                <Text style={{ fontStyle: "italic", color: P.tealBr }}>code</Text>
              </Text>
              <Text style={[A.statusSub, { color: colors.textMuted }]}>
                Ask the sender for their 6-character share code.
              </Text>

              {/* Code input */}
              <View style={[A.codeInputWrap, { backgroundColor: colors.bgCard, borderColor: inputCode.length === 6 ? P.ta(0.45) : colors.borderMid }]}>
                <Corner pos="top-left"     color={P.tealBr}   size={9} />
                <Corner pos="bottom-right" color={P.violetBr} size={9} />
                <TextInput
                  style={[A.codeInput, { color: colors.text }]}
                  placeholder="ABC123"
                  placeholderTextColor={colors.textDim}
                  value={inputCode}
                  onChangeText={t => setInputCode(t.toUpperCase())}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>

              {/* Character dots */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: sp(4) }}>
                {[...Array(6)].map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: i < inputCode.length ? P.tealBr : colors.border,
                    }}
                  />
                ))}
              </View>

              {/* Join button */}
              <TouchableOpacity
                style={[
                  A.joinBtn,
                  {
                    backgroundColor: inputCode.length === 6 && !loading ? P.teal : colors.bgCard,
                    borderColor:     inputCode.length === 6 && !loading ? P.ta(0.5) : colors.border,
                    shadowColor:     inputCode.length === 6 && !loading ? P.teal   : "transparent",
                    opacity: loading ? 0.72 : 1,
                  },
                ]}
                onPress={joinSession}
                disabled={!inputCode || inputCode.length !== 6 || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={inputCode.length === 6 ? "#fff" : P.tealBr} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="login" size={17} color={inputCode.length === 6 ? "#fff" : P.tealBr} />
                    <Text style={[A.joinBtnTxt, { color: inputCode.length === 6 ? "#fff" : P.tealBr }]}>
                      Join Session
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Info notice */}
              <View style={[A.noticeRow, { backgroundColor: P.ta(0.08), borderColor: P.ta(0.2), marginTop: sp(4) }]}>
                <MaterialIcons name="info-outline" size={15} color={P.tealBr} />
                <Text style={[A.noticeTxt, { color: colors.textSub }]}>
                  You'll see the price before the transfer begins.
                </Text>
              </View>
            </Animated.View>
          </ScrollView>
        </View>
      );
    }

    // ── Connected / transferring view ────────────────────────
    return (
      <View style={[A.root, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

        <ScrollView
          contentContainerStyle={[A.centreScroll, { paddingHorizontal: padH, paddingTop: padTop + sp(4) }]}
          showsVerticalScrollIndicator={false}
        >
          {connectionStatus === "connected" && (
            <View style={{ alignItems: "center", gap: sp(2) }}>
              <View style={[A.statusOrb, { backgroundColor: P.sa(0.14), borderColor: P.sa(0.35) }]}>
                <MaterialIcons name="check-circle-outline" size={30} color={P.successBr} />
              </View>
              <Text style={[A.statusTitle, { color: colors.text }]}>Connected!</Text>
              <Text style={[A.statusSub, { color: colors.textMuted }]}>
                Receiving notes from sender…
              </Text>
              <ActivityIndicator color={P.successBr} style={{ marginTop: sp(1) }} />
            </View>
          )}

          {connectionStatus === "transferring" && (
            <View style={{ width: "100%", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginBottom: sp(4) }}>
                <ActivityIndicator size="small" color={P.violetBr} />
                <Label color={P.violetBr} style={{ letterSpacing: 4 }}>Receiving Notes</Label>
              </View>

              {/* Received note list */}
              <FlatList
                data={receivedNotes}
                keyExtractor={keyExtractorReceived}
                renderItem={({ item }) => <ReceivedNoteRow item={item} colors={colors} />}
                ItemSeparatorComponent={() => <View style={{ height: sp(1.5) }} />}
                scrollEnabled={false}
                style={{ width: "100%" }}
                ListFooterComponent={
                  <View style={{ marginTop: sp(2.5) }}>
                    <Card colors={colors} accent={P.success}>
                      <Corner pos="top-right"  color={P.successBr} size={9} />
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View>
                          <Label color={colors.textDim} style={{ marginBottom: 6 }}>Total Amount</Label>
                          <Text style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: "900", color: P.successBr, letterSpacing: -1 }}>
                            KES {totalPrice}
                          </Text>
                        </View>
                        <View style={[A.statusOrb, { width: 50, height: 50, backgroundColor: P.sa(0.12), borderColor: P.sa(0.28) }]}>
                          <MaterialIcons name="paid" size={22} color={P.successBr} />
                        </View>
                      </View>
                    </Card>
                  </View>
                }
              />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return null;
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
//  I keep all StyleSheet entries here so they compile once and
//  hot-reload correctly across the entire file.
// ════════════════════════════════════════════════════════════════

const A = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────
  root:           { flex: 1 },

  // ── Navbar ────────────────────────────────────────────────────
  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: sp(2.5), paddingBottom: sp(1.75),
    borderBottomWidth: 1,
  },
  navTitle:       { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  countBadge: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  // ── Loading ───────────────────────────────────────────────────
  loadOrb:        { width: 70, height: 70, borderRadius: 35, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  loadTitle:      { fontFamily: DISPLAY, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center" },

  // ── Hero ──────────────────────────────────────────────────────
  heroTitle:      { fontFamily: DISPLAY, fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  heroSub:        { fontFamily: SANS, fontSize: 13, marginTop: sp(0.75) },

  // ── Action buttons ────────────────────────────────────────────
  actionRow:      { gap: sp(1.5), marginBottom: sp(3) },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderWidth: 1, borderRadius: 18, padding: sp(2),
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.42, shadowRadius: 14, elevation: 8,
  },
  actionBtnIcon:  { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  actionBtnLabel: { fontFamily: SANS, fontSize: 14, fontWeight: "700" },

  // ── Note selection row ────────────────────────────────────────
  noteRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderWidth: 1, borderRadius: 18, padding: sp(2),
    position: "relative", overflow: "hidden",
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 8,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  noteRowTitle:   { fontFamily: DISPLAY, fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  priceChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1,
  },

  // ── Empty state ───────────────────────────────────────────────
  emptyBox:       { alignItems: "center", paddingVertical: sp(8) },
  emptyOrb:       { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: sp(2.5) },
  emptyTitle:     { fontFamily: DISPLAY, fontSize: 20, fontWeight: "900", marginBottom: 6, letterSpacing: -0.3 },
  emptySub:       { fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: sp(3) },

  // ── Card ──────────────────────────────────────────────────────
  card:           { borderRadius: 20, borderWidth: 1, padding: sp(2.5), position: "relative", overflow: "hidden" },

  // ── Modal ─────────────────────────────────────────────────────
  modalScrim:     { flex: 1, justifyContent: "center", alignItems: "center", padding: sp(3) },
  modalBox: {
    borderRadius: 24, borderWidth: 1,
    padding: sp(3.5), width: "100%", maxWidth: 420,
    alignItems: "center", position: "relative", overflow: "hidden",
  },
  modalIconWrap:  { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: sp(2) },
  modalTitle:     { fontFamily: DISPLAY, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginBottom: sp(0.75) },
  modalSub:       { fontFamily: SANS, fontSize: 14, textAlign: "center", marginBottom: sp(3) },
  priceDisplay: {
    width: "100%", alignItems: "center",
    borderWidth: 1, borderRadius: 16, padding: sp(3),
    marginBottom: sp(2),
  },
  priceAmount:    { fontFamily: DISPLAY, fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  modalInfo:      { fontFamily: SANS, fontSize: 12, textAlign: "center", marginBottom: sp(3), lineHeight: 18 },
  modalBtns:      { flexDirection: "row", gap: sp(1.5), width: "100%" },
  modalBtnCancel: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderRadius: 14, paddingVertical: sp(1.75),
  },
  modalBtnConfirm: {
    flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: sp(1.75),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },

  // ── Share mode code display ───────────────────────────────────
  centreScroll:   { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingBottom: sp(14) },
  codeGlow:       { position: "absolute", width: 180, height: 100, borderRadius: 30, borderWidth: 1.5 },
  codeBlock: {
    borderRadius: 22, paddingHorizontal: sp(6), paddingVertical: sp(3.5),
    alignItems: "center",
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.65, shadowRadius: 28, elevation: 18,
    position: "relative", overflow: "hidden",
  },
  codeText: {
    fontFamily: MONO, fontSize: 52, fontWeight: "900",
    color: "#fff", letterSpacing: 14,
  },
  sessionInfoIcon:{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sessionInfoText:{ fontFamily: SANS, fontSize: 14, fontWeight: "600" },

  // ── Status states (connected / transferring) ──────────────────
  statusTitle:    { fontFamily: DISPLAY, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, textAlign: "center" },
  statusSub:      { fontFamily: SANS, fontSize: 14, textAlign: "center", lineHeight: 22 },
  statusOrb: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  // ── Receive mode — code input ─────────────────────────────────
  codeInputWrap: {
    width: "100%", borderWidth: 1.5, borderRadius: 20,
    paddingVertical: sp(2.5), paddingHorizontal: sp(3),
    marginVertical: sp(4), alignItems: "center",
    position: "relative", overflow: "hidden",
  },
  codeInput: {
    fontFamily: MONO, fontSize: 38, fontWeight: "900",
    letterSpacing: 14, textAlign: "center", width: "100%",
  },

  // ── Join button ───────────────────────────────────────────────
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: sp(1),
    borderWidth: 1, borderRadius: 16,
    paddingVertical: sp(2), paddingHorizontal: sp(5),
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  joinBtnTxt:     { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" },

  // ── Received note row ─────────────────────────────────────────
  receivedRow: {
    flexDirection: "row", alignItems: "center", gap: sp(1.75),
    borderWidth: 1, borderRadius: 16, padding: sp(2),
  },
  receivedIcon:   { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  receivedTitle:  { fontFamily: DISPLAY, fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  receivedSub:    { fontFamily: SANS, fontSize: 12, marginTop: 3 },

  // ── Progress bar ──────────────────────────────────────────────
  progressTrack:  { height: 4, borderRadius: 2, overflow: "hidden", marginTop: sp(2) },
  progressFill:   { height: "100%", borderRadius: 2 },

  // ── Floating back / cancel button ────────────────────────────
  floatBtn: {
    position: "absolute", zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: sp(0.75),
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: sp(1.75), paddingVertical: sp(1),
  },

  // ── Notice row ────────────────────────────────────────────────
  noticeRow: {
    flexDirection: "row", gap: sp(1.5), alignItems: "center",
    borderWidth: 1, borderRadius: 14, padding: sp(2),
    width: "100%",
  },
  noticeTxt:      { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 18 },
});