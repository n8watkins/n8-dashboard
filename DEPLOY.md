# Deploy — Nasty N8 Dashboard

Deployment runbook for the post-Firebase stack. The Dashboard's first section is
the **Suggestion Box** — a public suggestion form plus a 2-admin review dashboard
(Next.js 16, App Router, TypeScript). Coaching is planned as a later section.

## 1. Overview

The app was migrated **off Google Cloud / Firebase** onto a free, host-portable
stack. It runs at **$0** under hobby traffic and is fully off Google Cloud.

| Concern              | Service                                                        |
| -------------------- | ------------------------------------------------------------- |
| Host                 | **Vercel** (Hobby tier — runs Next.js 16 natively)            |
| Database             | **Turso / libSQL** via Drizzle ORM (free tier, no auto-pause) |
| Admin auth           | **Better Auth** magic-link (email OTP) → `ADMIN_EMAILS` allowlist, 90-day rolling session |
| Bot protection       | **Cloudflare Turnstile** (free; host-independent)             |
| Notifications        | **Discord webhook** + optional **Gmail SMTP** (nodemailer)    |
| Magic-link delivery  | Same **Gmail SMTP** that sends notifications                  |
| Weekly recap cron    | **Vercel Cron** → `GET /api/weekly-recap`                     |

Firebase is fully removed: Firestore, Firebase Auth, `firebase-admin`, and
reCAPTCHA Enterprise are gone, along with every `NEXT_PUBLIC_FIREBASE_*` and
`FIREBASE_ADMIN_*` env var.

### Status

**Live since 2026-06-20 at https://nasty-n8-dashboard.vercel.app.** All steps below are complete:

| Step                              | Status |
| --------------------------------- | ------ |
| Turso prod database created       | ✅     |
| Schema pushed (drizzle-kit)       | ✅     |
| Data imported from backup         | ✅     |
| Turnstile keys                    | ✅     |
| `BETTER_AUTH_SECRET` generated    | ✅     |
| Vercel project + env vars         | ✅     |
| Live URLs + `CRON_SECRET` set     | ✅     |
| Smoke test passed                 | ✅     |
| Firebase project deleted          | ✅     |

---

## Step 1 — Create the Turso database

```bash
# Install the Turso CLI (or use the official installer at turso.tech)
npm i -g turso
turso auth signup

# Create the prod database
turso db create nasty-n8

# Grab the two values you need
turso db show nasty-n8 --url        # → TURSO_DATABASE_URL  (libsql://nasty-n8-<org>.turso.io)
turso db tokens create nasty-n8     # → TURSO_AUTH_TOKEN
```

Keep both values — they become `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

---

## Step 2 — Push the schema to Turso

Point Drizzle at the **prod** database and push the schema (`lib/schema.ts`)
straight to Turso. `drizzle.config.ts` reads `TURSO_DATABASE_URL` /
`TURSO_AUTH_TOKEN` from the environment.

```bash
TURSO_DATABASE_URL='libsql://nasty-n8-<org>.turso.io' \
TURSO_AUTH_TOKEN='<token from step 1>' \
npx drizzle-kit push
```

This creates the `suggestions`, `activity_log`, and Better Auth tables
(`user`, `session`, `account`, `verification`) in Turso.

---

## Step 3 — Import existing data

The Firestore data was exported locally by `scripts/export-firestore.ts`, which
produced a `firestore-backup-*.json` file (current backup in the repo:
`firestore-backup-2026-06-20T20-15-31-414Z.json`).

Import that backup into Turso, preserving the original document IDs:

```bash
TURSO_DATABASE_URL='libsql://nasty-n8-<org>.turso.io' \
TURSO_AUTH_TOKEN='<token>' \
npx tsx scripts/import-to-turso.ts firestore-backup-2026-06-20T20-15-31-414Z.json
```

> **Note:** the import is idempotent (`onConflictDoNothing` on the doc ID), so
> it's safe to re-run.

---

## Step 4 — Cloudflare Turnstile

Turnstile is host-independent — you do **not** need to host the app on
Cloudflare; you only need a free Cloudflare account for the keys.

1. Create a free Cloudflare account.
2. Open **Turnstile** in the dashboard.
3. Add a widget for your production domain, and add **`localhost`** so dev works too.
4. Copy the **Site Key** (public) and **Secret Key** (private):
   - Site Key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - Secret Key → `TURNSTILE_SECRET_KEY`

For local dev you can use Cloudflare's always-pass test keys instead:

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

> Verification is gated on `TURNSTILE_SECRET_KEY` — leave it blank to disable the
> check entirely (not recommended for prod).

---

## Step 5 — Generate `BETTER_AUTH_SECRET`

```bash
openssl rand -hex 32
```

Use the output as `BETTER_AUTH_SECRET`.

---

## Step 6 — Deploy to Vercel

1. In Vercel, **Add New → Project** and connect the GitHub repo
   **`n8watkins/nasty-n8-dashboard`**.
2. Framework is auto-detected as **Next.js** — leave the build settings default.
3. Set **all** environment variables from the checklist below.
4. Click **Deploy**.

### Environment variable checklist

`NEXT_PUBLIC_*` vars are inlined at build time, so they must be present at
**Build** (they then remain available at runtime too). Everything else is read
at **Runtime**.

| Variable                         | Phase           | Required | Notes                                                                 |
| -------------------------------- | --------------- | -------- | --------------------------------------------------------------------- |
| `TURSO_DATABASE_URL`             | Runtime         | Yes      | `libsql://...turso.io` in prod                                        |
| `TURSO_AUTH_TOKEN`               | Runtime         | Yes      | Token from Step 1                                                     |
| `BETTER_AUTH_SECRET`             | Runtime         | Yes      | `openssl rand -hex 32`                                                |
| `BETTER_AUTH_URL`                | Runtime         | Yes      | Live https URL (set in Step 7)                                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Build + Runtime | Yes      | Public Turnstile site key                                            |
| `TURNSTILE_SECRET_KEY`           | Runtime         | Yes      | Turnstile secret; blank disables the bot check                       |
| `SITE_URL`                       | Runtime         | Yes      | Live https URL; used by `/api/submit` for Discord/email deep-links   |
| `RECAP_SECRET`                   | Runtime         | Yes      | Bearer token validated by `/api/weekly-recap`                        |
| `CRON_SECRET`                    | Runtime         | Yes      | **Set equal to `RECAP_SECRET`** (see Step 7)                         |
| `NOTIFY_EMAIL_TO`                | Runtime         | Opt\*    | Recap recipient                                                      |
| `NOTIFY_EMAIL_FROM`              | Runtime         | Opt\*    | Gmail sender                                                         |
| `NOTIFY_EMAIL_PASS`              | Runtime         | Opt\*    | Gmail app password — **required for magic-link emails to send**      |
| `DISCORD_WEBHOOK_URL`            | Runtime         | Optional | Discord embed on each submission + recap                            |

