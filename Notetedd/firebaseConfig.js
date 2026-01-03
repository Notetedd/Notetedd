import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDp19NeteEO_5CCk56KYiibkGX9m1AkQoo",
  authDomain: "noteteddapp.firebaseapp.com",
  projectId: "noteteddapp",
  storageBucket: "noteteddapp.firebasestorage.app",
  messagingSenderId: "439102305625",
  appId: "1:439102305625:web:6a01ae085db5659d2bc848",
  measurementId: "G-219T1PV0HG"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// ✅ Use different persistence depending on platform
let auth;
if (Platform.OS === 'web') {
  // Web: use browser persistence
  auth = getAuth(app);
  auth.setPersistence(browserLocalPersistence);
} else {
  // Native: use AsyncStorage persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

// Firestore
const db = getFirestore(app);
const firestore = getFirestore(app);
export { auth, db ,firestore };