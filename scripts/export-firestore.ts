/**
 * scripts/export-firestore.ts
 *
 * One-shot backup of EVERY Firestore collection to a single timestamped JSON
 * file, so the data survives deleting the Firebase project.
 *
 * Run with: npx tsx scripts/export-firestore.ts
 * Output:   ./firestore-backup-<ISO>.json
 *
 * Firestore Timestamps are converted to ISO-8601 strings (recoverable on
 * re-import). The dump walks db.listCollections() so no collection is missed,
 * and recurses one level into each document's subcollections.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { config } from 'dotenv'
import { writeFileSync } from 'fs'

config({ path: '.env.local' })

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()

// Recursively convert Firestore types (Timestamp, GeoPoint, DocumentReference)
// into plain JSON-safe values.
function normalize(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', iso: value.toDate().toISOString(), seconds: value.seconds, nanoseconds: value.nanoseconds }
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v)
    }
    return out
  }
  return value
}

async function dumpCollection(ref: FirebaseFirestore.CollectionReference) {
  const snap = await ref.get()
  const docs: Record<string, unknown>[] = []
  for (const doc of snap.docs) {
    const subcollections: Record<string, unknown> = {}
    const subs = await doc.ref.listCollections()
    for (const sub of subs) {
      subcollections[sub.id] = (await dumpCollection(sub)).documents
    }
    docs.push({
      id: doc.id,
      data: normalize(doc.data()),
      ...(subs.length ? { subcollections } : {}),
    })
  }
  return { count: docs.length, documents: docs }
}

async function main() {
  const collections = await db.listCollections()
  if (!collections.length) {
    console.log('No collections found — database is empty. Nothing to back up.')
    return
  }

  const backup: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    collections: {},
  }

  let grandTotal = 0
  for (const col of collections) {
    const dump = await dumpCollection(col)
    ;(backup.collections as Record<string, unknown>)[col.id] = dump
    grandTotal += dump.count
    console.log(`  ${col.id}: ${dump.count} docs`)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = `firestore-backup-${stamp}.json`
  writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`\n✓ Exported ${grandTotal} docs across ${collections.length} collections`)
  console.log(`✓ Saved to ${file}`)
}

main().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})
