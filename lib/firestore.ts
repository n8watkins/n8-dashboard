'use client'
// ─── Firestore client helpers (admin UI) ─────────────────────────────────────
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  onSnapshot,
  Timestamp,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Suggestion, ActivityLogEntry, SaveReviewPayload } from './types'
import type { SuggestionStatus } from './config'
import {
  makeTitle,
  makePreview,
  normalizeStatus,
  getKeywordSet,
  formatTimestamp,
} from './utils'

// ─── Shape converters ─────────────────────────────────────────────────────────

function docToSuggestion(id: string, data: Record<string, unknown>): Suggestion {
  const ts = data.timestamp as Timestamp | undefined
  const date = ts?.toDate() ?? new Date(0)
  return {
    id,
    timestamp: date,
    timestampSort: date.getTime(),
    category:      String(data.category || ''),
    type:          String(data.type || ''),
    suggestion:    String(data.suggestion || ''),
    why:           String(data.why || ''),
    username:      String(data.username || ''),
    extra:         String(data.extra || ''),
    source:        String(data.source || ''),
    status:        normalizeStatus(String(data.status || 'New')) as SuggestionStatus,
    internalNotes: String(data.internalNotes || ''),
    preview:       String(data.preview || makePreview(String(data.suggestion || ''))),
    title:         String(data.title || makeTitle(String(data.suggestion || ''))),
  }
}

function docToLogEntry(id: string, data: Record<string, unknown>): ActivityLogEntry {
  const ts = data.timestamp as Timestamp | undefined
  const date = ts?.toDate() ?? new Date(0)
  return {
    id,
    timestamp: date,
    timestampSort: date.getTime(),
    action:       String(data.action || ''),
    actionSource: String(data.actionSource || ''),
    suggestionId: String(data.suggestionId || ''),
    oldStatus:    String(data.oldStatus || ''),
    newStatus:    String(data.newStatus || ''),
    oldNote:      String(data.oldNote || ''),
    newNote:      String(data.newNote || ''),
    noteChanged:  Boolean(data.noteChanged),
    category:     String(data.category || ''),
    type:         String(data.type || ''),
    source:       String(data.source || ''),
    preview:      String(data.preview || ''),
  }
}

// ─── Review queue ─────────────────────────────────────────────────────────────

/**
 * Subscribe to the next "New" suggestion in queue order.
 * Calls callback whenever the queue head changes.
 */
export function subscribeNextNew(
  callback: (suggestion: Suggestion | null) => void
): Unsubscribe {
  const q = query(
    collection(db, 'suggestions'),
    where('status', '==', 'New'),
    orderBy('timestamp', 'asc'),
    limit(1)
  )

  return onSnapshot(q, snapshot => {
    if (snapshot.empty) {
      callback(null)
      return
    }
    const d = snapshot.docs[0]
    callback(docToSuggestion(d.id, d.data() as Record<string, unknown>))
  })
}

// ─── Browse / filter suggestions ─────────────────────────────────────────────

export interface BrowseFilters {
  viewGroup: 'all' | 'new' | 'active' | 'resolved'
  category?: string
  type?: string
  source?: string
  status?: string
  search?: string
}

export async function fetchSuggestions(filters: BrowseFilters): Promise<{
  results: Suggestion[]
  total: number
  stats: Stats
}> {
  const constraints: QueryConstraint[] = [orderBy('timestamp', 'desc')]

  // Firestore-side filters (single field only to avoid needing extra indexes)
  if (filters.status) {
    constraints.unshift(where('status', '==', filters.status))
  } else if (filters.viewGroup === 'new') {
    constraints.unshift(where('status', '==', 'New'))
  } else if (filters.viewGroup === 'active') {
    constraints.unshift(where('status', '==', 'Active'))
  }
  // 'resolved' and 'all' need client-side filtering

  const snap = await getDocs(query(collection(db, 'suggestions'), ...constraints))
  let all = snap.docs.map(d => docToSuggestion(d.id, d.data() as Record<string, unknown>))

  // Client-side filters
  if (filters.viewGroup === 'resolved' && !filters.status) {
    all = all.filter(s => ['Done', 'Duplicate', 'Rejected'].includes(s.status))
  }
  if (filters.category) all = all.filter(s => s.category === filters.category)
  if (filters.type)     all = all.filter(s => s.type === filters.type)
  if (filters.source)   all = all.filter(s => s.source === filters.source)

  const query_ = (filters.search || '').toLowerCase().trim()
  if (query_) {
    all = all.filter(s => {
      const hay = [s.title, s.suggestion, s.why, s.extra, s.username,
                   s.category, s.type, s.source, s.status, s.internalNotes]
        .join(' ').toLowerCase()
      return hay.includes(query_)
    })
  }

  const stats = calcStats(all)

  return { results: all.slice(0, 150), total: all.length, stats }
}

// ─── Single suggestion ────────────────────────────────────────────────────────

export async function fetchSuggestion(id: string): Promise<Suggestion | null> {
  const snap = await getDoc(doc(db, 'suggestions', id))
  if (!snap.exists()) return null
  return docToSuggestion(snap.id, snap.data() as Record<string, unknown>)
}

