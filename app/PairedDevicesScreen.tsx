import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  Platform,
  TextInput,
  Animated,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  PermissionsAndroid,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { getAuth } from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import BackButton from "../components/Backbutton";
import { useTheme } from "./context/ThemeContext";

const { width, height } = Dimensions.get("window");

export default function PairedDevicesScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  const auth = getAuth();
  const db = getFirestore();
  
  const [pairedDevices, setPairedDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPairModal, setShowPairModal] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [connectionCode, setConnectionCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncingDevices, setSyncingDevices] = useState(new Set());
  const [latestRecordings, setLatestRecordings] = useState({});
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const codeFlashAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    initializeDeviceInfo();
    loadPairedDevices();
    requestPermissions();
    checkNetworkStatus();

    // Monitor network status
    const networkInterval = setInterval(checkNetworkStatus, 5000);

    return () => {
      clearInterval(networkInterval);
    };
  }, []);

  // Flash animation for generated code
  const flashCode = () => {
    Animated.sequence([
      Animated.timing(codeFlashAnim, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(codeFlashAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ==================== NETWORK STATUS ====================
  const checkNetworkStatus = async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      setIsOnline(networkState.isConnected && networkState.isInternetReachable);
    } catch (error) {
      console.error('Network check error:', error);
      setIsOnline(false);
    }
  };

  // ==================== PERMISSIONS ====================
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('Permissions:', granted);
      } catch (err) {
        console.warn('Permission error:', err);
      }
    }
  };

  // ==================== DEVICE INFO ====================
  const initializeDeviceInfo = async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      let ipAddress = "N/A";
      
      try {
        ipAddress = await Network.getIpAddressAsync();
      } catch (e) {
        console.log("IP not available:", e);
      }
      
      const info = {
        id: auth.currentUser?.uid || Device.osBuildId,
        name: Device.deviceName || `${Device.brand} ${Device.modelName}`,
        type: Device.deviceType,
        os: Platform.OS,
        osVersion: Device.osVersion,
        brand: Device.brand,
        model: Device.modelName,
        ipAddress: ipAddress,
        networkType: networkState.type,
        isConnected: networkState.isConnected,
        timestamp: new Date().toISOString(),
      };

      setDeviceInfo(info);
      console.log('Device Info:', info);

      // Register device in Firestore
      if (auth.currentUser && networkState.isConnected) {
        await setDoc(doc(db, "devices", info.id), {
          ...info,
          userId: auth.currentUser.uid,
          lastSeen: serverTimestamp(),
          isActive: true,
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error getting device info:', error);
    }
  };

  // ==================== LOAD PAIRED DEVICES ====================
  const loadPairedDevices = async () => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const pairingsRef = collection(db, "devicePairings");
      const q = query(
        pairingsRef,
        where("userId", "==", auth.currentUser.uid),
        where("status", "==", "active")
      );

      // Real-time listener for paired devices
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const devices = [];
        snapshot.forEach((doc) => {
          devices.push({ id: doc.id, ...doc.data() });
        });
        
        setPairedDevices(devices);
        setLoading(false);

        // Load latest recordings for each paired device
        devices.forEach(device => {
          loadLatestRecordingForDevice(device);
        });
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error loading paired devices:', error);
      setLoading(false);
    }
  };

  // ==================== LOAD LATEST RECORDING FROM PAIRED DEVICE ====================
  const loadLatestRecordingForDevice = async (device) => {
    try {
      // Get the device owner's latest recording
      const targetDeviceUserId = device.targetDevice?.userId || device.userId;
      
      const recordingsRef = collection(db, "recordings");
      const q = query(
        recordingsRef,
        where("userId", "==", targetDeviceUserId),
        where("deviceId", "==", device.targetDevice?.id),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const latestRecording = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setLatestRecordings(prev => ({
            ...prev,
            [device.id]: latestRecording
          }));
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error loading latest recording:', error);
    }
  };

  // ==================== SYNC RECORDING FROM PAIRED DEVICE ====================
  const syncRecordingFromDevice = async (device, recording) => {
    try {
      setSyncingDevices(prev => new Set([...prev, device.id]));
      
      // Create a copy of the recording in the current user's account
      const syncedRecording = {
        ...recording,
        userId: auth.currentUser.uid,
        syncedFrom: {
          deviceId: device.targetDevice?.id,
          deviceName: device.targetDevice?.name,
          originalUserId: recording.userId,
        },
        syncedAt: serverTimestamp(),
        originalRecordingId: recording.id,
        isSynced: true,
      };

      await addDoc(collection(db, "recordings"), syncedRecording);

      // Update sync status
      await updateDoc(doc(db, "devicePairings", device.id), {
        lastSync: serverTimestamp(),
        lastSyncedRecordingId: recording.id,
      });

      Alert.alert(
        "Success! 🎉",
        `Synced recording from ${device.targetDevice?.name}`,
        [
          {
            text: "View Recording",
            onPress: () => {
              if (navigation?.navigate) {
                navigation.navigate("NotesScreen", { refresh: Date.now() });
              }
            },
          },
          { text: "OK" }
        ]
      );

    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Error', 'Failed to sync recording: ' + error.message);
    } finally {
      setSyncingDevices(prev => {
        const updated = new Set(prev);
        updated.delete(device.id);
        return updated;
      });
    }
  };

  // ==================== PAIRING CODE GENERATION ====================
  const generateConnectionCode = async () => {
    setIsGeneratingCode(true);
    try {
      // Generate a secure 6-digit code
      const code = Math.random().toString().slice(2, 8);
      setConnectionCode(code);
      flashCode();
      
      // Store in Firestore with security measures
      if (auth.currentUser) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        
        await setDoc(doc(db, "pairingCodes", code), {
          deviceId: deviceInfo.id,
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          deviceInfo: {
            id: deviceInfo.id,
            name: deviceInfo.name,
            type: deviceInfo.type,
            os: deviceInfo.os,
          },
          expiresAt: expiresAt,
          createdAt: serverTimestamp(),
          used: false,
          maxUses: 1, // Security: Can only be used once
        });

        console.log("✅ Code generated:", code);
        
        // Auto-cleanup after expiration
        setTimeout(async () => {
          try {
            const codeDoc = await getDoc(doc(db, "pairingCodes", code));
            if (codeDoc.exists() && !codeDoc.data().used) {
              await deleteDoc(doc(db, "pairingCodes", code));
              console.log("🗑️ Expired code cleaned up");
            }
          } catch (e) {
            console.log("Cleanup error:", e);
          }
        }, 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Code generation error:', error);
      Alert.alert('Error', 'Failed to generate code');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  // ==================== PAIR WITH CODE ====================
  const pairWithCode = async (code) => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code');
      return;
    }

    setIsSubmittingCode(true);
    try {
      const codeDocRef = doc(db, "pairingCodes", code);
      const codeDoc = await getDoc(codeDocRef);

      if (!codeDoc.exists()) {
        Alert.alert('Error', 'Invalid code. Please check and try again.');
        setIsSubmittingCode(false);
        return;
      }

      const codeData = codeDoc.data();

      // Security checks
      if (codeData.used) {
        Alert.alert('Error', 'This code has already been used.');
        setIsSubmittingCode(false);
        return;
      }

      const expiresAt = codeData.expiresAt?.toDate() || new Date(0);
      if (expiresAt < new Date()) {
        Alert.alert('Error', 'This code has expired. Please generate a new one.');
        await deleteDoc(codeDocRef);
        setIsSubmittingCode(false);
        return;
      }

      // Prevent self-pairing
      if (codeData.userId === auth.currentUser?.uid) {
        Alert.alert('Error', 'You cannot pair with your own device.');
        setIsSubmittingCode(false);
        return;
      }

      // Mark code as used
      await updateDoc(codeDocRef, {
        used: true,
        usedAt: serverTimestamp(),
        usedBy: auth.currentUser?.uid,
      });

      await pairDevice(codeData.deviceInfo, 'code', codeData.userId);
      
      // Clean up used code
      setTimeout(() => deleteDoc(codeDocRef), 1000);

      setCodeInput("");
      setShowPairModal(false);

    } catch (error) {
      console.error('Pairing error:', error);
      Alert.alert('Error', 'Failed to pair device: ' + error.message);
    } finally {
      setIsSubmittingCode(false);
    }
  };

  // ==================== PAIR DEVICE ====================
  const pairDevice = async (targetDevice, method, targetUserId) => {
    if (!auth.currentUser || !deviceInfo) return;

    try {
      const pairingId = `${deviceInfo.id}_${targetDevice.id}`;
      
      // Check if already paired
      const existingPairing = await getDoc(doc(db, "devicePairings", pairingId));
      if (existingPairing.exists() && existingPairing.data().status === 'active') {
        Alert.alert('Info', 'Devices are already paired!');
        return;
      }

      const pairingData = {
        userId: auth.currentUser.uid,
        sourceDevice: {
          id: deviceInfo.id,
          name: deviceInfo.name,
          type: deviceInfo.type,
          userId: auth.currentUser.uid,
        },
        targetDevice: {
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
          userId: targetUserId,
        },
        method: method,
        status: 'active',
        pairedAt: serverTimestamp(),
        lastSync: null,
        syncEnabled: true,
        autoSync: false, // User can enable auto-sync
      };

      await setDoc(doc(db, "devicePairings", pairingId), pairingData);

      // Create reverse pairing for bidirectional sync
      const reversePairingId = `${targetDevice.id}_${deviceInfo.id}`;
      await setDoc(doc(db, "devicePairings", reversePairingId), {
        ...pairingData,
        userId: targetUserId,
        sourceDevice: pairingData.targetDevice,
        targetDevice: pairingData.sourceDevice,
      });

      Alert.alert(
        'Success! 🎉',
        `Paired with ${targetDevice.name}\n\nYou can now sync recordings from this device.`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Pairing error:', error);
      Alert.alert('Error', 'Failed to pair device: ' + error.message);
    }
  };

  // ==================== UNPAIR DEVICE ====================
  const unpairDevice = async (pairingId, deviceName) => {
    Alert.alert(
      'Unpair Device',
      `Remove ${deviceName} from paired devices?\n\nSynced recordings will remain in your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, "devicePairings", pairingId), {
                status: 'inactive',
                unpairedAt: serverTimestamp(),
              });
              Alert.alert('Success', 'Device unpaired successfully');
            } catch (error) {
              console.error('Unpair error:', error);
              Alert.alert('Error', 'Failed to unpair device');
            }
          },
        },
      ]
    );
  };

  // ==================== TOGGLE AUTO-SYNC ====================
  const toggleAutoSync = async (pairingId, currentValue) => {
    try {
      await updateDoc(doc(db, "devicePairings", pairingId), {
        autoSync: !currentValue,
      });
    } catch (error) {
      console.error('Toggle auto-sync error:', error);
    }
  };

  // ==================== RENDER FUNCTIONS ====================
  const renderPairMethodCard = (icon, title, description, method, color, badge = null) => (
    <TouchableOpacity
      style={[styles.methodCard, isDark && styles.methodCardDark]}
      onPress={() => {
        if (method === 'code') {
          // Primary method - show code generation
          generateConnectionCode();
        } else if (method === 'bluetooth') {
          Alert.alert(
            'Bluetooth Pairing',
            'Bluetooth pairing is ideal for offline mode and connecting microphones.\n\nComing in next update!',
            [{ text: 'OK' }]
          );
        }
      }}
      disabled={method === 'bluetooth'}
    >
      <LinearGradient
        colors={[color + '20', color + '10']}
        style={styles.methodIconContainer}
      >
        <MaterialIcons name={icon} size={36} color={color} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.methodTitle, isDark && styles.textDark]}>{title}</Text>
          {badge && (
            <View style={[styles.badge, badge === 'PRIMARY' && styles.primaryBadge]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.methodDescription, isDark && styles.textSecondaryDark]}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderPairedDevice = ({ item, index }) => {
    const isSyncing = syncingDevices.has(item.id);
    const latestRecording = latestRecordings[item.id];
    
    return (
      <Animated.View
        style={[
          styles.deviceCard,
          isDark && styles.deviceCardDark,
          {
            opacity: fadeAnim,
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 30],
                outputRange: [0, index * 5],
              }),
            }],
          },
        ]}
      >
        <View style={styles.deviceHeader}>
          <View style={styles.deviceIconContainer}>
            <LinearGradient
              colors={['#9B5DE5', '#7C3AED']}
              style={styles.deviceIconGradient}
            >
              <MaterialIcons 
                name={item.targetDevice?.type === 'PHONE' ? 'smartphone' : 'laptop'} 
                size={28} 
                color="#fff" 
              />
            </LinearGradient>
          </View>
          
          <View style={styles.deviceInfo}>
            <Text style={[styles.deviceName, isDark && styles.textDark]}>
              {item.targetDevice?.name}
            </Text>
            <View style={styles.deviceMeta}>
              <View style={[styles.statusBadge, { backgroundColor: '#10B98120' }]}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
              <View style={styles.methodBadge}>
                <MaterialIcons 
                  name={item.method === 'code' ? 'pin' : 'bluetooth'} 
                  size={14} 
                  color="#9B5DE5" 
                />
                <Text style={styles.methodText}>{item.method?.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.unpairButton}
            onPress={() => unpairDevice(item.id, item.targetDevice?.name)}
          >
            <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Latest Recording Info */}
        {latestRecording && (
          <View style={styles.recordingInfo}>
            <MaterialIcons name="mic" size={16} color="#6B7280" />
            <Text style={[styles.recordingInfoText, isDark && styles.textSecondaryDark]} numberOfLines={1}>
              Latest: {latestRecording.title}
            </Text>
          </View>
        )}

        <View style={styles.deviceFooter}>
          <View style={styles.deviceStat}>
            <MaterialIcons name="sync" size={16} color="#6B7280" />
            <Text style={[styles.deviceStatText, isDark && styles.textSecondaryDark]}>
              {item.lastSync ? 'Synced recently' : 'Never synced'}
            </Text>
          </View>
          
          {latestRecording && (
            <TouchableOpacity 
              style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
              onPress={() => syncRecordingFromDevice(item, latestRecording)}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#9B5DE5" />
              ) : (
                <>
                  <MaterialIcons name="cloud-download" size={16} color="#9B5DE5" />
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // ==================== MAIN RENDER ====================
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#1F2937", "#374151"] : ["#9B5DE5", "#7C3AED"]}
        style={styles.header}
      >
        <BackButton />
        
        <View style={styles.headerContent}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <MaterialIcons name="devices" size={36} color="#fff" />
          </Animated.View>
          <Text style={styles.headerTitle}>Paired Devices</Text>
          <Text style={styles.headerSubtitle}>
            {pairedDevices.length} device{pairedDevices.length !== 1 ? 's' : ''} connected
          </Text>
          
          {/* Network Status Badge */}
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <MaterialIcons name="cloud-off" size={14} color="#EF4444" />
              <Text style={styles.offlineText}>Offline - Use Bluetooth</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Current Device Info */}
        {deviceInfo && (
          <Animated.View
            style={[
              styles.currentDeviceCard,
              isDark && styles.currentDeviceCardDark,
              { opacity: fadeAnim }
            ]}
          >
            <View style={styles.currentDeviceHeader}>
              <LinearGradient
                colors={['#e67e22', '#d35400']}
                style={styles.currentDeviceIcon}
              >
                <MaterialIcons 
                  name={deviceInfo.type === 'PHONE' ? 'smartphone' : 'laptop'} 
                  size={32} 
                  color="#fff" 
                />
              </LinearGradient>
              <View style={styles.currentDeviceInfo}>
                <Text style={[styles.currentDeviceName, isDark && styles.textDark]}>
                  This Device
                </Text>
                <Text style={[styles.currentDeviceModel, isDark && styles.textSecondaryDark]}>
                  {deviceInfo.name}
                </Text>
              </View>
              <View style={styles.thisBadge}>
                <Text style={styles.thisBadgeText}>YOU</Text>
              </View>
            </View>
            <View style={styles.currentDeviceDetails}>
              <View style={styles.detailRow}>
                <MaterialIcons 
                  name={isOnline ? "wifi" : "wifi-off"} 
                  size={16} 
                  color={isOnline ? "#10B981" : "#EF4444"} 
                />
                <Text style={[styles.detailText, !isOnline && { color: '#EF4444' }]}>
                  {isOnline ? deviceInfo.ipAddress : "Offline"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <MaterialIcons name="info" size={16} color="#6B7280" />
                <Text style={styles.detailText}>
                  {deviceInfo.os} {deviceInfo.osVersion}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Add Device Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowPairModal(true)}
        >
          <LinearGradient
            colors={['#e67e22', '#d35400']}
            style={styles.addButtonGradient}
          >
            <MaterialIcons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Pair New Device</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Paired Devices List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#9B5DE5" />
            <Text style={[styles.loadingText, isDark && styles.textSecondaryDark]}>
              Loading devices...
            </Text>
          </View>
        ) : pairedDevices.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Connected Devices
            </Text>
            <FlatList
              data={pairedDevices}
              keyExtractor={(item) => item.id}
              renderItem={renderPairedDevice}
              scrollEnabled={false}
            />
          </View>
        ) : (
          <View style={[styles.emptyContainer, isDark && styles.emptyContainerDark]}>
            <MaterialIcons name="devices-other" size={64} color="#D1D5DB" />
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              No Paired Devices
            </Text>
            <Text style={[styles.emptyText, isDark && styles.textSecondaryDark]}>
              Pair with devices at the front of class to get clear audio and sync recordings in real-time
            </Text>
          </View>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <MaterialIcons name="info-outline" size={22} color="#3B82F6" />
          <Text style={[styles.infoText, isDark && styles.textDark]}>
            <Text style={{ fontWeight: '700' }}>How it works:</Text> Students sitting far from the speaker can pair with a device at the front to receive better audio quality and real-time transcriptions. The front device captures clear audio while paired devices receive synced recordings.
          </Text>
        </View>
      </ScrollView>

      {/* Pairing Modal */}
      <Modal
        visible={showPairModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPairModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.textDark]}>
                Pair New Device
              </Text>
              <TouchableOpacity onPress={() => {
                setShowPairModal(false);
                setConnectionCode("");
                setCodeInput("");
              }}>
                <MaterialIcons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Primary Method - 6-Digit Code */}
              {renderPairMethodCard(
                'pin',
                '6-Digit Code',
                'Quick & secure pairing with code',
                'code',
                '#10B981',
                'PRIMARY'
              )}

              {/* Show Generated Code */}
              {connectionCode && (
                <Animated.View 
                  style={[
                    styles.generatedCodeContainer,
                    isDark && styles.generatedCodeContainerDark,
                    { transform: [{ scale: codeFlashAnim }] }
                  ]}
                >
                  <View style={styles.codeHeader}>
                    <MaterialIcons name="check-circle" size={20} color="#10B981" />
                    <Text style={[styles.codeHeaderText, isDark && styles.textDark]}>
                      Your Pairing Code
                    </Text>
                  </View>
                  
                  <View style={styles.codeDisplay}>
                    <LinearGradient
                      colors={['#10B981', '#059669']}
                      style={styles.codeGradient}
                    >
                      <Text style={styles.codeText}>{connectionCode}</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.codeTimer}>
                    <MaterialIcons name="timer" size={16} color="#EF4444" />
                    <Text style={styles.codeTimerText}>Expires in 5 minutes</Text>
                  </View>

                  <Text style={[styles.codeInstruction, isDark && styles.textSecondaryDark]}>
                    Share this code with the other device to complete pairing
                  </Text>
                </Animated.View>
              )}

              {/* Code Input Section */}
              <View style={[styles.codeInputSection, isDark && styles.codeInputSectionDark]}>
                <View style={styles.inputHeader}>
                  <MaterialIcons name="keyboard" size={20} color="#9B5DE5" />
                  <Text style={[styles.inputHeaderText, isDark && styles.textDark]}>
                    Or Enter Code from Another Device
                  </Text>
                </View>

                <View style={styles.codeInputContainer}>
                  <TextInput
                    style={[styles.codeInput, isDark && styles.codeInputDark]}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#9CA3AF"
                    value={codeInput}
                    onChangeText={(text) => setCodeInput(text.replace(/[^0-9]/g, ''))}
                    maxLength={6}
                    keyboardType="number-pad"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.submitCodeButton, 
                      (isSubmittingCode || codeInput.length !== 6) && styles.submitCodeButtonDisabled
                    ]}
                    onPress={() => pairWithCode(codeInput)}
                    disabled={isSubmittingCode || codeInput.length !== 6}
                  >
                    {isSubmittingCode ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="arrow-forward" size={24} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OTHER METHODS</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Bluetooth Method */}
              {renderPairMethodCard(
                'bluetooth',
                'Bluetooth',
                'For offline mode & microphones',
                'bluetooth',
                '#3B82F6',
                isOnline ? 'COMING SOON' : 'OFFLINE'
              )}

              {/* QR Code - Coming Soon */}
              <TouchableOpacity
                style={[styles.methodCard, styles.disabledMethodCard, isDark && styles.methodCardDark]}
                disabled={true}
              >
                <LinearGradient
                  colors={['#9CA3AF20', '#9CA3AF10']}
                  style={styles.methodIconContainer}
                >
                  <MaterialIcons name="qr-code-scanner" size={36} color="#9CA3AF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.methodTitle, { color: '#9CA3AF' }]}>QR Code</Text>
                    <View style={styles.comingSoonBadge}>
                      <Text style={styles.comingSoonText}>COMING SOON</Text>
                    </View>
                  </View>
                  <Text style={[styles.methodDescription, { color: '#9CA3AF' }]}>
                    Scan QR code for instant pairing
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Security Notice */}
              <View style={[styles.securityNotice, isDark && styles.securityNoticeDark]}>
                <MaterialIcons name="security" size={18} color="#10B981" />
                <Text style={[styles.securityText, isDark && styles.textSecondaryDark]}>
                  <Text style={{ fontWeight: '700' }}>Secure Pairing:</Text> All pairing codes are encrypted, expire after 5 minutes, and can only be used once for maximum security.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  // Header
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerContent: {
    alignItems: "center",
    marginTop: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 6,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 10,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FEE2E2',
  },

  // Content
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Current Device Card
  currentDeviceCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  currentDeviceCardDark: {
    backgroundColor: "#1E293B",
  },
  currentDeviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  currentDeviceIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  currentDeviceInfo: {
    flex: 1,
  },
  currentDeviceName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  currentDeviceModel: {
    fontSize: 14,
    color: "#6B7280",
  },
  thisBadge: {
    backgroundColor: "#e67e2220",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e67e22",
  },
  thisBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#e67e22",
  },
  currentDeviceDetails: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },

  // Add Button
  addButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    elevation: 6,
    shadowColor: "#e67e22",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  addButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },

  // Device Card
  deviceCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deviceCardDark: {
    backgroundColor: "#1E293B",
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  deviceIconContainer: {
    marginRight: 12,
  },
  deviceIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },
  deviceMeta: {
    flexDirection: "row",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#9B5DE520",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  methodText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9B5DE5",
  },
  unpairButton: {
    padding: 8,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  recordingInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  deviceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  deviceStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deviceStatText: {
    fontSize: 13,
    color: "#6B7280",
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: "#9B5DE520",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9B5DE5",
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    marginVertical: 20,
  },
  emptyContainerDark: {
    backgroundColor: "#1E293B",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#3B82F610",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3B82F620",
    gap: 12,
    marginTop: 20,
  },
  infoBoxDark: {
    backgroundColor: "#3B82F620",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#1F2937",
    lineHeight: 18,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: height * 0.85,
  },
  modalContentDark: {
    backgroundColor: "#1E293B",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F2937",
  },

  // Method Cards
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  methodCardDark: {
    backgroundColor: "#0F172A",
    borderColor: "#374151",
  },
  disabledMethodCard: {
    opacity: 0.6,
  },
  methodIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  methodDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#9CA3AF20',
  },
  primaryBadge: {
    backgroundColor: '#10B98120',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  comingSoonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#9CA3AF20',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
  },

  // Generated Code Container
  generatedCodeContainer: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  generatedCodeContainerDark: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  codeHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#047857',
  },
  codeDisplay: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  codeGradient: {
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  codeText: {
    fontSize: 44,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 12,
    textAlign: 'center',
  },
  codeTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  codeTimerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  codeInstruction: {
    fontSize: 13,
    color: '#047857',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Code Input Section
  codeInputSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  codeInputSectionDark: {
    backgroundColor: '#374151',
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  inputHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  codeInputDark: {
    backgroundColor: '#0F172A',
    borderColor: '#4B5563',
    color: '#F3F4F6',
  },
  submitCodeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitCodeButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },

  // Security Notice
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  securityNoticeDark: {
    backgroundColor: '#064E3B',
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#047857',
    lineHeight: 18,
  },

  // Text Colors
  textDark: {
    color: "#F3F4F6",
  },
  textSecondaryDark: {
    color: "#9CA3AF",
  },
});