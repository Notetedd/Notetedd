/**
 *
 * This route exists solely to catch Google's OAuth redirect callback.
 *
 * Flow:
 *   1. User taps "Connect with Google Classroom"
 *   2. Expo AuthSession opens Google's consent page in the system browser
 *   3. After consent, Google redirects to:
 *        com.notetedd.app:/oauth2redirect/google?code=xxx&state=yyy
 *   4. Android resolves the deep link → opens the app → Expo Router matches
 *      this file → WebBrowser.maybeCompleteAuthSession() fires
 *   5. AuthSession receives the code in the originating component (SyncClassroomScreen)
 *      and the browser tab closes automatically
 *
 * This component never renders visibly — it just completes the handshake.
 * If somehow it does render (edge case), it shows a neutral loading state.
 */

import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";

export default function OAuthRedirectGoogle() {
  useEffect(() => {
    // This is the critical call — it detects the auth code in the URL and
    // signals the waiting AuthSession.useAuthRequest hook in SyncClassroomScreen.
    // The in-app browser tab then closes and control returns to the app.
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // Minimal UI — user should never see this for more than a flash.
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#a78bfa" />
      <Text style={styles.text}>Completing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#04040a",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  text: {
    color: "rgba(237,233,255,0.68)",
    fontSize: 13,
    fontFamily: "sans-serif",
    letterSpacing: 0.5,
  },
});