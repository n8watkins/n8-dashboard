import Link from 'next/link'

export default function SuccessPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '20px' }}>
      <div className="form-card" style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h1 className="form-title">Suggestion received.</h1>
        <p className="form-desc" style={{ margin: '8px 0 24px' }}>
          Appreciate the idea — I'll review it soon.
        </p>
        <Link href="/" style={{ color: 'var(--green)', fontSize: 14 }}>
          ← Submit another suggestion
        </Link>
      </div>
    </div>
  )
}
