// ─── Better Auth route handler (all /api/auth/* endpoints) ────────────────────
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
