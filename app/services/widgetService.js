// services/WidgetService.js
// Widget data management service for Expo Widget
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Only import expo-widget on native platforms
let Widget = null;
if (Platform.OS === "ios" || Platform.OS === "android") {
  try {
    Widget = require("expo-widget");
  } catch (error) {
    console.warn("expo-widget not available:", error.message);
  }
}

export class WidgetService {
  static WIDGET_KEY = "DailyLearningWidget";

  // Check if widget is supported on current platform
  static isWidgetSupported() {
    return (Platform.OS === "ios" || Platform.OS === "android") && Widget !== null;
  }

  // Update widget data when user completes activities
  static async updateWidget(data) {
    try {
      const currentData = await this.getWidgetData();
      const newData = {
        ...currentData,
        ...data,
        lastUpdated: Date.now(),
      };
      await AsyncStorage.setItem(this.WIDGET_KEY, JSON.stringify(newData));
      
      // Only update native widget if Widget module is available
      if (this.isWidgetSupported() && Widget.setWidgetData) {
        await Widget.setWidgetData(this.WIDGET_KEY, newData);
      }
      
      return newData;
    } catch (error) {
      console.error("Error updating widget:", error);
      return null;
    }
  }

  // Get current widget data
  static async getWidgetData() {
    try {
      const data = await AsyncStorage.getItem(this.WIDGET_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Error getting widget data:", error);
    }
    return this.getDefaultData();
  }

  // Default widget state
  static getDefaultData() {
    return {
      streak: 0,
      todayCompleted: false,
      motivationalText: "Start your learning journey!",
      accentColor: "#6366F1",
      shouldBlink: false,
      lastUpdated: Date.now(),
    };
  }

  // Determine if widget should "blink" to grab attention
  static async checkShouldBlink() {
    if (!this.isWidgetSupported()) {
      return false;
    }
    
    const data = await this.getWidgetData();
    const hoursSinceUpdate = (Date.now() - data.lastUpdated) / (1000 * 60 * 60);
    return hoursSinceUpdate > 12 && !data.todayCompleted;
  }

  // Color system for different states
  static getAccentColor(streak, completed) {
    if (completed) return "#10B981"; // Green when completed
    if (streak >= 7) return "#F59E0B"; // Gold for 7+ day streak
    if (streak >= 3) return "#8B5CF6"; // Purple for 3+ day streak
    return "#6366F1"; // Blue default
  }

  // Motivational messages
  static getMotivationalText(streak, completed) {
    if (completed) return "Great job today! 🎉";
    const messages = [
      "Your brain is ready to learn!",
      "5 minutes can make a difference!",
      "Keep your streak alive! 🔥",
      "Knowledge is power! 💪",
      "Learn something new today!",
    ];
    return messages[streak % messages.length];
  }
}