/** Limits for the user-written instructions added to transcript correction and translation prompts. */

/** Longest instructions text settings keep and main accepts. */
export const MAX_AI_INSTRUCTIONS_CHARS = 4000;

/** Longest per-project video context (what the clip is about) the project and main accept. */
export const MAX_VIDEO_CONTEXT_CHARS = 2000;

/**
 * Longest part of the video context sent as a transcription prompt. Whisper only
 * reads the last 224 tokens of its prompt, so a longer text would lose its start.
 */
export const MAX_TRANSCRIPTION_PROMPT_CHARS = 800;
