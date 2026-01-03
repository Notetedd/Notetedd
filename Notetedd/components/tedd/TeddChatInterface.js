import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TeddChatInterface = ({
  visible,
  messages,
  state,
  interimTranscript,
  onClose,
  onSendMessage,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  onClearHistory,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, interimTranscript]);

  if (!visible) return null;

  const handleSend = () => {
    if (inputText.trim().length > 0) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleMicPress = () => {
    if (state === 'listening') {
      onStopListening();
    } else {
      onStartListening();
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusIndicator,
              state === 'listening' && styles.statusListening,
              state === 'speaking' && styles.statusSpeaking,
              state === 'processing' && styles.statusProcessing,
            ]}
          />
          <View>
            <Text style={styles.headerTitle}>Tedd</Text>
            <Text style={styles.headerSubtitle}>
              {state === 'listening'
                ? 'Listening...'
                : state === 'speaking'
                ? 'Speaking...'
                : state === 'processing'
                ? 'Thinking...'
                : state === 'wake-word-detection'
                ? 'Say "Hey Tedd"'
                : 'Your AI Study Assistant'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {state === 'speaking' && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onStopSpeaking}
            >
              <Ionicons name="stop-circle-outline" size={24} color="#666" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClearHistory}
          >
            <Ionicons name="trash-outline" size={24} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={64}
              color="#ccc"
            />
            <Text style={styles.emptyStateTitle}>
              Start a conversation with Tedd
            </Text>
            <Text style={styles.emptyStateText}>
              Say "Hey Tedd" or tap the microphone to begin
            </Text>
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageContainer,
              message.role === 'user'
                ? styles.userMessageContainer
                : styles.assistantMessageContainer,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                message.role === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user'
                    ? styles.userMessageText
                    : styles.assistantMessageText,
                ]}
              >
                {message.content}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  message.role === 'user'
                    ? styles.userMessageTime
                    : styles.assistantMessageTime,
                ]}
              >
                {formatTime(message.timestamp)}
              </Text>
            </View>
          </View>
        ))}

        {/* Interim transcript */}
        {interimTranscript && interimTranscript.length > 0 && (
          <View style={[styles.messageContainer, styles.userMessageContainer]}>
            <View
              style={[
                styles.messageBubble,
                styles.userBubble,
                styles.interimBubble,
              ]}
            >
              <Text style={[styles.messageText, styles.userMessageText]}>
                {interimTranscript}
              </Text>
            </View>
          </View>
        )}

        {/* Typing indicator */}
        {state === 'processing' && (
          <View
            style={[styles.messageContainer, styles.assistantMessageContainer]}
          >
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <ActivityIndicator size="small" color="#6200EE" />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          {state === 'listening' && (
            <View style={styles.voiceVisualizer}>
              <View style={[styles.voiceBar, styles.voiceBar1]} />
              <View style={[styles.voiceBar, styles.voiceBar2]} />
              <View style={[styles.voiceBar, styles.voiceBar3]} />
              <View style={[styles.voiceBar, styles.voiceBar4]} />
              <View style={[styles.voiceBar, styles.voiceBar5]} />
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
              editable={state !== 'listening' && state !== 'processing'}
            />

            <TouchableOpacity
              style={[
                styles.micButton,
                state === 'listening' && styles.micButtonActive,
              ]}
              onPress={handleMicPress}
              disabled={state === 'processing'}
            >
              <Ionicons
                name={state === 'listening' ? 'stop' : 'mic'}
                size={24}
                color={state === 'listening' ? '#fff' : '#6200EE'}
              />
            </TouchableOpacity>

            {inputText.trim().length > 0 && (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSend}
                disabled={state === 'processing'}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ccc',
  },
  statusListening: { backgroundColor: '#4CAF50' },
  statusSpeaking: { backgroundColor: '#2196F3' },
  statusProcessing: { backgroundColor: '#FF9800' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8 },
  messagesContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  messagesContent: { padding: 16, flexGrow: 1 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyStateText: { fontSize: 14, color: '#666', marginTop: 8 },
  messageContainer: { marginBottom: 12, maxWidth: '80%' },
  userMessageContainer: { alignSelf: 'flex-end' },
  assistantMessageContainer: { alignSelf: 'flex-start' },
  messageBubble: { padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: '#6200EE', borderBottomRightRadius: 4 },
  assistantBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    elevation: 2,
  },
  interimBubble: { opacity: 0.6 },
  messageText: { fontSize: 16, lineHeight: 22 },
  userMessageText: { color: '#fff' },
  assistantMessageText: { color: '#333' },
  messageTime: { fontSize: 11, marginTop: 4 },
  userMessageTime: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  assistantMessageTime: { color: '#999' },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 12,
  },
  voiceVisualizer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  voiceBar: { width: 4, backgroundColor: '#4CAF50', borderRadius: 2 },
  voiceBar1: { height: 20 },
  voiceBar2: { height: 30 },
  voiceBar3: { height: 40 },
  voiceBar4: { height: 30 },
  voiceBar5: { height: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: { backgroundColor: '#4CAF50' },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6200EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default TeddChatInterface;
