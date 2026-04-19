import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Animated,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import haptics from "./utils/haptics";
import BackButton from "../components/Backbutton";
import { useTheme } from "./context/ThemeContext";

export default function NotificationsScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: "achievement",
      icon: "emoji-events",
      color: "#F59E0B",
      title: "Achievement Unlocked!",
      message: "You've completed 7 days streak! 🔥",
      time: "2 hours ago",
      read: false,
    },
    {
      id: 2,
      type: "reminder",
      icon: "schedule",
      color: "#9B5DE5",
      title: "Study Reminder",
      message: "Don't forget to review your Psychology notes",
      time: "5 hours ago",
      read: false,
    },
    {
      id: 3,
      type: "update",
      icon: "system-update",
      color: "#10B981",
      title: "New Feature Available",
      message: "AI Summary feature is now available for all Pro users",
      time: "1 day ago",
      read: true,
    },
    {
      id: 4,
      type: "quiz",
      icon: "quiz",
      color: "#EF4444",
      title: "Quiz Completed",
      message: "Great job! You scored 85% on Calculus quiz",
      time: "2 days ago",
      read: true,
    },
    {
      id: 5,
      type: "sync",
      icon: "cloud-done",
      color: "#3B82F6",
      title: "Notes Synced",
      message: "All your notes have been backed up to cloud",
      time: "3 days ago",
      read: true,
    },
  ]);

  const [settings, setSettings] = useState({
    pushNotifications: true,
    studyReminders: true,
    achievementAlerts: true,
    weeklyReports: true,
    newFeatures: true,
    emailNotifications: false,
    soundEnabled: true,
    vibrationEnabled: true,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const markAsRead = async (id) => {
    await haptics.impact("Light");
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = async () => {
    await haptics.impact("Medium");
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = async (id) => {
    await haptics.impact("Light");
    Alert.alert(
      "Delete Notification",
      "Are you sure you want to delete this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setNotifications(notifications.filter(n => n.id !== id));
            haptics.notification("Success");
          },
        },
      ]
    );
  };

  const clearAll = async () => {
    await haptics.impact("Medium");
    Alert.alert(
      "Clear All Notifications",
      "This will delete all notifications. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            setNotifications([]);
            haptics.notification("Success");
          },
        },
      ]
    );
  };

  const toggleSetting = async (key) => {
    await haptics.impact("Light");
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

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
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={markAllAsRead}
        >
          <MaterialIcons name="done-all" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Quick Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              style={[styles.actionButton, isDark && styles.actionButtonDark]}
              onPress={markAllAsRead}
            >
              <MaterialIcons name="mark-email-read" size={20} color="#9B5DE5" />
              <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
                Mark All Read
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, isDark && styles.actionButtonDark]}
              onPress={clearAll}
            >
              <MaterialIcons name="delete-sweep" size={20} color="#EF4444" />
              <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
                Clear All
              </Text>
            </TouchableOpacity>
          </View>

          {/* Notifications List */}
          <View style={styles.notificationsContainer}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Recent Notifications
            </Text>

            {notifications.length === 0 ? (
              <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
                <MaterialIcons name="notifications-none" size={64} color="#D1D5DB" />
                <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
                  No notifications yet
                </Text>
                <Text style={[styles.emptySubtext, isDark && styles.textSecondaryDark]}>
                  We'll notify you when something important happens
                </Text>
              </View>
            ) : (
              notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  onPress={() => markAsRead(notification.id)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.notificationCard,
                    !notification.read && styles.notificationUnread,
                    isDark && styles.notificationCardDark,
                    isDark && !notification.read && styles.notificationUnreadDark,
                  ]}>
                    <View style={[
                      styles.notificationIcon,
                      { backgroundColor: notification.color + "20" }
                    ]}>
                      <MaterialIcons 
                        name={notification.icon} 
                        size={24} 
                        color={notification.color} 
                      />
                    </View>

                    <View style={styles.notificationContent}>
                      <View style={styles.notificationHeader}>
                        <Text style={[
                          styles.notificationTitle,
                          isDark && styles.textDark,
                        ]}>
                          {notification.title}
                        </Text>
                        {!notification.read && (
                          <View style={styles.unreadDot} />
                        )}
                      </View>
                      
                      <Text style={[
                        styles.notificationMessage,
                        isDark && styles.textSecondaryDark,
                      ]}>
                        {notification.message}
                      </Text>
                      
                      <Text style={[
                        styles.notificationTime,
                        isDark && styles.textSecondaryDark,
                      ]}>
                        {notification.time}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteNotification(notification.id)}
                    >
                      <MaterialIcons name="close" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Notification Settings */}
          <View style={[styles.settingsContainer, isDark && styles.settingsContainerDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Notification Settings
            </Text>

            <View style={[styles.settingGroup, isDark && styles.settingGroupDark]}>
              <Text style={[styles.groupTitle, isDark && styles.textSecondaryDark]}>
                GENERAL
              </Text>

              {[
                { key: "pushNotifications", label: "Push Notifications", icon: "notifications" },
                { key: "soundEnabled", label: "Sound", icon: "volume-up" },
                { key: "vibrationEnabled", label: "Vibration", icon: "vibration" },
              ].map((setting) => (
                <View key={setting.key} style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <MaterialIcons 
                      name={setting.icon} 
                      size={22} 
                      color={isDark ? "#9CA3AF" : "#6B7280"} 
                    />
                    <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                      {setting.label}
                    </Text>
                  </View>
                  <Switch
                    value={settings[setting.key]}
                    onValueChange={() => toggleSetting(setting.key)}
                    trackColor={{ false: "#D1D5DB", true: "#9B5DE5" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>

            <View style={[styles.settingGroup, isDark && styles.settingGroupDark]}>
              <Text style={[styles.groupTitle, isDark && styles.textSecondaryDark]}>
                REMINDERS
              </Text>

              {[
                { key: "studyReminders", label: "Study Reminders", icon: "alarm" },
                { key: "achievementAlerts", label: "Achievement Alerts", icon: "emoji-events" },
                { key: "weeklyReports", label: "Weekly Progress Reports", icon: "analytics" },
              ].map((setting) => (
                <View key={setting.key} style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <MaterialIcons 
                      name={setting.icon} 
                      size={22} 
                      color={isDark ? "#9CA3AF" : "#6B7280"} 
                    />
                    <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                      {setting.label}
                    </Text>
                  </View>
                  <Switch
                    value={settings[setting.key]}
                    onValueChange={() => toggleSetting(setting.key)}
                    trackColor={{ false: "#D1D5DB", true: "#9B5DE5" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>

            <View style={[styles.settingGroup, isDark && styles.settingGroupDark]}>
              <Text style={[styles.groupTitle, isDark && styles.textSecondaryDark]}>
                UPDATES
              </Text>

              {[
                { key: "newFeatures", label: "New Features", icon: "new-releases" },
                { key: "emailNotifications", label: "Email Notifications", icon: "email" },
              ].map((setting) => (
                <View key={setting.key} style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <MaterialIcons 
                      name={setting.icon} 
                      size={22} 
                      color={isDark ? "#9CA3AF" : "#6B7280"} 
                    />
                    <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                      {setting.label}
                    </Text>
                  </View>
                  <Switch
                    value={settings[setting.key]}
                    onValueChange={() => toggleSetting(setting.key)}
                    trackColor={{ false: "#D1D5DB", true: "#9B5DE5" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
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
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  badge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  actionsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  actionButtonDark: {
    backgroundColor: "#1F2937",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  notificationsContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 48,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  emptyStateDark: {
    backgroundColor: "#1F2937",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  notificationCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  notificationCardDark: {
    backgroundColor: "#1F2937",
  },
  notificationUnread: {
    backgroundColor: "#F3E8FF",
    borderLeftWidth: 4,
    borderLeftColor: "#9B5DE5",
  },
  notificationUnreadDark: {
    backgroundColor: "#374151",
    borderLeftColor: "#9B5DE5",
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9B5DE5",
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  deleteButton: {
    padding: 4,
  },
  settingsContainer: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  settingsContainerDark: {
    backgroundColor: "#1F2937",
  },
  settingGroup: {
    marginBottom: 24,
  },
  settingGroupDark: {
    borderBottomColor: "#374151",
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textSecondaryDark: {
    color: "#D1D5DB",
  },
});