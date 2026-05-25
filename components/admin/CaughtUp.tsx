import Link from 'next/link'

// ─── Queue-empty hero state ───────────────────────────────────────────────────

export default function CaughtUp() {
  return (
    <div className="caught-up">
      <div className="caught-up-check">✓</div>
      <h2 className="caught-up-h1">You're all caught up.</h2>
      <p className="caught-up-p">
        Nothing new to review right now. New suggestions land here as they come in.
      </p>
      <div className="next-actions">
        <Link href="/admin?view=browse" className="next-action-card">
          Browse all suggestions
        </Link>
        <Link href="/admin?view=log" className="next-action-card">
          View activity log
        </Link>
        <a href="/" target="_blank" rel="noopener noreferrer" className="next-action-card">
          Open the public form
        </a>
      </div>
    </div>
  )
}
