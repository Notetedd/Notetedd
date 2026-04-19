import React, { useRef, useEffect, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Platform,
  useColorScheme,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider } from "./context/ThemeContext";
import { Stack } from "expo-router";
import { SubscriptionProvider, useSubscription } from "./context/SubscriptionContext";
import * as Notifications from "expo-notifications";
import {
  setupNotificationHandler,
  handleNotificationTap,
  checkAndClearPaywallLaunchFlag,
} from "./utils/trialNotifications";
import GlobalPaywall from "./components/GlobalPaywall";
import TrialBanner from "./components/TrialBanner";

// ════════════════════════════════════════════════════════════════
//  THEME TOKENS
//  I keep the two palettes here so the nav can adapt instantly
//  when the user switches themes — no extra context needed.
// ════════════════════════════════════════════════════════════════

const THEME = {
  dark: {
    shell:       "#0D0D0F",
    shellBorder: "#FFFFFF0D",
    shellShadow: "#000000",
    rule:        "#C8A96E",
    iconInactive:"#3A3840",
    labelInactive:"#3A3840",
    dotTrack:    "#1A1820",
  },
  light: {
    shell:       "#F4F2EF",
    shellBorder: "#00000012",
    shellShadow: "#00000040",
    rule:        "#C8A96E",
    iconInactive:"#C2BEB8",
    labelInactive:"#C2BEB8",
    dotTrack:    "#E8E4DE",
  },
};

// ════════════════════════════════════════════════════════════════
//  NAV ITEMS
//  I use Ionicons for a richer, more modern icon vocabulary.
//  Each tab carries an active icon, inactive icon, accent color,
//  and a secondary glow color for the halo effect.
// ════════════════════════════════════════════════════════════════

const navItems = [
  {
    iconActive:   "home",
    iconInactive: "home-outline",
    path:         "/HomeScreen",
    label:        "Home",
    color:        "#C8A96E",   // warm gold
    glow:         "#C8A96E40",
  },
  {
    iconActive:   "mic",
    iconInactive: "mic-outline",
    path:         "/RecordScreen",
    label:        "Record",
    color:        "#E8603C",   // ember
    glow:         "#E8603C40",
  },
  {
    iconActive:   "book",
    iconInactive: "book-outline",
    path:         "/NotesScreen",
    label:        "Notes",
    color:        "#8B5CF6",   // violet
    glow:         "#8B5CF640",
  },
  {
    iconActive:   "headset",
    iconInactive: "headset-outline",
    path:         "/AudioNotesScreen",
    label:        "Audio",
    color:        "#2DD4BF",   // teal
    glow:         "#2DD4BF40",
  },
  {
    iconActive:   "flash",
    iconInactive: "flash-outline",
    path:         "/QuizScreen",
    label:        "Quiz",
    color:        "#F472B6",   // rose
    glow:         "#F472B640",
  },
];

// ════════════════════════════════════════════════════════════════
//  INNER LAYOUT
//  All logic from the original is preserved exactly.
//  Only the nav render block and its stylesheet are new.
// ════════════════════════════════════════════════════════════════

