// ─── Admin route guard ────────────────────────────────────────────────────────
// Every /api/admin/* handler calls this first. Returns null when the caller is
// an authenticated admin, or a 401 NextResponse to return immediately.
import { NextResponse } from 'next/server'
import { auth } from './auth'
import { ADMIN_EMAILS } from './config'

export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (session && ADMIN_EMAILS.includes(session.user.email || '')) return null
  } catch {
    /* fall through to 401 */
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
