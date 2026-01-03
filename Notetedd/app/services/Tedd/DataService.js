import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

/**
 * DataService - Provides Tedd AI with access to all app data
 * This service acts as a bridge between your app's data and the AI
 */
class DataService {
  constructor(firebaseApp, userId) {
    this.db = getFirestore(firebaseApp);
    this.userId = userId;
  }

  // Update user ID (when user logs in/out)
  setUserId(userId) {
    this.userId = userId;
  }

  // Check what data is available
  async checkAvailability() {
    try {
      const [notes, recordings, analytics, classroom] = await Promise.all([
        this.hasNotes(),
        this.hasRecordings(),
        this.hasAnalytics(),
        this.hasClassroomData(),
      ]);

      return {
        notes: notes.exists,
        notesCount: notes.count,
        recordings: recordings.exists,
        recordingsCount: recordings.count,
        analytics: analytics.exists,
        classroom: classroom.exists,
      };
    } catch (error) {
      console.error('Error checking data availability:', error);
      return {};
    }
  }

  // ==================== NOTES ====================
  
  async hasNotes() {
    try {
      const notesRef = collection(this.db, 'users', this.userId, 'notes');
      const snapshot = await getDocs(notesRef);
      return { exists: !snapshot.empty, count: snapshot.size };
    } catch (error) {
      return { exists: false, count: 0 };
    }
  }

