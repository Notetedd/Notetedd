import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "./context/ThemeContext";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import haptics from "./utils/haptics";
import BackButton from "../components/Backbutton";

export default function SubscriptionPlanScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [currentPlan, setCurrentPlan] = useState("free");
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      color: ["#6B7280", "#4B5563"],
      features: [
        { text: "5 lecture recordings per month", included: true },
        { text: "Basic transcription", included: true },
        { text: "Limited note export", included: true },
        { text: "Community support", included: true },
        { text: "AI-powered summaries", included: false },
        { text: "Unlimited recordings", included: false },
        { text: "Advanced analytics", included: false },
        { text: "Priority support", included: false },
      ],
    },
    {
      id: "monthly",
      name: "Pro Monthly",
      price: "$9.99",
      period: "per month",
      color: ["#9B5DE5", "#7C3AED"],
      popular: true,
      features: [
        { text: "Unlimited lecture recordings", included: true },
        { text: "Advanced AI transcription", included: true },
        { text: "AI-powered summaries", included: true },
        { text: "Export to all formats", included: true },
        { text: "Advanced analytics", included: true },
        { text: "Cloud storage (50GB)", included: true },
        { text: "Priority support", included: true },
        { text: "Ad-free experience", included: true },
      ],
    },
    {
      id: "yearly",
      name: "Pro Yearly",
      price: "$99.99",
      period: "per year",
      savings: "Save 17%",
      color: ["#F59E0B", "#D97706"],
      features: [
        { text: "Everything in Pro Monthly", included: true },
        { text: "2 months free!", included: true },
        { text: "Cloud storage (200GB)", included: true },
        { text: "Exclusive features access", included: true },
        { text: "Early access to new features", included: true },
        { text: "Custom AI model training", included: true },
        { text: "VIP support", included: true },
        { text: "Offline mode", included: true },
      ],
    },
  ];

  const benefits = [
    {
      icon: "mic",
      title: "Unlimited Recording",
      description: "Record as many lectures as you need",
      color: "#9B5DE5",
    },
    {
      icon: "auto-awesome",
      title: "AI Summaries",
      description: "Get instant AI-generated summaries",
      color: "#10B981",
    },
    {
      icon: "cloud",
      title: "Cloud Sync",
      description: "Access your notes anywhere",
      color: "#3B82F6",
    },
    {
      icon: "analytics",
      title: "Advanced Analytics",
      description: "Track your study progress",
      color: "#F59E0B",
    },
  ];

  const handleSubscribe = async (planId) => {
    await haptics.impact("Medium");
    
    if (planId === "free") {
      Alert.alert("Already on Free Plan", "You're currently using the free plan.");
      return;
    }

    Alert.alert(
      "Subscribe to Pro",
      `You're about to subscribe to the ${plans.find(p => p.id === planId)?.name} plan. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Subscribe",
          onPress: async () => {
            await haptics.notification("Success");
            // Implement payment logic here
            Alert.alert("Success", "Subscription activated! 🎉");
            setCurrentPlan(planId);
          },
        },
      ]
    );
  };

  const handleManageSubscription = async () => {
    await haptics.impact("Light");
    Alert.alert(
      "Manage Subscription",
      "Choose an option:",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Update Payment Method", onPress: () => navigation.navigate("PaymentMethodsScreen") },
        { text: "View Billing History", onPress: () => {} },
        { text: "Cancel Subscription", style: "destructive", onPress: () => {} },
      ]
    );
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <BackButton />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Subscription Plans</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Current Plan Badge */}
          {currentPlan !== "free" && (
            <View style={styles.currentPlanBadge}>
              <LinearGradient
                colors={["#10B981", "#059669"]}
                style={styles.currentPlanGradient}
              >
                <MaterialIcons name="check-circle" size={20} color="#fff" />
                <Text style={styles.currentPlanText}>
                  Currently on {plans.find(p => p.id === currentPlan)?.name}
                </Text>
              </LinearGradient>
            </View>
          )}

          {/* Benefits Section */}
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Why Upgrade?
            </Text>
            
            <View style={styles.benefitsGrid}>
              {benefits.map((benefit, index) => (
                <View 
                  key={index}
                  style={[styles.benefitCard, isDark && styles.benefitCardDark]}
                >
                  <View style={[styles.benefitIcon, { backgroundColor: benefit.color + "20" }]}>
                    <MaterialIcons name={benefit.icon} size={28} color={benefit.color} />
                  </View>
                  <Text style={[styles.benefitTitle, isDark && styles.textDark]}>
                    {benefit.title}
                  </Text>
                  <Text style={[styles.benefitDescription, isDark && styles.textSecondaryDark]}>
                    {benefit.description}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Plans Section */}
          <View style={styles.plansContainer}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Choose Your Plan
            </Text>

            {plans.map((plan, index) => (
              <TouchableOpacity
                key={plan.id}
                onPress={() => {
                  haptics.impact("Light");
                  setSelectedPlan(plan.id);
                }}
                activeOpacity={0.9}
              >
                <View style={[
                  styles.planCard,
                  selectedPlan === plan.id && styles.planCardSelected,
                  isDark && styles.planCardDark,
                  isDark && selectedPlan === plan.id && styles.planCardSelectedDark,
                ]}>
                  {plan.popular && (
                    <View style={styles.popularBadge}>
                      <LinearGradient
                        colors={["#F59E0B", "#D97706"]}
                        style={styles.popularBadgeGradient}
                      >
                        <MaterialIcons name="stars" size={16} color="#fff" />
                        <Text style={styles.popularText}>Most Popular</Text>
                      </LinearGradient>
                    </View>
                  )}

                  <View style={styles.planHeader}>
                    <View style={styles.planInfo}>
                      <Text style={[styles.planName, isDark && styles.textDark]}>
                        {plan.name}
                      </Text>
                      <View style={styles.priceRow}>
                        <Text style={[styles.planPrice, isDark && styles.textDark]}>
                          {plan.price}
                        </Text>
                        <Text style={[styles.planPeriod, isDark && styles.textSecondaryDark]}>
                          {plan.period}
                        </Text>
                      </View>
                      {plan.savings && (
                        <View style={styles.savingsBadge}>
                          <Text style={styles.savingsText}>{plan.savings}</Text>
                        </View>
                      )}
                    </View>

                    {currentPlan === plan.id && (
                      <View style={styles.currentTag}>
                        <MaterialIcons name="check-circle" size={24} color="#10B981" />
                      </View>
                    )}
                  </View>

                  <View style={styles.featuresContainer}>
                    {plan.features.map((feature, idx) => (
                      <View key={idx} style={styles.featureRow}>
                        <MaterialIcons 
                          name={feature.included ? "check-circle" : "cancel"} 
                          size={18} 
                          color={feature.included ? "#10B981" : "#9CA3AF"} 
                        />
                        <Text style={[
                          styles.featureText,
                          !feature.included && styles.featureTextDisabled,
                          isDark && styles.textSecondaryDark,
                        ]}>
                          {feature.text}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {currentPlan !== plan.id && (
                    <TouchableOpacity
                      style={styles.subscribeButton}
                      onPress={() => handleSubscribe(plan.id)}
                    >
                      <LinearGradient
                        colors={plan.color}
                        style={styles.subscribeButtonGradient}
                      >
                        <Text style={styles.subscribeButtonText}>
                          {plan.id === "free" ? "Current Plan" : "Subscribe Now"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Manage Subscription */}
          {currentPlan !== "free" && (
            <View style={[styles.section, isDark && styles.sectionDark]}>
              <TouchableOpacity
                style={styles.manageButton}
                onPress={handleManageSubscription}
              >
                <MaterialIcons name="settings" size={20} color="#9B5DE5" />
                <Text style={styles.manageButtonText}>Manage Subscription</Text>
                <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* FAQ Section */}
          <View style={[styles.section, isDark && styles.sectionDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Frequently Asked Questions
            </Text>

            {[
              {
                q: "Can I cancel anytime?",
                a: "Yes! You can cancel your subscription at any time. You'll still have access until the end of your billing period.",
              },
              {
                q: "What payment methods do you accept?",
                a: "We accept all major credit cards, debit cards, and PayPal.",
              },
              {
                q: "Is there a student discount?",
                a: "Yes! Students get 50% off with a valid .edu email address.",
              },
            ].map((faq, index) => (
              <View key={index} style={[styles.faqCard, isDark && styles.faqCardDark]}>
                <View style={styles.faqQuestion}>
                  <MaterialIcons name="help" size={20} color="#9B5DE5" />
                  <Text style={[styles.faqQuestionText, isDark && styles.textDark]}>
                    {faq.q}
                  </Text>
                </View>
                <Text style={[styles.faqAnswer, isDark && styles.textSecondaryDark]}>
                  {faq.a}
                </Text>
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, isDark && styles.textSecondaryDark]}>
              Need help deciding? Contact our support team
            </Text>
            <TouchableOpacity style={styles.supportButton}>
              <Text style={styles.supportButtonText}>Get Help</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  containerDark: {
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  currentPlanBadge: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  currentPlanGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  currentPlanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionDark: {
    backgroundColor: "#1F2937",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  benefitsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  benefitCard: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  benefitCardDark: {
    backgroundColor: "#374151",
  },
  benefitIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  plansContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    position: "relative",
  },
  planCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  planCardSelected: {
    borderColor: "#9B5DE5",
    elevation: 8,
  },
  planCardSelectedDark: {
    borderColor: "#9B5DE5",
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    right: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  popularBadgeGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  popularText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1F2937",
  },
  planPeriod: {
    fontSize: 14,
    color: "#6B7280",
  },
  savingsBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  savingsText: {
    color: "#16A34A",
    fontSize: 12,
    fontWeight: "700",
  },
  currentTag: {
    marginLeft: 12,
  },
  featuresContainer: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  featureTextDisabled: {
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  subscribeButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  subscribeButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  subscribeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  manageButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#9B5DE5",
    marginLeft: 12,
  },
  faqCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  faqCardDark: {
    backgroundColor: "#374151",
  },
  faqQuestion: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  faqQuestionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  faqAnswer: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginLeft: 28,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 12,
  },
  supportButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#9B5DE5",
    borderRadius: 20,
  },
  supportButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textSecondaryDark: {
    color: "#D1D5DB",
  },
});