/**
 * scripts/import-to-turso.ts
 *
 * Loads a firestore-backup-*.json (produced by the Firebase export before the
 * project was deleted) into the Turso/libSQL database. Idempotent — existing
 * rows (by id) are skipped, so it's safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/import-to-turso.ts                       # newest backup in cwd
 *   npx tsx scripts/import-to-turso.ts firestore-backup-….json
 *
 * Targets whatever TURSO_DATABASE_URL points at (local file in dev, Turso in prod).
 */
import { config } from 'dotenv'
import { readFileSync, readdirSync } from 'fs'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { suggestions, activityLog } from '../lib/schema'

config({ path: '.env.local' })

const url       = process.env.TURSO_DATABASE_URL || 'file:local.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined
const db = drizzle(createClient({ url, authToken }), { schema: { suggestions, activityLog } })

// ─── helpers ──────────────────────────────────────────────────────────────────

function findBackup(): string {
  const arg = process.argv[2]
  if (arg) return arg
  const candidates = readdirSync('.')
    .filter(f => f.startsWith('firestore-backup-') && f.endsWith('.json'))
    .sort()
  if (!candidates.length) {
    console.error('No firestore-backup-*.json found in cwd. Pass a path explicitly.')
    process.exit(1)
  }
  return candidates[candidates.length - 1] // newest by ISO name
}

// Firestore Timestamp was serialized as { __type:'timestamp', iso, seconds, nanoseconds }
function toDate(v: unknown): Date {
  if (v && typeof v === 'object' && 'iso' in (v as Record<string, unknown>)) {
    return new Date(String((v as { iso: string }).iso))
  }
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  return new Date(0)
}

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

// ─── import ─────────────────────────────────────────────────────────────────────

async function main() {
  const file = findBackup()
  console.log(`Importing from ${file} → ${url}`)

  const backup = JSON.parse(readFileSync(file, 'utf8')) as {
    collections: Record<string, { documents: { id: string; data: Record<string, unknown> }[] }>
  }

  const sugDocs = backup.collections.suggestions?.documents ?? []
  const logDocs = backup.collections.activity_log?.documents ?? []

  let sugCount = 0
  for (const doc of sugDocs) {
    const d = doc.data
    await db.insert(suggestions).values({
      id:              doc.id,
      timestamp:       toDate(d.timestamp),
      category:        str(d.category),
      type:            str(d.type),
      suggestion:      str(d.suggestion),
      why:             str(d.why),
      username:        str(d.username),
      extra:           str(d.extra),
      source:          str(d.source),
      status:          str(d.status, 'New'),
      internalNotes:   str(d.internalNotes),
      preview:         str(d.preview),
      title:           str(d.title),
      resolutionNote:  d.resolutionNote != null ? String(d.resolutionNote) : null,
      resolutionLink:  d.resolutionLink != null ? String(d.resolutionLink) : null,
      moderationState: d.moderationState === 'flagged' ? 'flagged' : 'clean',
      moderationFlags: Array.isArray(d.moderationFlags) ? d.moderationFlags as string[] : [],
    }).onConflictDoNothing()
    sugCount++
  }

  let logCount = 0
  for (const doc of logDocs) {
    const d = doc.data
    await db.insert(activityLog).values({
      id:                doc.id,
      timestamp:         toDate(d.timestamp),
      action:            str(d.action),
      actionSource:      str(d.actionSource),
      suggestionId:      str(d.suggestionId),
      oldStatus:         str(d.oldStatus),
      newStatus:         str(d.newStatus),
      oldNote:           str(d.oldNote),
      newNote:           str(d.newNote),
      noteChanged:       Boolean(d.noteChanged),
      category:          str(d.category),
      type:              str(d.type),
      source:            str(d.source),
      preview:           str(d.preview),
      oldResolutionNote: d.oldResolutionNote != null ? String(d.oldResolutionNote) : null,
      newResolutionNote: d.newResolutionNote != null ? String(d.newResolutionNote) : null,
      resolutionChanged: d.resolutionChanged != null ? Boolean(d.resolutionChanged) : null,
    }).onConflictDoNothing()
    logCount++
  }

  console.log(`✓ Imported ${sugCount} suggestions, ${logCount} activity-log entries`)
  console.log('  (rate_limit skipped — it self-heals)')
}

main().catch(err => { console.error('Import failed:', err); process.exit(1) })
