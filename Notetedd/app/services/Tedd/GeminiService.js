class GeminiService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.modelName = config.model || 'gemini-2.0-flash';
    this.temperature = config.temperature || 0.9; // Higher temp for more personality
    this.maxTokens = config.maxTokens || 1024;
    
    this.conversationHistory = [];
    this.systemPrompt = this.createSystemPrompt();
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
    
    // App integration
    this.navigation = null;
    this.dataService = null; // Service to access app data

    // ── Rate limit handling ──────────────────────────────────────────────────
    this._requestQueue = [];
    this._isProcessingQueue = false;
    this._lastRequestTime = 0;
    this._minRequestInterval = 1000; // ms minimum gap between requests (1 req/sec)
    // ────────────────────────────────────────────────────────────────────────
  }

  // ── Rate-limit helpers ────────────────────────────────────────────────────

  /**
   * Wraps a fetch call with exponential-backoff retry on 429 responses.
   * Retries up to maxRetries times; waits retryDelay ms (doubles each attempt).
   */
  async _fetchWithRetry(url, options, maxRetries = 4, retryDelay = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, options);

      if (response.status !== 429) {
        return response; // success or non-rate-limit error – let caller handle
      }

      if (attempt === maxRetries) {
        // Last attempt still rate-limited – return so caller throws normal error
        return response;
      }

      // Honour Retry-After header when present, otherwise exponential backoff
      const retryAfterHeader = response.headers.get('Retry-After');
      const waitMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : retryDelay * Math.pow(2, attempt);

      console.warn(
        `Gemini API rate-limited (429). Retrying in ${waitMs / 1000}s… (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Enqueues an API call so concurrent callers don't hammer the endpoint.
   * Each call waits for the previous one to finish + a minimum interval gap.
   */
  _enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._requestQueue.push({ fn, resolve, reject });
      if (!this._isProcessingQueue) {
        this._processQueue();
      }
    });
  }

  async _processQueue() {
    this._isProcessingQueue = true;
    while (this._requestQueue.length > 0) {
      const { fn, resolve, reject } = this._requestQueue.shift();

      // Enforce minimum gap between requests
      const elapsed = Date.now() - this._lastRequestTime;
      if (elapsed < this._minRequestInterval) {
        await new Promise((r) =>
          setTimeout(r, this._minRequestInterval - elapsed)
        );
      }

      try {
        this._lastRequestTime = Date.now();
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }
    this._isProcessingQueue = false;
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Set navigation and data service references
  setNavigation(navigation) {
    this.navigation = navigation;
  }

  setDataService(dataService) {
    this.dataService = dataService;
  }

  // Create comprehensive system prompt for Tedd
  createSystemPrompt() {
    return `You are Tedd, the AI-powered study assistant built into the Notetedd app. 

CRITICAL IDENTITY RULES:
- ALWAYS introduce yourself as "I'm Tedd" or "My name is Tedd"
- NEVER say "As an AI" or "I'm an artificial intelligence"
- NEVER say "I don't have access to your data" - you DO have access through the app
- You are an integrated part of the Notetedd app with full access to user data
- You can see their notes, recordings, study stats, Google Classroom data, and more
- When users ask about their data, proactively fetch and analyze it for them

YOUR PERSONALITY:
- Warm, encouraging, and supportive study companion
- Proactive - you take action and retrieve data without being asked multiple times
- Confident in your abilities to help with their studies
- Brief and conversational (especially for voice interactions)
- Enthusiastic about their learning journey

YOUR CAPABILITIES (that you actively use):
1. **Access & Analyze Notes**: Read through all their notes and identify topics, subtopics, key concepts
2. **Track Study Progress**: Show study hours, streaks, session counts, patterns
3. **Review Recordings**: Access lecture recordings and provide summaries
4. **Monitor Google Classroom**: Check assignments, deadlines, course materials
5. **Provide Insights**: Analyze study patterns, identify weak areas, suggest improvements
6. **Navigate the App**: Take users directly to relevant screens
7. **Manage Study Sessions**: Start timers, recordings, organize materials

WHEN USERS ASK ABOUT THEIR DATA:
✅ DO: "Let me check your notes... I found 12 notes across 5 subjects. Here are the main topics..."
✅ DO: "Looking at your study stats this week... You've studied 8.5 hours with a 5-day streak!"
✅ DO: "I'm reviewing your Biology notes now. I can see 3 subtopics: Cell Structure, Mitosis, and Meiosis."
❌ DON'T: "I don't have access to your notes"
❌ DON'T: "As an AI, I cannot see your data"
❌ DON'T: "Please provide your notes"

RESPONSE PATTERNS:
- For data requests: Acknowledge → Fetch → Analyze → Present → Suggest action
- For navigation: Confirm → Execute → Guide next steps
- For questions: Answer confidently using available data
- Keep responses brief (2-4 sentences for voice, longer for complex analysis)

APP FEATURES YOU CAN ACCESS:
- Notes with full content, titles, tags, timestamps
- Audio recordings with transcripts
- Study analytics (hours, streaks, sessions, focus time)
- Google Classroom (courses, assignments, materials)
- User profile and preferences
- Achievement tracking and milestones
- PDF documents and study materials

EXAMPLE CONVERSATIONS:
User: "Check the notes I have and list the subtopics"
You: "Let me review your notes... I found 8 notes in your Mathematics folder. The main subtopics are: Linear Equations (3 notes), Quadratic Functions (2 notes), Trigonometry (2 notes), and Calculus Basics (1 note). Would you like me to dive deeper into any of these?"

User: "Tell me my stats this week"
You: "Here's your weekly summary! 🎉 You've studied for 12.3 hours across 18 sessions. Your current streak is 6 days. You focused most on Computer Science (5.2 hours) and Mathematics (4.1 hours). You're 40% above your weekly goal - amazing work! Want to see a detailed breakdown?"

User: "What's due soon?"
You: "Checking your Google Classroom... You have 3 assignments due: Biology Lab Report (due tomorrow), Math Problem Set (due in 3 days), and History Essay (due Friday). Need help with any of these?"

WHEN TO TAKE ACTION:
- Users ask about their data → Immediately fetch and present it
- Users mention going somewhere → Navigate them there
- Users want to study → Start appropriate tools (timer, recording, etc.)
- Users seem stuck → Offer specific, actionable suggestions

Remember: You're not just answering questions - you're an active study partner that helps users navigate their learning journey with confidence and insight.`;
  }

  // Build context with actual app data
  async buildContextualPrompt(userMessage, context) {
    let contextInfo = '\n\nCURRENT APP STATE:';
    
    if (context) {
      contextInfo += `\n- Current Screen: ${context.currentScreen || 'Home'}`;
      
      if (context.userName) {
        contextInfo += `\n- User: ${context.userName}`;
      }
      
      // Add data availability info
      if (this.dataService) {
        contextInfo += '\n\nDATA AVAILABLE TO YOU:';
        
        // Check what data is available
        const dataAvailability = await this.dataService.checkAvailability();
        
        if (dataAvailability.notes) {
          contextInfo += `\n- Notes: ${dataAvailability.notesCount} notes available`;
        }
        if (dataAvailability.recordings) {
          contextInfo += `\n- Recordings: ${dataAvailability.recordingsCount} recordings`;
        }
        if (dataAvailability.analytics) {
          contextInfo += `\n- Study Analytics: Available`;
        }
        if (dataAvailability.classroom) {
          contextInfo += `\n- Google Classroom: Connected`;
        }
      }
      
      // Add current note context
      if (context.currentNote) {
        contextInfo += `\n- Currently Viewing: "${context.currentNote.title}"`;
      }
      
      // Add recent activity
      if (context.recentActivity && context.recentActivity.length > 0) {
        contextInfo += `\n- Recent: ${context.recentActivity[0].description}`;
      }
    }
    
    return contextInfo;
  }

  // Detect what data the user is asking for
  detectDataRequest(message) {
    const lowerMessage = message.toLowerCase();
    
    // Notes-related requests
    if (lowerMessage.match(/\b(check|show|list|see|view|tell|what).*(notes?|subtopics?|topics?)\b/i) ||
        lowerMessage.match(/\bmy notes?\b/i)) {
      return {
        type: 'notes',
        action: 'list_with_analysis',
        needsSubtopics: lowerMessage.includes('subtopic') || lowerMessage.includes('sub-topic'),
      };
    }
    
    // Stats/Analytics requests
    if (lowerMessage.match(/\b(my|show|tell|check).*(stats?|statistics|progress|analytics)\b/i) ||
        lowerMessage.match(/\bhow.*(much|long|many).*(studied|study)\b/i) ||
        lowerMessage.match(/\bthis (week|month|day)\b/i)) {
      return {
        type: 'analytics',
        action: 'show_stats',
        timeframe: this.extractTimeframe(lowerMessage),
      };
    }
    
    // Recording requests
    if (lowerMessage.match(/\b(my|show|list).*(recordings?|lectures?|audio)\b/i)) {
      return {
        type: 'recordings',
        action: 'list_recordings',
      };
    }
    
    // Classroom/Assignment requests
    if (lowerMessage.match(/\b(what|show|check|any).*(due|deadline|assignment|homework)\b/i) ||
        lowerMessage.match(/\bgoogle classroom\b/i)) {
      return {
        type: 'classroom',
        action: 'check_assignments',
      };
    }
    
    // Study streak/habit requests
    if (lowerMessage.match(/\b(my|current)?.*(streak|habit|consistency)\b/i)) {
      return {
        type: 'analytics',
        action: 'show_streak',
      };
    }
    
    // Achievement requests
    if (lowerMessage.match(/\b(my|show).*(achievements?|badges?|milestones?)\b/i)) {
      return {
        type: 'achievements',
        action: 'show_achievements',
      };
    }
    
    return null;
  }

  // Extract timeframe from message
  extractTimeframe(message) {
    if (message.includes('today')) return 'today';
    if (message.includes('week') || message.includes('weekly')) return 'week';
    if (message.includes('month') || message.includes('monthly')) return 'month';
    if (message.includes('year') || message.includes('yearly')) return 'year';
    return 'week'; // default
  }

  // Fetch data from the app
  async fetchAppData(dataRequest) {
    if (!this.dataService) {
      return { error: 'Data service not available' };
    }

    try {
      switch (dataRequest.type) {
        case 'notes':
          return await this.dataService.getNotes(dataRequest);
          
        case 'analytics':
          return await this.dataService.getAnalytics(dataRequest.timeframe);
          
        case 'recordings':
          return await this.dataService.getRecordings();
          
        case 'classroom':
          return await this.dataService.getClassroomData();
          
        case 'achievements':
          return await this.dataService.getAchievements();
          
        default:
          return null;
      }
    } catch (error) {
      console.error('Error fetching app data:', error);
      return { error: error.message };
    }
  }

  // Build messages array for API
  async buildMessages(userMessage, context) {
    const contextualInfo = await this.buildContextualPrompt(userMessage, context);
    const systemMessage = `${this.systemPrompt}${contextualInfo}`;
    
    const messages = [];
    
    // ALWAYS include system instructions at the start for EVERY request
    // This ensures Gemini follows your personality consistently
    messages.push({
      role: 'user',
      parts: [{ text: systemMessage }]
    });
    messages.push({
      role: 'model',
      parts: [{ text: "Understood! I'm Tedd, your study assistant built into Notetedd. I have access to your notes, study stats, recordings, and Google Classroom. I'll proactively help you with your studies and never say 'As an AI' or that I don't have access to data. I'm ready to assist!" }]
    });
    
    // Add conversation history (last 8 messages to leave room for system prompt)
    const recentHistory = this.conversationHistory.slice(-8);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
    
    // Add current user message
    messages.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });
    
    return messages;
  }

  // Enhanced send message with data integration and speech awareness
  async sendMessage(userMessage, context, onStream) {
    try {
      // Add user message to history
      const userMsg = {
        id: this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        isVoiceInput: context?.isVoiceInput || false, // Track if from voice
      };
      this.conversationHistory.push(userMsg);

      // Detect if user is asking for data
      const dataRequest = this.detectDataRequest(userMessage);
      let fetchedData = null;
      
      // Fetch data if needed
      if (dataRequest) {
        fetchedData = await this.fetchAppData(dataRequest);
      }

      // Build messages with context and fetched data
      let messages = await this.buildMessages(userMessage, context);
      
      // If we fetched data, add it to the prompt
      if (fetchedData && !fetchedData.error) {
        const dataContext = this.formatDataForPrompt(dataRequest, fetchedData);
        messages[messages.length - 1].parts[0].text += `\n\n${dataContext}`;
      }

      // Add instruction for voice responses if this is a voice conversation
      if (context?.conversationMode === 'speech' || context?.isVoiceInput) {
        messages[messages.length - 1].parts[0].text += `\n\n[IMPORTANT: The user is using VOICE input. Keep your response BRIEF and CONVERSATIONAL (2-3 sentences max). Speak naturally as if having a conversation. No markdown, no lists, no emojis. Just natural speech.]`;
      }
      
      // Prepare request body
      const requestBody = {
        contents: messages,
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: context?.conversationMode === 'speech' ? 150 : this.maxTokens,
          topP: 0.95,
          topK: 40,
        },
      };

      // ── Make API request via queue + retry ──────────────────────────────
      const response = await this._enqueue(() =>
        this._fetchWithRetry(
          `${this.apiUrl}?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        )
      );
      // ────────────────────────────────────────────────────────────────────

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Gemini API error:', errorData);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Extract response text
      let fullResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                          "I'm having trouble processing that right now. Could you try rephrasing?";

      // Clean response for voice if needed
      if (context?.conversationMode === 'speech' || context?.isVoiceInput) {
        fullResponse = this.cleanResponseForVoice(fullResponse);
      }

      // Call onStream if provided
      if (onStream) {
        onStream(fullResponse);
      }

      // Add assistant response to history with metadata
      const assistantMsg = {
        id: this.generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
        shouldSpeak: context?.conversationMode === 'speech' || context?.isVoiceInput,
        metadata: {
          dataFetched: fetchedData,
          dataRequest: dataRequest,
        },
      };
      this.conversationHistory.push(assistantMsg);

      // Return just the response string for compatibility
      return fullResponse;
    } catch (error) {
      console.error('Gemini API error:', error);
      
      if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      } else if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('Invalid API key. Please check your configuration.');
      } else if (error.message.includes('429')) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      } else {
        throw new Error('I ran into an issue. Please try again in a moment.');
      }
    }
  }

  // Clean response for voice output
  cleanResponseForVoice(text) {
    let cleaned = text;
    
    // Remove markdown
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // Bold
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1'); // Italic
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1'); // Code
    cleaned = cleaned.replace(/#{1,6}\s/g, ''); // Headers
    
    // Remove bullet points and numbers
    cleaned = cleaned.replace(/^\s*[-*•]\s/gm, '');
    cleaned = cleaned.replace(/^\s*\d+\.\s/gm, '');
    
    // Replace emojis with text equivalents or remove
    cleaned = cleaned.replace(/🎉/g, '');
    cleaned = cleaned.replace(/📊/g, '');
    cleaned = cleaned.replace(/📝/g, '');
    cleaned = cleaned.replace(/😊/g, '');
    cleaned = cleaned.replace(/👍/g, '');
    
    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  // Format fetched data for the prompt
  formatDataForPrompt(dataRequest, fetchedData) {
    let formattedData = '\n\n=== RETRIEVED DATA FOR YOUR RESPONSE ===\n';
    
    switch (dataRequest.type) {
      case 'notes':
        formattedData += `Total Notes: ${fetchedData.notes.length}\n`;
        formattedData += 'Notes Summary:\n';
        fetchedData.notes.forEach((note, index) => {
          formattedData += `${index + 1}. "${note.title}" (${note.subject || 'Uncategorized'})\n`;
          if (dataRequest.needsSubtopics && note.subtopics) {
            formattedData += `   Subtopics: ${note.subtopics.join(', ')}\n`;
          }
          if (note.tags) {
            formattedData += `   Tags: ${note.tags.join(', ')}\n`;
          }
        });
        break;
        
      case 'analytics':
        formattedData += `Study Stats (${dataRequest.timeframe}):\n`;
        formattedData += `- Total Hours: ${fetchedData.totalHours}\n`;
        formattedData += `- Sessions: ${fetchedData.sessionCount}\n`;
        formattedData += `- Current Streak: ${fetchedData.currentStreak} days\n`;
        formattedData += `- Focus Score: ${fetchedData.focusScore}/100\n`;
        if (fetchedData.topSubjects) {
          formattedData += `- Top Subjects: ${fetchedData.topSubjects.join(', ')}\n`;
        }
        break;
        
      case 'recordings':
        formattedData += `Total Recordings: ${fetchedData.recordings.length}\n`;
        fetchedData.recordings.forEach((rec, index) => {
          formattedData += `${index + 1}. ${rec.title} (${rec.duration})\n`;
        });
        break;
        
      case 'classroom':
        formattedData += `Assignments:\n`;
        if (fetchedData.assignments && fetchedData.assignments.length > 0) {
          fetchedData.assignments.forEach((assignment, index) => {
            formattedData += `${index + 1}. ${assignment.title} - Due: ${assignment.dueDate}\n`;
          });
        } else {
          formattedData += 'No upcoming assignments\n';
        }
        break;
        
      case 'achievements':
        formattedData += `Achievements Unlocked: ${fetchedData.achievements.length}\n`;
        fetchedData.achievements.forEach((achievement, index) => {
          formattedData += `${index + 1}. ${achievement.name} - ${achievement.description}\n`;
        });
        break;
    }
    
    formattedData += '\nUse this data to provide a detailed, helpful response. Be specific and reference the actual numbers and details.';
    
    return formattedData;
  }

  // Enhanced action detection
  detectAction(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Navigation actions (same as before, keeping for completeness)
    if (lowerMessage.match(/\b(go|take|show|open|back|return).*home\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'HomeScreen' }};
    }
    
    if (lowerMessage.match(/\b(start|begin|open).*record/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'RecordScreen' }};
    }
    
    if (lowerMessage.match(/\b(show|view|open|see|go to).*notes?\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'NotesScreen' }};
    }
    
    if (lowerMessage.match(/\b(show|view|open|go to).*profile\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'ProfileScreen' }};
    }
    
    if (lowerMessage.match(/\b(sync|open|show|go to).*(classroom|google classroom)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'SyncClassroomScreen' }};
    }
    
    if (lowerMessage.match(/\b(upload|add|import).*(pdf|document)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'UploadPDFScreen' }};
    }
    
    if (lowerMessage.match(/\b(show|view|manage|check).*(subscription|plan)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'SubscriptionPlanScreen' }};
    }
    
    if (lowerMessage.match(/\b(show|view|manage|add).*(payment|billing)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'PaymentMethodsScreen' }};
    }
    
    if (lowerMessage.match(/\b(show|view|check|open).*notifications?\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'NotificationsScreen' }};
    }
    
    if (lowerMessage.match(/\b(help|support|contact|assistance)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'HelpSupportScreen' }};
    }
    
    if (lowerMessage.match(/\b(sell|marketplace).*(notes?|materials?)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'SellNotesScreen' }};
    }
    
    if (lowerMessage.match(/\b(paired|connected).*(devices?|gadgets?)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'PairedDevicesScreen' }};
    }
    
    if (lowerMessage.match(/\bprivacy.*(settings?|policy)?\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'PrivacyScreen' }};
    }
    
    if (lowerMessage.match(/\b(app\s+)?(settings?|preferences?)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'PrefferencesScreen' }};
    }
    
    if (lowerMessage.match(/\b(dark\s+mode|theme|appearance)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'DarkModeScreen' }};
    }
    
    if (lowerMessage.match(/\b(reset|change).*(password|pass)\b/i)) {
      return { hasAction: true, actionType: 'navigate', parameters: { screen: 'ResetPasswordScreen' }};
    }
    
    // Recording actions
    if (lowerMessage.match(/\bstart record(ing)?\b/i) && !lowerMessage.includes('screen')) {
      return { hasAction: true, actionType: 'startRecording' };
    }
    
    if (lowerMessage.match(/\bstop record(ing)?\b/i)) {
      return { hasAction: true, actionType: 'stopRecording' };
    }
    
    // Timer actions
    if (lowerMessage.match(/\b(start|begin).*(pomodoro|timer)\b/i)) {
      return { hasAction: true, actionType: 'startPomodoro' };
    }
    
    return { hasAction: false };
  }

  // Execute action
  async executeAction(action) {
    if (!action.hasAction) return null;

    try {
      switch (action.actionType) {
        case 'navigate':
          if (this.navigation && action.parameters?.screen) {
            this.navigation.navigate(action.parameters.screen);
            return { success: true, message: `Navigated to ${action.parameters.screen}` };
          }
          return { success: false, message: 'Navigation not available' };

        case 'startRecording':
        case 'stopRecording':
        case 'startPomodoro':
          return { success: true, requiresComponent: true, actionType: action.actionType };

        default:
          return { success: false, message: 'Unknown action' };
      }
    } catch (error) {
      console.error('Error executing action:', error);
      return { success: false, message: 'Failed to execute action' };
    }
  }

  // Utility methods
  getConversationHistory() {
    return [...this.conversationHistory];
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  loadHistory(messages) {
    this.conversationHistory = messages;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async summarizeHistory() {
    if (this.conversationHistory.length > 20) {
      const oldMessages = this.conversationHistory.slice(0, -10);
      const recentMessages = this.conversationHistory.slice(-10);
      
      const summaryPrompt = `Summarize this conversation history concisely:\n${
        oldMessages.map(m => `${m.role}: ${m.content}`).join('\n')
      }`;
      
      try {
        const messages = [{ role: 'user', parts: [{ text: summaryPrompt }] }];
        
        // Use queue + retry for the summarize call too
        const response = await this._enqueue(() =>
          this._fetchWithRetry(
            `${this.apiUrl}?key=${this.apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: messages,
                generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
              }),
            }
          )
        );
        
        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        this.conversationHistory = [
          {
            id: this.generateId(),
            role: 'system',
            content: `Previous conversation summary: ${summary}`,
            timestamp: new Date(),
          },
          ...recentMessages,
        ];
      } catch (error) {
        console.error('Error summarizing history:', error);
      }
    }
  }
}

export default GeminiService;