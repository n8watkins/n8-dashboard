import type { Timestamp } from 'firebase/firestore'
import type { SuggestionStatus } from './config'

// ─── Firestore document shapes ────────────────────────────────────────────────

export interface SuggestionDoc {
  timestamp: Timestamp
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
}

// Client-side shape (id included, Timestamp as Date)
export interface Suggestion extends Omit<SuggestionDoc, 'timestamp'> {
  id: string
  timestamp: Date
  timestampSort: number
}

export interface ActivityLogDoc {
  timestamp: Timestamp
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
}
