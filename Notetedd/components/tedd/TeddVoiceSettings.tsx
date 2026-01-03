import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import VoiceService from '../../app/services/Tedd/VoiceService';
import TeddFirebaseService, { UserVoicePreferences } from '../../app/services/Tedd/TeddFirebaseService';
import * as Speech from 'expo-speech';

interface TeddVoiceSettingsProps {
  userId: string;
  onSave?: (preferences: UserVoicePreferences) => void;
}

const TeddVoiceSettings: React.FC<TeddVoiceSettingsProps> = ({
  userId,
  onSave,
}) => {
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>();
  const [speechRate, setSpeechRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [language, setLanguage] = useState('en-US');
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [optInRecording, setOptInRecording] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load available voices
      const availableVoices = await VoiceService.getAvailableVoices();
      setVoices(availableVoices);

      // Load user preferences
      const preferences = await TeddFirebaseService.getVoicePreferences(userId);
      
      if (preferences) {
        setSelectedVoice(preferences.selectedVoice);
        setSpeechRate(preferences.speechRate);
        setPitch(preferences.pitch);
        setLanguage(preferences.language);
        setWakeWordEnabled(preferences.wakeWordEnabled);
        setOptInRecording(preferences.optInRecording);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      const preferences: UserVoicePreferences = {
        userId,
        selectedVoice,
        speechRate,
        pitch,
        language,
        wakeWordEnabled,
        optInRecording,
      };

      await TeddFirebaseService.saveVoicePreferences(preferences);
      
      // Update voice service
      VoiceService.updateSettings({
        voice: selectedVoice,
        rate: speechRate,
        pitch,
        language,
      });

      if (onSave) {
        onSave(preferences);
      }

      Alert.alert('Success', 'Voice preferences saved!', [{ text: 'OK' }]);
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences', [{ text: 'OK' }]);
    }
  };

  const handleTestVoice = async () => {
    try {
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
      console.error('Error testing voice:', error);
    }
  };

  const handleOptInRecordingToggle = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Voice Recording Opt-In',
        'By opting in, your voice recordings will be used to improve Tedd\'s speech recognition. Your recordings are encrypted and stored securely.',
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading voice settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice Selection</Text>
        <Text style={styles.sectionDescription}>
          Choose Tedd's voice
        </Text>

        {voices.map((voice) => (
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
        ))}

        <TouchableOpacity style={styles.testButton} onPress={handleTestVoice}>
          <Ionicons name="volume-high" size={20} color="#fff" />
          <Text style={styles.testButtonText}>Test Voice</Text>
        </TouchableOpacity>
      </View>

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wake Word Detection</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable "Hey Tedd"</Text>
            <Text style={styles.settingDescription}>
              Allow Tedd to respond to wake words
            </Text>
          </View>
          <Switch
            value={wakeWordEnabled}
            onValueChange={setWakeWordEnabled}
            trackColor={{ false: '#ccc', true: '#B794F6' }}
            thumbColor={wakeWordEnabled ? '#6200EE' : '#f4f3f4'}
          />
        </View>
      </View>

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

        <Text style={styles.privacyNote}>
          <Ionicons name="shield-checkmark" size={16} color="#666" />
          {' '}Your voice recordings are encrypted and stored securely. You can 
          opt out at any time, and all your recordings will be deleted.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSavePreferences}
      >
        <Text style={styles.saveButtonText}>Save Preferences</Text>
      </TouchableOpacity>

      <View style={styles.wakeWordsSection}>
        <Text style={styles.wakeWordsTitle}>Wake Words</Text>
        <Text style={styles.wakeWordsDescription}>
          Tedd responds to the following wake words:
        </Text>
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
  privacyNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#6200EE',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  wakeWordsSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 24,
  },
  wakeWordsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  wakeWordsDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  wakeWordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wakeWordBadge: {
    backgroundColor: '#F3EFFD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#6200EE',
  },
  wakeWordText: {
    color: '#6200EE',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default TeddVoiceSettings;