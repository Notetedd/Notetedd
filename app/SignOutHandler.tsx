// app/SignOutHandler.tsx
import { useEffect } from "react";
import { getAuth, signOut } from "firebase/auth";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";

async function handleSignOut(navigation) {
  const auth = getAuth();
  try {
    await signOut(auth);
    navigation.reset({
      index: 0,
      routes: [{ name: "LoginScreen" }],
    });
  } catch (error) {
    Alert.alert("Error", "Could not sign out. Please try again.");
  }
}

export default function SignOutHandler() {
  const navigation = useNavigation();

  useEffect(() => {
    handleSignOut(navigation);
  }, [navigation]);

  return null; // nothing to render
}