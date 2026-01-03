import React, { useState, useEffect, useCallback } from 'react';
import { View, Modal, Alert, StyleSheet } from 'react-native';
import TeddManager from './../../app/services/Tedd/TeddManager';
import TeddFloatingButton from './TeddFloatingButton';
import TeddChatInterface from './TeddChatInterface';
import TeddPermissionPrompt from './../../app/services/Tedd/TeddPermissionPrompt';
import { useNavigation } from '@react-navigation/native';

interface TeddComponentProps {
  userId: string;
  geminiApiKey: string;
  currentScreen?: string;
  context?: Partial<TeddContext>;
  onNavigate?: (screen: string, params?: any) => void;
  onActionExecute?: (actionType: string, parameters?: any) => void;
}

const TeddComponent: React.FC<TeddComponentProps> = ({
  userId,
  geminiApiKey,
  currentScreen,
  context,
  onNavigate,
  onActionExecute,
}) => {
  const navigation = useNavigation();
  
  const [teddManager] = useState(
    () => new TeddManager({
      geminiApiKey,
      userId,
      onStateChange: (state) => setTeddState(state),
      onMessage: (message) => handleNewMessage(message),
      onError: (error) => handleError(error),
      onAction: (actionType, parameters) => handleAction(actionType, parameters),
    })
  );

  const [teddState, setTeddState] = useState<TeddState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatVisible, setChatVisible] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Tedd on mount
  useEffect(() => {
    initializeTedd();
    
    return () => {
      teddManager.cleanup();
    };
  }, []);

  // Update context when screen or context changes
  useEffect(() => {
    if (isInitialized && currentScreen) {
      teddManager.updateContext({
        currentScreen,
        ...context,
      });
    }
  }, [currentScreen, context, isInitialized]);

  const initializeTedd = async () => {
    try {
      await teddManager.initialize();
      
      // Load conversation history
      const history = teddManager.getConversationHistory();
      setMessages(history);
      
      // Start wake word detection (only if permissions granted)
      // This won't crash if permissions aren't granted
      try {
        await teddManager.startWakeWordDetection();
      } catch (error) {
        console.log('Wake word detection not started:', error.message);
        // User can still use Tedd via text or manual voice activation
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize Tedd:', error);
      // Don't show alert here - initialization errors are already logged
      // Tedd will still work with text input
      setIsInitialized(true);
    }
  };

  const handleNewMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('Tedd error:', error);
    Alert.alert('Error', error.message, [{ text: 'OK' }]);
  }, []);

  const handleAction = useCallback((actionType: string, parameters?: any) => {
    console.log('Action detected:', actionType, parameters);
    
    // Handle navigation actions
    if (actionType === 'navigate' && parameters?.screen) {
      if (onNavigate) {
        onNavigate(parameters.screen, parameters);
      } else {
        // Fallback to React Navigation
        navigation.navigate(parameters.screen as never, parameters as never);
      }
      
      // Close chat after navigation
      setChatVisible(false);
    }
    
    // Handle other actions
    if (onActionExecute) {
      onActionExecute(actionType, parameters);
    }
    
    // Handle specific actions
    switch (actionType) {
      case 'startRecording':
        // Trigger recording start
        Alert.alert('Recording', 'Starting audio recording...', [{ text: 'OK' }]);
        break;
      
      case 'stopRecording':
        // Trigger recording stop
        Alert.alert('Recording', 'Stopping audio recording...', [{ text: 'OK' }]);
        break;
      
      case 'startPomodoro':
        // Start Pomodoro timer
        Alert.alert('Pomodoro', 'Starting Pomodoro timer...', [{ text: 'OK' }]);
        break;
    }
  }, [navigation, onNavigate, onActionExecute]);

  const handleFloatingButtonPress = () => {
    if (chatVisible) {
      // If chat is open, start listening
      teddManager.startActiveListening();
    } else {
      // Open chat
      setChatVisible(true);
    }
  };

  const handleFloatingButtonLongPress = () => {
    // Quick action: start listening without opening chat
    teddManager.startActiveListening();
  };

  const handleSendMessage = (text: string) => {
    teddManager.sendTextMessage(text);
  };

  const handleStartListening = () => {
    teddManager.startActiveListening();
  };

  const handleStopListening = async () => {
    await teddManager.stopSpeaking();
    await teddManager.startWakeWordDetection();
  };

  const handleStopSpeaking = () => {
    teddManager.stopSpeaking();
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
            await teddManager.clearConversation();
            setMessages([]);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Floating Button */}
      <TeddFloatingButton
        state={teddState}
        onPress={handleFloatingButtonPress}
        onLongPress={handleFloatingButtonLongPress}
      />

      {/* Chat Interface Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChatVisible(false)}
      >
        <TeddChatInterface
          visible={chatVisible}
          messages={messages}
          state={teddState}
          interimTranscript={interimTranscript}
          onClose={() => setChatVisible(false)}
          onSendMessage={handleSendMessage}
          onStartListening={handleStartListening}
          onStopListening={handleStopListening}
          onStopSpeaking={handleStopSpeaking}
          onClearHistory={handleClearHistory}
        />
      </Modal>
      {/* Permission Prompt Modal */}
      <TeddPermissionPrompt
        visible={permissionPromptVisible}
        onClose={() => setPermissionPromptVisible(false)}
        onPermissionGranted={() => {
          console.log('Permission granted!');
          setPermissionPromptVisible(false);
          // Restart wake word detection
          teddManager.startWakeWordDetection().catch(console.error);
        }}
        onPermissionDenied={(message) => {
          console.log('Permission denied:', message);
          // User can still use text input
        }}
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