import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from './firebase-admin'

// ─── IP-based rate limiting (Firestore-backed) ────────────────────────────────

const WINDOW_MINUTE  = 60 * 1000        // ms
const WINDOW_HOUR    = 60 * 60 * 1000   // ms
const LIMIT_MINUTE   = 3
const LIMIT_HOUR     = 30

function hashIp(ip: string): string {
  return crypto.createHash('sha1').update(ip).digest('hex')
}

export async function checkRateLimit(ip: string): Promise<{ ok: boolean; resetIn?: number }> {
  const key  = hashIp(ip)
  const ref  = adminDb.collection('rate_limit').doc(key)
  const snap = await ref.get()

  const now        = Date.now()
  const stored     = snap.exists ? ((snap.data()!.timestamps as number[]) ?? []) : []
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

  // Append timestamp and write back (fire-and-forget — don't block the response)
  const updated = [...recent, now].slice(-60)
  ref.set({ timestamps: updated, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})

  return { ok: true }
}