// ─── Related suggestions (client-side scoring) ────────────────────────────────

export async function fetchRelated(
  current: Suggestion,
  limitN = 10,
  extraFilters?: Partial<BrowseFilters>
): Promise<Suggestion[]> {
  const snap = await getDocs(
    query(collection(db, 'suggestions'), orderBy('timestamp', 'desc'))
  )
  let all = snap.docs
    .map(d => docToSuggestion(d.id, d.data() as Record<string, unknown>))
    .filter(s => s.id !== current.id)

  // Apply optional extra filters
  if (extraFilters?.viewGroup === 'new')      all = all.filter(s => s.status === 'New')
  if (extraFilters?.viewGroup === 'active')   all = all.filter(s => s.status === 'Active')
  if (extraFilters?.viewGroup === 'resolved') all = all.filter(s => ['Done','Duplicate','Rejected'].includes(s.status))
  if (extraFilters?.source)  all = all.filter(s => s.source === extraFilters.source)
  if (extraFilters?.status)  all = all.filter(s => s.status === extraFilters.status)
  if (extraFilters?.search) {
    const q = extraFilters.search.toLowerCase()
    all = all.filter(s =>
      [s.suggestion, s.why, s.extra, s.category, s.type].join(' ').toLowerCase().includes(q)
    )
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
    return { ...s, _score: score }
  }).filter(s => s._score > 0)

  scored.sort((a, b) => b._score - a._score || b.timestampSort - a.timestampSort)
  return scored.slice(0, limitN)
}

// ─── Save review (status + notes + activity log) ──────────────────────────────

export interface Stats {
  all: number
  new: number
  active: number
  resolved: number
}

export async function saveReview(payload: SaveReviewPayload): Promise<Stats> {
  const ref = doc(db, 'suggestions', payload.suggestionId)
  const before = await getDoc(ref)
  if (!before.exists()) throw new Error('Suggestion not found: ' + payload.suggestionId)

  const oldData = before.data() as Record<string, unknown>
  const oldStatus = String(oldData.status || '')
  const oldNote   = String(oldData.internalNotes || '')

  await updateDoc(ref, {
    status:        payload.status,
    internalNotes: payload.internalNotes,
  })

  const statusChanged = oldStatus !== payload.status
  const noteChanged   = oldNote   !== payload.internalNotes

  let action = 'Suggestion updated'
  if (statusChanged && payload.actionSource === 'queue') action = 'Decision saved'
  else if (statusChanged)                                action = 'Status edited'
  else if (noteChanged)                                  action = 'Note updated'

  await addDoc(collection(db, 'activity_log'), {
    timestamp:    Timestamp.now(),
    action,
    actionSource: payload.actionSource,
    suggestionId: payload.suggestionId,
    oldStatus,
    newStatus:    payload.status,
    oldNote,
    newNote:      payload.internalNotes,
    noteChanged:  oldNote !== payload.internalNotes,
    category:     String(oldData.category || ''),
    type:         String(oldData.type || ''),
    source:       String(oldData.source || ''),
    preview:      String(oldData.preview || ''),
  })

  return fetchStats()
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function calcStats(suggestions: Suggestion[]): Stats {
  return {
    all:      suggestions.length,
    new:      suggestions.filter(s => s.status === 'New').length,
    active:   suggestions.filter(s => s.status === 'Active').length,
    resolved: suggestions.filter(s => ['Done','Duplicate','Rejected'].includes(s.status)).length,
  }
}

export async function fetchStats(): Promise<Stats> {
  const snap = await getDocs(collection(db, 'suggestions'))
  const all = snap.docs.map(d => docToSuggestion(d.id, d.data() as Record<string, unknown>))
  return calcStats(all)
}

// ─── Activity log ─────────────────────────────────────────────────────────────

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

export async function fetchActivityLog(filters: LogFilters = {}): Promise<ActivityLogEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'activity_log'), orderBy('timestamp', 'desc'), limit(500))
  )

  let entries = snap.docs.map(d => docToLogEntry(d.id, d.data() as Record<string, unknown>))

  const q = (filters.search || '').toLowerCase().trim()
  if (q) {
    entries = entries.filter(e =>
      [e.action, e.actionSource, e.suggestionId, e.oldStatus, e.newStatus,
       e.oldNote, e.newNote, e.category, e.type, e.source, e.preview]
        .join(' ').toLowerCase().includes(q)
    )
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
  if (filters.interaction) {
    entries = entries.filter(e => e.action === filters.interaction)
  }
  if (filters.result) {
    entries = entries.filter(e => e.newStatus === filters.result)
  }
  if (filters.onlyWithNotes) {
    entries = entries.filter(e => e.newNote)
  }
  if (filters.onlyDecisions) {
    entries = entries.filter(e =>
      e.action === 'Decision saved' || e.action === 'Status edited'
    )
  }

  const dir = filters.sortDirection === 'asc' ? 1 : -1
  entries.sort((a, b) => dir * (a.timestampSort - b.timestampSort))

  return entries.slice(0, 250)
}
