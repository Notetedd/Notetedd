import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

/**
 * TeddSpeechService - Handles text-to-speech for Tedd
 * Uses expo-speech on mobile and Web Speech API on web
 */
class TeddSpeechService {
  constructor(config = {}) {
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.queue = [];
    this.isProcessingQueue = false;
    
    // Configuration
    this.voice = config.voice || null;
    this.rate = config.rate || 1.0; // 0.5 to 2.0
    this.pitch = config.pitch || 1.0; // 0.5 to 2.0
    this.volume = config.volume || 1.0; // 0.0 to 1.0
    this.language = config.language || 'en-US';
    
    // Callbacks
    this.onStart = config.onStart || (() => {});
    this.onDone = config.onDone || (() => {});
    this.onError = config.onError || (() => {});
    this.onBoundary = config.onBoundary || (() => {});
    
    // Platform-specific setup
    this.isWeb = Platform.OS === 'web';
    this.speechSynthesis = this.isWeb ? window.speechSynthesis : null;
    this.availableVoices = [];
    
    if (this.isWeb) {
      this.initWebVoices();
    }
  }

  // Initialize web voices
  initWebVoices() {
    if (!this.speechSynthesis) return;

    const loadVoices = () => {
      this.availableVoices = this.speechSynthesis.getVoices();
      console.log('[TeddSpeech] Available voices:', this.availableVoices.length);
      
      // Try to find a good English voice
      if (!this.voice && this.availableVoices.length > 0) {
        // Prefer Google or Microsoft voices
        const preferredVoice = this.availableVoices.find(v => 
          v.lang.startsWith('en') && 
          (v.name.includes('Google') || v.name.includes('Microsoft'))
        ) || this.availableVoices.find(v => v.lang.startsWith('en'));
        
        if (preferredVoice) {
          this.voice = preferredVoice;
          console.log('[TeddSpeech] Selected voice:', preferredVoice.name);
        }
      }
    };

    // Load voices
    loadVoices();
    
    // Some browsers need this event
    if (this.speechSynthesis.onvoiceschanged !== undefined) {
      this.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Check if speech is available
  isAvailable() {
    if (this.isWeb) {
      return 'speechSynthesis' in window;
    }
    return true; // expo-speech is always available on mobile
  }

  // Get available voices
  async getVoices() {
    if (this.isWeb) {
      return this.availableVoices;
    } else {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        return voices;
      } catch (error) {
        console.error('[TeddSpeech] Error getting voices:', error);
        return [];
      }
    }
  }

  // Set voice by name or identifier
  setVoice(voiceIdentifier) {
    if (this.isWeb) {
      const voice = this.availableVoices.find(v => 
        v.name === voiceIdentifier || v.voiceURI === voiceIdentifier
      );
      if (voice) {
        this.voice = voice;
        console.log('[TeddSpeech] Voice set to:', voice.name);
      }
    } else {
      this.voice = voiceIdentifier;
    }
  }

  // Speak text
  async speak(text, options = {}) {
    if (!this.isAvailable()) {
      console.warn('[TeddSpeech] Speech not available');
      this.onError(new Error('Speech not available'));
      return;
    }

    // Clean up text for speech
    const cleanText = this.cleanTextForSpeech(text);
    
    if (!cleanText.trim()) {
      console.warn('[TeddSpeech] No text to speak');
      return;
    }

    // If currently speaking and not queuing, stop current speech
    if (this.isSpeaking && !options.queue) {
      await this.stop();
    }

    // Add to queue if requested
    if (options.queue && this.isSpeaking) {
      this.queue.push({ text: cleanText, options });
      return;
    }

    // Speak immediately
    return this._speakNow(cleanText, options);
  }

  // Internal speak method
  async _speakNow(text, options = {}) {
    this.isSpeaking = true;
    this.onStart();

    if (this.isWeb) {
      return this._speakWeb(text, options);
    } else {
      return this._speakMobile(text, options);
    }
  }

  // Web speech synthesis
  _speakWeb(text, options) {
    return new Promise((resolve, reject) => {
      if (!this.speechSynthesis) {
        reject(new Error('Speech synthesis not available'));
        return;
      }

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // Set parameters
      utterance.voice = this.voice;
      utterance.rate = options.rate || this.rate;
      utterance.pitch = options.pitch || this.pitch;
      utterance.volume = options.volume || this.volume;
      utterance.lang = options.language || this.language;

      // Event handlers
      utterance.onstart = () => {
        console.log('[TeddSpeech] Started speaking (web)');
      };

      utterance.onend = () => {
        console.log('[TeddSpeech] Finished speaking (web)');
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.onDone();
        this.processQueue();
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('[TeddSpeech] Speech error (web):', event.error);
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.onError(new Error(event.error));
        reject(event.error);
      };

      utterance.onboundary = (event) => {
        this.onBoundary(event);
      };

      // Speak
      this.speechSynthesis.speak(utterance);
    });
  }

  // Mobile speech (expo-speech)
  async _speakMobile(text, options) {
    try {
      console.log('[TeddSpeech] Starting to speak (mobile):', text.substring(0, 50));
      
      await Speech.speak(text, {
        voice: options.voice || this.voice,
        rate: options.rate || this.rate,
        pitch: options.pitch || this.pitch,
        volume: options.volume || this.volume,
        language: options.language || this.language,
        onStart: () => {
          console.log('[TeddSpeech] Started speaking (mobile)');
        },
        onDone: () => {
          console.log('[TeddSpeech] Finished speaking (mobile)');
          this.isSpeaking = false;
          this.onDone();
          this.processQueue();
        },
        onStopped: () => {
          console.log('[TeddSpeech] Speech stopped (mobile)');
          this.isSpeaking = false;
          this.onDone();
        },
        onError: (error) => {
          console.error('[TeddSpeech] Speech error (mobile):', error);
          this.isSpeaking = false;
          this.onError(error);
        },
      });
    } catch (error) {
      console.error('[TeddSpeech] Error speaking (mobile):', error);
      this.isSpeaking = false;
      this.onError(error);
      throw error;
    }
  }

  // Process queued speech
  async processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.queue.length > 0) {
      const { text, options } = this.queue.shift();
      await this._speakNow(text, options);
      
      // Small delay between queued items
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    this.isProcessingQueue = false;
  }

