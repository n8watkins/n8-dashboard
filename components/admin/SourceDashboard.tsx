'use client'
import { useState, useEffect } from 'react'
import { SOURCE_OPTIONS } from '@/lib/config'
import { fetchSourceBreakdown, type SourceStats } from '@/lib/firestore'
import { sourcePillClass } from '@/lib/utils'

// ─── Per-source submission mini-dashboard ────────────────────────────────────

function relativeTime(date: Date | null): string {
  if (!date) return 'never'
  const diff = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days < 30)   return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SourceDashboard() {
  const [breakdown, setBreakdown] = useState<Record<string, SourceStats> | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sourceDashCollapsed') === '1'
  })

  useEffect(() => {
    fetchSourceBreakdown().then(setBreakdown)
  }, [])

  function toggle() {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem('sourceDashCollapsed', next ? '1' : '0')
      return next
    })
  }

  const total = breakdown
    ? Object.values(breakdown).reduce((n, s) => n + s.all, 0)
    : null

  return (
    <div className="source-dashboard">
      <button className="source-dash-toggle" onClick={toggle}>
        {collapsed
          ? <span className="source-dash-summary">
              {SOURCE_OPTIONS.length} sources · {total ?? '…'} total
              <span className="chev" style={{ marginLeft: 6 }}>›</span>
            </span>
          : <span className="source-dash-summary">
              Source breakdown
              <span className="chev" style={{ marginLeft: 6, transform: 'rotate(90deg)', display: 'inline-block' }}>›</span>
            </span>
        }
      </button>

      {!collapsed && (
        <div className="source-dash-cards">
          {SOURCE_OPTIONS.map(src => {
            const s = breakdown?.[src]
            return (
              <div key={src} className="source-mini-card">
                <div className="source-mini-header">
                  <span className={sourcePillClass(src)} style={{ fontSize: 10 }}>{src}</span>
                </div>
                <div className="source-mini-count">{s?.all ?? '—'}</div>
                <div className="source-mini-sub">
                  <span>{s?.d7 ?? '—'} / 7d</span>
                  <span>{s?.d30 ?? '—'} / 30d</span>
                </div>
                <div className="source-mini-last">
                  {relativeTime(s?.lastAt ?? null)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
