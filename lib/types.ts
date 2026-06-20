import type { SuggestionStatus } from './config'

// ─── Stored document shapes (DB row mirrors) ──────────────────────────────────

export interface SuggestionDoc {
  timestamp: Date
  category: string
  type: string
  suggestion: string
  why: string
  username: string
  extra: string
  source: string
  status: SuggestionStatus
  internalNotes: string
  preview: string  // first ~120 chars of suggestion text
  title: string    // first sentence, truncated to 58 chars
  resolutionNote?: string
  resolutionLink?: string
  moderationState?: 'clean' | 'flagged'
  moderationFlags?: string[]
}

// Client-side shape (id included, Timestamp as Date)
export interface Suggestion extends Omit<SuggestionDoc, 'timestamp'> {
  id: string
  timestamp: Date
  timestampSort: number
}

export interface ActivityLogDoc {
  timestamp: Date
  action: string
  actionSource: string
  suggestionId: string
  oldStatus: string
  newStatus: string
  oldNote: string
  newNote: string
  noteChanged: boolean
  category: string
  type: string
  source: string
  preview: string
  oldResolutionNote?: string
  newResolutionNote?: string
  resolutionChanged?: boolean
}

export interface ActivityLogEntry extends Omit<ActivityLogDoc, 'timestamp'> {
  id: string
  timestamp: Date
  timestampSort: number
}

// ─── Admin review payload ─────────────────────────────────────────────────────

export interface SaveReviewPayload {
  suggestionId: string
  status: SuggestionStatus
  internalNotes: string
  actionSource: 'queue' | 'browser'
  resolutionNote?: string
  resolutionLink?: string
}

// ─── Form submission payload (public form → API) ──────────────────────────────

export interface SubmitPayload {
  category: string
  type: string
  suggestion: string
  why: string
  username: string
  extra: string
  source: string
  hp?: string             // honeypot — must be empty; bots fill it
  turnstileToken?: string // Cloudflare Turnstile token (verified server-side)
}

// ─── Admin data-layer filters & stats (shared: server queries + client API) ───

export interface BrowseFilters {
  viewGroup: 'all' | 'new' | 'active' | 'resolved'
  category?: string
  type?: string
  source?: string
  status?: string
  search?: string
}

export interface Stats {
  all: number
  new: number
  active: number
  resolved: number
  flagged: number
}

export interface SourceStats {
  all:    number
  d7:     number
  d30:    number
  lastAt: Date | null
}

export interface LogFilters {
  search?: string
  year?: string
  monthKey?: string
  interaction?: string
  result?: string
  sortDirection?: 'asc' | 'desc'
  onlyWithNotes?: boolean
  onlyDecisions?: boolean
}
