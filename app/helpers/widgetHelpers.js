// helpers/widgetHelpers.js
// Helper functions to update widget from anywhere in the app

import { Platform } from "react-native";
import { WidgetService } from "../services/widgetService";

/**
 * Call this function when user completes a learning activity
 * (e.g., finishes recording notes, completes a study session, etc.)
 */
export async function markLearningActivityComplete() {
  // Only update widget on mobile platforms
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    const currentData = await WidgetService.getWidgetData();

    // Don't increment if already completed today
    if (currentData.todayCompleted) {
      console.log("Learning activity already completed today");
      return;
    }

    const newStreak = currentData.streak + 1;

    await WidgetService.updateWidget({
      streak: newStreak,
      todayCompleted: true,
      motivationalText: WidgetService.getMotivationalText(newStreak, true),
      accentColor: WidgetService.getAccentColor(newStreak, true),
      shouldBlink: false,
    });

    console.log(`✅ Widget updated: ${newStreak} day streak!`);
    return newStreak;
  } catch (error) {
    console.error("Error marking learning activity complete:", error);
  }
}

/**
 * Get current widget data for display in the app
 */
export async function getWidgetStatus() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return null;
  }

  try {
    return await WidgetService.getWidgetData();
  } catch (error) {
    console.error("Error getting widget status:", error);
    return null;
  }
}

/**
 * Manually reset the widget (useful for testing or admin actions)
 */
export async function resetWidget() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    await WidgetService.updateWidget({
      streak: 0,
      todayCompleted: false,
      motivationalText: "Start your learning journey!",
      accentColor: "#6366F1",
      shouldBlink: false,
    });

    console.log("Widget reset successfully");
  } catch (error) {
    console.error("Error resetting widget:", error);
  }
}

/**
 * Update widget color theme (useful when user changes app theme)
 */
export async function updateWidgetTheme() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    const data = await WidgetService.getWidgetData();
    await WidgetService.updateWidget({
      accentColor: WidgetService.getAccentColor(data.streak, data.todayCompleted),
    });
  } catch (error) {
    console.error("Error updating widget theme:", error);
  }
}