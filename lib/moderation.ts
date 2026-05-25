// ─── Profanity / hate-speech moderation ──────────────────────────────────────
// Rule: hard slurs + hate-speech terms only. Mild profanity (damn, hell, shit,
// fuck used casually) is intentionally excluded — don't add it without user approval.

export const PROFANITY_LIST: readonly string[] = [
  // Racial / ethnic slurs
  'nigger', 'nigga', 'chink', 'gook', 'spic', 'spick', 'kike', 'wetback',
  'beaner', 'coon', 'jigaboo', 'porch monkey', 'raghead', 'towelhead',
  'zipperhead', 'cracker', 'honky', 'gringo',
  // Homophobic / transphobic slurs
  'faggot', 'fag', 'dyke', 'tranny', 'shemale',
  // Ableist slurs
  'retard', 'retarded',
  // General hate / harassment
  'nazi', 'white power', 'white supremacy', 'kkk',
]

/**
 * Returns matched terms from the word list found in the given text.
 * Returns an empty array if the text is clean.
 */
export function checkProfanity(text: string): string[] {
  if (!text) return []
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean))
  // Also check for multi-word phrases that may appear as substrings
  const fullText = normalized
  return PROFANITY_LIST.filter(term => {
    if (term.includes(' ')) return fullText.includes(term)
    return tokens.has(term)
  })
}
