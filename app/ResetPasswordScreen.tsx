import React, { useState, useRef, useEffect } from "react";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "./context/ThemeContext";
import { auth } from "../firebaseConfig";
import { sendPasswordResetEmail } from "firebase/auth";
import Toast, { showToast } from "../toastConfig";

const { width, height } = Dimensions.get("window");

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const router = useRouter();
  const { theme, colors } = useTheme();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;
  const floatAnim3 = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating animations
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim1, {
          toValue: -25,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim1, {
          toValue: 0,
          duration: 3500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim2, {
          toValue: -35,
          duration: 4500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim2, {
          toValue: 0,
          duration: 4500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim3, {
          toValue: -20,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim3, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotation animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 25000,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const successAnimation = () => {
    Animated.sequence([
      Animated.spring(successAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(successAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      showToast("error", "Error", "Please enter your email address.");
      shakeAnimation();
      return;
    }

    if (!validateEmail(email)) {
      showToast("error", "Error", "Please enter a valid email address.");
      shakeAnimation();
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      
      setEmailSent(true);
      successAnimation();
      showToast("success", "Email Sent! 📧", "Check your inbox for password reset instructions.");

    } catch (error) {
      let errorMessage = "Failed to send reset email. Please try again.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email address.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Please try again later.";
      }
      
      showToast("error", "Error", errorMessage);
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.push("/LoginScreen");
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent
      />
      
      {/* Animated Background Gradient */}
      <LinearGradient
        colors={[ "#e67e22", "#d35400"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      >
        {/* Floating Background Elements */}
        <Animated.View 
          style={[
            styles.floatingCircle,
            styles.circle1,
            { transform: [{ translateY: floatAnim1 }, { rotate: spin }] }
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.06)"]}
            style={styles.circleGradient}
          />
        </Animated.View>

        <Animated.View 
          style={[
            styles.floatingCircle,
            styles.circle2,
            { transform: [{ translateY: floatAnim2 }] }
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0.04)"]}
            style={styles.circleGradient}
          />
        </Animated.View>

        <Animated.View 
          style={[
            styles.floatingCircle,
            styles.circle3,
            { transform: [{ translateY: floatAnim3 }] }
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.15)", "rgba(255,255,255,0.05)"]}
            style={styles.circleGradient}
          />
        </Animated.View>

        {/* Decorative Icons */}
        <Animated.View style={[styles.decorIcon, styles.decorIcon1, { opacity: fadeAnim }]}>
          <Icon name="lock-reset" size={45} color="rgba(255,255,255,0.25)" />
        </Animated.View>
        <Animated.View style={[styles.decorIcon, styles.decorIcon2, { opacity: fadeAnim }]}>
          <Icon name="vpn-key" size={38} color="rgba(255,255,255,0.22)" />
        </Animated.View>
        <Animated.View style={[styles.decorIcon, styles.decorIcon3, { opacity: fadeAnim }]}>
          <Icon name="security" size={42} color="rgba(255,255,255,0.2)" />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Back Button */}
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBackToLogin}
            >
              <Icon name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Logo/Icon Section */}
            <Animated.View 
              style={[
                styles.iconContainer,
                { 
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
                }
              ]}
            >
              <Animated.View 
                style={[
                  styles.iconCircle,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              >
                <LinearGradient
                  colors={["#ffffff", "#f8f9fa"]}
                  style={styles.iconGradient}
                >
                  <Icon name="lock-reset" size={56} color="#9B5DE5" />
                </LinearGradient>
              </Animated.View>
              <Text style={styles.iconTitle}>Reset Password</Text>
              <Text style={styles.iconSubtitle}>🔐 We'll help you get back in 🔐</Text>
            </Animated.View>

            {/* Form Container */}
            <Animated.View 
              style={[
                styles.formContainer,
                { 
                  opacity: fadeAnim,
                  transform: [
                    { scale: scaleAnim },
                    { translateX: shakeAnim }
                  ]
                }
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.98)", "rgba(255,255,255,0.96)"]}
                style={styles.formGradient}
              >
                {!emailSent ? (
                  <>
                    <View style={styles.infoBox}>
                      <Icon name="info" size={24} color="#3B82F6" />
                      <Text style={styles.infoText}>
                        Enter your email address and we'll send you instructions to reset your password.
                      </Text>
                    </View>

                    {/* Email Input */}
                    <View style={styles.inputWrapper}>
                      <View style={[
                        styles.inputContainer,
                        focusedInput === 'email' && styles.inputContainerFocused
                      ]}>
                        <View style={styles.iconInputContainer}>
                          <LinearGradient
                            colors={["#9B5DE5", "#7C3AED"]}
                            style={styles.iconInputGradient}
                          >
                            <Icon name="email" size={22} color="#fff" />
                          </LinearGradient>
                        </View>
                        <TextInput
                          placeholder="Enter your email address"
                          placeholderTextColor="#999"
                          style={styles.input}
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          onFocus={() => setFocusedInput('email')}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>
                    </View>

                    {/* Reset Button */}
                    <TouchableOpacity 
                      onPress={handleResetPassword} 
                      style={styles.buttonWrapper}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#e67e22", "#d35400"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.button}
                      >
                        {loading ? (
                          <View style={styles.loadingContainer}>
                            <Icon name="hourglass-empty" size={24} color="#fff" />
                            <Text style={styles.buttonText}>Sending...</Text>
                          </View>
                        ) : (
                          <>
                            <Icon name="send" size={22} color="#fff" />
                            <Text style={styles.buttonText}>Send Reset Link</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Security Note */}
                    <View style={styles.securityNote}>
                      <Icon name="shield" size={18} color="#10B981" />
                      <Text style={styles.securityText}>
                        Your security is our priority. The link will expire in 1 hour.
                      </Text>
                    </View>
                  </>
                ) : (
                  // Success State
                  <Animated.View 
                    style={[
                      styles.successContainer,
                      { 
                        opacity: successAnim,
                        transform: [{ scale: successAnim }]
                      }
                    ]}
                  >
                    <View style={styles.successIconContainer}>
                      <LinearGradient
                        colors={["#10B981", "#059669"]}
                        style={styles.successIconGradient}
                      >
                        <Icon name="mark-email-read" size={64} color="#fff" />
                      </LinearGradient>
                    </View>
                    
                    <Text style={styles.successTitle}>Check Your Email! 📧</Text>
                    <Text style={styles.successMessage}>
                      We've sent password reset instructions to:
                    </Text>
                    <Text style={styles.successEmail}>{email}</Text>
                    
                    <View style={styles.instructionsBox}>
                      <View style={styles.instructionItem}>
                        <Icon name="looks-one" size={24} color="#9B5DE5" />
                        <Text style={styles.instructionText}>Check your inbox (and spam folder)</Text>
                      </View>
                      <View style={styles.instructionItem}>
                        <Icon name="looks-two" size={24} color="#e67e22" />
                        <Text style={styles.instructionText}>Click the reset link in the email</Text>
                      </View>
                      <View style={styles.instructionItem}>
                        <Icon name="looks-3" size={24} color="#10B981" />
                        <Text style={styles.instructionText}>Create your new password</Text>
                      </View>
                    </View>

                    <TouchableOpacity 
                      style={styles.resendButton}
                      onPress={() => {
                        setEmailSent(false);
                        setEmail("");
                      }}
                    >
                      <Text style={styles.resendText}>Didn't receive the email? Try again</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      onPress={handleBackToLogin}
                      style={styles.backToLoginButton}
                    >
                      <LinearGradient
                        colors={["#9B5DE5", "#7C3AED"]}
                        style={styles.backToLoginGradient}
                      >
                        <Icon name="arrow-back" size={20} color="#fff" />
                        <Text style={styles.backToLoginText}>Back to Login</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Footer - Only show when not in success state */}
                {!emailSent && (
                  <View style={styles.footer}>
                    <Text style={styles.footerText}>Remember your password? </Text>
                    <TouchableOpacity onPress={handleBackToLogin}>
                      <Text style={styles.footerLink}>Login</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </LinearGradient>
            </Animated.View>

            {/* Help Section */}
            <Animated.View 
              style={[
                styles.helpContainer,
                { opacity: fadeAnim }
              ]}
            >
              <Icon name="help-outline" size={20} color="rgba(255,255,255,0.9)" />
              <Text style={styles.helpText}>
                Need help? Contact support@notetedd.com
              </Text>
            </Animated.View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    flex: 1,
    position: "relative",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
  },

  // Floating Background Elements
  floatingCircle: {
    position: "absolute",
    borderRadius: 1000,
    overflow: "hidden",
  },
  circle1: {
    width: 320,
    height: 320,
    top: -120,
    right: -120,
  },
  circle2: {
    width: 220,
    height: 220,
    bottom: 80,
    left: -60,
  },
  circle3: {
    width: 180,
    height: 180,
    top: height * 0.45,
    right: -40,
  },
  circleGradient: {
    flex: 1,
    borderRadius: 1000,
  },

  // Decorative Icons
  decorIcon: {
    position: "absolute",
  },
  decorIcon1: {
    top: 110,
    left: 35,
  },
  decorIcon2: {
    top: height * 0.35,
    right: 40,
  },
  decorIcon3: {
    bottom: 200,
    left: 45,
  },

  // Back Button
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },

  // Icon Section
  iconContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: "hidden",
    marginBottom: 20,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  iconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
    letterSpacing: 1,
  },
  iconSubtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  // Form Container
  formContainer: {
    borderRadius: 32,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
  },
  formGradient: {
    padding: 32,
    borderRadius: 32,
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    padding: 16,
    borderRadius: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 20,
    fontWeight: "500",
  },

  // Input Styles
  inputWrapper: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingRight: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  inputContainerFocused: {
    borderColor: "#9B5DE5",
    backgroundColor: "#FFFFFF",
    elevation: 6,
    shadowOpacity: 0.12,
  },
  iconInputContainer: {
    marginLeft: 12,
    marginRight: 12,
  },
  iconInputGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    height: 60,
    fontSize: 16,
    color: "#1F2937",
    fontWeight: "500",
  },

  // Button Styles
  buttonWrapper: {
    marginBottom: 24,
    borderRadius: 18,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#e67e22",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 0.8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // Security Note
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 14,
    borderRadius: 14,
    marginBottom: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "600",
    lineHeight: 18,
  },

  // Success State
  successContainer: {
    alignItems: "center",
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    marginBottom: 24,
    elevation: 10,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  successIconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  successMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  successEmail: {
    fontSize: 16,
    color: "#9B5DE5",
    fontWeight: "700",
    marginBottom: 28,
    textAlign: "center",
  },

  // Instructions Box
  instructionsBox: {
    width: "100%",
    backgroundColor: "rgba(155, 93, 229, 0.05)",
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    gap: 16,
  },
  instructionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
    lineHeight: 20,
  },

  // Resend Button
  resendButton: {
    paddingVertical: 12,
    marginBottom: 16,
  },
  resendText: {
    fontSize: 14,
    color: "#e67e22",
    fontWeight: "700",
    textAlign: "center",
  },

  // Back to Login Button
  backToLoginButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#9B5DE5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  backToLoginGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  backToLoginText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  footerText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },
  footerLink: {
    color: "#e67e22",
    fontSize: 15,
    fontWeight: "bold",
  },

  // Help Section
  helpContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    gap: 8,
  },
  helpText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});