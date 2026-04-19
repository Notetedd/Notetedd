// widgets/DailyLearningWidget.js
// Expo Widget preview component for DailyLearningWidget
import React from "react";

// Local fallback for WidgetPreview (expo-widget does not export WidgetPreview in this environment)
// This renders a preview using sample data; native code renders the actual widget on device.
export const WidgetPreview = ({ renderWidget }) => {
  const sampleData = {
    streak: 5,
    todayCompleted: false,
    motivationalText: "Keep going!",
    accentColor: "#4A90E2",
    shouldBlink: false,
  };
  return <>{renderWidget(sampleData)}</>;
};

export function DailyLearningWidget() {
  // This is a preview for your app; native code renders the actual widget
  return (
    <WidgetPreview
      widgetName="DailyLearningWidget"
      renderWidget={(data) => (
        <div
          style={{
            backgroundColor: data.accentColor,
            padding: 16,
            borderRadius: 12,
            animation: data.shouldBlink ? "blink 1s infinite" : "none",
            color: "#fff",
            fontFamily: "sans-serif",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ margin: 0 }}>{data.streak} Day Streak! 🔥</h2>
          <p style={{ margin: "8px 0" }}>{data.motivationalText}</p>
          {!data.todayCompleted && (
            <button
              style={{
                background: "#fff",
                color: data.accentColor,
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: "bold",
                cursor: "pointer",
                marginTop: 8,
              }}
            >
              Continue Learning
            </button>
          )}
        </div>
      )}
    />
  );
}