  // Stop speaking
  async stop() {
    console.log('[TeddSpeech] Stopping speech');
    
    if (this.isWeb) {
      if (this.speechSynthesis) {
        this.speechSynthesis.cancel();
      }
      this.currentUtterance = null;
    } else {
      await Speech.stop();
    }
    
    this.isSpeaking = false;
    this.queue = [];
    this.isProcessingQueue = false;
  }

  // Pause speaking (web only)
  pause() {
    if (this.isWeb && this.speechSynthesis) {
      this.speechSynthesis.pause();
    }
  }

  // Resume speaking (web only)
  resume() {
    if (this.isWeb && this.speechSynthesis) {
      this.speechSynthesis.resume();
    }
  }

  // Check if currently speaking
  getIsSpeaking() {
    return this.isSpeaking;
  }

  // Clean text for speech (remove markdown, emojis, etc.)
  cleanTextForSpeech(text) {
    let cleaned = text;
    
    // Remove markdown formatting
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // Bold
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1'); // Italic
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1'); // Inline code
    cleaned = cleaned.replace(/#{1,6}\s/g, ''); // Headers
    cleaned = cleaned.replace(/^\s*[-*+]\s/gm, ''); // List items
    cleaned = cleaned.replace(/^\s*\d+\.\s/gm, ''); // Numbered lists
    
    // Remove emojis (optional - some TTS engines handle them)
    // cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  // Update settings
  updateSettings(settings) {
    if (settings.rate !== undefined) this.rate = settings.rate;
    if (settings.pitch !== undefined) this.pitch = settings.pitch;
    if (settings.volume !== undefined) this.volume = settings.volume;
    if (settings.language !== undefined) this.language = settings.language;
    if (settings.voice !== undefined) this.setVoice(settings.voice);
  }

  // Get current settings
  getSettings() {
    return {
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      language: this.language,
      voice: this.voice,
      isSpeaking: this.isSpeaking,
    };
  }
}

export default TeddSpeechService;