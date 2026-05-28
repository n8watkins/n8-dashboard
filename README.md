# Nasty N8 Suggestion Box

Next.js + Firebase rewrite of the Google Forms/Sheets suggestion system.

## What it is

| Route | Who | What |
|-------|-----|------|
| `/` | Anyone | Public suggestion form (6 fields, source pre-fills from URL) |
| `/success` | Anyone | Thank-you page after submit |
| `/admin` | You only | Review Queue, Browse All, Activity Log |

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Firebase Firestore** — replaces Google Sheets
- **Firebase Auth** (Google sign-in) — replaces no auth
- **Nodemailer** — email notification on each submission (optional)

---

## Setup (one-time)

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Create project** → name it `nasty-n8-dashboard` (or whatever)
3. **Build → Firestore Database** → Create database → Start in **production mode** → pick a region
4. **Build → Authentication** → Get started → **Google** provider → Enable it → Save
5. **Project Settings** → **Your apps** → Add app → Web → Register → copy the `firebaseConfig` object

### 2. Get your service account key

1. **Project Settings → Service accounts** → Generate new private key → Download JSON
2. Open the JSON file — you need `project_id`, `client_email`, and `private_key`

### 3. Fill in `.env.local`

```bash
cp .env.local.example .env.local
```

Then fill in every value in `.env.local`.

For `FIREBASE_ADMIN_PRIVATE_KEY`: paste the full key from the JSON (it starts with `-----BEGIN RSA PRIVATE KEY-----`).

### 4. Deploy Firestore rules & indexes

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy --only firestore
```

### 5. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — public form.
Visit `http://localhost:3000/admin` — sign in with your Google account.

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

```bash
npm install -g vercel
vercel
```

Set all your `.env.local` values as **Environment Variables** in the Vercel dashboard.

---

## Adding more admins later

In `firestore.rules` and `lib/config.ts`, add their email to the `ADMIN_EMAILS` array. Redeploy rules.
