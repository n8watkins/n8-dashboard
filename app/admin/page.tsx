'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn, signOut, useSession } from '@/lib/auth-client'
import { ADMIN_EMAILS } from '@/lib/config'
import ReviewQueue        from '@/components/admin/ReviewQueue'
import SuggestionBrowser  from '@/components/admin/SuggestionBrowser'
import ActivityLog        from '@/components/admin/ActivityLog'
import { Brand }          from '@/components/Brand'
import SourceDashboard    from '@/components/admin/SourceDashboard'
import SourceLinks        from '@/components/admin/SourceLinks'
import WeeklyRecap        from '@/components/admin/WeeklyRecap'
import { fetchStats }     from '@/lib/admin-api'

type Tab = 'queue' | 'browse' | 'log' | 'links'

// ─── Admin shell (auth gate + tab routing) ────────────────────────────────────

// Next.js requires useSearchParams() to be inside a Suspense boundary
export default function AdminPage() {
  return (
    <Suspense>
      <AdminInner />
    </Suspense>
  )
}

function AdminInner() {
  const { data: sessionData, isPending } = useSession()
  const user = sessionData?.user ?? null

  const [email,     setEmail]     = useState('')
  const [linkState, setLinkState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [authError, setAuthError] = useState('')
  const [flaggedCount, setFlaggedCount] = useState(0)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const activeTab    = (searchParams.get('view') as Tab) || 'queue'

  // Tracks which tabs have been mounted at least once; once mounted, they stay
  // alive (CSS show/hide) so switching back doesn't trigger a re-fetch.
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set([activeTab]))

  // Fetch flagged count once user is confirmed admin
  useEffect(() => {
    if (user && ADMIN_EMAILS.includes(user.email || '')) {
      fetchStats().then(s => setFlaggedCount(s.flagged))
    }
  }, [user])

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    const addr = email.trim()
    if (!addr || linkState === 'sending') return
    setLinkState('sending')
    setAuthError('')
    const { error } = await signIn.magicLink({ email: addr, callbackURL: '/admin' })
    if (error) {
      setLinkState('idle')
      setAuthError('Could not send link — try again.')
    } else {
      setLinkState('sent')
    }
  }

  function setTab(tab: Tab) {
    setMountedTabs(prev => new Set([...prev, tab]))
    router.push(tab === 'queue' ? '/admin' : `/admin?view=${tab}`)
  }

  // ── Redirect unknown ?view values to queue ────────────────────────────────
  const validTabs: Tab[] = ['queue', 'browse', 'log', 'links']
  const safeTab: Tab = validTabs.includes(activeTab) ? activeTab : 'queue'

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        </div>
      </div>
    )
  }

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Nasty N8</h1>
          <p className="auth-subtitle">Dashboard — Admin only</p>
          {linkState === 'sent' ? (
            <p className="auth-subtitle" style={{ marginTop: 14, lineHeight: 1.5 }}>
              If <strong>{email.trim()}</strong> is an admin, a sign-in link is on its way.
              Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSendLink} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin email"
                className="form-input"
                autoComplete="email"
              />
              <button className="google-btn" type="submit" disabled={linkState === 'sending'}>
                {linkState === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
              </button>
            </form>
          )}
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </div>
    )
  }

  // ── Signed in but not an admin ────────────────────────────────────────────
  if (!ADMIN_EMAILS.includes(user.email || '')) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 style={{ color: 'var(--red)' }}>Access denied</h1>
          <p className="auth-subtitle" style={{ marginBottom: 16 }}>
            {user.email} is not on the admin list.
          </p>
          <button className="google-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // ── Admin UI ──────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <div className="topbar">
        <Brand subtitle="Suggestion Review" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
          {flaggedCount > 0 && (
            <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.05em' }}>
              ⚠ {flaggedCount} flagged
            </span>
          )}
          <span>{user.email}</span>
          <button
            onClick={() => signOut()}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <SourceDashboard />
      <WeeklyRecap />

      <div className="tabs">
        <button className={`tab-btn${safeTab === 'queue'  ? ' active' : ''}`} onClick={() => setTab('queue')}>Review Queue</button>
        <button className={`tab-btn${safeTab === 'browse' ? ' active' : ''}`} onClick={() => setTab('browse')}>All Suggestions</button>
        <button className={`tab-btn${safeTab === 'log'    ? ' active' : ''}`} onClick={() => setTab('log')}>Activity Log</button>
        <button className={`tab-btn${safeTab === 'links'  ? ' active' : ''}`} onClick={() => setTab('links')}>Source Links</button>
      </div>

      {mountedTabs.has('queue')  && <div style={{ display: safeTab === 'queue'  ? 'block' : 'none' }}><ReviewQueue /></div>}
      {mountedTabs.has('browse') && <div style={{ display: safeTab === 'browse' ? 'block' : 'none' }}><SuggestionBrowser /></div>}
      {mountedTabs.has('log')    && <div style={{ display: safeTab === 'log'    ? 'block' : 'none' }}><ActivityLog /></div>}
      {mountedTabs.has('links')  && <div style={{ display: safeTab === 'links'  ? 'block' : 'none' }}><div className="card"><SourceLinks /></div></div>}
    </div>
  )
}
