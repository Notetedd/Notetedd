import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "expo-router/react-navigation";;
import { Ionicons } from "@expo/vector-icons"; // Expo includes Ionicons by default

export default function BackButton() {
  const navigation = useNavigation();

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // If there's no screen to go back to, navigate to a safe default
      navigation.navigate("HomeScreen"); // change "HomeScreen" to your root screen
    }
  };

  return (
    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
      <Ionicons name="arrow-back" size={28} color="#7caed" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: 10,
    backgroundColor: "transparent",
    color: "#7caed",
  },
});