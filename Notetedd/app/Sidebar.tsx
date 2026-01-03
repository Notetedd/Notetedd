import React, { useState, useEffect, Fragment, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { getAuth, onAuthStateChanged, signOut, User } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import { useTheme } from "./context/ThemeContext";

// Safe haptics that won't crash on unsupported devices
const safeHaptics = {
  impact: (style: 'Light' | 'Medium' | 'Heavy') => {
    try {
      if (Platform.OS === 'ios') {
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle[style]);
      }
    } catch (error) {
      // Silently fail if haptics not available
      console.log('Haptics not available');
    }
  },
  notification: (type: 'Success' | 'Warning' | 'Error') => {
    try {
      if (Platform.OS === 'ios') {
        const Haptics = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType[type]);
      }
    } catch (error) {
      console.log('Haptics not available');
    }
  },
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navigation: any;
}

export default function Sidebar({ isOpen, onClose, navigation }: SidebarProps) {
  const screenWidth = Dimensions.get("window").width;
  const slideAnim = useRef(new Animated.Value(-screenWidth)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [profileName, setProfileName] = useState("User");
  const [profileEmail, setProfileEmail] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  
  // ✅ UNCOMMENTED - This must be active for theme to work
  const { theme, setTheme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  const auth = getAuth();
  const db = getFirestore();

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      try {
        if (user) {
          let name = user.displayName || user.email?.split("@")[0] || "User";
          setProfileEmail(user.email || "");

          if (!user.displayName) {
            try {
              const docSnap = await getDoc(doc(db, "users", user.uid));
              if (docSnap.exists() && isMounted) {
                const userData = docSnap.data();
                name = userData.username || name;
                setIsPremium(userData.isPremium || false);
              }
            } catch (firestoreError) {
              console.log("Error fetching user data:", firestoreError);
            }
          }

          if (isMounted) {
            setProfileName(name);
          }
        }
      } catch (error) {
        console.log("Auth error:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -screenWidth,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, screenWidth]);

  const handleNavigation = (screen: string) => {
    if (!screen) return;
    
    safeHaptics.impact('Light');
    
    try {
      if (navigation?.navigate) {
        navigation.navigate(screen);
        onClose();
      } else {
        console.log('Navigation not available');
        Alert.alert('Navigation Error', 'Unable to navigate. Please try again.');
      }
    } catch (error) {
      console.log('Navigation error:', error);
      Alert.alert('Navigation Error', 'Unable to navigate to this screen.');
    }
  };

  const handleSignOut = () => {
    safeHaptics.notification('Warning');
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              onClose();
              if (navigation?.navigate) {
                navigation.navigate("LoginScreen");
              }
            } catch (error) {
              console.log('Sign out error:', error);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleThemeToggle = () => {
    safeHaptics.impact('Medium');
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const menuSections = [
    {
      items: [
        { icon: "person", label: "My Profile", screen: "ProfileScreen" },
        { icon: "star", label: "Subscription", screen: "SubscriptionPlanScreen", badge: isPremium ? "PRO" : null },
        { icon: "credit-card", label: "Payment Methods", screen: "PaymentMethodsScreen" },
      ],
    },
    {
      title: "Content",
      items: [
        { icon: "school", label: "Sync Classroom Notes", screen: "SyncClassroomScreen", badge: null },
        { icon: "upload-file", label: "Upload File", screen: "UploadPDFScreen", badge: null },
        { icon: "attach-money", label: "Sell Notes", screen: "SellNotesScreen", badge: null },
      ],
    },
    {
      title: "Settings",
      items: [
        { icon: "devices", label: "Paired Devices", screen: "PairedDevicesScreen", badge: "2" },
        { icon: "notifications", label: "Notifications", screen: "NotificationsScreen", badge: null },
        { icon: isDark ? "light-mode" : "dark-mode", label: "Dark Mode", screen: "", badge: null, toggle: true, isTheme: true },
        { icon: "privacy-tip", label: "Privacy", screen: "PrivacyScreen", badge: null },
      ],
    },
    {
      title: "Support",
      items: [
        { icon: "help", label: "Help & Support", screen: "HelpSupportScreen", badge: null },
      ],
    },
  ];

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <Animated.View 
        style={[
          styles.overlay, 
          { 
            opacity: fadeAnim.interpolate({ 
              inputRange: [0, 1], 
              outputRange: [0, 0.5] 
            }) 
          }
        ]}
      >
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      <Animated.View 
        style={[
          styles.sidebar,
          { 
            backgroundColor: colors.surface || colors.card,
            transform: [{ translateX: slideAnim }] 
          }
        ]}
      >
        {/* Gradient Header */}
        <LinearGradient
          colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerPattern} />
          
          <View style={styles.headerTop}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Profile Section */}
          <TouchableOpacity 
            style={styles.profileContainer}
            onPress={() => handleNavigation("ProfileScreen")}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={["#F59E0B", "#D97706"]}
              style={styles.profileIcon}
            >
              <Text style={styles.profileIconText}>{getInitials(profileName)}</Text>
            </LinearGradient>
            
            <View style={styles.profileDetails}>
              <Text style={styles.profileName}>{profileName}</Text>
              <Text style={styles.profileEmail}>{profileEmail}</Text>
              {isPremium && (
                <View style={styles.premiumBadge}>
                  <MaterialIcons name="stars" size={12} color="#FFD700" />
                  <Text style={styles.premiumText}>Premium</Text>
                </View>
              )}
            </View>

            <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </LinearGradient>

        {/* Menu Sections */}
        <ScrollView 
          style={styles.menuScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.menuScrollContent}
        >
          {menuSections.map((section, sectionIndex) => (
            <Animated.View 
              key={section.title || `section-${sectionIndex}`}
              style={[
                styles.menuSection,
                { 
                  opacity: fadeAnim,
                  transform: [{
                    translateX: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  }],
                },
              ]}
            >
              {section.title && (
                <Text style={[styles.sectionTitle, { color: colors.subtext }]}>
                  {section.title}
                </Text>
              )}
              
              {section.items.map((item, itemIndex) => (
                <Fragment key={`${item.label}-${itemIndex}`}>
                  {item.toggle ? (
                    <View style={[styles.menuItem, { backgroundColor: colors.card }]}>
                      <View style={styles.menuItemLeft}>
                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#374151' : '#FFFFFF' }]}>
                          <MaterialIcons name={item.icon} size={20} color={colors.subtext} />
                        </View>
                        <Text style={[styles.menuItemText, { color: colors.text }]}>
                          {item.label}
                        </Text>
                      </View>
                      
                      <Switch
                        value={item.isTheme ? isDark : notificationsEnabled}
                        onValueChange={item.isTheme ? handleThemeToggle : setNotificationsEnabled}
                        trackColor={{ false: "#D1D5DB", true: colors.primary }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor="#D1D5DB"
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => item.screen ? handleNavigation(item.screen) : null}
                      style={[styles.menuItem, { backgroundColor: colors.card }]}
                      activeOpacity={0.7}
                      disabled={!item.screen}
                    >
                      <View style={styles.menuItemLeft}>
                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#374151' : '#FFFFFF' }]}>
                          <MaterialIcons 
                            name={item.icon} 
                            size={20} 
                            color={colors.subtext} 
                          />
                        </View>
                        <Text style={[styles.menuItemText, { color: colors.text }]}>
                          {item.label}
                        </Text>
                      </View>

                      <View style={styles.menuItemRight}>
                        {item.badge && (
                          <View style={[
                            styles.badge,
                            { backgroundColor: item.badge === "PRO" ? (colors.warning || '#F59E0B') : colors.primary }
                          ]}>
                            <Text style={styles.badgeText}>{item.badge}</Text>
                          </View>
                        )}
                        <MaterialIcons name="chevron-right" size={20} color={colors.subtext} />
                      </View>
                    </TouchableOpacity>
                  )}
                </Fragment>
              ))}
            </Animated.View>
          ))}

          {/* Sign Out Button */}
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutButton}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#EF4444", "#DC2626"]}
              style={styles.signOutGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <MaterialIcons name="logout" size={20} color="#fff" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.footerText, { color: colors.subtext }]}>
              Note Tedd v1.0.0
            </Text>
            <Text style={[styles.footerSubtext, { color: colors.subtext }]}>
              Made with ❤️ for students
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 999,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    height: "100%",
    width: "85%",
    maxWidth: 320,
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
    position: "relative",
    overflow: "hidden",
  },
  headerPattern: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  menuTitle: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "bold",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  profileIconText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
  },
  profileDetails: {
    marginLeft: 12,
    flex: 1,
  },
  profileName: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 2,
  },
  profileEmail: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginBottom: 4,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    gap: 4,
  },
  premiumText: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "600",
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
  },
  menuSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  menuItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  signOutButton: {
    marginTop: 8,
    marginBottom: 24,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#EF4444",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  signOutGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 10,
  },
  signOutText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "500",
  },
  footerSubtext: {
    fontSize: 11,
    marginTop: 4,
  },
});