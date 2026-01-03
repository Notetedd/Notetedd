import VoiceService from './VoiceService';
import GeminiService from './GeminiService';
import TeddFirebaseService from './TeddFirebaseService';

class TeddManager {
  constructor(config) {
    this.userId = config.userId;
    this.onStateChange = config.onStateChange;
    this.onMessage = config.onMessage;
    this.onError = config.onError;
    this.onAction = config.onAction;
    
    this.geminiService = new GeminiService({
      apiKey: config.geminiApiKey,
      model: 'gemini-pro',
      temperature: 0.7,
    });

    this.currentState = 'idle';
    this.currentSessionId = undefined;
    this.currentContext = undefined;
    this.isInitialized = false;
    this.wakeWordEnabled = true;
    this.continuousListening = false;
    this.interimTranscript = '';
  }

  // Initialize Tedd
  async initialize() {
    try {
      // Initialize audio (will check permissions but not crash if denied)
      const audioInit = await VoiceService.initializeAudio();
      
      if (!audioInit.success) {
        console.log('[TeddManager] Audio not initialized:', audioInit.message);
        // Don't throw error, just log - user can still use text input
      }
      
      // Load user preferences
      try {
        const preferences = await TeddFirebaseService.getVoicePreferences(this.userId);
        if (preferences) {
          VoiceService.updateSettings({
            language: preferences.language,
            pitch: preferences.pitch,
            rate: preferences.speechRate,
            voice: preferences.selectedVoice,
          });
          this.wakeWordEnabled = preferences.wakeWordEnabled;
        }
      } catch (error) {
        console.error('[TeddManager] Error loading preferences:', error);
        // Continue initialization even if preferences fail
      }
      
      // Load last conversation
      try {
        const recentConversations = await TeddFirebaseService.getUserConversations(
          this.userId, 
          1
        );
        
        if (recentConversations.length > 0) {
          const lastConversation = recentConversations[0];
          this.currentSessionId = lastConversation.id;
          this.geminiService.loadHistory(lastConversation.messages);
        }
      } catch (error) {
        console.error('[TeddManager] Error loading conversation history:', error);
        // Continue initialization even if history fails
      }
      
      this.isInitialized = true;
      this.setState('idle');
      console.log('[TeddManager] Initialized successfully');
    } catch (error) {
      console.error('[TeddManager] Error initializing Tedd:', error);
      // Set as initialized anyway - text features still work
      this.isInitialized = true;
      this.setState('idle');
      
      // Call error handler but don't throw
      if (this.onError) {
        this.onError(new Error('Tedd initialized with limited features. Voice may not be available.'));
      }
    }
  }

  // Start wake word detection (continuous listening)
  async startWakeWordDetection() {
    if (!this.isInitialized) {
      throw new Error('Tedd not initialized');
    }
    
    this.continuousListening = true;
    this.setState('wake-word-detection');
    await this.startListeningForWakeWord();
  }

  // Stop wake word detection
  async stopWakeWordDetection() {
    this.continuousListening = false;
    await VoiceService.stopListening();
    this.setState('idle');
  }

