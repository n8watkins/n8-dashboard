'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ActivityLogEntry } from '@/lib/types'
import { fetchActivityLog, type LogFilters } from '@/lib/firestore'
import { statusClass, sourcePillClass } from '@/lib/utils'
import { STATUS_OPTIONS } from '@/lib/config'

// ─── Activity Log ─────────────────────────────────────────────────────────────

interface DayGroup { dayKey: string; dayLabel: string; items: ActivityLogEntry[] }
interface MonthGroup { monthKey: string; monthLabel: string; count: number; statusCounts: Record<string,number>; days: DayGroup[] }
interface YearGroup  { year: string; count: number; statusCounts: Record<string,number>; months: MonthGroup[] }

function groupEntries(entries: ActivityLogEntry[], dir: 'asc' | 'desc'): YearGroup[] {
  const yearMap: Record<string, YearGroup> = {}

  entries.forEach(entry => {
    const date      = entry.timestamp
    const year      = date.getFullYear().toString()
    const monthNum  = String(date.getMonth() + 1).padStart(2, '0')
    const monthKey  = `${year}-${monthNum}`
    const monthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const dayNum    = String(date.getDate()).padStart(2, '0')
    const dayKey    = `${year}-${monthNum}-${dayNum}`
    const dayLabel  = date.toLocaleString('en-US', { month: 'long', day: 'numeric' })

    if (!yearMap[year]) yearMap[year] = { year, count: 0, statusCounts: {}, months: [] }

    const yg = yearMap[year]
    yg.count++
    yg.statusCounts[entry.newStatus] = (yg.statusCounts[entry.newStatus] || 0) + 1

    let mg = (yg.months as MonthGroup[]).find(m => m.monthKey === monthKey)
    if (!mg) {
      mg = { monthKey, monthLabel, count: 0, statusCounts: {}, days: [] }
      yg.months.push(mg)
    }
    mg.count++
    mg.statusCounts[entry.newStatus] = (mg.statusCounts[entry.newStatus] || 0) + 1

    let dg = mg.days.find(d => d.dayKey === dayKey)
    if (!dg) {
      dg = { dayKey, dayLabel, items: [] }
      mg.days.push(dg)
    }
    dg.items.push(entry)
  })

  const sort = (a: string, b: string) =>
    dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)

  return Object.keys(yearMap)
    .sort(sort)
    .map(y => {
      const yg = yearMap[y]
      yg.months = (yg.months as MonthGroup[])
        .sort((a, b) => sort(a.monthKey, b.monthKey))
        .map(mg => ({ ...mg, days: mg.days.sort((a, b) => sort(a.dayKey, b.dayKey)) }))
      return yg
    })
}

