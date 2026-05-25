// ─── Brand mark + wordmark ────────────────────────────────────────────────────

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <div className="brand-mark" />
      <div>
        <div className="brand-name">Nasty N8</div>
        {subtitle && <div className="brand-subtitle">{subtitle}</div>}
      </div>
    </div>
  )
}