  async getNotes(options = {}) {
    try {
      const notesRef = collection(this.db, 'users', this.userId, 'notes');
      const q = query(notesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const notes = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const note = {
          id: doc.id,
          title: data.title || 'Untitled',
          content: data.content || '',
          subject: data.subject || data.category || 'Uncategorized',
          tags: data.tags || [],
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };

        // Extract subtopics from content if needed
        if (options.needsSubtopics) {
          note.subtopics = this.extractSubtopics(data.content);
        }

        notes.push(note);
      });

      // Group by subject if requested
      if (options.groupBySubject) {
        return this.groupNotesBySubject(notes);
      }

      return { notes, totalCount: notes.length };
    } catch (error) {
      console.error('Error fetching notes:', error);
      return { notes: [], totalCount: 0, error: error.message };
    }
  }

  // Extract subtopics from note content
  extractSubtopics(content) {
    if (!content) return [];
    
    const subtopics = [];
    
    // Look for markdown headers (## Subtopic or ### Subtopic)
    const headerMatches = content.match(/^#{2,3}\s+(.+)$/gm);
    if (headerMatches) {
      headerMatches.forEach(match => {
        const topic = match.replace(/^#{2,3}\s+/, '').trim();
        subtopics.push(topic);
      });
    }
    
    // Look for numbered lists (1. Subtopic, 2. Subtopic)
    const numberedMatches = content.match(/^\d+\.\s+(.+)$/gm);
    if (numberedMatches && numberedMatches.length <= 10) { // Limit to avoid false positives
      numberedMatches.forEach(match => {
        const topic = match.replace(/^\d+\.\s+/, '').trim();
        if (topic.length < 100) { // Only short items are likely subtopics
          subtopics.push(topic);
        }
      });
    }
    
    // Look for bullet points (- Subtopic or * Subtopic)
    const bulletMatches = content.match(/^[\-\*]\s+(.+)$/gm);
    if (bulletMatches && bulletMatches.length <= 10) {
      bulletMatches.forEach(match => {
        const topic = match.replace(/^[\-\*]\s+/, '').trim();
        if (topic.length < 100) {
          subtopics.push(topic);
        }
      });
    }
    
    return [...new Set(subtopics)]; // Remove duplicates
  }

  groupNotesBySubject(notes) {
    const grouped = {};
    notes.forEach(note => {
      const subject = note.subject || 'Uncategorized';
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      grouped[subject].push(note);
    });
    return grouped;
  }

  // ==================== ANALYTICS ====================
  
  async hasAnalytics() {
    try {
      const analyticsData = await AsyncStorage.getItem(`analytics_${this.userId}`);
      return { exists: !!analyticsData };
    } catch (error) {
      return { exists: false };
    }
  }

  async getAnalytics(timeframe = 'week') {
    try {
      // Fetch study sessions
      const sessionsRef = collection(this.db, 'users', this.userId, 'studySessions');
      const snapshot = await getDocs(query(sessionsRef, orderBy('startTime', 'desc')));
      
      const sessions = [];
      snapshot.forEach((doc) => {
        sessions.push({
          id: doc.id,
          ...doc.data(),
          startTime: doc.data().startTime?.toDate(),
          endTime: doc.data().endTime?.toDate(),
        });
      });

      // Filter by timeframe
      const now = new Date();
      const filteredSessions = sessions.filter(session => {
        const sessionDate = session.startTime;
        if (!sessionDate) return false;

        switch (timeframe) {
          case 'today':
            return sessionDate.toDateString() === now.toDateString();
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return sessionDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return sessionDate >= monthAgo;
          case 'year':
            const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            return sessionDate >= yearAgo;
          default:
            return true;
        }
      });

      // Calculate statistics
      const totalHours = filteredSessions.reduce((sum, session) => {
        const duration = session.duration || 0;
        return sum + (duration / 3600); // Convert seconds to hours
      }, 0);

      const sessionCount = filteredSessions.length;

      // Calculate streak
      const currentStreak = await this.calculateStreak(sessions);

      // Get top subjects
      const subjectHours = {};
      filteredSessions.forEach(session => {
        const subject = session.subject || 'General';
        subjectHours[subject] = (subjectHours[subject] || 0) + (session.duration || 0) / 3600;
      });
      const topSubjects = Object.entries(subjectHours)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([subject, hours]) => `${subject} (${hours.toFixed(1)}h)`);

      // Calculate focus score (dummy calculation - customize as needed)
      const avgSessionLength = totalHours / sessionCount || 0;
      const focusScore = Math.min(100, Math.round((avgSessionLength / 2) * 50 + currentStreak * 5));

      return {
        totalHours: totalHours.toFixed(1),
        sessionCount,
        currentStreak,
        focusScore,
        topSubjects,
        timeframe,
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      return {
        totalHours: '0',
        sessionCount: 0,
        currentStreak: 0,
        focusScore: 0,
        topSubjects: [],
        error: error.message,
      };
    }
  }

  async calculateStreak(sessions) {
    if (!sessions || sessions.length === 0) return 0;

    // Sort sessions by date
    const sortedSessions = sessions
      .filter(s => s.startTime)
      .sort((a, b) => b.startTime - a.startTime);

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedSessions.length; i++) {
      const sessionDate = new Date(sortedSessions[i].startTime);
      sessionDate.setHours(0, 0, 0, 0);

      const dayDiff = Math.floor((currentDate - sessionDate) / (1000 * 60 * 60 * 24));

      if (dayDiff === streak) {
        // Found a session for this day
        streak++;
        currentDate = new Date(sessionDate.getTime() - 24 * 60 * 60 * 1000);
      } else if (dayDiff > streak) {
        // Gap in streak
        break;
      }
    }

    return streak;
  }

  // ==================== RECORDINGS ====================
  
  async hasRecordings() {
    try {
      const recordingsRef = collection(this.db, 'users', this.userId, 'recordings');
      const snapshot = await getDocs(recordingsRef);
      return { exists: !snapshot.empty, count: snapshot.size };
    } catch (error) {
      return { exists: false, count: 0 };
    }
  }

  async getRecordings() {
    try {
      const recordingsRef = collection(this.db, 'users', this.userId, 'recordings');
      const q = query(recordingsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const recordings = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        recordings.push({
          id: doc.id,
          title: data.title || 'Untitled Recording',
          duration: this.formatDuration(data.duration || 0),
          createdAt: data.createdAt?.toDate() || new Date(),
          transcript: data.transcript || null,
          subject: data.subject || 'General',
        });
      });

      return { recordings, totalCount: recordings.length };
    } catch (error) {
      console.error('Error fetching recordings:', error);
      return { recordings: [], totalCount: 0, error: error.message };
    }
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ==================== GOOGLE CLASSROOM ====================
  
  async hasClassroomData() {
    try {
      const classroomRef = collection(this.db, 'users', this.userId, 'classroom');
      const snapshot = await getDocs(classroomRef);
      return { exists: !snapshot.empty };
    } catch (error) {
      return { exists: false };
    }
  }

  async getClassroomData() {
    try {
      const assignmentsRef = collection(this.db, 'users', this.userId, 'classroom', 'assignments');
      const q = query(assignmentsRef, orderBy('dueDate', 'asc'));
      const snapshot = await getDocs(q);
      
      const assignments = [];
      const now = new Date();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const dueDate = data.dueDate?.toDate();
        
        // Only include upcoming assignments
        if (dueDate && dueDate >= now) {
          assignments.push({
            id: doc.id,
            title: data.title || 'Untitled Assignment',
            course: data.courseName || 'Unknown Course',
            dueDate: this.formatDueDate(dueDate),
            status: data.status || 'pending',
          });
        }
      });

      return { assignments, totalCount: assignments.length };
    } catch (error) {
      console.error('Error fetching classroom data:', error);
      return { assignments: [], totalCount: 0, error: error.message };
    }
  }

  formatDueDate(date) {
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays < 7) return `Due in ${diffDays} days`;
    return date.toLocaleDateString();
  }

  // ==================== ACHIEVEMENTS ====================
  
  async getAchievements() {
    try {
      const achievementsRef = collection(this.db, 'users', this.userId, 'achievements');
      const snapshot = await getDocs(achievementsRef);
      
      const achievements = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.unlocked) {
          achievements.push({
            id: doc.id,
            name: data.name || 'Achievement',
            description: data.description || '',
            unlockedAt: data.unlockedAt?.toDate() || new Date(),
            icon: data.icon || '🏆',
          });
        }
      });

      return { achievements, totalCount: achievements.length };
    } catch (error) {
      console.error('Error fetching achievements:', error);
      return { achievements: [], totalCount: 0, error: error.message };
    }
  }
}

export default DataService;