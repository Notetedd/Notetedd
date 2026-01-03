// utils/devicePermissions.js
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';

class DevicePermissionsHandler {
  
  // ==================== ANDROID PERMISSIONS ====================
  async requestAndroidPermissions() {
    if (Platform.OS !== 'android') return true;

    try {
      const androidVersion = Platform.Version;
      
      // Permissions needed based on Android version
      let permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ];

      // Android 12+ (API 31+) - New Bluetooth permissions
      if (androidVersion >= 31) {
        permissions.push(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        );
      } else {
        // Android 11 and below
        permissions.push(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN
        );
      }

      // WiFi permissions
      permissions.push(
        PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE,
        PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE,
        PermissionsAndroid.PERMISSIONS.ACCESS_NETWORK_STATE
      );

      // Camera for QR scanning
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);

      console.log('Requesting permissions:', permissions);

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      // Check if all permissions were granted
      const allGranted = Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        const deniedPermissions = Object.keys(granted).filter(
          key => granted[key] !== PermissionsAndroid.RESULTS.GRANTED
        );
        
        console.warn('Denied permissions:', deniedPermissions);
        
        Alert.alert(
          'Permissions Required',
          'Device pairing requires location, Bluetooth, and camera permissions. Please enable them in settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings() 
            }
          ]
        );
        return false;
      }

      console.log('✅ All Android permissions granted');
      return true;

    } catch (err) {
      console.error('Permission error:', err);
      Alert.alert('Error', 'Failed to request permissions');
      return false;
    }
  }

  // ==================== IOS PERMISSIONS ====================
  async requestIOSPermissions() {
    if (Platform.OS !== 'ios') return true;

    try {
      // Location permission (required for Bluetooth on iOS)
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (locationStatus !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Location access is required for Bluetooth device pairing on iOS.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings() 
            }
          ]
        );
        return false;
      }

      // Camera permission for QR scanning
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      
      if (cameraStatus !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required for QR code scanning.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => Linking.openSettings() 
            }
          ]
        );
        return false;
      }

      console.log('✅ All iOS permissions granted');
      return true;

    } catch (err) {
      console.error('iOS Permission error:', err);
      Alert.alert('Error', 'Failed to request permissions');
      return false;
    }
  }

  // ==================== WEB PERMISSIONS ====================
  async requestWebPermissions() {
    if (Platform.OS !== 'web') return true;

    try {
      // Web Bluetooth API
      if ('bluetooth' in navigator) {
        console.log('✅ Web Bluetooth API available');
      } else {
        console.warn('⚠️ Web Bluetooth not supported');
      }

      // Camera for QR scanning
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
          console.log('✅ Camera access granted');
        } catch (err) {
          console.warn('Camera permission denied:', err);
        }
      }

      return true;
    } catch (err) {
      console.error('Web permission error:', err);
      return false;
    }
  }

  // ==================== UNIFIED REQUEST ====================
  async requestAllPermissions() {
    console.log('🔐 Requesting permissions for platform:', Platform.OS);

    switch (Platform.OS) {
      case 'android':
        return await this.requestAndroidPermissions();
      case 'ios':
        return await this.requestIOSPermissions();
      case 'web':
        return await this.requestWebPermissions();
      default:
        return true;
    }
  }

  // ==================== CHECK PERMISSIONS ====================
  async checkPermissions() {
    if (Platform.OS === 'android') {
      try {
        const bluetoothScan = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
        );
        const location = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        const camera = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );

        return bluetoothScan && location && camera;
      } catch (err) {
        console.error('Check permissions error:', err);
        return false;
      }
    }

    if (Platform.OS === 'ios') {
      const { status: locationStatus } = await Location.getForegroundPermissionsAsync();
      return locationStatus === 'granted';
    }

    return true; // Web
  }
}

export default new DevicePermissionsHandler();