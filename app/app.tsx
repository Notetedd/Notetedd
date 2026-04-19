import React, { Component, ReactNode, useEffect, useState } from "react";

import { ActivityIndicator, Platform, Text, View } from "react-native";
import Toast from "react-native-toast-message";

import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "react-native";

// Existing Screens
import DarkModeScreen from "./DarkModeScreen";
import HelpSupportScreen from "./HelpSupportScreen";
import HomeScreen from "./HomeScreen";
import NotesScreen from "./NotesScreen";
import NotificationsScreen from "./NotificationsScreen";
import PairedDevicesScreen from "./PairedDevicesScreen";
import PaymentMethodsScreen from "./PaymentMethodsScreen";
import PrefferencesScreen from "./PrefferencesScreen";
import PrivacyScreen from "./PrivacyScreen";
import ProfileScreen from "./ProfileScreen";
import RecordScreen from "./RecordScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";
import SellNotesScreen from "./SellNotesScreen";
import SubscriptionPlanScreen from "./SubscriptionPlanScreen";
import SyncClassroomScreen from "./SyncClassroomScreen";
import UploadPDFScreen from "./UploadPDFScreen";
import WidgetPreviewScreen from "./WidgetPreviewScreen";

// Contexts
import ThemeProvider, { useTheme } from "./context/ThemeContext";

//revenue cat context import
import { SubscriptionProvider } from "./context/SubscriptionContext";

//import the global paywall
import GlobalPaywall from "./components/GlobalPaywall";
// Widget Service
import { WidgetService } from "./services/widgetService";

import { AppState, LogBox } from "react-native";
import TrialBanner from "./components/TrialBanner";
// import { useFeatureGate } from "../hooks/useFeatureGate";
LogBox.ignoreAllLogs();

// ==================== ERROR BOUNDARY ====================
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error.message || "Unknown error occurred",
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            backgroundColor: "#f5f5f5",
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              marginBottom: 10,
              color: "#333",
            }}
          >
            Oops! Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#666",
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            {this.state.errorMessage}
          </Text>
          <Text style={{ fontSize: 12, color: "#999", textAlign: "center" }}>
            Please restart the app or contact support. Email: notetedd@gmail.com
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// ==================== GLOBAL ERROR HANDLER ====================
if (typeof ErrorUtils !== "undefined") {
  const originalErrorHandler = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error("Global error:", error, "isFatal:", isFatal);
    // Still call original handler if it exists
    if (originalErrorHandler) {
      originalErrorHandler(error, isFatal);
    }
  });
}

const Stack = createStackNavigator();

// ==================== MAIN APP ====================
export default function App() {
  return (
    <ErrorBoundary>
      <SubscriptionProvider>
        <ThemeProvider>
          <AppContent />
          <TrialBanner />
          {/* <useFeatureGate/> */}
          <GlobalPaywall />
        </ThemeProvider>
      </SubscriptionProvider>
    </ErrorBoundary>
  );
}

