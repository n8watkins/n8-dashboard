// ─── Server-side data queries (Turso / Drizzle) ──────────────────────────────
// Ported from the old browser-direct lib/firestore.ts. Runs ONLY on the server,
// behind the auth-gated /api/admin/* routes. The filtering / scoring / search
// logic is identical to the Firestore version — only the data fetch changed.
import 'server-only'
import crypto from 'crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { db } from './db'
import { suggestions, activityLog } from './schema'
import type { Suggestion, ActivityLogEntry, SaveReviewPayload } from './types'
import type { BrowseFilters, Stats, SourceStats, LogFilters } from './types'
import type { SuggestionStatus } from './config'
import { makeTitle, makePreview, normalizeStatus, getKeywordSet } from './utils'

type SuggestionRow = typeof suggestions.$inferSelect
type LogRow        = typeof activityLog.$inferSelect

const RESOLVED = ['Done', 'Duplicate', 'Rejected']

// ─── Row → domain converters ──────────────────────────────────────────────────

function rowToSuggestion(r: SuggestionRow): Suggestion {
  const date = r.timestamp ?? new Date(0)
  return {
    id:             r.id,
    timestamp:      date,
    timestampSort:  date.getTime(),
    category:       r.category,
    type:           r.type,
    suggestion:     r.suggestion,
    why:            r.why,
    username:       r.username,
    extra:          r.extra,
    source:         r.source,
    status:         normalizeStatus(r.status) as SuggestionStatus,
    internalNotes:  r.internalNotes,
    preview:        r.preview || makePreview(r.suggestion),
    title:          r.title   || makeTitle(r.suggestion),
    resolutionNote: r.resolutionNote ?? undefined,
    resolutionLink: r.resolutionLink ?? undefined,
    moderationState: r.moderationState === 'flagged' ? 'flagged' : 'clean',
    moderationFlags: r.moderationFlags ?? [],
  }
}

function rowToLogEntry(r: LogRow): ActivityLogEntry {
  const date = r.timestamp ?? new Date(0)
  return {
    id:            r.id,
    timestamp:     date,
    timestampSort: date.getTime(),
    action:        r.action,
    actionSource:  r.actionSource,
    suggestionId:  r.suggestionId,
    oldStatus:     r.oldStatus,
    newStatus:     r.newStatus,
    oldNote:       r.oldNote,
    newNote:       r.newNote,
    noteChanged:   r.noteChanged,
    category:      r.category,
    type:          r.type,
    source:        r.source,
    preview:       r.preview,
    oldResolutionNote: r.oldResolutionNote ?? undefined,
    newResolutionNote: r.newResolutionNote ?? undefined,
    resolutionChanged: r.resolutionChanged ?? undefined,
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function calcStats(list: Suggestion[]): Stats {
  return {
    all:      list.length,
    new:      list.filter(s => s.status === 'New').length,
    active:   list.filter(s => s.status === 'Active').length,
    resolved: list.filter(s => RESOLVED.includes(s.status)).length,
    flagged:  list.filter(s => s.moderationState === 'flagged').length,
  }
}

export async function fetchStats(): Promise<Stats> {
  const rows = await db.select().from(suggestions)
  return calcStats(rows.map(rowToSuggestion))
}

// ─── Review queue head (replaces the onSnapshot subscription) ─────────────────

export async function getQueueHead(): Promise<Suggestion | null> {
  const rows = await db.select().from(suggestions)
    .where(eq(suggestions.status, 'New'))
    .orderBy(asc(suggestions.timestamp))
    .limit(1)
  return rows[0] ? rowToSuggestion(rows[0]) : null
}

// ─── Browse / filter ──────────────────────────────────────────────────────────

export async function fetchSuggestions(filters: BrowseFilters): Promise<{
  results: Suggestion[]
  total: number
  stats: Stats
}> {
  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.timestamp))
  let all = rows.map(rowToSuggestion)

  if (filters.status)                       all = all.filter(s => s.status === filters.status)
  else if (filters.viewGroup === 'new')     all = all.filter(s => s.status === 'New')
  else if (filters.viewGroup === 'active')  all = all.filter(s => s.status === 'Active')
  else if (filters.viewGroup === 'resolved') all = all.filter(s => RESOLVED.includes(s.status))

  if (filters.category) all = all.filter(s => s.category === filters.category)
  if (filters.type)     all = all.filter(s => s.type === filters.type)
  if (filters.source)   all = all.filter(s => s.source === filters.source)

  const q = (filters.search || '').toLowerCase().trim()
  if (q) {
    all = all.filter(s =>
      [s.title, s.suggestion, s.why, s.extra, s.username,
       s.category, s.type, s.source, s.status, s.internalNotes]
        .join(' ').toLowerCase().includes(q))
  }

  return { results: all.slice(0, 150), total: all.length, stats: calcStats(all) }
}

// ─── Single suggestion ────────────────────────────────────────────────────────

export async function fetchSuggestion(id: string): Promise<Suggestion | null> {
  const rows = await db.select().from(suggestions).where(eq(suggestions.id, id)).limit(1)
  return rows[0] ? rowToSuggestion(rows[0]) : null
}

// ─── Related (client-side scoring, identical to the Firestore version) ────────

