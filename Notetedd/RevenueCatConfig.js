// RevenueCatConfig.js (place this in your project root or config folder)
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

// Your RevenueCat API Keys
const API_KEYS = {
  ios: 'test_dQcODruiTgpkJTXoteRQVmSVwqa', // Replace with your iOS API key from RevenueCat dashboard
  android: 'test_dQcODruiTgpkJTXoteRQVmSVwqa', // Replace with your Android API key from RevenueCat dashboard
};

// For testing, you can use the test key provided
const USE_TEST_KEY = true; // Set to false when you have real API keys
const TEST_KEY = 'test_dQcODruiTgpkJTXoteRQVmSVwqa';

// Entitlement identifier (configure this in RevenueCat dashboard)
export const ENTITLEMENT_ID = 'pro'; // This unlocks "Notetedd Pro"

// Offering identifiers (these match your RevenueCat dashboard configuration)
export const OFFERING_IDS = {
  DEFAULT: 'default', // Your default offering
};

// Product identifiers (these match your RevenueCat product setup)
export const PRODUCT_IDS = {
  MONTHLY: 'monthly',
  THREE_MONTH: 'three_month', // Semester
  YEARLY: 'yearly', // Academic year
  LIFETIME: 'lifetime',
};

/**
 * Initialize RevenueCat SDK
 * Call this once when your app starts (typically in App.js)
 */
export const initializeRevenueCat = async (userId = null) => {
  try {
    // Use test key if configured, otherwise use platform-specific key
    let apiKey;
    if (USE_TEST_KEY) {
      apiKey = TEST_KEY;
      console.log('🧪 Using RevenueCat test API key');
    } else {
      apiKey = Platform.select({
        ios: API_KEYS.ios,
        android: API_KEYS.android,
      });
    }

    if (!apiKey) {
      console.error('RevenueCat API key not configured for this platform');
      return false;
    }

    // Configure SDK
    await Purchases.configure({ 
      apiKey,
      appUserID: userId, // Optional: pass user ID for user identification
    });

    // Enable debug logs in development
    if (__DEV__) {
      await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }

    console.log('✅ RevenueCat initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing RevenueCat:', error);
    return false;
  }
};

/**
 * Set user attributes for better analytics
 */
export const setUserAttributes = async (attributes = {}) => {
  try {
    // Set custom attributes
    if (attributes.email) {
      await Purchases.setEmail(attributes.email);
    }
    if (attributes.displayName) {
      await Purchases.setDisplayName(attributes.displayName);
    }
    if (attributes.phoneNumber) {
      await Purchases.setPhoneNumber(attributes.phoneNumber);
    }
    
    // Set custom user attributes
    if (attributes.custom) {
      for (const [key, value] of Object.entries(attributes.custom)) {
        await Purchases.setAttributes({ [key]: value });
      }
    }
    
    console.log('✅ User attributes set successfully');
  } catch (error) {
    console.error('❌ Error setting user attributes:', error);
  }
};

/**
 * Identify user (login)
 */
export const identifyUser = async (userId) => {
  try {
    await Purchases.logIn(userId);
    console.log('✅ User identified:', userId);
  } catch (error) {
    console.error('❌ Error identifying user:', error);
    throw error;
  }
};

/**
 * Reset user (logout)
 */
export const resetUser = async () => {
  try {
    await Purchases.logOut();
    console.log('✅ User logged out');
  } catch (error) {
    console.error('❌ Error logging out user:', error);
    throw error;
  }
};