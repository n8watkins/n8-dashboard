'use client'
import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS, FIELD_LIMITS } from '@/lib/config'

// ─── Cloudflare Turnstile type ───────────────────────────────────────────────
declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: {
        sitekey: string
        callback?: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
        theme?: 'auto' | 'light' | 'dark'
        size?: 'normal' | 'flexible' | 'compact'
      }) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

// ─── Public suggestion form (v2 — numbered questions + option chips) ──────────

export default function SuggestionFormPage() {
  return (
    <Suspense>
      <SuggestionFormInner />
    </Suspense>
  )
}

function SuggestionFormInner() {
  const router = useRouter()
  const params = useSearchParams()

  const prefilledSource = decodeURIComponent(params.get('source') || '')
  const validSource = SOURCE_OPTIONS.includes(prefilledSource as never)
    ? prefilledSource : ''

  const [fields, setFields] = useState({
    category:   '',
    type:       '',
    suggestion: '',
    why:        '', // removed from the form; always sent empty (optional server-side)
    username:   '',
    source:     validSource,
    hp:         '', // honeypot — must stay empty
  })
  const [touched,  setTouched]  = useState<Set<string>>(new Set())
  const [status,   setStatus]   = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const widgetRef   = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Load Cloudflare Turnstile and render the widget if a site key is configured.
  // The managed widget auto-solves for legit users and fires `callback` with a
  // single-use token, which we send to /api/submit for server-side siteverify.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    function render() {
      if (!widgetRef.current || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        theme: 'auto',
        callback:           token => setTurnstileToken(token),
        'expired-callback': ()    => setTurnstileToken(null),
        'error-callback':   ()    => setTurnstileToken(null),
      })
    }

    if (window.turnstile) {
      render()
    } else if (!document.querySelector('[data-turnstile]')) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      script.dataset.turnstile = '1'
      script.onload = render
      document.head.appendChild(script)
    } else {
      const t = setInterval(() => {
        if (window.turnstile) { render(); clearInterval(t) }
      }, 200)
      return () => clearInterval(t)
    }
  }, [])

  function resetTurnstile() {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setTurnstileToken(null)
    }
  }

  function set(key: string, value: string) {
    setFields(f => ({ ...f, [key]: value }))
  }

  function touch(key: string) {
    setTouched(prev => new Set([...prev, key]))
  }

  // Pick an option chip for a single-select question.
  function pick(key: string, value: string) {
    // Tapping the selected chip again clears it (only matters for optional ones).
    set(key, fields[key as keyof typeof fields] === value ? '' : value)
    touch(key)
  }

  function validate(f: typeof fields): Record<string, string> {
    const errs: Record<string, string> = {}

    const s = f.suggestion.trim()
    if (!s)                                            errs.suggestion = 'Please write your suggestion.'
    else if (s.length < FIELD_LIMITS.suggestion.min)   errs.suggestion = `At least ${FIELD_LIMITS.suggestion.min} characters required.`
    else if (s.length > FIELD_LIMITS.suggestion.max)   errs.suggestion = `Maximum ${FIELD_LIMITS.suggestion.max} characters.`

    if (!f.type)     errs.type     = 'Please pick a type.'
    if (!f.category) errs.category = 'Please pick a category.'

    // username + source are optional
    if (f.username.length > FIELD_LIMITS.username.max) errs.username = `Maximum ${FIELD_LIMITS.username.max} characters.`

    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'submitting') return

    setTouched(new Set(['suggestion', 'type', 'category', 'username']))

    const errs = validate(fields)
    if (Object.keys(errs).length > 0) {
      setStatus('idle')
      setErrorMsg('')
      return
    }

    // Bot check must be solved before submit (Turnstile auto-solves on load).
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setStatus('error')
      setErrorMsg('Bot check is still loading — give it a second and try again.')
      return
    }

    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...fields, turnstileToken }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong. Try again.')
        resetTurnstile() // token is single-use — refresh it for the retry
        return
      }

      router.push('/success')
    } catch {
      setStatus('error')
      setErrorMsg('Network error — check your connection and try again.')
      resetTurnstile()
    }
  }

  const submitting = status === 'submitting'
  const errors     = validate(fields)

  function fieldErr(key: string): string | undefined {
    return touched.has(key) ? errors[key] : undefined
  }

  // Single-select chip group (replaces a <select>). Options come straight from
  // lib/config, so every choice is always present. `icon` is optional per option.
  function ChipGroup({ field, options, icon }: {
    field: string
    options: readonly string[]
    icon?: (opt: string) => React.ReactNode
  }) {
    const err = fieldErr(field)
    const selected = (fields as Record<string, string>)[field]
    return (
      <>
        <div className={`opt-group${err ? ' has-error' : ''}`}>
          {options.map(opt => (
            <button
              type="button"
              key={opt}
              className={`opt${selected === opt ? ' on' : ''}`}
              aria-pressed={selected === opt}
              onClick={() => pick(field, opt)}
            >
              {icon?.(opt)}
              {opt}
            </button>
          ))}
        </div>
        {err && <div className="field-error">{err}</div>}
      </>
    )
  }

  return (
    <div className="form-shell">
      <div className="form-card">

        {/* Header */}
        <div className="form-header">
          <div className="form-header-top">
            <span className="form-brand-dot" />
            <h1 className="form-title">Nasty N8 Suggestion Box</h1>
          </div>
          <p className="form-desc">
            Got an idea, problem, content request, or community suggestion? Use this box
            for anything related to the stream, videos, Discord, events, emotes, coaching,
            or Nasty N8 community stuff.
          </p>
        </div>

        {/* Honeypot — visually hidden; bots fill it in, humans never see it */}
        <div className="hp-field" aria-hidden="true">
          <input
            name="hp"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={fields.hp}
            onChange={e => set('hp', e.target.value)}
          />
        </div>

        <form className="form-body" onSubmit={handleSubmit}>

          {validSource && (
            <div className="form-source-tag">◎ Responding from <strong>{validSource}</strong></div>
          )}

          {/* Q1 — Suggestion (open-ended, first) */}
          <div className="form-q">
            <div className="q-label">
              <span className="q-num">1</span>
              <span className="q-text">What&apos;s your suggestion? <span className="req">*</span></span>
            </div>
            <textarea
              className="form-textarea"
              value={fields.suggestion}
              onChange={e => set('suggestion', e.target.value)}
              onBlur={() => touch('suggestion')}
              placeholder="Be specific. What should be added, changed, fixed, tested, or removed?"
            />
            <div className="char-count-row">
              <span className={fields.suggestion.length > FIELD_LIMITS.suggestion.max ? 'over-limit' : ''}>
                {fields.suggestion.length} / {FIELD_LIMITS.suggestion.max}
              </span>
            </div>
            {fieldErr('suggestion') && <div className="field-error">{fieldErr('suggestion')}</div>}
          </div>

          {/* Q2 — Type */}
          <div className="form-q">
            <div className="q-label">
              <span className="q-num">2</span>
              <span className="q-text">What type of suggestion is this? <span className="req">*</span></span>
            </div>
            <ChipGroup field="type" options={TYPE_OPTIONS} />
          </div>

          {/* Q3 — Category */}
          <div className="form-q">
            <div className="q-label">
              <span className="q-num">3</span>
              <span className="q-text">What is this suggestion for? <span className="req">*</span></span>
            </div>
            <ChipGroup field="category" options={CATEGORY_OPTIONS} />
          </div>

          {/* Q4 — Discord username (optional) */}
          <div className="form-q">
            <div className="q-label">
              <span className="q-num">4</span>
              <span className="q-text">What&apos;s your Discord username? <span className="opt-tag">optional</span></span>
            </div>
            <input
              type="text"
              className="form-input"
              value={fields.username}
              onChange={e => set('username', e.target.value)}
              onBlur={() => touch('username')}
              placeholder="Include this if you'd like a follow-up"
            />
            {fieldErr('username') && <div className="field-error">{fieldErr('username')}</div>}
          </div>

          {/* Q5 — Source (optional, with icons; hidden when pre-set from the URL) */}
          {!validSource && (
            <div className="form-q">
              <div className="q-label">
                <span className="q-num">5</span>
                <span className="q-text">Where are you submitting from? <span className="opt-tag">optional</span></span>
              </div>
              <ChipGroup field="source" options={SOURCE_OPTIONS} icon={sourceIcon} />
            </div>
          )}

          {TURNSTILE_SITE_KEY && (
            <div ref={widgetRef} className="turnstile-widget" style={{ margin: '4px 0 16px' }} />
          )}

          {status === 'error' && errorMsg && (
            <div className="form-error" role="alert">{errorMsg}</div>
          )}

          <hr className="form-sep" />

          <button
            type="submit"
            className={`form-submit${submitting ? ' submitting' : ''}`}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Suggestion →'}
          </button>

          <p className="form-disclaimer">
            By submitting, you understand your suggestion may be reviewed, discussed on stream,
            turned into a poll, or shared publicly in the Nasty N8 community. Don&apos;t submit
            anything private or personal.
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── Source-option icons ──────────────────────────────────────────────────────

function sourceIcon(opt: string): React.ReactNode {
  if (opt === 'Discord')        return <DiscordIcon />
  if (opt.startsWith('Twitch')) return <TwitchIcon />
  if (opt.startsWith('YouTube')) return <YouTubeIcon />
  if (opt === 'Stream chat')    return <ChatIcon />
  return null
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M19.27 5.33A16.6 16.6 0 0 0 15.05 4c-.18.33-.39.77-.54 1.11a15.4 15.4 0 0 0-4.02 0C10.34 4.77 10.12 4.33 9.95 4a16.6 16.6 0 0 0-4.22 1.33C3.05 9.32 2.33 13.2 2.69 17.02a16.7 16.7 0 0 0 5.06 2.57c.41-.56.77-1.16 1.08-1.79-.59-.22-1.16-.5-1.69-.83.14-.1.28-.21.41-.32 3.27 1.52 6.8 1.52 10.03 0 .14.11.27.22.41.32-.54.33-1.1.61-1.7.83.32.62.68 1.22 1.09 1.78a16.7 16.7 0 0 0 5.06-2.57c.42-4.43-.72-8.28-3.02-11.69ZM8.84 14.67c-.99 0-1.8-.91-1.8-2.02s.79-2.03 1.8-2.03 1.82.92 1.8 2.03c0 1.11-.8 2.02-1.8 2.02Zm6.64 0c-.99 0-1.8-.91-1.8-2.02s.79-2.03 1.8-2.03 1.82.92 1.8 2.03c0 1.11-.79 2.02-1.8 2.02Z"/>
    </svg>
  )
}

function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2 3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2H7Zm12.14 9.29-2.86 2.85h-2.85l-2.5 2.5v-2.5H7.71V3.43h11.43Z"/>
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3 3 0 0 0 2.12-2.14A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z"/>
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v4l4-4h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
    </svg>
  )
}
