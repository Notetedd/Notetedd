
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
} from "firebase/firestore";
import DevicePermissions from './utils/devicePermissions';
import QRCodeScanner from '../components/QRCodeScanner';
import BackButton from "../components/Backbutton";
import { useTheme } from "./context/ThemeContext";

const { width, height } = Dimensions.get("window");

export default function PairedDevicesScreen({ navigation, route }) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  const auth = getAuth();
  const db = getFirestore();
  
  const [pairedDevices, setPairedDevices] = useState([]);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [selectedPairMethod, setSelectedPairMethod] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [connectionCode, setConnectionCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

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
  }, []);

  // Scan animation
  useEffect(() => {
    if (scanning) {
      Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [scanning]);

  const scanRotate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ==================== PERMISSIONS ====================
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE,
          PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE,
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
      const ipAddress = await Network.getIpAddressAsync();
      
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
      if (auth.currentUser) {
        await setDoc(doc(db, "devices", info.id), {
          ...info,
          userId: auth.currentUser.uid,
          lastSeen: serverTimestamp(),
        });
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
        where("userId", "==", auth.currentUser.uid)
      );

      // Real-time listener
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const devices = [];
        snapshot.forEach((doc) => {
          devices.push({ id: doc.id, ...doc.data() });
        });
        
        setPairedDevices(devices);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error loading paired devices:', error);
      setLoading(false);
    }
  };

  // ==================== SCAN FOR DEVICES ====================
  const scanForDevices = async () => {
    setScanning(true);
    setAvailableDevices([]);

    try {
      // Scan for devices in the same network
      const devicesRef = collection(db, "devices");
      const q = query(devicesRef);
      
      const snapshot = await getDocs(q);
      const devices = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Don't show current device
        if (data.id !== deviceInfo?.id && data.userId !== auth.currentUser?.uid) {
          devices.push({ id: doc.id, ...data });
        }
      });

      // Simulate network scan (in real app, use Bluetooth/WiFi Direct)
      setTimeout(() => {
        setAvailableDevices(devices);
        setScanning(false);
      }, 2000);

    } catch (error) {
      console.error('Scan error:', error);
      setScanning(false);
      Alert.alert('Error', 'Failed to scan for devices');
    }
  };

  // ==================== PAIRING METHODS ====================
  const generateConnectionCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setConnectionCode(code);
    
    // Store in Firestore for others to discover
    if (auth.currentUser) {
      setDoc(doc(db, "pairingCodes", code), {
        deviceId: deviceInfo.id,
        userId: auth.currentUser.uid,
        deviceInfo: deviceInfo,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        createdAt: serverTimestamp(),
      });
    }
    
    return code;
  };

  const pairWithCode = async (code) => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-character code');
      return;
    }

    setIsSubmittingCode(true);
    try {
      // Query for the pairing code
      const codesRef = collection(db, "pairingCodes");
      const q = query(codesRef, where("__name__", "==", code.toUpperCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert('Error', 'Invalid or expired code');
        setIsSubmittingCode(false);
        return;
      }

      let targetDevice = null;
      querySnapshot.forEach((doc) => {
        targetDevice = doc.data();
      });

      if (!targetDevice) {
        Alert.alert('Error', 'Invalid or expired code');
        setIsSubmittingCode(false);
        return;
      }

      // Check if code is expired
      const expiresAt = targetDevice.expiresAt?.toDate() || new Date(0);
      if (expiresAt < new Date()) {
        Alert.alert('Error', 'This code has expired');
        // Delete expired code
        await deleteDoc(doc(db, "pairingCodes", code.toUpperCase()));
        setIsSubmittingCode(false);
        return;
      }

      await pairDevice(targetDevice.deviceInfo, 'code');
      Alert.alert('Success!', 'Device paired successfully');
      setShowQRModal(false);
      setCodeInput("");

    } catch (error) {
      console.error('Pairing error:', error);
      Alert.alert('Error', 'Failed to pair device: ' + error.message);
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const pairDevice = async (targetDevice, method) => {
    if (!auth.currentUser || !deviceInfo) return;

    try {
      const pairingId = `${deviceInfo.id}_${targetDevice.id}`;
      
      await setDoc(doc(db, "devicePairings", pairingId), {
        userId: auth.currentUser.uid,
        sourceDevice: {
          id: deviceInfo.id,
          name: deviceInfo.name,
          type: deviceInfo.type,
        },
        targetDevice: {
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
        },
        method: method,
        status: 'active',
        pairedAt: serverTimestamp(),
        lastSync: serverTimestamp(),
      });

      Alert.alert('Success!', `Paired with ${targetDevice.name}`);
      setShowPairModal(false);
      
    } catch (error) {
      console.error('Pairing error:', error);
      Alert.alert('Error', 'Failed to pair device');
    }
  };

  const unpairDevice = async (pairingId, deviceName) => {
    Alert.alert(
      'Unpair Device',
      `Remove ${deviceName} from paired devices?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "devicePairings", pairingId));
              Alert.alert('Success', 'Device unpaired');
            } catch (error) {
              console.error('Unpair error:', error);
              Alert.alert('Error', 'Failed to unpair device');
            }
          },
        },
      ]
    );
  };

  // ==================== RENDER FUNCTIONS ====================
  const renderPairMethodCard = (icon, title, description, method, color) => (
    <TouchableOpacity
      style={[styles.methodCard, isDark && styles.methodCardDark]}
      onPress={() => {
        setSelectedPairMethod(method);
        if (method === 'qr') {
          // Show option to scan or generate
          Alert.alert(
            'QR Code Pairing',
            'Would you like to:',
            [
              { 
                text: 'Scan QR Code', 
                onPress: () => setShowQRScanner(true) 
              },
              { 
                text: 'Generate Code', 
                onPress: () => {
                  const code = generateConnectionCode();
                  setShowQRModal(true);
                } 
              },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        } else if (method === 'wifi') {
          scanForDevices();
        } else if (method === 'code') {
          setShowQRModal(true);
        }
      }}
    >
      <LinearGradient
        colors={[color + '20', color + '10']}
        style={styles.methodIconContainer}
      >
        <MaterialIcons name={icon} size={36} color={color} />
      </LinearGradient>
      <Text style={[styles.methodTitle, isDark && styles.textDark]}>{title}</Text>
      <Text style={[styles.methodDescription, isDark && styles.textSecondaryDark]}>
        {description}
      </Text>
    </TouchableOpacity>
  );

  const renderPairedDevice = ({ item, index }) => (
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
              <MaterialIcons name="sync" size={14} color="#9B5DE5" />
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

      <View style={styles.deviceFooter}>
        <View style={styles.deviceStat}>
          <MaterialIcons name="sync" size={16} color="#6B7280" />
          <Text style={styles.deviceStatText}>Last sync: Just now</Text>
        </View>
        <TouchableOpacity style={styles.syncButton}>
          <Text style={styles.syncButtonText}>Sync Now</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderAvailableDevice = ({ item }) => (
    <TouchableOpacity
      style={[styles.availableCard, isDark && styles.availableCardDark]}
      onPress={() => pairDevice(item, 'wifi')}
    >
      <MaterialIcons 
        name={item.type === 'PHONE' ? 'smartphone' : 'laptop'} 
        size={32} 
        color="#e67e22" 
      />
      <View style={styles.availableInfo}>
        <Text style={[styles.availableName, isDark && styles.textDark]}>
          {item.name}
        </Text>
        <Text style={[styles.availableDetails, isDark && styles.textSecondaryDark]}>
          {item.os} • {item.networkType}
        </Text>
      </View>
      <MaterialIcons name="add-circle" size={28} color="#10B981" />
    </TouchableOpacity>
  );

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
                <MaterialIcons name="wifi" size={16} color="#6B7280" />
                <Text style={styles.detailText}>{deviceInfo.ipAddress}</Text>
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
              Pair devices to sync lecture notes and collaborate in real-time
            </Text>
          </View>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <MaterialIcons name="info-outline" size={22} color="#3B82F6" />
          <Text style={[styles.infoText, isDark && styles.textDark]}>
            Students can pair with a device at the front of the class for better audio quality and real-time transcription sharing.
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
                Choose Pairing Method
              </Text>
              <TouchableOpacity onPress={() => setShowPairModal(false)}>
                <MaterialIcons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {renderPairMethodCard(
                'qr-code-scanner',
                'QR Code',
                'Scan QR code to pair instantly',
                'qr',
                '#9B5DE5'
              )}
              
              {renderPairMethodCard(
                'wifi',
                'Wi-Fi Direct',
                'Connect via local network',
                'wifi',
                '#e67e22'
              )}
              
              {renderPairMethodCard(
                'bluetooth',
                'Bluetooth',
                'Pair using Bluetooth connection',
                'bluetooth',
                '#3B82F6'
              )}

              {renderPairMethodCard(
                'pin',
                'Connection Code',
                'Enter 6-digit pairing code',
                'code',
                '#10B981'
              )}

              {/* Available Devices (WiFi scan) */}
              {selectedPairMethod === 'wifi' && (
                <View style={styles.scanSection}>
                  <View style={styles.scanHeader}>
                    <Text style={[styles.scanTitle, isDark && styles.textDark]}>
                      Available Devices
                    </Text>
                    {scanning && (
                      <Animated.View style={{ transform: [{ rotate: scanRotate }] }}>
                        <MaterialIcons name="sync" size={24} color="#9B5DE5" />
                      </Animated.View>
                    )}
                  </View>
                  
                  {scanning ? (
                    <View style={styles.scanningContainer}>
                      <ActivityIndicator size="large" color="#9B5DE5" />
                      <Text style={styles.scanningText}>Scanning for devices...</Text>
                    </View>
                  ) : availableDevices.length > 0 ? (
                    <FlatList
                      data={availableDevices}
                      keyExtractor={(item) => item.id}
                      renderItem={renderAvailableDevice}
                      scrollEnabled={false}
                    />
                  ) : (
                    <Text style={styles.noDevicesText}>
                      No devices found. Make sure devices are on the same network.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.qrModalOverlay}>
          <View style={[styles.qrModalContent, isDark && styles.qrModalContentDark]}>
            <TouchableOpacity
              style={styles.qrCloseButton}
              onPress={() => setShowQRModal(false)}
            >
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.qrTitle}>Connection Code</Text>
            <Text style={styles.qrSubtitle}>
              Share this code with another device
            </Text>

            <View style={styles.codeContainer}>
              <LinearGradient
                colors={['#9B5DE5', '#7C3AED']}
                style={styles.codeGradient}
              >
                <Text style={styles.codeText}>{connectionCode}</Text>
              </LinearGradient>
            </View>

            <Text style={styles.qrExpiry}>Code expires in 5 minutes</Text>

            <View style={styles.qrDivider}>
              <View style={styles.qrDividerLine} />
              <Text style={styles.qrDividerText}>OR</Text>
              <View style={styles.qrDividerLine} />
            </View>

            <Text style={styles.qrInputTitle}>Enter Code from Another Device</Text>
            
            <View style={styles.codeInputContainer}>
              <TextInput
                style={[styles.codeInput, isDark && styles.codeInputDark]}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#999"
                value={codeInput}
                onChangeText={(text) => setCodeInput(text.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.submitCodeButton, isSubmittingCode && styles.submitCodeButtonDisabled]}
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
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <Modal
          visible={showQRScanner}
          animationType="slide"
          onRequestClose={() => setShowQRScanner(false)}
        >
          <QRCodeScanner
            onScan={(code) => {
              setShowQRScanner(false);
              pairWithCode(code);
            }}
            onClose={() => setShowQRScanner(false)}
            isDark={isDark}
          />
        </Modal>
      )}
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
  backButton: {
    position: "absolute",
    left: 24,
    top: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#9B5DE520",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    maxHeight: height * 0.8,
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
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  methodCardDark: {
    backgroundColor: "#0F172A",
    borderColor: "#374151",
  },
  methodIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },
  methodDescription: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  // Available Devices
  availableCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  availableCardDark: {
    backgroundColor: "#0F172A",
    borderColor: "#374151",
  },
  availableInfo: {
    flex: 1,
    marginLeft: 12,
  },
  availableName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  availableDetails: {
    fontSize: 13,
    color: "#6B7280",
  },

  // Scan Section
  scanSection: {
    marginTop: 20,
  },
  scanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  scanningContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  scanningText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  noDevicesText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 20,
  },

  // QR Modal
  qrModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  qrModalContent: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  qrModalContentDark: {
    backgroundColor: "#1E293B",
  },
  qrCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(107,114,128,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 8,
  },
  qrSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 32,
    textAlign: "center",
  },
  codeContainer: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
  },
  codeGradient: {
    paddingVertical: 24,
    paddingHorizontal: 40,
  },
  codeText: {
    fontSize: 48,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 8,
    textAlign: "center",
  },
  qrExpiry: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "600",
    marginBottom: 24,
  },
  qrDivider: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginVertical: 24,
  },
  qrDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  qrDividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  qrInputTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  codeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  codeInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  codeInputDark: {
    backgroundColor: "#0F172A",
    borderColor: "#374151",
    color: "#F3F4F6",
  },
  submitCodeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  submitCodeButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },

  // Text Colors
  textDark: {
    color: "#F3F4F6",
  },
  textSecondaryDark: {
    color: "#9CA3AF",
  },
});

