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
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Toast, { showToast } from "../toastConfig";

const { width, height } = Dimensions.get("window");

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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
    );

    const float2 = Animated.loop(
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
    );

    const float3 = Animated.loop(
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
    );

    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 25000,
        useNativeDriver: true,
      })
    );

    const pulse = Animated.loop(
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

  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showToast("error", "Error", "Please fill in all fields.");
      shakeAnimation();
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const fullName = userData.fullName || "User";

        showToast("success", "Welcome Back!", `Hello, ${fullName}! 👋`);

        // Smooth exit animation
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
          router.push({ pathname: "/HomeScreen", params: { username: fullName } });
        });
      } else {
        showToast("error", "Error", "User not found.");
        shakeAnimation();
      }
    } catch (error) {
      console.error("Login error:", error);
      let errorMessage = "Invalid email or password.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Incorrect password.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }
      
      showToast("error", "Login Failed", errorMessage);
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== 'web') {
      showToast("info", "Coming Soon", "Google Sign-In on mobile is coming soon! Please use email login.");
      return;
    }

    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Get or create user document
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          fullName: user.displayName || "Google User",
          email: user.email,
          createdAt: new Date().toISOString(),
          authProvider: "google",
          photoURL: user.photoURL,
        });
      }

      const fullName = userDoc.exists() 
        ? userDoc.data().fullName 
        : user.displayName || "User";

      showToast("success", "Welcome Back!", `Hello, ${fullName}! 🎉`);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        router.push({ pathname: "/HomeScreen", params: { username: fullName } });
      });

    } catch (error) {
      console.error("Google Sign In Error:", error);
      showToast("error", "Error", "Google sign-in failed. Please try again.");
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push("/ResetPasswordScreen");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <StatusBar
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
          translucent={false}
        />
        
        {/* Animated Background Gradient */}
        <LinearGradient
          colors={["#d35400", "#d35400"]}
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
            <Icon name="book" size={45} color="rgba(255,255,255,0.25)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon2, { opacity: fadeAnim }]}>
            <Icon name="grade" size={38} color="rgba(255,255,255,0.22)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon3, { opacity: fadeAnim }]}>
            <Icon name="psychology" size={42} color="rgba(255,255,255,0.2)" />
          </Animated.View>
          <Animated.View style={[styles.decorIcon, styles.decorIcon4, { opacity: fadeAnim }]}>
            <Icon name="celebration" size={35} color="rgba(255,255,255,0.18)" />
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
                    <Image source={require('./../assets/images/icon.png')} style={{ width: 48, height: 48, tintColor: "#9B5DE5" }} />
                  </LinearGradient>
                </Animated.View>
                <Text style={styles.brandName}>NoteTedd</Text>
                <Text style={styles.brandTagline}>Smart Learning Platform</Text>
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
                  colors={["rgba(255,255,255,0.96)", "rgba(255,255,255,0.96)"]}
                  style={styles.formGradient}
                >
                  <Text style={styles.title}>Welcome Back</Text>
                  <Text style={styles.subtitle}>Sign in to continue your smart learning journey</Text>

                  {/* Email Input */}
                  <View style={styles.inputWrapper}>
                    <View style={[
                      styles.inputContainer,
                      focusedInput === 'email' && styles.inputContainerFocused
                    ]}>
                      <View style={styles.iconContainer}>
                        <LinearGradient
                          colors={["#9B5DE5", "#7C3AED"]}
                          style={styles.iconGradient}
                        >
                          <Icon name="email" size={20} color="#fff" />
                        </LinearGradient>
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
                        <LinearGradient
                          colors={["#e67e22", "#d35400"]}
                          style={styles.iconGradient}
                        >
                          <Icon name="lock" size={20} color="#fff" />
                        </LinearGradient>
                      </View>
                      <TextInput
                        placeholder="Password"
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
                  </View>

                  {/* Forgot Password */}
                  <TouchableOpacity 
                    style={styles.forgotPassword}
                    onPress={handleForgotPassword}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                  </TouchableOpacity>

                  {/* Login Button */}
                  <TouchableOpacity 
                    onPress={handleLogin} 
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
                          <Text style={styles.buttonText}>Logging in...</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.buttonText}>Login</Text>
                          <Icon name="login" size={20} color="#fff" />
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

                  {/* Google Sign In Button */}
                  <TouchableOpacity 
                    onPress={handleGoogleSignIn}
                    style={styles.googleButton}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <View style={styles.googleContent}>
                      <Image
                        source={{ uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' }}
                        style={styles.googleIcon}
                      />
                      <Text style={styles.googleButtonText}>Sign in with Google</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Footer */}
                  <View style={styles.footer}>
                    <Text style={styles.footerText}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => router.push("/AuthScreen")}>
                      <Text style={styles.footerLink}>Sign Up</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Trust Badge */}
              <Animated.View 
                style={[
                  styles.trustBadge,
                  { opacity: fadeAnim }
                ]}
              >
                <Icon name="verified-user" size={20} color="rgba(255,255,255,0.9)" />
                <Text style={styles.trustText}>Trusted by 10,000+ students worldwide</Text>
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
    backgroundColor: "#d35400",
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1200 : '100%',
    alignSelf: 'center',
  },
  gradientBackground: {
    flex: 1,
    width: '100%',
  },
  keyboardView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 20 : Platform.OS === 'ios' ? 40 : 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
    justifyContent: "center",
    minHeight: height - (Platform.OS === 'android' ? 0 : 100),
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
    width: 160,
    height: 160,
    top: height * 0.45,
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
    top: Platform.OS === 'android' ? 60 : Platform.OS === 'ios' ? 100 : 110,
    left: 35,
  },
  decorIcon2: {
    top: height * 0.25,
    right: 40,
  },
  decorIcon3: {
    bottom: Platform.OS === 'android' ? 150 : 200,
    left: 45,
  },
  decorIcon4: {
    top: height * 0.55,
    left: 25,
  },

  // Brand Section
  brandContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
      },
      android: {
        elevation: 12,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
      },
    }),
  },
  logoGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 38,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: 1.5,
    ...Platform.select({
      ios: {
        textShadowColor: "rgba(0,0,0,0.4)",
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 8,
      },
      android: {
        textShadowColor: "rgba(0,0,0,0.4)",
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 8,
      },
    }),
  },
  brandTagline: {
    fontSize: 16,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
    textAlign: "center",
    ...Platform.select({
      ios: {
        textShadowColor: "rgba(0,0,0,0.25)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      },
      android: {
        textShadowColor: "rgba(0,0,0,0.25)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
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
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 25,
      },
      android: {
        elevation: 16,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 25,
      },
    }),
  },
  formGradient: {
    padding: 28,
    borderRadius: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    color: "#1F2937",
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 28,
    color: "#6B7280",
    fontWeight: "600",
    lineHeight: 20,
  },

  // Input Styles
  inputWrapper: {
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingRight: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
    }),
  },
  inputContainerFocused: {
    borderColor: "#9B5DE5",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.12,
      },
      android: {
        elevation: 4,
      },
      web: {
        shadowOpacity: 0.12,
      },
    }),
  },
  iconContainer: {
    marginLeft: 12,
    marginRight: 12,
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: "#1F2937",
    fontWeight: "500",
  },
  eyeIcon: {
    padding: 8,
  },

  // Forgot Password
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: "#9B5DE5",
    fontWeight: "700",
  },

  // Button Styles
  buttonWrapper: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#e67e22",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
      web: {
        shadowColor: "#e67e22",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
    }),
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
    letterSpacing: 0.8,
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
    marginBottom: 20,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    marginBottom: 20,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
    }),
  },
  googleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    letterSpacing: 0.3,
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

  // Trust Badge
  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    gap: 8,
  },
  trustText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});