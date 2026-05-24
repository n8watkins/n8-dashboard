// ─── Text helpers (ported from your Google Apps Script) ──────────────────────

export function makeTitle(text: string): string {
  const cleaned = (text || '').trim()
  if (!cleaned) return 'Untitled suggestion'
  const first = cleaned.split(/[.!?]/)[0].trim()
  return truncate(first || cleaned, 58)
}

export function makePreview(text: string): string {
  return truncate((text || '').replace(/\s+/g, ' ').trim(), 120)
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max - 1).trim() + '…'
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function normalizeStatus(status: string): string {
  const clean = (status || '').trim()
  const valid = ['New', 'Active', 'Done', 'Duplicate', 'Rejected']
  if (valid.includes(clean)) return clean
  return 'Active'
}

export function isNew(status: string) { return normalizeStatus(status) === 'New' }
export function isActive(status: string) { return normalizeStatus(status) === 'Active' }
export function isResolved(status: string) {
  const s = normalizeStatus(status)
  return s === 'Done' || s === 'Duplicate' || s === 'Rejected'
}

// ─── Status / source pill CSS classes ────────────────────────────────────────

export function statusClass(status: string): string {
  switch (normalizeStatus(status)) {
    case 'New':       return 'new'
    case 'Active':    return 'active'
    case 'Done':      return 'done'
    case 'Duplicate': return 'duplicate'
    case 'Rejected':  return 'rejected'
    default:          return ''
  }
}

export function sourcePillClass(value: string): string {
  const t = (value || '').toLowerCase()
  if (t.includes('discord'))  return 'pill discord'
  if (t.includes('youtube') || t.includes('video')) return 'pill youtube'
  if (t.includes('twitch'))   return 'pill twitch'
  if (t.includes('stream'))   return 'pill source'
  return 'pill'
}

// ─── Related-suggestions keyword scoring (ported from Apps Script) ────────────

const STOPWORDS = new Set([
  'the','and','for','with','that','this','you','your','are','but','not',
  'can','could','would','should','from','they','them','have','has','had',
  'into','like','just','make','add','use','more','less','when','what',
  'where','why','how','people','suggestion',
])

export function getKeywordSet(text: string): Set<string> {
  return new Set(
    (text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w))
  )
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
