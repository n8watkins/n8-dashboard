import 'server-only'
// ─── Better Auth (server) — magic-link admin login on Turso/Drizzle ───────────
// Replaces Firebase Auth (Google sign-in). Only the ADMIN_EMAILS allowlist can
// ever receive a link, so only the two admins can sign in. Long rolling session
// so they stay logged in for months.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { db } from './db'
import { user, session, account, verification } from './schema'
import { ADMIN_EMAILS } from './config'
import { sendMagicLinkEmail } from './email'

const ADMIN_SET = new Set(ADMIN_EMAILS.map(e => e.toLowerCase()))

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret:  process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 90, // 90-day session
    updateAge: 60 * 60 * 24,      // refreshed daily → effectively "stays signed in"
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Allowlist gate: non-admins never receive a link, so they can't sign in.
        // Returning silently (no error) avoids leaking which emails are admins.
        if (!ADMIN_SET.has(email.toLowerCase())) {
          console.warn('[auth] magic link requested for non-admin email — ignored')
          return
        }
        await sendMagicLinkEmail(email, url)
      },
    }),
  ],
})
