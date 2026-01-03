// components/QRCodeScanner.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function QRCodeScanner({ onScan, onClose, isDark }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [flashMode, setFlashMode] = useState('off');
  
  // Animations
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    if (scanning && !scanned) {
      // Animate scan line
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [scanning, scanned]);

  useEffect(() => {
    if (scanned) {
      // Success animation
      Animated.spring(successAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [scanned]);

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;
    
    setScanned(true);
    setScanning(false);
    
    console.log('QR Code scanned:', { type, data });
    
    // Extract code from data (in case it's a URL with parameters)
    let code = data;
    if (data.includes('code=')) {
      code = data.split('code=')[1].split('&')[0];
    }
    
    // Validate code format (6 characters)
    if (code.length === 6) {
      onScan(code.toUpperCase());
    } else {
      onScan(data); // Send raw data if not standard format
    }
  };

  const handleRescan = () => {
    setScanned(false);
    setScanning(true);
    successAnim.setValue(0);
  };

  const toggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'torch' : 'off');
  };

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width * 0.7],
  });

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#9B5DE5" />
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <MaterialIcons name="camera-off" size={80} color="#EF4444" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan QR codes for device pairing
          </Text>
          <TouchableOpacity 
            style={styles.permissionButton} 
            onPress={requestPermission}
          >
            <LinearGradient
              colors={['#9B5DE5', '#7C3AED']}
              style={styles.permissionButtonGradient}
            >
              <MaterialIcons name="camera" size={24} color="#fff" />
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onClose}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      {scanning && (
        <CameraView
          style={styles.camera}
          facing="back"
          flash={flashMode}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top Section */}
        <View style={styles.topSection}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Scan QR Code</Text>
            <Text style={styles.subtitle}>
              {scanned ? 'Code Scanned! ✓' : 'Position the QR code in the frame'}
            </Text>
          </View>

          {/* Flash Toggle */}
          {!scanned && (
            <TouchableOpacity 
              style={styles.flashButton} 
              onPress={toggleFlash}
            >
              <MaterialIcons 
                name={flashMode === 'off' ? 'flash-off' : 'flash-on'} 
                size={24} 
                color="#fff" 
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Scan Frame */}
        <View style={styles.scanFrame}>
          <View style={styles.scannerContainer}>
            {/* Corner borders */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            {/* Scanning line animation */}
            {!scanned && (
              <Animated.View 
                style={[
                  styles.scanLine,
                  { transform: [{ translateY: scanLineTranslateY }] }
                ]}
              >
                <LinearGradient
                  colors={['transparent', '#9B5DE5', '#9B5DE5', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.scanLineGradient}
                />
              </Animated.View>
            )}

            {/* Success indicator */}
            {scanned && (
              <Animated.View 
                style={[
                  styles.successContainer,
                  { 
                    opacity: successAnim,
                    transform: [{ scale: successAnim }]
                  }
                ]}
              >
                <View style={styles.successIconContainer}>
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    style={styles.successIconGradient}
                  >
                    <MaterialIcons name="check-circle" size={80} color="#fff" />
                  </LinearGradient>
                </View>
                <Text style={styles.successText}>QR Code Detected!</Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {scanned ? (
            <TouchableOpacity 
              style={styles.rescanButton} 
              onPress={handleRescan}
            >
              <LinearGradient
                colors={['#9B5DE5', '#7C3AED']}
                style={styles.rescanGradient}
              >
                <MaterialIcons name="refresh" size={24} color="#fff" />
                <Text style={styles.rescanText}>Scan Another</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.instructionsContainer}>
              <View style={styles.instructionItem}>
                <View style={styles.instructionIcon}>
                  <MaterialIcons name="straighten" size={20} color="#9B5DE5" />
                </View>
                <Text style={styles.instructionText}>Hold Steady</Text>
              </View>
              
              <View style={styles.instructionDivider} />
              
              <View style={styles.instructionItem}>
                <View style={styles.instructionIcon}>
                  <MaterialIcons name="wb-sunny" size={20} color="#F59E0B" />
                </View>
                <Text style={styles.instructionText}>Good Lighting</Text>
              </View>
              
              <View style={styles.instructionDivider} />
              
              <View style={styles.instructionItem}>
                <View style={styles.instructionIcon}>
                  <MaterialIcons name="center-focus-strong" size={20} color="#10B981" />
                </View>
                <Text style={styles.instructionText}>Center Code</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  
  // Top Section
  topSection: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 10,
  },
  flashButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontWeight: '500',
  },

  // Scan Frame
  scanFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  scannerContainer: {
    width: width * 0.7,
    height: width * 0.7,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: '#9B5DE5',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
  },
  scanLineGradient: {
    flex: 1,
    shadowColor: '#9B5DE5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconContainer: {
    marginBottom: 16,
    borderRadius: 50,
    overflow: 'hidden',
  },
  successIconGradient: {
    padding: 20,
    borderRadius: 50,
  },
  successText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Bottom Section
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  instructionItem: {
    alignItems: 'center',
    flex: 1,
  },
  instructionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  instructionDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 8,
  },
  rescanButton: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#9B5DE5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  rescanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  rescanText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Permission States
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  permissionButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 6,
    shadowColor: '#9B5DE5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  permissionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  permissionButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});