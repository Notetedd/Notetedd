

// ── API Keys ──────────────────────────────────────────────────────────────────
const GROQ_API_KEY   = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// ── Model defaults ─────────────────────────────────────────────────────────────
const GROQ_DEFAULT_MODEL   = 'llama-3.3-70b-versatile'; // best free-tier Groq model
const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

// ── Endpoints ──────────────────────────────────────────────────────────────────
const GROQ_ENDPOINT   = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

class AIService {
  constructor(config = {}) {
    // Constructor overrides take priority; env vars are the fallback
    this.groqApiKey   = config.groqApiKey   || GROQ_API_KEY;
    this.geminiApiKey = config.geminiApiKey || config.apiKey || GEMINI_API_KEY;

    this.groqModel   = config.groqModel   || GROQ_DEFAULT_MODEL;
    this.geminiModel = config.geminiModel || config.model || GEMINI_DEFAULT_MODEL;

    this.temperature = config.temperature ?? 0.7;
    this.maxTokens   = config.maxTokens   ?? 1024;

    // ── Internal state ─────────────────────────────────────────────────────
    this.conversationHistory = [];
    this.systemPrompt        = this.createSystemPrompt();
    this.navigation          = null;
    this.dataService         = null;
    this.activeProvider      = null; // 'groq' | 'gemini' | null

    // ── Request queue (prevents hammering either API) ──────────────────────
    this._requestQueue       = [];
    this._isProcessingQueue  = false;
    this._lastRequestTime    = 0;
    this._minRequestInterval = 500; // ms – Groq is fast; 500 ms is comfortable
  }

  // ── Public setters ─────────────────────────────────────────────────────────
  setNavigation(navigation)   { this.navigation  = navigation; }
  setDataService(dataService) { this.dataService = dataService; }
  getActiveProvider()         { return this.activeProvider; }