\* The Gmail trio is optional for notifications, but `NOTIFY_EMAIL_FROM` +
`NOTIFY_EMAIL_PASS` are **required** if you want magic-link sign-in emails to
actually send rather than only print to the server logs.

---

## Step 7 — Set live URLs and the cron secret

Once the first deploy gives you the live Vercel URL (e.g.
`https://nasty-n8-dashboard.vercel.app`):

1. Set `BETTER_AUTH_URL` to that URL.
2. Set `SITE_URL` to that URL.
3. Set `CRON_SECRET` to the **same value** as `RECAP_SECRET`.
4. **Redeploy** so the new values take effect.

### Why `CRON_SECRET` must equal `RECAP_SECRET`

`vercel.json` schedules a weekly cron hitting `GET /api/weekly-recap`:

```json
{ "crons": [{ "path": "/api/weekly-recap", "schedule": "0 16 * * 1" }] }
```

That runs **Monday 16:00 UTC**. (Turso does **not** auto-pause, so no keep-alive
cron is needed.)

When a `CRON_SECRET` env var is set, Vercel Cron calls the route with header
`Authorization: Bearer $CRON_SECRET`. The route only accepts
`Bearer $RECAP_SECRET`, so if the two differ the cron is rejected with **401**.
**Set `CRON_SECRET` to the same string as `RECAP_SECRET`** (set both env vars to
the same value).

---

## Step 8 — Smoke test

Run through this on the live URL after Step 7:

- [ ] **Public form** loads and a submission succeeds (Turnstile widget passes).
- [ ] **Admin magic-link** sign-in works for **both** admins in `ADMIN_EMAILS`
      (the link arrives by email).
- [ ] A **non-admin email** requesting a link gets **no email** (silently ignored).
- [ ] **Review queue / browse / save-review / activity log** all work.
- [ ] **Weekly recap** works two ways:
      - the admin-UI "send recap" button, and
      - the cron Bearer path:
        ```bash
        curl -H "Authorization: Bearer $RECAP_SECRET" \
          "https://<app>.vercel.app/api/weekly-recap?dry=true"
        ```
        (`dry=true` builds stats without sending; drop it to send for real.)
- [ ] **Discord notification** fires on a new submission (if `DISCORD_WEBHOOK_URL` is set).

---

## Step 9 — Reclaim the Google Cloud slot

**After** prod is verified working, delete the old Firebase project to free the
GCP project quota slot.

1. Open the **Firebase / GCP console**.
2. Delete the Firebase project **`nasty-n8-dashboard`**.

Migrating off Firebase does **not** auto-delete the project — deleting it is what
actually frees the quota slot. The data was already backed up locally (Step 3),
so nothing is lost.

---

## Future deploys

Every push to **`master`** auto-redeploys on Vercel. No manual step needed.

---

## Notes

- **Vercel Hobby** is for non-commercial use only.
- **Turso free tier**: 5 GB storage, 500M row reads/month, and **no auto-pause**.
- **Magic-link emails** require `NOTIFY_EMAIL_PASS` (Gmail app password) plus
  `NOTIFY_EMAIL_FROM`; without them the magic link is only **printed to the
  server logs** and never delivered.
