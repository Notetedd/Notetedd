/**
 
 */

import React, {
  useState, useEffect, Fragment, useRef, useCallback,
} from 'react';
import {
  View, Text, TouchableOpacity, Animated, Easing,
  StyleSheet, Dimensions, ScrollView, Switch, Alert,
  Platform, StatusBar, useWindowDimensions,
} from 'react-native';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from './context/ThemeContext';
import { useSidebar } from './context/SidebarContext';

// ─── Safe haptics (iOS-only, silent fallback) ─────────────────
const safeHaptics = {
  impact: (style = 'Light') => {
    try {
      if (Platform.OS === 'ios') {
        const H = require('expo-haptics');
        H.impactAsync(H.ImpactFeedbackStyle[style]);
      }
    } catch (_) {}
  },
  notification: (type = 'Warning') => {
    try {
      if (Platform.OS === 'ios') {
        const H = require('expo-haptics');
        H.notificationAsync(H.NotificationFeedbackType[type]);
      }
    } catch (_) {}
  },
};

// ════════════════════════════════════════════════════════════════
//  DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════

const T = {
  // Dark glass surfaces
  glassDeep:   'rgba(8, 6, 24, 0.96)',
  glassMid:    'rgba(14, 10, 36, 0.94)',
  glassCard:   'rgba(20, 15, 50, 0.88)',
  glassRow:    'rgba(255,255,255,0.04)',
  glassRowHov: 'rgba(255,255,255,0.08)',
  frostBorder: 'rgba(255,255,255,0.08)',
  frostMid:    'rgba(255,255,255,0.13)',

  // Light glass surfaces
  glassDeepL:  'rgba(245, 243, 255, 0.97)',
  glassMidL:   'rgba(237, 233, 255, 0.95)',
  glassCardL:  'rgba(255, 255, 255, 0.88)',
  glassRowL:   'rgba(91, 33, 182, 0.04)',
  frostBorderL:'rgba(91, 33, 182, 0.1)',
  frostMidL:   'rgba(91, 33, 182, 0.18)',

  // Accents
  violet:    '#5b21b6', violetMid: '#7c3aed', violetBr: '#a78bfa',
  teal:      '#0d9488', tealBr:    '#2dd4bf',
  ember:     '#ea580c', emberBr:   '#fb923c',
  gold:      '#d97706', goldBr:    '#fbbf24',
  success:   '#059669', successBr: '#34d399',
  danger:    '#dc2626', dangerBr:  '#f87171',

  // Alpha
  va:  (a) => `rgba(91,33,182,${a})`,
  ta:  (a) => `rgba(13,148,136,${a})`,
  ea:  (a) => `rgba(234,88,12,${a})`,
  ga:  (a) => `rgba(217,119,6,${a})`,
  da:  (a) => `rgba(220,38,38,${a})`,
  sa:  (a) => `rgba(5,150,105,${a})`,
  wa:  (a) => `rgba(255,255,255,${a})`,
  ba:  (a) => `rgba(0,0,0,${a})`,

  text:      '#ede9ff',
  textSub:   'rgba(237,233,255,0.65)',
  textMuted: 'rgba(237,233,255,0.38)',
  textDim:   'rgba(237, 233, 255, 0.73)',
  textL:     '#1e1033',
  textSubL:  'rgba(30,16,51,0.65)',
  textMutedL:'rgba(30,16,51,0.40)',
};

const DISPLAY = Platform.select({ ios: 'Georgia',        default: 'serif' });
const SANS    = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });
const MONO    = Platform.select({ ios: 'Menlo',          default: 'monospace' });

const sp = (n) => n * 8;

// I assign a deterministic accent colour to each menu icon
// so the sidebar has colour variety without manual config.
const ICON_ACCENTS = [
  T.violetBr, T.tealBr, T.emberBr, T.goldBr, T.successBr,
  T.violetBr, T.tealBr, T.dangerBr, T.goldBr, T.violetBr,
  T.tealBr,   T.emberBr, T.violetBr,
];

