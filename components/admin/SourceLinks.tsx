'use client'
import { useState, useEffect } from 'react'
import { SOURCE_OPTIONS } from '@/lib/config'
import { sourcePillClass } from '@/lib/utils'

// ─── Source link cards with copy-to-clipboard ────────────────────────────────

const HINTS: Record<string, string> = {
  'Stream chat':                          'Restream bot reply, Twitch chat command',
  'Twitch profile / About page':          'Twitch profile panel',
  'YouTube stream page / description':    'YouTube stream description',
  'YouTube video description':            'YouTube video description',
  'Discord':                              'Discord server post or channel description',
}

export default function SourceLinks() {
  const [origin, setOrigin]           = useState('')
  const [copied, setCopied]           = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  function buildUrl(src: string): string {
    return `${origin}/?source=${encodeURIComponent(src)}`
  }

  async function copyUrl(src: string) {
    const url = buildUrl(src)
    await navigator.clipboard.writeText(url)
    setCopied(src)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div>
      <div className="card-head" style={{ marginBottom: 18 }}>
        <h2>Source Links</h2>
        <span className="card-meta">5 tracked sources</span>
      </div>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Drop these links into your channels. The source field in the form will pre-fill automatically.
      </p>
      <div className="source-links-grid">
        {SOURCE_OPTIONS.map(src => {
          const url = buildUrl(src)
          const isCopied = copied === src
          return (
            <div key={src} className="source-link-card">
              <div className="source-link-header">
                <span className={sourcePillClass(src)}>{src}</span>
                <span className="source-link-hint">{HINTS[src] ?? ''}</span>
              </div>
              <div className="source-link-url">{origin ? url : '…'}</div>
              <button
                className={`small-btn source-link-copy${isCopied ? ' active' : ''}`}
                onClick={() => copyUrl(src)}
                disabled={!origin}
              >
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
