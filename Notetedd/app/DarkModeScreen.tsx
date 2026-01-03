// screens/DarkModeScreen.js
import React from "react";
import { View, Text, StyleSheet, Switch, Alert } from "react-native";
import { Moon } from "lucide-react";
import { useTheme } from "./context/ThemeContext";

export default function DarkModeScreen() {
  const { theme, setTheme, colors } = useTheme();

  const toggleDarkMode = (value: boolean) => {
    const newTheme = value ? "dark" : "light";
    setTheme(newTheme);
    Alert.alert("Theme Changed", `Dark mode is now ${value ? "on" : "off"}.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Moon size={40} color={colors.primary} />
      <Text style={[styles.title, { color: colors.text }]}>Dark Mode</Text>
      <View style={styles.switchContainer}>
        <Text style={[styles.label, { color: colors.text }]}>Enable Dark Mode</Text>
        <Switch
          value={theme === 'dark'}
          onValueChange={toggleDarkMode}
          thumbColor={theme === 'dark' ? colors.primary : '#d1d5db'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#7c3aed",
    textAlign: "center",
    marginVertical: 10,
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 18,
    color: "#374151",
  },
});
