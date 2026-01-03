import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VoiceService from '../../app/services/Tedd/VoiceService';

const TeddPermissionPrompt = ({ 
  visible, 
  onClose, 
  onPermissionGranted,
  onPermissionDenied,
  platform = Platform.OS,
}) => {
  const [permissionStatus, setPermissionStatus] = useState('undetermined');
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (visible) {
      checkPermissionStatus();
    }
  }, [visible]);

  const checkPermissionStatus = async () => {
    try {
      const status = await VoiceService.checkPermissions();
      setPermissionStatus(status);
      console.log('[TeddPermissionPrompt] Permission status:', status);
    } catch (error) {
      console.error('[TeddPermissionPrompt] Error checking permissions:', error);
      setPermissionStatus('undetermined');
    }
  };

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    
    try {
      console.log('[TeddPermissionPrompt] Requesting permission...');
      const result = await VoiceService.requestPermissions();
      
      console.log('[TeddPermissionPrompt] Permission result:', result);
      
      if (result.granted) {
        setPermissionStatus('granted');
        if (onPermissionGranted) {
          onPermissionGranted();
        }
        // Auto close after success with delay for user to see success message
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setPermissionStatus('denied');
        if (onPermissionDenied) {
          onPermissionDenied(result.message);
        }
      }
    } catch (error) {
      console.error('[TeddPermissionPrompt] Error requesting permission:', error);
      setPermissionStatus('error');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else if (Platform.OS === 'android') {
      Linking.openSettings();
    } else {
      // For web, show instructions
      alert(
        'Please enable microphone access in your browser settings:\n\n' +
        '1. Click the lock/info icon in the address bar\n' +
        '2. Find "Microphone" settings\n' +
        '3. Set to "Allow"\n' +
        '4. Refresh the page'
      );
    }
  };

  const getPlatformInstructions = () => {
    switch (platform) {
      case 'web':
        return 'Your browser will ask for microphone access. Click "Allow" to enable voice features.';
      case 'ios':
        return 'Tedd needs microphone access to listen to your voice commands. You can change this later in Settings.';
      case 'android':
        return 'Tedd needs microphone access to listen to your voice commands. You can change this later in Settings.';
      default:
        return 'Tedd needs microphone access to enable voice features.';
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'web':
        return 'globe-outline';
      case 'ios':
        return 'logo-apple';
      case 'android':
        return 'logo-android';
      default:
        return 'phone-portrait-outline';
    }
  };

  const renderContent = () => {
    if (permissionStatus === 'granted') {
      return (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
          </View>
          <Text style={styles.title}>Microphone Enabled!</Text>
          <Text style={styles.description}>
            You can now use voice commands with Tedd.
          </Text>
          <Text style={styles.successNote}>
            Say "Hey Tedd" to start a conversation!
          </Text>
        </>
      );
    }

    if (permissionStatus === 'denied') {
      return (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="warning" size={64} color="#FF9800" />
          </View>
          <Text style={styles.title}>Permission Denied</Text>
          <Text style={styles.description}>
            To use voice commands, please enable microphone access in your{' '}
            {platform === 'web' ? 'browser' : 'device'} settings.
          </Text>
          
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleOpenSettings}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>

          <Text style={styles.alternativeText}>
            💬 You can still use Tedd with text input!
          </Text>
        </>
      );
    }

    if (permissionStatus === 'unavailable') {
      return (
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="information-circle" size={64} color="#2196F3" />
          </View>
          <Text style={styles.title}>Voice Not Available</Text>
          <Text style={styles.description}>
            {platform === 'web'
              ? 'Voice features require Chrome or Edge browser.'
              : 'Voice features are not available on this device.'}
          </Text>
          <Text style={styles.alternativeText}>
            💬 You can use Tedd with text input instead!
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Continue with Text</Text>
          </TouchableOpacity>
        </>
      );
    }

    // Default: undetermined or asking
    return (
      <>
        <View style={styles.iconContainer}>
          <Ionicons name="mic" size={64} color="#6200EE" />
        </View>
        <Text style={styles.title}>Enable Voice Commands</Text>
        <Text style={styles.description}>
          {getPlatformInstructions()}
        </Text>
        
        <View style={styles.featuresList}>
          <View style={styles.featureItem}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#6200EE" />
            <Text style={styles.featureText}>Talk to Tedd naturally</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={20} color="#6200EE" />
            <Text style={styles.featureText}>Use wake words like "Hey Tedd"</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="navigate" size={20} color="#6200EE" />
            <Text style={styles.featureText}>Navigate the app by voice</Text>
          </View>
        </View>

        {/* Platform indicator */}
        <View style={styles.platformIndicator}>
          <Ionicons name={getPlatformIcon()} size={16} color="#999" />
          <Text style={styles.platformText}>
            {platform === 'web' ? 'Web Browser' : platform === 'ios' ? 'iOS' : 'Android'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isRequesting && styles.buttonDisabled]}
          onPress={handleRequestPermission}
          disabled={isRequesting}
        >
          <Ionicons name="mic" size={20} color="#fff" />
          <Text style={styles.buttonText}>
            {isRequesting ? 'Requesting...' : 'Enable Microphone'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={onClose}
        >
          <Text style={styles.skipButtonText}>Use Text Mode Instead</Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          🔒 Your voice is processed securely and never stored without your permission.
        </Text>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>

          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 1,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  featuresList: {
    width: '100%',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingLeft: 8,
  },
  featureText: {
    fontSize: 15,
    color: '#333',
    marginLeft: 12,
  },
  platformIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  platformText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 6,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#6200EE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  settingsButton: {
    backgroundColor: '#FF9800',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  alternativeText: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  successNote: {
    fontSize: 15,
    color: '#4CAF50',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default TeddPermissionPrompt;