function InnerLayout() {
  const { setShowPaywall } = useSubscription();
  const router   = useRouter();
  const pathname = usePathname() || "";

  // I detect the system color scheme to drive light/dark nav theming
  const colorScheme = useColorScheme();
  const isDark      = colorScheme !== "light";
  const T           = isDark ? THEME.dark : THEME.light;

  const [activeIndex, setActiveIndex] = useState(
    navItems.findIndex((item) => item.path === pathname)
  );

  // Per-item animated values
  const animationRefs = useRef(
    navItems.map(() => ({
      scale:        new Animated.Value(1),
      translateY:   new Animated.Value(0),
      labelOpacity: new Animated.Value(0),
      iconScale:    new Animated.Value(1),
      glowOpacity:  new Animated.Value(0),   // halo pulse
      glowScale:    new Animated.Value(0.6), // halo scale
    }))
  ).current;

  // Sliding blob indicator
  const pillX = useRef(new Animated.Value(0)).current;

  // Blob "breathe" — subtle scale oscillation while active
  const blobBreath = useRef(new Animated.Value(1)).current;

  const hiddenPaths = ["/", "/LoginScreen", "/AuthScreen", "/ResetPasswordScreen", "/OnboardingScreen"];

  // ── Notification wiring (ORIGINAL — untouched) ───────────────
  useEffect(() => {
    setupNotificationHandler();
    checkAndClearPaywallLaunchFlag().then((shouldOpen) => {
      if (shouldOpen) setTimeout(() => setShowPaywall(true), 1000);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => handleNotificationTap(response, () => setShowPaywall(true))
    );
    return () => sub.remove();
  }, []);

  // ── Sync active index with pathname (ORIGINAL — untouched) ───
  useEffect(() => {
    const idx = navItems.findIndex((item) => item.path === pathname);
    if (idx !== -1) setActiveIndex(idx);
  }, [pathname]);

  // ── Blob breath loop — starts/restarts whenever activeIndex changes
  useEffect(() => {
    blobBreath.stopAnimation();
    blobBreath.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blobBreath, { toValue: 1.08, duration: 1600, useNativeDriver: true }),
        Animated.timing(blobBreath, { toValue: 0.96, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeIndex]);

  // ── Animate indicator + per-item states on tab change ────────
  useEffect(() => {
    if (activeIndex === -1) return;

    // Smooth spring slide for the blob
    Animated.spring(pillX, {
      toValue:  activeIndex,
      tension:  65,
      friction: 12,
      useNativeDriver: true,
    }).start();

    animationRefs.forEach((anim, index) => {
      const isActive = index === activeIndex;

      Animated.parallel([
        // Icon lift
        Animated.spring(anim.translateY, {
          toValue: isActive ? -7 : 0,
          tension: 65,
          friction: 9,
          useNativeDriver: true,
        }),
        // Icon scale pop
        Animated.spring(anim.iconScale, {
          toValue: isActive ? 1.2 : 1.0,
          tension: 65,
          friction: 9,
          useNativeDriver: true,
        }),
        // Label fade
        Animated.timing(anim.labelOpacity, {
          toValue: isActive ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        // Halo fade
        Animated.timing(anim.glowOpacity, {
          toValue: isActive ? 1 : 0,
          duration: 250,
          useNativeDriver: true,
        }),
        // Halo bloom
        Animated.spring(anim.glowScale, {
          toValue: isActive ? 1 : 0.5,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [activeIndex]);

  // ── Tap handler — adds snap-bounce before settle ──────────────
  const handlePress = (path: string, index: number) => {
    const anim = animationRefs[index];
    Animated.sequence([
      Animated.timing(anim.iconScale, {
        toValue:  0.75,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(anim.iconScale, {
        toValue:  1.2,
        tension:  90,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
    router.push(path);
  };

  const shouldShowNav = !hiddenPaths.includes(pathname);

  // Blob X — maps activeIndex → pixel offset per slot
  const SLOT_WIDTH = 64;
  const pillTranslateX = pillX.interpolate({
    inputRange:  navItems.map((_, i) => i),
    outputRange: navItems.map((_, i) => i * SLOT_WIDTH),
  });

  const activeItem = activeIndex >= 0 ? navItems[activeIndex] : null;

  return (
    <ThemeProvider>
      <View style={{ flex: 1, backgroundColor: isDark ? "#0A0A0A" : "#F0EDE8" }}>

        {/* ── Stack (ORIGINAL — untouched) ──────────────────── */}
        <Stack
          screenOptions={{
            headerShown:       false,
            animation:         "fade",
            animationDuration: 300,
          }}
        >
          <Stack.Screen name="index"               options={{ headerShown: false }} />
          <Stack.Screen name="LoginScreen"         options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="AuthScreen"          options={{ headerShown: false }} />
          <Stack.Screen name="ResetPasswordScreen" options={{ headerShown: false }} />
          <Stack.Screen name="HomeScreen"          options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="RecordScreen"        options={{ headerShown: false }} />
          <Stack.Screen name="NotesScreen"         options={{ headerShown: false }} />
          <Stack.Screen name="AudioNotesScreen"    options={{ headerShown: false }} />
          <Stack.Screen name="QuizScreen"          options={{ headerShown: false }} />
          <Stack.Screen name="OnboardingScreen"    options={{ headerShown: false }} />
        </Stack>

        {/* TrialBanner (ORIGINAL — untouched) */}
        <TrialBanner />

        {/* ════════════════════════════════════════════════════
            REDESIGNED NAV RAIL
        ════════════════════════════════════════════════════ */}
        {shouldShowNav && (
          <View style={styles.navContainer} pointerEvents="box-none">

            {/* Outer glow ring — bleeds the active accent into the air */}
            {activeItem && (
              <Animated.View
                style={[
                  styles.outerGlow,
                  {
                    backgroundColor: activeItem.glow,
                    opacity: 0.55,
                    transform: [{ scale: blobBreath }],
                  },
                ]}
                pointerEvents="none"
              />
            )}

            <View
              style={[
                styles.navShell,
                {
                  backgroundColor: T.shell,
                  borderColor:     T.shellBorder,
                },
                Platform.select({
                  ios: {
                    shadowColor:   T.shellShadow,
                    shadowOffset:  { width: 0, height: 20 },
                    shadowOpacity: isDark ? 0.75 : 0.18,
                    shadowRadius:  32,
                  },
                  android: { elevation: 20 },
                  web: {
                    shadowColor:   T.shellShadow,
                    shadowOffset:  { width: 0, height: 20 },
                    shadowOpacity: isDark ? 0.75 : 0.18,
                    shadowRadius:  32,
                  },
                }),
              ]}
            >
              {/* Gold hairline rule — thematic anchor */}
              <View style={[styles.navTopRule, { backgroundColor: T.rule }]} />

              {/* ── Sliding blob indicator ─────────────────────── */}
              <Animated.View
                style={[
                  styles.blobIndicator,
                  {
                    transform: [
                      { translateX: pillTranslateX },
                      { scale: blobBreath },
                    ],
                    backgroundColor: activeItem ? activeItem.color + "18" : "transparent",
                    borderColor:     activeItem ? activeItem.color + "45" : "transparent",
                  },
                ]}
                pointerEvents="none"
              />

              {/* ── Nav Items ──────────────────────────────────── */}
              <View style={styles.navRow}>
                {navItems.map((item, index) => {
                  const isActive = pathname === item.path;
                  const anim     = animationRefs[index];

                  return (
                    <TouchableOpacity
                      key={item.path}
                      onPress={() => handlePress(item.path, index)}
                      style={styles.navItem}
                      activeOpacity={1}
                    >
                      <Animated.View
                        style={[
                          styles.navItemInner,
                          { transform: [{ translateY: anim.translateY }] },
                        ]}
                      >
                        {/* ── Halo ring behind icon ─────────────── */}
                        <Animated.View
                          style={[
                            styles.haloRing,
                            {
                              backgroundColor: item.glow,
                              opacity:         anim.glowOpacity,
                              transform:       [{ scale: anim.glowScale }],
                            },
                          ]}
                          pointerEvents="none"
                        />

                        {/* ── Icon ──────────────────────────────── */}
                        <Animated.View
                          style={[
                            styles.iconWrap,
                            { transform: [{ scale: anim.iconScale }] },
                          ]}
                        >
                          <Ionicons
                            name={isActive ? item.iconActive : item.iconInactive}
                            size={22}
                            color={isActive ? item.color : T.iconInactive}
                          />
                        </Animated.View>

                        {/* ── Label — fades in when active ──────── */}
                        <Animated.Text
                          style={[
                            styles.navLabel,
                            {
                              color:   isActive ? item.color : T.labelInactive,
                              opacity: anim.labelOpacity,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Animated.Text>

                        {/* ── Accent dot — only on active ────────── */}
                        {isActive && (
                          <View
                            style={[
                              styles.activeDot,
                              { backgroundColor: item.color },
                            ]}
                          />
                        )}
                      </Animated.View>
                    </TouchableOpacity>
                  );
                })}
              </View>

            </View>
          </View>
        )}

        {/* GlobalPaywall (ORIGINAL — untouched) */}
        <GlobalPaywall />

      </View>
    </ThemeProvider>
  );
}

// ════════════════════════════════════════════════════════════════
//  ROOT LAYOUT EXPORT  (ORIGINAL — untouched)
// ════════════════════════════════════════════════════════════════

export default function Layout() {
  return (
    <SubscriptionProvider>
      <InnerLayout />
    </SubscriptionProvider>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
// ════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({

  // I float the nav 24px from the bottom, centered horizontally
  navContainer: {
    position:   "absolute",
    bottom:     24,
    left:       0,
    right:      0,
    alignItems: "center",
    zIndex:     1000,
  },

  // The ambient glow that bleeds the active accent color into the air
  // behind the entire nav shell — gives it a lit-from-within feel
  outerGlow: {
    position:     "absolute",
    bottom:       -8,
    width:        "80%",
    height:       70,
    borderRadius: 50,
    alignSelf:    "center",
    // iOS blur-like spread via large shadow radius
    ...Platform.select({
      ios: {
        shadowColor:   "#fff",
        shadowOffset:  { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius:  0,
      },
    }),
  },

  // The pill-shaped shell — adapts background/border per theme
  navShell: {
    width:           "88%",
    maxWidth:        420,
    borderRadius:    24,
    borderWidth:     1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    position:        "relative",
    overflow:        "hidden",
  },

  // Gold hairline — 70% width, centered, 0.4 opacity
  navTopRule: {
    position:      "absolute",
    top:           0,
    left:          "15%",
    right:         "15%",
    height:        1,
    opacity:       0.4,
    borderRadius:  1,
  },

  // Sliding blob — positioned absolutely behind the icon row
  // Width matches SLOT_WIDTH (64) so it sits under a single icon slot
  blobIndicator: {
    position:     "absolute",
    top:          6,
    left:         4,
    width:        64,
    height:       60,
    borderRadius: 18,
    borderWidth:  1,
    zIndex:       0,
  },

  navRow: {
    flexDirection:  "row",
    justifyContent: "space-around",
    alignItems:     "flex-end",
    zIndex:         1,
  },

  navItem: {
    flex:        1,
    alignItems:  "center",
    paddingVertical: 4,
    zIndex:      1,
  },

  navItemInner: {
    alignItems:      "center",
    justifyContent:  "center",
    minHeight:       54,
    gap:             3,
    position:        "relative",
  },

  // Halo ring — a soft glow circle behind the icon, blooms on activation
  haloRing: {
    position:     "absolute",
    width:        46,
    height:       46,
    borderRadius: 23,
    top:          -4,
    zIndex:       0,
  },

  iconWrap: {
    width:           38,
    height:          34,
    alignItems:      "center",
    justifyContent:  "center",
    zIndex:          1,
  },

  navLabel: {
    fontSize:      9,
    fontWeight:    "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    zIndex:        1,
  },

  // 4px pill dot beneath the label — accent color, subtle marker
  activeDot: {
    width:        16,
    height:       3,
    borderRadius: 2,
    marginTop:    1,
    opacity:      0.85,
  },
});