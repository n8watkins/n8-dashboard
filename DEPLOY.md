# Deployment — Next Steps

**Project:** Nasty N8 Dashboard  
**Host:** Firebase App Hosting (Next.js SSR + API routes)  
**Repo:** https://github.com/n8watkins/nasty-n8-dashboard  
**Firebase project:** `nasty-n8-dashboard`

---

## Status

| Step | Status |
|------|--------|
| GitHub repo created & pushed | ✅ Done |
| `firebase.json` updated (old static-SPA hosting removed) | ✅ Done |
| `apphosting.yaml` created (env vars + secret refs) | ✅ Done |
| `.firebaserc` created | ✅ Done |
| Firebase project upgraded to Blaze plan | ⬜ **You do this** |
| Secrets created in Secret Manager | ⬜ **Run commands below** |
| App Hosting backend created in Firebase Console | ⬜ **You do this** |
| `SITE_URL` set in `apphosting.yaml` | ⬜ After first deploy |

---

## Step 1 — Upgrade to Blaze plan

Required for App Hosting and Secret Manager. Effectively free at hobby traffic levels.

👉 https://console.firebase.google.com/project/nasty-n8-dashboard/usage/details

---

## Step 2 — Create secrets (run these in WSL terminal)

These pull values from `.env.local` and push them into Cloud Secret Manager.

```bash
cd /home/natkins/projects/bf6-projects/suggestion-box

# 1. Firebase Admin private key
PRIVATE_KEY=$(grep FIREBASE_ADMIN_PRIVATE_KEY .env.local | cut -d'"' -f2)
echo -n "$PRIVATE_KEY" | firebase apphosting:secrets:set firebase-admin-private-key \
  --project nasty-n8-dashboard --data-file=-

# 2. Discord webhook URL
DISCORD=$(grep DISCORD_WEBHOOK_URL .env.local | cut -d'=' -f2-)
echo -n "$DISCORD" | firebase apphosting:secrets:set discord-webhook-url \
  --project nasty-n8-dashboard --data-file=-

# 3. Gmail app password (empty for now — fill in when you set up Gmail)
echo -n "" | firebase apphosting:secrets:set notify-email-pass \
  --project nasty-n8-dashboard --data-file=-

# 4. Weekly recap cron secret
RECAP=$(grep '^RECAP_SECRET=' .env.local | cut -d'=' -f2-)
echo -n "$RECAP" | firebase apphosting:secrets:set recap-secret \
  --project nasty-n8-dashboard --data-file=-
```

When prompted whether to grant the App Hosting service account access: **Yes**.

---

## Step 3 — Create the App Hosting backend (Firebase Console)

1. Go to: https://console.firebase.google.com/project/nasty-n8-dashboard/apphosting
2. Click **Get started**
3. Connect GitHub → pick **n8watkins/nasty-n8-dashboard**
4. Branch: **master**
5. Root directory: `/` (default)
6. Click **Finish and deploy**

Firebase will trigger the first build automatically. Wait ~3–5 minutes.

---

## Step 4 — Grab the live URL and set SITE_URL

After the build finishes you'll get a URL like:
```
https://nasty-n8-dashboard--default.web.app
```

Open `apphosting.yaml` and uncomment + fill in the `SITE_URL` block at the bottom:

```yaml
  - variable: SITE_URL
    value: https://nasty-n8-dashboard--default.web.app
    availability:
      - RUNTIME
```

Then commit and push — App Hosting redeploys automatically:

```bash
git add apphosting.yaml
git commit -m "chore: set SITE_URL for production deep-links"
git push
```

---

## Step 5 — Deploy Firestore rules & indexes

```bash
cd /home/natkins/projects/bf6-projects/suggestion-box
firebase deploy --only firestore --project nasty-n8-dashboard
```

---

## Step 6 — Smoke test

- [ ] Visit the live URL → public submission form loads
- [ ] Submit a suggestion → check Discord for the notification embed
- [ ] Click the Discord embed link → opens admin panel, auto-selects that submission
- [ ] Log in to admin → Weekly Recap panel visible, Preview works
- [ ] Firestore rules: unauthenticated reads on `/suggestions` are blocked

---

## Future deploys

Every `git push` to `master` triggers an automatic rebuild. No manual steps needed.

To update a secret:
```bash
echo -n "new-value" | firebase apphosting:secrets:set <secret-name> \
  --project nasty-n8-dashboard --data-file=-
```

---

## Notes

- **`SITE_URL`** must be set or Discord/email deep-links will fall back to the
  `X-Forwarded-Host` header, which may be an internal Cloud Run hostname.
- **Gmail app password** (`notify-email-pass`): generate at
  https://myaccount.google.com/apppasswords — requires 2FA on the Gmail account.
- **reCAPTCHA** (optional, v2.6): add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and
  `RECAPTCHA_SECRET_KEY` to `apphosting.yaml` / Secret Manager when ready.
- **Weekly recap cron** (v2.7): wire a Cloud Scheduler job to POST
  `/api/weekly-recap` with `Authorization: Bearer <RECAP_SECRET>` weekly.
