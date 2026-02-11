import VoiceService from './VoiceService';
import GeminiService from './GeminiService';
import TeddFirebaseService from './TeddFirebaseService';
import { Platform } from 'react-native';

class TeddManager {
  constructor(config) {
    this.userId = config.userId;
    this.dataService = config.dataService; // Add DataService
    this.onStateChange = config.onStateChange;
    this.onMessage = config.onMessage;
    this.onError = config.onError;
    this.onAction = config.onAction;
    
    this.geminiService = new GeminiService({
      apiKey: config.geminiApiKey,
      model: 'gemini-2.0-flash',
      temperature: 0.7,
    });

    // Set DataService in GeminiService
    if (this.dataService) {
      this.geminiService.setDataService(this.dataService);
    }

    this.currentState = 'idle';
    this.currentSessionId = undefined;
    this.currentContext = undefined;
    this.isInitialized = false;
    this.wakeWordEnabled = true;
    this.continuousListening = false;
    this.interimTranscript = '';
    this.conversationMode = 'text'; // 'text' or 'speech'
    this.speechAvailable = false;
  }

  // Initialize Tedd
  async initialize() {
    try {
      console.log('[TeddManager] Initializing...');
      
      // Check if speech recognition is available
      this.speechAvailable = VoiceService.isSpeechRecognitionAvailable();
      console.log('[TeddManager] Speech available:', this.speechAvailable);
      
      // Initialize audio (will check permissions but not crash if denied)
      const audioInit = await VoiceService.initializeAudio();
      
      if (!audioInit.success) {
        console.log('[TeddManager] Audio not initialized:', audioInit.message);
        if (this.onError) {
          const error = new Error('Voice features unavailable. You can still use text chat!');
          error.severity = 'info';
          error.canDismiss = true;
          this.onError(error);
        }
      } else if (audioInit.needsRequest) {
        console.log('[TeddManager] Permissions need to be requested');
        if (this.onError) {
          const error = new Error('Enable microphone to use voice features, or continue with text chat.');
          error.severity = 'info';
          error.canDismiss = true;
          error.needsPermission = true;
          this.onError(error);
        }
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
          this.wakeWordEnabled = preferences.wakeWordEnabled !== false;
        }
      } catch (error) {
        console.error('[TeddManager] Error loading preferences:', error);
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
      }
      
      this.isInitialized = true;
      this.setState('idle');
      console.log('[TeddManager] Initialized successfully');
      
      return {
        success: true,
        speechAvailable: this.speechAvailable,
        hasPermission: audioInit.granted,
        needsPermission: audioInit.needsRequest,
      };
    } catch (error) {
      console.error('[TeddManager] Error initializing Tedd:', error);
      this.isInitialized = true;
      this.setState('idle');
      
      return {
        success: false,
        speechAvailable: false,
        error: error.message,
      };
    }
  }

  // Request microphone permissions
  async requestMicrophonePermission() {
    try {
      const result = await VoiceService.requestPermissions();
      
      if (result.granted) {
        console.log('[TeddManager] Microphone permission granted');
        this.speechAvailable = VoiceService.isSpeechRecognitionAvailable();
        
        if (this.onError) {
          const success = new Error('Microphone enabled! You can now use voice features.');
          success.severity = 'success';
          success.canDismiss = true;
          this.onError(success);
        }
        
        return { success: true, granted: true };
      } else {
        console.log('[TeddManager] Microphone permission denied');
        
        if (this.onError) {
          const error = new Error(result.message || 'Microphone access denied. You can still use text chat.');
          error.severity = 'warning';
          error.canDismiss = true;
          this.onError(error);
        }
        
        return { success: false, granted: false, message: result.message };
      }
    } catch (error) {
      console.error('[TeddManager] Error requesting permission:', error);
      return { success: false, error: error.message };
    }
  }

  // Switch conversation mode
  setConversationMode(mode) {
    console.log('[TeddManager] Switching to mode:', mode);
    this.conversationMode = mode;
    
    if (mode === 'speech') {
      if (!this.speechAvailable) {
        console.log('[TeddManager] Speech not available on this platform');
        
        if (this.onError) {
          const error = new Error(
            Platform.OS === 'web' 
              ? 'Voice mode requires Chrome or Edge browser. Staying in text mode.'
              : 'Voice mode not available on this device. Staying in text mode.'
          );
          error.severity = 'info';
          error.canDismiss = true;
          this.onError(error);
        }
        
        this.conversationMode = 'text';
        return false;
      }
      
      if (!VoiceService.hasPermission()) {
        console.log('[TeddManager] No microphone permission');
        
        if (this.onError) {
          const error = new Error('Please enable microphone access to use voice mode.');
          error.severity = 'warning';
          error.canDismiss = true;
          error.needsPermission = true;
          this.onError(error);
        }
        
        return false;
      }
      
      // Start wake word detection if enabled
      if (this.wakeWordEnabled) {
        this.startWakeWordDetection();
      }
      
      return true;
    } else {
      // Switch to text mode
      this.stopWakeWordDetection();
      return true;
    }
  }

  // Start wake word detection
  async startWakeWordDetection() {
    if (!this.isInitialized) {
      throw new Error('Tedd not initialized');
    }
    
    if (!this.speechAvailable) {
      console.log('[TeddManager] Speech recognition not available');
      this.setState('idle');
      return;
    }
    
    if (!VoiceService.hasPermission()) {
      console.log('[TeddManager] No microphone permission for wake word detection');
      this.setState('idle');
      return;
    }
    
    this.continuousListening = true;
    this.setState('wake-word-detection');
    
    try {
      await this.startListeningForWakeWord();
    } catch (error) {
      console.error('[TeddManager] Could not start wake word detection:', error);
      this.setState('idle');
      this.continuousListening = false;
    }
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
        this.handleWakeWordError.bind(this),
        true // continuous mode
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  // Handle wake word detection results
  handleWakeWordResult(result) {
    const { transcript, isFinal } = result;
    
    if (!isFinal) {
      this.interimTranscript = transcript;
      return;
    }
    
    console.log('[TeddManager] Wake word check:', transcript);
    
    if (VoiceService.detectWakeWord(transcript)) {
      console.log('[TeddManager] Wake word detected!');
      
      const command = VoiceService.extractCommand(transcript);
      
      if (command && command.length > 0) {
        console.log('[TeddManager] Command with wake word:', command);
        this.handleUserInput(command, 'speech');
      } else {
        console.log('[TeddManager] Wake word only, starting active listening');
        this.startActiveListening();
      }
    }
    
    this.interimTranscript = '';
  }

  // Handle wake word detection errors
  handleWakeWordError(error) {
    console.log('[TeddManager] Wake word detection error:', error.message);
    
    if (error.message?.includes('No speech') || 
        error.message?.includes('aborted') ||
        error.message?.includes('no-speech')) {
      return;
    }
    
    if (error.message?.includes('denied') || error.message?.includes('not-allowed')) {
      this.setState('idle');
      
      if (this.onError) {
        const permError = new Error('Microphone access denied. Switching to text mode.');
        permError.severity = 'warning';
        permError.canDismiss = true;
        this.onError(permError);
      }
      
      this.conversationMode = 'text';
      return;
    }
    
    console.error('[TeddManager] Wake word error:', error);
  }

  // Start active listening
  async startActiveListening() {
    try {
      if (!this.speechAvailable) {
        console.log('[TeddManager] Speech recognition not available');
        this.setState('idle');
        
        if (this.onError) {
          const error = new Error('Voice input not available. Please use text input.');
          error.unavailable = true;
          error.severity = 'info';
          error.canDismiss = true;
          this.onError(error);
        }
        
        return;
      }

      // Stop any ongoing speech
      if (VoiceService.getIsSpeaking()) {
        await VoiceService.stopSpeaking();
      }
      
      this.setState('listening');
      
      // Play acknowledgment
      const acknowledgments = [
        'Yes?',
        'I\'m listening!',
        'Go ahead!',
        'What can I help with?',
        'I\'m here!'
      ];
      const ack = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
      
      // Speak acknowledgment (VoiceService handles this now)
      await VoiceService.speak(ack);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start listening for user command
      await VoiceService.startListening(
        this.handleListeningResult.bind(this),
        this.handleListeningError.bind(this),
        false
      );
    } catch (error) {
      console.error('[TeddManager] Error starting active listening:', error);
      this.handleError(error);
    }
  }

  // Handle listening errors
  handleListeningError(error) {
    console.error('[TeddManager] Active listening error:', error);
    
    if (error.unavailable) {
      this.setState('idle');
      if (this.onError) {
        this.onError(error);
      }
    } else if (error.permissionDenied || 
               error.message?.includes('denied') || 
               error.message?.includes('not-allowed')) {
      this.setState('idle');
      this.conversationMode = 'text';
      
      if (this.onError) {
        const permError = new Error('Microphone access denied. Switching to text mode.');
        permError.severity = 'warning';
        permError.canDismiss = true;
        this.onError(permError);
      }
      
      VoiceService.speak("No problem! You can type your messages to me instead.");
    } else {
      this.handleError(error);
    }
  }

  // Handle listening results
  handleListeningResult(result) {
    const { transcript, isFinal } = result;
    
    if (!isFinal) {
      this.interimTranscript = transcript;
      if (this.onMessage) {
        this.onMessage({
          id: 'interim',
          role: 'user',
          content: transcript,
          interim: true,
          timestamp: new Date(),
        });
      }
      return;
    }
    
    if (transcript.trim().length > 0) {
      this.handleUserInput(transcript, 'speech');
    } else {
      if (this.continuousListening && this.wakeWordEnabled) {
        this.startWakeWordDetection();
      } else {
        this.setState('idle');
      }
    }
    
    this.interimTranscript = '';
  }

  // Handle user input
  async handleUserInput(input, inputMode = 'text') {
    try {
      console.log('[TeddManager] Handling input:', input, 'mode:', inputMode);
      
      await VoiceService.stopListening();
      this.setState('processing');
      
      // Create user message
      const userMessage = {
        id: this.generateId(),
        role: 'user',
        content: input,
        timestamp: new Date(),
        mode: inputMode,
      };
      
      if (this.onMessage) {
        this.onMessage(userMessage);
      }
      
      // Check for actions
      const actionDetection = this.geminiService.detectAction(input);
      
      if (actionDetection.hasAction && this.onAction) {
        this.onAction(actionDetection.actionType, actionDetection.parameters);
      }
      
      // Build context with conversation mode info
      const contextWithMode = {
        ...this.currentContext,
        conversationMode: this.conversationMode,
        isVoiceInput: inputMode === 'speech',
      };
      
      // Get AI response
      const response = await this.geminiService.sendMessage(
        input,
        contextWithMode,
        null
      );
      
      // Create assistant message
      const assistantMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        shouldSpeak: this.conversationMode === 'speech',
      };
      
      if (this.onMessage) {
        this.onMessage(assistantMessage);
      }
      
      // Save conversation
      await this.saveCurrentConversation();
      
      // Note: Speech is handled by TeddComponent now, not here
      // Just set state to idle after processing
      this.setState('idle');
      
    } catch (error) {
      console.error('[TeddManager] Error handling input:', error);
      this.handleError(error);
    }
  }

  // Send text message
  async sendTextMessage(text, context) {
    // Update context first
    if (context) {
      this.updateContext(context);
    }
    
    await this.handleUserInput(text, 'text');
  }

  // Manually trigger listening
  async triggerListening() {
    if (this.conversationMode !== 'speech') {
      console.log('[TeddManager] Not in speech mode, ignoring trigger');
      return;
    }
    
    if (!this.speechAvailable) {
      if (this.onError) {
        const error = new Error('Voice input not available on this device.');
        error.severity = 'warning';
        error.canDismiss = true;
        this.onError(error);
      }
      return;
    }
    
    await this.startActiveListening();
  }

  // Update context
  updateContext(context) {
    this.currentContext = {
      ...this.currentContext,
      ...context,
    };
    console.log('[TeddManager] Context updated:', this.currentContext);
  }

  // Save current conversation
  async saveCurrentConversation() {
    try {
      const history = this.geminiService.getConversationHistory();
      
      this.currentSessionId = await TeddFirebaseService.saveConversation(
        this.userId,
        history,
        this.currentSessionId
      );
      
      await this.geminiService.summarizeHistory();
    } catch (error) {
      console.error('[TeddManager] Error saving conversation:', error);
    }
  }

  // Get conversation history
  getConversationHistory() {
    return this.geminiService.getConversationHistory();
  }

  // Clear conversation
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
      
      VoiceService.updateSettings({
        language: newPrefs.language,
        pitch: newPrefs.pitch,
        rate: newPrefs.speechRate,
        voice: newPrefs.selectedVoice,
      });
      
      this.wakeWordEnabled = newPrefs.wakeWordEnabled;
      
      if (this.conversationMode === 'speech' && 
          this.wakeWordEnabled && 
          this.currentState !== 'wake-word-detection') {
        await this.startWakeWordDetection();
      }
    } catch (error) {
      console.error('[TeddManager] Error updating voice preferences:', error);
      throw error;
    }
  }

  // Getters
  getState() {
    return this.currentState;
  }

  getConversationMode() {
    return this.conversationMode;
  }

  isSpeechAvailable() {
    return this.speechAvailable;
  }

  // Set state
  setState(state) {
    const previousState = this.currentState;
    this.currentState = state;
    
    console.log('[TeddManager] State change:', previousState, '->', state);
    
    if (this.onStateChange) {
      this.onStateChange(state, previousState);
    }
  }

  // Handle errors
  handleError(error) {
    console.error('[TeddManager] Error:', error);
    
    if (this.onError) {
      this.onError(error);
    }
    
    if (this.conversationMode === 'speech' && 
        this.continuousListening && 
        this.wakeWordEnabled) {
      this.startWakeWordDetection();
    } else {
      this.setState('idle');
    }
  }

  // Generate ID
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