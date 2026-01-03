import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  query, 
  orderBy, 
  limit,
  where,
  Timestamp,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { firestore } from '../../../firebaseConfig'; 

class TeddFirebaseService {
  constructor() {
    this.conversationsCollection = 'tedd_conversations';
    this.voiceRecordingsCollection = 'tedd_voice_recordings';
    this.voicePreferencesCollection = 'tedd_voice_preferences';
  }

  // Save conversation session
  async saveConversation(userId, messages, sessionId) {
    try {
      const conversationId = sessionId || this.generateSessionId();
      const conversationRef = doc(
        firestore, 
        this.conversationsCollection, 
        conversationId
      );

      const conversationData = {
        id: conversationId,
        userId,
        messages: messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
        })),
        startTime: messages[0]?.timestamp || new Date(),
        lastUpdated: new Date(),
        messageCount: messages.length,
      };

      await setDoc(conversationRef, {
        ...conversationData,
        startTime: Timestamp.fromDate(conversationData.startTime),
        lastUpdated: Timestamp.fromDate(conversationData.lastUpdated),
        messages: conversationData.messages.map(msg => ({
          ...msg,
          timestamp: Timestamp.fromDate(msg.timestamp),
        })),
      });

      return conversationId;
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }

  // Load conversation session
  async loadConversation(conversationId) {
    try {
      const conversationRef = doc(
        firestore, 
        this.conversationsCollection, 
        conversationId
      );
      const conversationSnap = await getDoc(conversationRef);

      if (!conversationSnap.exists()) {
        return null;
      }

      const data = conversationSnap.data();
      return {
        ...data,
        startTime: data.startTime.toDate(),
        lastUpdated: data.lastUpdated.toDate(),
        messages: data.messages.map((msg) => ({
          ...msg,
          timestamp: msg.timestamp.toDate(),
        })),
      };
    } catch (error) {
      console.error('Error loading conversation:', error);
      throw error;
    }
  }

  // Get user's recent conversations
  async getUserConversations(userId, limitCount = 10) {
    try {
      const conversationsRef = collection(firestore, this.conversationsCollection);
      const q = query(
        conversationsRef,
        where('userId', '==', userId),
        orderBy('lastUpdated', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const conversations = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push({
          ...data,
          startTime: data.startTime.toDate(),
          lastUpdated: data.lastUpdated.toDate(),
          messages: data.messages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp.toDate(),
          })),
        });
      });

      return conversations;
    } catch (error) {
      console.error('Error getting user conversations:', error);
      throw error;
    }
  }

  // Delete conversation
  async deleteConversation(conversationId) {
    try {
      const conversationRef = doc(
        firestore, 
        this.conversationsCollection, 
        conversationId
      );
      await deleteDoc(conversationRef);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  }

  // Save voice recording (if user opts in)
  async saveVoiceRecording(recording) {
    try {
      const recordingId = this.generateId();
      const recordingRef = doc(
        firestore, 
        this.voiceRecordingsCollection, 
        recordingId
      );

      await setDoc(recordingRef, {
        ...recording,
        id: recordingId,
        timestamp: Timestamp.fromDate(recording.timestamp),
      });

      return recordingId;
    } catch (error) {
      console.error('Error saving voice recording:', error);
      throw error;
    }
  }

  // Get user's voice preferences
  async getVoicePreferences(userId) {
    try {
      const prefsRef = doc(
        firestore, 
        this.voicePreferencesCollection, 
        userId
      );
      const prefsSnap = await getDoc(prefsRef);

      if (!prefsSnap.exists()) {
        return null;
      }

      return prefsSnap.data();
    } catch (error) {
      console.error('Error getting voice preferences:', error);
      throw error;
    }
  }

  // Save user's voice preferences
  async saveVoicePreferences(preferences) {
    try {
      const prefsRef = doc(
        firestore, 
        this.voicePreferencesCollection, 
        preferences.userId
      );

      await setDoc(prefsRef, preferences, { merge: true });
    } catch (error) {
      console.error('Error saving voice preferences:', error);
      throw error;
    }
  }

  // Update opt-in status for voice recording
  async updateRecordingOptIn(userId, optIn) {
    try {
      const prefsRef = doc(
        firestore, 
        this.voicePreferencesCollection, 
        userId
      );

      await updateDoc(prefsRef, {
        optInRecording: optIn,
      });
    } catch (error) {
      console.error('Error updating recording opt-in:', error);
      throw error;
    }
  }

  // Add single message to existing conversation
  async addMessageToConversation(conversationId, message) {
    try {
      const conversation = await this.loadConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      conversation.messages.push(message);
      conversation.lastUpdated = new Date();
      conversation.messageCount = conversation.messages.length;

      await this.saveConversation(
        conversation.userId,
        conversation.messages,
        conversationId
      );
    } catch (error) {
      console.error('Error adding message to conversation:', error);
      throw error;
    }
  }

  // Get conversation statistics
  async getConversationStats(userId) {
    try {
      const conversations = await this.getUserConversations(userId, 100);
      
      const totalConversations = conversations.length;
      const totalMessages = conversations.reduce(
        (sum, conv) => sum + conv.messageCount, 
        0
      );
      const averageMessagesPerConversation = totalConversations > 0 
        ? totalMessages / totalConversations 
        : 0;

      return {
        totalConversations,
        totalMessages,
        averageMessagesPerConversation: Math.round(averageMessagesPerConversation),
      };
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      throw error;
    }
  }

  // Helper: Generate session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper: Generate unique ID
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clear all user conversations (for privacy/testing)
  async clearUserConversations(userId) {
    try {
      const conversations = await this.getUserConversations(userId, 1000);
      
      const deletePromises = conversations.map(conv => 
        this.deleteConversation(conv.id)
      );
      
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Error clearing user conversations:', error);
      throw error;
    }
  }
}

export default new TeddFirebaseService();