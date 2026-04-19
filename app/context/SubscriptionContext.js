

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Platform, Alert } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { auth ,db } from "../../firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  scheduleTrialNotifications,
  cancelTrialNotifications,
} from "../utils/trialNotifications";

import {
  logTrialStarted,
  logTrialExpired,
  logPurchaseCompleted,
  logPurchaseFailed,
  logRestoreCompleted,
  logPaywallOpened,
  logPaywallDismissed,
  logFeatureUsed,
  logFeatureBlocked,
} from "../utils/analytics";

import {
  RC_API_KEY,
  ENTITLEMENT_ID,
  TRIAL_CONFIG,
  FREE_LIMITS,
  FEATURES,
} from "../../RevenueCatConfig";

// ─── Context ──────────────────────────────────────────────────
const SubscriptionContext = createContext(null);

// ─── Helper: get start of current week (Monday) ───────────────
const getWeekStart = () => {
  const now  = new Date();
  const day  = now.getDay();
  // Adjust so week starts on Monday (0=Sun→6, 1=Mon→0)
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0]; // "YYYY-MM-DD"
};

// ─── Helper: get device locale / country ──────────────────────
const getGeoInfo = () => {
  try {
    const locale   = Localization.getLocales?.()[0] ?? {};
    return {
      country:  locale.regionCode  ?? "unknown",
      language: locale.languageCode ?? "unknown",
      timezone: locale.timezone     ?? "unknown",
      locale:   locale.languageTag  ?? "unknown",
    };
  } catch {
    return { country: "unknown", language: "unknown", timezone: "unknown", locale: "unknown" };
  }
};

