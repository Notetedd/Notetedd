// screens/CustomSubscriptionScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './context/ThemeContext';
import { useSubscription } from './context/SubscriptionContext';
import { getOfferings, purchasePackage, restorePurchases } from './services/RevenueCatService';
import BackButton from '../components/Backbutton';

export default function CustomSubscriptionScreen({ navigation }) {
  const { colors, theme } = useTheme();
  const { isPro, refresh } = useSubscription();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [packages, setPackages] = useState([]);
  const [offering, setOffering] = useState(null);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      const offeringsData = await getOfferings();

      if (offeringsData) {
        setOffering(offeringsData.offering);
        
        // Get all available packages
        const availablePackages = offeringsData.packages.all || [];
        setPackages(availablePackages);
        
        // Pre-select a default package (e.g., monthly)
        if (availablePackages.length > 0) {
          const defaultPkg = offeringsData.packages.monthly || availablePackages[0];
          setSelectedPackage(defaultPkg);
        }
      } else {
        Alert.alert(
          'Error',
          'Unable to load subscription options. Please try again later.'
        );
      }
    } catch (error) {
      console.error('Error loading offerings:', error);
      Alert.alert('Error', 'Failed to load subscription options.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      Alert.alert('Error', 'Please select a subscription plan');
      return;
    }

    try {
      setPurchasing(true);

      const result = await purchasePackage(selectedPackage);

      if (result.success) {
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
      } else if (result.cancelled) {
        console.log('Purchase cancelled');
      } else {
        Alert.alert(
          'Purchase Failed',
          result.error || 'An error occurred. Please try again.'
        );
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Error', 'Failed to complete purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setPurchasing(true);

      const result = await restorePurchases();

      if (result.success) {
        await refresh();

        if (result.hasActiveSubscription) {
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
        } else {
          Alert.alert(
            'No Purchases Found',
            'We could not find any previous purchases to restore.'
          );
        }
      } else {
        Alert.alert(
          'Restore Failed',
          result.error || 'An error occurred while restoring purchases.'
        );
      }
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Error', 'Failed to restore purchases.');
    } finally {
      setPurchasing(false);
    }
  };

  const formatPrice = (pkg) => {
    return pkg.product.priceString;
  };

  const getPackageTitle = (pkg) => {
    const identifier = pkg.identifier;
    if (identifier.includes('monthly')) return 'Monthly';
    if (identifier.includes('three') || identifier.includes('semester')) return 'Semester';
    if (identifier.includes('annual') || identifier.includes('yearly')) return 'Academic Year';
    if (identifier.includes('lifetime')) return 'Lifetime';
    return pkg.product.title;
  };

  const getPackagePeriod = (pkg) => {
    const identifier = pkg.identifier;
    if (identifier.includes('monthly')) return 'per month';
    if (identifier.includes('three') || identifier.includes('semester')) return 'per 3 months';
    if (identifier.includes('annual') || identifier.includes('yearly')) return 'per year';
    if (identifier.includes('lifetime')) return 'one-time payment';
    return '';
  };

  const getSavingsText = (pkg) => {
    const identifier = pkg.identifier;
    if (identifier.includes('three') || identifier.includes('semester')) return 'Save 17%';
    if (identifier.includes('annual') || identifier.includes('yearly')) return 'Save 33%';
    if (identifier.includes('lifetime')) return 'Best Value';
    return null;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading subscription options...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ['#1F2937', '#374151'] : ['#9B5DE5', '#7C3AED']}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <BackButton />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Upgrade to Pro</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Features */}
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Premium Features
          </Text>

          {[
            { icon: 'mic', text: 'Unlimited lecture recordings' },
            { icon: 'auto-awesome', text: 'AI-powered summaries' },
            { icon: 'cloud', text: 'Cloud storage & sync' },
            { icon: 'analytics', text: 'Advanced analytics' },
            { icon: 'folder', text: 'Export to all formats' },
            { icon: 'support-agent', text: 'Priority support' },
          ].map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <MaterialIcons name={feature.icon} size={24} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>
                {feature.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Packages */}
        <View style={styles.packagesContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Choose Your Plan
          </Text>

          {packages.map((pkg, index) => {
            const isSelected = selectedPackage?.identifier === pkg.identifier;
            const savings = getSavingsText(pkg);

            return (
              <TouchableOpacity
                key={pkg.identifier}
                style={[
                  styles.packageCard,
                  isSelected && styles.packageCardSelected,
                  isDark && styles.packageCardDark,
                ]}
                onPress={() => setSelectedPackage(pkg)}
                activeOpacity={0.8}
              >
                {savings && (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>{savings}</Text>
                  </View>
                )}

                <View style={styles.packageHeader}>
                  <View style={styles.packageInfo}>
                    <Text style={[styles.packageName, { color: colors.text }]}>
                      {getPackageTitle(pkg)}
                    </Text>
                    <Text style={[styles.packagePeriod, { color: colors.subtext }]}>
                      {getPackagePeriod(pkg)}
                    </Text>
                  </View>

                  <View style={styles.packagePriceContainer}>
                    <Text style={[styles.packagePrice, { color: colors.text }]}>
                      {formatPrice(pkg)}
                    </Text>
                  </View>
                </View>

                {isSelected && (
                  <View style={styles.checkmark}>
                    <MaterialIcons name="check-circle" size={24} color="#7c3aed" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Purchase Button */}
        {selectedPackage && (
          <View style={styles.purchaseContainer}>
            <TouchableOpacity
              style={[
                styles.purchaseButton,
                { backgroundColor: colors.primary },
                purchasing && styles.purchaseButtonDisabled,
              ]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="workspace-premium" size={24} color="#fff" />
                  <Text style={styles.purchaseButtonText}>
                    Subscribe - {formatPrice(selectedPackage)}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={purchasing}
            >
              <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
                Restore Purchases
              </Text>
            </TouchableOpacity>

            <Text style={[styles.termsText, { color: colors.subtext }]}>
              🔒 Secure payment • Cancel anytime
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionDark: {
    backgroundColor: '#1F2937',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  packagesContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  packageCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  packageCardDark: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  packageCardSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  savingsBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingsText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  packagePeriod: {
    fontSize: 14,
  },
  packagePriceContainer: {
    alignItems: 'flex-end',
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  checkmark: {
    position: 'absolute',
    top: 18,
    right: 18,
  },
  purchaseContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  bottomSpacer: {
    height: 40,
  },
});