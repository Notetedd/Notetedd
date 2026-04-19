/**
 * src/components/UsageMeter.js — NoteTedd
 *
 * Reusable usage progress indicator.
 * Shows "X of Y used this week" with a progress bar.
 * Place at the top of any gated screen.
 *
 * Usage:
 *   <UsageMeter feature={FEATURES.TRANSCRIPTION} />
 */

import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FEATURES, FREE_LIMITS } from "../../RevenueCatConfig";
import { useSubscription } from "../context/SubscriptionContext";
import { useTheme } from "../context/ThemeContext";

const sp = (n) => n * 8;

const LIMIT_KEYS = {
  [FEATURES.TRANSCRIPTION]: "transcriptionsPerWeek",
  [FEATURES.QUIZ]: "quizzesPerWeek",
  [FEATURES.UPLOAD]: "uploadsPerWeek",
  [FEATURES.AUDIO_NOTES]: "audioNotesPerWeek",
  [FEATURES.NOTES_ORGANIZE]: "notesOrganizePerWeek",
};

const FEATURE_LABELS = {
  [FEATURES.TRANSCRIPTION]: "Transcriptions",
  [FEATURES.QUIZ]: "Quizzes",
  [FEATURES.UPLOAD]: "Uploads",
  [FEATURES.AUDIO_NOTES]: "Audio Notes",
  [FEATURES.NOTES_ORGANIZE]: "Organisations",
};

export default function UsageMeter({ feature, style }) {
  const { usage, isPremium, isInTrial, setShowPaywall, setPaywallFeature } =
    useSubscription();

  const { theme } = useTheme();
  const dark = theme === "dark";

  const progressAnim = useRef(new Animated.Value(0)).current;

  const limit = FREE_LIMITS[LIMIT_KEYS[feature]] ?? 0;
  const current = usage[feature] ?? 0;
  const ratio = Math.min(current / limit, 1);
  const remaining = Math.max(limit - current, 0);
  const isAtLimit = current >= limit;

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: ratio,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  // Premium users — show unlimited badge instead
  if (isPremium) {
    return (
      <View style={[styles.premiumBadge, style]}>
        <MaterialIcons name="all-inclusive" size={14} color="#0d9488" />
        <Text style={styles.premiumText}>
          Unlimited {FEATURE_LABELS[feature]}
        </Text>
      </View>
    );
  }

  // Trial users — show full access indicator
  if (isInTrial) {
    return (
      <View style={[styles.trialBadge, style]}>
        <MaterialIcons name="stars" size={14} color="#6c2fff" />
        <Text style={styles.trialText}>
          Full trial access · {FEATURE_LABELS[feature]}
        </Text>
      </View>
    );
  }

  // Free users — show meter
  const getBarColor = () => {
    if (isAtLimit) return "#ef4444";
    if (ratio >= 0.66) return "#f97316";
    return "#6c2fff";
  };

  const barColor = getBarColor();

  return (
    <TouchableOpacity
      onPress={() => {
        if (isAtLimit) {
          setPaywallFeature(feature);
          setShowPaywall(true);
        }
      }}
      activeOpacity={isAtLimit ? 0.8 : 1}
      style={[
        styles.container,
        {
          backgroundColor: dark ? "#111118" : "#f0f0ff",
          borderColor: isAtLimit ? "#ef444433" : dark ? "#1e1e2e" : "#e2e2f0",
        },
        style,
      ]}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: dark ? "#e8e8f0" : "#1a1a2e" }]}>
          {FEATURE_LABELS[feature]}
        </Text>
        <Text
          style={[styles.count, { color: isAtLimit ? "#ef4444" : barColor }]}
        >
          {isAtLimit
            ? "Limit reached"
            : `${remaining} of ${limit} left this week`}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        style={[styles.track, { backgroundColor: dark ? "#1e1e2e" : "#ddd" }]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: barColor,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>

      {/* Upgrade nudge when at limit */}
      {isAtLimit && (
        <View style={styles.limitRow}>
          <MaterialIcons name="lock" size={11} color="#ef4444" />
          <Text style={styles.limitText}>
            Tap to upgrade for unlimited access
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    padding: sp(1.5),
    gap: sp(0.75),
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  count: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 10,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  limitText: {
    fontSize: 10,
    color: "#ef4444",
  },

  // Premium / trial badges
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(13,148,136,0.1)",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  premiumText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 11,
    color: "#0d9488",
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(108,47,255,0.08)",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  trialText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 11,
    color: "#6c2fff",
  },
});
