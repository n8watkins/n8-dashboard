'use client'
import { useRef, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { RecapStats, ChannelResult } from '@/app/api/weekly-recap/route'

// ─── Weekly Recap panel (admin) ───────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'preview' | 'sending' | 'sent' | 'error'

function fmt(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? 's' : ''}`
}

function channelLabel(result: ChannelResult, name: string): string {
  if (result === 'sent')    return `✓ ${name}`
  if (result === 'skipped') return `— ${name} (not configured)`
  return `⚠ ${name} failed`
}

export default function WeeklyRecap() {
  const [status,   setStatus]   = useState<Status>('idle')
  const [stats,    setStats]    = useState<RecapStats | null>(null)
  const [channels, setChannels] = useState<{ email: ChannelResult; discord: ChannelResult } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error,    setError]    = useState('')
  const [open,     setOpen]     = useState(false)

  // FIX #7: in-flight ref prevents double-send on rapid clicks.
  const inFlight = useRef(false)

  async function fetchToken(): Promise<string | null> {
    const user = auth.currentUser
    if (!user) return null
    try { return await getIdToken(user) } catch { return null }
  }

  async function handlePreview() {
    if (inFlight.current) return
    inFlight.current = true
    setStatus('loading')
    setError('')
    try {
      const token = await fetchToken()
      if (!token) { setStatus('error'); setError('Not signed in.'); return }

      const res  = await fetch('/api/weekly-recap?dry=true', {
        headers: { 'x-firebase-token': token },
      })
      const data = await res.json() as { ok?: boolean; stats?: RecapStats; error?: string }
      if (!data.ok || !data.stats) throw new Error(data.error || 'Unknown error')
      setStats(data.stats)
      setStatus('preview')
    } catch (e) {
      setError(String(e))
      setStatus('error')
    } finally {
      inFlight.current = false
    }
  }

  async function handleSend() {
    if (inFlight.current) return
    inFlight.current = true
    setStatus('sending')
    setError('')
    try {
      const token = await fetchToken()
      if (!token) { setStatus('error'); setError('Not signed in.'); return }

      const res  = await fetch('/api/weekly-recap', {
        method:  'POST',
        headers: { 'x-firebase-token': token },
      })
      const data = await res.json() as {
        ok?:       boolean
        stats?:    RecapStats
        channels?: { email: ChannelResult; discord: ChannelResult }
        warnings?: string[]
        error?:    string
      }
      if (!data.ok) throw new Error(data.error || 'Unknown error')
      setStats(data.stats ?? null)
      setChannels(data.channels ?? null)
      setWarnings(data.warnings ?? [])
      setStatus('sent')
    } catch (e) {
      setError(String(e))
      setStatus('error')
    } finally {
      inFlight.current = false
    }
  }

  function reset() {
    setStatus('idle')
    setStats(null)
    setChannels(null)
    setWarnings([])
    setError('')
  }

  const loading = status === 'loading' || status === 'sending'

  return (
    <div className="weekly-recap-panel">
      {/* ── Header row ── */}
      <div className="recap-header" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span className="recap-title">
          Weekly Recap
          {/* FIX #5: rotate(0deg) so the CSS transition can interpolate back */}
          <span className="chev" style={{ marginLeft: 6, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>›</span>
        </span>
        {status === 'sent' && <span className="recap-badge sent">Sent ✓</span>}
        {status === 'error' && <span className="recap-badge error">Error</span>}
      </div>

      {open && (
        <div className="recap-body">
          {/* ── Idle / Error ── */}
          {(status === 'idle' || status === 'error') && (
            <div className="recap-actions">
              <p className="recap-desc">
                Generates a 7-day digest — submissions by source, pipeline snapshot, items moved to Done — and sends it to your email + Discord.
              </p>
              {error && <p className="recap-error">{error}</p>}
              <div className="recap-btn-row">
                <button className="recap-btn preview" onClick={handlePreview} disabled={loading}>
                  Preview
                </button>
                <button className="recap-btn send" onClick={handleSend} disabled={loading}>
                  Send Now
                </button>
              </div>
            </div>
          )}

          {/* ── Loading ── */}
          {loading && (
            <p className="recap-loading">
              {status === 'sending' ? 'Sending…' : 'Building recap…'}
            </p>
          )}

          {/* ── Preview or Sent ── */}
          {(status === 'preview' || status === 'sent') && stats && (
            <>
              <RecapPreview stats={stats} />
              {status === 'preview' && (
                <div className="recap-btn-row" style={{ marginTop: 16 }}>
                  <button className="recap-btn send" onClick={handleSend} disabled={loading}>
                    Send This Recap
                  </button>
                  <button className="recap-btn ghost" onClick={reset}>Cancel</button>
                </div>
              )}
              {status === 'sent' && (
                <>
                  {/* FIX #2: show accurate per-channel outcome */}
                  <div className="recap-channel-results">
                    {channels
                      ? (
                        <>
                          <span className={`recap-channel ${channels.email}`}>
                            {channelLabel(channels.email, 'Email')}
                          </span>
                          <span className={`recap-channel ${channels.discord}`}>
                            {channelLabel(channels.discord, 'Discord')}
                          </span>
                        </>
                      )
                      : <span className="recap-sent-note">✓ Sent.</span>
                    }
                  </div>
                  {warnings.length > 0 && (
                    <div className="recap-warnings">
                      {warnings.map((w, i) => <p key={i} className="recap-warn-line">⚠ {w}</p>)}
                    </div>
                  )}
                  <button className="recap-btn ghost" onClick={reset} style={{ marginTop: 12 }}>Done</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Inline stats preview ─────────────────────────────────────────────────────

function RecapPreview({ stats: s }: { stats: RecapStats }) {
  const total = s.submissions.total

  const topSources = Object.entries(s.submissions.bySource)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n > 0)

  return (
    <div className="recap-preview">
      <div className="recap-preview-header">
        {s.weekStart} – {s.weekEnd}
      </div>

      <div className="recap-section">
        <div className="recap-section-label">new submissions</div>
        <div className="recap-big-num">{total}</div>
        {topSources.length > 0 && (
          <div className="recap-rows">
            {topSources.map(([src, n]) => {
              const pct = total > 0 ? Math.round((n / total) * 100) : 0
              return (
                <div key={src} className="recap-row">
                  <span className="recap-row-label">{src}</span>
                  <span className="recap-row-val">{n} <span className="recap-pct">{pct}%</span></span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {s.submissions.flagged > 0 && (
        <div className="recap-flagged-note">
          ⚠ {fmt(s.submissions.flagged, 'submission')} flagged for review
        </div>
      )}

      {s.submissions.byCategory.length > 0 && (
        <div className="recap-section">
          <div className="recap-section-label">top categories</div>
          <div className="recap-rows">
            {s.submissions.byCategory.map(([cat, n]) => (
              <div key={cat} className="recap-row">
                <span className="recap-row-label">{cat}</span>
                <span className="recap-row-val">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="recap-section">
        <div className="recap-section-label">pipeline snapshot</div>
        <div className="recap-stat-pills">
          <div className="recap-pill queue">
            <span className="pill-num">{s.pipeline.queueSize}</span>
            <span className="pill-label">in queue</span>
          </div>
          <div className="recap-pill active">
            <span className="pill-num">{s.pipeline.activeSize}</span>
            <span className="pill-label">in progress</span>
          </div>
          <div className="recap-pill done">
            <span className="pill-num">{s.pipeline.doneAllTime}</span>
            <span className="pill-label">done all-time</span>
          </div>
        </div>
      </div>

      <div className="recap-section">
        <div className="recap-section-label">
          ✓ moved to done ({s.actionsThisWeek.movedToDone.length})
        </div>
        {s.actionsThisWeek.movedToDone.length > 0
          ? <ul className="recap-item-list">
              {s.actionsThisWeek.movedToDone.map(item => (
                <li key={item.id} className="recap-item done">{item.preview}</li>
              ))}
            </ul>
          : <p className="recap-empty">None this week</p>
        }
      </div>

      <div className="recap-section">
        <div className="recap-section-label">
          → picked up ({s.actionsThisWeek.movedToActive.length})
        </div>
        {s.actionsThisWeek.movedToActive.length > 0
          ? <ul className="recap-item-list">
              {s.actionsThisWeek.movedToActive.map(item => (
                <li key={item.id} className="recap-item active">{item.preview}</li>
              ))}
            </ul>
          : <p className="recap-empty">None this week</p>
        }
      </div>

      <div className="recap-footer-note">
        {fmt(s.actionsThisWeek.total, 'item')} reviewed this week
      </div>
    </div>
  )
}
