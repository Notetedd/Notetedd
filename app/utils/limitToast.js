/**
 * src/utils/limitToast.js — NoteTedd
 *
 * Shows a styled toast when a user hits a feature limit,
 * then opens the paywall after a short delay.
 * Uses React Native's built-in ToastAndroid on Android
 * and a custom animated overlay on iOS/web.
 */

import { Platform, ToastAndroid } from "react-native";
import { FEATURES, FREE_LIMITS } from "../../RevenueCatConfig";

// ─── Message map per feature ──────────────────────────────────
const LIMIT_MESSAGES = {
  [FEATURES.TRANSCRIPTION]:
    "You've used all 3 transcriptions this week. Upgrade for unlimited.",
  [FEATURES.QUIZ]:
    "You've used all 2 quizzes this week. Upgrade for unlimited.",
  [FEATURES.UPLOAD]:
    "You've used all 3 uploads this week. Upgrade for unlimited.",
  [FEATURES.AUDIO_NOTES]:
    "You've used all 3 audio notes this week. Upgrade for unlimited.",
  [FEATURES.NOTES_ORGANIZE]:
    "You've used all 3 organisations this week. Upgrade for unlimited.",
  [FEATURES.CLASSROOM_SYNC]:
    "Google Classroom Sync is a Premium feature. Upgrade to connect.",
};

/**
 * showLimitToast
 *
 * @param {string}   feature        — one of FEATURES.*
 * @param {Function} openPaywall    — callback to open the paywall
 * @param {number}   delay          — ms before paywall opens (default 1800)
 */
export const showLimitToast = (feature, openPaywall, delay = 1800) => {
  const message = LIMIT_MESSAGES[feature] ?? "Upgrade to NoteTedd Premium for unlimited access.";

  if (Platform.OS === "android") {
    ToastAndroid.showWithGravity(
      message,
      ToastAndroid.LONG,
      ToastAndroid.BOTTOM
    );
  } else {
    // On iOS/web we use Alert as fallback —
    // you can replace this with a custom toast lib later
    // (e.g. react-native-toast-message) without changing any screen code
    const { Alert } = require("react-native");
    Alert.alert(
      "Weekly limit reached",
      message,
      [
        { text: "Maybe later", style: "cancel" },
        { text: "Upgrade Now", onPress: () => openPaywall() },
      ]
    );
    // Return early on iOS — Alert handles the paywall CTA
    return;
  }

  // On Android, auto-open paywall after toast duration
  setTimeout(() => {
    openPaywall();
  }, delay);
};