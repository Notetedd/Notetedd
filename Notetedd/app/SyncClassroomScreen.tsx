// screens/SyncClassroomScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Image,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from './context/ThemeContext';
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";
import BackButton from "../components/Backbutton";

// Firebase imports
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = "378006316872-gn2he51al2pbfbtm20ukr2550imnso3a.apps.googleusercontent.com";
const GOOGLE_REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'myapp',
  path: 'redirect'
});

// Google Classroom API Scopes
const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.course-work-materials.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

WebBrowser.maybeCompleteAuthSession();

export default function SyncClassroomScreen({ navigation }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [processingProgress, setProcessingProgress] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [showRedirectInfo, setShowRedirectInfo] = useState(false);

  const { theme, colors } = useTheme();

  // Gemini API Configuration
  const GEMINI_API_KEY = "AIzaSyCZVQqMteS8jSA_cAYOUS0XxzwHxzgIaNI";
  const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  // OAuth Discovery and Request
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: CLASSROOM_SCOPES,
      redirectUri: GOOGLE_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );

  // Handle OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      setAccessToken(access_token);
      setIsAuthenticated(true);
      fetchUserProfile(access_token);
      fetchCourses(access_token);
    } else if (response?.type === 'error') {
      Alert.alert('Authentication Error', 'Failed to authenticate with Google Classroom');
    }
  }, [response]);

  // Fetch user profile
  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setUserEmail(data.email);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  // Fetch Google Classroom courses
  const fetchCourses = async (token) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch courses');
      }

      const data = await response.json();
      const activeCourses = data.courses || [];
      
      console.log(`📚 Found ${activeCourses.length} active courses`);
      setCourses(activeCourses);
      
      if (activeCourses.length > 0) {
        setShowCourseModal(true);
      } else {
        Alert.alert('No Courses', 'No active courses found in your Google Classroom.');
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
      Alert.alert('Error', 'Failed to fetch courses from Google Classroom');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch course materials
  const fetchCourseMaterials = async (courseId) => {
    setIsFetching(true);
    setProcessingProgress("Fetching course materials...");
    
    try {
      const materials = [];

      // Fetch Announcements
      setProcessingProgress("Fetching announcements...");
      const announcementsResponse = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/announcements`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (announcementsResponse.ok) {
        const announcementsData = await announcementsResponse.json();
        const announcements = (announcementsData.announcements || []).map(item => ({
          id: item.id,
          type: 'announcement',
          title: item.text?.substring(0, 50) || 'Untitled Announcement',
          description: item.text || '',
          createdTime: item.creationTime,
          materials: item.materials || [],
        }));
        materials.push(...announcements);
      }

      // Fetch Course Work
      setProcessingProgress("Fetching assignments...");
      const courseWorkResponse = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (courseWorkResponse.ok) {
        const courseWorkData = await courseWorkResponse.json();
        const assignments = (courseWorkData.courseWork || []).map(item => ({
          id: item.id,
          type: 'assignment',
          title: item.title || 'Untitled Assignment',
          description: item.description || '',
          createdTime: item.creationTime,
          dueDate: item.dueDate,
          materials: item.materials || [],
        }));
        materials.push(...assignments);
      }

      // Fetch Course Work Materials
      setProcessingProgress("Fetching course materials...");
      const materialsResponse = await fetch(
        `https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (materialsResponse.ok) {
        const materialsData = await materialsResponse.json();
        const courseMats = (materialsData.courseWorkMaterial || []).map(item => ({
          id: item.id,
          type: 'material',
          title: item.title || 'Untitled Material',
          description: item.description || '',
          createdTime: item.creationTime,
          materials: item.materials || [],
        }));
        materials.push(...courseMats);
      }

      console.log(`📝 Found ${materials.length} materials`);
      setCourseMaterials(materials);
      setShowMaterialsModal(true);
    } catch (error) {
      console.error('Error fetching materials:', error);
      Alert.alert('Error', 'Failed to fetch course materials');
    } finally {
      setIsFetching(false);
      setProcessingProgress("");
    }
  };

  // Handle course selection
  const handleCourseSelect = (course) => {
    setSelectedCourse(course);
    setShowCourseModal(false);
    fetchCourseMaterials(course.id);
  };

  // Toggle material selection
  const toggleMaterialSelection = (materialId) => {
    setSelectedMaterials(prev => {
      if (prev.includes(materialId)) {
        return prev.filter(id => id !== materialId);
      } else {
        return [...prev, materialId];
      }
    });
  };

  // Select all materials
  const selectAllMaterials = () => {
    setSelectedMaterials(courseMaterials.map(m => m.id));
  };

  // Deselect all materials
  const deselectAllMaterials = () => {
    setSelectedMaterials([]);
  };

  // Download file from Google Drive
  const downloadDriveFile = async (fileId, mimeType) => {
    try {
      let url;
      
      // Handle Google Docs, Sheets, Slides export
      if (mimeType.includes('google-apps.document')) {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      } else if (mimeType.includes('google-apps.spreadsheet')) {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
      } else if (mimeType.includes('google-apps.presentation')) {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      } else if (mimeType.includes('pdf')) {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      } else {
        // For other files, try to get as text
        url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const content = await response.text();
      return content;
    } catch (error) {
      console.error('Error downloading file:', error);
      return null;
    }
  };

  // Process material with Gemini AI
  const processMaterialWithAI = async (material) => {
    try {
      let contentText = `${material.title}\n\n${material.description || ''}`;

      // Process attached materials (Google Drive files, links, etc.)
      if (material.materials && material.materials.length > 0) {
        for (const mat of material.materials) {
          if (mat.driveFile && mat.driveFile.driveFile) {
            const fileId = mat.driveFile.driveFile.id;
            const fileTitle = mat.driveFile.driveFile.title;
            const mimeType = mat.driveFile.driveFile.mimeType || '';

            console.log(`📎 Processing: ${fileTitle}`);
            
            const fileContent = await downloadDriveFile(fileId, mimeType);
            if (fileContent) {
              contentText += `\n\n--- Content from: ${fileTitle} ---\n${fileContent}`;
            }
          } else if (mat.link) {
            contentText += `\n\nLink: ${mat.link.title || mat.link.url}`;
          } else if (mat.youtubeVideo) {
            contentText += `\n\nVideo: ${mat.youtubeVideo.title || mat.youtubeVideo.alternateLink}`;
          }
        }
      }

      // Generate notes with Gemini
      const prompt = `You are an expert note-taking assistant. A student has received the following content from their Google Classroom:

${contentText}

IMPORTANT FORMATTING RULES:
- DO NOT use asterisks (*) for formatting
- DO NOT use backticks (\`)
- DO NOT add quotes around text
- Use plain text with clear structure

Create organized study notes with:
1. Title (based on the material)
2. Main Topics and Subtopics
3. Key Concepts and Definitions
4. Important Points
5. Summary

Format as clean, readable plain text suitable for students.`;

      const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate notes');
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates.length > 0) {
        const textParts = data.candidates[0].content.parts
          .filter(part => part.text)
          .map(part => part.text)
          .join('\n');
        
        return formatNotesContent(textParts);
      }
      
      return contentText;
    } catch (error) {
      console.error('Error processing material:', error);
      return `${material.title}\n\n${material.description || 'Failed to process content'}`;
    }
  };

  // Format notes content
  const formatNotesContent = (rawContent) => {
    if (!rawContent) return "";
    
    let formatted = rawContent
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[""]([^""]+)["\"]/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return formatted;
  };

  // Process selected materials and save to Firebase
  const processAndSaveMaterials = async () => {
    if (selectedMaterials.length === 0) {
      Alert.alert('No Selection', 'Please select at least one material to import.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to save notes.');
      return;
    }

    setIsFetching(true);
    const materialsToProcess = courseMaterials.filter(m => selectedMaterials.includes(m.id));

    try {
      for (let i = 0; i < materialsToProcess.length; i++) {
        const material = materialsToProcess[i];
        setProcessingProgress(`Processing ${i + 1} of ${materialsToProcess.length}: ${material.title}`);

        const notesContent = await processMaterialWithAI(material);

        // Save to Firebase
        await addDoc(collection(db, 'recordings'), {
          userId: currentUser.uid,
          title: material.title,
          transcription: notesContent,
          organizedNotes: {
            title: material.title,
            content: notesContent,
            aiProvider: 'gemini',
            sections: [],
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: 'google_classroom',
          classroomCourseId: selectedCourse?.id,
          classroomCourseName: selectedCourse?.name,
          classroomMaterialType: material.type,
          status: 'completed',
        });

        console.log(`✅ Saved: ${material.title}`);
      }

      Alert.alert(
        'Success! 🎉',
        `${materialsToProcess.length} materials imported successfully!`,
        [
          {
            text: 'View Notes',
            onPress: () => {
              navigation.navigate('Notes');
              resetState();
            }
          },
          {
            text: 'Import More',
            onPress: () => {
              setShowMaterialsModal(false);
              setShowCourseModal(true);
              resetState();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Processing error:', error);
      Alert.alert('Error', `Failed to process materials: ${error.message}`);
    } finally {
      setIsFetching(false);
      setProcessingProgress("");
    }
  };

  // Reset state
  const resetState = () => {
    setSelectedMaterials([]);
    setCourseMaterials([]);
    setSelectedCourse(null);
  };

  // Disconnect Google Classroom
  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from Google Classroom?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            setIsAuthenticated(false);
            setAccessToken(null);
            setCourses([]);
            setUserEmail("");
            resetState();
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }] }>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="school" size={48} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Google Classroom Sync 📚</Text>
          <Text style={[styles.description, { color: colors.subtext }]}>Connect your Google Classroom and import course materials as organized study notes.</Text>
        </View>
        <BackButton />

        {/* Authentication Section */}
        {!isAuthenticated ? (
          <View style={styles.authSection}>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <MaterialIcons name="check-circle" size={20} color="#10b981" />
                <Text style={styles.featureText}>Access all your courses</Text>
              </View>
              <View style={styles.featureItem}>
                <MaterialIcons name="check-circle" size={20} color="#10b981" />
                <Text style={styles.featureText}>Import assignments & materials</Text>
              </View>
              <View style={styles.featureItem}>
                <MaterialIcons name="check-circle" size={20} color="#10b981" />
                <Text style={styles.featureText}>AI-powered note generation</Text>
              </View>
              <View style={styles.featureItem}>
                <MaterialIcons name="check-circle" size={20} color="#10b981" />
                <Text style={styles.featureText}>Automatic organization</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.connectButton}
              onPress={() => promptAsync()}
              disabled={!request}
            >
              <Image
                source={{ uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' }}
                style={styles.googleIcon}
              />
              <Text style={styles.connectButtonText}>Connect with Google Classroom</Text>
            </TouchableOpacity>

            {/* Debug Info - Show Redirect URI */}
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={() => setShowRedirectInfo(!showRedirectInfo)}
            >
              {/* <MaterialIcons name="info-outline" size={16} color="#6b7280" /> */}
              {/* <Text style={styles.debugButtonText}>
                {showRedirectInfo ? 'Hide' : 'Show'} Setup Instructions
              </Text> */}
            </TouchableOpacity>

            {showRedirectInfo && (
              <View style={styles.redirectInfoBox}>
                <Text style={styles.redirectInfoTitle}>🔧 OAuth Setup Required</Text>
                <Text style={styles.redirectInfoText}>
                  Add this EXACT redirect URI to your Google Cloud Console:
                </Text>
                <View style={styles.redirectUriContainer}>
                  <Text style={styles.redirectUri} selectable>
                    https://auth.expo.io/@mande/notetedd
                  </Text>
                </View>
                <Text style={styles.redirectInfoSteps}>
                  Steps:{'\n'}
                  1. Go to: console.cloud.google.com{'\n'}
                  2. Select your project{'\n'}
                  3. APIs & Services → Credentials{'\n'}
                  4. Click your OAuth 2.0 Client ID{'\n'}
                  5. Under "Authorized redirect URIs", click ADD URI{'\n'}
                  6. Paste: https://auth.expo.io/@mande/notetedd{'\n'}
                  7. Click SAVE and wait 1-2 minutes{'\n'}
                  8. Try connecting again{'\n\n'}
                  
                  ⚠️ IMPORTANT:{'\n'}
                  - Use EXACT URI above (no spaces){'\n'}
                  - Application type must be "Web application"{'\n'}
                  - Not "Android" or "iOS"
                </Text>
              </View>
            )}

            <View style={styles.privacyNote}>
              <MaterialIcons name="lock" size={16} color="#6b7280" />
              <Text style={styles.privacyText}>
                We only request read-only access to your classroom content. Your data is secure.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.connectedSection}>
            <View style={styles.accountCard}>
              <View style={styles.accountInfo}>
                <MaterialIcons name="account-circle" size={40} color="#7c3aed" />
                <View style={styles.accountDetails}>
                  <Text style={styles.accountLabel}>Connected as:</Text>
                  <Text style={styles.accountEmail}>{userEmail}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleDisconnect}>
                <MaterialIcons name="logout" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>

            {courses.length > 0 && (
              <TouchableOpacity
                style={styles.browseCoursesButton}
                onPress={() => setShowCourseModal(true)}
              >
                <MaterialIcons name="library-books" size={24} color="#fff" />
                <Text style={styles.browseCoursesText}>
                  Browse Courses ({courses.length})
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>Quick Stats</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{courses.length}</Text>
                  <Text style={styles.statLabel}>Active Courses</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>Ready</Text>
                  <Text style={styles.statLabel}>To Import</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Loading Indicator */}
        {(isLoading || isFetching) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7c3aed" />
            <Text style={styles.loadingText}>
              {processingProgress || 'Loading...'}
            </Text>
          </View>
        )}

        {/* Info Box */}
        {!isAuthenticated && (
          <View style={styles.infoBox}>
            <MaterialIcons name="info" size={24} color="#7c3aed" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>How it works:</Text>
              <Text style={styles.infoText}>1. Connect your Google account</Text>
              <Text style={styles.infoText}>2. Select a course to import</Text>
              <Text style={styles.infoText}>3. Choose materials to convert</Text>
              <Text style={styles.infoText}>4. AI generates organized notes</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Course Selection Modal */}
      <Modal visible={showCourseModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select a Course</Text>
            <TouchableOpacity onPress={() => setShowCourseModal(false)}>
              <MaterialIcons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            {courses.map((course) => (
              <TouchableOpacity
                key={course.id}
                style={styles.courseCard}
                onPress={() => handleCourseSelect(course)}
              >
                <View style={styles.courseHeader}>
                  <View style={styles.courseIcon}>
                    <MaterialIcons name="book" size={24} color="#fff" />
                  </View>
                  <View style={styles.courseInfo}>
                    <Text style={styles.courseName}>{course.name}</Text>
                    <Text style={styles.courseSection}>{course.section || 'No section'}</Text>
                    <Text style={styles.courseTeacher}>
                      {course.courseState} • {course.descriptionHeading || 'No description'}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Materials Selection Modal */}
      <Modal visible={showMaterialsModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Select Materials</Text>
              <Text style={styles.modalSubtitle}>{selectedCourse?.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMaterialsModal(false)}>
              <MaterialIcons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.selectionControls}>
            <Text style={styles.selectionCount}>
              {selectedMaterials.length} of {courseMaterials.length} selected
            </Text>
            <View style={styles.selectionButtons}>
              <TouchableOpacity onPress={selectAllMaterials} style={styles.selectionButton}>
                <Text style={styles.selectionButtonText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deselectAllMaterials} style={styles.selectionButton}>
                <Text style={styles.selectionButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={courseMaterials}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.materialCard,
                  selectedMaterials.includes(item.id) && styles.materialCardSelected
                ]}
                onPress={() => toggleMaterialSelection(item.id)}
              >
                <View style={styles.materialHeader}>
                  <View style={[
                    styles.materialIcon,
                    { backgroundColor: item.type === 'assignment' ? '#ef4444' : item.type === 'announcement' ? '#3b82f6' : '#10b981' }
                  ]}>
                    <MaterialIcons
                      name={item.type === 'assignment' ? 'assignment' : item.type === 'announcement' ? 'campaign' : 'article'}
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <View style={styles.materialInfo}>
                    <Text style={styles.materialTitle}>{item.title}</Text>
                    <Text style={styles.materialType}>
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      {item.materials?.length > 0 && ` • ${item.materials.length} attachment(s)`}
                    </Text>
                    {item.description && (
                      <Text style={styles.materialDescription} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.checkboxContainer}>
                  {selectedMaterials.includes(item.id) ? (
                    <MaterialIcons name="check-box" size={24} color="#7c3aed" />
                  ) : (
                    <MaterialIcons name="check-box-outline-blank" size={24} color="#d1d5db" />
                  )}
                </View>
              </TouchableOpacity>
            )}
            style={styles.materialsList}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSecondary]}
              onPress={() => setShowMaterialsModal(false)}
            >
              <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.modalButtonPrimary,
                selectedMaterials.length === 0 && styles.modalButtonDisabled
              ]}
              onPress={processAndSaveMaterials}
              disabled={selectedMaterials.length === 0}
            >
              <MaterialIcons name="download" size={20} color="#fff" />
              <Text style={styles.modalButtonTextPrimary}>
                Import ({selectedMaterials.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#7c3aed",
    marginTop: 12,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  authSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  featureList: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: "#374151",
    marginLeft: 12,
    flex: 1,
  },
  connectButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginBottom: 16,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  privacyText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
  debugButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginTop: 8,
  },
  debugButtonText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 4,
    textDecorationLine: "underline",
  },
  redirectInfoBox: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  redirectInfoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 8,
  },
  redirectInfoText: {
    fontSize: 12,
    color: "#78350f",
    marginBottom: 8,
    lineHeight: 16,
  },
  redirectUriContainer: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  redirectUri: {
    fontSize: 11,
    color: "#1f2937",
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  redirectInfoSteps: {
    fontSize: 11,
    color: "#78350f",
    lineHeight: 18,
  },
  connectedSection: {
    marginBottom: 24,
  },
  accountCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  accountInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  accountDetails: {
    marginLeft: 12,
    flex: 1,
  },
  accountLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  browseCoursesButton: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  browseCoursesText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  statsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#7c3aed",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 20,
  },
  loadingContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 16,
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "#f5f3ff",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#e9d5ff",
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6b21a8",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#7c3aed",
    lineHeight: 20,
    marginBottom: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  modalScroll: {
    flex: 1,
    padding: 20,
  },
  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  courseHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#7c3aed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  courseSection: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 2,
  },
  courseTeacher: {
    fontSize: 12,
    color: "#9ca3af",
  },
  selectionControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  selectionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  selectionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  selectionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  materialsList: {
    flex: 1,
    padding: 20,
  },
  materialCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  materialCardSelected: {
    borderColor: "#7c3aed",
    backgroundColor: "#f5f3ff",
  },
  materialHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  materialIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  materialInfo: {
    flex: 1,
  },
  materialTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  materialType: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  materialDescription: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 16,
  },
  checkboxContainer: {
    marginLeft: 12,
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalButtonSecondary: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  modalButtonPrimary: {
    backgroundColor: "#7c3aed",
  },
  modalButtonDisabled: {
    backgroundColor: "#d1d5db",
    opacity: 0.5,
  },
  modalButtonTextSecondary: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonTextPrimary: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});