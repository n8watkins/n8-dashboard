'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase'
import { ADMIN_EMAILS } from '@/lib/config'
import ReviewQueue        from '@/components/admin/ReviewQueue'
import SuggestionBrowser  from '@/components/admin/SuggestionBrowser'
import ActivityLog        from '@/components/admin/ActivityLog'
import { Brand }          from '@/components/Brand'
import SourceDashboard    from '@/components/admin/SourceDashboard'
import SourceLinks        from '@/components/admin/SourceLinks'

type Tab = 'queue' | 'browse' | 'log' | 'links'

// ─── Admin shell (auth gate + tab routing) ────────────────────────────────────

export default function AdminPage() {
  const [user, setUser]           = useState<User | null | undefined>(undefined) // undefined = loading
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  const router      = useRouter()
  const searchParams = useSearchParams()
  const activeTab   = (searchParams.get('view') as Tab) || 'queue'

  // Listen for auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u))
    return unsub
  }, [])

  async function handleSignIn() {
    setSigningIn(true)
    setAuthError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthError(msg.includes('popup-closed') ? 'Sign-in cancelled.' : 'Sign-in failed — try again.')
    } finally {
      setSigningIn(false)
    }
  }

  function setTab(tab: Tab) {
    router.push(tab === 'queue' ? '/admin' : `/admin?view=${tab}`)
  }

  // ── Redirect unknown ?view values to queue ────────────────────────────────
  const validTabs: Tab[] = ['queue', 'browse', 'log', 'links']
  const safeTab: Tab = validTabs.includes(activeTab) ? activeTab : 'queue'

  // ── Loading ───────────────────────────────────────────────────────────────
  if (user === undefined) {
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
          <p className="auth-subtitle">Suggestion Review — Admin only</p>
          <button className="google-btn" onClick={handleSignIn} disabled={signingIn}>
            <GoogleIcon />
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
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
          <button className="google-btn" onClick={() => signOut(auth)}>
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
          <span>{user.email}</span>
          <button
            onClick={() => signOut(auth)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <SourceDashboard />

      <div className="tabs">
        <button className={`tab-btn${safeTab === 'queue'  ? ' active' : ''}`} onClick={() => setTab('queue')}>Review Queue</button>
        <button className={`tab-btn${safeTab === 'browse' ? ' active' : ''}`} onClick={() => setTab('browse')}>All Suggestions</button>
        <button className={`tab-btn${safeTab === 'log'    ? ' active' : ''}`} onClick={() => setTab('log')}>Activity Log</button>
        <button className={`tab-btn${safeTab === 'links'  ? ' active' : ''}`} onClick={() => setTab('links')}>Source Links</button>
      </div>

      {safeTab === 'queue'  && <ReviewQueue />}
      {safeTab === 'browse' && <SuggestionBrowser />}
      {safeTab === 'log'    && <ActivityLog />}
      {safeTab === 'links'  && <div className="card"><SourceLinks /></div>}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
