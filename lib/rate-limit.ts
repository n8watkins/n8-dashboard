import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { rateLimit } from './schema'

// ─── IP-based rate limiting (Turso-backed) ────────────────────────────────────

const WINDOW_MINUTE  = 60 * 1000        // ms
const WINDOW_HOUR    = 60 * 60 * 1000   // ms
const LIMIT_MINUTE   = 3
const LIMIT_HOUR     = 30

function hashIp(ip: string): string {
  return crypto.createHash('sha1').update(ip).digest('hex')
}

export async function checkRateLimit(ip: string): Promise<{ ok: boolean; resetIn?: number }> {
  const key  = hashIp(ip)
  const rows = await db.select().from(rateLimit).where(eq(rateLimit.id, key)).limit(1)

  const now        = Date.now()
  const stored     = rows[0]?.timestamps ?? []
  const recent     = stored.filter(t => now - t < WINDOW_HOUR)
  const lastMinute = recent.filter(t => now - t < WINDOW_MINUTE)

  if (lastMinute.length >= LIMIT_MINUTE) {
    const oldest  = Math.min(...lastMinute)
    const resetIn = Math.max(1, Math.ceil((oldest + WINDOW_MINUTE - now) / 1000))
    return { ok: false, resetIn }
  }

  if (recent.length >= LIMIT_HOUR) {
    const oldest  = Math.min(...recent)
    const resetIn = Math.max(1, Math.ceil((oldest + WINDOW_HOUR - now) / 1000))
    return { ok: false, resetIn }
  }

  // Append timestamp and upsert. Awaited (not fire-and-forget) so the write
  // completes before a serverless function can be frozen; non-fatal on error.
  const updated = [...recent, now].slice(-60)
  try {
    await db.insert(rateLimit)
      .values({ id: key, timestamps: updated, updatedAt: new Date() })
      .onConflictDoUpdate({ target: rateLimit.id, set: { timestamps: updated, updatedAt: new Date() } })
  } catch { /* rate-limit write is best-effort */ }

  return { ok: true }
}
