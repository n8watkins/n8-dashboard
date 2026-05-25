'use client'
import type { Suggestion } from '@/lib/types'
import { statusClass, sourcePillClass, formatTimestamp } from '@/lib/utils'

// ─── Read-only suggestion detail block (used in both queue and browser) ───────

interface Props {
  item: Suggestion
  title: string
}

export default function SuggestionDetail({ item, title }: Props) {
  return (
    <>
      <div className="card-head">
        <h2>{title}</h2>
        <span className="card-meta">
          {formatTimestamp(item.timestamp)}
        </span>
      </div>

      <div className="pills">
        <span className={sourcePillClass(item.category)}>
          <b>For</b>
          <span className="pill-text">{item.category || '—'}</span>
        </span>
        <span className="pill type">
          <b>Type</b>
          <span className="pill-text">{item.type || '—'}</span>
        </span>
        <span className={sourcePillClass(item.source)}>
          <b>Source</b>
          <span className="pill-text">{item.source || '—'}</span>
        </span>
        <span className={`pill ${statusClass(item.status)}`}>
          <b>Status</b>
          <span className="pill-text">{item.status || 'New'}</span>
        </span>
        {item.moderationState === 'flagged' && (
          <span className="pill flagged">FLAGGED</span>
        )}
      </div>

      {item.moderationState === 'flagged' && item.moderationFlags && item.moderationFlags.length > 0 && (
        <div className="mod-banner">
          <span>⚠</span>
          <span>
            Flagged: contains {item.moderationFlags.map((f, i) => (
              <strong key={i}>{i > 0 ? ', ' : ''}"{f}"</strong>
            ))}
          </span>
        </div>
      )}

      <div className="suggestion-block">
        <div className="field-label">Suggestion</div>
        <div className="field-val lg">{item.suggestion || '—'}</div>
      </div>

      <div className="why-block">
        <div className="field-label">Why this helps</div>
        <div className="field-val">{item.why || '—'}</div>
      </div>

      <div className="detail-row">
        <div className="detail-cell">
          <div className="field-label">Discord Username</div>
          <div className="field-val">{item.username || 'Not provided'}</div>
        </div>
        <div className="detail-cell">
          <div className="field-label">Anything Else</div>
          <div className="field-val">{item.extra || '—'}</div>
        </div>
      </div>

      {item.resolutionNote && (
        <div className="resolution-block">
          <div className="field-label">Resolution</div>
          <div className="field-val">{item.resolutionNote}</div>
          {item.resolutionLink && (
            <a
              href={item.resolutionLink}
              target="_blank"
              rel="noopener noreferrer"
              className="resolution-link"
            >
              ↳ view result
            </a>
          )}
        </div>
      )}
    </>
  )
}