// ─── Provider ─────────────────────────────────────────────────
export function SubscriptionProvider({ children }) {
  const [isReady,        setIsReady]        = useState(false);
  const [isPremium,      setIsPremium]      = useState(false);
  const [isInTrial,      setIsInTrial]      = useState(false);
  const [trialDaysLeft,  setTrialDaysLeft]  = useState(TRIAL_CONFIG.durationDays);
  const [trialExpired,   setTrialExpired]   = useState(false);
  const [offerings,      setOfferings]      = useState(null);
  const [usage,          setUsage]          = useState({
    [FEATURES.TRANSCRIPTION]:  0,
    [FEATURES.QUIZ]:           0,
    [FEATURES.UPLOAD]:         0,
    [FEATURES.AUDIO_NOTES]:    0,
    [FEATURES.NOTES_ORGANIZE]: 0,
  });
  const [showPaywall,    setShowPaywall]    = useState(false);
  const [paywallFeature, setPaywallFeature] = useState(null);

  // const auth = getAuth();
  // const db   = getFirestore();
  const initRef = useRef(false);

  // ── Initialize RevenueCat ──────────────────────────────────
  const initRevenueCat = useCallback(async (userId) => {
  if (initRef.current) return;
  initRef.current = true;

  try {
    // ✅ Just identify the user — don't re-configure
    await Purchases.logIn(userId);
    await refreshSubscriptionStatus();

    // Refresh offerings now that user is identified
    const fetchedOfferings = await Purchases.getOfferings();
    if (fetchedOfferings.current) {
      setOfferings(fetchedOfferings.current);
    }

    setIsReady(true);
    console.log("[RC] Logged in user:", userId);
  } catch (err) {
    console.error("[RC] Init error:", err);
    setIsReady(true);
  }
}, []);

  // ── Refresh subscription status from RevenueCat ────────────
  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const entitlement  = customerInfo.entitlements.active[ENTITLEMENT_ID];
      const premium      = !!entitlement;

      setIsPremium(premium);

      // ── Trial detection ──────────────────────────────────
    // ── Trial detection ──────────────────────────────────────────
const firstSeen = customerInfo?.firstSeen
  ? new Date(customerInfo.firstSeen)
  : new Date();

const now           = new Date();
const daysSinceJoin = Math.floor(
  (now - firstSeen) / (1000 * 60 * 60 * 24)
);
const daysLeft  = Math.max(0, TRIAL_CONFIG.durationDays - daysSinceJoin);
const inTrial   = daysLeft > 0 && !premium;
const expired   = daysLeft === 0 && !premium;

setIsInTrial(inTrial);
setTrialDaysLeft(daysLeft);
setTrialExpired(expired);

// Schedule notification only when actively in trial
if (inTrial) {
  scheduleTrialNotifications(firstSeen).catch(console.warn);
  logTrialStarted(21);
}

// Log expiry only when actually expired
if (expired) {
  logTrialExpired();
} 

      // ── Sync status to Firestore ─────────────────────────
      const user = auth.currentUser;
      if (user) {
        const geo = getGeoInfo();
        await setDoc(
          doc(db, "users", user.uid),
          {
            subscription: {
              isPremium,
              isInTrial:   inTrial,
              trialDaysLeft: daysLeft,
              trialExpired:  expired,
              updatedAt:   serverTimestamp(),
            },
            geo,
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        );
      }

      return { premium, inTrial, daysLeft, expired };
    } catch (err) {
      console.error("[RC] Refresh error:", err);
      return { premium: false, inTrial: true, daysLeft: TRIAL_CONFIG.durationDays, expired: false };
    }
  }, [auth, db]);

  // ── Load weekly usage from Firestore ───────────────────────
  const loadUsage = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const weekStart = getWeekStart();
      const usageRef  = doc(db, "users", user.uid, "usage", weekStart);
      const snap      = await getDoc(usageRef);

      if (snap.exists()) {
        setUsage(snap.data());
      } else {
        // New week — reset counters
        const fresh = {
          [FEATURES.TRANSCRIPTION]:  0,
          [FEATURES.QUIZ]:           0,
          [FEATURES.UPLOAD]:         0,
          [FEATURES.AUDIO_NOTES]:    0,
          [FEATURES.NOTES_ORGANIZE]: 0,
          weekStart,
          createdAt: serverTimestamp(),
        };
        await setDoc(usageRef, fresh);
        setUsage(fresh);
      }
    } catch (err) {
      console.error("[Usage] Load error:", err);
    }
  }, [auth, db]);

  // ── Increment usage counter ────────────────────────────────
  const trackUsage = useCallback(async (feature) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const weekStart = getWeekStart();
      const usageRef  = doc(db, "users", user.uid, "usage", weekStart);

      const currentCount = (usage[feature] ?? 0) + 1;
      const newCount = (usage[feature] ?? 0) + 1;
      await updateDoc(usageRef, {
        [feature]:   increment(1),
        
        updatedAt:   serverTimestamp(),

      }).catch(async () => {
        // Doc doesn't exist yet — create it
        await setDoc(usageRef, {
          [feature]:         1,
          weekStart,
          createdAt:         serverTimestamp(),
          updatedAt:         serverTimestamp(),
        });
      });
      logFeatureUsed(feature, newCount, FREE_LIMITS[feature]);

      // Update local state
      setUsage(prev => ({
        ...prev,
        [feature]: (prev[feature] ?? 0) + 1,
      }));

      // Log analytics event to Firestore
      await logAnalyticsEvent(feature, "used");
    } catch (err) {
      console.error("[Usage] Track error:", err);
    }
  }, [auth, db]);

  // ── Check if user can use a feature ───────────────────────
  const canUseFeature = useCallback((feature) => {
    // Premium users have no limits
    if (isPremium) return { allowed: true, reason: null };

    // Trial users have full access
    if (isInTrial) return { allowed: true, reason: null };

    // Classroom sync always requires premium
    if (feature === FEATURES.CLASSROOM_SYNC) {
      return { allowed: false, reason: "classroom" };
    }

    // Check weekly limits
    const limit   = FREE_LIMITS[`${feature}PerWeek`];
    const current = usage[feature] ?? 0;

    if (current >= limit) {
      return {
        allowed: false,
        reason:  "limit",
        current,
        limit,
      };
    }

    return { allowed: true, reason: null };
  }, [isPremium, isInTrial, usage]);

  // ── Gate a feature — returns true if allowed ───────────────
  // Call this before any premium action in your screens
  const gateFeature = useCallback((feature, onBlocked) => {
    const check = canUseFeature(feature);

    if (!check.allowed) {
      setPaywallFeature(feature);
      setShowPaywall(true);
      onBlocked?.();
      logFeatureBlocked(feature, usage[feature] ?? 0, FREE_LIMITS[feature]);
      return false;
    }

    return true;
  }, [canUseFeature]);

  // ── Purchase a subscription ────────────────────────────────
  
  const purchaseSubscription = useCallback(async (packageToPurchase) => {
    try {
      // logPurchaseStarted(packageToPurchase?.product?.identifier ?? "unknown");
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      const premium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
      setIsPremium(premium);
      cancelTrialNotifications().catch(console.warn);
      logPurchaseCompleted(             
  packageToPurchase?.product?.identifier ?? "unknown",
  packageToPurchase?.product?.priceString ?? "unknown"
);
      setIsInTrial(false);
      setTrialExpired(false);
      setShowPaywall(false);

      // Log purchase analytics
      await logAnalyticsEvent("subscription", "purchased", {
        package: packageToPurchase.identifier,
      });

      return { success: true };
    } catch (err) {
      if (!err.userCancelled) {
        Alert.alert("Purchase Failed", err.message);
      }
      logPurchaseFailed(
  packageToPurchase?.product?.identifier ?? "unknown",
  err?.message ?? "unknown"
); 
      return { success: false, cancelled: err.userCancelled };
    }
  }, []);

  // ── Restore purchases ──────────────────────────────────────
  const restorePurchases = useCallback(async () => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      const premium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
      setIsPremium(premium);
      if (premium) setShowPaywall(false);
      
      logRestoreCompleted();
      return { success: true, premium };
    } catch (err) {
      Alert.alert("Restore Failed", err.message);
      return { success: false };
    }
  }, []);

  // ── Analytics event logger ─────────────────────────────────
  const logAnalyticsEvent = useCallback(async (category, action, extra = {}) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const geo = getGeoInfo();

      await setDoc(
        doc(db, "analytics", `${user.uid}_${Date.now()}`),
        {
          userId:    user.uid,
          category,
          action,
          platform:  Platform.OS,
          ...geo,
          ...extra,
          timestamp: serverTimestamp(),
        }
      );
    } catch (err) {
      // Non-fatal — never crash the app for analytics
      console.warn("[Analytics] Log error:", err);
    }
  }, [auth, db]);


  // check my offerings first
