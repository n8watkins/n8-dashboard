// ─── Firebase Admin SDK (server-side only — never runs in browser) ────────────
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Lazy init — env vars are only available at runtime, not during next build.
// Calling getAdminDb() at module level would crash the build.
let _db: ReturnType<typeof getFirestore> | null = null

export function getAdminDb() {
  if (_db) return _db
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  _db = getFirestore()
  return _db
}
