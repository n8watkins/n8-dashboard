// ─── libSQL / Turso client + Drizzle instance (server-side only) ──────────────
// Local dev defaults to a file DB (no Turso account needed). Production sets
// TURSO_DATABASE_URL (libsql://…) + TURSO_AUTH_TOKEN. Never import from a
// Client Component — this pulls in node/libsql and must stay server-side.
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url       = process.env.TURSO_DATABASE_URL || 'file:local.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

export const client = createClient({ url, authToken })
export const db = drizzle(client, { schema })
