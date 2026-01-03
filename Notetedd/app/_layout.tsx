
import React, { useRef, useEffect } from "react";
import { View, TouchableOpacity, Text, StyleSheet, Animated } from "react-native";
import { useRouter, usePathname } from "expo-router";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemeProvider } from "./context/ThemeContext";
import { Stack } from "expo-router";

export default function Layout() {
  const router = useRouter();
  const pathname = usePathname() || "";

  // Animation refs for each nav item
  const animationRefs = useRef(
    navItems.map(() => ({
      scale: new Animated.Value(1),
      translateY: new Animated.Value(0),
    }))
  ).current;

  // Hidden paths - where bottom nav should not appear
  const hiddenPaths = ["/", "/LoginScreen", "/AuthScreen", "/ResetPasswordScreen"];

  // Animate active tab
  useEffect(() => {
    animationRefs.forEach((anim, index) => {
      const isActive = pathname === navItems[index].path;
      
      Animated.parallel([
        Animated.spring(anim.scale, {
          toValue: isActive ? 1.1 : 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(anim.translateY, {
          toValue: isActive ? -8 : 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [pathname]);

  const handlePress = (path: string, index: number) => {
    const anim = animationRefs[index];
    
    // Quick press animation
    Animated.sequence([
      Animated.timing(anim.scale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(anim.scale, {
        toValue: pathname === path ? 1.1 : 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // FIX: Only use push, not both push and replace
    router.push(path);
  };

  const shouldShowNav = !hiddenPaths.includes(pathname);

  return (
    <ThemeProvider>
      <View style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      {/* FIX: Use Stack instead of Slot for proper navigation */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          // This ensures smooth transitions between screens
          animationDuration: 300,
        }}
      >
        {/* Define all your screens here */}
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="LoginScreen" 
          options={{ 
            headerShown: false,
            // Prevent going back to login after successful login
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="AuthScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="ResetPasswordScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="HomeScreen" 
          options={{ 
            headerShown: false,
            // Prevent going back to login after successful login
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen 
          name="RecordScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="NotesScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="AudioNotesScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="QuizScreen" 
          options={{ 
            headerShown: false,
          }} 
        />
      </Stack>

      {/* Floating Bottom Navigation - only show on main app screens */}
      {shouldShowNav && (
        <View style={styles.container}>
          <View style={styles.navWrapper}>
            {/* Background with blur effect */}
            <LinearGradient
              colors={["rgba(255,255,255,0.95)", "rgba(243,244,246,0.95)"]}
              style={styles.navGradient}
            >
              {/* Animated indicator background */}
              <View style={styles.navItems}>
                {navItems.map((item, index) => {
                  const isActive = pathname === item.path;
                  const anim = animationRefs[index];

                  return (
                    <TouchableOpacity
                      key={item.path}
                      onPress={() => handlePress(item.path, index)}
                      style={styles.navItem}
                      activeOpacity={0.7}
                    >
                      <Animated.View
                        style={[
                          styles.navItemContent,
                          {
                            transform: [
                              { scale: anim.scale },
                              { translateY: anim.translateY },
                            ],
                          },
                        ]}
                      >
                        {/* Active background bubble */}
                        {isActive && (
                          <Animated.View style={styles.activeBubble}>
                            <LinearGradient
                              colors={[item.color + "20", item.color + "10"]}
                              style={styles.bubbleGradient}
                            />
                          </Animated.View>
                        )}

                        {/* Icon with gradient for active state */}
                        {isActive ? (
                          <LinearGradient
                            colors={item.gradient}
                            style={styles.activeIconContainer}
                          >
                            <MaterialCommunityIcons
                              name={item.icon}
                              size={26}
                              color="#FFFFFF"
                            />
                          </LinearGradient>
                        ) : (
                          <View style={styles.inactiveIconContainer}>
                            <MaterialCommunityIcons
                              name={item.icon}
                              size={26}
                              color="#9CA3AF"
                            />
                          </View>
                        )}

                        {/* Label */}
                        <Text
                          style={[
                            styles.navLabel,
                            isActive ? styles.activeLabel : styles.inactiveLabel,
                          ]}
                        >
                          {item.label}
                        </Text>

                        {/* Active dot indicator */}
                        {isActive && (
                          <Animated.View
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
            </LinearGradient>

            {/* Floating active tab highlight */}
            {navItems.map((item, index) => {
              const isActive = pathname === item.path;
              if (!isActive) return null;

              const position = (index / navItems.length) * 100;

              return (
                <Animated.View
                  key={`highlight-${item.path}`}
                  style={[
                    styles.floatingHighlight,
                    {
                      left: `${position}%`,
                      transform: [
                        { translateX: -20 },
                        { scale: animationRefs[index].scale },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[item.color + "40", item.color + "00"]}
                    style={styles.highlightGradient}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}
      </View>
    </ThemeProvider>
  );
}

const navItems = [
  { 
    icon: "home", 
    path: "/HomeScreen", 
    label: "Home",
    color: "#9B5DE5",
    gradient: ["#9B5DE5", "#7C3AED"],
  },
  { 
    icon: "microphone", 
    path: "/RecordScreen", 
    label: "Record",
    color: "#EF4444",
    gradient: ["#EF4444", "#DC2626"],
  },
  { 
    icon: "notebook-outline", 
    path: "/NotesScreen", 
    label: "Notes",
    color: "#10B981",
    gradient: ["#10B981", "#059669"],
  },
  { 
    icon: "headphones", 
    path: "/AudioNotesScreen", 
    label: "Audio",
    color: "#F59E0B",
    gradient: ["#F59E0B", "#D97706"],
  },
  { 
    icon: "brain", 
    path: "/QuizScreen", 
    label: "Quiz",
    color: "#3B82F6",
    gradient: ["#3B82F6", "#2563EB"],
  },
];

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    alignItems: "center",
    zIndex: 1000,
  },
  navWrapper: {
    width: "92%",
    maxWidth: 500,
    position: "relative",
  },
  navGradient: {
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  navItems: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  navItemContent: {
    alignItems: "center",
    position: "relative",
  },
  activeBubble: {
    position: "absolute",
    top: -8,
    width: 60,
    height: 60,
    borderRadius: 30,
    zIndex: -1,
  },
  bubbleGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
  },
  activeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  inactiveIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  navLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
  },
  activeLabel: {
    color: "#1F2937",
  },
  inactiveLabel: {
    color: "#9CA3AF",
  },
  activeDot: {
    position: "absolute",
    bottom: -12,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  floatingHighlight: {
    position: "absolute",
    bottom: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: -1,
  },
  highlightGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
});