useEffect(() => {
  const fetchOfferings = async () => {
    try {
      // Configure RC with anonymous ID if no user yet
      if (!initRef.current) {
        await Purchases.configure({
          apiKey: RC_API_KEY,
        });
        initRef.current = true;
      }
      const fetchedOfferings = await Purchases.getOfferings();
      if (fetchedOfferings.current) {
        setOfferings(fetchedOfferings.current);
      }
    } catch (err) {
      console.warn("[RC] Offerings fetch error:", err);
    }
  };

  fetchOfferings();
}, []);

// Add this NEW useEffect at the top of SubscriptionProvider
// Place it BEFORE your existing auth useEffect
useEffect(() => {
  const preloadOfferings = async () => {
    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      
      await Purchases.configure({ apiKey: RC_API_KEY });

      const fetchedOfferings = await Purchases.getOfferings();
      if (fetchedOfferings.current) {
        setOfferings(fetchedOfferings.current);
        console.log("[RC] Offerings preloaded:", 
          fetchedOfferings.current.availablePackages.map(p => p.identifier)
        );
      }
    } catch (err) {
      console.warn("[RC] Preload error:", err);
    }
  };

  preloadOfferings();
}, []);

  // ── Listen to Firebase Auth + initialize ───────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await initRevenueCat(user.uid);
        await loadUsage();
      } else {
        // User signed out — reset state
        setIsPremium(false);
        setIsInTrial(false);
        setIsReady(false);
        initRef.current = false;
      }
    });

    return unsubscribe;
  }, []);


  
    

const trackingSetShowPaywall = useCallback((val) => {
  if (val === true)  logPaywallOpened(paywallFeature ?? "unknown");
  if (val === false) logPaywallDismissed(paywallFeature ?? "unknown");
  setShowPaywall(val);
  }, [paywallFeature]);


// ── Context value ──────────────────────────────────────────
  const value = {
    // State
    isReady,
    isPremium,
    isInTrial,
    trialDaysLeft,
    trialExpired,
    offerings,
    usage,
    showPaywall,
    paywallFeature,
    // Actions
     setShowPaywall: trackingSetShowPaywall,
    setPaywallFeature,
    gateFeature,
    canUseFeature,
    trackUsage,
    refreshSubscriptionStatus,
    purchaseSubscription,
    restorePurchases,
    loadUsage,
    logAnalyticsEvent,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────
export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
};