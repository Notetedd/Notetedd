// screens/PaywallScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { RevenueCatUI } from 'react-native-purchases-ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import { useSubscription } from './context/SubscriptionContext';
import BackButton from '../components/Backbutton';

export default function PaywallScreen({ navigation }) {
  const { colors } = useTheme();
  const { refresh } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Present RevenueCat's native paywall
   * This uses RevenueCat's pre-built, optimized paywall UI
   */
  const presentPaywall = async () => {
    try {
      setIsLoading(true);

      // Present the paywall
      const paywallResult = await RevenueCatUI.presentPaywall({
        // Optional: specify which offering to display
        // offering: offerings.current,
      });

      console.log('Paywall result:', paywallResult);

      // Handle result
      if (paywallResult === RevenueCatUI.PAYWALL_RESULT.PURCHASED) {
        // User made a purchase
        await refresh();
        Alert.alert(
          'Welcome to Notetedd Pro! 🎉',
          'You now have access to all premium features.',
          [
            {
              text: 'Get Started',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else if (paywallResult === RevenueCatUI.PAYWALL_RESULT.RESTORED) {
        // User restored purchases
        await refresh();
        Alert.alert(
          'Purchases Restored',
          'Your subscription has been restored successfully.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else if (paywallResult === RevenueCatUI.PAYWALL_RESULT.CANCELLED) {
        // User cancelled
        console.log('User cancelled paywall');
      } else if (paywallResult === RevenueCatUI.PAYWALL_RESULT.ERROR) {
        // Error occurred
        Alert.alert(
          'Error',
          'Something went wrong. Please try again.',
        );
      }
    } catch (error) {
      console.error('Error presenting paywall:', error);
      Alert.alert(
        'Error',
        'Failed to load subscription options. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Present paywall with custom options
   */
  const presentPaywallWithOptions = async () => {
    try {
      setIsLoading(true);

      const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
        // Only show if user doesn't have entitlement
        requiredEntitlementIdentifier: 'pro',
      });

      if (paywallResult === RevenueCatUI.PAYWALL_RESULT.NOT_PRESENTED) {
        // User already has the entitlement
        Alert.alert(
          'Already Subscribed',
          'You already have access to Notetedd Pro!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
        return;
      }

      // Handle other results same as above
      if (paywallResult === RevenueCatUI.PAYWALL_RESULT.PURCHASED) {
        await refresh();
        Alert.alert(
          'Welcome to Notetedd Pro! 🎉',
          'You now have access to all premium features.',
          [{ text: 'Get Started', onPress: () => navigation.goBack() }]
        );
      } else if (paywallResult === RevenueCatUI.PAYWALL_RESULT.RESTORED) {
        await refresh();
        Alert.alert(
          'Purchases Restored',
          'Your subscription has been restored successfully.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error('Error presenting paywall:', error);
      Alert.alert('Error', 'Failed to load subscription options.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-present paywall on mount
  useEffect(() => {
    presentPaywallWithOptions();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <BackButton />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Upgrade to Pro
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Loading state while paywall is being prepared */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading subscription options...
          </Text>
        </View>
      )}

      {/* Fallback UI if needed */}
      {!isLoading && (
        <View style={styles.content}>
          <MaterialIcons name="workspace-premium" size={80} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>
            Unlock Premium Features
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            Get access to unlimited recordings, AI summaries, and more
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={presentPaywall}
          >
            <Text style={styles.buttonText}>View Plans</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.textButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.textButtonText, { color: colors.subtext }]}>
              Maybe Later
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textButton: {
    paddingVertical: 12,
  },
  textButtonText: {
    fontSize: 16,
  },
});