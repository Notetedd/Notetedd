import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  constructor(config) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: config.model || 'gemini-pro',
      generationConfig: {
        temperature: config.temperature || 0.7,
        maxOutputTokens: config.maxTokens || 1024,
      },
    });
    
    this.conversationHistory = [];
    this.systemPrompt = this.createSystemPrompt();
  }

  // Create comprehensive system prompt for Tedd
  createSystemPrompt() {
    return `You are Tedd, a friendly and helpful AI study assistant for the Notetedd app. Your personality is:
- Warm, encouraging, and supportive
- Concise but informative (keep responses brief for voice)
- Patient and understanding with students
- Enthusiastic about learning and productivity

Your capabilities:
1. Help users navigate the Notetedd app
2. Answer questions about their study materials and notes
3. Provide study tips and motivation
4. Execute app commands (recording, timers, navigation)
5. Summarize course materials from Google Classroom
6. Track and celebrate user achievements

App Features You Can Help With:
- Audio recording of lectures
- Note-taking and organization
- Google Classroom integration
- Study analytics and streaks
- Pomodoro timer
- PDF uploads
- Achievement tracking
- QR code scanning

Navigation Commands You Understand:
- "Show me my notes" → Navigate to Notes screen
- "Start recording" → Begin audio recording
- "Go to Google Classroom" → Open Classroom integration
- "Show my progress" → Display analytics
- "Start a Pomodoro" → Launch timer
- "Open [course name]" → Navigate to specific course

Response Guidelines:
- Keep responses SHORT for voice interaction (2-3 sentences max)
- If asked to perform an action, confirm before executing
- Use natural, conversational language
- Celebrate achievements and encourage study habits
- If you don't know something, admit it honestly
- For complex explanations, offer to show on screen or break into steps

When responding:
- Prioritize clarity and brevity
- Use encouraging language
- Reference user's context when relevant (current screen, recent activity)
- Suggest next actions when appropriate`;
  }

  // Build context-aware prompt
  buildContextualPrompt(userMessage, context) {
    let contextInfo = '';
    
    if (context) {
      contextInfo = `\n\nCurrent Context:`;
      contextInfo += `\n- Screen: ${context.currentScreen}`;
      
      if (context.userName) {
        contextInfo += `\n- User: ${context.userName}`;
      }
      
      if (context.currentNote) {
        contextInfo += `\n- Viewing Note: "${context.currentNote.title}"`;
      }
      
      if (context.studyAnalytics) {
        contextInfo += `\n- Study Streak: ${context.studyAnalytics.currentStreak} days`;
        contextInfo += `\n- Total Study Hours: ${context.studyAnalytics.totalHours}`;
      }
      
      if (context.recentActivity && context.recentActivity.length > 0) {
        contextInfo += `\n- Recent Activity: ${context.recentActivity[0].description}`;
      }
    }
    
    return contextInfo;
  }

  // Send message to Gemini and get response
  async sendMessage(userMessage, context, onStream) {
    try {
      // Add user message to history
      const userMsg = {
        id: this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      };
      this.conversationHistory.push(userMsg);

      // Build full prompt with context
      const contextualInfo = this.buildContextualPrompt(userMessage, context);
      const fullPrompt = `${this.systemPrompt}\n${contextualInfo}\n\nUser: ${userMessage}\n\nTedd:`;

      // Convert conversation history to Gemini format
      const chatHistory = this.conversationHistory.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Start chat with history
      const chat = this.model.startChat({
        history: chatHistory.slice(0, -1), // Exclude the current message
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      });

      let fullResponse = '';

      if (onStream) {
        // Streaming response
        const result = await chat.sendMessageStream(fullPrompt);
        
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullResponse += chunkText;
          onStream(chunkText);
        }
      } else {
        // Non-streaming response
        const result = await chat.sendMessage(fullPrompt);
        fullResponse = result.response.text();
      }

      // Add assistant response to history
      const assistantMsg = {
        id: this.generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
      };
      this.conversationHistory.push(assistantMsg);

      return fullResponse;
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to get response from Tedd. Please try again.');
    }
  }

  // Detect if message contains an action/command
  detectAction(message) {
    const lowerMessage = message.toLowerCase();
    
    // Navigation actions
    if (lowerMessage.includes('show') || lowerMessage.includes('go to') || lowerMessage.includes('open')) {
      if (lowerMessage.includes('note')) {
        return { hasAction: true, actionType: 'navigate', parameters: { screen: 'Notesscreen' } };
      }
      if (lowerMessage.includes('recording')) {
        return { hasAction: true, actionType: 'navigate', parameters: { screen: 'RecordScreen' } };
      }
      if (lowerMessage.includes('classroom')) {
        return { hasAction: true, actionType: 'navigate', parameters: { screen: 'QuizScreen' } };
      }
      if (lowerMessage.includes('progress') || lowerMessage.includes('analytics')) {
        return { hasAction: true, actionType: 'navigate', parameters: { screen: 'Analytics' } };
      }
    }
    
    // Recording actions
    if (lowerMessage.includes('start recording') || lowerMessage.includes('record')) {
      return { hasAction: true, actionType: 'startRecording' };
    }
    if (lowerMessage.includes('stop recording')) {
      return { hasAction: true, actionType: 'stopRecording' };
    }
    
    // Timer actions
    if (lowerMessage.includes('pomodoro') || lowerMessage.includes('timer')) {
      return { hasAction: true, actionType: 'startPomodoro' };
    }
    
    return { hasAction: false };
  }

  // Get conversation history
  getConversationHistory() {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }

  // Load conversation history (from Firebase)
  loadHistory(messages) {
    this.conversationHistory = messages;
  }

  // Generate unique ID
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Summarize old conversations to save context window
  async summarizeHistory() {
    if (this.conversationHistory.length > 20) {
      // Keep only last 10 messages and summarize the rest
      const oldMessages = this.conversationHistory.slice(0, -10);
      const recentMessages = this.conversationHistory.slice(-10);
      
      const summaryPrompt = `Summarize this conversation history concisely:\n${
        oldMessages.map(m => `${m.role}: ${m.content}`).join('\n')
      }`;
      
      try {
        const result = await this.model.generateContent(summaryPrompt);
        const summary = result.response.text();
        
        // Replace old messages with summary
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