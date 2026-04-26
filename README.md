Notetedd Version 1 

/**
 
 *
 * ─── API KEY SECURITY GUIDE ───────────────────────────────────────────────────
 *
 * ❌ NEVER do this (exposed in bundle, visible to anyone who extracts the APK):
 *    const ASSEMBLYAI_API_KEY = "83b66f41846a49c19d62893c24e0ce34";
 *
 * ✅ CORRECT approaches (choose one):
 *
 * 1. EXPO (Recommended for this project):
 *    - Create a `.env` file at project root (add to .gitignore!)
 *      EXPO_PUBLIC_ASSEMBLYAI_KEY=your_key_here   ← exposed to client (acceptable for AssemblyAI)
 *    - Access via: process.env.EXPO_PUBLIC_ASSEMBLYAI_KEY
 *    - For truly secret keys (Firebase admin, payment), use a backend proxy instead.
 *
 * 2. BACKEND PROXY (Most secure — recommended for production):
 *    - Stand up a small Express/Firebase Function endpoint.
 *    - Your app sends audio → your server → AssemblyAI.
 *    - The AssemblyAI key NEVER leaves your server.
 *    - Example route: POST /api/transcribe  { audioBase64 } → { transcription }
 *
 * 3. EAS SECRETS (Expo Application Services):
 *    - `eas secret:create --scope project --name ASSEMBLYAI_KEY --value your_key`
 *    - Injected at build time, not in source code.
 *    - Best for CI/CD pipelines.
 *
 * ─── .env example ─────────────────────────────────────────────────────────────
 *    EXPO_PUBLIC_ASSEMBLYAI_KEY=your_assemblyai_key
 *    EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_key
 *
 * ─── .gitignore ───────────────────────────────────────────────────────────────
 *    .env
 *    .env.local
 *    .env.production
 * ─────────────────────────────────────────────────────────────────────────────
 */
