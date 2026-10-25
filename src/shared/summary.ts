/** Shared defaults and limits for the transcript summary feature. */

export const DEFAULT_SUMMARY_PROMPT = [
  'You receive the transcript of a short video, one caption per line with its time in the clip.',
  'Find the main point of the video and the one or two facts or quotes that support it.',
  'Write a short social media post (at most 280 characters) that states that point clearly.',
  'Then add up to three bullet points with the key takeaways.',
  'Write in the language of the transcript. Do not invent facts that are not in the transcript.',
  'Return plain text only, without a preamble.'
].join('\n');

/** Longest system prompt main accepts. */
export const MAX_SUMMARY_PROMPT_CHARS = 8000;

/** Longest transcript text (sum of segment texts) main accepts in one request. */
export const MAX_SUMMARY_TRANSCRIPT_CHARS = 100_000;
