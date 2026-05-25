'use client'
import { useEffect, useState, useCallback } from 'react'
import type { Suggestion, SaveReviewPayload } from '@/lib/types'
import type { SuggestionStatus } from '@/lib/config'
import { STATUS_OPTIONS, SOURCE_OPTIONS } from '@/lib/config'
import { subscribeNextNew, fetchRelated, fetchStats, saveReview, type Stats } from '@/lib/firestore'
import { statusClass, sourcePillClass } from '@/lib/utils'
import SuggestionDetail from './SuggestionDetail'
import CaughtUp from './CaughtUp'

// ─── Review Queue ─────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  const [current, setCurrent]     = useState<Suggestion | null | undefined>(undefined)
  const [related, setRelated]     = useState<Suggestion[]>([])
  const [stats, setStats]         = useState<Stats | null>(null)
  const [decision, setDecision]   = useState<SuggestionStatus | null>(null)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')

  // Related filters
  const [relSearch, setRelSearch]   = useState('')
  const [relGroup, setRelGroup]     = useState('all')
  const [relSource, setRelSource]   = useState('')
  const [relStatus, setRelStatus]   = useState('')
  const [relCount, setRelCount]     = useState(0)

  // Load stats once on mount and after saves
  const refreshStats = useCallback(() => {
    fetchStats().then(setStats)
  }, [])

  useEffect(() => { refreshStats() }, [refreshStats])

  // Subscribe to queue head
  useEffect(() => {
    const unsub = subscribeNextNew(suggestion => {
      setCurrent(suggestion)
      setDecision(null)
      setNotes(suggestion?.internalNotes || '')
    })
    return unsub
  }, [])

  // Load related whenever current or filters change
  const loadRelated = useCallback(async () => {
    if (!current) { setRelated([]); setRelCount(0); return }
    const results = await fetchRelated(current, 20, {
      viewGroup: relGroup as 'all' | 'new' | 'active' | 'resolved',
      source: relSource || undefined,
      status: relStatus || undefined,
      search: relSearch || undefined,
    })
    setRelated(results)
    setRelCount(results.length)
  }, [current, relGroup, relSource, relStatus, relSearch])

  useEffect(() => { loadRelated() }, [loadRelated])

  async function handleSave() {
    if (saving || !current || !decision) return
    setSaving(true)
    setSaveState('idle')

    const payload: SaveReviewPayload = {
      suggestionId: current.id,
      status:       decision,
      internalNotes: notes,
      actionSource: 'queue',
    }

    try {
      const newStats = await saveReview(payload)
      setStats(newStats)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 900)
    } catch (err) {
      console.error(err)
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 1600)
    } finally {
      setSaving(false)
    }
    // subscribeNextNew will auto-advance to next New suggestion
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (current === undefined) {
    return <div className="card"><div className="empty-state">Loading queue…</div></div>
  }

  const statusBadge = decision ?? current?.status ?? 'New'

  const saveBtnLabel = saveState === 'saved' ? 'Saved ✓'
    : saveState === 'error' ? 'Error — try again'
    : 'Save Decision + Next'

  return (
    <div>
      {/* Queue header */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Review Queue</h2>
          <span className="card-meta">
            {stats ? `${stats.new} new suggestion${stats.new === 1 ? '' : 's'} waiting` : '…'}
          </span>
        </div>
      </div>

      <div className="layout">
        {/* Left: current suggestion + related */}
        <div className="left">
          {/* Current suggestion */}
          <div className="card">
            {current
              ? <SuggestionDetail item={current} title="Current New Suggestion" />
              : <CaughtUp />
            }
          </div>

          {/* Related suggestions */}
          <div className="card">
            <div className="card-head">
              <h2>Related Suggestions</h2>
              <span className="card-meta">{relCount} related</span>
            </div>

            {/* Related filters */}
            <div className="filter-row" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
              <div>
                <div className="field-label">Search related</div>
                <input type="text" value={relSearch}
                  onChange={e => setRelSearch(e.target.value)}
                  placeholder="Search…" />
              </div>
              <div>
                <div className="field-label">Group</div>
                <select value={relGroup} onChange={e => setRelGroup(e.target.value)}>
                  <option value="all">All</option>
                  <option value="new">New</option>
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <div className="field-label">Source</div>
                <select value={relSource} onChange={e => setRelSource(e.target.value)}>
                  <option value="">Any source</option>
                  {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div className="field-label">Status</div>
                <select value={relStatus} onChange={e => setRelStatus(e.target.value)}>
                  <option value="">Any status</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="list-grid">
              {related.length === 0
                ? <div className="empty-state" style={{ gridColumn: 'span 2' }}>No related suggestions found.</div>
                : related.map(item => (
                  <SuggestionCard key={item.id} item={item} />
                ))
              }
            </div>
          </div>
        </div>

        {/* Right: decision panel */}
        <div>
          <div className="card review-card">
            <div className="cur-status-row">
              <span className="cur-label">Current Status</span>
              <span className={`cur-badge pill ${statusClass(statusBadge)}`}>{statusBadge}</span>
            </div>

            <div className="section-lbl">Decision</div>
            <div className="decision-list">
              {(['Active','Done','Duplicate','Rejected'] as SuggestionStatus[]).map(s => (
                <button
                  key={s}
                  className={`decision-btn${decision === s ? ' sel' : ''}${s === 'Rejected' ? ' danger' : ''}`}
                  onClick={() => setDecision(s)}
                  disabled={!current}
                >
                  {s === 'Active' ? 'Keep Active' : s}
                </button>
              ))}
            </div>

            <div className="divider" />

            <div className="notes-label">Internal Note</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Private note for yourself…"
            />
            <div className="char-row">{notes.length} chars</div>

            <button
              className={`save-btn${saveState === 'saved' ? ' saved' : ''}${saveState === 'error' ? ' error' : ''}`}
              onClick={handleSave}
              disabled={saving || !current || !decision}
            >
              {saveBtnLabel}
            </button>

            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              {stats ? `${stats.new} new suggestion${stats.new === 1 ? '' : 's'}` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Small suggestion card (related grid) ────────────────────────────────────

function SuggestionCard({ item }: { item: Suggestion }) {
  const dotClass = `s-${item.status.toLowerCase()}` as string
  return (
    <div className="suggestion-item">
      <div className="suggestion-item-title">{item.title}</div>
      <div className="suggestion-item-meta">
        <span>{item.source || 'Unknown source'}</span>
        <span>
          <span className={`sdot ${dotClass}`} />
          {item.status}
        </span>
      </div>
      <div className="suggestion-item-preview">{item.preview}</div>
    </div>
  )
}
