// ─── Drizzle schema (libSQL / Turso) ─────────────────────────────────────────
// Server-side only. Two groups of tables:
//   1. App data — ported from the Firestore collections (suggestions,
//      activity_log, rate_limit).
//   2. Better Auth — user/session/account/verification (magic-link auth).
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ─── App: suggestions ────────────────────────────────────────────────────────
// `id` preserves the original Firestore doc IDs so Discord deep-links
// (/admin?id=…) and activity_log.suggestionId references still resolve.
export const suggestions = sqliteTable('suggestions', {
  id:              text('id').primaryKey(),
  timestamp:       integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  category:        text('category').notNull().default(''),
  type:            text('type').notNull().default(''),
  suggestion:      text('suggestion').notNull().default(''),
  why:             text('why').notNull().default(''),
  username:        text('username').notNull().default(''),
  extra:           text('extra').notNull().default(''),
  source:          text('source').notNull().default(''),
  status:          text('status').notNull().default('New'),
  internalNotes:   text('internal_notes').notNull().default(''),
  preview:         text('preview').notNull().default(''),
  title:           text('title').notNull().default(''),
  resolutionNote:  text('resolution_note'),
  resolutionLink:  text('resolution_link'),
  moderationState: text('moderation_state').notNull().default('clean'),
  moderationFlags: text('moderation_flags', { mode: 'json' }).$type<string[]>().notNull(),
}, t => [
  index('idx_suggestions_status_ts').on(t.status, t.timestamp),
  index('idx_suggestions_category_ts').on(t.category, t.timestamp),
])

// ─── App: activity_log ───────────────────────────────────────────────────────
export const activityLog = sqliteTable('activity_log', {
  id:                text('id').primaryKey(),
  timestamp:         integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  action:            text('action').notNull().default(''),
  actionSource:      text('action_source').notNull().default(''),
  suggestionId:      text('suggestion_id').notNull().default(''),
  oldStatus:         text('old_status').notNull().default(''),
  newStatus:         text('new_status').notNull().default(''),
  oldNote:           text('old_note').notNull().default(''),
  newNote:           text('new_note').notNull().default(''),
  noteChanged:       integer('note_changed', { mode: 'boolean' }).notNull().default(false),
  category:          text('category').notNull().default(''),
  type:              text('type').notNull().default(''),
  source:            text('source').notNull().default(''),
  preview:           text('preview').notNull().default(''),
  oldResolutionNote: text('old_resolution_note'),
  newResolutionNote: text('new_resolution_note'),
  resolutionChanged: integer('resolution_changed', { mode: 'boolean' }),
}, t => [
  index('idx_activity_suggestion_ts').on(t.suggestionId, t.timestamp),
  index('idx_activity_ts').on(t.timestamp),
])

// ─── App: rate_limit ─────────────────────────────────────────────────────────
// id = sha1(ip). `timestamps` is a rolling window of submission epochs.
export const rateLimit = sqliteTable('rate_limit', {
  id:         text('id').primaryKey(),
  timestamps: text('timestamps', { mode: 'json' }).$type<number[]>().notNull(),
  updatedAt:  integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Better Auth: core tables ────────────────────────────────────────────────
// Property keys must match Better Auth's expected field names; SQL column names
// (snake_case) are mapped by Drizzle and don't matter to Better Auth.
export const user = sqliteTable('user', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image:         text('image'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:     integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token:     text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('account_id').notNull(),
  providerId:            text('provider_id').notNull(),
  userId:                text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:           text('access_token'),
  refreshToken:          text('refresh_token'),
  idToken:               text('id_token'),
  accessTokenExpiresAt:  integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:             integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp' }),
  updatedAt:  integer('updated_at', { mode: 'timestamp' }),
})
