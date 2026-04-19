/**
 
 *
 * Modal paywall that slides up from the bottom.
 * Triggered globally via SubscriptionContext.setShowPaywall(true)
 * Built entirely in NoteTedd design system.
 */

import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import {
  FEATURES,
  PAYWALL_FEATURES,
  PLANS,
  TRIAL_CONFIG,
} from "../../RevenueCatConfig";
import { useSubscription } from "../context/SubscriptionContext";
import { useTheme } from "../context/ThemeContext";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Design tokens (matches your existing system) ─────────────
const COLORS = {
  violet: "#6c2fff",
  violetDeep: "#5b21b6",
  violetGlow: "rgba(108,47,255,0.18)",
  teal: "#0d9488",
  tealGlow: "rgba(13,148,136,0.15)",
  ember: "#f97316",
  gold: "#f59e0b",
  rose: "#fb7185",
  dark: "#0a0a0f",
  darkCard: "#111118",
  darkBorder: "#1e1e2e",
  light: "#f8f8ff",
  lightCard: "#ffffff",
  lightBorder: "#e2e2f0",
  textDark: "#e8e8f0",
  textMuted: "#888899",
};

const sp = (n) => n * 8;

// ─── Corner bracket marks (your signature UI element) ─────────
const CornerMarks = ({ color = COLORS.violet, size = 12 }) => (
  <>
    <View
      style={[
        styles.corner,
        styles.cornerTL,
        { borderColor: color, width: size, height: size },
      ]}
    />
    <View
      style={[
        styles.corner,
        styles.cornerTR,
        { borderColor: color, width: size, height: size },
      ]}
    />
    <View
      style={[
        styles.corner,
        styles.cornerBL,
        { borderColor: color, width: size, height: size },
      ]}
    />
    <View
      style={[
        styles.corner,
        styles.cornerBR,
        { borderColor: color, width: size, height: size },
      ]}
    />
  </>
);

// ─── Feature row ──────────────────────────────────────────────
const FeatureRow = ({ icon, title, free, premium, dark }) => (
  <View
    style={[
      styles.featureRow,
      { borderBottomColor: dark ? COLORS.darkBorder : COLORS.lightBorder },
    ]}
  >
    <View style={styles.featureLeft}>
      <View
        style={[styles.featureIconWrap, { backgroundColor: COLORS.violetGlow }]}
      >
        <MaterialIcons name={icon} size={16} color={COLORS.violet} />
      </View>
      <Text
        style={[
          styles.featureTitle,
          { color: dark ? COLORS.textDark : "#1a1a2e" },
        ]}
      >
        {title}
      </Text>
    </View>
    <View style={styles.featureRight}>
      <Text style={[styles.featureFree, { color: COLORS.textMuted }]}>
        {free}
      </Text>
      <MaterialIcons
        name="arrow-forward"
        size={12}
        color={COLORS.textMuted}
        style={{ marginHorizontal: 4 }}
      />
      <Text style={[styles.featurePremium, { color: COLORS.teal }]}>
        {premium}
      </Text>
    </View>
  </View>
);