export async function fetchRelated(
  currentId: string,
  limitN = 10,
  extraFilters?: Partial<BrowseFilters>,
): Promise<Suggestion[]> {
  const current = await fetchSuggestion(currentId)
  if (!current) return []

  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.timestamp))
  let all = rows.map(rowToSuggestion).filter(s => s.id !== current.id)

  if (extraFilters?.viewGroup === 'new')      all = all.filter(s => s.status === 'New')
  if (extraFilters?.viewGroup === 'active')   all = all.filter(s => s.status === 'Active')
  if (extraFilters?.viewGroup === 'resolved') all = all.filter(s => RESOLVED.includes(s.status))
  if (extraFilters?.source) all = all.filter(s => s.source === extraFilters.source)
  if (extraFilters?.status) all = all.filter(s => s.status === extraFilters.status)
  if (extraFilters?.search) {
    const q = extraFilters.search.toLowerCase()
    all = all.filter(s =>
      [s.suggestion, s.why, s.extra, s.category, s.type].join(' ').toLowerCase().includes(q))
  }

  const currentKw = getKeywordSet(`${current.suggestion} ${current.why} ${current.extra}`)

  const scored = all.map(s => {
    let score = 0
    if (s.category === current.category) score += 5
    if (s.type === current.type)         score += 4
    if (s.source === current.source)     score += 2
    const kw = getKeywordSet(`${s.suggestion} ${s.why} ${s.extra}`)
    const overlap = Array.from(currentKw).filter(w => kw.has(w)).length
    score += Math.min(overlap, 6)
    return { s, score }
  }).filter(x => x.score > 0)

  scored.sort((a, b) => b.score - a.score || b.s.timestampSort - a.s.timestampSort)
  return scored.slice(0, limitN).map(x => x.s)
}

// ─── Save review (status + notes + activity log) ──────────────────────────────

export async function saveReview(payload: SaveReviewPayload): Promise<Stats> {
  const rows = await db.select().from(suggestions).where(eq(suggestions.id, payload.suggestionId)).limit(1)
  const before = rows[0]
  if (!before) throw new Error('Suggestion not found: ' + payload.suggestionId)

  const oldStatus = before.status || ''
  const oldNote   = before.internalNotes || ''
  const oldResolutionNote = before.resolutionNote ?? ''
  const newResolutionNote = payload.resolutionNote ?? ''
  const newResolutionLink = payload.resolutionLink ?? ''
  const resolutionChanged = oldResolutionNote !== newResolutionNote

  await db.update(suggestions).set({
    status:         payload.status,
    internalNotes:  payload.internalNotes,
    resolutionNote: newResolutionNote,
    resolutionLink: newResolutionLink,
  }).where(eq(suggestions.id, payload.suggestionId))

  const statusChanged = oldStatus !== payload.status
  const noteChanged   = oldNote   !== payload.internalNotes

  let action = 'Suggestion updated'
  if (statusChanged && payload.actionSource === 'queue') action = 'Decision saved'
  else if (statusChanged)                                action = 'Status edited'
  else if (noteChanged)                                  action = 'Note updated'

  await db.insert(activityLog).values({
    id:                crypto.randomUUID(),
    timestamp:         new Date(),
    action,
    actionSource:      payload.actionSource,
    suggestionId:      payload.suggestionId,
    oldStatus,
    newStatus:         payload.status,
    oldNote,
    newNote:           payload.internalNotes,
    noteChanged:       oldNote !== payload.internalNotes,
    category:          before.category || '',
    type:              before.type || '',
    source:            before.source || '',
    preview:           before.preview || '',
    oldResolutionNote,
    newResolutionNote,
    resolutionChanged,
  })

  return fetchStats()
}

// ─── Source breakdown ─────────────────────────────────────────────────────────

export async function fetchSourceBreakdown(): Promise<Record<string, SourceStats>> {
  const rows = await db.select().from(suggestions)
  const now  = Date.now()
  const ms7  = 7  * 24 * 60 * 60 * 1000
  const ms30 = 30 * 24 * 60 * 60 * 1000

  const result: Record<string, SourceStats> = {}
  for (const r of rows) {
    const source = r.source || ''
    if (!source) continue
    const date = r.timestamp ?? null
    const ms   = date?.getTime() ?? 0

    if (!result[source]) result[source] = { all: 0, d7: 0, d30: 0, lastAt: null }
    const s = result[source]
    s.all++
    if (ms && now - ms <= ms7)  s.d7++
    if (ms && now - ms <= ms30) s.d30++
    if (date && (!s.lastAt || date > s.lastAt)) s.lastAt = date
  }
  return result
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export async function fetchActivityLog(filters: LogFilters = {}): Promise<ActivityLogEntry[]> {
  const rows = await db.select().from(activityLog).orderBy(desc(activityLog.timestamp)).limit(500)
  let entries = rows.map(rowToLogEntry)

  const q = (filters.search || '').toLowerCase().trim()
  if (q) {
    entries = entries.filter(e =>
      [e.action, e.actionSource, e.suggestionId, e.oldStatus, e.newStatus,
       e.oldNote, e.newNote, e.category, e.type, e.source, e.preview]
        .join(' ').toLowerCase().includes(q))
  }
  if (filters.year) {
    entries = entries.filter(e => e.timestamp.getFullYear().toString() === filters.year)
  }
  if (filters.monthKey) {
    entries = entries.filter(e => {
      const y = e.timestamp.getFullYear()
      const m = String(e.timestamp.getMonth() + 1).padStart(2, '0')
      return `${y}-${m}` === filters.monthKey
    })
  }
  if (filters.interaction)  entries = entries.filter(e => e.action === filters.interaction)
  if (filters.result)       entries = entries.filter(e => e.newStatus === filters.result)
  if (filters.onlyWithNotes) entries = entries.filter(e => e.newNote)
  if (filters.onlyDecisions) entries = entries.filter(e =>
    e.action === 'Decision saved' || e.action === 'Status edited')

  const dir = filters.sortDirection === 'asc' ? 1 : -1
  entries.sort((a, b) => dir * (a.timestampSort - b.timestampSort))

  return entries.slice(0, 250)
}
