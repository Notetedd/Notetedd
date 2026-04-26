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
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Toast, { showToast } from "../toastConfig";

// I use expo-auth-session for mobile Google Sign-In
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get("window");

// I define the color palette here for easy theming
const COLORS = {
  bg: "#0A0A0A",
  surface: "#111111",
  border: "#1E1E1E",
  borderFocus: "#e98519",
  accent: "#f3790f",       // Warm gold — cinematic
  accentDim: "#eb7b0b",
  text: "#F0EDE8",
  textMuted: "#6B6560",
  textSubtle: "#9A9490",
  white: "#FFFFFF",
  error: "#CF4A4A",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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

  // I listen for persistent auth state on mount — if the user is already signed in,
  // I redirect them immediately without requiring a fresh login
  // useEffect(() => {
  //   const unsubscribe = onAuthStateChanged(auth, async (user) => {
  //     if (user) {
  //       const userDoc = await getDoc(doc(db, "users", user.uid));
  //       const fullName = userDoc.exists()
  //         ? userDoc.data().fullName || "User"
  //         : user.displayName || "User";
  //       router.replace({ pathname: "/HomeScreen", params: { username: fullName } });
  //     }
  //   });
  //   // I clean up the listener when the component unmounts
  //   return () => unsubscribe();
  // }, []);

  // I handle the mobile Google Sign-In response here
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
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lineScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // I stagger the entrance animations for a cinematic reveal
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
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // I trigger a shake animation on login failure for tactile feedback
  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // I animate the exit before navigation for a seamless transition
  const animateExit = (callback) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(callback);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showToast("error", "Missing fields", "Please enter your email and password.");
      shakeAnimation();
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (userDoc.exists()) {
        const fullName = userDoc.data().fullName || "User";
        showToast("success", "Welcome back", `Hello, ${fullName}.`);
        animateExit(() => {
          router.push({ pathname: "/HomeScreen", params: { username: fullName } });
        });
      } else {
        showToast("error", "Error", "User record not found.");
        shakeAnimation();
      }
    } catch (error) {
      console.error("Login error:", error.code);
      const errorMap = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password. Try again.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/invalid-credential": "Invalid email or password.",
        "auth/too-many-requests": "Too many attempts. Please wait before retrying.",
      };
      const message = errorMap[error.code] || "Sign-in failed. Please try again.";
      showToast("error", "Sign-in failed", message);
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  // I handle Firebase credential sign-in shared between mobile and web Google flows
  const handleGoogleCredential = async (credential) => {
    try {
      setLoading(true);
      const result = await signInWithCredential(auth, credential);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        await setDoc(userRef, {
          fullName: user.displayName || "Google User",
          email: user.email,
          createdAt: new Date().toISOString(),
          authProvider: "google",
          photoURL: user.photoURL || null,
        });
      }

      const fullName = userDoc.exists()
        ? userDoc.data().fullName
        : user.displayName || "User";

      showToast("success", "Welcome back", `Hello, ${fullName}.`);
      animateExit(() => {
        router.push({ pathname: "/HomeScreen", params: { username: fullName } });
      });
    } catch (error) {
      console.error("Google credential error:", error.code);
      showToast("error", "Error", "Google sign-in failed. Please try again.");
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  // I handle web-specific Google sign-in using a popup
  const handleWebGoogleSignIn = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        await setDoc(userRef, {
          fullName: user.displayName || "Google User",
          email: user.email,
          createdAt: new Date().toISOString(),
          authProvider: "google",
          photoURL: user.photoURL || null,
        });
      }

      const fullName = userDoc.exists()
        ? userDoc.data().fullName
        : user.displayName || "User";

      showToast("success", "Welcome back", `Hello, ${fullName}.`);
      animateExit(() => {
        router.push({ pathname: "/HomeScreen", params: { username: fullName } });
      });
    } catch (error) {
      console.error("Web Google sign-in error:", error.code);
      const codeMap = {
        'auth/popup-closed-by-user': ["info", "Cancelled", "Sign-in was cancelled."],
        'auth/popup-blocked': ["error", "Popup blocked", "Please allow popups and try again."],
      };
      const [type, title, msg] = codeMap[error.code] || ["error", "Error", "Google sign-in failed."];
      showToast(type, title, msg);
      shakeAnimation();
    } finally {
      setLoading(false);
    }
  };

  // I route Google sign-in to the correct handler based on platform
  const handleGoogleSignIn = async () => {
    if (Platform.OS === 'web') {
      await handleWebGoogleSignIn();
    } else {
      if (!request) {
        showToast("error", "Configuration error", "Google Sign-In is not available.");
        return;
      }
      await promptAsync();
    }
  };

  // I use a clean inline SVG for the Google logo to avoid asset dependencies
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
        {/* I use a subtle noise-like grid texture overlay for depth */}
        <View style={styles.gridOverlay} pointerEvents="none">
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={[styles.gridLine, { top: `${i * 14}%` }]} />
          ))}
        </View>

        {/* I position the accent rule vertically for cinematic framing */}
        <Animated.View
          style={[
            styles.verticalAccentLine,
            { transform: [{ scaleY: lineScaleAnim }] }
          ]}
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
                <View style={styles.brandRule} />
                <Text style={styles.brandTagline}>Learning made easier</Text>
              </View>
            </Animated.View>

            {/* --- Form Card --- */}
            <Animated.View
              style={[
                styles.formCard,
                {
                  transform: [
                    { translateY: formSlide },
                    { translateX: shakeAnim }
                  ],
                  opacity: fadeAnim,
                }
              ]}
            >
              {/* I use a top accent border to anchor the card visually */}
              <View style={styles.cardAccentBorder} />

              <Text style={styles.formTitle}>Log in</Text>
              <Text style={styles.formSubtitle}>Continue your learning journey</Text>

              {/* Email Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={[
                  styles.inputRow,
                  focusedInput === 'email' && styles.inputRowFocused
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
                  focusedInput === 'password' && styles.inputRowFocused
                ]}>
                  <Icon
                    name="lock-outline"
                    size={16}
                    color={focusedInput === 'password' ? COLORS.accent : COLORS.textMuted}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    placeholder="••••••••••"
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
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot Password */}
              <TouchableOpacity
                style={styles.forgotRow}
                onPress={() => router.push("/ResetPasswordScreen")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Primary Login Button */}
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.75}
              >
                {loading ? (
                  <Text style={styles.primaryButtonText}>Signing in…</Text>
                ) : (
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>Sign in</Text>
                    <Icon name="arrow-forward" size={18} color={COLORS.bg} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-In Button */}
              <TouchableOpacity
                style={[styles.googleButton, (loading || (Platform.OS !== 'web' && !request)) && styles.googleButtonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={loading || (Platform.OS !== 'web' && !request)}
                activeOpacity={0.75}
              >
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>No account yet?{" "}</Text>
                <TouchableOpacity onPress={() => router.push("/AuthScreen")}>
                  <Text style={styles.footerLink}>Create one</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Bottom tagline */}
            <Animated.View style={[styles.bottomBadge, { opacity: fadeAnim }]}>
              <Icon name="shield" size={13} color={COLORS.textMuted} />
              <Text style={styles.bottomBadgeText}>Trusted by 10,000+ students</Text>
            </Animated.View>

            <View style={{ height: 40 }} />
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

  // I layer a subtle horizontal grid to give the background depth without gradients
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },

  // I use a thin vertical gold line as a cinematic compositional device
  verticalAccentLine: {
    position: 'absolute',
    left: 28,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.18,
    zIndex: 0,
    transformOrigin: 'top',
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
    minHeight: height - 80,
  },

  // --- Brand ---
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 44,
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
  brandRule: {
    width: 32,
    height: 1.5,
    backgroundColor: COLORS.accent,
    marginVertical: 5,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : '100%',
    alignSelf: 'center',
    // I keep shadows minimal and dark for the noir feel
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.6,
        shadowRadius: 40,
      },
      android: { elevation: 20 },
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.6,
        shadowRadius: 40,
      },
    }),
  },
  // I use the top accent bar as a visual signature for the card
  cardAccentBorder: {
    height: 2,
    backgroundColor: COLORS.accent,
    marginBottom: 28,
    width: 40,
  },
  formTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', web: 'Georgia, serif' }),
    letterSpacing: 0.3,
  },
  formSubtitle: {
    fontSize: 13,
    color: COLORS.textSubtle,
    marginBottom: 32,
    letterSpacing: 0.3,
  },

  // --- Fields ---
  fieldGroup: {
    marginBottom: 20,
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
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
  },
  inputRowFocused: {
    borderColor: COLORS.accent,
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

  // Forgot password
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 24,
    marginTop: -8,
  },
  forgotText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // --- Primary Button ---
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.bg,
    letterSpacing: 1,
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
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 1,
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
    borderRadius: 16,
    height: 52,
    backgroundColor: '#0E0E0E',
    marginBottom: 28,
  },
  googleButtonDisabled: {
    opacity: 0.45,
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

  // Bottom badge
  bottomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
  },
  bottomBadgeText: {
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});