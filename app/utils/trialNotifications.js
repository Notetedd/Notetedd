/**
 * trialNotifications.js — NoteTedd
 *
 * Schedules a single push notification on day 14 of the free trial.
 * Called once on account creation. Safe to call multiple times —
 * cancels any previously scheduled trial notifications first.
 *
 * Tapping the notification sets a flag in AsyncStorage that
 * _layout.tsx reads on next app open to trigger the paywall.
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ── Constants ─────────────────────────────────────────────────
const NOTIFICATION_TAG      = "notetedd_trial";
const PAYWALL_TRIGGER_KEY   = "notetedd_open_paywall_on_launch";
const SCHEDULED_KEY         = "notetedd_trial_notifications_scheduled";
const TRIAL_DURATION_DAYS   = 21;
const WARNING_DAY           = 14;

// ── Notification content ──────────────────────────────────────
const NOTIFICATION = {
  title:    "Your free trial is halfway through ⏳",
  body:     "You have 7 days left. Upgrade now to keep unlimited access to all NoteTedd features.",
  data:     { type: NOTIFICATION_TAG, action: "open_paywall" },
};

// ════════════════════════════════════════════════════════════════
//  REQUEST PERMISSIONS
// ════════════════════════════════════════════════════════════════

export async function requestNotificationPermissions() {
  if (Platform.OS === "web") return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.error("Notification permission error:", err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  SCHEDULE TRIAL NOTIFICATION
//  Call this once when the user's account is first created.
// ════════════════════════════════════════════════════════════════

export async function scheduleTrialNotifications(trialStartDate = new Date()) {
  if (Platform.OS === "web") return;

  try {
    // Cancel any previously scheduled trial notifications first
    // so this is safe to call multiple times without duplicates.
    await cancelTrialNotifications();

    const granted = await requestNotificationPermissions();
    if (!granted) {
      console.log("Notification permission not granted — skipping schedule");
      return;
    }

    // I calculate the trigger date from the trial start.
    const triggerDate = new Date(trialStartDate);
    triggerDate.setDate(triggerDate.getDate() + WARNING_DAY);
    triggerDate.setHours(10, 0, 0, 0); // 10:00 AM local time

    // Only schedule if the trigger date is in the future.
    if (triggerDate <= new Date()) {
      console.log("Day 14 notification trigger date is in the past — skipping");
      return;
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title:  NOTIFICATION.title,
        body:   NOTIFICATION.body,
        data:   NOTIFICATION.data,
        sound:  true,
        badge:  1,
      },
      trigger: {
        date: triggerDate,
      },
    });

    // I persist the scheduled notification ID so I can cancel it later
    // (e.g. if the user upgrades before day 14).
    await AsyncStorage.setItem(
      SCHEDULED_KEY,
      JSON.stringify({ id, scheduledFor: triggerDate.toISOString() })
    );

    console.log(`✅ Trial notification scheduled for ${triggerDate.toLocaleDateString()} (day ${WARNING_DAY}), id: ${id}`);
  } catch (err) {
    console.error("Failed to schedule trial notification:", err);
  }
}

// ════════════════════════════════════════════════════════════════
//  CANCEL TRIAL NOTIFICATIONS
//  Call this when the user upgrades to premium.
// ════════════════════════════════════════════════════════════════

export async function cancelTrialNotifications() {
  if (Platform.OS === "web") return;

  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_KEY);
    if (raw) {
      const { id } = JSON.parse(raw);
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(SCHEDULED_KEY);
      console.log("✅ Trial notification cancelled");
    }
  } catch (err) {
    // Graceful — notification may have already fired or been cancelled.
    console.warn("Could not cancel trial notification:", err);
  }
}

// ════════════════════════════════════════════════════════════════
//  NOTIFICATION RESPONSE HANDLER
//  Call this once from _layout.tsx to handle notification taps.
//  Sets a flag so the paywall opens on next foreground.
// ════════════════════════════════════════════════════════════════

export function setupNotificationHandler() {
  // I set the handler so notifications show even when the app is foregrounded.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  false,
    }),
  });
}

export async function handleNotificationTap(response, openPaywallFn) {
  const data = response?.notification?.request?.content?.data;
  if (data?.action === "open_paywall") {
    console.log("Notification tapped — opening paywall");
    // I use a short delay so the app has time to fully mount.
    setTimeout(() => openPaywallFn?.(), 800);
  }
}

// ════════════════════════════════════════════════════════════════
//  PAYWALL LAUNCH FLAG
//  When the app is opened cold from a notification tap,
//  the response handler may fire before the paywall is ready.
//  I store a flag so _layout.tsx can pick it up after mount.
// ════════════════════════════════════════════════════════════════

export async function setPaywallLaunchFlag() {
  await AsyncStorage.setItem(PAYWALL_TRIGGER_KEY, "1");
}

export async function checkAndClearPaywallLaunchFlag() {
  try {
    const flag = await AsyncStorage.getItem(PAYWALL_TRIGGER_KEY);
    if (flag) {
      await AsyncStorage.removeItem(PAYWALL_TRIGGER_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}