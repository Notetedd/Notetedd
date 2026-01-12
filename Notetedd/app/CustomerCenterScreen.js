// screens/CustomerCenterScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { RevenueCatUI } from 'react-native-purchases-ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import { useSubscription } from './context/SubscriptionContext';
import BackButton from '../components/Backbutton';

export default function CustomerCenterScreen({ navigation }) {
  const { colors } = useTheme();
  const { isPro, subscriptionInfo, refresh } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Present RevenueCat's Customer Center
   * This provides a native UI for managing subscriptions
   */
  const presentCustomerCenter = async () => {
    try {
      setIsLoading(true);

      // Present the customer center
      await RevenueCatUI.presentCustomerCenter();

      // Refresh subscription status after customer center is dismissed
      await refresh();
    } catch (error) {
      console.error('Error presenting customer center:', error);
      Alert.alert(
        'Error',
        'Failed to load subscription management. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-present customer center if user is subscribed
  useEffect(() => {
    if (isPro) {
      presentCustomerCenter();
    }
  }, []);

  if (!isPro) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <BackButton />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Subscription
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          <MaterialIcons name="info-outline" size={80} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>
            No Active Subscription
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            You don't have an active subscription. Subscribe to access premium features.
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('PaywallScreen')}
          >
            <Text style={styles.buttonText}>View Plans</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <BackButton />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Manage Subscription
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading subscription details...
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          <MaterialIcons name="workspace-premium" size={80} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>
            Notetedd Pro Active
          </Text>
          
          {subscriptionInfo && (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.subtext }]}>
                  Plan:
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {subscriptionInfo.productIdentifier}
                </Text>
              </View>
              
              {subscriptionInfo.expirationDate && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.subtext }]}>
                    {subscriptionInfo.willRenew ? 'Renews:' : 'Expires:'}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {new Date(subscriptionInfo.expirationDate).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={presentCustomerCenter}
          >
            <MaterialIcons name="settings" size={20} color="#fff" />
            <Text style={styles.buttonText}>Manage Subscription</Text>
          </TouchableOpacity>

          <Text style={[styles.helpText, { color: colors.subtext }]}>
            Cancel, change plans, or update payment methods
          </Text>
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
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 15,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  helpText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});