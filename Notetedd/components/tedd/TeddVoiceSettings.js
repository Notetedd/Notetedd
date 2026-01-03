import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import VoiceService from '../../app/services/Tedd/VoiceService';
import TeddFirebaseService from '../../app/services/Tedd/TeddFirebaseService';
import * as Speech from 'expo-speech';

const TeddVoiceSettings = ({ userId, teddManager, onSave }) => {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(undefined);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [language, setLanguage] = useState('en-US');
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [optInRecording, setOptInRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Check if speech is available
      const available = VoiceService.isSpeechRecognitionAvailable();
      setSpeechAvailable(available);
      
      // Check permissions
      const permissionStatus = await VoiceService.checkPermissions();
      setHasPermission(permissionStatus === 'granted');
      
      // Load available voices
      const availableVoices = await VoiceService.getAvailableVoices();
      console.log('[TeddVoiceSettings] Available voices:', availableVoices.length);
      setVoices(availableVoices || []);

      // Load user preferences
      const preferences = await TeddFirebaseService.getVoicePreferences(userId);
      
      if (preferences) {
        setSelectedVoice(preferences.selectedVoice);
        setSpeechRate(preferences.speechRate || 1.0);
        setPitch(preferences.pitch || 1.0);
        setLanguage(preferences.language || 'en-US');
        setWakeWordEnabled(preferences.wakeWordEnabled !== false);
        setOptInRecording(preferences.optInRecording || false);
      }
    } catch (error) {
      console.error('[TeddVoiceSettings] Error loading settings:', error);
      Alert.alert('Error', 'Failed to load voice settings', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      const preferences = {
        userId,
        selectedVoice,
        speechRate,
        pitch,
        language,
        wakeWordEnabled,
        optInRecording,
      };

      // Save to Firebase
      await TeddFirebaseService.saveVoicePreferences(preferences);
      
      // Update voice service settings
      VoiceService.updateSettings({
        voice: selectedVoice,
        rate: speechRate,
        pitch,
        language,
      });

      // Update TeddManager if provided
      if (teddManager) {
        await teddManager.updateVoicePreferences(preferences);
      }

      // Call onSave callback if provided
      if (onSave) {
        onSave(preferences);
      }

      Alert.alert('Success', 'Voice preferences saved!', [{ text: 'OK' }]);
    } catch (error) {
      console.error('[TeddVoiceSettings] Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences', [{ text: 'OK' }]);
    }
  };

  const handleTestVoice = async () => {
    try {
      // Update settings temporarily for test
      VoiceService.updateSettings({
        voice: selectedVoice,
        rate: speechRate,
        pitch,
        language,
      });

      await VoiceService.speak(
        "Hi! I'm Tedd, your AI study assistant. How do I sound?"
      );
    } catch (error) {
      console.error('[TeddVoiceSettings] Error testing voice:', error);
      Alert.alert('Error', 'Failed to test voice', [{ text: 'OK' }]);
    }
  };

  const handleOptInRecordingToggle = (value) => {
    if (value) {
      Alert.alert(
        'Voice Recording Opt-In',
        'By opting in, your voice recordings will be used to improve Tedd\'s speech recognition. Your recordings are encrypted and stored securely.\n\nYou can opt out at any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: () => setOptInRecording(true),
          },
        ]
      );
    } else {
      setOptInRecording(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      const result = await VoiceService.requestPermissions();
      
      if (result.granted) {
        setHasPermission(true);
        setSpeechAvailable(VoiceService.isSpeechRecognitionAvailable());
        Alert.alert('Success', 'Microphone permission granted!', [{ text: 'OK' }]);
      } else {
        Alert.alert(
          'Permission Denied',
          result.message || 'Microphone access was denied.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[TeddVoiceSettings] Error requesting permission:', error);
      Alert.alert('Error', 'Failed to request permission', [{ text: 'OK' }]);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="hourglass" size={48} color="#6200EE" />
        <Text style={styles.loadingText}>Loading voice settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Permission Banner */}
      {!hasPermission && (
        <View style={styles.permissionBanner}>
          <View style={styles.bannerContent}>
            <Ionicons name="mic-off" size={24} color="#FF9800" />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Microphone Access Needed</Text>
              <Text style={styles.bannerDescription}>
                Enable microphone to use voice features
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.bannerButton}
            onPress={handleRequestPermission}
          >
            <Text style={styles.bannerButtonText}>Enable</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Speech Not Available Banner */}
      {!speechAvailable && (
        <View style={[styles.permissionBanner, styles.infoBanner]}>
          <View style={styles.bannerContent}>
            <Ionicons name="information-circle" size={24} color="#2196F3" />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Voice Input Unavailable</Text>
              <Text style={styles.bannerDescription}>
                {Platform.OS === 'web'
                  ? 'Voice input requires Chrome or Edge browser'
                  : 'Voice input is not available on this device'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Voice Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice Selection</Text>
        <Text style={styles.sectionDescription}>
          Choose Tedd's voice
        </Text>

        {voices.length > 0 ? (
          voices.map((voice) => (
            <TouchableOpacity
              key={voice.identifier}
              style={[
                styles.voiceOption,
                selectedVoice === voice.identifier && styles.voiceOptionSelected,
              ]}
              onPress={() => setSelectedVoice(voice.identifier)}
            >
              <View style={styles.voiceInfo}>
                <Text style={styles.voiceName}>{voice.name}</Text>
                <Text style={styles.voiceLanguage}>{voice.language}</Text>
              </View>
              {selectedVoice === voice.identifier && (
                <Ionicons name="checkmark-circle" size={24} color="#6200EE" />
              )}
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.noVoicesContainer}>
            <Ionicons name="volume-mute" size={32} color="#999" />
            <Text style={styles.noVoicesText}>No voices available</Text>
          </View>
        )}

        <TouchableOpacity style={styles.testButton} onPress={handleTestVoice}>
          <Ionicons name="volume-high" size={20} color="#fff" />
          <Text style={styles.testButtonText}>Test Voice</Text>
        </TouchableOpacity>
      </View>

      {/* Speech Rate */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Speech Rate</Text>
        <Text style={styles.sectionDescription}>
          How fast Tedd speaks (Current: {speechRate.toFixed(1)}x)
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0.5}
          maximumValue={2.0}
          step={0.1}
          value={speechRate}
          onValueChange={setSpeechRate}
          minimumTrackTintColor="#6200EE"
          maximumTrackTintColor="#ddd"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Slow (0.5x)</Text>
          <Text style={styles.sliderLabel}>Fast (2.0x)</Text>
        </View>
      </View>

      {/* Pitch */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pitch</Text>
        <Text style={styles.sectionDescription}>
          Voice pitch adjustment (Current: {pitch.toFixed(1)})
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0.5}
          maximumValue={2.0}
          step={0.1}
          value={pitch}
          onValueChange={setPitch}
          minimumTrackTintColor="#6200EE"
          maximumTrackTintColor="#ddd"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Low (0.5)</Text>
          <Text style={styles.sliderLabel}>High (2.0)</Text>
        </View>
      </View>

      {/* Wake Word Detection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wake Word Detection</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable "Hey Tedd"</Text>
            <Text style={styles.settingDescription}>
              {speechAvailable && hasPermission
                ? 'Allow Tedd to respond to wake words'
                : 'Requires microphone access (Web only)'}
            </Text>
          </View>
          <Switch
            value={wakeWordEnabled}
            onValueChange={setWakeWordEnabled}
            trackColor={{ false: '#ccc', true: '#B794F6' }}
            thumbColor={wakeWordEnabled ? '#6200EE' : '#f4f3f4'}
            disabled={!speechAvailable || !hasPermission}
          />
        </View>

        {wakeWordEnabled && speechAvailable && hasPermission && (
          <View style={styles.wakeWordsInfo}>
            <Text style={styles.wakeWordsTitle}>Wake Words:</Text>
            <View style={styles.wakeWordsList}>
              <View style={styles.wakeWordBadge}>
                <Text style={styles.wakeWordText}>Hey Tedd</Text>
              </View>
              <View style={styles.wakeWordBadge}>
                <Text style={styles.wakeWordText}>Hi Tedd</Text>
              </View>
              <View style={styles.wakeWordBadge}>
                <Text style={styles.wakeWordText}>Tedd</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Voice Recording Opt-In</Text>
            <Text style={styles.settingDescription}>
              Help improve Tedd by sharing voice recordings
            </Text>
          </View>
          <Switch
            value={optInRecording}
            onValueChange={handleOptInRecordingToggle}
            trackColor={{ false: '#ccc', true: '#B794F6' }}
            thumbColor={optInRecording ? '#6200EE' : '#f4f3f4'}
          />
        </View>

        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark" size={16} color="#666" />
          <Text style={styles.privacyNoteText}>
            Your voice recordings are encrypted and stored securely. You can 
            opt out at any time, and all your recordings will be deleted.
          </Text>
        </View>
      </View>

      {/* Platform Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Platform Information</Text>
        
        <View style={styles.infoRow}>
          <Ionicons name="phone-portrait" size={20} color="#666" />
          <Text style={styles.infoText}>
            Platform: {Platform.OS === 'web' ? 'Web Browser' : Platform.OS === 'ios' ? 'iOS' : 'Android'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Ionicons 
            name={speechAvailable ? 'checkmark-circle' : 'close-circle'} 
            size={20} 
            color={speechAvailable ? '#4CAF50' : '#FF3B30'} 
          />
          <Text style={styles.infoText}>
            Voice Input: {speechAvailable ? 'Available' : 'Unavailable'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Ionicons 
            name={hasPermission ? 'checkmark-circle' : 'close-circle'} 
            size={20} 
            color={hasPermission ? '#4CAF50' : '#FF9800'} 
          />
          <Text style={styles.infoText}>
            Microphone: {hasPermission ? 'Enabled' : 'Not Enabled'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="volume-high" size={20} color="#4CAF50" />
          <Text style={styles.infoText}>
            Voice Output: Available
          </Text>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSavePreferences}
      >
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>Save Preferences</Text>
      </TouchableOpacity>

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  permissionBanner: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE69C',
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    borderBottomColor: '#BBDEFB',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bannerText: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  bannerDescription: {
    fontSize: 14,
    color: '#666',
  },
  bannerButton: {
    backgroundColor: '#6200EE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  voiceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 8,
  },
  voiceOptionSelected: {
    borderColor: '#6200EE',
    backgroundColor: '#F3EFFD',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  voiceLanguage: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  noVoicesContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noVoicesText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200EE',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  wakeWordsInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F3EFFD',
    borderRadius: 8,
  },
  wakeWordsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6200EE',
    marginBottom: 8,
  },
  wakeWordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wakeWordBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#6200EE',
  },
  wakeWordText: {
    color: '#6200EE',
    fontSize: 13,
    fontWeight: '600',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200EE',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacing: {
    height: 24,
  },
});

export default TeddVoiceSettings;