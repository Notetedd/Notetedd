import React, { useState, useRef, useEffect } from "react";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Svg, { Path } from 'react-native-svg';
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
import { useTheme } from "./context/ThemeContext";
import { auth, db } from "../firebaseConfig";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import Toast, { showToast } from "../toastConfig";
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get("window");

// I define the shared cinematic palette — dark base, gold accent, purple highlight
const COLORS = {
  bg: "#0A0A0A",
  surface: "#111111",
  surfaceAlt: "#0E0E0E",
  border: "#1E1E1E",
  borderFocus: "#D35400",
  accent: "#D35400",       // Warm gold
  accentDim: "#8A6E3E",
  purple: "#7C3AED",
  purpleDim: "#5B21B6",
  orange: "#D35400",
  orangeBright: "#E67E22",
  text: "#F0EDE8",
  textMuted: "#6B6560",
  textSubtle: "#9A9490",
  success: "#2D6A4F",
  successText: "#52B788",
  error: "#CF4A4A",
  errorText: "#F87171",
  white: "#FFFFFF",
};

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

  // I configure Google Sign-In for mobile via expo-auth-session
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: 'EXPO_CLIENT_ID.apps.googleusercontent.com',
    iosClientId: '378006316872-i6jvms4t2qfaob42pv7405n8egpp98sk.apps.googleusercontent.com',
    androidClientId: '378006316872-agteaq0ft356k5ub7lajbk22mqg4s8m2.apps.googleusercontent.com',
    webClientId: '378006316872-gn2he51al2pbfbtm20ukr2550imnso3a.apps.googleusercontent.com',
  });

  // I handle the mobile Google Sign-In response when it resolves
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      handleGoogleCredential(credential);
    }
  }, [response]);

  // --- Animations ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const formSlide = useRef(new Animated.Value(60)).current;
  const lineScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // I stagger the entrance for a cinematic reveal sequence
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(formSlide, {
          toValue: 0,
          tension: 45,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.timing(lineScaleAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // I animate the exit before navigation to avoid jarring screen transitions
  const animateExit = (callback) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(callback);
  };

  // I validate all fields before attempting to create the account
  const validateInputs = () => {
    if (!fullName.trim()) {
      showToast("error", "Missing field", "Please enter your full name.");
      return false;
    }
    if (!email.trim()) {
      showToast("error", "Missing field", "Please enter your email address.");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast("error", "Invalid email", "Please enter a valid email address.");
      return false;
    }
    if (!password) {
      showToast("error", "Missing field", "Please enter a password.");
      return false;
    }
    if (password.length < 6) {
      showToast("error", "Weak password", "Password must be at least 6 characters.");
      return false;
    }
    if (!confirmPassword) {
      showToast("error", "Missing field", "Please confirm your password.");
      return false;
    }
    if (password !== confirmPassword) {
      showToast("error", "Mismatch", "Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleSignUp = async () => {
    if (!validateInputs()) return;

    if (!auth || !db) {
      showToast("error", "Service error", "Authentication service not ready. Please try again.");
      return;
    }

    try {
      setIsLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      if (!user) throw new Error("Sign up succeeded but user object is null.");

      // I update the display name immediately after account creation
      await updateProfile(user, { displayName: fullName.trim() });

      await setDoc(doc(db, "users", user.uid), {
        fullName: fullName.trim(),
        email: email.trim(),
        createdAt: new Date().toISOString(),
        authProvider: "email",
      });

      showToast("success", "Account created", "Welcome to NoteTedd.");
      animateExit(() => router.push("/LoginScreen"));

    } catch (error) {
      console.error("Sign up error:", error.code);
      const errorMap = {
        "auth/email-already-in-use": "This email is already registered.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Password is too weak. Choose a stronger one.",
        "auth/network-request-failed": "Network error. Check your connection.",
      };
      const message = errorMap[error.code] || "An error occurred. Please try again.";
      showToast("error", "Sign-up failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  // I handle the Firebase credential flow shared between mobile and web Google sign-up
  const handleGoogleCredential = async (credential) => {
    try {
      setIsLoading(true);
      const result = await signInWithCredential(auth, credential);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), {
        fullName: user.displayName || "Google User",
        email: user.email,
        createdAt: new Date().toISOString(),
        authProvider: "google",
        photoURL: user.photoURL || null,
      }, { merge: true });

      showToast("success", "Account ready", "Signed up with Google successfully.");
      animateExit(() => navigation.navigate("/HomeScreen"));
    } catch (error) {
      console.error("Google credential error:", error.code);
      showToast("error", "Error", "Google sign-up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // I use a web-specific popup flow for Google sign-up on browsers
  const handleWebGoogleSignUp = async () => {
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
        photoURL: user.photoURL || null,
      }, { merge: true });

      showToast("success", "Account ready", "Signed up with Google successfully.");
      animateExit(() => navigation.navigate("/HomeScreen"));
    } catch (error) {
      console.error("Web Google sign-up error:", error.code);
      const codeMap = {
        'auth/popup-closed-by-user': ["info", "Cancelled", "Sign-up was cancelled."],
        'auth/popup-blocked': ["error", "Popup blocked", "Please allow popups and try again."],
      };
      const [type, title, msg] = codeMap[error.code] || ["error", "Error", "Google sign-up failed."];
      showToast(type, title, msg);
    } finally {
      setIsLoading(false);
    }
  };

  // I route Google sign-up to the correct handler based on the current platform
  const handleGoogleSignUp = async () => {
    if (Platform.OS === 'web') {
      await handleWebGoogleSignUp();
    } else {
      if (!request) {
        showToast("error", "Configuration error", "Google Sign-In is not available.");
        return;
      }
      await promptAsync();
    }
  };

  // I compute password strength from multiple entropy signals
  const getPasswordStrength = () => {
    if (!password) return { strength: 0, label: "", color: COLORS.border };
    const checks = [
      password.length >= 6,
      password.length >= 10,
      /\d/.test(password),
      /[!@#$%^&*(),.?":{}|<>]/.test(password),
      /[A-Z]/.test(password) && /[a-z]/.test(password),
    ];
    const score = checks.filter(Boolean).length;
    if (score <= 1) return { strength: 1, label: "Weak", color: COLORS.error };
    if (score <= 3) return { strength: 2, label: "Fair", color: COLORS.orangeBright };
    return { strength: 3, label: "Strong", color: COLORS.successText };
  };

  const passwordStrength = getPasswordStrength();
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  // I use an inline SVG Google logo to avoid external asset dependencies
  const GoogleIcon = () => (
    <View style={{ width: 20, height: 20 }}>
      <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <Path d="M23.7449 12.27C23.7449 11.48 23.6749 10.73 23.5449 10H12.2549V14.51H18.7249C18.4349 15.99 17.5849 17.24 16.3249 18.09V21.09H20.1849C22.4449 19 23.7449 15.92 23.7449 12.27Z" fill="#4285F4"/>
        <Path d="M12.2549 24C15.4949 24 18.2049 22.92 20.1849 21.09L16.3249 18.09C15.2449 18.81 13.8749 19.25 12.2549 19.25C9.12492 19.25 6.47492 17.14 5.52492 14.29L1.54492 17.38C3.51492 21.3 7.56492 24 12.2549 24Z" fill="#34A853"/>
        <Path d="M5.52492 14.29C5.27492 13.57 5.14492 12.8 5.14492 12C5.14492 11.2 5.28492 10.43 5.52492 9.71V6.62L1.54492 9.71C0.724922 11.33 0.254922 13.15 0.254922 15C0.254922 16.85 0.724922 18.67 1.54492 20.29L5.52492 14.29Z" fill="#FBBC05"/>
        <Path d="M12.2549 4.75C14.0249 4.75 15.6049 5.36 16.8549 6.55L20.2749 3.13C18.2049 1.19 15.4949 0 12.2549 0C7.56492 0 3.51492 2.7 1.54492 6.62L5.52492 9.71C6.47492 6.86 9.12492 4.75 12.2549 4.75Z" fill="#EA4335"/>
      </Svg>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} translucent={false} />

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* I layer a faint horizontal grid over the background for cinematic depth */}
        <View style={styles.gridOverlay} pointerEvents="none">
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={[styles.gridLine, { top: `${i * 11}%` }]} />
          ))}
        </View>

        {/* I place two vertical accent lines — gold and purple — for visual tension */}
        <Animated.View
          style={[styles.verticalLineGold, { transform: [{ scaleY: lineScaleAnim }] }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.verticalLinePurple, { transform: [{ scaleY: lineScaleAnim }] }]}
          pointerEvents="none"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            overScrollMode="never"
          >
            {/* --- Brand Header --- */}
            <Animated.View
              style={[
                styles.brandContainer,
                { transform: [{ translateY: slideAnim }], opacity: fadeAnim }
              ]}
            >
              <View style={styles.logoWrapper}>
                <Image
                  source={require('../public/icon.jpeg')}
                  style={styles.logoImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.brandTextGroup}>
                <Text style={styles.brandName}>NoteTedd</Text>
                <View style={styles.brandRuleRow}>
                  <View style={[styles.brandRule, { backgroundColor: COLORS.accent }]} />
                  <View style={[styles.brandRule, { backgroundColor: COLORS.purple }]} />
                </View>
                <Text style={styles.brandTagline}>Learning redefined</Text>
              </View>
            </Animated.View>

            {/* --- Form Card --- */}
            <Animated.View
              style={[
                styles.formCard,
                {
                  transform: [{ translateY: formSlide }],
                  opacity: fadeAnim,
                }
              ]}
            >
              {/* I use a two-tone top border to visually echo the brand's orange + purple palette */}
              <View style={styles.cardAccentRow}>
                <View style={[styles.cardAccentSegment, { backgroundColor: COLORS.orange }]} />
                <View style={[styles.cardAccentSegment, { backgroundColor: COLORS.purple }]} />
              </View>

              <Text style={styles.formTitle}>Create account</Text>
              <Text style={styles.formSubtitle}>Join thousands of students learning smarter</Text>

              {/* Full Name Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>FULL NAME</Text>
                <View style={[
                  styles.inputRow,
                  focusedInput === 'name' && styles.inputRowFocused,
                  focusedInput === 'name' && { borderColor: COLORS.orange },
                ]}>
                  <Icon
                    name="person-outline"
                    size={16}
                    color={focusedInput === 'name' ? COLORS.orange : COLORS.textMuted}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    placeholder="Your full name"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.textInput}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    onFocus={() => setFocusedInput('name')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              {/* Email Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={[
                  styles.inputRow,
                  focusedInput === 'email' && styles.inputRowFocused,
                  focusedInput === 'email' && { borderColor: COLORS.accent },
                ]}>
                  <Icon
                    name="alternate-email"
                    size={16}
                    color={focusedInput === 'email' ? COLORS.accent : COLORS.textMuted}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.textInput}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedInput('email')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={[
                  styles.inputRow,
                  focusedInput === 'password' && styles.inputRowFocused,
                  focusedInput === 'password' && { borderColor: COLORS.purple },
                ]}>
                  <Icon
                    name="lock-outline"
                    size={16}
                    color={focusedInput === 'password' ? COLORS.purple : COLORS.textMuted}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    placeholder="Min. 6 characters"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon
                      name={showPassword ? "visibility" : "visibility-off"}
                      size={17}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* I show the password strength meter as soon as the user starts typing */}
                {password.length > 0 && (
                  <View style={styles.strengthRow}>
                    <View style={styles.strengthBars}>
                      {[1, 2, 3].map((level) => (
                        <View
                          key={level}
                          style={[
                            styles.strengthBar,
                            {
                              backgroundColor:
                                passwordStrength.strength >= level
                                  ? passwordStrength.color
                                  : COLORS.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                      {passwordStrength.label}
                    </Text>
                  </View>
                )}
              </View>

              {/* Confirm Password Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                <View style={[
                  styles.inputRow,
                  focusedInput === 'confirm' && styles.inputRowFocused,
                  focusedInput === 'confirm' && { borderColor: COLORS.purple },
                  passwordsMatch && { borderColor: COLORS.successText },
                  passwordsMismatch && { borderColor: COLORS.errorText },
                ]}>
                  <Icon
                    name="lock"
                    size={16}
                    color={
                      passwordsMatch
                        ? COLORS.successText
                        : passwordsMismatch
                        ? COLORS.errorText
                        : focusedInput === 'confirm'
                        ? COLORS.purple
                        : COLORS.textMuted
                    }
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    placeholder="Re-enter password"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    onFocus={() => setFocusedInput('confirm')}
                    onBlur={() => setFocusedInput(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon
                      name={showConfirmPassword ? "visibility" : "visibility-off"}
                      size={17}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* I display password match feedback inline below the field */}
                {confirmPassword.length > 0 && (
                  <View style={styles.matchRow}>
                    <Icon
                      name={passwordsMatch ? "check-circle" : "cancel"}
                      size={14}
                      color={passwordsMatch ? COLORS.successText : COLORS.errorText}
                    />
                    <Text style={[
                      styles.matchText,
                      { color: passwordsMatch ? COLORS.successText : COLORS.errorText }
                    ]}>
                      {passwordsMatch ? "Passwords match" : "Passwords don't match"}
                    </Text>
                  </View>
                )}
              </View>

              {/* Primary Sign-Up Button — orange to stay on-brand */}
              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                onPress={handleSignUp}
                disabled={isLoading}
                activeOpacity={0.75}
              >
                <View style={styles.primaryButtonInner}>
                  {isLoading ? (
                    <Text style={styles.primaryButtonText}>Creating account…</Text>
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Create account</Text>
                      <Icon name="arrow-forward" size={17} color={COLORS.white} />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-Up Button */}
              <TouchableOpacity
                style={[
                  styles.googleButton,
                  (isLoading || (Platform.OS !== 'web' && !request)) && styles.googleButtonDisabled
                ]}
                onPress={handleGoogleSignUp}
                disabled={isLoading || (Platform.OS !== 'web' && !request)}
                activeOpacity={0.75}
              >
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account?  </Text>
                <TouchableOpacity onPress={() => router.push("/LoginScreen")}>
                  <Text style={styles.footerLink}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            <View style={{ height: 48 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1100 : '100%',
    alignSelf: 'center',
  },

  // I layer a faint grid across the dark background for texture without decoration
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.022)',
  },

  // I use two vertical accent lines (gold + purple) to frame the layout cinematically
  verticalLineGold: {
    position: 'absolute',
    left: 28,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.16,
    zIndex: 0,
  },
  verticalLinePurple: {
    position: 'absolute',
    right: 28,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.purple,
    opacity: 0.14,
    zIndex: 0,
  },

  keyboardView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 32 : Platform.OS === 'ios' ? 48 : 72,
    paddingHorizontal: 28,
    paddingBottom: 24,
    justifyContent: 'center',
  },

  // --- Brand ---
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
    gap: 16,
  },
  logoWrapper: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  brandTextGroup: {
    flex: 1,
  },
  brandName: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' }),
  },
  brandRuleRow: {
    flexDirection: 'row',
    gap: 4,
    marginVertical: 5,
  },
  brandRule: {
    width: 20,
    height: 1.5,
  },
  brandTagline: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontWeight: '500',
  },

  // --- Form Card ---
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.65,
        shadowRadius: 40,
      },
      android: { elevation: 20 },
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.65,
        shadowRadius: 40,
      },
    }),
  },

  // I use a split orange + purple top rule to carry the dual accent through
  cardAccentRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  cardAccentSegment: {
    height: 2,
    width: 28,
    borderRadius: 18,
  },

  formTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' }),
    letterSpacing: 0.3,
  },
  formSubtitle: {
    fontSize: 13,
    color: COLORS.textSubtle,
    marginBottom: 28,
    letterSpacing: 0.3,
  },

  // --- Fields ---
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 50,
  },
  inputRowFocused: {
    backgroundColor: '#0F0F0F',
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '400',
    height: '100%',
    letterSpacing: 0.2,
  },
  eyeButton: {
    padding: 4,
  },

  // I show the strength meter with three colored bars below the password field
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 5,
    flex: 1,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    minWidth: 44,
    textAlign: 'right',
  },

  // I render the match indicator inline below the confirm field
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  matchText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // --- Primary Button (orange) ---
  primaryButton: {
    backgroundColor: COLORS.orange,
    borderRadius: 18,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // --- Google Button ---
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    height: 50,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: 28,
  },
  googleButtonDisabled: {
    opacity: 0.4,
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textSubtle,
  },
  footerLink: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '700',
  },
});