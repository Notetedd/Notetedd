/**
 * src/components/TrialBanner.js — NoteTedd
 *
 * Persistent banner shown at the top of screens during trial.
 * Shows days remaining with urgency color coding.
 * Taps to open paywall.
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
import { useSubscription } from "../context/SubscriptionContext";
import { useTheme } from "../context/ThemeContext";

const sp = (n) => n * 8;

export default function TrialBanner() {
  const { isInTrial, isPremium, trialDaysLeft, trialExpired, setShowPaywall } =
    useSubscription();

  const { theme } = useTheme();
  const dark = theme === "dark";

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when urgent (≤3 days left)
  useEffect(() => {
    if (trialDaysLeft <= 3 && isInTrial) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [trialDaysLeft, isInTrial]);

  // Don't show if premium or trial isn't active and hasn't expired
  if (isPremium) return null;
  if (!isInTrial && !trialExpired) return null;

  // ── Color based on urgency ───────────────────────────────
  const getBannerColor = () => {
    if (trialExpired) return "#ef4444"; // red — expired
    if (trialDaysLeft <= 3) return "#f97316"; // ember — urgent
    if (trialDaysLeft <= 7) return "#f59e0b"; // gold — warning
    return "#6c2fff"; // violet — normal
  };

  const getBannerMessage = () => {
    if (trialExpired) {
      return "Your free trial has ended — upgrade to continue";
    }
    if (trialDaysLeft === 1) return "Last day of your free trial!";
    if (trialDaysLeft <= 3)
      return `Only ${trialDaysLeft} days left in your trial`;
    if (trialDaysLeft <= 7)
      return `${trialDaysLeft} days left in your free trial`;
    return `Free trial — ${trialDaysLeft} days remaining`;
  };

  const bannerColor = getBannerColor();

  return (
    <TouchableOpacity
      onPress={() => setShowPaywall(true)}
      activeOpacity={0.9}
      style={[styles.banner, { backgroundColor: bannerColor }]}
    >
      {/* Left icon */}
      <Animated.View style={{ opacity: pulseAnim }}>
        <MaterialIcons
          name={trialExpired ? "lock" : "hourglass-top"}
          size={14}
          color="#fff"
        />
      </Animated.View>

      {/* Message */}
      <Text style={styles.bannerText} numberOfLines={1}>
        {getBannerMessage()}
      </Text>

      {/* CTA */}
      <View style={styles.upgradePill}>
        <Text style={styles.upgradeText}>Upgrade</Text>
        <MaterialIcons name="arrow-forward" size={10} color={bannerColor} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sp(0.75),
    paddingHorizontal: sp(2),
    gap: sp(1),
  },
  bannerText: {
    flex: 1,
    fontFamily: "SpaceMono-Regular",
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.3,
  },
  upgradePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 3,
  },
  upgradeText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 10,
    fontWeight: "700",
    color: "#6c2fff",
  },
});
