// screens/ShareNotesScreen.js
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import BackButton from '../components/Backbutton';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  query,
  where,
  orderBy 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function SellNotesScreen() {
  const [mode, setMode] = useState('selection'); // selection, share, receive
  const [notes, setNotes] = useState([]);
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [shareCode, setShareCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [receivedNotes, setReceivedNotes] = useState([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [sessionListener, setSessionListener] = useState(null);
  const { theme, colors } = useTheme();

  const db = getFirestore();
  const auth = getAuth();

  useEffect(() => {
    fetchUserNotes();
    
    return () => {
      // Cleanup listener on unmount
      if (sessionListener) {
        sessionListener();
      }
    };
  }, []);

  const fetchUserNotes = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'Please sign in to continue');
        setLoading(false);
        return;
      }

      console.log("📚 Fetching recordings for user:", currentUser.uid);

      // Query recordings collection - matching your structure
      const recordingsRef = collection(db, "recordings");
      const q = query(
        recordingsRef,
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log("⚠️ No recordings found");
        setNotes([]);
        setLoading(false);
        return;
      }

      const fetchedNotes = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate() || new Date();
        
        // Only include recordings that have organized notes
        if (data.organizedNotes) {
          fetchedNotes.push({
            id: docSnap.id,
            title: data.organizedNotes.title || data.title || "Untitled Lecture",
            subject: data.organizedNotes.subject || "General",
            date: createdAt.toLocaleDateString(),
            pages: data.organizedNotes.keyPoints?.length || 0,
            price: calculateNotePrice(data.organizedNotes),
            duration: data.duration ? Math.round(data.duration / 60) : 0,
            transcription: data.transcription || "",
            organizedNotes: data.organizedNotes,
            createdAt: createdAt,
          });
        }
      });

      console.log(`✅ Loaded ${fetchedNotes.length} notes with organized content`);
      setNotes(fetchedNotes);
      
    } catch (error) {
      console.error('❌ Error fetching notes:', error);
      Alert.alert('Error', 'Failed to load notes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate price based on note content and quality
  const calculateNotePrice = (organizedNotes) => {
    let basePrice = 20; // Base price in KES
    
    // Add value based on content
    if (organizedNotes.keyPoints?.length > 0) {
      basePrice += organizedNotes.keyPoints.length * 10;
    }
    
    if (organizedNotes.summary?.length > 200) {
      basePrice += 50;
    }
    
    if (organizedNotes.examples?.length > 0) {
      basePrice += organizedNotes.examples.length * 30;
    }

    // Round to nearest 50
    return Math.round(basePrice / 50) * 50;
  };

  const toggleNoteSelection = (noteId) => {
    setSelectedNotes(prev => {
      if (prev.includes(noteId)) {
        return prev.filter(id => id !== noteId);
      }
      return [...prev, noteId];
    });
  };

  const calculateTotalPrice = () => {
    const total = notes
      .filter(note => selectedNotes.includes(note.id))
      .reduce((sum, note) => sum + (note.price || 0), 0);
    setTotalPrice(total);
  };

  const generateShareCode = () => {
    if (selectedNotes.length === 0) {
      Alert.alert('No Notes Selected', 'Please select at least one note to share');
      return;
    }

    calculateTotalPrice();
    setShowPriceModal(true);
  };

  const createShareSession = async () => {
    setShowPriceModal(false);
    setLoading(true);
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'Please sign in to continue');
        return;
      }

      // Generate 6-character alphanumeric code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const selectedNotesData = notes.filter(note => selectedNotes.includes(note.id));
      
      // Prepare notes data for sharing (remove unnecessary fields)
      const notesToShare = selectedNotesData.map(note => ({
        id: note.id,
        title: note.title,
        subject: note.subject,
        date: note.date,
        price: note.price,
        duration: note.duration,
        organizedNotes: note.organizedNotes,
        transcription: note.transcription,
      }));

      console.log("🔐 Creating share session with code:", code);
      
      // Create share session in Firestore
      const sessionRef = doc(db, 'shareSessions', code);
      await setDoc(sessionRef, {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || currentUser.email || 'Anonymous',
        notes: notesToShare,
        noteIds: selectedNotes,
        totalPrice: totalPrice,
        status: 'waiting',
        receiverId: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
      });

      console.log("✅ Share session created successfully");

      setShareCode(code);
      setMode('share');
      setConnectionStatus('waiting');
      
      // Start listening for connection
      listenForConnection(code);
    } catch (error) {
      console.error('❌ Error creating share session:', error);
      Alert.alert('Error', 'Failed to generate share code: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const listenForConnection = (code) => {
    console.log("👂 Listening for connections on code:", code);
    const sessionRef = doc(db, 'shareSessions', code);
    
    const unsubscribe = onSnapshot(sessionRef, async (docSnapshot) => {
      if (!docSnapshot.exists()) {
        console.log("❌ Session expired or deleted");
        Alert.alert('Session Expired', 'This share session has expired');
        resetScreen();
        return;
      }

      const data = docSnapshot.data();
      console.log("📡 Session status:", data.status);
      
      // Check if receiver connected
      if (data.receiverId && data.status === 'connected') {
        console.log("✅ Receiver connected!");
        setConnectionStatus('connected');
        
        // Start transfer after 1 second
        setTimeout(async () => {
          setConnectionStatus('transferring');
          console.log("📤 Starting transfer...");
          
          // Update session status
          await updateDoc(sessionRef, { status: 'transferring' });
          
          // Complete transfer after 2 seconds
          setTimeout(async () => {
            await completeTransfer(code, true);
          }, 2000);
        }, 1000);
      }
    }, (error) => {
      console.error("❌ Listener error:", error);
    });

    setSessionListener(() => unsubscribe);
  };

  const joinSession = async () => {
    if (!inputCode.trim() || inputCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-character code');
      return;
    }

    setLoading(true);
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'Please sign in to continue');
        setLoading(false);
        return;
      }

      console.log("🔍 Attempting to join session:", inputCode.toUpperCase());

      const sessionRef = doc(db, 'shareSessions', inputCode.toUpperCase());
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        Alert.alert('Invalid Code', 'Share session not found or has expired');
        setLoading(false);
        return;
      }

      const sessionData = sessionDoc.data();
      
      // Check if session is still active
      if (new Date() > sessionData.expiresAt.toDate()) {
        Alert.alert('Session Expired', 'This share code has expired');
        await deleteDoc(sessionRef);
        setLoading(false);
        return;
      }

      if (sessionData.hostId === currentUser.uid) {
        Alert.alert('Error', 'You cannot receive notes from yourself');
        setLoading(false);
        return;
      }

      console.log("✅ Valid session found, connecting...");

      // Update session with receiver info
      await updateDoc(sessionRef, { 
        receiverId: currentUser.uid,
        receiverName: currentUser.displayName || currentUser.email || 'Anonymous',
        status: 'connected' 
      });

      setReceivedNotes(sessionData.notes);
      setTotalPrice(sessionData.totalPrice);
      setMode('receive');
      setConnectionStatus('connected');
      
      // Listen for transfer completion
      const unsubscribe = onSnapshot(sessionRef, async (docSnapshot) => {
        if (!docSnapshot.exists()) return;
        
        const data = docSnapshot.data();
        console.log("📡 Receiver - Session status:", data.status);
        
        if (data.status === 'transferring') {
          setConnectionStatus('transferring');
        } else if (data.status === 'completed') {
          await completeTransfer(inputCode.toUpperCase(), false);
        }
      });
      
      setSessionListener(() => unsubscribe);
    } catch (error) {
      console.error('❌ Error joining session:', error);
      Alert.alert('Error', 'Failed to join session: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const completeTransfer = async (code, isHost) => {
    try {
      console.log(`📥 Completing transfer... (${isHost ? 'Host' : 'Receiver'})`);
      
      const sessionRef = doc(db, 'shareSessions', code);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        console.log("⚠️ Session already deleted");
        return;
      }
      
      const sessionData = sessionDoc.data();
      const currentUser = auth.currentUser;
      
      if (!isHost) {
        // Save received notes to receiver's recordings collection
        console.log("💾 Saving received notes to receiver's collection...");
        
        for (const note of sessionData.notes) {
          const newNoteRef = doc(collection(db, 'recordings'));
          await setDoc(newNoteRef, {
            userId: currentUser.uid,
            title: note.title,
            transcription: note.transcription || "",
            organizedNotes: {
              ...note.organizedNotes,
              receivedFrom: sessionData.hostName,
              originalOwnerId: sessionData.hostId,
            },
            duration: note.duration || 0,
            createdAt: new Date(),
            receivedAt: new Date(),
            receivedFrom: sessionData.hostId,
            paidAmount: note.price,
            isReceived: true,
          });
        }

        console.log("✅ Notes saved to receiver's collection");

        // Log transaction
        await setDoc(doc(collection(db, 'transactions')), {
          type: 'note_purchase',
          buyerId: currentUser.uid,
          buyerName: currentUser.displayName || currentUser.email,
          sellerId: sessionData.hostId,
          sellerName: sessionData.hostName,
          noteIds: sessionData.noteIds,
          noteCount: sessionData.notes.length,
          amount: sessionData.totalPrice,
          timestamp: new Date(),
        });
      } else {
        // Update host's earnings
        console.log("💰 Logging sale transaction for host...");
        
        await setDoc(doc(collection(db, 'transactions')), {
          type: 'note_sale',
          sellerId: currentUser.uid,
          sellerName: currentUser.displayName || currentUser.email,
          buyerId: sessionData.receiverId,
          buyerName: sessionData.receiverName,
          noteIds: sessionData.noteIds,
          noteCount: sessionData.notes.length,
          amount: sessionData.totalPrice,
          timestamp: new Date(),
        });
      }
      
      // Mark session as completed
      await updateDoc(sessionRef, { status: 'completed' });
      
      // Delete session after brief delay
      setTimeout(async () => {
        try {
          await deleteDoc(sessionRef);
          console.log("🗑️ Session deleted");
        } catch (err) {
          console.log("Session already deleted");
        }
      }, 3000);
      
      // Cleanup listener
      if (sessionListener) {
        sessionListener();
      }
      
      console.log("✅ Transfer completed successfully!");
      
      Alert.alert(
        'Success!', 
        isHost 
          ? `Notes shared successfully!\n\nYou earned: KES ${totalPrice}\nNotes shared: ${selectedNotes.length}` 
          : `${receivedNotes.length} note${receivedNotes.length > 1 ? 's' : ''} received successfully!\n\nTotal paid: KES ${totalPrice}\n\nCheck your Notes screen to view them!`,
        [{ text: 'OK', onPress: resetScreen }]
      );
    } catch (error) {
      console.error('❌ Error completing transfer:', error);
      Alert.alert('Error', 'Transfer issue: ' + error.message);
      resetScreen();
    }
  };

  const resetScreen = () => {
    setMode('selection');
    setSelectedNotes([]);
    setShareCode('');
    setInputCode('');
    setConnectionStatus('idle');
    setReceivedNotes([]);
    setTotalPrice(0);
    
    if (sessionListener) {
      sessionListener();
      setSessionListener(null);
    }

    // Refresh notes list
    fetchUserNotes();
  };

  const cancelShareSession = async () => {
    if (shareCode) {
      try {
        await deleteDoc(doc(db, 'shareSessions', shareCode));
        console.log("❌ Session cancelled by host");
      } catch (error) {
        console.error('Error canceling session:', error);
      }
    }
    resetScreen();
  };

  const renderNoteItem = ({ item }) => {
    const isSelected = selectedNotes.includes(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.noteCard, isSelected && styles.noteCardSelected]}
        onPress={() => toggleNoteSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.noteHeader}>
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <MaterialIcons name="check" size={18} color="#fff" />}
            </View>
          </View>
          <View style={styles.noteInfo}>
            <Text style={styles.noteTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.noteSubject}>{item.subject}</Text>
          </View>
        </View>
        <View style={styles.noteFooter}>
          <View style={styles.noteDetails}>
            <MaterialIcons name="list" size={16} color="#6b7280" />
            <Text style={styles.noteDetailText}>
              {item.pages} points
            </Text>
          </View>
          <View style={styles.noteDetails}>
            <MaterialIcons name="access-time" size={16} color="#6b7280" />
            <Text style={styles.noteDetailText}>
              {item.duration} min
            </Text>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>KES {item.price}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderReceivedNote = ({ item }) => (
    <View style={styles.receivedNoteCard}>
      <MaterialIcons name="description" size={40} color="#7c3aed" />
      <View style={styles.receivedNoteInfo}>
        <Text style={styles.receivedNoteTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.receivedNoteSubject}>{item.subject}</Text>
        <Text style={styles.receivedNotePages}>
          {item.duration} min lecture
        </Text>
      </View>
      <Text style={styles.receivedNotePrice}>KES {item.price}</Text>
    </View>
  );

  // Loading State
  if (loading && notes.length === 0 && mode === 'selection') {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading your notes...</Text>
      </View>
    );
  }

  // Selection Mode
  if (mode === 'selection') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <MaterialIcons name="share" size={32} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Share Notes</Text>
          <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>Select notes to share and earn money</Text>
        </View>
        <BackButton />

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.shareButton]}
            onPress={generateShareCode}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
              Share ({selectedNotes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.receiveButton]}
            onPress={() => setMode('receive')}
          >
            <MaterialIcons name="input" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>
              Receive Notes
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteItem}
          contentContainerStyle={styles.notesList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="note" size={64} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>No notes available to share</Text>
              <Text style={[styles.emptySubtext, { color: colors.subtext }]}>Record and organize lectures first to share them</Text>
            </View>
          }
        />

        {/* Price Confirmation Modal */}
        <Modal
          visible={showPriceModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPriceModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <MaterialIcons name="attach-money" size={48} color={colors.primary} />
              <Text style={styles.modalTitle}>Confirm Share</Text>
              <Text style={styles.modalText}>
                You're about to share {selectedNotes.length} note{selectedNotes.length > 1 ? 's' : ''}
              </Text>
              <View style={styles.priceDisplay}>
                <Text style={styles.priceDisplayLabel}>Total Value:</Text>
                <Text style={styles.priceDisplayAmount}>KES {totalPrice}</Text>
              </View>
              <Text style={[styles.modalInfo, { color: colors.subtext }] }>
                The receiver will see this price when they connect
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowPriceModal(false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={createShareSession}
                >
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                    Generate Code
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Share Mode - Showing Code
  if (mode === 'share') {
    return (
        <View style={[styles.container, { backgroundColor: colors.background }] }>
        <TouchableOpacity style={styles.backButton} onPress={cancelShareSession}>
          <MaterialIcons name="close" size={24} color={colors.error} />
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.centerContainer}>
          <View style={styles.statusContainer}>
            {connectionStatus === 'waiting' && (
              <>
                <View style={styles.pulseContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
                <Text style={[styles.statusTitle, { color: colors.text }]}>Waiting for Connection</Text>
                <Text style={[styles.statusSubtitle, { color: colors.subtext }]}>Share this code with the receiver</Text>
                
                <View style={styles.codeDisplay}>
                  <Text style={styles.codeText}>{shareCode}</Text>
                </View>
                
                <View style={styles.shareInfoContainer}>
                  <View style={styles.shareInfoRow}>
                      <MaterialIcons name="description" size={20} color={colors.subtext} />
                      <Text style={[styles.shareInfo, { color: colors.subtext }]}>
                        {selectedNotes.length} note{selectedNotes.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.shareInfoRow}>
                      <MaterialIcons name="attach-money" size={20} color={colors.success} />
                      <Text style={[styles.sharePrice, { color: colors.text }]}>KES {totalPrice}</Text>
                    </View>
                </View>

                <Text style={styles.expiryText}>
                  Code expires in 15 minutes
                </Text>
              </>
            )}

            {connectionStatus === 'connected' && (
              <>
                <MaterialIcons name="link" size={80} color="#10b981" />
                <Text style={styles.statusTitle}>Connected!</Text>
                <Text style={styles.statusSubtitle}>
                  Device connected. Preparing transfer...
                </Text>
              </>
            )}

            {connectionStatus === 'transferring' && (
              <>
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text style={styles.statusTitle}>Transferring Notes</Text>
                <Text style={styles.statusSubtitle}>
                  Securely transferring {selectedNotes.length} note{selectedNotes.length > 1 ? 's' : ''}...
                </Text>
                <View style={styles.progressBar}>
                  <View style={styles.progressFill} />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // Receive Mode
  if (mode === 'receive') {
    if (connectionStatus === 'idle') {
      return (
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={resetScreen}>
            <MaterialIcons name="arrow-back" size={24} color="#7c3aed" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.centerContainer}>
            <MaterialIcons name="qr-code-scanner" size={80} color="#7c3aed" />
            <Text style={styles.receiveTitle}>Receive Notes</Text>
            <Text style={styles.receiveSubtitle}>
              Enter the 6-character code from the sender
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="Enter code (e.g., ABC123)"
              value={inputCode}
              onChangeText={(text) => setInputCode(text.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholderTextColor="#9ca3af"
            />

            <TouchableOpacity 
              style={[
                styles.joinButton,
                (!inputCode || inputCode.length !== 6 || loading) && styles.joinButtonDisabled
              ]}
              onPress={joinSession}
              disabled={!inputCode || inputCode.length !== 6 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="input" size={20} color="#fff" />
                  <Text style={styles.joinButtonText}>Join Session</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color="#7c3aed" />
              <Text style={styles.infoText}>
                You'll see the price before confirming the transfer
              </Text>
            </View>
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.centerContainer}>
          {connectionStatus === 'connected' && (
            <View style={styles.statusContainer}>
              <MaterialIcons name="check-circle" size={80} color="#10b981" />
              <Text style={styles.statusTitle}>Connected!</Text>
              <Text style={styles.statusSubtitle}>
                Receiving notes from sender...
              </Text>
            </View>
          )}

          {connectionStatus === 'transferring' && (
            <View style={styles.receivedNotesContainer}>
              <View style={styles.receivedHeader}>
                <ActivityIndicator size="small" color="#7c3aed" />
                <Text style={styles.receivedTitle}>Receiving Notes</Text>
              </View>
              
              <FlatList
                data={receivedNotes}
                keyExtractor={(item, index) => `${item.id}_${index}`}
                renderItem={renderReceivedNote}
                scrollEnabled={false}
                ListFooterComponent={
                  <View style={styles.totalContainer}>
                    <Text style={styles.totalLabel}>Total Amount:</Text>
                    <Text style={styles.totalAmount}>KES {totalPrice}</Text>
                  </View>
                }
              />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  shareButton: {
    backgroundColor: '#7c3aed',
  },
  receiveButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#7c3aed',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  notesList: {
    padding: 16,
    paddingBottom: 32,
  },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  noteCardSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
    elevation: 3,
  },
  noteHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  checkboxContainer: {
    marginRight: 12,
    paddingTop: 2,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  noteInfo: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 22,
  },
  noteSubject: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  noteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteDetailText: {
    fontSize: 13,
    color: '#6b7280',
  },
  priceTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 16,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  cancelText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  statusContainer: {
    alignItems: 'center',
    gap: 20,
    width: '100%',
  },
  pulseContainer: {
    marginBottom: 10,
  },
  statusTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  codeDisplay: {
    backgroundColor: '#7c3aed',
    paddingVertical: 28,
    paddingHorizontal: 50,
    borderRadius: 20,
    marginVertical: 24,
    elevation: 8,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  codeText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 10,
    fontFamily: 'monospace',
  },
  shareInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  shareInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareInfo: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '500',
  },
  sharePrice: {
fontSize: 20,
fontWeight: '700',
color: '#15803d',
},
expiryText: {
fontSize: 13,
color: '#ef4444',
marginTop: 8,
fontWeight: '500',
},
progressBar: {
width: '80%',
height: 6,
backgroundColor: '#e5e7eb',
borderRadius: 3,
overflow: 'hidden',
marginTop: 16,
},
progressFill: {
height: '100%',
backgroundColor: '#7c3aed',
width: '70%',
},
receiveTitle: {
fontSize: 28,
fontWeight: 'bold',
color: '#111827',
marginTop: 20,
},
receiveSubtitle: {
fontSize: 16,
color: '#6b7280',
marginTop: 10,
marginBottom: 40,
textAlign: 'center',
paddingHorizontal: 20,
},
codeInput: {
width: '100%',
backgroundColor: '#fff',
borderWidth: 2,
borderColor: '#d1d5db',
borderRadius: 16,
padding: 20,
fontSize: 28,
fontWeight: 'bold',
textAlign: 'center',
letterSpacing: 6,
marginBottom: 28,
fontFamily: 'monospace',
elevation: 2,
shadowColor: '#000',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.1,
shadowRadius: 3,
},
joinButton: {
backgroundColor: '#7c3aed',
paddingVertical: 18,
paddingHorizontal: 60,
borderRadius: 16,
flexDirection: 'row',
alignItems: 'center',
gap: 10,
elevation: 4,
shadowColor: '#7c3aed',
shadowOffset: { width: 0, height: 4 },
shadowOpacity: 0.3,
shadowRadius: 6,
},
joinButtonDisabled: {
backgroundColor: '#9ca3af',
elevation: 0,
},
joinButtonText: {
fontSize: 18,
fontWeight: '600',
color: '#fff',
},
infoBox: {
flexDirection: 'row',
alignItems: 'center',
backgroundColor: '#ede9fe',
padding: 16,
borderRadius: 12,
marginTop: 32,
gap: 12,
},
infoText: {
flex: 1,
fontSize: 14,
color: '#5b21b6',
lineHeight: 20,
},
receivedNotesContainer: {
width: '100%',
padding: 20,
},
receivedHeader: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 12,
marginBottom: 24,
},
receivedTitle: {
fontSize: 22,
fontWeight: 'bold',
color: '#111827',
},
receivedNoteCard: {
flexDirection: 'row',
backgroundColor: '#fff',
borderRadius: 16,
padding: 16,
marginBottom: 12,
alignItems: 'center',
gap: 12,
borderWidth: 1,
borderColor: '#e5e7eb',
elevation: 2,
shadowColor: '#000',
shadowOffset: { width: 0, height: 1 },
shadowOpacity: 0.1,
shadowRadius: 2,
},
receivedNoteInfo: {
flex: 1,
},
receivedNoteTitle: {
fontSize: 16,
fontWeight: '600',
color: '#111827',
marginBottom: 4,
},
receivedNoteSubject: {
fontSize: 14,
color: '#6b7280',
marginBottom: 4,
},
receivedNotePages: {
fontSize: 12,
color: '#9ca3af',
},
receivedNotePrice: {
fontSize: 17,
fontWeight: '700',
color: '#15803d',
},
totalContainer: {
backgroundColor: '#f3f4f6',
padding: 20,
borderRadius: 12,
marginTop: 12,
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
},
totalLabel: {
fontSize: 18,
fontWeight: '600',
color: '#374151',
},
totalAmount: {
fontSize: 24,
fontWeight: 'bold',
color: '#15803d',
},
modalOverlay: {
flex: 1,
backgroundColor: 'rgba(0, 0, 0, 0.6)',
justifyContent: 'center',
alignItems: 'center',
padding: 20,
},
modalContent: {
backgroundColor: '#fff',
borderRadius: 24,
padding: 28,
width: '100%',
maxWidth: 400,
alignItems: 'center',
elevation: 10,
shadowColor: '#000',
shadowOffset: { width: 0, height: 10 },
shadowOpacity: 0.3,
shadowRadius: 20,
},
modalTitle: {
fontSize: 24,
fontWeight: 'bold',
color: '#111827',
marginTop: 12,
marginBottom: 8,
},
modalText: {
fontSize: 16,
color: '#6b7280',
marginBottom: 24,
textAlign: 'center',
},
priceDisplay: {
backgroundColor: '#f3f4f6',
padding: 24,
borderRadius: 16,
alignItems: 'center',
marginBottom: 16,
width: '100%',
},
priceDisplayLabel: {
fontSize: 14,
color: '#6b7280',
marginBottom: 6,
fontWeight: '500',
},
priceDisplayAmount: {
fontSize: 36,
fontWeight: 'bold',
color: '#15803d',
},
modalInfo: {
fontSize: 13,
color: '#9ca3af',
textAlign: 'center',
marginBottom: 24,
},
modalButtons: {
flexDirection: 'row',
gap: 12,
width: '100%',
},
modalButton: {
flex: 1,
paddingVertical: 14,
borderRadius: 12,
alignItems: 'center',
elevation: 2,
shadowColor: '#000',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.1,
shadowRadius: 3,
},
modalButtonCancel: {
backgroundColor: '#f3f4f6',
},
modalButtonConfirm: {
backgroundColor: '#7c3aed',
},
modalButtonText: {
fontSize: 16,
fontWeight: '600',
color: '#111827',
},
});