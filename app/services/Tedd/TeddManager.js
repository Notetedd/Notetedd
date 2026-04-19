/**
 * TeddManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates voice/text interaction with Tedd.
 * Uses AIService (Groq → Gemini) instead of GeminiService.
 * Adds AI-aware audio navigation: announces screens, gives contextual hints,
 * and generates a personalised follow-up after every navigation action.
 *
 * Required .env variables (consumed by AIService):
 *   EXPO_PUBLIC_GROQ_API_KEY
 *   EXPO_PUBLIC_GEMINI_API_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

import VoiceService from './VoiceService';
import AIService from './AIService';
import TeddFirebaseService from './TeddFirebaseService';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
//  NAVIGATION AUDIO REGISTRY
//  Each screen entry has:
//    announce  – spoken immediately before/during the transition (no AI wait)
//    context   – spoken after landing, describing what the user will find
// ─────────────────────────────────────────────────────────────────────────────
const SCREEN_AUDIO = {
  HomeScreen: {
    announce: 'Taking you home.',
    context:  "You're on the Home screen. I can show your recent notes, start a study session, or open any feature from here.",
  },
  NotesScreen: {
    announce: 'Opening your Notes.',
    context:  'Here are your notes. Say "list my notes" to get a summary, or tap any note to open it.',
  },
  RecordScreen: {
    announce: 'Opening the recorder.',
    context:  "You're in the recording studio. Say \"start recording\" when you're ready and I'll capture everything.",
  },
  ProfileScreen: {
    announce: 'Opening your Profile.',
    context:  'This is your profile. You can update your info, view achievements, or manage your subscription here.',
  },
  SyncClassroomScreen: {
    announce: 'Connecting to Google Classroom.',
    context:  "Google Classroom is syncing. I'll surface any pending assignments or new materials for you.",
  },
  UploadPDFScreen: {
    announce: 'Opening the PDF uploader.',
    context:  "You can import a PDF here. Once uploaded, I can summarise it or convert it into study notes.",
  },
  SubscriptionPlanScreen: {
    announce: 'Checking your subscription plan.',
    context:  "Here are the available plans. Let me know if you'd like me to explain the differences.",
  },
  PaymentMethodsScreen: {
    announce: 'Opening Payment Methods.',
    context:  'Your saved payment methods are here. You can add or remove cards from this screen.',
  },
  NotificationsScreen: {
    announce: 'Opening Notifications.',
    context:  "Here are your recent notifications. I can highlight anything that needs your attention.",
  },
  HelpSupportScreen: {
    announce: 'Opening Help and Support.',
    context:  "You can browse FAQs, contact support, or describe a problem to me and I'll try to fix it.",
  },
  SellNotesScreen: {
    announce: 'Opening the Notes Marketplace.',
    context:  "You can list your notes for sale here. I can help you price them or write descriptions.",
  },
  PairedDevicesScreen: {
    announce: 'Opening Paired Devices.',
    context:  'Manage your connected devices here. Pairing a smart pen or tablet? I can guide you through it.',
  },
  PrivacyScreen: {
    announce: 'Opening Privacy Settings.',
    context:  'Your privacy controls are here — data sharing, analytics opt-out, and deletion options.',
  },
  PrefferencesScreen: {
    announce: 'Opening App Settings.',
    context:  'Customise Notetedd here — themes, language, notifications, and voice preferences.',
  },
  DarkModeScreen: {
    announce: 'Opening Appearance settings.',
    context:  'Toggle dark mode or choose a custom theme. Changes apply instantly.',
  },
  ResetPasswordScreen: {
    announce: 'Opening Password Reset.',
    context:  "Enter your email and I'll walk you through resetting your password securely.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────

class TeddManager {
  constructor(config) {
    this.userId      = config.userId;
    this.dataService = config.dataService;
    this.onStateChange = config.onStateChange;
    this.onMessage     = config.onMessage;
    this.onError       = config.onError;
    this.onAction      = config.onAction;

    // ── AI Service: Groq first, Gemini fallback ───────────────────────────
    // Keys come from env vars automatically inside AIService; no need to pass
    // them explicitly unless you want to override per-instance.
    this.aiService = new AIService({
      // Optional overrides – leave blank to use env vars
      groqApiKey:   config.groqApiKey,
      geminiApiKey: config.geminiApiKey || config.apiKey,
      groqModel:    config.groqModel,
      geminiModel:  config.geminiModel || config.model,
      temperature:  0.7,
    });

    if (this.dataService) {
      this.aiService.setDataService(this.dataService);
    }

    // ── State ──────────────────────────────────────────────────────────────
    this.currentState        = 'idle';
    this.currentSessionId    = undefined;
    this.currentContext      = undefined;
    this.isInitialized       = false;
    this.wakeWordEnabled     = true;
    this.continuousListening = false;
    this.interimTranscript   = '';
    this.conversationMode    = 'text'; // 'text' | 'speech'
    this.speechAvailable     = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  INITIALIZE
  // ══════════════════════════════════════════════════════════════════════════

  async initialize() {
    try {
      console.log('[TeddManager] Initializing…');

      this.speechAvailable = VoiceService.isSpeechRecognitionAvailable();
      console.log('[TeddManager] Speech available:', this.speechAvailable);

      const audioInit = await VoiceService.initializeAudio();

      if (!audioInit.success) {
        this._emitInfo('Voice features unavailable. You can still use text chat!');
      } else if (audioInit.needsRequest) {
        this._emitError(
          'Enable microphone to use voice features, or continue with text chat.',
          'info',
          { canDismiss: true, needsPermission: true }
        );
      }

      // Load voice preferences
      try {
        const prefs = await TeddFirebaseService.getVoicePreferences(this.userId);
        if (prefs) {
          VoiceService.updateSettings({
            language: prefs.language,
            pitch:    prefs.pitch,
            rate:     prefs.speechRate,
            voice:    prefs.selectedVoice,
          });
          this.wakeWordEnabled = prefs.wakeWordEnabled !== false;
        }
      } catch (e) {
        console.error('[TeddManager] Preferences load error:', e);
      }

      // Load last conversation
      try {
        const recent = await TeddFirebaseService.getUserConversations(this.userId, 1);
        if (recent.length > 0) {
          this.currentSessionId = recent[0].id;
          this.aiService.loadHistory(recent[0].messages);
        }
      } catch (e) {
        console.error('[TeddManager] History load error:', e);
      }

      this.isInitialized = true;
      this.setState('idle');
      console.log('[TeddManager] Initialized successfully');

      return {
        success:         true,
        speechAvailable: this.speechAvailable,
        hasPermission:   audioInit.granted,
        needsPermission: audioInit.needsRequest,
      };
    } catch (error) {
      console.error('[TeddManager] Initialization error:', error);
      this.isInitialized = true;
      this.setState('idle');
      return { success: false, speechAvailable: false, error: error.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PERMISSIONS
  // ══════════════════════════════════════════════════════════════════════════

  async requestMicrophonePermission() {
    try {
      const result = await VoiceService.requestPermissions();

      if (result.granted) {
        this.speechAvailable = VoiceService.isSpeechRecognitionAvailable();
        this._emitSuccess('Microphone enabled! You can now use voice features.');
        return { success: true, granted: true };
      }

      this._emitWarning(result.message || 'Microphone access denied. You can still use text chat.');
      return { success: false, granted: false, message: result.message };
    } catch (error) {
      console.error('[TeddManager] Permission error:', error);
      return { success: false, error: error.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONVERSATION MODE
  // ══════════════════════════════════════════════════════════════════════════

  setConversationMode(mode) {
    console.log('[TeddManager] Switching to mode:', mode);
    this.conversationMode = mode;

    if (mode === 'speech') {
      if (!this.speechAvailable) {
        const msg = Platform.OS === 'web'
          ? 'Voice mode requires Chrome or Edge browser. Staying in text mode.'
          : 'Voice mode not available on this device. Staying in text mode.';
        this._emitInfo(msg);
        this.conversationMode = 'text';
        return false;
      }

      if (!VoiceService.hasPermission()) {
        this._emitError(
          'Please enable microphone access to use voice mode.',
          'warning',
          { canDismiss: true, needsPermission: true }
        );
        return false;
      }

      if (this.wakeWordEnabled) this.startWakeWordDetection();
      return true;
    }

    this.stopWakeWordDetection();
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  WAKE WORD DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  async startWakeWordDetection() {
    if (!this.isInitialized) throw new Error('Tedd not initialized');
    if (!this.speechAvailable || !VoiceService.hasPermission()) {
      this.setState('idle');
      return;
    }

    this.continuousListening = true;
    this.setState('wake-word-detection');

    try {
      await this.startListeningForWakeWord();
    } catch (error) {
      console.error('[TeddManager] Wake word start error:', error);
      this.setState('idle');
      this.continuousListening = false;
    }
  }

  async stopWakeWordDetection() {
    this.continuousListening = false;
    await VoiceService.stopListening();
    this.setState('idle');
  }

  async startListeningForWakeWord() {
    try {
      await VoiceService.startListening(
        this.handleWakeWordResult.bind(this),
        this.handleWakeWordError.bind(this),
        true // continuous
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  handleWakeWordResult(result) {
    const { transcript, isFinal } = result;
    if (!isFinal) { this.interimTranscript = transcript; return; }

    console.log('[TeddManager] Wake word check:', transcript);

    if (VoiceService.detectWakeWord(transcript)) {
      const command = VoiceService.extractCommand(transcript);
      if (command?.length > 0) {
        this.handleUserInput(command, 'speech');
      } else {
        this.startActiveListening();
      }
    }
    this.interimTranscript = '';
  }

  handleWakeWordError(error) {
    if (error.message?.match(/No speech|aborted|no-speech/)) return;
    if (error.message?.match(/denied|not-allowed/)) {
      this.setState('idle');
      this._emitWarning('Microphone access denied. Switching to text mode.');
      this.conversationMode = 'text';
      return;
    }
    console.error('[TeddManager] Wake word error:', error);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTIVE LISTENING
  // ══════════════════════════════════════════════════════════════════════════

  async startActiveListening() {
    try {
      if (!this.speechAvailable) {
        this.setState('idle');
        const error      = new Error('Voice input not available. Please use text input.');
        error.unavailable = true;
        error.severity    = 'info';
        error.canDismiss  = true;
        if (this.onError) this.onError(error);
        return;
      }

      if (VoiceService.getIsSpeaking()) await VoiceService.stopSpeaking();

      this.setState('listening');

      const acks = ["Yes?", "I'm listening!", "Go ahead!", "What can I help with?", "I'm here!"];
      await VoiceService.speak(acks[Math.floor(Math.random() * acks.length)]);
      await new Promise((r) => setTimeout(r, 100));

      await VoiceService.startListening(
        this.handleListeningResult.bind(this),
        this.handleListeningError.bind(this),
        false
      );
    } catch (error) {
      console.error('[TeddManager] Active listening error:', error);
      this.handleError(error);
    }
  }

  handleListeningError(error) {
    if (error.unavailable) {
      this.setState('idle');
      if (this.onError) this.onError(error);
    } else if (error.permissionDenied || error.message?.match(/denied|not-allowed/)) {
      this.setState('idle');
      this.conversationMode = 'text';
      this._emitWarning('Microphone access denied. Switching to text mode.');
      VoiceService.speak('No problem! You can type your messages to me instead.');
    } else {
      this.handleError(error);
    }
  }

  handleListeningResult(result) {
    const { transcript, isFinal } = result;

    if (!isFinal) {
      this.interimTranscript = transcript;
      if (this.onMessage) {
        this.onMessage({
          id: 'interim', role: 'user', content: transcript,
          interim: true, timestamp: new Date(),
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

  // ══════════════════════════════════════════════════════════════════════════
  //  HANDLE USER INPUT — entry point for all text & speech input
  // ══════════════════════════════════════════════════════════════════════════

  async handleUserInput(input, inputMode = 'text') {
    try {
      console.log('[TeddManager] Input:', input, '| mode:', inputMode);
      await VoiceService.stopListening();
      this.setState('processing');

      // Publish user message to UI
      const userMessage = {
        id:        this.generateId(),
        role:      'user',
        content:   input,
        timestamp: new Date(),
        mode:      inputMode,
      };
      if (this.onMessage) this.onMessage(userMessage);

      // Detect action
      const actionDetection = this.aiService.detectAction(input);

      if (actionDetection.hasAction && actionDetection.actionType === 'navigate') {
        // Navigation gets its own audio-rich pipeline
        await this._handleNavigationWithAudio(actionDetection, input, inputMode);
        return;
      }

      if (actionDetection.hasAction && this.onAction) {
        this.onAction(actionDetection.actionType, actionDetection.parameters);
      }

      // Standard AI response
      await this._processAIResponse(input, inputMode);
    } catch (error) {
      console.error('[TeddManager] handleUserInput error:', error);
      this.handleError(error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  AI-AWARE AUDIO NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Three-phase navigation with audio:
   *   Phase 1 — Speak the destination announcement immediately (no AI wait)
   *   Phase 2 — Fire the navigation action
   *   Phase 3 — AI generates a personalised follow-up; speak context + follow-up
   */
  async _handleNavigationWithAudio(actionDetection, originalInput, inputMode) {
    const screen   = actionDetection.parameters?.screen;
    const audio    = SCREEN_AUDIO[screen] || {
      announce: `Navigating to ${screen?.replace(/Screen$/, '') || 'that screen'}.`,
      context:  null,
    };
    const isVoice  = this.conversationMode === 'speech' || inputMode === 'speech';

    // ── Phase 1: Immediate spoken announcement ─────────────────────────────
    const announcementMsg = {
      id:                this.generateId(),
      role:              'assistant',
      content:           audio.announce,
      timestamp:         new Date(),
      shouldSpeak:       isVoice,
      isNavAnnouncement: true,
    };
    if (this.onMessage) this.onMessage(announcementMsg);
    if (isVoice) await VoiceService.speak(audio.announce);

    // ── Phase 2: Execute navigation ────────────────────────────────────────
    if (this.onAction) {
      this.onAction(actionDetection.actionType, actionDetection.parameters);
    }

    // ── Phase 3: Personalised AI follow-up (runs while screen animates) ────
    const [aiFollowUp] = await Promise.all([
      this._generateNavFollowUp(screen, originalInput, audio.context),
      new Promise((r) => setTimeout(r, isVoice ? 800 : 0)), // let transition settle
    ]);

    const fullContext = [audio.context, aiFollowUp].filter(Boolean).join(' ');

    if (fullContext) {
      const contextMsg = {
        id:          this.generateId(),
        role:        'assistant',
        content:     fullContext,
        timestamp:   new Date(),
        shouldSpeak: isVoice,
        isNavContext: true,
      };
      if (this.onMessage) this.onMessage(contextMsg);
      if (isVoice) await VoiceService.speak(fullContext);
    }

    await this.saveCurrentConversation();
    this.setState('idle');
  }

  /**
   * Ask Tedd AI for a personalised 1-sentence follow-up that connects what
   * the user said to what they'll find on the screen.
   * Returns an empty string if there's nothing meaningful to add.
   */
  async _generateNavFollowUp(screen, userInput, defaultContext) {
    try {
      const prompt =
        `The user said: "${userInput}"\n` +
        `They have been navigated to: ${screen}\n` +
        `The following context has already been spoken: "${defaultContext || ''}"\n\n` +
        `Write exactly ONE short sentence (max 15 words) that personalises the ` +
        `transition based on what the user said. ` +
        `If nothing personalised is relevant, return an empty string. ` +
        `Natural speech only — no markdown, no emojis.`;

      const response = await this.aiService.sendMessage(
        prompt,
        {
          ...this.currentContext,
          conversationMode: 'speech', // always brief
          isVoiceInput:     true,
          currentScreen:    screen,
        },
        null
      );

      if (!response || response.trim().length < 4) return '';
      if (response.trim() === defaultContext?.trim()) return '';
      return response.trim();
    } catch (err) {
      console.warn('[TeddManager] Nav follow-up generation failed:', err.message);
      return '';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STANDARD AI RESPONSE
  // ══════════════════════════════════════════════════════════════════════════

  async _processAIResponse(input, inputMode) {
    try {
      const contextWithMode = {
        ...this.currentContext,
        conversationMode: this.conversationMode,
        isVoiceInput:     inputMode === 'speech',
      };

      const response = await this.aiService.sendMessage(input, contextWithMode, null);

      const assistantMessage = {
        id:          this.generateId(),
        role:        'assistant',
        content:     response,
        timestamp:   new Date(),
        shouldSpeak: this.conversationMode === 'speech',
        provider:    this.aiService.getActiveProvider(),
      };

      if (this.onMessage) this.onMessage(assistantMessage);
      await this.saveCurrentConversation();
      this.setState('idle');
    } catch (error) {
      console.error('[TeddManager] AI response error:', error);
      this.handleError(error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API  (all signatures unchanged)
  // ══════════════════════════════════════════════════════════════════════════

  async sendTextMessage(text, context) {
    if (context) this.updateContext(context);
    await this.handleUserInput(text, 'text');
  }

  async triggerListening() {
    if (this.conversationMode !== 'speech') return;
    if (!this.speechAvailable) {
      this._emitWarning('Voice input not available on this device.');
      return;
    }
    await this.startActiveListening();
  }

  updateContext(context) {
    this.currentContext = { ...this.currentContext, ...context };
    if (context?.navigation) this.aiService.setNavigation(context.navigation);
    console.log('[TeddManager] Context updated:', this.currentContext);
  }

  async saveCurrentConversation() {
    try {
      const history = this.aiService.getConversationHistory();
      this.currentSessionId = await TeddFirebaseService.saveConversation(
        this.userId, history, this.currentSessionId
      );
      await this.aiService.summarizeHistory();
    } catch (error) {
      console.error('[TeddManager] Save conversation error:', error);
    }
  }

  getConversationHistory() { return this.aiService.getConversationHistory(); }

  async clearConversation() {
    this.aiService.clearHistory();
    this.currentSessionId = undefined;
    await TeddFirebaseService.clearUserConversations(this.userId);
  }

  async updateVoicePreferences(preferences) {
    try {
      const current = await TeddFirebaseService.getVoicePreferences(this.userId);
      const newPrefs = {
        userId:          this.userId,
        language:        preferences.language        || current?.language        || 'en-US',
        pitch:           preferences.pitch           ?? current?.pitch           ?? 1.0,
        speechRate:      preferences.speechRate      ?? current?.speechRate      ?? 1.0,
        selectedVoice:   preferences.selectedVoice   || current?.selectedVoice,
        optInRecording:  preferences.optInRecording  ?? current?.optInRecording  ?? false,
        wakeWordEnabled: preferences.wakeWordEnabled ?? current?.wakeWordEnabled ?? true,
      };

      await TeddFirebaseService.saveVoicePreferences(newPrefs);
      VoiceService.updateSettings({
        language: newPrefs.language,
        pitch:    newPrefs.pitch,
        rate:     newPrefs.speechRate,
        voice:    newPrefs.selectedVoice,
      });

      this.wakeWordEnabled = newPrefs.wakeWordEnabled;

      if (
        this.conversationMode === 'speech' &&
        this.wakeWordEnabled &&
        this.currentState !== 'wake-word-detection'
      ) {
        await this.startWakeWordDetection();
      }
    } catch (error) {
      console.error('[TeddManager] Update voice prefs error:', error);
      throw error;
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────
  getState()            { return this.currentState; }
  getConversationMode() { return this.conversationMode; }
  isSpeechAvailable()   { return this.speechAvailable; }
  getActiveProvider()   { return this.aiService.getActiveProvider(); }

  // ── State machine ──────────────────────────────────────────────────────────
  setState(state) {
    const prev = this.currentState;
    this.currentState = state;
    console.log('[TeddManager] State:', prev, '→', state);
    if (this.onStateChange) this.onStateChange(state, prev);
  }

  handleError(error) {
    console.error('[TeddManager] Error:', error);
    if (this.onError) this.onError(error);
    if (this.conversationMode === 'speech' && this.continuousListening && this.wakeWordEnabled) {
      this.startWakeWordDetection();
    } else {
      this.setState('idle');
    }
  }

  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanup() {
    await VoiceService.cleanup();
    this.setState('idle');
  }

  // ── Error-emit helpers ─────────────────────────────────────────────────────
  _emitInfo(msg)    { this._emitError(msg, 'info',    { canDismiss: true }); }
  _emitWarning(msg) { this._emitError(msg, 'warning', { canDismiss: true }); }
  _emitSuccess(msg) { this._emitError(msg, 'success', { canDismiss: true }); }

  _emitError(msg, severity, extras = {}) {
    if (!this.onError) return;
    const error = new Error(msg);
    error.severity = severity;
    Object.assign(error, extras);
    this.onError(error);
  }
}

export default TeddManager;