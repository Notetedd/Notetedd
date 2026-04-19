/**
 
 *
 * Single hook that gives any screen everything it needs
 * to gate a feature and track usage.
 *
 * Usage in any screen:
 *
 *   const { gate, track, usage, canUse } = useFeatureGate(FEATURES.TRANSCRIPTION);
 *
 *   // Before the premium action:
 *   const allowed = await gate();
 *   if (!allowed) return; // paywall already shown
 *
 *   // After the action succeeds:
 *   await track();
 */

import { useCallback } from "react";
import { useSubscription } from "../context/SubscriptionContext";
import { showLimitToast } from "../utils/limitToast";

export default function useFeatureGate(feature) {
  const {
    canUseFeature,
    trackUsage,
    usage,
    setShowPaywall,
    setPaywallFeature,
    isPremium,
    isInTrial,
  } = useSubscription();

  // ── Open paywall for this feature ─────────────────────────
  const openPaywall = useCallback(() => {
    setPaywallFeature(feature);
    setShowPaywall(true);
  }, [feature, setPaywallFeature, setShowPaywall]);

  // ── gate() — call before any premium action ───────────────
  // Returns true if allowed, false if blocked (paywall shown)
  const gate = useCallback(() => {
    const check = canUseFeature(feature);

    if (!check.allowed) {
      // Show toast then open paywall
      showLimitToast(feature, openPaywall);
      return false;
    }

    return true;
  }, [canUseFeature, feature, openPaywall]);

  // ── track() — call after action succeeds ──────────────────
  const track = useCallback(async () => {
    // Premium and trial users don't burn usage
    if (isPremium || isInTrial) return;
    await trackUsage(feature);
  }, [isPremium, isInTrial, trackUsage, feature]);

  // ── canUse — quick boolean check for disabling UI ─────────
  const canUse = canUseFeature(feature).allowed;

  // ── current usage count for this feature ──────────────────
  const currentUsage = usage[feature] ?? 0;

  return {
    gate, // call before action — returns boolean
    track, // call after action succeeds
    canUse, // boolean — use to disable buttons
    currentUsage, // number — current usage this week
    openPaywall, // open paywall manually
  };
}
