

import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Platform } from "react-native";
import * as Localization from "expo-localization";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";

// ════════════════════════════════════════════════════════════════
//  EVENT NAMES
// ════════════════════════════════════════════════════════════════

export const EVENTS = {
  // Paywall
  PAYWALL_OPENED:       "paywall_opened",
  PAYWALL_DISMISSED:    "paywall_dismissed",

  // Subscription
  PURCHASE_STARTED:     "purchase_started",
  PURCHASE_COMPLETED:   "purchase_completed",
  PURCHASE_FAILED:      "purchase_failed",
  RESTORE_COMPLETED:    "restore_completed",

  // Trial
  TRIAL_STARTED:        "trial_started",
  TRIAL_EXPIRED:        "trial_expired",
  TRIAL_WARNING:        "trial_warning",       // day 14 notification fired

  // Feature usage
  FEATURE_USED:         "feature_used",
  FEATURE_BLOCKED:      "feature_blocked",     // hit weekly limit
};

// ════════════════════════════════════════════════════════════════
//  GEO HELPER
//  Reads locale info once and caches it for the session.
// ════════════════════════════════════════════════════════════════

let _geoCache = null;

function getGeo() {
  if (_geoCache) return _geoCache;
  try {
    const locale   = Localization.getLocales?.()?.[0];
    _geoCache = {
      country:  locale?.regionCode  ?? "unknown",
      timezone: Localization.timezone ?? "unknown",
      locale:   locale?.languageTag  ?? "unknown",
    };
  } catch {
    _geoCache = { country: "unknown", timezone: "unknown", locale: "unknown" };
  }
  return _geoCache;
}

// ════════════════════════════════════════════════════════════════
//  CORE LOG FUNCTION
// ════════════════════════════════════════════════════════════════

export async function logEvent(eventName, properties = {}) {
  try {
    const auth = getAuth();
    const uid  = auth.currentUser?.uid;
    if (!uid) return; // never log unauthenticated events

    const db      = getFirestore();
    const version = Constants.expoConfig?.version
                 ?? Constants.manifest?.version
                 ?? "unknown";

    const payload = {
      event:      eventName,
      userId:     uid,
      properties,
      timestamp:  serverTimestamp(),
      platform:   Platform.OS,
      appVersion: version,
      geo:        getGeo(),
    };

    // ── 1. Firestore ─────────────────────────────────────────
    await addDoc(collection(db, "analytics"), payload);

    // ── 2. RevenueCat custom subscriber attribute ─────────────
    // RC doesn't have a generic event API on mobile but we can
    // set subscriber attributes for segmentation. We only set
    // attributes for the most valuable events to avoid spam.
    if (Platform.OS !== "web") {
      try {
        if (eventName === EVENTS.PURCHASE_COMPLETED) {
          await Purchases.setAttributes({
            last_purchase_plan: properties.plan ?? "unknown",
            last_purchase_at:   new Date().toISOString(),
          });
        }
        if (eventName === EVENTS.TRIAL_STARTED) {
          await Purchases.setAttributes({
            trial_started_at: new Date().toISOString(),
            user_country:     getGeo().country,
          });
        }
        if (eventName === EVENTS.TRIAL_EXPIRED) {
          await Purchases.setAttributes({
            trial_expired_at: new Date().toISOString(),
          });
        }
      } catch (rcErr) {
        // RC attribute failures are non-fatal — Firestore is source of truth.
        console.warn("RC attribute error:", rcErr);
      }
    }

    console.log(`📊 [Analytics] ${eventName}`, properties);
  } catch (err) {
    // Analytics must never crash the app.
    console.warn("Analytics error:", err);
  }
}

// ════════════════════════════════════════════════════════════════
//  CONVENIENCE WRAPPERS
//  These keep call sites clean — one import, typed calls.
// ════════════════════════════════════════════════════════════════

/** Call when the paywall modal opens. */
export const logPaywallOpened = (feature) =>
  logEvent(EVENTS.PAYWALL_OPENED, { feature });

/** Call when the user dismisses the paywall without purchasing. */
export const logPaywallDismissed = (feature) =>
  logEvent(EVENTS.PAYWALL_DISMISSED, { feature });

/** Call immediately before the RevenueCat purchase sheet appears. */
export const logPurchaseStarted = (plan) =>
  logEvent(EVENTS.PURCHASE_STARTED, { plan });

/** Call after a successful RevenueCat purchase. */
export const logPurchaseCompleted = (plan, price) =>
  logEvent(EVENTS.PURCHASE_COMPLETED, { plan, price });

/** Call if a RevenueCat purchase fails or is cancelled. */
export const logPurchaseFailed = (plan, reason) =>
  logEvent(EVENTS.PURCHASE_FAILED, { plan, reason });

/** Call after a successful restore. */
export const logRestoreCompleted = () =>
  logEvent(EVENTS.RESTORE_COMPLETED, {});

/** Call once when a user's trial is first detected. */
export const logTrialStarted = (daysTotal) =>
  logEvent(EVENTS.TRIAL_STARTED, { daysTotal });

/** Call when trial expires (daysLeft reaches 0). */
export const logTrialExpired = () =>
  logEvent(EVENTS.TRIAL_EXPIRED, {});

/** Call when the day-14 warning notification fires. */
export const logTrialWarning = (dayNumber) =>
  logEvent(EVENTS.TRIAL_WARNING, { dayNumber: 14 });

/** Call each time a gated feature is successfully used. */
export const logFeatureUsed = (feature, usageCount, limit) =>
  logEvent(EVENTS.FEATURE_USED, { feature, usageCount, limit });

/** Call when a user hits a weekly limit and is blocked. */
export const logFeatureBlocked = (feature, usageCount, limit) =>
  logEvent(EVENTS.FEATURE_BLOCKED, { feature, usageCount, limit });