  // ══════════════════════════════════════════════════════════════════════════
  //  PROVIDER LAYER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call Groq via its OpenAI-compatible REST endpoint.
   * Expects messages in OpenAI format: [{role, content}]
   */
  async _callGroq(messages, maxTokens) {
    if (!this.groqApiKey) {
      throw new Error('EXPO_PUBLIC_GROQ_API_KEY is not set in your .env file.');
    }

    const response = await this._fetchWithRetry(GROQ_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model:       this.groqModel,
        messages,                    // OpenAI format
        temperature: this.temperature,
        max_tokens:  maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Groq ${response.status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq returned an empty response.');
    return text;
  }

  /**
   * Call Gemini via generateContent.
   * Expects messages in Gemini format: [{role:'user'|'model', parts:[{text}]}]
   */
  async _callGemini(messages, maxTokens) {
    if (!this.geminiApiKey) {
      throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set in your .env file.');
    }

    const url = `${GEMINI_ENDPOINT(this.geminiModel)}?key=${this.geminiApiKey}`;

    const response = await this._fetchWithRetry(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          temperature:     this.temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Gemini ${response.status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  /**
   * Convert Gemini-format messages → OpenAI/Groq format.
   *   Gemini: [{role:'user'|'model', parts:[{text:'...'}]}]
   *   Groq:   [{role:'system'|'user'|'assistant', content:'...'}]
   */
  _toGroqFormat(geminiMessages) {
    return geminiMessages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: Array.isArray(m.parts)
        ? m.parts.map((p) => p.text ?? '').join('')
        : (m.content ?? ''),
    }));
  }

  /**
   * Primary dispatch: try Groq first, fall back to Gemini.
   * Always accepts messages in Gemini format; converts for Groq internally.
   * Returns { text, provider }.
   */
  async _dispatch(geminiMessages, maxTokens) {
    // ── Groq ──────────────────────────────────────────────────────────────
    if (this.groqApiKey) {
      try {
        const groqMessages = this._toGroqFormat(geminiMessages);
        const text = await this._enqueue(() => this._callGroq(groqMessages, maxTokens));
        this.activeProvider = 'groq';
        console.log('[AIService] ✓ Groq responded');
        return { text, provider: 'groq' };
      } catch (groqErr) {
        console.warn('[AIService] Groq failed – falling back to Gemini:', groqErr.message);
      }
    }

    // ── Gemini fallback ───────────────────────────────────────────────────
    if (this.geminiApiKey) {
      try {
        const text = await this._enqueue(() => this._callGemini(geminiMessages, maxTokens));
        this.activeProvider = 'gemini';
        console.log('[AIService] ✓ Gemini responded (fallback)');
        return { text, provider: 'gemini' };
      } catch (geminiErr) {
        console.error('[AIService] Gemini also failed:', geminiErr.message);
        throw geminiErr;
      }
    }

    throw new Error(
      'No AI provider is configured. ' +
      'Add EXPO_PUBLIC_GROQ_API_KEY and/or EXPO_PUBLIC_GEMINI_API_KEY to your .env file.'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RATE-LIMIT & QUEUE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  async _fetchWithRetry(url, options, maxRetries = 4, retryDelay = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, options);
      if (response.status !== 429) return response;
      if (attempt === maxRetries) return response;

      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : retryDelay * Math.pow(2, attempt);

      console.warn(
        `[AIService] Rate-limited (429). Retrying in ${waitMs / 1000}s… (${attempt + 1}/${maxRetries})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  _enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._requestQueue.push({ fn, resolve, reject });
      if (!this._isProcessingQueue) this._processQueue();
    });
  }

  async _processQueue() {
    this._isProcessingQueue = true;
    while (this._requestQueue.length > 0) {
      const { fn, resolve, reject } = this._requestQueue.shift();
      const elapsed = Date.now() - this._lastRequestTime;
      if (elapsed < this._minRequestInterval) {
        await new Promise((r) => setTimeout(r, this._minRequestInterval - elapsed));
      }
      try {
        this._lastRequestTime = Date.now();
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }
    this._isProcessingQueue = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SYSTEM PROMPT
  // ══════════════════════════════════════════════════════════════════════════

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
1. Access & Analyze Notes: Read all notes, identify topics, subtopics, key concepts
2. Track Study Progress: Show study hours, streaks, session counts, patterns
3. Review Recordings: Access lecture recordings and provide summaries
4. Monitor Google Classroom: Check assignments, deadlines, course materials
5. Provide Insights: Analyze study patterns, identify weak areas, suggest improvements
6. Navigate the App: Take users directly to relevant screens, announce navigation clearly
7. Manage Study Sessions: Start timers, recordings, organize materials

NAVIGATION ANNOUNCEMENTS (for voice mode):
- Always say what you're doing: "Opening your Notes now..." or "Taking you to your Profile..."
- After navigating, briefly describe what the user will find on that screen
- When context-aware: "Since you mentioned Biology, I'm taking you straight to those notes."

WHEN USERS ASK ABOUT THEIR DATA:
✅ DO: "Let me check your notes... I found 12 notes across 5 subjects. Here are the main topics..."
✅ DO: "Looking at your study stats this week... You've studied 8.5 hours with a 5-day streak!"
❌ DON'T: "I don't have access to your notes"
❌ DON'T: "As an AI, I cannot see your data"

RESPONSE STYLE:
- Data requests: Acknowledge → Fetch → Analyze → Present → Suggest next action
- Navigation: Announce destination → Execute → Describe what's there
- Voice mode: 2-4 natural spoken sentences, no markdown, no lists, no emojis
- Text mode: Can be richer — use structure where helpful

EXAMPLE CONVERSATIONS:
User: "Check the notes I have and list the subtopics"
Tedd: "Let me review your notes... I found 8 notes in your Mathematics folder. The main subtopics are: Linear Equations (3 notes), Quadratic Functions (2 notes), Trigonometry (2 notes), and Calculus Basics (1 note). Want me to dive deeper into any of these?"

User: "Tell me my stats this week"
Tedd: "Here's your weekly summary! You've studied for 12.3 hours across 18 sessions. Your current streak is 6 days. You focused most on Computer Science (5.2 hours) and Mathematics (4.1 hours). You're 40% above your weekly goal — amazing work!"

User: "What's due soon?"
Tedd: "Checking your Google Classroom... You have 3 assignments due: Biology Lab Report (due tomorrow), Math Problem Set (due in 3 days), and History Essay (due Friday). Need help with any of these?"`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTEXT BUILDING
  // ══════════════════════════════════════════════════════════════════════════

  async buildContextualPrompt(userMessage, context) {
    let info = '\n\nCURRENT APP STATE:';

    if (context) {
      info += `\n- Current Screen: ${context.currentScreen || 'Home'}`;
      if (context.userName) info += `\n- User: ${context.userName}`;

      if (this.dataService) {
        info += '\n\nDATA AVAILABLE TO YOU:';
        const avail = await this.dataService.checkAvailability();
        if (avail.notes)      info += `\n- Notes: ${avail.notesCount} notes available`;
        if (avail.recordings) info += `\n- Recordings: ${avail.recordingsCount} recordings`;
        if (avail.analytics)  info += '\n- Study Analytics: Available';
        if (avail.classroom)  info += '\n- Google Classroom: Connected';
      }

      if (context.currentNote)
        info += `\n- Currently Viewing: "${context.currentNote.title}"`;
      if (context.recentActivity?.length > 0)
        info += `\n- Recent: ${context.recentActivity[0].description}`;
    }

    return info;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DATA DETECTION & FETCHING
  // ══════════════════════════════════════════════════════════════════════════

  detectDataRequest(message) {
    const lm = message.toLowerCase();

    if (
      lm.match(/\b(check|show|list|see|view|tell|what).*(notes?|subtopics?|topics?)\b/i) ||
      lm.match(/\bmy notes?\b/i)
    ) {
      return {
        type: 'notes',
        action: 'list_with_analysis',
        needsSubtopics: lm.includes('subtopic') || lm.includes('sub-topic'),
      };
    }

    if (
      lm.match(/\b(my|show|tell|check).*(stats?|statistics|progress|analytics)\b/i) ||
      lm.match(/\bhow.*(much|long|many).*(studied|study)\b/i) ||
      lm.match(/\bthis (week|month|day)\b/i)
    ) {
      return { type: 'analytics', action: 'show_stats', timeframe: this._extractTimeframe(lm) };
    }

    if (lm.match(/\b(my|show|list).*(recordings?|lectures?|audio)\b/i))
      return { type: 'recordings', action: 'list_recordings' };

    if (
      lm.match(/\b(what|show|check|any).*(due|deadline|assignment|homework)\b/i) ||
      lm.match(/\bgoogle classroom\b/i)
    ) {
      return { type: 'classroom', action: 'check_assignments' };
    }

    if (lm.match(/\b(my|current)?.*(streak|habit|consistency)\b/i))
      return { type: 'analytics', action: 'show_streak' };

    if (lm.match(/\b(my|show).*(achievements?|badges?|milestones?)\b/i))
      return { type: 'achievements', action: 'show_achievements' };

    return null;
  }

  _extractTimeframe(message) {
    if (message.includes('today'))                              return 'today';
    if (message.includes('week') || message.includes('weekly')) return 'week';
    if (message.includes('month') || message.includes('monthly')) return 'month';
    if (message.includes('year') || message.includes('yearly')) return 'year';
    return 'week';
  }

  async fetchAppData(dataRequest) {
    if (!this.dataService) return { error: 'Data service not available' };
    try {
      switch (dataRequest.type) {
        case 'notes':        return await this.dataService.getNotes(dataRequest);
        case 'analytics':    return await this.dataService.getAnalytics(dataRequest.timeframe);
        case 'recordings':   return await this.dataService.getRecordings();
        case 'classroom':    return await this.dataService.getClassroomData();
        case 'achievements': return await this.dataService.getAchievements();
        default:             return null;
      }
    } catch (err) {
      console.error('[AIService] fetchAppData error:', err);
      return { error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MESSAGE BUILDING  (always Gemini format; Groq converts internally)
  // ══════════════════════════════════════════════════════════════════════════

  async buildMessages(userMessage, context) {
    const contextInfo   = await this.buildContextualPrompt(userMessage, context);
    const systemMessage = `${this.systemPrompt}${contextInfo}`;

    // Seed the system persona as a fake exchange so it works for both providers
    const messages = [
      { role: 'user',  parts: [{ text: systemMessage }] },
      {
        role: 'model',
        parts: [{ text: "Understood! I'm Tedd, your study assistant. I have full access to your notes, stats, recordings, and Google Classroom. Ready to help!" }],
      },
    ];

    // Last 8 turns of history
    for (const msg of this.conversationHistory.slice(-8)) {
      messages.push({
        role:  msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Current user turn
    messages.push({ role: 'user', parts: [{ text: userMessage }] });
    return messages;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN: sendMessage
  // ══════════════════════════════════════════════════════════════════════════

  async sendMessage(userMessage, context, onStream) {
    try {
      // Record user turn
      this.conversationHistory.push({
        id:           this.generateId(),
        role:         'user',
        content:      userMessage,
        timestamp:    new Date(),
        isVoiceInput: context?.isVoiceInput || false,
      });

      // Detect and fetch any required app data
      const dataRequest = this.detectDataRequest(userMessage);
      const fetchedData = dataRequest ? await this.fetchAppData(dataRequest) : null;

      // Build messages (Gemini format; Groq conversion happens in _dispatch)
      const messages = await this.buildMessages(userMessage, context);

      // Inject fetched data into the last user turn
      if (fetchedData && !fetchedData.error) {
        messages[messages.length - 1].parts[0].text +=
          `\n\n${this.formatDataForPrompt(dataRequest, fetchedData)}`;
      }

      // Voice mode constraint
      const voiceMode = context?.conversationMode === 'speech' || context?.isVoiceInput;
      if (voiceMode) {
        messages[messages.length - 1].parts[0].text +=
          '\n\n[VOICE MODE: Reply in 2-3 natural spoken sentences only. No markdown, no bullet points, no emojis.]';
      }

      const maxTok = voiceMode ? 150 : this.maxTokens;

      // ── Groq → Gemini dispatch ──────────────────────────────────────────
      const { text: rawResponse, provider } = await this._dispatch(messages, maxTok);
      const fullResponse = voiceMode ? this.cleanResponseForVoice(rawResponse) : rawResponse;

      if (onStream) onStream(fullResponse);

      // Record assistant turn
      this.conversationHistory.push({
        id:          this.generateId(),
        role:        'assistant',
        content:     fullResponse,
        timestamp:   new Date(),
        shouldSpeak: voiceMode,
        provider,
        metadata: { dataFetched: fetchedData, dataRequest },
      });

      return fullResponse;
    } catch (error) {
      console.error('[AIService] sendMessage error:', error);

      if (error.message.includes('fetch') || error.message.toLowerCase().includes('network'))
        throw new Error('Network error. Please check your internet connection.');
      if (error.message.includes('401') || error.message.includes('403'))
        throw new Error('Invalid API key. Check EXPO_PUBLIC_GROQ_API_KEY / EXPO_PUBLIC_GEMINI_API_KEY in your .env.');
      if (error.message.includes('429'))
        throw new Error('Too many requests. Please wait a moment and try again.');

      throw new Error('I ran into an issue. Please try again in a moment.');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VOICE RESPONSE CLEANING
  // ══════════════════════════════════════════════════════════════════════════

  cleanResponseForVoice(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')        // **bold**
      .replace(/\*([^*]+)\*/g,     '$1')        // *italic*
      .replace(/`([^`]+)`/g,       '$1')        // `code`
      .replace(/#{1,6}\s/g,        '')          // ## Headings
      .replace(/^\s*[-*•]\s/gm,    '')          // - bullets
      .replace(/^\s*\d+\.\s/gm,    '')          // 1. lists
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')   // emojis
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DATA → PROMPT FORMATTER
  // ══════════════════════════════════════════════════════════════════════════

  formatDataForPrompt(dataRequest, fetchedData) {
    let out = '\n=== RETRIEVED DATA — reference specific details in your response ===\n';

    switch (dataRequest.type) {
      case 'notes':
        out += `Total Notes: ${fetchedData.notes.length}\n`;
        fetchedData.notes.forEach((n, i) => {
          out += `${i + 1}. "${n.title}" (${n.subject || 'Uncategorized'})`;
          if (dataRequest.needsSubtopics && n.subtopics)
            out += ` — Subtopics: ${n.subtopics.join(', ')}`;
          if (n.tags?.length)
            out += ` — Tags: ${n.tags.join(', ')}`;
          out += '\n';
        });
        break;

      case 'analytics':
        out += `Study Stats (${dataRequest.timeframe}):\n`;
        out += `- Total Hours: ${fetchedData.totalHours}\n`;
        out += `- Sessions: ${fetchedData.sessionCount}\n`;
        out += `- Current Streak: ${fetchedData.currentStreak} days\n`;
        out += `- Focus Score: ${fetchedData.focusScore}/100\n`;
        if (fetchedData.topSubjects)
          out += `- Top Subjects: ${fetchedData.topSubjects.join(', ')}\n`;
        break;

      case 'recordings':
        out += `Total Recordings: ${fetchedData.recordings.length}\n`;
        fetchedData.recordings.forEach((r, i) =>
          (out += `${i + 1}. ${r.title} (${r.duration})\n`));
        break;

      case 'classroom':
        out += 'Upcoming Assignments:\n';
        if (fetchedData.assignments?.length) {
          fetchedData.assignments.forEach((a, i) =>
            (out += `${i + 1}. ${a.title} — Due: ${a.dueDate}\n`));
        } else {
          out += 'No upcoming assignments.\n';
        }
        break;

      case 'achievements':
        out += `Achievements Unlocked: ${fetchedData.achievements.length}\n`;
        fetchedData.achievements.forEach((a, i) =>
          (out += `${i + 1}. ${a.name} — ${a.description}\n`));
        break;
    }

    out += '=== END DATA ===\n';
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTION DETECTION
  // ══════════════════════════════════════════════════════════════════════════

  detectAction(message) {
    const m   = message.toLowerCase().trim();
    const nav = (screen) => ({ hasAction: true, actionType: 'navigate', parameters: { screen } });

    if (m.match(/\b(go|take|show|open|back|return).*home\b/i))                return nav('HomeScreen');
    if (m.match(/\b(start|begin|open).*record/i))                              return nav('RecordScreen');
    if (m.match(/\b(show|view|open|see|go to).*notes?\b/i))                   return nav('NotesScreen');
    if (m.match(/\b(show|view|open|go to).*profile\b/i))                      return nav('ProfileScreen');
    if (m.match(/\b(sync|open|show|go to).*(classroom|google classroom)\b/i)) return nav('SyncClassroomScreen');
    if (m.match(/\b(upload|add|import).*(pdf|document)\b/i))                  return nav('UploadPDFScreen');
    if (m.match(/\b(show|view|manage|check).*(subscription|plan)\b/i))        return nav('SubscriptionPlanScreen');
    if (m.match(/\b(show|view|manage|add).*(payment|billing)\b/i))            return nav('PaymentMethodsScreen');
    if (m.match(/\b(show|view|check|open).*notifications?\b/i))               return nav('NotificationsScreen');
    if (m.match(/\b(help|support|contact|assistance)\b/i))                    return nav('HelpSupportScreen');
    if (m.match(/\b(sell|marketplace).*(notes?|materials?)\b/i))              return nav('SellNotesScreen');
    if (m.match(/\b(paired|connected).*(devices?|gadgets?)\b/i))              return nav('PairedDevicesScreen');
    if (m.match(/\bprivacy.*(settings?|policy)?\b/i))                         return nav('PrivacyScreen');
    if (m.match(/\b(app\s+)?(settings?|preferences?)\b/i))                    return nav('PrefferencesScreen');
    if (m.match(/\b(dark\s+mode|theme|appearance)\b/i))                       return nav('DarkModeScreen');
    if (m.match(/\b(reset|change).*(password|pass)\b/i))                      return nav('ResetPasswordScreen');

    if (m.match(/\bstart record(ing)?\b/i) && !m.includes('screen'))
      return { hasAction: true, actionType: 'startRecording' };
    if (m.match(/\bstop record(ing)?\b/i))
      return { hasAction: true, actionType: 'stopRecording' };
    if (m.match(/\b(start|begin).*(pomodoro|timer)\b/i))
      return { hasAction: true, actionType: 'startPomodoro' };

    return { hasAction: false };
  }

  async executeAction(action) {
    if (!action.hasAction) return null;
    try {
      if (action.actionType === 'navigate') {
        if (this.navigation && action.parameters?.screen) {
          this.navigation.navigate(action.parameters.screen);
          return { success: true, message: `Navigated to ${action.parameters.screen}` };
        }
        return { success: false, message: 'Navigation not available' };
      }
      // startRecording / stopRecording / startPomodoro — handled by component
      return { success: true, requiresComponent: true, actionType: action.actionType };
    } catch (err) {
      return { success: false, message: 'Failed to execute action' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UTILITY
  // ══════════════════════════════════════════════════════════════════════════

  getConversationHistory() { return [...this.conversationHistory]; }
  clearHistory()           { this.conversationHistory = []; }
  loadHistory(messages)    { this.conversationHistory = messages; }
  generateId()             { return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; }

  async summarizeHistory() {
    if (this.conversationHistory.length <= 20) return;

    const old    = this.conversationHistory.slice(0, -10);
    const recent = this.conversationHistory.slice(-10);
    const prompt = `Summarize this conversation concisely (2-3 sentences max):\n${
      old.map((m) => `${m.role}: ${m.content}`).join('\n')
    }`;

    try {
      const msgs = [{ role: 'user', parts: [{ text: prompt }] }];
      const { text } = await this._dispatch(msgs, 300);
      this.conversationHistory = [
        {
          id:        this.generateId(),
          role:      'system',
          content:   `Previous conversation summary: ${text}`,
          timestamp: new Date(),
        },
        ...recent,
      ];
    } catch (err) {
      console.error('[AIService] summarizeHistory error:', err);
    }
  }
}

export default AIService;