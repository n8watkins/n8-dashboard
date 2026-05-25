'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Suggestion, SaveReviewPayload } from '@/lib/types'
import type { SuggestionStatus } from '@/lib/config'
import { STATUS_OPTIONS, CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS } from '@/lib/config'
import { fetchSuggestions, fetchSuggestion, saveReview, type BrowseFilters } from '@/lib/firestore'
import { statusClass, sourcePillClass, formatTimestamp } from '@/lib/utils'
import SuggestionDetail from './SuggestionDetail'

type ViewGroup = 'all' | 'new' | 'active' | 'resolved'

// ─── No-results empty state ───────────────────────────────────────────────────

function NoResults({
  viewGroup, category, type, source, status, search,
  onClear,
}: {
  viewGroup: ViewGroup; category: string; type: string
  source: string; status: string; search: string
  onClear: () => void
}) {
  const active: string[] = []
  if (viewGroup !== 'all') active.push(`group: ${viewGroup}`)
  if (category) active.push(`category: ${category}`)
  if (type)     active.push(`type: ${type}`)
  if (source)   active.push(`source: ${source}`)
  if (status)   active.push(`status: ${status}`)
  if (search)   active.push(`search: "${search}"`)

  return (
    <div className="no-results" style={{ gridColumn: 'span 2' }}>
      <div className="no-results-icon">?</div>
      <h3>Nothing matched.</h3>
      <p>Filters: {active.join(', ')}</p>
      <div className="no-results-actions">
        <button className="small-btn" onClick={onClear}>Clear all filters</button>
      </div>
    </div>
  )
}

// ─── All Suggestions browser ──────────────────────────────────────────────────

