import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { Audio } from 'expo-audio';

class VoiceService {
  constructor() {
    this.isListening = false;
    this.isSpeaking = false;
    this.recognitionInstance = null;
    this.currentUtterance = '';
    this.permissionGranted = false;
    this.permissionAsked = false;
    this.continuousListening = false;
    this.audioRecording = null;
    this.isRecordingForSTT = false;
    this.onSpeechDoneCallback = null; // For continuous conversation
    
    // Voice settings with defaults
    this.settings = {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.0,
      voice: undefined,
    };
  }

  // Check if permissions are granted (platform-specific)
  async checkPermissions() {
    try {
      // For web, permissions are handled by browser
      if (Platform.OS === 'web') {
        // Check if Web Speech API is available
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
          return 'granted'; // Browser will prompt when needed
        }
        return 'unavailable';
      }
      
      // For native (iOS/Android), check expo-audio permissions
      try {
        const { status } = await Audio.getPermissionsAsync();
        return status;
      } catch (error) {
        console.warn('[VoiceService] Audio.getPermissionsAsync not available:', error.message);
        // Fallback - assume undetermined if method doesn't exist
        return 'undetermined';
      }
    } catch (error) {
      console.error('[VoiceService] Error checking permissions:', error);
      return 'undetermined';
    }
  }

  // Request microphone permissions (gracefully)
  async requestPermissions() {
    try {
      // For web, browser handles permissions
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
          this.permissionGranted = true;
          return { 
            granted: true, 
            status: 'granted',
            message: 'Browser will handle microphone permissions'
          };
        }
        
        return { 
          granted: false, 
          status: 'unavailable',
          message: 'Speech recognition not available in this browser. Try Chrome or Edge.'
        };
      }
      
      // For native platforms (iOS/Android), request permissions
      try {
        const { status } = await Audio.requestPermissionsAsync();
        
        this.permissionGranted = status === 'granted';
        this.permissionAsked = true;
        
        return { 
          granted: status === 'granted', 
          status: status,
          message: status === 'granted' 
            ? 'Microphone access granted'
            : 'Microphone access denied. Please enable it in your device settings.'
        };
      } catch (error) {
        console.warn('[VoiceService] Audio.requestPermissionsAsync not available:', error.message);
        // If method doesn't exist, assume granted (some versions don't need it)
        this.permissionGranted = true;
        return {
          granted: true,
          status: 'granted',
          message: 'Microphone permissions assumed granted'
        };
      }
    } catch (error) {
      console.error('[VoiceService] Error requesting permissions:', error);
      return { 
        granted: false, 
        status: 'error',
        message: 'Failed to request microphone permission. Please enable it in your device settings.'
      };
    }
  }

  // Initialize audio (with graceful permission handling)
  async initializeAudio() {
    try {
      console.log('[VoiceService] Initializing audio...');
      
      // Check platform and capabilities
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
          this.permissionGranted = true;
          console.log('[VoiceService] Web Speech API available');
          return { success: true, granted: true };
        }
        
        console.log('[VoiceService] Web Speech API not available');
        return { 
          success: false, 
          granted: false,
          needsRequest: false,
          message: 'Speech recognition not supported in this browser'
        };
      }
      
      // For native, try to set audio mode for recording (optional in expo-audio)
      try {
        if (Audio.setAudioModeAsync) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
          console.log('[VoiceService] Audio mode configured for native');
        } else {
          console.log('[VoiceService] Audio.setAudioModeAsync not available, skipping');
        }
      } catch (error) {
        console.warn('[VoiceService] Could not set audio mode (non-critical):', error.message);
        // Non-critical - continue anyway
      }
      
      // Check permissions
      const permissionStatus = await this.checkPermissions();
      
      if (permissionStatus === 'granted') {
        this.permissionGranted = true;
        console.log('[VoiceService] Permissions already granted');
        return { success: true, granted: true };
      }
      
      if (permissionStatus === 'undetermined') {
        console.log('[VoiceService] Permissions need to be requested');
        return { 
          success: true, 
          granted: false,
          needsRequest: true,
          message: 'Microphone permission needed for voice features'
        };
      }
      
      // Permissions denied
      console.log('[VoiceService] Permissions denied');
      return { 
        success: true, 
        granted: false,
        needsRequest: false,
        message: 'Microphone access denied. You can still use text chat!'
      };
    } catch (error) {
      console.error('[VoiceService] Error initializing audio:', error);
      return { 
        success: false, 
        granted: false,
        error: error.message 
      };
    }
  }

  // Text-to-Speech: Make Tedd speak (doesn't need microphone permission)
  async speak(text, onStart, onDone, onError) {
    try {
      // Stop any current speech
      await this.stopSpeaking();
      
      this.isSpeaking = true;
      this.currentUtterance = text;

      if (onStart) onStart();

      console.log('[VoiceService] Starting to speak:', text.substring(0, 50));

      // Use expo-speech for both web and native
      await Speech.speak(text, {
        language: this.settings.language,
        pitch: this.settings.pitch,
        rate: this.settings.rate,
        voice: this.settings.voice,
        onStart: () => {
          console.log('[VoiceService] Speech started');
          this.isSpeaking = true;
        },
        onDone: () => {
          console.log('[VoiceService] Speech completed');
          this.isSpeaking = false;
          this.currentUtterance = '';
          
          // Call the done callback
          if (onDone) onDone();
          
          // Call the continuous conversation callback if set
          if (this.onSpeechDoneCallback) {
            const callback = this.onSpeechDoneCallback;
            // Small delay before restarting listening
            setTimeout(() => {
              callback();
            }, 500);
          }
        },
        onStopped: () => {
          console.log('[VoiceService] Speech stopped');
          this.isSpeaking = false;
          this.currentUtterance = '';
        },
        onError: (error) => {
          console.error('[VoiceService] Speech error:', error);
          this.isSpeaking = false;
          this.currentUtterance = '';
          if (onError) onError(new Error(error));
        },
      });
    } catch (error) {
      this.isSpeaking = false;
      console.error('[VoiceService] Speak error:', error);
      if (onError) onError(error);
    }
  }

  // Set callback to be called after speech finishes (for continuous conversation)
  setOnSpeechDoneCallback(callback) {
    this.onSpeechDoneCallback = callback;
  }

  // Clear the speech done callback
  clearOnSpeechDoneCallback() {
    this.onSpeechDoneCallback = null;
  }

  // Stop Tedd from speaking (for interruptions)
  async stopSpeaking() {
    try {
      if (this.isSpeaking) {
        await Speech.stop();
        this.isSpeaking = false;
        this.currentUtterance = '';
        console.log('[VoiceService] Speech stopped');
      }
    } catch (error) {
      console.error('[VoiceService] Error stopping speech:', error);
    }
  }

  // Check if Tedd is currently speaking
  getIsSpeaking() {
    return this.isSpeaking;
  }

  // Speech-to-Text: Listen to user (requires microphone permission)
  async startListening(onResult, onError, continuous = false) {
    try {
      console.log('[VoiceService] Starting to listen... (continuous:', continuous, ')');
      
      // Store continuous listening flag
      this.continuousListening = continuous;

      // Stop speaking if Tedd is talking (allow interruption)
      if (this.isSpeaking) {
        await this.stopSpeaking();
      }

      // Platform-specific implementation
      if (Platform.OS === 'web') {
        await this.startWebSpeechRecognition(onResult, onError, continuous);
      } else {
        await this.startNativeSpeechRecognition(onResult, onError, continuous);
      }
    } catch (error) {
      this.isListening = false;
      console.error('[VoiceService] Error starting listening:', error);
      
      // Create user-friendly error
      const friendlyError = new Error(
        'Could not start voice recognition. Please check your microphone and permissions.'
      );
      
      if (onError) {
        onError(friendlyError);
      }
    }
  }

  // Web Speech Recognition (Chrome/Edge)
  async startWebSpeechRecognition(onResult, onError, continuous) {
    // Check if Web Speech API is available
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window)) {
      const error = new Error(
        'Speech recognition not supported. Please use Chrome or Edge browser.'
      );
      error.unavailable = true;
      if (onError) onError(error);
      return;
    }

    // Create speech recognition instance
    const SpeechRecognition = window.webkitSpeechRecognition;
    this.recognitionInstance = new SpeechRecognition();
    
    this.recognitionInstance.continuous = continuous;
    this.recognitionInstance.interimResults = true;
    this.recognitionInstance.lang = this.settings.language;
    this.recognitionInstance.maxAlternatives = 1;

    // Handle results
    this.recognitionInstance.onresult = (event) => {
      try {
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript;
        const confidence = lastResult[0].confidence || 0.9;
        const isFinal = lastResult.isFinal;

        console.log('[VoiceService] Recognition result:', transcript, '(final:', isFinal, ')');

        onResult({
          transcript,
          confidence,
          isFinal,
        });
      } catch (err) {
        console.error('[VoiceService] Error processing result:', err);
      }
    };

    // Handle errors
    this.recognitionInstance.onerror = (event) => {
      console.log('[VoiceService] Speech recognition error:', event.error);
      this.isListening = false;
      
      let shouldNotifyUser = true;
      let errorMessage = 'Speech recognition error';
      
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        errorMessage = 'Microphone access denied. Please enable it in your browser settings.';
      } else if (event.error === 'no-speech') {
        console.log('[VoiceService] No speech detected - normal behavior');
        shouldNotifyUser = false;
        
        // Restart if continuous listening is enabled
        if (this.continuousListening && !this.isListening) {
          setTimeout(() => {
            if (this.continuousListening) {
              console.log('[VoiceService] Restarting recognition after no-speech');
              this.startWebSpeechRecognition(onResult, onError, continuous).catch(console.error);
            }
          }, 500);
        }
      } else if (event.error === 'audio-capture') {
        errorMessage = 'Microphone not detected. Please check your microphone connection.';
      } else if (event.error === 'network') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (event.error === 'aborted') {
        console.log('[VoiceService] Speech recognition aborted');
        shouldNotifyUser = false;
      }
      
      if (shouldNotifyUser && onError) {
        onError(new Error(errorMessage));
      }
    };

    // Handle end of recognition
    this.recognitionInstance.onend = () => {
      this.isListening = false;
      console.log('[VoiceService] Speech recognition ended');
      
      // Restart if continuous listening is enabled
      if (this.continuousListening) {
        setTimeout(() => {
          if (this.continuousListening && !this.isListening) {
            console.log('[VoiceService] Restarting continuous recognition');
            this.startWebSpeechRecognition(onResult, onError, continuous).catch(console.error);
          }
        }, 500);
      }
    };

    // Start recognition
    this.recognitionInstance.start();
    this.isListening = true;
    console.log('[VoiceService] Web speech recognition started');
  }

  // Native Speech Recognition (iOS/Android) - Fallback message
  async startNativeSpeechRecognition(onResult, onError, continuous) {
    // For native platforms, speech recognition requires additional native modules
    // that aren't available in standard Expo
    
    const error = new Error(
      'Voice input is only available on web (Chrome/Edge). Please use text input on mobile.'
    );
    error.unavailable = true;
    error.platform = 'native';
    
    if (onError) {
      onError(error);
    }
    
    // Note: For production, you would integrate with:
    // - @react-native-voice/voice
    // - or a custom native module
  }

  // Stop listening
  async stopListening() {
    try {
      console.log('[VoiceService] Stopping listening...');
      this.continuousListening = false;
      
      if (this.recognitionInstance) {
        this.recognitionInstance.stop();
        this.recognitionInstance = null;
      }
      
      if (this.audioRecording) {
        await this.audioRecording.stopAndUnloadAsync();
        this.audioRecording = null;
      }
      
      this.isListening = false;
      this.isRecordingForSTT = false;
      console.log('[VoiceService] Stopped listening');
    } catch (error) {
      console.error('[VoiceService] Error stopping listening:', error);
    }
  }

  // Check if currently listening
  getIsListening() {
    return this.isListening;
  }

  // Get available voices
  async getAvailableVoices() {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      return voices || [];
    } catch (error) {
      console.error('[VoiceService] Error getting voices:', error);
      return [];
    }
  }

  // Update voice settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('[VoiceService] Settings updated:', this.settings);
  }

  // Get current settings
  getSettings() {
    return { ...this.settings };
  }

  // Check if permissions are granted
  hasPermission() {
    return this.permissionGranted;
  }

  // Check if platform supports speech recognition
  isSpeechRecognitionAvailable() {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' && 'webkitSpeechRecognition' in window;
    }
    // Native speech recognition requires additional setup
    return false;
  }

  // Detect wake word in transcript
  detectWakeWord(transcript) {
    const lowerTranscript = transcript.toLowerCase().trim();
    const wakeWords = ['hey tedd', 'hi tedd', 'hey ted', 'hi ted', 'tedd', 'ted'];
    
    return wakeWords.some(word => 
      lowerTranscript.includes(word) || 
      lowerTranscript.startsWith(word)
    );
  }

  // Extract command after wake word
  extractCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase().trim();
    const wakeWords = ['hey tedd', 'hi tedd', 'hey ted', 'hi ted', 'tedd', 'ted'];
    
    for (const wakeWord of wakeWords) {
      if (lowerTranscript.startsWith(wakeWord)) {
        return transcript.substring(wakeWord.length).trim();
      }
      
      const wakeWordIndex = lowerTranscript.indexOf(wakeWord);
      if (wakeWordIndex !== -1) {
        return transcript.substring(wakeWordIndex + wakeWord.length).trim();
      }
    }
    
    return transcript;
  }

  // Clean up resources
  async cleanup() {
    await this.stopListening();
    await this.stopSpeaking();
    this.clearOnSpeechDoneCallback();
    console.log('[VoiceService] Cleaned up');
  }
}

// Export singleton instance
export default new VoiceService();