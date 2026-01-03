import React, { useState, useRef, useEffect } from "react";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { 
  View, 
  Text, 
  Image,
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "./context/ThemeContext";
import { auth, db } from "../firebaseConfig";
import { 
  createUserWithEmailAndPassword, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import Toast, { showToast } from "../toastConfig";

const { width, height } = Dimensions.get("window");

export default function AuthScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    const float1 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim1, {
          toValue: -20,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim1, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );

    const float2 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim2, {
          toValue: -30,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim2, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );

    const float3 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim3, {
          toValue: -15,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim3, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    );

    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    float1.start();
    float2.start();
    float3.start();
    rotate.start();
    pulse.start();

    return () => {
      float1.stop();
      float2.stop();
      float3.stop();
      rotate.stop();
      pulse.stop();
    };
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const validateInputs = () => {
    if (!fullName.trim()) {
      showToast("error", "Error", "Please enter your full name.");
      return false;
    }

    if (!email.trim()) {
      showToast("error", "Error", "Please enter your email address.");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("error", "Error", "Please enter a valid email address.");
      return false;
    }

    if (!password) {
      showToast("error", "Error", "Please enter a password.");
      return false;
    }

    if (password.length < 6) {
      showToast("error", "Error", "Password must be at least 6 characters.");
      return false;
    }

    if (!confirmPassword) {
      showToast("error", "Error", "Please confirm your password.");
      return false;
    }

    if (password !== confirmPassword) {
      showToast("error", "Error", "Passwords do not match!");
      return false;
    }

    return true;
  };

  const handleSignUp = async () => {
    if (!validateInputs()) return;

    if (!auth || !db) {
      showToast("error", "Error", "Authentication service not ready. Please try again.");
      return;
    }

    try {
      setIsLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user) {
        throw new Error("Sign up succeeded but user object is null");
      }

      await updateProfile(user, { displayName: fullName });

      await setDoc(doc(db, "users", user.uid), {
        fullName,
        email,
        createdAt: new Date().toISOString(),
        authProvider: "email",
      });

      showToast("success", "Success", "Account created successfully!");
      
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

    } catch (error) {
      console.error("Sign up error:", error);
      let errorMessage = "An error occurred. Please try again.";
      
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak.";
      }
      
      showToast("error", "Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (Platform.OS !== 'web') {
      showToast("info", "Coming Soon", "Google Sign-Up on mobile is coming soon! Please use email sign-up.");
      return;
    }

    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), {
        fullName: user.displayName || "Google User",
        email: user.email,
        createdAt: new Date().toISOString(),
        authProvider: "google",
        photoURL: user.photoURL,
      }, { merge: true });

      showToast("success", "Success", "Signed up with Google successfully!");
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        router.push("/HomeScreen");
      });

    } catch (error) {
      console.error("Google Sign Up Error:", error);
      showToast("error", "Error", "Google sign-up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (!password) return { strength: 0, label: "", color: "#E5E7EB" };
    
    const length = password.length;
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);

    let strength = 0;
    if (length >= 6) strength++;
    if (length >= 8) strength++;
    if (hasNumbers) strength++;
    if (hasSpecialChars) strength++;
    if (hasUpperCase && hasLowerCase) strength++;

    if (strength <= 1) return { strength: 1, label: "Weak", color: "#EF4444" };
    if (strength <= 3) return { strength: 2, label: "Medium", color: "#F59E0B" };
    return { strength: 3, label: "Strong", color: "#10B981" };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <StatusBar
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
          translucent={false}
        />
        
        {/* Animated Background Gradient - Brand Colors */}
        <LinearGradient
          colors={["#e67e22", "#d35400", "#c0392b"]}
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
              colors={["rgba(255,255,255,0.15)", "rgba(255,255,255,0.05)"]}
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
              colors={["rgba(255,255,255,0.1)", "rgba(255,255,255,0.03)"]}
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
              colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0.04)"]}
              style={styles.circleGradient}
            />
          </Animated.View>

          {/* Decorative Icons */}
          <Animated.View style={[styles.decorIcon, styles.decorIcon1, { opacity: fadeAnim }]}>
            <Icon name="school" size={40} color="rgba(255,255,255,0.25)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon2, { opacity: fadeAnim }]}>
            <Icon name="lightbulb" size={35} color="rgba(255,255,255,0.2)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon3, { opacity: fadeAnim }]}>
            <Icon name="star" size={30} color="rgba(255,255,255,0.22)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon4, { opacity: fadeAnim }]}>
            <Icon name="auto-awesome" size={32} color="rgba(255,255,255,0.18)" />
          </Animated.View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              overScrollMode="never"
            >
              {/* Logo/Brand Section */}
              <Animated.View 
                style={[
                  styles.brandContainer,
                  { 
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
                  }
                ]}
              >
                <Animated.View 
                  style={[
                    styles.logoCircle,
                    { transform: [{ scale: pulseAnim }] }
                  ]}
                >
                  <LinearGradient
                    colors={["#ffffff", "#f8f9fa"]}
                    style={styles.logoGradient}
                  >
                    <Icon name="note" size={48} color="#e67e22" />
                  </LinearGradient>
                </Animated.View>
                <Text style={styles.brandName}>NoteTedd</Text>
                <Text style={styles.brandTagline}>Learning redefined</Text>
              </Animated.View>

              {/* Form Container */}
              <Animated.View 
                style={[
                  styles.formContainer,
                  { 
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }]
                  }
                ]}
              >
                <LinearGradient
                  colors={["rgba(255,255,255,0.98)", "rgba(255,255,255,0.95)"]}
                  style={styles.formGradient}
                >
                  <Text style={styles.title}>Create Account</Text>
                  <Text style={styles.subtitle}>Join thousands of students learning smarter</Text>

                  {/* Full Name Input */}
                  <View style={styles.inputWrapper}>
                    <View style={[
                      styles.inputContainer,
                      focusedInput === 'name' && styles.inputContainerFocused
                    ]}>
                      <View style={styles.iconContainer}>
                        <Icon name="person" size={22} color="#e67e22" />
                      </View>
                      <TextInput
                        placeholder="Full Name"
                        placeholderTextColor="#999"
                        style={styles.input}
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                        onFocus={() => setFocusedInput('name')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                  </View>

                  {/* Email Input */}
                  <View style={styles.inputWrapper}>
                    <View style={[
                      styles.inputContainer,
                      focusedInput === 'email' && styles.inputContainerFocused
                    ]}>
                      <View style={styles.iconContainer}>
                        <Icon name="email" size={22} color="#e67e22" />
                      </View>
                      <TextInput
                        placeholder="Email Address"
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

                  {/* Password Input */}
                  <View style={styles.inputWrapper}>
                    <View style={[
                      styles.inputContainer,
                      focusedInput === 'password' && styles.inputContainerFocused
                    ]}>
                      <View style={styles.iconContainer}>
                        <Icon name="lock" size={22} color="#e67e22" />
                      </View>
                      <TextInput
                        placeholder="Password (min. 6 characters)"
                        placeholderTextColor="#999"
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        onFocus={() => setFocusedInput('password')}
                        onBlur={() => setFocusedInput(null)}
                      />
                      <TouchableOpacity 
                        style={styles.eyeIcon}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <Icon 
                          name={showPassword ? "visibility" : "visibility-off"} 
                          size={22} 
                          color="#999" 
                        />
                      </TouchableOpacity>
                    </View>
                    
                    {/* Password Strength Indicator */}
                    {password.length > 0 && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthBars}>
                          <View style={[
                            styles.strengthBar, 
                            { backgroundColor: passwordStrength.strength >= 1 ? passwordStrength.color : '#E5E7EB' }
                          ]} />
                          <View style={[
                            styles.strengthBar, 
                            { backgroundColor: passwordStrength.strength >= 2 ? passwordStrength.color : '#E5E7EB' }
                          ]} />
                          <View style={[
                            styles.strengthBar, 
                            { backgroundColor: passwordStrength.strength >= 3 ? passwordStrength.color : '#E5E7EB' }
                          ]} />
                        </View>
                        <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                          {passwordStrength.label}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Confirm Password Input */}
                  <View style={styles.inputWrapper}>
                    <View style={[
                      styles.inputContainer,
                      focusedInput === 'confirmPassword' && styles.inputContainerFocused
                    ]}>
                      <View style={styles.iconContainer}>
                        <Icon name="lock-outline" size={22} color="#e67e22" />
                      </View>
                      <TextInput
                        placeholder="Confirm Password"
                        placeholderTextColor="#999"
                        style={styles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                        autoCapitalize="none"
                        onFocus={() => setFocusedInput('confirmPassword')}
                        onBlur={() => setFocusedInput(null)}
                      />
                      <TouchableOpacity 
                        style={styles.eyeIcon}
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        <Icon 
                          name={showConfirmPassword ? "visibility" : "visibility-off"} 
                          size={22} 
                          color="#999" 
                        />
                      </TouchableOpacity>
                    </View>
                    
                    {/* Password Match Indicator */}
                    {confirmPassword.length > 0 && (
                      <View style={styles.matchContainer}>
                        <Icon 
                          name={password === confirmPassword ? "check-circle" : "cancel"} 
                          size={16} 
                          color={password === confirmPassword ? "#10B981" : "#EF4444"} 
                        />
                        <Text style={[
                          styles.matchText,
                          { color: password === confirmPassword ? "#10B981" : "#EF4444" }
                        ]}>
                          {password === confirmPassword ? "Passwords match" : "Passwords don't match"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Sign Up Button */}
                  <TouchableOpacity 
                    onPress={handleSignUp} 
                    style={styles.buttonWrapper}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#e67e22", "#d35400"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.button}
                    >
                      {isLoading ? (
                        <View style={styles.loadingContainer}>
                          <Icon name="hourglass-empty" size={24} color="#fff" />
                          <Text style={styles.buttonText}>Creating Account...</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.buttonText}>Sign Up</Text>
                          <Icon name="arrow-forward" size={20} color="#fff" />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Divider */}
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  {/* Google Sign Up Button */}
                  <TouchableOpacity 
                    onPress={handleGoogleSignUp}
                    style={styles.googleButton}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <Icon name="login" size={22} color="#4285F4" />
                    <Text style={styles.googleButtonText}>Sign up with Google</Text>
                  </TouchableOpacity>

                  {/* Footer */}
                  <View style={styles.footer}>
                    <Text style={styles.footerText}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => router.push("/LoginScreen")}>
                      <Text style={styles.footerLink}>Login</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </Animated.View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>

        <Toast />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#e67e22",
  },
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    maxWidth: Platform.OS === 'web' ? 1200 : '100%',
  },
  gradientBackground: {
    flex: 1,
    position: "relative",
    width: '100%',
  },
  keyboardView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 20 : Platform.OS === 'ios' ? 40 : 50,
    paddingHorizontal: 24,
    paddingBottom: 20,
    width: '100%',
  },

  // Floating Background Elements
  floatingCircle: {
    position: "absolute",
    borderRadius: 1000,
    overflow: "hidden",
  },
  circle1: {
    width: 280,
    height: 280,
    top: -100,
    right: -100,
  },
  circle2: {
    width: 200,
    height: 200,
    bottom: 100,
    left: -50,
  },
  circle3: {
    width: 150,
    height: 150,
    top: height * 0.4,
    right: -30,
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
    top: Platform.OS === 'android' ? 60 : Platform.OS === 'ios' ? 100 : 100,
    left: 40,
  },
  decorIcon2: {
    top: height * 0.3,
    right: 30,
  },
  decorIcon3: {
    bottom: Platform.OS === 'android' ? 150 : 180,
    left: 50,
  },
  decorIcon4: {
    top: height * 0.5,
    left: 30,
  },

  // Brand Section
  brandContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: "hidden",
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
  },
  logoGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 6,
    letterSpacing: 1,
    ...Platform.select({
      ios: {
        textShadowColor: "rgba(0,0,0,0.4)",
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 6,
      },
      android: {
        textShadowColor: "rgba(0,0,0,0.4)",
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 6,
      },
    }),
  },
  brandTagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
    textAlign: "center",
    ...Platform.select({
      ios: {
        textShadowColor: "rgba(0,0,0,0.2)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {
        textShadowColor: "rgba(0,0,0,0.2)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
    }),
  },

  // Form Container
  formContainer: {
    borderRadius: 28,
    overflow: "hidden",
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 14,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  formGradient: {
    padding: 24,
    borderRadius: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: "#1F2937",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
    color: "#6B7280",
    fontWeight: "600",
  },

  // Input Styles
  inputWrapper: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingRight: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
    }),
  },
  inputContainerFocused: {
    borderColor: "#e67e22",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.08,
      },
      android: {
        elevation: 3,
      },
      web: {
        shadowOpacity: 0.08,
      },
    }),
  },
  iconContainer: {
    width: 48,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: "#1F2937",
    fontWeight: "500",
  },
  eyeIcon: {
    padding: 8,
  },

  // Password Strength
  strengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  strengthBars: {
    flexDirection: "row",
    flex: 1,
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 60,
  },

  // Password Match
  matchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  matchText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Button Styles
  buttonWrapper: {
    marginTop: 8,
    marginBottom: 18,
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#e67e22",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      web: {
        shadowColor: "#e67e22",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // Divider
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "600",
  },

  // Google Button
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    marginBottom: 20,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  footerLink: {
    color: "#e67e22",
    fontSize: 14,
    fontWeight: "bold",
  },
});