// ════════════════════════════════════════════════════════════════
//  ATOMS
// ════════════════════════════════════════════════════════════════

const Label = ({ children, color, style }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 9, letterSpacing: 3.5, textTransform: 'uppercase', color }, style]}>
    {children}
  </Text>
);

// Horizontal hairline with optional glow
const Hairline = ({ color, glow }) => (
  <View style={{
    height: 1,
    backgroundColor: color,
    ...(glow ? { shadowColor: glow, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } } : {}),
  }} />
);

// ════════════════════════════════════════════════════════════════
//  MENU ROW
//  Each row enters with a staggered translateX + fade spring.
//  On press it briefly scales down and shows a violet glow.
// ════════════════════════════════════════════════════════════════

const MenuRow = React.memo(({
  item, index, globalIndex, isDark, onPress,
  notificationsEnabled, setNotificationsEnabled, handleThemeToggle,
}) => {
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const enterAnim  = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;

  const accent = ICON_ACCENTS[globalIndex % ICON_ACCENTS.length];

  const text      = isDark ? T.text     : T.textL;
  const textMuted = isDark ? T.textMuted: T.textMutedL;
  const rowBg     = isDark ? T.glassRow : T.glassRowL;
  const rowBorder = isDark ? T.frostBorder : T.frostBorderL;

  // I stagger each row's entry so they cascade from the top.
  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1,
      tension: 60,
      friction: 10,
      delay: 180 + globalIndex * 45,
      useNativeDriver: true,
    }).start();
  }, []);

  const pressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 260, friction: 12 }),
      Animated.timing(glowAnim,  { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  };

  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 260, friction: 12 }),
      Animated.timing(glowAnim,  { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const rowStyle = {
    transform: [
      { scale: scaleAnim },
      { translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) },
    ],
    opacity: enterAnim,
  };

  const glowBg = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [rowBg, `${accent}12`] });

  if (item.toggle) {
    return (
      <Animated.View style={[rowStyle, A.row, { backgroundColor: rowBg, borderColor: rowBorder }]}>
        <View style={[A.iconWrap, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={item.icon} size={17} color={accent} />
        </View>
        <Text style={[A.rowLabel, { color: text, flex: 1, marginLeft: sp(1.75) }]}>{item.label}</Text>
        <Switch
          value={item.isTheme ? isDark : notificationsEnabled}
          onValueChange={item.isTheme ? handleThemeToggle : setNotificationsEnabled}
          trackColor={{ false: isDark ? T.wa(0.12) : T.va(0.15), true: T.violetMid }}
          thumbColor={isDark ? T.violetBr : '#ffffff'}
          ios_backgroundColor={T.wa(0.12)}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={rowStyle}>
      <TouchableOpacity
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        activeOpacity={1}
        disabled={!item.screen}
      >
        <Animated.View style={[A.row, { backgroundColor: glowBg, borderColor: rowBorder }]}>
          {/* Accent left bar — only visible on press */}
          <Animated.View style={[A.rowAccentBar, { backgroundColor: accent, opacity: glowAnim }]} />

          <View style={[A.iconWrap, { backgroundColor: `${accent}18` }]}>
            <MaterialIcons name={item.icon} size={17} color={accent} />
          </View>

          <Text style={[A.rowLabel, { color: text, flex: 1, marginLeft: sp(1.75) }]}>
            {item.label}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {item.badge && (
              <View style={[A.badge, { backgroundColor: item.badge === 'PRO' ? T.gold : T.va(0.5) }]}>
                <Label color="#fff" style={{ letterSpacing: 2 }}>{item.badge}</Label>
              </View>
            )}
            <MaterialIcons name="chevron-right" size={15} color={isDark ? T.textDim : T.textMutedL} />
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ════════════════════════════════════════════════════════════════
//  PROFILE AVATAR with pulsing ring animation on open
// ════════════════════════════════════════════════════════════════

const ProfileAvatar = ({ initials, isPremium, isOpen }) => {
  const ringScale  = useRef(new Animated.Value(1)).current;
  const ringOpacity= useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale,   { toValue: 1.35, duration: 1400, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.5,  duration: 300,  useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale,   { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      ringOpacity.setValue(0);
      ringScale.setValue(1);
    }
  }, [isOpen]);

  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulsing ring */}
      <Animated.View style={[
        A.avatarRing,
        { transform: [{ scale: ringScale }], opacity: ringOpacity },
      ]} />
      {/* Avatar body */}
      <View style={A.avatar}>
        <Text style={A.avatarText}>{initials}</Text>
      </View>
      {/* Premium star overlay */}
      {isPremium && (
        <View style={A.premiumStar}>
          <MaterialIcons name="stars" size={12} color={T.goldBr} />
        </View>
      )}
    </View>
  );
};

// ════════════════════════════════════════════════════════════════
//  MAIN SIDEBAR COMPONENT
// ════════════════════════════════════════════════════════════════

/**
 * Sidebar accepts optional props for backward compatibility.
 * In global mode (recommended), it reads isOpen/closeSidebar/navRef
 * from SidebarContext automatically.
 */
export default function Sidebar({ navigation: navProp, isOpen: isOpenProp, onClose: onCloseProp } = {}) {
  const { width: screenW } = useWindowDimensions();
  const SIDEBAR_W = Math.min(screenW * 0.85, 340);
  const padTop    = Platform.OS === 'ios' ? sp(7) : sp(5.5);

  // I read from context when available, fall back to props.
  let ctxValues = null;
  try {
    ctxValues = useSidebar();
  } catch (_) {
    // Context not available — fall back to props (legacy usage)
  }

  const isOpen   = ctxValues ? ctxValues.isOpen   : (isOpenProp ?? false);
  const onClose  = ctxValues ? ctxValues.closeSidebar : (onCloseProp ?? (() => {}));
  const navRef   = ctxValues?.navRef;
  const nav      = navProp;

  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  // ── Original state ──────────────────────────────────────────
  const [profileName,           setProfileName]           = useState('User');
  const [profileEmail,          setProfileEmail]          = useState('');
  const [isPremium,             setIsPremium]             = useState(false);
  const [notificationsEnabled,  setNotificationsEnabled]  = useState(true);
  const [isLoading,             setIsLoading]             = useState(true);

  const auth = getAuth();
  const db   = getFirestore();

  // ── Animation refs ──────────────────────────────────────────
  // I use a single master progress value (0→1) that drives:
  //  • sidebar translateX
  //  • overlay opacity
  //  • header scale + blur (simulated via opacity on a frosted layer)
  //  • profile section slide-up
  const masterAnim = useRef(new Animated.Value(0)).current;
  // I add a subtle elastic overshoot for the open spring.
  const openSpring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(masterAnim, {
          toValue: 1, duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(openSpring, {
          toValue: 1, tension: 58, friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(masterAnim, {
          toValue: 0, duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(openSpring, {
          toValue: 0, tension: 80, friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  // ── Original auth & profile logic ──────────────────────────
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      try {
        if (user) {
          let name = user.displayName || user.email?.split('@')[0] || 'User';
          setProfileEmail(user.email || '');
          if (!user.displayName) {
            try {
              const docSnap = await getDoc(doc(db, 'users', user.uid));
              if (docSnap.exists() && isMounted) {
                const d = docSnap.data();
                name = d.username || name;
                setIsPremium(d.isPremium || false);
              }
            } catch (e) { console.log('Error fetching user data:', e); }
          }
          if (isMounted) setProfileName(name);
        }
      } catch (e) { console.log('Auth error:', e); }
      finally { if (isMounted) setIsLoading(false); }
    });
    return () => { isMounted = false; unsubscribe(); };
  }, []);

  // ── Navigation helper ────────────────────────────────────────
  const handleNavigation = useCallback((screen) => {
    if (!screen) return;
    safeHaptics.impact('Light');
    try {
      const navigate = nav?.navigate ?? navRef?.current?.navigate;
      if (navigate) { navigate(screen); onClose(); }
      else { console.log('Navigation not available'); Alert.alert('Navigation Error', 'Unable to navigate. Please try again.'); }
    } catch (e) { console.log('Navigation error:', e); Alert.alert('Navigation Error', 'Unable to navigate to this screen.'); }
  }, [nav, navRef, onClose]);

  const handleSignOut = useCallback(() => {
    safeHaptics.notification('Warning');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        try {
          await signOut(auth);
          onClose();
          const navigate = nav?.navigate ?? navRef?.current?.navigate;
          navigate?.('LoginScreen');
        } catch (e) { Alert.alert('Error', 'Failed to sign out. Please try again.'); }
      }},
    ]);
  }, [auth, nav, navRef, onClose]);

  const handleThemeToggle = useCallback(() => {
    safeHaptics.impact('Medium');
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  // ── Menu sections (original structure preserved) ─────────────
  const menuSections = [
    {
      items: [
        { icon: 'person', label: 'My Profile', screen: 'ProfileScreen' },
      ],
    },
    {
      title: 'Content',
      items: [
        { icon: 'school',       label: 'Sync Classroom Notes', screen: 'SyncClassroomScreen' },
        { icon: 'upload-file',  label: 'Upload Notes File',    screen: 'UploadPDFScreen'     },
        { icon: 'attach-money', label: 'Sell Notes',           screen: 'SellNotesScreen'     },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: 'devices',       label: 'Paired Devices',  screen: 'PairedDevicesScreen', badge: '2' },
        { icon: 'notifications', label: 'Notifications',   screen: 'NotificationsScreen'              },
        { icon: isDark ? 'light-mode' : 'dark-mode', label: 'Dark Mode', screen: '', toggle: true, isTheme: true },
        { icon: 'privacy-tip',   label: 'Privacy',         screen: 'PrivacyScreen'                    },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help', label: 'Help & Support', screen: 'HelpSupportScreen' },
      ],
    },
  ];

  const getInitials = (name) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  // ── Derived animation values ─────────────────────────────────
  const sidebarX = masterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_W - 20, 0],
  });
  const overlayOpacity = masterAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, 1],
  });
  const headerScale = openSpring.interpolate({
    inputRange: [0, 1], outputRange: [0.97, 1],
  });
  const profileSlide = openSpring.interpolate({
    inputRange: [0, 1], outputRange: [12, 0],
  });

  // I track a flat index across all sections for row staggering.
  let globalRowIndex = 0;

  const bgDeep    = isDark ? T.glassDeep    : T.glassDeepL;
  const bgCard    = isDark ? T.glassCard    : T.glassCardL;
  const border    = isDark ? T.frostBorder  : T.frostBorderL;
  const borderMid = isDark ? T.frostMid     : T.frostMidL;
  const textMain  = isDark ? T.text         : T.textL;
  const textSub   = isDark ? T.textSub      : T.textSubL;
  const textMuted = isDark ? T.textMuted    : T.textMutedL;
  const textDim   = isDark ? T.textDim      : T.textMutedL;

  if (!isOpen && masterAnim._value === 0) return null;

  return (
    <>
      <StatusBar barStyle="light-content" />

      {/* ── Scrim overlay ──────────────────────────────────── */}
      <Animated.View
        style={[A.overlay, { opacity: overlayOpacity }]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* ── Sidebar panel ──────────────────────────────────── */}
      <Animated.View
        style={[
          A.panel,
          {
            width: SIDEBAR_W,
            backgroundColor: bgDeep,
            borderRightColor: borderMid,
            transform: [{ translateX: sidebarX }],
          },
        ]}
      >
        {/* ── Glassmorphism background layers ────────────── */}
        {/* I stack three translucent colour bleeds to simulate
            the depth of a frosted glass panel. */}
        <View style={[A.glassBleeds]} pointerEvents="none">
          <View style={[A.bleedTop,    { backgroundColor: T.va(0.18) }]} />
          <View style={[A.bleedMid,    { backgroundColor: T.ta(0.07) }]} />
          <View style={[A.bleedBottom, { backgroundColor: T.va(0.06) }]} />
        </View>

        {/* ── Header ─────────────────────────────────────── */}
        <Animated.View
          style={[
            A.header,
            {
              paddingTop: padTop,
              borderBottomColor: borderMid,
              transform: [{ scale: headerScale }],
            },
          ]}
        >
          {/* Violet gradient glow behind header */}
          <View style={A.headerGlow} pointerEvents="none" />

          {/* Top row: label + close */}
          <View style={A.headerTop}>
            <View>
              <Label color={T.wa(0.3)} style={{ marginBottom: 4 }}>— Menu</Label>
              <Text style={[A.menuTitle, { color: '#fff' }]}>
                Note<Text style={{ fontStyle: 'italic', color: T.violetBr }}>Tedd</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={[A.closeBtn, { backgroundColor: T.wa(0.1), borderColor: T.wa(0.15) }]}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={17} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>

          {/* Profile row */}
          <Animated.View style={{ transform: [{ translateY: profileSlide }] }}>
            <TouchableOpacity
              style={A.profileRow}
              onPress={() => handleNavigation('ProfileScreen')}
              activeOpacity={0.8}
            >
              <ProfileAvatar
                initials={getInitials(profileName)}
                isPremium={isPremium}
                isOpen={isOpen}
              />
              <View style={{ flex: 1, marginLeft: sp(1.75) }}>
                <Text style={A.profileName}>{profileName}</Text>
                <Text style={A.profileEmail} numberOfLines={1}>{profileEmail}</Text>
                {isPremium && (
                  <View style={A.premiumBadge}>
                    <MaterialIcons name="stars" size={10} color={T.goldBr} />
                    <Label color={T.goldBr} style={{ letterSpacing: 2 }}>Premium</Label>
                  </View>
                )}
              </View>
              <View style={[A.profileChevron, { backgroundColor: T.wa(0.1), borderColor: T.wa(0.18) }]}>
                <MaterialIcons name="chevron-right" size={14} color="rgba(255,255,255,0.7)" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* ── Menu scroll ────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: sp(2),
            paddingTop: sp(2.5),
            paddingBottom: sp(10),
          }}
        >
          {menuSections.map((section, sectionIdx) => (
            <View key={section.title || `s-${sectionIdx}`} style={{ marginBottom: sp(3) }}>
              {section.title && (
                <View style={{ marginLeft: 4, marginBottom: sp(1.25), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[A.sectionDot, { backgroundColor: T.va(0.6) }]} />
                  <Label color={textDim} style={{ letterSpacing: 4 }}>{section.title}</Label>
                </View>
              )}
              {section.items.map((item, itemIdx) => {
                const gi = globalRowIndex++;
                return (
                  <View key={`${item.label}-${itemIdx}`} style={{ marginBottom: sp(0.75) }}>
                    <MenuRow
                      item={item}
                      index={itemIdx}
                      globalIndex={gi}
                      isDark={isDark}
                      onPress={item.screen ? () => handleNavigation(item.screen) : undefined}
                      notificationsEnabled={notificationsEnabled}
                      setNotificationsEnabled={setNotificationsEnabled}
                      handleThemeToggle={handleThemeToggle}
                    />
                  </View>
                );
              })}
            </View>
          ))}

          {/* ── Sign out ─────────────────────────────────── */}
          <Animated.View
            style={{
              opacity: masterAnim,
              transform: [{ translateY: masterAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              marginTop: sp(1),
              marginBottom: sp(3),
            }}
          >
            <TouchableOpacity
              onPress={handleSignOut}
              activeOpacity={0.82}
              style={[A.signOutBtn, { backgroundColor: T.da(0.12), borderColor: T.da(0.32) }]}
            >
              <View style={[A.signOutIconWrap, { backgroundColor: T.da(0.18) }]}>
                <MaterialIcons name="logout" size={16} color={T.dangerBr} />
              </View>
              <Text style={[A.signOutTxt, { color: T.dangerBr }]}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Footer ───────────────────────────────────── */}
          <Animated.View
            style={{
              opacity: masterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.65] }),
              alignItems: 'center',
              paddingTop: sp(2),
              borderTopWidth: 1,
              borderTopColor: border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <View style={[A.footerDot, { backgroundColor: T.violetBr }]} />
              <Label color={textDim} style={{ letterSpacing: 3 }}>NoteTedd v1.0.0</Label>
            </View>
            <Text style={[A.footerSub, { color: textDim }]}>Made with ❤️ for students</Text>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLESHEET
// ════════════════════════════════════════════════════════════════

const A = StyleSheet.create({
  // Scrim
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 998,
  },

  // Panel
  panel: {
    position: 'absolute',
    left: 0, top: 0,
    height: '100%',
    zIndex: 999,
    borderRightWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 6, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 24,
      },
      android: { elevation: 28 },
    }),
  },

  // Glass bleeds — purely decorative depth layers
  glassBleeds: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    overflow: 'hidden',
    borderRadius: 0,
  },
  bleedTop: {
    position: 'absolute',
    top: -60, left: -40,
    width: 220, height: 220,
    borderRadius: 110,
    opacity: 0.28,
  },
  bleedMid: {
    position: 'absolute',
    top: '35%', right: -60,
    width: 160, height: 160,
    borderRadius: 80,
    opacity: 0.20,
  },
  bleedBottom: {
    position: 'absolute',
    bottom: -40, left: 20,
    width: 180, height: 180,
    borderRadius: 90,
    opacity: 0.18,
  },

  // Header
  header: {
    paddingHorizontal: sp(2.5),
    paddingBottom: sp(2.5),
    borderBottomWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: T.va(0.22),
    opacity: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: sp(2.5),
  },
  menuTitle: {
    fontFamily: DISPLAY,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36, height: 36,
    borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52, height: 52,
    borderRadius: 26,
    backgroundColor: T.violetMid,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: T.violetBr,
  },
  avatarRing: {
    position: 'absolute',
    width: 52, height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: T.violetBr,
  },
  avatarText: {
    fontFamily: DISPLAY,
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  premiumStar: {
    position: 'absolute',
    bottom: -2, right: -2,
    width: 18, height: 18,
    borderRadius: 9,
    backgroundColor: T.ba(0.7),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: T.goldBr,
  },
  profileName: {
    fontFamily: DISPLAY,
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  profileEmail: {
    fontFamily: SANS,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 5,
  },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.ga(0.18), borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: T.ga(0.3),
  },
  profileChevron: {
    width: 28, height: 28,
    borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Section header
  sectionDot: {
    width: 5, height: 5, borderRadius: 2.5,
  },

  // Menu row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sp(1.75),
    paddingHorizontal: sp(1.75),
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  rowAccentBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconWrap: {
    width: 34, height: 34,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: {
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(1.5),
    borderRadius: 14, borderWidth: 1,
    paddingVertical: sp(1.75),
    paddingHorizontal: sp(2),
  },
  signOutIconWrap: {
    width: 34, height: 34,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  signOutTxt: {
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  // Footer
  footerDot: {
    width: 5, height: 5, borderRadius: 2.5,
  },
  footerSub: {
    fontFamily: SANS,
    fontSize: 11,
  },
});