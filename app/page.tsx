'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS, FIELD_LIMITS } from '@/lib/config'

// ─── reCAPTCHA v3 type ────────────────────────────────────────────────────────
declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, opts: { action: string }) => Promise<string>
    }
  }
}

// ─── Public suggestion form ───────────────────────────────────────────────────

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
    why:        '',
    username:   '',
    extra:      '',
    source:     validSource,
    hp:         '', // honeypot — must stay empty
  })
  const [touched,  setTouched]  = useState<Set<string>>(new Set())
  const [status,   setStatus]   = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Load reCAPTCHA v3 script if the site key is configured
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    if (!siteKey || document.querySelector('[data-recaptcha]')) return
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
    script.dataset.recaptcha = '1'
    script.async = true
    document.head.appendChild(script)
  }, [])

  function set(key: string, value: string) {
    setFields(f => ({ ...f, [key]: value }))
  }

  function touch(key: string) {
    setTouched(prev => new Set([...prev, key]))
  }

  function validate(f: typeof fields): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!f.category) errs.category = 'Please select a category.'
    if (!f.type)     errs.type     = 'Please select a type.'

    const s = f.suggestion.trim()
    if (!s)                                            errs.suggestion = 'Please write your suggestion.'
    else if (s.length < FIELD_LIMITS.suggestion.min)   errs.suggestion = `At least ${FIELD_LIMITS.suggestion.min} characters required.`
    else if (s.length > FIELD_LIMITS.suggestion.max)   errs.suggestion = `Maximum ${FIELD_LIMITS.suggestion.max} characters.`

    const w = f.why.trim()
    if (!w)                                  errs.why = 'Please explain why this would help.'
    else if (w.length < FIELD_LIMITS.why.min)   errs.why = `At least ${FIELD_LIMITS.why.min} characters required.`
    else if (w.length > FIELD_LIMITS.why.max)   errs.why = `Maximum ${FIELD_LIMITS.why.max} characters.`

    if (f.extra.length    > FIELD_LIMITS.extra.max)    errs.extra    = `Maximum ${FIELD_LIMITS.extra.max} characters.`
    if (f.username.length > FIELD_LIMITS.username.max) errs.username = `Maximum ${FIELD_LIMITS.username.max} characters.`

    return errs
  }

  async function getRecaptchaToken(): Promise<string | null> {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    if (!siteKey || !window.grecaptcha) return null
    return new Promise(resolve => {
      window.grecaptcha!.ready(() => {
        window.grecaptcha!.execute(siteKey, { action: 'submit' })
          .then(token => resolve(token))
          .catch(() => resolve(null))
      })
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'submitting') return

    setTouched(new Set(['category', 'type', 'suggestion', 'why', 'extra', 'username']))

    const errs = validate(fields)
    if (Object.keys(errs).length > 0) {
      setStatus('idle')
      setErrorMsg('')
      return
    }

    setStatus('submitting')
    setErrorMsg('')

    const recaptchaToken = await getRecaptchaToken()

    try {
      const res = await fetch('/api/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...fields, recaptchaToken }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong. Try again.')
        return
      }

      router.push('/success')
    } catch {
      setStatus('error')
      setErrorMsg('Network error — check your connection and try again.')
    }
  }

  const submitting = status === 'submitting'
  const errors     = validate(fields)

  function fieldErr(key: string): string | undefined {
    return touched.has(key) ? errors[key] : undefined
  }

  // ─── Dead link — no valid source in URL ───────────────────────────────────
  if (!validSource) {
    return (
      <div className="form-shell">
        <div className="form-card" style={{ textAlign: 'center', padding: '56px 32px' }}>
          <div className="brand-mark form-brand-mark" style={{ margin: '0 auto 24px' }} />
          <h1 className="form-title" style={{ marginBottom: 12 }}>Invalid link</h1>
          <p className="form-desc" style={{ maxWidth: 360, margin: '0 auto' }}>
            This link is missing a source. Use the specific link shared in Discord,
            stream chat, or YouTube — don't open this page directly.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="form-shell">
      <div className="form-card">
        <div className="brand-mark form-brand-mark" />

        <div className="form-source-tag">
          Responding from <strong>{validSource}</strong>
        </div>

        <h1 className="form-title">Nasty N8 Suggestion Box</h1>
        <p className="form-desc">
          Got an idea, problem, content request, or community suggestion?
          Use this box for anything related to the stream, videos, Discord,
          events, emotes, coaching, or Nasty N8 community stuff.
          <br /><br />
          By submitting, you understand your suggestion may be reviewed, discussed
          on stream, turned into a poll, or shared publicly in the Nasty N8 community.
          Don't submit anything private or personal.
        </p>

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

        <form onSubmit={handleSubmit}>

          {/* Category */}
          <div className={`form-field${fieldErr('category') ? ' has-error' : ''}`}>
            <label className="form-label">
              What is this suggestion for? <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={fields.category}
              onChange={e => set('category', e.target.value)}
              onBlur={() => touch('category')}
            >
              <option value="">Select a category…</option>
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErr('category') && <div className="field-error">{fieldErr('category')}</div>}
          </div>

          {/* Type */}
          <div className={`form-field${fieldErr('type') ? ' has-error' : ''}`}>
            <label className="form-label">
              What type of suggestion is this? <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={fields.type}
              onChange={e => set('type', e.target.value)}
              onBlur={() => touch('type')}
            >
              <option value="">Select a type…</option>
              {TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErr('type') && <div className="field-error">{fieldErr('type')}</div>}
          </div>

          {/* Suggestion */}
          <div className={`form-field${fieldErr('suggestion') ? ' has-error' : ''}`}>
            <label className="form-label">
              What's your suggestion? <span className="req">*</span>
            </label>
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

          {/* Why */}
          <div className={`form-field${fieldErr('why') ? ' has-error' : ''}`}>
            <label className="form-label">
              Why would this help? <span className="req">*</span>
            </label>
            <textarea
              className="form-textarea"
              value={fields.why}
              onChange={e => set('why', e.target.value)}
              onBlur={() => touch('why')}
              placeholder="What problem does this solve, or what would it make better?"
            />
            <div className="char-count-row">
              <span className={fields.why.length > FIELD_LIMITS.why.max ? 'over-limit' : ''}>
                {fields.why.length} / {FIELD_LIMITS.why.max}
              </span>
            </div>
            {fieldErr('why') && <div className="field-error">{fieldErr('why')}</div>}
          </div>

          {/* Discord username */}
          <div className={`form-field${fieldErr('username') ? ' has-error' : ''}`}>
            <label className="form-label">What's your Discord username?</label>
            <input
              type="text"
              className="form-input"
              value={fields.username}
              onChange={e => set('username', e.target.value)}
              onBlur={() => touch('username')}
              placeholder="Optional — include this if you'd like a follow-up"
            />
            {fieldErr('username') && <div className="field-error">{fieldErr('username')}</div>}
          </div>

          {/* Anything else */}
          <div className={`form-field${fieldErr('extra') ? ' has-error' : ''}`}>
            <label className="form-label">Anything else?</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 80 }}
              value={fields.extra}
              onChange={e => set('extra', e.target.value)}
              onBlur={() => touch('extra')}
              placeholder="Extra context, examples, screenshots, or whatever else helps."
            />
            <div className="char-count-row">
              <span className={fields.extra.length > FIELD_LIMITS.extra.max ? 'over-limit' : ''}>
                {fields.extra.length} / {FIELD_LIMITS.extra.max}
              </span>
            </div>
            {fieldErr('extra') && <div className="field-error">{fieldErr('extra')}</div>}
          </div>

          {status === 'error' && errorMsg && (
            <div className="form-error">{errorMsg}</div>
          )}

          <button
            type="submit"
            className={`form-submit${submitting ? ' submitting' : ''}`}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Suggestion'}
          </button>
        </form>
      </div>
    </div>
  )
}