export default function ActivityLog() {
  const [entries, setEntries]       = useState<ActivityLogEntry[]>([])
  const [groups, setGroups]         = useState<YearGroup[]>([])
  const [totalMatches, setTotal]    = useState(0)
  const [loading, setLoading]       = useState(true)

  const [search, setSearch]         = useState('')
  const [year, setYear]             = useState('')
  const [monthKey, setMonthKey]     = useState('')
  const [interaction, setInteraction] = useState('')
  const [result, setResult]         = useState('')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [onlyNotes, setOnlyNotes]   = useState(false)
  const [onlyDecisions, setOnlyDecisions] = useState(false)

  // Years/months derived from entries (for filter dropdowns)
  const [years, setYears]           = useState<string[]>([])
  const [months, setMonths]         = useState<{ key: string; label: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const filters: LogFilters = { search, year, monthKey, interaction, result,
      sortDirection: sortDir, onlyWithNotes: onlyNotes, onlyDecisions }
    const result_ = await fetchActivityLog(filters)
    setEntries(result_)
    setTotal(result_.length)
    setGroups(groupEntries(result_, sortDir))

    // Derive year list from all entries (ignore current filters)
    const allEntries = await fetchActivityLog({})
    const yearSet = new Set(allEntries.map(e => e.timestamp.getFullYear().toString()))
    setYears(Array.from(yearSet).sort((a,b) => b.localeCompare(a)))
    setLoading(false)
  }, [search, year, monthKey, interaction, result, sortDir, onlyNotes, onlyDecisions])

  useEffect(() => { load() }, [load])

  // Update months when year changes
  useEffect(() => {
    if (!year) { setMonths([]); setMonthKey(''); return }
    const ms = new Set(
      entries.filter(e => e.timestamp.getFullYear().toString() === year)
        .map(e => {
          const d = e.timestamp
          const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
          return mk
        })
    )
    const monthList = Array.from(ms).sort((a,b) => b.localeCompare(a)).map(mk => ({
      key: mk,
      label: new Date(mk + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    }))
    setMonths(monthList)
  }, [year, entries])

  const setAllOpen = (open: boolean) => {
    document.querySelectorAll('#log-grid details').forEach((d) => {
      (d as HTMLDetailsElement).open = open
    })
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Activity Log</h2>
          <p className="subtitle">Time-first audit trail of your suggestion decisions and note changes.</p>
        </div>
        <span className="card-meta">
          {totalMatches} entr{totalMatches === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {/* Filters */}
      <div className="log-tools">
        <div>
          <div className="field-label">Search log</div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, note, source…" />
        </div>
        <div>
          <div className="field-label">Year</div>
          <select value={year} onChange={e => { setYear(e.target.value); setMonthKey('') }}>
            <option value="">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">Month</div>
          <select value={monthKey} onChange={e => setMonthKey(e.target.value)} disabled={!year}>
            <option value="">{year ? `All months in ${year}` : 'Select a year first'}</option>
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">Interaction type</div>
          <select value={interaction} onChange={e => setInteraction(e.target.value)}>
            <option value="">Any interaction</option>
            <option value="Decision saved">Decision saved</option>
            <option value="Status edited">Status edited</option>
            <option value="Note updated">Note updated</option>
            <option value="Suggestion updated">Suggestion updated</option>
          </select>
        </div>
        <div>
          <div className="field-label">Result</div>
          <select value={result} onChange={e => setResult(e.target.value)}>
            <option value="">Any result</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="quick-row">
        <div className="quick-actions">
          <button className={`small-btn${sortDir === 'desc' ? ' active' : ''}`} onClick={() => setSortDir('desc')}>Newest first</button>
          <button className={`small-btn${sortDir === 'asc'  ? ' active' : ''}`} onClick={() => setSortDir('asc')}>Oldest first</button>
          <button className={`small-btn${onlyDecisions ? ' active' : ''}`} onClick={() => setOnlyDecisions(v => !v)}>Only decisions</button>
          <button className={`small-btn${onlyNotes     ? ' active' : ''}`} onClick={() => setOnlyNotes(v => !v)}>Only with notes</button>
        </div>
        <div className="view-actions">
          <button className="small-btn" onClick={() => setAllOpen(false)}>Collapse all months</button>
          <button className="small-btn" onClick={() => setAllOpen(true)}>Expand all</button>
        </div>
      </div>

      <div id="log-grid">
        {loading
          ? <div className="empty-state">Loading activity log…</div>
          : groups.length === 0
            ? <div className="empty-state">No activity found for these filters.</div>
            : groups.map(yg => <YearGroupEl key={yg.year} group={yg} />)
        }
      </div>
    </div>
  )
}

// ─── Year > Month > Day > Item rendering ──────────────────────────────────────

function YearGroupEl({ group }: { group: YearGroup }) {
  return (
    <details className="log-year" open>
      <summary className="year-summary">
        <span className="summary-left">
          <span className="chev">›</span>
          {group.year}
          <span className="year-count">{group.count} action{group.count === 1 ? '' : 's'}</span>
        </span>
        <span className="month-stats">
          <StatusCountPills counts={group.statusCounts} />
        </span>
      </summary>
      {(group.months as MonthGroup[]).map(mg => (
        <MonthGroupEl key={mg.monthKey} group={mg} />
      ))}
    </details>
  )
}

function MonthGroupEl({ group }: { group: MonthGroup }) {
  return (
    <details className="log-month" open>
      <summary className="month-head">
        <div className="month-title-wrap">
          <span className="chev">›</span>
          <div className="month-title">{group.monthLabel}</div>
        </div>
        <div className="month-stats">
          <span className="chip">{group.count} action{group.count === 1 ? '' : 's'}</span>
          <StatusCountPills counts={group.statusCounts} />
        </div>
      </summary>
      {group.days.map(dg => (
        <div key={dg.dayKey} className="day-group">
          <div className="day-label">{dg.dayLabel}</div>
          <div className="log-column-head">
            <div>Time</div>
            <div>Suggestion</div>
            <div>Related to</div>
            <div style={{ textAlign: 'right' }}>Action taken</div>
          </div>
          {dg.items.map(item => <LogItemEl key={item.id} item={item} />)}
        </div>
      ))}
    </details>
  )
}

function LogItemEl({ item }: { item: ActivityLogEntry }) {
  const sc = statusClass(item.newStatus)
  const timeLabel = item.timestamp.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div className="log-item">
      <div className="time">{timeLabel}</div>

      <div>
        <div className="suggestion-item-title">
          {item.action} · {item.suggestionId.slice(0, 8)}…
        </div>
        <div className="suggestion-item-preview">{item.preview}</div>
        {item.newNote && (
          <div className="note-box">
            <div className="note-label">Note</div>
            {item.newNote}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 1 }}>
        <div className="pill-row">
          {item.category && <span className="pill">{item.category}</span>}
          {item.type     && <span className="pill type">{item.type}</span>}
          {item.source   && <span className={sourcePillClass(item.source)}>{item.source}</span>}
          {item.noteChanged && <span className="pill note">{item.newNote ? 'Note changed' : 'Note removed'}</span>}
        </div>
      </div>

      <div className="action-panel">
        <div className="status-change">
          <strong>{item.oldStatus || '—'}</strong>
          <span className="arrow">→</span>
          <span className={`pill ${sc}`}>{item.newStatus || '—'}</span>
        </div>
      </div>
    </div>
  )
}

function StatusCountPills({ counts }: { counts: Record<string,number> }) {
  const order = ['New','Active','Done','Duplicate','Rejected']
  return (
    <>
      {order.filter(s => counts[s]).map(s => (
        <span key={s} className={`chip ${statusClass(s)}`}>
          {counts[s]} {s}
        </span>
      ))}
    </>
  )
}
