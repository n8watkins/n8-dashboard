'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS } from '@/lib/config'

// ─── Public suggestion form ───────────────────────────────────────────────────

export default function SuggestionFormPage() {
  const router = useRouter()
  const params = useSearchParams()

  // Pre-fill source from URL param, e.g. /?source=Discord
  const prefilledSource = decodeURIComponent(params.get('source') || '')
  const validSource = SOURCE_OPTIONS.includes(prefilledSource as never)
    ? prefilledSource : ''

  const [fields, setFields] = useState({
    category: '',
    type: '',
    suggestion: '',
    why: '',
    username: '',
    extra: '',
    source: validSource,
  })

  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function set(key: string, value: string) {
    setFields(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'submitting') return

    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
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

  return (
    <div className="form-shell">
      <div className="form-card">
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

        <form onSubmit={handleSubmit}>
          {/* Category */}
          <div className="form-field">
            <label className="form-label">
              What is this suggestion for? <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={fields.category}
              onChange={e => set('category', e.target.value)}
              required
            >
              <option value="">Select a category…</option>
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="form-field">
            <label className="form-label">
              What type of suggestion is this? <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={fields.type}
              onChange={e => set('type', e.target.value)}
              required
            >
              <option value="">Select a type…</option>
              {TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Suggestion */}
          <div className="form-field">
            <label className="form-label">
              What's your suggestion? <span className="req">*</span>
            </label>
            <textarea
              className="form-textarea"
              value={fields.suggestion}
              onChange={e => set('suggestion', e.target.value)}
              placeholder="Be specific. What should be added, changed, fixed, tested, or removed?"
              required
            />
          </div>

          {/* Why */}
          <div className="form-field">
            <label className="form-label">
              Why would this help? <span className="req">*</span>
            </label>
            <textarea
              className="form-textarea"
              value={fields.why}
              onChange={e => set('why', e.target.value)}
              placeholder="What problem does this solve, or what would it make better?"
              required
            />
          </div>

          {/* Discord username */}
          <div className="form-field">
            <label className="form-label">What's your Discord username?</label>
            <input
              type="text"
              className="form-input"
              value={fields.username}
              onChange={e => set('username', e.target.value)}
              placeholder="Optional — include this if you'd like a follow-up"
            />
          </div>

          {/* Anything else */}
          <div className="form-field">
            <label className="form-label">Anything else?</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 80 }}
              value={fields.extra}
              onChange={e => set('extra', e.target.value)}
              placeholder="Extra context, examples, screenshots, or whatever else helps."
            />
          </div>

          {/* Source (auto-filled or manual) */}
          <div className="form-field">
            <label className="form-label">
              Where are you submitting from? <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={fields.source}
              onChange={e => set('source', e.target.value)}
              required
            >
              <option value="">Select a source…</option>
              {SOURCE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {validSource && (
              <p className="form-hint">
                Auto-filled from the link you used. Leave this as-is unless it's wrong.
              </p>
            )}
          </div>

          {status === 'error' && (
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
