/**
 * src/config/revenuecat.js — NoteTedd
 * Central RevenueCat configuration.
 */

import { Platform } from "react-native";

export const RC_API_KEY = Platform.select({
  ios:     process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? "",
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "",
  default: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? "",
});

export const ENTITLEMENT_ID = "premium";
export const OFFERING_ID    = "default";

export const TRIAL_CONFIG = {
  durationDays:    21,
  warningDayOne:   14,
  warningDayTwo:   18,
  warningDayThree: 20,
};

export const FREE_LIMITS = {
  transcriptionsPerWeek: 3,
  quizzesPerWeek:        2,
  uploadsPerWeek:        3,
  audioNotesPerWeek:     3,
  notesOrganizePerWeek:  3,
  classroomSync:         false,
};

export const FEATURES = {
  TRANSCRIPTION:  "transcriptions",
  QUIZ:           "quizzes",
  UPLOAD:         "uploads",
  AUDIO_NOTES:    "audioNotes",
  NOTES_ORGANIZE: "notesOrganize",
  CLASSROOM_SYNC: "classroomSync",
};

// ─── Subscription Plans ───────────────────────────────────────
export const PLANS = [
  {
    id:          "notetedd_premium_weekly",
    rcIdentifier: "$rc_weekly",
    label:       "Weekly",
    price:       "$1.99",
    period:      "week",
    perMonth:    "$7.96/mo",
    badge:       null,
    highlight:   false,
    saving:      null,
  },
  {
    id:          "notetedd_premium_monthly",
    rcIdentifier: "$rc_monthly",
    label:       "Monthly",
    price:       "$6.99",
    period:      "month",
    perMonth:    "$6.99/mo",
    badge:       null,
    highlight:   false,
    saving:      null,
  },
  {
    id:          "notetedd_premium_semester",
    rcIdentifier: "$rc_three_month",
    label:       "Semester",
    price:       "$19.99",
    period:      "3 months",
    perMonth:    "$6.66/mo",
    badge:       "MOST POPULAR",
    highlight:   true,
    saving:      "Save 5%",
  },
  {
    id:          "notetedd_premium_yearly",
    rcIdentifier: "$rc_annual",
    label:       "Annual",
    price:       "$29.99",
    period:      "year",
    perMonth:    "$2.50/mo",
    badge:       "BEST VALUE",
    highlight:   false,
    saving:      "Save 69%",
  },
];

export const PAYWALL_FEATURES = [
  {
    icon:        "mic",
    title:       "Unlimited Transcriptions",
    free:        "3/week",
    premium:     "Unlimited",
  },
  {
    icon:        "quiz",
    title:       "Unlimited Quizzes",
    free:        "2/week",
    premium:     "Unlimited",
  },
  {
    icon:        "upload-file",
    title:       "PDF & Image Upload",
    free:        "3/week",
    premium:     "Unlimited",
  },
  {
    icon:        "headphones",
    title:       "Audio Notes",
    free:        "3/week",
    premium:     "Unlimited",
  },
  {
    icon:        "auto-stories",
    title:       "Notes Organisation",
    free:        "3/week",
    premium:     "Unlimited",
  },
  {
    icon:        "school",
    title:       "Classroom Sync",
    free:        "Locked",
    premium:     "Full Access",
  },
];