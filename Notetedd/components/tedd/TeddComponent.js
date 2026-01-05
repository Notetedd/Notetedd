import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Modal, Alert, StyleSheet, Platform } from 'react-native';
import TeddManager from '../../app/services/Tedd/TeddManager';
import TeddFloatingButton from './TeddFloatingButton';
import TeddChatInterface from './TeddChatInterface';
import TeddPermissionPrompt from './TeddPermissionPrompt';
import DataService from '../../app/services/Tedd/DataService';
import TeddSpeechService from '../../app/services/Tedd/TeddSpeechService';
import VoiceService from '../../app/services/Tedd/VoiceService'; // Your existing VoiceService
import { app } from '../../firebaseConfig'; // Your Firebase config
import { getAuth } from 'firebase/auth';

const TeddComponent = ({
  userId,
  geminiApiKey,
  currentScreen,
  context,
  onNavigate,
  onActionExecute,
}) => {
  const [teddManager, setTeddManager] = useState(null);
  const [dataService, setDataService] = useState(null);
  const [speechService, setSpeechService] = useState(null);
  const [teddState, setTeddState] = useState('idle');
  const [conversationMode, setConversationMode] = useState('text');
  const [messages, setMessages] = useState([]);
  const [chatVisible, setChatVisible] = useState(false);
  const [permissionPromptVisible, setPermissionPromptVisible] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [initError, setInitError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastMessageIdSpoken = useRef(null);

  // Initialize DataService and TeddManager
  useEffect(() => {
    if (!userId || !geminiApiKey) {
      console.warn('[TeddComponent] Missing userId or geminiApiKey');
      return;
    }

    // Initialize DataService
    const dataServiceInstance = new DataService(app, userId);
    setDataService(dataServiceInstance);

    // Initialize TeddManager
    const manager = new TeddManager({
      geminiApiKey,
      userId,
      dataService: dataServiceInstance, // Pass DataService to TeddManager
      onStateChange: (state, prevState) => {
        console.log('[TeddComponent] State changed:', prevState, '->', state);
        setTeddState(state);
      },
      onMessage: (message) => {
        console.log('[TeddComponent] Message received:', message);
        handleNewMessage(message);
      },
      onError: (error) => {
        console.error('[TeddComponent] Error:', error);
        handleError(error);
      },
      onAction: (actionType, parameters) => {
        console.log('[TeddComponent] Action:', actionType, parameters);
        handleAction(actionType, parameters);
      },
    });

    setTeddManager(manager);

    // Initialize Tedd
    initializeTedd(manager);

    return () => {
      if (manager) {
        manager.cleanup().catch(console.error);
      }
      if (speech) {
        speech.stop().catch(console.error);
      }
    };
  }, [userId, geminiApiKey]);

  // Update context when screen or context changes
  useEffect(() => {
    if (isInitialized && teddManager && currentScreen) {
      // Enhance context with data availability
      enhanceContextWithData().then(enhancedContext => {
        teddManager.updateContext({
          currentScreen,
          ...context,
          ...enhancedContext,
        });
      });
    }
  }, [currentScreen, context, isInitialized, teddManager]);

  const enhanceContextWithData = async () => {
    if (!dataService) return {};

    try {
      // Get data availability
      const availability = await dataService.checkAvailability();
      
      return {
        dataAvailable: availability,
        hasNotes: availability.notes,
        hasRecordings: availability.recordings,
        hasAnalytics: availability.analytics,
        hasClassroom: availability.classroom,
      };
    } catch (error) {
      console.error('[TeddComponent] Error enhancing context:', error);
      return {};
    }
  };

  const initializeTedd = async (manager, speechServiceInstance) => {
    try {
      console.log('[TeddComponent] Initializing Tedd...');
      
      const result = await manager.initialize();
      
      console.log('[TeddComponent] Initialization result:', result);
      
      // Update state based on initialization result
      setSpeechAvailable(result.speechAvailable);
      setHasPermission(result.hasPermission);
      setNeedsPermission(result.needsPermission);
      
      // Load conversation history
      const history = manager.getConversationHistory();
      setMessages(history);
      
      // Determine initial conversation mode
      if (result.speechAvailable && result.hasPermission) {
        console.log('[TeddComponent] Speech available with permission');
        setConversationMode('text'); // Start in text mode, user can switch
        
        // Optionally start wake word detection
        try {
          await manager.startWakeWordDetection();
          setConversationMode('speech');
        } catch (error) {
          console.log('[TeddComponent] Wake word detection not started:', error.message);
        }
      } else if (result.speechAvailable && result.needsPermission) {
        console.log('[TeddComponent] Speech available but needs permission');
        setConversationMode('text');
      } else {
        console.log('[TeddComponent] Speech not available, using text mode');
        setConversationMode('text');
      }
      
      setIsInitialized(true);
      console.log('[TeddComponent] Initialized successfully');
      
      // Show friendly initialization message
      if (!result.speechAvailable) {
        const platformMessage = Platform.OS === 'web'
          ? 'Voice mode requires Chrome or Edge browser. Text mode is ready!'
          : 'Voice mode not available on this device. Text mode is ready!';
        
        setInitError({
          message: platformMessage,
          severity: 'info',
        });
      } else if (result.needsPermission) {
        setInitError({
          message: 'Enable microphone to use voice mode, or continue with text chat.',
          severity: 'info',
          showPermissionButton: true,
        });
      }

      // Add welcome message from Tedd
      const auth = getAuth();
      const userName = auth.currentUser?.displayName?.split(' ')[0] || 'there';
      
      const welcomeMessage = {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Hey ${userName}! I'm Tedd, your study assistant. I can help you manage your notes, track your progress, check assignments, and navigate the app. What would you like to work on?`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, welcomeMessage]);

      // Set up continuous conversation callback using VoiceService
      VoiceService.setOnSpeechDoneCallback(() => {
        console.log('[TeddComponent] Speech done, restarting listening...');
        if (conversationMode === 'speech' && manager && !isSpeaking) {
          manager.startActiveListening().catch(err => {
            console.log('[TeddComponent] Could not restart listening:', err.message);
          });
        }
      });

      // Speak welcome message if in speech mode
      if (result.speechAvailable && result.hasPermission) {
        setTimeout(() => {
          const welcomeText = `Hey ${userName}! I'm Tedd, your study assistant. How can I help you today?`;
          
          // Use VoiceService for native compatibility
          VoiceService.speak(
            welcomeText,
            () => setIsSpeaking(true),
            () => setIsSpeaking(false),
            (err) => console.error('[TeddComponent] Speech error:', err)
          );
        }, 500);
      }

    } catch (error) {
      console.error('[TeddComponent] Failed to initialize:', error);
      setIsInitialized(true); // Still mark as initialized to allow text mode
      setConversationMode('text');
      
      setInitError({
        message: 'Tedd initialized with text mode only. Voice features unavailable.',
        severity: 'warning',
      });
    }
  };

  const handleNewMessage = useCallback((message) => {
    // Handle interim transcripts
    if (message.interim) {
      setInterimTranscript(message.content);
      return;
    }
    
    // Clear interim transcript
    setInterimTranscript('');
    
    // Clean message object - remove undefined values for Firebase
    const cleanMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date(),
    };
    
    // Only add optional fields if they're defined
    if (message.isVoiceInput !== undefined) cleanMessage.isVoiceInput = message.isVoiceInput;
    if (message.shouldSpeak !== undefined) cleanMessage.shouldSpeak = message.shouldSpeak;
    if (message.metadata) cleanMessage.metadata = message.metadata;
    
    // Add message to history
    setMessages(prev => {
      // Avoid duplicates
      const exists = prev.some(m => m.id === cleanMessage.id);
      if (exists) return prev;
      
      const newMessages = [...prev, cleanMessage];
      
      // Speak assistant messages if in speech mode and not already spoken
      if (cleanMessage.role === 'assistant' && 
          conversationMode === 'speech' && 
          lastMessageIdSpoken.current !== cleanMessage.id) {
        
        lastMessageIdSpoken.current = cleanMessage.id;
        
        // Use VoiceService to speak (it will handle continuous conversation)
        setTimeout(() => {
          VoiceService.speak(
            cleanMessage.content,
            () => setIsSpeaking(true),
            () => setIsSpeaking(false),
            (err) => console.error('[TeddComponent] Speech error:', err)
          );
        }, 300);
      }
      
      return newMessages;
    });
  }, [conversationMode]);

  const handleError = useCallback((error) => {
    console.error('[TeddComponent] Error:', error);
    
    // Handle different error severities
    if (error.severity === 'info' && error.canDismiss) {
      console.log('[TeddComponent] Info:', error.message);
      return;
    }
    
    if (error.severity === 'success' && error.canDismiss) {
      console.log('[TeddComponent] Success:', error.message);
      return;
    }
    
    // Handle permission errors
    if (error.needsPermission || 
        error.permissionDenied || 
        error.message?.includes('permission') || 
        error.message?.includes('denied')) {
      console.log('[TeddComponent] Permission required');
      setNeedsPermission(true);
      setPermissionPromptVisible(true);
      return;
    }
    
    // Handle unavailable features
    if (error.unavailable) {
      console.log('[TeddComponent] Feature unavailable:', error.message);
      Alert.alert(
        'Feature Unavailable',
        error.message,
        [{ text: 'OK' }],
        { cancelable: true }
      );
      return;
    }
    
    // Don't show alerts for no-speech errors
    if (error.message?.includes('no-speech') || 
        error.message?.includes('No speech')) {
      console.log('[TeddComponent] No speech detected (normal)');
      return;
    }
    
    // Show other errors
    if (error.message && error.severity !== 'info') {
      Alert.alert(
        'Tedd',
        error.message,
        [{ text: 'OK' }],
        { cancelable: true }
      );
    }
  }, []);

  const handleAction = useCallback((actionType, parameters) => {
    console.log('[TeddComponent] Action detected:', actionType, parameters);
    
    // Handle navigation actions
    if (actionType === 'navigate' && parameters?.screen && onNavigate) {
      onNavigate(parameters.screen, parameters);
      setChatVisible(false);
      
      // Add confirmation message
      const confirmationMsg = {
        id: `nav-${Date.now()}`,
        role: 'assistant',
        content: `Taking you to ${parameters.screen.replace('Screen', '')}!`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, confirmationMsg]);
      return;
    }
    
    // Handle other actions through callback
    if (onActionExecute) {
      onActionExecute(actionType, parameters);
    }
    
    // Handle specific component actions
    switch (actionType) {
      case 'startRecording':
        if (onNavigate) {
          onNavigate('RecordScreen', { autoStart: true });
          setChatVisible(false);
        } else {
          Alert.alert('Recording', 'Starting audio recording...', [{ text: 'OK' }]);
        }
        break;
      
      case 'stopRecording':
        Alert.alert('Recording', 'Stopping audio recording...', [{ text: 'OK' }]);
        break;
      
      case 'startPomodoro':
        Alert.alert('Pomodoro', 'Starting Pomodoro timer...', [{ text: 'OK' }]);
        break;
      
      default:
        console.log('[TeddComponent] Unhandled action:', actionType);
    }
  }, [onNavigate, onActionExecute]);

  const handleFloatingButtonPress = () => {
    if (chatVisible) {
      // If chat is visible, trigger listening
      handleStartListening();
    } else {
      // If chat is closed, open it
      setChatVisible(true);
    }
  };

  const handleFloatingButtonLongPress = () => {
    // Long press always triggers listening
    handleStartListening();
  };

  const handleSendMessage = async (text) => {
    if (!teddManager || !text.trim()) return;

    try {
      // Enhance message with current context
      const enhancedContext = await enhanceContextWithData();
      
      // Send message with enhanced context
      // sendTextMessage now returns just the response string
      await teddManager.sendTextMessage(text, {
        currentScreen,
        ...context,
        ...enhancedContext,
      });
      
    } catch (error) {
      console.error('[TeddComponent] Error sending message:', error);
      
      // Add error message to chat
      const errorMsg = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble processing that right now. Could you try again?",
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMsg]);
      
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  const handleStartListening = () => {
    if (!teddManager) return;
    
    // Check if speech is available
    if (!speechAvailable) {
      Alert.alert(
        'Voice Not Available',
        Platform.OS === 'web'
          ? 'Voice mode requires Chrome or Edge browser. Please use text input.'
          : 'Voice mode is not available on this device. Please use text input.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Check permissions
    if (needsPermission || !hasPermission) {
      setPermissionPromptVisible(true);
      return;
    }
    
    // Start listening
    teddManager.startActiveListening().catch(error => {
      console.error('[TeddComponent] Error starting listening:', error);
      
      if (error.message?.includes('denied') || error.message?.includes('permission')) {
        setPermissionPromptVisible(true);
      } else if (!error.message?.includes('no-speech')) {
        Alert.alert('Error', 'Could not start voice input. Please try again.');
      }
    });
  };

  const handleStopListening = async () => {
    if (!teddManager) return;
    
    try {
      await teddManager.stopSpeaking();
      
      // Return to appropriate state based on conversation mode
      if (conversationMode === 'speech') {
        await teddManager.startWakeWordDetection().catch(console.error);
      }
    } catch (error) {
      console.error('[TeddComponent] Error stopping listening:', error);
    }
  };

  const handleStopSpeaking = () => {
    // Use VoiceService to stop speaking
    VoiceService.stopSpeaking().catch(error => {
      console.error('[TeddComponent] Error stopping speech:', error);
    });
    
    if (speechService) {
      speechService.stop().catch(error => {
        console.error('[TeddComponent] Error stopping TTS service:', error);
      });
    }
    
    if (teddManager) {
      teddManager.stopSpeaking().catch(error => {
        console.error('[TeddComponent] Error stopping TTS:', error);
      });
    }
  };

  const handleToggleMode = async () => {
    if (!teddManager) return;
    
    const newMode = conversationMode === 'text' ? 'speech' : 'text';
    
    console.log('[TeddComponent] Switching mode to:', newMode);
    
    // Check if speech is available
    if (newMode === 'speech' && !speechAvailable) {
      Alert.alert(
        'Voice Not Available',
        Platform.OS === 'web'
          ? 'Voice mode requires Chrome or Edge browser.'
          : 'Voice mode is not available on this device.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Check permissions
    if (newMode === 'speech' && (needsPermission || !hasPermission)) {
      setPermissionPromptVisible(true);
      return;
    }
    
    // Switch mode
    const success = teddManager.setConversationMode(newMode);
    
    if (success) {
      setConversationMode(newMode);
      
      const modeText = newMode === 'speech' ? 'Voice Mode' : 'Text Mode';
      console.log('[TeddComponent] Switched to:', modeText);
      
      // Add mode change message
      const modeMsg = {
        id: `mode-${Date.now()}`,
        role: 'assistant',
        content: `Switched to ${modeText}${newMode === 'speech' ? '. Say "Hey Tedd" to start talking!' : ''}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, modeMsg]);
    } else {
      console.warn('[TeddComponent] Failed to switch mode');
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all conversation history with Tedd?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (teddManager) {
              try {
                await teddManager.clearConversation();
                setMessages([]);
                console.log('[TeddComponent] Conversation history cleared');
                
                // Add fresh welcome message
                const welcomeMsg = {
                  id: `welcome-${Date.now()}`,
                  role: 'assistant',
                  content: "History cleared! I'm Tedd, your study assistant. How can I help you today?",
                  timestamp: new Date(),
                };
                setMessages([welcomeMsg]);
              } catch (error) {
                console.error('[TeddComponent] Error clearing history:', error);
                Alert.alert('Error', 'Failed to clear history. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  const handlePermissionGranted = async () => {
    console.log('[TeddComponent] Permission granted callback');
    setPermissionPromptVisible(false);
    
    if (!teddManager) return;
    
    try {
      const result = await teddManager.requestMicrophonePermission();
      
      if (result.granted) {
        console.log('[TeddComponent] Microphone permission granted');
        setHasPermission(true);
        setNeedsPermission(false);
        setSpeechAvailable(teddManager.isSpeechAvailable());
        
        // Ask user if they want to switch to voice mode
        Alert.alert(
          'Voice Enabled',
          'You can now use voice features! Would you like to switch to voice mode?',
          [
            { text: 'Stay in Text', style: 'cancel' },
            {
              text: 'Use Voice',
              onPress: () => {
                const success = teddManager.setConversationMode('speech');
                if (success) {
                  setConversationMode('speech');
                  
                  const voiceMsg = {
                    id: `voice-${Date.now()}`,
                    role: 'assistant',
                    content: "Voice mode activated! Say 'Hey Tedd' to start a conversation.",
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, voiceMsg]);
                }
              },
            },
          ]
        );
      } else {
        console.log('[TeddComponent] Microphone permission denied');
        setHasPermission(false);
        setNeedsPermission(false);
        
        Alert.alert(
          'Permission Denied',
          result.message || 'Microphone access was denied. You can still use text mode.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[TeddComponent] Error requesting permission:', error);
      Alert.alert('Error', 'Failed to request permission. Please try again.');
    }
  };

  const handlePermissionDenied = (message) => {
    console.log('[TeddComponent] Permission denied:', message);
    setPermissionPromptVisible(false);
    setNeedsPermission(false);
    setConversationMode('text');
  };

  // Don't render if no userId or apiKey
  if (!userId || !geminiApiKey) {
    console.warn('[TeddComponent] Cannot render: missing userId or geminiApiKey');
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Floating Button */}
      {isInitialized && (
        <TeddFloatingButton
          state={teddState}
          mode={conversationMode}
          speechAvailable={speechAvailable}
          onPress={handleFloatingButtonPress}
          onLongPress={handleFloatingButtonLongPress}
        />
      )}

      {/* Chat Interface Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setChatVisible(false)}
      >
        <TeddChatInterface
          visible={chatVisible}
          messages={messages}
          state={teddState}
          mode={conversationMode}
          interimTranscript={interimTranscript}
          speechAvailable={speechAvailable}
          hasPermission={hasPermission}
          needsPermission={needsPermission}
          onClose={() => setChatVisible(false)}
          onSendMessage={handleSendMessage}
          onStartListening={handleStartListening}
          onStopListening={handleStopListening}
          onStopSpeaking={handleStopSpeaking}
          onToggleMode={handleToggleMode}
          onClearHistory={handleClearHistory}
          onRequestPermission={() => setPermissionPromptVisible(true)}
        />
      </Modal>

      {/* Permission Prompt Modal */}
      <TeddPermissionPrompt
        visible={permissionPromptVisible}
        platform={Platform.OS}
        onClose={() => setPermissionPromptVisible(false)}
        onPermissionGranted={handlePermissionGranted}
        onPermissionDenied={handlePermissionDenied}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
});

export default TeddComponent;