import * as Speech from 'expo-speech';
import { 
  usePermissions, 
  requestPermissionsAsync,
  getPermissionsAsync 
} from 'expo-audio';

class VoiceService {
  constructor() {
    this.isListening = false;
    this.isSpeaking = false;
    this.recognitionInstance = null;
    this.currentUtterance = '';
    this.permissionGranted = false;
    this.permissionAsked = false;
    this.continuousListening = false; // Track if we should auto-restart
    
    // Voice settings with defaults
    this.settings = {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.0,
      voice: undefined,
    };
  }

  // Check if permissions are granted
  async checkPermissions() {
    try {
      const { status } = await getPermissionsAsync();
      this.permissionGranted = status === 'granted';
      return status;
    } catch (error) {
      console.error('Error checking permissions:', error);
      return 'undetermined';
    }
  }

  // Request microphone permissions (gracefully)
  async requestPermissions() {
    try {
      // First check if already granted
      const currentStatus = await this.checkPermissions();
      
      if (currentStatus === 'granted') {
        this.permissionGranted = true;
        return { granted: true, status: 'granted' };
      }

      // If already denied permanently, return without asking again
      if (currentStatus === 'denied' && this.permissionAsked) {
        return { 
          granted: false, 
          status: 'denied',
          message: 'Microphone permission was denied. Please enable it in your device settings.'
        };
      }

      // Request permission
      this.permissionAsked = true;
      const { status, canAskAgain } = await requestPermissionsAsync();
      
      this.permissionGranted = status === 'granted';

      if (status === 'granted') {
        return { granted: true, status: 'granted' };
      }

      if (status === 'denied' && !canAskAgain) {
        return { 
          granted: false, 
          status: 'denied',
          message: 'Microphone permission denied. Please enable it in Settings > Notetedd > Microphone'
        };
      }

      return { 
        granted: false, 
        status,
        message: 'Microphone permission is required to use voice commands.'
      };
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return { 
        granted: false, 
        status: 'error',
        message: 'Failed to request microphone permission. Please try again.'
      };
    }
  }

  // Initialize audio (with graceful permission handling)
  async initializeAudio() {
    try {
      // Check current permission status
      const status = await this.checkPermissions();
      
      if (status === 'granted') {
        this.permissionGranted = true;
        console.log('[VoiceService] Microphone permission already granted');
        return { success: true, granted: true };
      }

      // Don't throw error, just log and return status
      console.log('[VoiceService] Microphone permission not yet granted, status:', status);
      
      return { 
        success: false, 
        granted: false,
        needsRequest: true,
        message: 'Microphone permission needed for voice features'
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

      await Speech.speak(text, {
        language: this.settings.language,
        pitch: this.settings.pitch,
        rate: this.settings.rate,
        voice: this.settings.voice,
        onStart: () => {
          this.isSpeaking = true;
        },
        onDone: () => {
          this.isSpeaking = false;
          this.currentUtterance = '';
          if (onDone) onDone();
        },
        onStopped: () => {
          this.isSpeaking = false;
          this.currentUtterance = '';
        },
        onError: (error) => {
          this.isSpeaking = false;
          this.currentUtterance = '';
          console.error('[VoiceService] Speech error:', error);
          if (onError) onError(new Error(error));
        },
      });
    } catch (error) {
      this.isSpeaking = false;
      console.error('[VoiceService] Speak error:', error);
      if (onError) onError(error);
      // Don't throw, just log and callback
    }
  }

  // Stop Tedd from speaking (for interruptions)
  async stopSpeaking() {
    try {
      if (this.isSpeaking) {
        await Speech.stop();
        this.isSpeaking = false;
        this.currentUtterance = '';
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
      // Check if permission is granted
      if (!this.permissionGranted) {
        const permResult = await this.requestPermissions();
        
        if (!permResult.granted) {
          const error = new Error(permResult.message || 'Microphone permission denied');
          error.permissionDenied = true;
          if (onError) onError(error);
          return;
        }
      }

      // Store continuous listening flag
      this.continuousListening = continuous;

      // Stop speaking if Tedd is talking (allow interruption)
      if (this.isSpeaking) {
        await this.stopSpeaking();
      }

      // Web Speech API (for Expo Web and supported browsers)
      if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition;
        this.recognitionInstance = new SpeechRecognition();
        
        this.recognitionInstance.continuous = true;
        this.recognitionInstance.interimResults = true;
        this.recognitionInstance.lang = this.settings.language;

        this.recognitionInstance.onresult = (event) => {
          const results = event.results;
          const lastResult = results[results.length - 1];
          const transcript = lastResult[0].transcript;
          const confidence = lastResult[0].confidence;
          const isFinal = lastResult.isFinal;

          onResult({
            transcript,
            confidence,
            isFinal,
          });
        };

        this.recognitionInstance.onerror = (event) => {
          console.log('[VoiceService] Speech recognition event:', event.error);
          this.isListening = false;
          
          // Handle specific errors gracefully
          let shouldNotifyUser = true;
          let errorMessage = 'Speech recognition error';
          
          if (event.error === 'not-allowed') {
            errorMessage = 'Microphone access was denied. Please enable it in your browser settings.';
          } else if (event.error === 'no-speech') {
            // No speech detected - this is common, just log it and retry
            console.log('[VoiceService] No speech detected - this is normal');
            shouldNotifyUser = false; // Don't show error to user
            // Optionally auto-restart listening
            setTimeout(() => {
              if (this.continuousListening && !this.isListening) {
                console.log('[VoiceService] Auto-restarting speech recognition...');
                this.startListening(onResult, onError).catch(console.error);
              }
            }, 500);
          } else if (event.error === 'audio-capture') {
            errorMessage = 'Microphone not detected. Please check your microphone connection.';
          } else if (event.error === 'network') {
            errorMessage = 'Network error. Please check your connection.';
          } else if (event.error === 'aborted') {
            // User manually stopped - don't show error
            console.log('[VoiceService] Speech recognition aborted by user');
            shouldNotifyUser = false;
          }
          
          // Only call error callback for important errors
          if (shouldNotifyUser && onError) {
            onError(new Error(errorMessage));
          }
        };

        this.recognitionInstance.onend = () => {
          this.isListening = false;
          console.log('[VoiceService] Speech recognition ended');
        };

        this.recognitionInstance.start();
        this.isListening = true;
        console.log('[VoiceService] Speech recognition started');
      } else {
        // For native (iOS/Android), Web Speech API not available
        throw new Error('Speech recognition not available on this platform. Please use text input instead.');
      }
    } catch (error) {
      this.isListening = false;
      console.error('[VoiceService] Error starting listening:', error);
      if (onError) onError(error);
      // Don't throw, just callback with error
    }
  }

  // Stop listening
  async stopListening() {
    try {
      this.continuousListening = false; // Stop auto-restart
      
      if (this.recognitionInstance) {
        this.recognitionInstance.stop();
        this.recognitionInstance = null;
      }
      this.isListening = false;
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

  // Detect wake word in transcript
  detectWakeWord(transcript) {
    const lowerTranscript = transcript.toLowerCase().trim();
    const wakeWords = ['hey tedd', 'hi tedd', 'tedd'];
    
    return wakeWords.some(word => 
      lowerTranscript.includes(word) || 
      lowerTranscript.startsWith(word)
    );
  }

  // Extract command after wake word
  extractCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase().trim();
    const wakeWords = ['hey tedd', 'hi tedd', 'tedd'];
    
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
    console.log('[VoiceService] Cleaned up');
  }
}

// Export singleton instance
export default new VoiceService();