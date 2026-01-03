// screens/PaymentMethodsScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import BackButton from '../components/Backbutton';

const SUBSCRIPTION_PLANS = [
  { id: 'monthly', name: 'Monthly', price: 299, period: 'month' },
  { id: 'semester', name: 'Semester', price: 799, period: '3 months', savings: '17%' },
  { id: 'yearly', name: 'Academic Year', price: 1499, period: 'year', savings: '33%' },
];

export default function PaymentMethodsScreen() {
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // M-Pesa fields
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaTill, setMpesaTill] = useState('');
  
  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [cardName, setCardName] = useState('');

  const { theme, colors } = useTheme();

  const selectedPlanDetails = SUBSCRIPTION_PLANS.find(p => p.id === selectedPlan);

  const paymentMethods = [
    { 
      id: 'mpesa', 
      name: 'M-Pesa Till', 
      icon: 'smartphone', 
      color: '#00A651',
      desc: 'Pay via M-Pesa Till Number'
    },
    { 
      id: 'card', 
      name: 'Visa/MasterCard', 
      icon: 'credit-card', 
      color: '#1434CB',
      desc: 'Credit or Debit Card'
    },
    { 
      id: 'paypal', 
      name: 'PayPal', 
      icon: 'account-balance-wallet', 
      color: '#0070BA',
      desc: 'Pay with PayPal account'
    },
  ];

  const formatCardNumber = (text) => {
    const cleaned = text.replace(/\s/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const formatExpiry = (text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const validateMpesa = () => {
    if (!mpesaPhone || mpesaPhone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return false;
    }
    if (!mpesaTill || mpesaTill.length < 5) {
      Alert.alert('Error', 'Please enter a valid Till number');
      return false;
    }
    return true;
  };

  const validateCard = () => {
    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 13) {
      Alert.alert('Error', 'Please enter a valid card number');
      return false;
    }
    if (!cardExpiry || cardExpiry.length < 5) {
      Alert.alert('Error', 'Please enter a valid expiry date');
      return false;
    }
    if (!cardCVV || cardCVV.length < 3) {
      Alert.alert('Error', 'Please enter a valid CVV');
      return false;
    }
    if (!cardName) {
      Alert.alert('Error', 'Please enter the cardholder name');
      return false;
    }
    return true;
  };

  const handlePayment = async () => {
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    // Validate based on payment method
    if (selectedMethod === 'mpesa' && !validateMpesa()) return;
    if (selectedMethod === 'card' && !validateCard()) return;

    setLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (selectedMethod === 'mpesa') {
        // M-Pesa Till Payment API Integration
        const mpesaPayload = {
          phone: mpesaPhone,
          tillNumber: mpesaTill,
          amount: selectedPlanDetails.price,
          planId: selectedPlan,
        };
        console.log('M-Pesa Payment:', mpesaPayload);
        
        // TODO: Call your backend API
        // const response = await fetch('YOUR_API_URL/payment/mpesa', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(mpesaPayload)
        // });
        
      } else if (selectedMethod === 'card') {
        // Card Payment API Integration (Stripe, Flutterwave, PayStack, etc.)
        const cardPayload = {
          cardNumber: cardNumber.replace(/\s/g, ''),
          expiry: cardExpiry,
          cvv: cardCVV,
          name: cardName,
          amount: selectedPlanDetails.price,
          planId: selectedPlan,
        };
        console.log('Card Payment:', cardPayload);
        
        // TODO: Call your backend API
        // const response = await fetch('YOUR_API_URL/payment/card', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(cardPayload)
        // });
        
      } else if (selectedMethod === 'paypal') {
        // PayPal Integration
        const paypalPayload = {
          amount: selectedPlanDetails.price,
          planId: selectedPlan,
        };
        console.log('PayPal Payment:', paypalPayload);
        
        // TODO: Integrate PayPal SDK or call backend API
        // Open PayPal payment flow
      }

      Alert.alert(
        'Payment Successful! 🎉',
        `Your payment of KES ${selectedPlanDetails.price} has been processed.\n\nSubscription: ${selectedPlanDetails.name} Plan\n\nYou now have access to all premium features!`,
        [{ text: 'OK', onPress: () => {
          // Navigate to success screen or home
          // navigation.navigate('Home');
        }}]
      );

      // Reset form
      setSelectedMethod(null);
      setMpesaPhone('');
      setMpesaTill('');
      setCardNumber('');
      setCardExpiry('');
      setCardCVV('');
      setCardName('');

    } catch (error) {
      Alert.alert('Payment Failed', 'An error occurred while processing your payment. Please try again.');
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialIcons name="credit-card" size={48} color={colors.primary} />
        <Text style={[styles.title, { color: colors.primary }]}>Subscribe to Premium</Text>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>Choose your plan and payment method</Text>
      </View>
      <BackButton />

      {/* Subscription Plans */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Plan</Text>
        {SUBSCRIPTION_PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              selectedPlan === plan.id && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan(plan.id)}
            activeOpacity={0.7}
          >
            <View style={styles.planHeader}>
              <View>
                <Text style={[
                  styles.planName,
                  selectedPlan === plan.id && styles.planNameSelected,
                ]}>
                  {plan.name}
                </Text>
                <Text style={styles.planPeriod}>Billed per {plan.period}</Text>
              </View>
              <View style={styles.planPriceContainer}>
                <Text style={[
                  styles.planPrice,
                  selectedPlan === plan.id && styles.planPriceSelected,
                ]}>
                  KES {plan.price}
                </Text>
                {plan.savings && (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>Save {plan.savings}</Text>
                  </View>
                )}
              </View>
            </View>
            {selectedPlan === plan.id && (
              <View style={styles.checkContainer}>
                <MaterialIcons name="check-circle" size={24} color="#7c3aed" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Payment Methods */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment Method</Text>
        {paymentMethods.map((method) => (
          <TouchableOpacity
            key={method.id}
            style={[
              styles.methodCard,
              selectedMethod === method.id && styles.methodCardSelected,
            ]}
            onPress={() => setSelectedMethod(method.id)}
            activeOpacity={0.7}
          >
            <View style={styles.methodInfo}>
              <View style={[
                styles.iconContainer,
                { backgroundColor: method.color + '20' }
              ]}>
                <MaterialIcons name={method.icon} size={28} color={method.color} />
              </View>
              <View style={styles.methodTextContainer}>
                <Text style={styles.methodName}>{method.name}</Text>
                <Text style={styles.methodDesc}>{method.desc}</Text>
              </View>
            </View>
            {selectedMethod === method.id && (
              <MaterialIcons name="check-circle" size={24} color="#7c3aed" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* M-Pesa Form */}
      {selectedMethod === 'mpesa' && (
        <View style={styles.section}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>M-Pesa Details</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 0712345678"
                placeholderTextColor="#9ca3af"
                value={mpesaPhone}
                onChangeText={(text) => setMpesaPhone(text.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Till Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 123456"
                placeholderTextColor="#9ca3af"
                value={mpesaTill}
                onChangeText={(text) => setMpesaTill(text.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color="#1e40af" />
              <Text style={styles.infoText}>
                You'll receive an M-Pesa prompt on your phone to complete the payment.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Card Form */}
      {selectedMethod === 'card' && (
        <View style={styles.section}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Card Details</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Card Number</Text>
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor="#9ca3af"
                value={cardNumber}
                onChangeText={(text) => {
                  const formatted = formatCardNumber(text);
                  if (formatted.replace(/\s/g, '').length <= 16) {
                    setCardNumber(formatted);
                  }
                }}
                keyboardType="number-pad"
                maxLength={19}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>Expiry Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MM/YY"
                  placeholderTextColor="#9ca3af"
                  value={cardExpiry}
                  onChangeText={(text) => setCardExpiry(formatExpiry(text))}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>

              <View style={[styles.formGroup, styles.halfWidth]}>
                <Text style={styles.label}>CVV</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123"
                  placeholderTextColor="#9ca3af"
                  value={cardCVV}
                  onChangeText={(text) => setCardCVV(text.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cardholder Name</Text>
              <TextInput
                style={styles.input}
                placeholder="JOHN DOE"
                placeholderTextColor="#9ca3af"
                value={cardName}
                onChangeText={(text) => setCardName(text.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="lock" size={20} color="#1e40af" />
              <Text style={styles.infoText}>
                Your card information is encrypted and secure.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* PayPal Info */}
      {selectedMethod === 'paypal' && (
        <View style={styles.section}>
          <View style={styles.formCard}>
            <View style={styles.infoBox}>
              <MaterialIcons name="open-in-new" size={20} color="#1e40af" />
              <Text style={styles.infoText}>
                You'll be redirected to PayPal to complete your payment securely.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Payment Summary & Button */}
      {selectedMethod && (
        <View style={styles.section}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Plan:</Text>
              <Text style={styles.summaryValue}>{selectedPlanDetails.name}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryLabel}>Total Amount:</Text>
              <Text style={styles.summaryValueBold}>KES {selectedPlanDetails.price}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.payButton, loading && styles.payButtonDisabled]}
            onPress={handlePayment}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.payButtonText}>
                Pay KES {selectedPlanDetails.price}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.secureText}>🔒 Your payment is secure and encrypted</Text>
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#7c3aed',
    marginTop: 12,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 14,
  },
  
  // Plan Cards
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
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
  planCardSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },
  planNameSelected: {
    color: '#7c3aed',
  },
  planPeriod: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  planPriceSelected: {
    color: '#7c3aed',
  },
  savingsBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  savingsText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checkContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  
  // Payment Method Cards
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  methodCardSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  methodTextContainer: {
    flex: 1,
  },
  methodName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  methodDesc: {
    fontSize: 13,
    color: '#6b7280',
  },
  
  // Forms
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 18,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 19,
    marginLeft: 10,
  },
  
  // Summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTotal: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  summaryValueBold: {
    fontSize: 24,
    color: '#7c3aed',
    fontWeight: 'bold',
  },
  
  // Payment Button
  payButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secureText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  
  bottomSpacer: {
    height: 40,
  },
});