// ─── App config (mirrors your Google Apps Script CONFIG) ─────────────────────

export const ADMIN_EMAILS = [
  'nathancwatkins23@gmail.com',
  'nastyn8plays@gmail.com',
]

export const NOTIFY_EMAIL = 'nastyn8plays@gmail.com'

export const CATEGORY_OPTIONS = [
  'Live stream',
  'Video / Shorts',
  'Discord',
  'Emotes / graphics',
  'Coaching / Sweat Lab',
  'Events / community games',
  'Website / links / resources',
  'Other',
] as const

export const TYPE_OPTIONS = [
  'New idea',
  'Improvement',
  'Problem / bug',
  'Rules / moderation',
  'Content idea',
  'Community request',
  'Question',
  'Other',
] as const

export const SOURCE_OPTIONS = [
  'Stream chat',
  'Twitch profile / About page',
  'YouTube stream page / description',
  'YouTube video description',
  'Discord',
] as const

export const STATUS_OPTIONS = [
  'New',
  'Active',
  'Done',
  'Duplicate',
  'Rejected',
] as const

export type SuggestionStatus = (typeof STATUS_OPTIONS)[number]
export type SuggestionCategory = (typeof CATEGORY_OPTIONS)[number]
export type SuggestionType = (typeof TYPE_OPTIONS)[number]
export type SuggestionSource = (typeof SOURCE_OPTIONS)[number]

// ─── Field length limits (used by both client form and /api/submit) ───────────
export const FIELD_LIMITS = {
  suggestion: { min: 20, max: 2000 },
  why:        { min: 10, max: 1000 },
  extra:      { min: 0,  max: 500  },
  username:   { min: 0,  max: 100  },
} as const
