# Nasty N8 Dashboard

Next.js community dashboard for Nasty N8. The first (and currently
main) section is the **Suggestion Box** — a rewrite of the Google Forms/Sheets
suggestion system. Coaching is planned as a second section (see the v4 direction
in `design-mockups/plan.html`).

## What it is

| Route | Who | What |
|-------|-----|------|
| `/` | Anyone | Public suggestion form (option chips, source pre-fills from URL) |
| `/success` | Anyone | Thank-you page after submit |
| `/admin` | You only | Review Queue, Browse All, Activity Log |

## Stack

- **Next.js 16** (App Router, TypeScript, React 19)
- **Turso / libSQL** (Drizzle ORM) — database
- **Better Auth** — magic-link admin login (passwordless, no Google)
- **Cloudflare Turnstile** — bot protection (host-independent)
- **Nodemailer** — magic-link + submission emails (Gmail SMTP, optional)
- **Hosting:** Vercel. No Firebase / Google Cloud anywhere.

---

## Local setup

Local dev needs **no accounts** — the database is a local libSQL file and the
bot check uses Cloudflare's always-pass test keys (already in `.env.local.example`).

```bash
cp .env.local.example .env.local   # defaults work for local dev as-is
npm install
npx drizzle-kit push               # create the tables in local.db
npm run dev
```

- Public form: `http://localhost:3000`
- Admin: `http://localhost:3000/admin` → enter an admin email. The magic-link
  **prints to the dev-server console** locally (no SMTP needed).

Admin emails are the `ADMIN_EMAILS` array in `lib/config.ts`. To load data from a
Firebase backup JSON: `npx tsx scripts/import-to-turso.ts <backup.json>`.

For production (Turso + Vercel + Turnstile keys), see **[DEPLOY.md](./DEPLOY.md)**.

---

## Source pre-fill links

Add `?source=Discord` (or any source value) to the form URL to pre-fill the source field:

| Link | Use for |
|------|---------|
| `/?source=Stream+chat` | Twitch/YouTube chat command |
| `/?source=Discord` | Discord server |
| `/?source=Twitch+profile+%2F+About+page` | Twitch panel |
| `/?source=YouTube+stream+page+%2F+description` | YouTube stream description |
| `/?source=YouTube+video+description` | YouTube video description |

---

## Email notifications (optional)

To get an email every time someone submits:

1. Create a [Gmail App Password](https://myaccount.google.com/apppasswords) (requires 2FA)
2. Set in `.env.local`:
   ```
   NOTIFY_EMAIL_FROM=nastyn8plays@gmail.com
   NOTIFY_EMAIL_PASS=<your-app-password>
   NOTIFY_EMAIL_TO=nastyn8plays@gmail.com
   ```

If these are blank, notifications are silently skipped.

---

## Deployment (Vercel — free)

See **[DEPLOY.md](./DEPLOY.md)** for the full runbook: create the Turso database,
push the schema, import data, get Turnstile keys, set the Vercel env vars, and
wire the weekly-recap cron.

---

## Adding more admins later

Add their email to the `ADMIN_EMAILS` array in `lib/config.ts` and redeploy.
