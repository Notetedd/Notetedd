import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebaseConfig';
import * as Updates from 'expo-updates';
import * as Font from 'expo-font';
import {
  MaterialIcons,
  MaterialCommunityIcons,
  Ionicons,
} from '@expo/vector-icons';

export default function Index() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // ── 1. Load fonts first ──────────────────────────────────────────
  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          ...MaterialIcons.font,
          ...MaterialCommunityIcons.font,
          ...Ionicons.font,
        });
      } catch (e) {
        // Never block the app if font loading fails
        console.warn('Font load error:', e);
      } finally {
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  // ── 2. Auth redirect (waits for fonts) ──────────────────────────
  useEffect(() => {
    if (!fontsLoaded) return; // don't navigate until fonts are ready

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        router.replace('/HomeScreen');
      } else {
        const seen = await AsyncStorage.getItem('hasSeenOnboarding');
        router.replace(seen ? '/LoginScreen' : '/OnboardingScreen');
      }
    });

    return () => unsubscribe();
  }, [fontsLoaded]); // re-runs once fonts are done

  // ── 3. OTA update check ─────────────────────────────────────────
  useEffect(() => {
    async function checkForUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // Silently ignore in dev or if updates aren't configured
      }
    }
    checkForUpdate();
  }, []);

  // Show spinner while fonts load
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator size="large" color="#e67e22" />
    </View>
  );
}