// ─── Plan card ────────────────────────────────────────────────
const PlanCard = ({ plan, selected, onSelect, dark }) => {
  const isHighlight = plan.highlight;
  const isSelected = selected === plan.id;

  return (
    <TouchableOpacity
      onPress={() => onSelect(plan.id)}
      activeOpacity={0.85}
      style={[
        styles.planCard,
        {
          borderColor: isSelected
            ? COLORS.violet
            : isHighlight
              ? COLORS.teal
              : dark
                ? COLORS.darkBorder
                : COLORS.lightBorder,
          backgroundColor: isSelected
            ? COLORS.violetGlow
            : isHighlight
              ? COLORS.tealGlow
              : dark
                ? COLORS.darkCard
                : COLORS.lightCard,
          borderWidth: isSelected ? 2 : isHighlight ? 1.5 : 1,
        },
      ]}
    >
      {/* Badge */}
      {plan.badge && (
        <View
          style={[
            styles.planBadge,
            { backgroundColor: isHighlight ? COLORS.teal : COLORS.violetDeep },
          ]}
        >
          <Text style={styles.planBadgeText}>{plan.badge}</Text>
        </View>
      )}

      {/* Corner marks on highlighted */}
      {isHighlight && <CornerMarks color={COLORS.teal} size={8} />}

      <View style={styles.planCardInner}>
        {/* Label */}
        <Text
          style={[
            styles.planLabel,
            {
              color: isSelected
                ? COLORS.violet
                : dark
                  ? COLORS.textDark
                  : "#1a1a2e",
            },
          ]}
        >
          {plan.label}
        </Text>

        {/* Price */}
        <View style={styles.planPriceRow}>
          <Text
            style={[
              styles.planPrice,
              { color: isHighlight ? COLORS.teal : COLORS.violet },
            ]}
          >
            {plan.price}
          </Text>
          <Text style={[styles.planPeriod, { color: COLORS.textMuted }]}>
            /{plan.period}
          </Text>
        </View>

        {/* Per month */}
        <Text style={[styles.planPerMonth, { color: COLORS.textMuted }]}>
          {plan.perMonth}
        </Text>

        {/* Saving badge */}
        {plan.saving && (
          <View
            style={[
              styles.savingBadge,
              { backgroundColor: COLORS.gold + "22" },
            ]}
          >
            <Text style={[styles.savingText, { color: COLORS.gold }]}>
              {plan.saving}
            </Text>
          </View>
        )}
      </View>

      {/* Selected indicator */}
      <View
        style={[
          styles.planSelectDot,
          {
            borderColor: isSelected
              ? COLORS.violet
              : dark
                ? COLORS.darkBorder
                : COLORS.lightBorder,
            backgroundColor: isSelected ? COLORS.violet : "transparent",
          },
        ]}
      >
        {isSelected && <MaterialIcons name="check" size={10} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Paywall ─────────────────────────────────────────────
export default function GlobalPaywall() {
  const {
    showPaywall,
    setShowPaywall,
    paywallFeature,
    offerings,
    purchaseSubscription,
    restorePurchases,
    trialDaysLeft,
    isInTrial,
  } = useSubscription();

  const { theme } = useTheme();
  const dark = theme === "dark";

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [selectedPlan, setSelectedPlan] = useState("notetedd_premium_semester");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // ── Animate in/out ─────────────────────────────────────────
  useEffect(() => {
    if (showPaywall) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.6,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showPaywall]);

  // ── Dismiss ────────────────────────────────────────────────
  const dismiss = () => setShowPaywall(false);

  // ── Get contextual headline based on blocked feature ───────
  const getHeadline = () => {
    switch (paywallFeature) {
      case FEATURES.TRANSCRIPTION:
        return "Transcription limit reached";
      case FEATURES.QUIZ:
        return "Quiz limit reached";
      case FEATURES.UPLOAD:
        return "Upload limit reached";
      case FEATURES.AUDIO_NOTES:
        return "Audio notes limit reached";
      case FEATURES.NOTES_ORGANIZE:
        return "Notes organisation limit reached";
      case FEATURES.CLASSROOM_SYNC:
        return "Classroom Sync is Premium";
      default:
        return "Unlock NoteTedd Premium";
    }
  };

  const getSubheadline = () => {
    if (paywallFeature === FEATURES.CLASSROOM_SYNC) {
      return "Connect your Google Classroom and automatically import course materials.";
    }
    if (isInTrial) {
      return `${trialDaysLeft} days left in your free trial. Upgrade now to keep full access.`;
    }
    return "You've reached your free limit this week. Upgrade for unlimited access.";
  };

  // ── Handle purchase ────────────────────────────────────────
  // const handlePurchase = async () => {
  //   if (!offerings) return;

  //   setLoading(true);
  //   try {
  //     // Find the matching package from RevenueCat offerings
  //     const plan = PLANS.find((p) => p.id === selectedPlan);
  //     const packages = offerings.availablePackages ?? [];
  //     const pkg =
  //       packages.find((p) => p.identifier === plan?.rcIdentifier) ??
  //       packages[0];

  //     if (!pkg) {
  //       // Sandbox / no store account yet — show friendly message
  //       alert(
  //         "Purchases not available in this build. Connect your App Store / Play Store account first.",
  //       );
  //       setLoading(false);
  //       return;
  //     }

  //     await purchaseSubscription(pkg);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handlePurchase = async () => {
  // Debug — remove after fixing
  console.log("[Paywall] offerings:", offerings);
  console.log("[Paywall] selectedPlan:", selectedPlan);

  if (!offerings) {
    alert("Offerings not loaded yet. Please wait a moment and try again.");
    return;
  }

  setLoading(true);
  try {
    const plan = PLANS.find((p) => p.id === selectedPlan);
    const packages = offerings.availablePackages ?? [];

    // Debug — remove after fixing
    console.log("[Paywall] available packages:", packages.map(p => p.identifier));
    console.log("[Paywall] looking for rcIdentifier:", plan?.rcIdentifier);

    const pkg =
      packages.find((p) => p.identifier === plan?.rcIdentifier) ??
      packages[0]; // fallback to first available

    console.log("[Paywall] selected pkg:", pkg?.identifier);

    if (!pkg) {
      alert("No packages available. Make sure products are set up in Google Play Console and RevenueCat dashboard.");
      setLoading(false);
      return;
    }

    await purchaseSubscription(pkg);
  } finally {
    setLoading(false);
  }
};

  // ── Handle restore ─────────────────────────────────────────
  const handleRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    setRestoring(false);
  };

  return (
    <Modal
      visible={showPaywall}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: dark ? COLORS.dark : COLORS.light,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleBar}>
          <View
            style={[
              styles.handle,
              { backgroundColor: dark ? COLORS.darkBorder : "#ccc" },
            ]}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {/* ── Trial Banner ─────────────────────────────── */}
          {isInTrial && trialDaysLeft > 0 && (
            <View
              style={[styles.trialBanner, { backgroundColor: COLORS.violet }]}
            >
              <CornerMarks color="rgba(255,255,255,0.3)" size={10} />
              <MaterialIcons name="hourglass-top" size={16} color="#fff" />
              <Text style={styles.trialBannerText}>
                {trialDaysLeft === 1
                  ? "Last day of your free trial!"
                  : `${trialDaysLeft} days left in your free trial`}
              </Text>
            </View>
          )}

          {/* ── Header ───────────────────────────────────── */}
          <View style={styles.header}>
            {/* Logo mark */}
            <View
              style={[styles.logoMark, { backgroundColor: COLORS.violetGlow }]}
            >
              <CornerMarks color={COLORS.violet} size={5} />
              <Text style={[styles.logoMarkText, { color: COLORS.violet }]}>
                Notetedd
              </Text>
            </View>

            <Text
              style={[
                styles.headline,
                { color: dark ? COLORS.textDark : "#0a0a0f" },
              ]}
            >
              {getHeadline()}
            </Text>
            <Text style={[styles.subheadline, { color: COLORS.textMuted }]}>
              {getSubheadline()}
            </Text>
          </View>

          {/* ── Free trial callout ────────────────────────── */}
          <View
            style={[
              styles.freeTrialBox,
              {
                backgroundColor: dark ? COLORS.darkCard : "#f0f0ff",
                borderColor: COLORS.violet,
              },
            ]}
          >
            <CornerMarks color={COLORS.violet} size={8} />
            <View style={styles.freeTrialInner}>
              <MaterialIcons name="stars" size={20} color={COLORS.gold} />
              <View style={{ flex: 1, marginLeft: sp(1) }}>
                <Text
                  style={[
                    styles.freeTrialTitle,
                    { color: dark ? COLORS.textDark : "#0a0a0f" },
                  ]}
                >
                  {TRIAL_CONFIG.durationDays}-day free trial included
                </Text>
                <Text
                  style={[styles.freeTrialSub, { color: COLORS.textMuted }]}
                >
                  Try all premium features free. Cancel anytime before trial
                  ends.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Plan selector ─────────────────────────────── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
              — CHOOSE YOUR PLAN —
            </Text>
            <View style={styles.plansGrid}>
              {PLANS.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selectedPlan}
                  onSelect={setSelectedPlan}
                  dark={dark}
                />
              ))}
            </View>
          </View>

          {/* ── Feature comparison ────────────────────────── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
              — WHAT YOU UNLOCK —
            </Text>
            <View
              style={[
                styles.featuresCard,
                {
                  backgroundColor: dark ? COLORS.darkCard : COLORS.lightCard,
                  borderColor: dark ? COLORS.darkBorder : COLORS.lightBorder,
                },
              ]}
            >
              {PAYWALL_FEATURES.map((f, i) => (
                <FeatureRow
                  key={i}
                  icon={f.icon}
                  title={f.title}
                  free={f.free}
                  premium={f.premium}
                  dark={dark}
                />
              ))}
            </View>
          </View>

          {/* ── CTA Button ────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: COLORS.violet }]}
            onPress={handlePurchase}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  Start Free Trial —{" "}
                  {PLANS.find((p) => p.id === selectedPlan)?.price}/
                  {PLANS.find((p) => p.id === selectedPlan)?.period}
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {/* ── Fine print ────────────────────────────────── */}
          <Text style={[styles.finePrint, { color: COLORS.textMuted }]}>
            {`${TRIAL_CONFIG.durationDays}-day free trial, then billed at selected plan rate. Cancel anytime. Subscription auto-renews unless cancelled 24hrs before renewal.`}
          </Text>

          {/* ── Restore + Close ───────────────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              <Text style={[styles.footerLink, { color: COLORS.textMuted }]}>
                {restoring ? "Restoring..." : "Restore purchases"}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerDot, { color: COLORS.textMuted }]}>
              ·
            </Text>
            <TouchableOpacity onPress={() => setShowPaywall(false)}>
              <Text style={[styles.footerLink, { color: COLORS.textMuted }]}>
                Maybe later
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom safe area padding */}
          <View style={{ height: sp(4) }} />
        </ScrollView>

        {/* Top-right close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
          <MaterialIcons
            name="close"
            size={20}
            color={dark ? COLORS.textMuted : "#888"}
          />
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.93,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handleBar: {
    alignItems: "center",
    paddingTop: sp(1.5),
    paddingBottom: sp(0.5),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollContent: {
    paddingHorizontal: sp(2.5),
    paddingTop: sp(1),
  },
  closeBtn: {
    position: "absolute",
    top: sp(2),
    right: sp(2),
    padding: sp(0.5),
  },

  // ── Trial Banner ────────────────────────────────────────────
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1),
    paddingVertical: sp(1),
    paddingHorizontal: sp(2),
    borderRadius: 10,
    marginBottom: sp(2),
    overflow: "hidden",
  },
  trialBannerText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 12,
    color: "#fff",
    letterSpacing: 0.5,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    alignItems: "center",
    paddingBottom: sp(2),
  },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sp(1.5),
    overflow: "hidden",
  },
  logoMarkText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
  },
  headline: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: sp(0.75),
  },
  subheadline: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: sp(2),
  },

  // ── Free trial box ──────────────────────────────────────────
  freeTrialBox: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: sp(2.5),
    padding: sp(1.5),
    overflow: "hidden",
  },
  freeTrialInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  freeTrialTitle: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  freeTrialSub: {
    fontSize: 12,
    lineHeight: 16,
  },

  // ── Section ─────────────────────────────────────────────────
  section: {
    marginBottom: sp(2.5),
  },
  sectionLabel: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 10,
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: sp(1.5),
  },

  // ── Plans grid ──────────────────────────────────────────────
  plansGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(1),
  },
  planCard: {
    width: "47.5%",
    borderRadius: 12,
    padding: sp(1.5),
    overflow: "hidden",
    position: "relative",
    minHeight: 100,
  },
  planCardInner: {
    flex: 1,
  },
  planBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 11,
  },
  planBadgeText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 8,
    color: "#fff",
    letterSpacing: 1,
  },
  planLabel: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 2,
  },
  planPrice: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 22,
    fontWeight: "700",
  },
  planPeriod: {
    fontSize: 12,
    marginLeft: 2,
  },
  planPerMonth: {
    fontSize: 10,
    marginBottom: 6,
  },
  savingBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savingText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 9,
    fontWeight: "600",
  },
  planSelectDot: {
    position: "absolute",
    bottom: sp(1),
    right: sp(1),
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Features card ────────────────────────────────────────────
  featuresCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sp(1.25),
    paddingHorizontal: sp(1.5),
    borderBottomWidth: 1,
  },
  featureLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: sp(1),
  },
  featureIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  featureRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  featureFree: {
    fontSize: 11,
  },
  featurePremium: {
    fontSize: 11,
    fontWeight: "600",
  },

  // ── CTA ──────────────────────────────────────────────────────
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(1),
    paddingVertical: sp(2),
    borderRadius: 14,
    marginBottom: sp(1.5),
  },
  ctaText: {
    fontFamily: "SpaceMono-Regular",
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // ── Footer ───────────────────────────────────────────────────
  finePrint: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: sp(1.5),
    paddingHorizontal: sp(1),
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(1),
  },
  footerLink: {
    fontSize: 12,
  },
  footerDot: {
    fontSize: 12,
  },

  // ── Corner marks ─────────────────────────────────────────────
  corner: {
    position: "absolute",
    borderColor: COLORS.violet,
  },
  cornerTL: {
    top: 6,
    left: 6,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  cornerTR: {
    top: 6,
    right: 6,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  cornerBL: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cornerBR: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
});
