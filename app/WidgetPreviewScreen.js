
// screens/WidgetPreviewScreen.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { WidgetService } from "./services/widgetService";

export default function WidgetPreviewScreen() {
  const [widgetData, setWidgetData] = useState(null);

  useEffect(() => {
    loadWidgetData();
  }, []);

  const loadWidgetData = async () => {
    const data = await WidgetService.getWidgetData();
    setWidgetData(data);
  };

  const simulateActivity = async () => {
    const currentData = await WidgetService.getWidgetData();
    const newStreak = currentData.streak + 1;
    
    await WidgetService.updateWidget({
      streak: newStreak,
      todayCompleted: true,
      accentColor: WidgetService.getAccentColor(newStreak, true),
      motivationalText: WidgetService.getMotivationalText(newStreak, true),
      shouldBlink: false,
    });
    
    loadWidgetData();
  };

  const resetStreak = async () => {
    await WidgetService.updateWidget({
      streak: 0,
      todayCompleted: false,
      accentColor: "#6366F1",
      motivationalText: "Start your learning journey!",
      shouldBlink: false,
    });
    loadWidgetData();
  };

  const testBlink = async () => {
    await WidgetService.updateWidget({
      shouldBlink: !widgetData.shouldBlink,
    });
    loadWidgetData();
  };

  if (!widgetData) {
    return <Text>Loading...</Text>;
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Widget Preview</Text>
      <Text style={styles.subtitle}>This is how your widget will look:</Text>

      {/* Widget Preview */}
      <WidgetMockup data={widgetData} />

      {/* Test Controls */}
      <View style={styles.controls}>
        <Text style={styles.controlsTitle}>Test Controls:</Text>
        
        <TouchableOpacity style={styles.button} onPress={simulateActivity}>
          <Text style={styles.buttonText}>
            ✅ Complete Activity (Increase Streak)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={testBlink}>
          <Text style={styles.buttonText}>
            ⚡ Toggle Blink Animation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={resetStreak}>
          <Text style={styles.buttonText}>🔄 Reset Streak</Text>
        </TouchableOpacity>
      </View>

      {/* Current State */}
      <View style={styles.stateInfo}>
        <Text style={styles.stateTitle}>Current Widget State:</Text>
        <Text style={styles.stateText}>Streak: {widgetData.streak} days</Text>
        <Text style={styles.stateText}>
          Completed Today: {widgetData.todayCompleted ? "✅ Yes" : "❌ No"}
        </Text>
        <Text style={styles.stateText}>Color: {widgetData.accentColor}</Text>
        <Text style={styles.stateText}>
          Blinking: {widgetData.shouldBlink ? "⚡ Yes" : "No"}
        </Text>
        <Text style={styles.stateText}>Message: {widgetData.motivationalText}</Text>
      </View>
    </ScrollView>
  );
}

// Widget Mockup Component
function WidgetMockup({ data }) {
  return (
    <View
      style={[
        styles.widgetContainer,
        {
          backgroundColor: data.accentColor,
          opacity: data.shouldBlink ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.widgetContent}>
        <Text style={styles.widgetStreak}>{data.streak} Day Streak! 🔥</Text>
        <Text style={styles.widgetMessage}>{data.motivationalText}</Text>
        {!data.todayCompleted && (
          <View style={styles.widgetButton}>
            <Text style={[styles.widgetButtonText, { color: data.accentColor }]}>
              Continue Learning
            </Text>
          </View>
        )}
        {data.todayCompleted && (
          <Text style={styles.completedBadge}>✓ Completed Today</Text>
        )}
      </View>
      {data.shouldBlink && (
        <Text style={styles.blinkIndicator}>⚡ Blinking</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  widgetContainer: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  widgetContent: {
    alignItems: "center",
  },
  widgetStreak: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  widgetMessage: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  widgetButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  widgetButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  completedBadge: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  blinkIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 12,
    color: "#fff",
  },
  controls: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  controlsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  resetButton: {
    backgroundColor: "#EF4444",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  stateInfo: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  stateText: {
    fontSize: 14,
    marginBottom: 8,
    color: "#333",
  },
});