export default function SuggestionBrowser() {
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [stats, setStats]               = useState({ all: 0, new: 0, active: 0, resolved: 0 })
  const [loading, setLoading]           = useState(true)

  const [viewGroup, setViewGroup]       = useState<ViewGroup>('all')
  const [search, setSearch]             = useState('')
  const [category, setCategory]         = useState('')
  const [type, setType]                 = useState('')
  const [source, setSource]             = useState('')
  const [status, setStatus]             = useState('')
  const [flaggedOnly, setFlaggedOnly]   = useState(false)

  const [selected, setSelected]         = useState<Suggestion | null>(null)
  const [selectedStatus, setSelectedStatus]   = useState<SuggestionStatus>('New')
  const [selectedNotes, setSelectedNotes]     = useState('')
  const [selectedResNote, setSelectedResNote] = useState('')
  const [selectedResLink, setSelectedResLink] = useState('')
  const [saving, setSaving]                   = useState(false)
  const [saveState, setSaveState]             = useState<'idle' | 'saved' | 'error'>('idle')

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSuggestions = useCallback(async (overrides: Partial<BrowseFilters> = {}) => {
    setLoading(true)
    try {
      const filters: BrowseFilters = {
        viewGroup, search, category, type, source, status: status as SuggestionStatus,
        ...overrides,
      }
      const result = await fetchSuggestions(filters)
      setSuggestions(result.results)
      setTotalMatches(result.total)
      setStats(result.stats)
    } finally {
      setLoading(false)
    }
  }, [viewGroup, search, category, type, source, status])

  useEffect(() => { loadSuggestions() }, [loadSuggestions])

  // Debounced search
  function onSearchChange(val: string) {
    setSearch(val)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => loadSuggestions({ search: val }), 300)
  }

  function changeGroup(g: ViewGroup) {
    setViewGroup(g)
    setStatus('')
  }

  function clearFilters() {
    setViewGroup('all')
    setCategory('')
    setType('')
    setSource('')
    setStatus('')
    setSearch('')
    setFlaggedOnly(false)
  }

  const filtersApplied = viewGroup !== 'all' || !!category || !!type || !!source || !!status || !!search || flaggedOnly

  // Client-side flagged filter applied after fetch
  const visibleSuggestions = flaggedOnly
    ? suggestions.filter(s => s.moderationState === 'flagged')
    : suggestions

  async function openSuggestion(id: string) {
    const s = await fetchSuggestion(id)
    if (!s) return
    setSelected(s)
    setSelectedStatus(s.status)
    setSelectedNotes(s.internalNotes)
    setSelectedResNote(s.resolutionNote || '')
    setSelectedResLink(s.resolutionLink || '')
  }

  async function handleSave() {
    if (!selected || saving) return
    setSaving(true)
    const payload: SaveReviewPayload = {
      suggestionId:   selected.id,
      status:         selectedStatus,
      internalNotes:  selectedNotes,
      actionSource:   'browser',
      resolutionNote: selectedResNote,
      resolutionLink: selectedResLink,
    }
    try {
      await saveReview(payload)
      setSaveState('saved')
      await loadSuggestions()
      // Refresh the detail panel
      const refreshed = await fetchSuggestion(selected.id)
      if (refreshed) {
        setSelected(refreshed)
        setSelectedStatus(refreshed.status)
        setSelectedNotes(refreshed.internalNotes)
        setSelectedResNote(refreshed.resolutionNote || '')
        setSelectedResLink(refreshed.resolutionLink || '')
      }
      setTimeout(() => setSaveState('idle'), 900)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 1600)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="browser-layout">
      {/* Left: list */}
      <div className="left">
        <div className="card">
          <div className="card-head">
            <h2>All Suggestions</h2>
            <span className="card-meta">{totalMatches} result{totalMatches === 1 ? '' : 's'}</span>
          </div>

          {/* Group tabs */}
          <div className="stat-row">
            {(['all','new','active','resolved'] as ViewGroup[]).map(g => (
              <button
                key={g}
                className={`group-btn${viewGroup === g ? ' active' : ''}`}
                onClick={() => changeGroup(g)}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}{' '}
                <span>{stats[g]}</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="filter-row">
            <div>
              <div className="field-label">Search</div>
              <input type="text" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search suggestions…" />
            </div>
            <div>
              <div className="field-label">For</div>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Any</option>
                {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">Type</div>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="">Any type</option>
                {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">Source</div>
              <select value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Any source</option>
                {SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Any status</option>
                {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Flagged toggle */}
          <div style={{ marginBottom: 10 }}>
            <button
              className={`small-btn${flaggedOnly ? ' active' : ''}`}
              onClick={() => setFlaggedOnly(v => !v)}
            >
              ⚠ Flagged only
            </button>
          </div>

          {/* Grid */}
          <div className="list-grid">
            {loading
              ? <div className="empty-state" style={{ gridColumn: 'span 2' }}>Loading…</div>
              : visibleSuggestions.length === 0
                ? filtersApplied
                  ? <NoResults
                      viewGroup={viewGroup} category={category} type={type}
                      source={source} status={status} search={search}
                      onClear={clearFilters}
                    />
                  : <div className="empty-state" style={{ gridColumn: 'span 2' }}>No suggestions yet.</div>
                : visibleSuggestions.map(s => (
                  <div
                    key={s.id}
                    className="suggestion-item"
                    onClick={() => openSuggestion(s.id)}
                    style={{ outline: selected?.id === s.id ? '1px solid var(--green-dim)' : 'none' }}
                  >
                    <div className="suggestion-item-title">{s.title}</div>
                    <div className="suggestion-item-meta">
                      <span>{s.source || 'Unknown source'}</span>
                      <span>
                        <span className={`sdot s-${s.status.toLowerCase()}`} />
                        {s.status}
                      </span>
                    </div>
                    <div className="suggestion-item-preview">{s.preview}</div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Right: detail */}
      <div>
        <div className="card detail-card">
          {!selected
            ? <div className="empty-state">Select a suggestion to view or edit it.</div>
            : <>
              <SuggestionDetail item={selected} title="Suggestion Detail" />

              <div className="divider" style={{ marginTop: 14 }} />

              <div className="section-lbl">Status</div>
              <div className="decision-list">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    className={`decision-btn${selectedStatus === s ? ' sel' : ''}${s === 'Rejected' ? ' danger' : ''}`}
                    onClick={() => setSelectedStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {selectedStatus === 'Done' && (
                <>
                  <div className="notes-label">How did you address this?</div>
                  <textarea
                    value={selectedResNote}
                    onChange={e => setSelectedResNote(e.target.value)}
                    placeholder="Optional — describe how this was resolved…"
                    style={{ marginBottom: 8 }}
                  />
                  <div className="notes-label">Result link</div>
                  <input
                    type="text"
                    value={selectedResLink}
                    onChange={e => setSelectedResLink(e.target.value)}
                    placeholder="Optional — VOD, video, stream URL…"
                    style={{ marginBottom: 14 }}
                  />
                </>
              )}

              <div className="notes-label">Internal Note</div>
              <textarea
                value={selectedNotes}
                onChange={e => setSelectedNotes(e.target.value)}
                placeholder="Private note for yourself…"
              />
              <div className="char-row">{selectedNotes.length} chars</div>

              <button
                className={`save-btn${saveState === 'saved' ? ' saved' : ''}${saveState === 'error' ? ' error' : ''}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Error — try again' : 'Save Changes'}
              </button>
            </>
          }
        </div>
      </div>
    </div>
  )
}