  // Listen for wake word
  async startListeningForWakeWord() {
    try {
      await VoiceService.startListening(
        this.handleWakeWordResult.bind(this),
        this.handleError.bind(this),
        true // continuous mode - auto-restart on no-speech
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  // Handle wake word detection results
  handleWakeWordResult(result) {
    const { transcript, isFinal } = result;
    
    // Store interim results
    if (!isFinal) {
      this.interimTranscript = transcript;
      return;
    }
    
    // Check for wake word in final transcript
    if (VoiceService.detectWakeWord(transcript)) {
      const command = VoiceService.extractCommand(transcript);
      
      if (command && command.length > 0) {
        // User said wake word + command in one go
        this.handleUserInput(command);
      } else {
        // Just wake word, start listening for command
        this.startActiveListening();
      }
    }
    
    // Reset interim transcript
    this.interimTranscript = '';
  }

  // Start active listening (after wake word or manual activation)
  async startActiveListening() {
    try {
      // Check if we have microphone permission
      if (!VoiceService.hasPermission()) {
        console.log('[TeddManager] Requesting microphone permission...');
        const permResult = await VoiceService.requestPermissions();
        
        if (!permResult.granted) {
          // Permission denied - inform user but don't crash
          this.setState('idle');
          
          if (this.onError) {
            const error = new Error(permResult.message || 'Microphone permission needed for voice commands');
            error.permissionDenied = true;
            this.onError(error);
          }
          
          // Speak the message if TTS is available
          await VoiceService.speak(
            "I need microphone permission to hear you. You can still type your messages!"
          );
          
          return;
        }
      }

      // Stop any ongoing speech
      if (VoiceService.getIsSpeaking()) {
        await VoiceService.stopSpeaking();
      }
      
      this.setState('listening');
      
      // Play acknowledgment sound or say "Yes?"
      await VoiceService.speak('Yes?');
      
      // Start listening for user command
      await VoiceService.startListening(
        this.handleListeningResult.bind(this),
        (error) => {
          console.error('[TeddManager] Listening error:', error);
          
          // Handle permission-specific errors
          if (error.permissionDenied || error.message?.includes('denied') || error.message?.includes('not-allowed')) {
            this.setState('idle');
            if (this.onError) {
              this.onError(new Error('Microphone access denied. Please enable it in your settings or use text input.'));
            }
            VoiceService.speak("No worries! You can type your messages to me instead.");
          } else {
            this.handleError(error);
          }
        },
        false // not continuous - one-time listening
      );
    } catch (error) {
      console.error('[TeddManager] Error starting active listening:', error);
      this.handleError(error);
    }
  }

  // Handle listening results during active listening
  handleListeningResult(result) {
    const { transcript, isFinal } = result;
    
    if (!isFinal) {
      this.interimTranscript = transcript;
      return;
    }
    
    // Final transcript received
    if (transcript.trim().length > 0) {
      this.handleUserInput(transcript);
    }
    
    this.interimTranscript = '';
  }

  // Handle user input (text or voice)
  async handleUserInput(input) {
    try {
      await VoiceService.stopListening();
      this.setState('processing');
      
      // Create user message
      const userMessage = {
        id: this.generateId(),
        role: 'user',
        content: input,
        timestamp: new Date(),
      };
      
      if (this.onMessage) {
        this.onMessage(userMessage);
      }
      
      // Check for actions
      const actionDetection = this.geminiService.detectAction(input);
      
      if (actionDetection.hasAction && this.onAction) {
        this.onAction(actionDetection.actionType, actionDetection.parameters);
      }
      
      // Get AI response
      let fullResponse = '';
      const response = await this.geminiService.sendMessage(
        input,
        this.currentContext,
        (chunk) => {
          fullResponse += chunk;
        }
      );
      
      // Create assistant message
      const assistantMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      
      if (this.onMessage) {
        this.onMessage(assistantMessage);
      }
      
      // Save conversation
      await this.saveCurrentConversation();
      
      // Speak response
      await this.speak(response);
      
      // Return to appropriate state
      if (this.continuousListening && this.wakeWordEnabled) {
        await this.startWakeWordDetection();
      } else {
        this.setState('idle');
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  // Speak a message
  async speak(text) {
    try {
      this.setState('speaking');
      
      await VoiceService.speak(
        text,
        () => {
          this.setState('speaking');
        },
        () => {
          if (this.continuousListening && this.wakeWordEnabled) {
            this.startWakeWordDetection();
          } else {
            this.setState('idle');
          }
        },
        this.handleError.bind(this)
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  // Stop Tedd from speaking (interruption)
  async stopSpeaking() {
    await VoiceService.stopSpeaking();
  }

  // Send text message (without voice)
  async sendTextMessage(text) {
    await this.handleUserInput(text);
  }

  // Update context (current screen, notes, etc.)
  updateContext(context) {
    this.currentContext = {
      ...this.currentContext,
      ...context,
    };
  }

  // Save current conversation to Firebase
  async saveCurrentConversation() {
    try {
      const history = this.geminiService.getConversationHistory();
      
      this.currentSessionId = await TeddFirebaseService.saveConversation(
        this.userId,
        history,
        this.currentSessionId
      );
      
      // Summarize if history gets too long
      await this.geminiService.summarizeHistory();
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  // Get conversation history
  getConversationHistory() {
    return this.geminiService.getConversationHistory();
  }

  // Clear conversation history
  async clearConversation() {
    this.geminiService.clearHistory();
    this.currentSessionId = undefined;
    await TeddFirebaseService.clearUserConversations(this.userId);
  }

  // Update voice preferences
  async updateVoicePreferences(preferences) {
    try {
      const currentPrefs = await TeddFirebaseService.getVoicePreferences(this.userId);
      
      const newPrefs = {
        userId: this.userId,
        language: preferences.language || currentPrefs?.language || 'en-US',
        pitch: preferences.pitch ?? currentPrefs?.pitch ?? 1.0,
        speechRate: preferences.speechRate ?? currentPrefs?.speechRate ?? 1.0,
        selectedVoice: preferences.selectedVoice || currentPrefs?.selectedVoice,
        optInRecording: preferences.optInRecording ?? currentPrefs?.optInRecording ?? false,
        wakeWordEnabled: preferences.wakeWordEnabled ?? currentPrefs?.wakeWordEnabled ?? true,
      };
      
      await TeddFirebaseService.saveVoicePreferences(newPrefs);
      
      // Update voice service settings
      VoiceService.updateSettings({
        language: newPrefs.language,
        pitch: newPrefs.pitch,
        rate: newPrefs.speechRate,
        voice: newPrefs.selectedVoice,
      });
      
      this.wakeWordEnabled = newPrefs.wakeWordEnabled;
    } catch (error) {
      console.error('Error updating voice preferences:', error);
      throw error;
    }
  }

  // Get current state
  getState() {
    return this.currentState;
  }

  // Set state and notify listeners
  setState(state) {
    this.currentState = state;
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }

  // Handle errors
  handleError(error) {
    console.error('Tedd error:', error);
    
    if (this.onError) {
      this.onError(error);
    }
    
    // Return to idle or wake word detection
    if (this.continuousListening && this.wakeWordEnabled) {
      this.startWakeWordDetection();
    } else {
      this.setState('idle');
    }
  }

  // Generate unique ID
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup
  async cleanup() {
    await VoiceService.cleanup();
    this.setState('idle');
  }
}

export default TeddManager;