import React, { Component, ReactNode, useEffect, useState } from "react";

import { Slot } from "expo-router/build";
import Toast from "react-native-toast-message";
import { View, Text, Platform, ActivityIndicator } from "react-native";

import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'react-native';

// Existing Screens
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';
import RecordScreen from "./RecordScreen";
import NotesScreen from "./NotesScreen";
import PairedDevicesScreen from "./PairedDevicesScreen";
import SellNotesScreen from "./SellNotesScreen";
import SyncClassroomScreen from "./SyncClassroomScreen";
import PrivacyScreen from "./PrivacyScreen";
import UploadPDFScreen from "./UploadPDFScreen";
import HelpSupportScreen from "./HelpSupportScreen";
import PrefferencesScreen from "./PrefferencesScreen";
import DarkModeScreen from "./DarkModeScreen";
import NotificationsScreen from "./NotificationsScreen";
import PaymentMethodsScreen from "./PaymentMethodsScreen";
import SubscriptionPlanScreen from "./SubscriptionPlanScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";


// RevenueCat Screens
// import PaywallScreen from './PaywallScreen';
// import CustomerCenterScreen from './CustomerCenterScreen';
// import CustomSubscriptionScreen from './CustomSubscriptionScreen';

// Contexts
import ThemeProvider, { useTheme } from "./context/ThemeContext";
// import { SubscriptionProvider } from "./context/SubscriptionContext";

// RevenueCat Config
// import { initializeRevenueCat } from "./../RevenueCatConfig";

import { LogBox } from 'react-native';
LogBox.ignoreAllLogs(); // optional

// ==================== ERROR BOUNDARY ====================
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown error occurred',
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' }}>
            Oops! Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>
            {this.state.errorMessage}
          </Text>
          <Text style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
            Please restart the app or contact support. Email: notetedd@gmail.com
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// ==================== GLOBAL ERROR HANDLER ====================
if (typeof ErrorUtils !== 'undefined') {
  const originalErrorHandler = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('Global error:', error, 'isFatal:', isFatal);
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
      <ThemeProvider>
        {/* <SubscriptionProvider> */}
          <AppContent />
          
        {/* </SubscriptionProvider> */}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// ==================== APP CONTENT ====================
function AppContent() {
  const { theme, colors } = useTheme();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize RevenueCat on app start
  // useEffect(() => {
  //   initApp();
  // }, []);

  // Service Worker registration (Web only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((registration) => {
            console.log('Service Worker registered:', registration);
          })
          .catch((error) => {
            console.log('Service Worker registration failed:', error);
          });
      }
    }
  }, []);

  // const initApp = async () => {
  //   try {
  //     // Initialize RevenueCat SDK
  //     const success = await initializeRevenueCat();
      
  //     if (success) {
  //       console.log('✅ RevenueCat initialized successfully');
  //     } else {
  //       console.warn('⚠️ RevenueCat initialization failed - app will continue without subscription features');
  //     }
  //   } catch (error) {
  //     console.error('❌ App initialization error:', error);
  //     // App continues even if RevenueCat fails
  //   } finally {
  //     setIsInitialized(true);
  //   }
  // };

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: colors.background 
      }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ 
          marginTop: 16, 
          fontSize: 16, 
          color: colors.text 
        }}>
          Loading Notetedd...
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <NavigationContainer
        theme={{
          dark: theme === 'dark',
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
              fontWeight: 'bold',
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
            options={{ title: 'Record' }}
          />
          <Stack.Screen 
            name="NotesScreen" 
            component={NotesScreen}
            options={{ title: 'Notes' }}
          />
          <Stack.Screen 
            name="ProfileScreen" 
            component={ProfileScreen}
            options={{ title: 'Profile' }}
          />
          <Stack.Screen 
            name="PairedDevicesScreen" 
            component={PairedDevicesScreen}
            options={{ title: 'Paired Devices' }}
          />
          <Stack.Screen 
            name="SubscriptionPlanScreen" 
            component={SubscriptionPlanScreen}
            options={{ title: 'Subscription' }}
          />
          <Stack.Screen 
            name="PaymentMethodsScreen" 
            component={PaymentMethodsScreen}
            options={{ title: 'Payment Methods' }}
          />
          <Stack.Screen 
            name="NotificationsScreen" 
            component={NotificationsScreen}
            options={{ title: 'Notifications' }}
          />
          <Stack.Screen 
            name="HelpSupportScreen" 
            component={HelpSupportScreen}
            options={{ title: 'Help & Support' }}
          />
          <Stack.Screen 
            name="SellNotesScreen" 
            component={SellNotesScreen}
            options={{ title: 'Sell Notes' }}
          />
          <Stack.Screen 
            name="SyncClassroomScreen" 
            component={SyncClassroomScreen}
            options={{ title: 'Sync Classroom' }}
          />
          <Stack.Screen 
            name="PrivacyScreen" 
            component={PrivacyScreen}
            options={{ title: 'Privacy' }}
          />
          <Stack.Screen 
            name="UploadPDFScreen" 
            component={UploadPDFScreen}
            options={{ title: 'Upload PDF' }}
          />
          <Stack.Screen 
            name="PrefferencesScreen" 
            component={PrefferencesScreen}
            options={{ title: 'Preferences' }}
          />
          <Stack.Screen 
            name="DarkModeScreen" 
            component={DarkModeScreen}
            options={{ title: 'Dark Mode' }}
          />
          <Stack.Screen 
            name="ResetPasswordScreen" 
            component={ResetPasswordScreen}
            options={{ title: 'Reset Password' }}
          />

          {/* ==================== REVENUECAT SCREENS ==================== */}
          {/* <Stack.Screen 
            name="PaywallScreen" 
            component={PaywallScreen}
            options={{ 
              headerShown: false,
              presentation: 'modal' 
            }}
          />
          <Stack.Screen 
            name="CustomerCenterScreen" 
            component={CustomerCenterScreen}
            options={{ 
              headerShown: false,
              presentation: 'modal' 
            }}
          />
          <Stack.Screen 
            name="CustomSubscriptionScreen" 
            component={CustomSubscriptionScreen}
            options={{ 
              headerShown: false,
              presentation: 'modal' 
            }}
          /> */}
        </Stack.Navigator>
        <Toast />
        <InstallPWA />
      </NavigationContainer>
    </>
  );
}