// ==================== APP CONTENT ====================
function AppContent() {
  const { theme, colors } = useTheme();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize app and widget
  useEffect(() => {
    initApp();
  }, []);

  // Service Worker registration (Web only)
  useEffect(() => {
    if (Platform.OS === "web") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/service-worker.js")
          .then((registration) => {
            console.log("Service Worker registered:", registration);
          })
          .catch((error) => {
            console.log("Service Worker registration failed:", error);
          });
      }
    }
  }, []);

  const initApp = async () => {
    try {
      // Initialize widget with default data
      await initializeWidget();
      console.log("✅ Widget initialized successfully");
    } catch (error) {
      console.error("❌ Widget initialization error:", error);
    } finally {
      setIsInitialized(true);
    }
  };

  // Initialize widget with default data
  const initializeWidget = async () => {
    // Only initialize on iOS and Android
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return;
    }

    const data = await WidgetService.getWidgetData();

    // Update widget with current state
    await WidgetService.updateWidget({
      streak: data.streak,
      todayCompleted: data.todayCompleted,
      accentColor: WidgetService.getAccentColor(
        data.streak,
        data.todayCompleted,
      ),
      motivationalText: WidgetService.getMotivationalText(
        data.streak,
        data.todayCompleted,
      ),
      shouldBlink: await WidgetService.checkShouldBlink(),
    });
  };

  // Widget integration: update widget on app foreground and periodically
  useEffect(() => {
    // Only run on iOS and Android
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return;
    }

    // Update widget when app comes to foreground
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "active") {
          await updateWidgetState();
          await checkAndResetDaily();
        }
      },
    );

    // Initial update
    updateWidgetState();
    checkAndResetDaily();

    // Set up periodic checks for blink animation
    const interval = setInterval(
      async () => {
        const shouldBlink = await WidgetService.checkShouldBlink();
        const currentData = await WidgetService.getWidgetData();

        if (shouldBlink !== currentData.shouldBlink) {
          await WidgetService.updateWidget({ shouldBlink });
        }
      },
      1000 * 60 * 30, // Every 30 minutes
    );

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  // Widget update logic
  const updateWidgetState = async () => {
    try {
      const data = await WidgetService.getWidgetData();
      await WidgetService.updateWidget({
        accentColor: WidgetService.getAccentColor(
          data.streak,
          data.todayCompleted,
        ),
        motivationalText: WidgetService.getMotivationalText(
          data.streak,
          data.todayCompleted,
        ),
      });
    } catch (error) {
      console.error("Error updating widget state:", error);
    }
  };

  // Check and reset daily completion status
  const checkAndResetDaily = async () => {
    try {
      const currentData = await WidgetService.getWidgetData();

      // Calculate hours since last update
      const hoursSinceUpdate =
        (Date.now() - currentData.lastUpdated) / (1000 * 60 * 60);

      // If it's been more than 24 hours, check if streak should reset
      if (hoursSinceUpdate >= 24) {
        // If user didn't complete yesterday, reset streak
        const streakBroken = !currentData.todayCompleted;
        const newStreak = streakBroken ? 0 : currentData.streak;

        await WidgetService.updateWidget({
          streak: newStreak,
          todayCompleted: false,
          accentColor: WidgetService.getAccentColor(newStreak, false),
          motivationalText: WidgetService.getMotivationalText(newStreak, false),
          shouldBlink: false,
        });
      }
    } catch (error) {
      console.error("Error checking daily reset:", error);
    }
  };

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 16,
            fontSize: 16,
            color: colors.text,
          }}
        >
          Loading Notetedd...
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <NavigationContainer
        theme={{
          dark: theme === "dark",
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
            notification: colors.error,
          },
        }}
      >
        <Stack.Navigator
          initialRouteName="HomeScreen"
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface || colors.card,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontWeight: "bold",
            },
          }}
        >
          {/* ==================== EXISTING SCREENS ==================== */}
          <Stack.Screen
            name="HomeScreen"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RecordScreen"
            component={RecordScreen}
            options={{ title: "Record" }}
          />
          <Stack.Screen
            name="NotesScreen"
            component={NotesScreen}
            options={{ title: "Notes" }}
          />
          <Stack.Screen
            name="ProfileScreen"
            component={ProfileScreen}
            options={{ title: "Profile" }}
          />
          <Stack.Screen
            name="PairedDevicesScreen"
            component={PairedDevicesScreen}
            options={{ title: "Paired Devices" }}
          />
          <Stack.Screen
            name="SubscriptionPlanScreen"
            component={SubscriptionPlanScreen}
            options={{ title: "Subscription" }}
          />

          <Stack.Screen
            name="PaymentMethodsScreen"
            component={PaymentMethodsScreen}
            options={{ title: "Payment Methods" }}
          />
          <Stack.Screen
            name="NotificationsScreen"
            component={NotificationsScreen}
            options={{ title: "Notifications" }}
          />
          <Stack.Screen
            name="HelpSupportScreen"
            component={HelpSupportScreen}
            options={{ title: "Help & Support" }}
          />
          <Stack.Screen
            name="SellNotesScreen"
            component={SellNotesScreen}
            options={{ title: "Sell Notes" }}
          />
          <Stack.Screen
            name="SyncClassroomScreen"
            component={SyncClassroomScreen}
            options={{ title: "Sync Classroom" }}
          />
          <Stack.Screen
            name="PrivacyScreen"
            component={PrivacyScreen}
            options={{ title: "Privacy" }}
          />
          <Stack.Screen
            name="UploadPDFScreen"
            component={UploadPDFScreen}
            options={{ title: "Upload PDF" }}
          />
          <Stack.Screen
            name="PrefferencesScreen"
            component={PrefferencesScreen}
            options={{ title: "Preferences" }}
          />
          <Stack.Screen
            name="DarkModeScreen"
            component={DarkModeScreen}
            options={{ title: "Dark Mode" }}
          />
          <Stack.Screen
            name="ResetPasswordScreen"
            component={ResetPasswordScreen}
            options={{ title: "Reset Password" }}
          />
          <Stack.Screen
            name="WidgetPreviewScreen"
            component={WidgetPreviewScreen}
            options={{ title: "Widget Preview" }}
          />
        </Stack.Navigator>
        <Toast />
      </NavigationContainer>
    </>
  );
}
