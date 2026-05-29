import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { makeTitle, makePreview } from '@/lib/utils'
import { CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS, FIELD_LIMITS } from '@/lib/config'
import type { SubmitPayload } from '@/lib/types'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkProfanity } from '@/lib/moderation'
import nodemailer from 'nodemailer'

// ─── POST /api/submit ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Rate limit ─────────────────────────────────────────────────────────────
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const ip        = forwarded.split(',')[0].trim() || 'unknown'
  const rateCheck = await checkRateLimit(ip)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Too many submissions. Try again in ${rateCheck.resetIn} seconds.` },
      { status: 429 }
    )
  }

  let body: SubmitPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Honeypot — bots fill it; real users never see it ───────────────────────
  if (body.hp) {
    return NextResponse.json({ ok: true, id: 'filtered' })
  }

  // ── reCAPTCHA v3 verification (active once RECAPTCHA_SECRET_KEY is set — v2.6) ─
  const rcSecret = process.env.RECAPTCHA_SECRET_KEY
  if (rcSecret) {
    if (!body.recaptchaToken) {
      return NextResponse.json({ error: 'Bot check failed. Please refresh and try again.' }, { status: 400 })
    }
    const rcRes  = await fetch('https://www.googleapis.com/recaptcha/api/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `secret=${rcSecret}&response=${encodeURIComponent(body.recaptchaToken)}`,
    })
    const rcData = await rcRes.json() as { success: boolean; score?: number }
    if (!rcData.success || (rcData.score !== undefined && rcData.score < 0.5)) {
      return NextResponse.json({ error: 'Bot check failed. Please refresh and try again.' }, { status: 400 })
    }
  }

  // Validate required fields
  const { category, type, suggestion, why, source } = body
  if (!category || !type || !suggestion || !why || !source) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate allowed values
  if (!CATEGORY_OPTIONS.includes(category as never)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (!TYPE_OPTIONS.includes(type as never)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!SOURCE_OPTIONS.includes(source as never)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const username = (body.username || '').trim()
  const extra    = (body.extra    || '').trim()

  // ── Field length limits ────────────────────────────────────────────────────
  const trimSuggestion = suggestion.trim()
  const trimWhy        = why.trim()
  if (trimSuggestion.length < FIELD_LIMITS.suggestion.min)
    return NextResponse.json({ error: `Suggestion must be at least ${FIELD_LIMITS.suggestion.min} characters.` }, { status: 400 })
  if (trimSuggestion.length > FIELD_LIMITS.suggestion.max)
    return NextResponse.json({ error: `Suggestion must be ${FIELD_LIMITS.suggestion.max} characters or fewer.` }, { status: 400 })
  if (trimWhy.length < FIELD_LIMITS.why.min)
    return NextResponse.json({ error: `"Why it helps" must be at least ${FIELD_LIMITS.why.min} characters.` }, { status: 400 })
  if (trimWhy.length > FIELD_LIMITS.why.max)
    return NextResponse.json({ error: `"Why it helps" must be ${FIELD_LIMITS.why.max} characters or fewer.` }, { status: 400 })
  if (extra.length > FIELD_LIMITS.extra.max)
    return NextResponse.json({ error: `Extra context must be ${FIELD_LIMITS.extra.max} characters or fewer.` }, { status: 400 })
  if (username.length > FIELD_LIMITS.username.max)
    return NextResponse.json({ error: `Username must be ${FIELD_LIMITS.username.max} characters or fewer.` }, { status: 400 })

  // Moderation check
  const flagged         = checkProfanity(`${suggestion} ${body.why} ${extra}`)
  const moderationState = flagged.length > 0 ? 'flagged' : 'clean'

  try {
    // Write to Firestore
    const docRef = await getAdminDb().collection('suggestions').add({
      timestamp:        FieldValue.serverTimestamp(),
      category:         category.trim(),
      type:             type.trim(),
      suggestion:       suggestion.trim(),
      why:              why.trim(),
      username,
      extra,
      source:           source.trim(),
      status:           'New',
      internalNotes:    '',
      preview:          makePreview(suggestion),
      title:            makeTitle(suggestion),
      moderationState,
      moderationFlags:  flagged,
    })

    // Send notifications (non-blocking — failures don't fail the request)
    sendEmailNotification(req, body, docRef.id).catch(err => {
      console.error('[email] Notification failed (submission still saved):', err)
    })
    if (flagged.length > 0) {
      sendFlaggedNotification(req, body, docRef.id, flagged).catch(err => {
        console.error('[email] Flagged notification failed:', err)
      })
    }
    notifyDiscord(req, body, docRef.id, flagged.length > 0).catch(err => {
      console.error('[discord] Webhook failed (submission still saved):', err)
    })

    return NextResponse.json({ ok: true, id: docRef.id })
  } catch (err) {
    console.error('[submit] Firestore write failed:', err)
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 })
  }
}

// ─── Deep-link URL builder ────────────────────────────────────────────────────
// Priority:
//   1. SITE_URL env var — set this in production to guarantee correct links
//      (e.g. https://suggestion-box.example.com). Avoids header-spoofing risk
//      and works correctly behind App Hosting / Cloud Run reverse proxies where
//      X-Forwarded-Host may carry an internal hostname.
//   2. X-Forwarded-Host — set by most reverse proxies; preferred over Host when
//      SITE_URL is absent.
//   3. Host — fallback for local dev (localhost:3000 / :3001).
//
// NOTE: Discord deep-link URLs in local dev will point to localhost and only
// work if you have the dev server running. In production set SITE_URL.

function adminLink(req: NextRequest, docId: string): string {
  const safeId = encodeURIComponent(docId)

  // Env-var override — always wins, no spoofing risk
  const siteUrl = process.env.SITE_URL
  if (siteUrl) {
    return `${siteUrl.replace(/\/$/, '')}/admin?view=browse&id=${safeId}`
  }

  // Proxy header (Cloud Run, Vercel, nginx) — prefer over Host
  const forwarded = req.headers.get('x-forwarded-host')
  const host      = (forwarded ? forwarded.split(',')[0].trim() : null)
                    || req.headers.get('host')
                    || 'localhost:3000'
  const proto     = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}/admin?view=browse&id=${safeId}`
}

// ─── Discord webhook notification ────────────────────────────────────────────

async function notifyDiscord(req: NextRequest, data: SubmitPayload, docId: string, isFlagged: boolean) {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return

  const reviewUrl = adminLink(req, docId)

  const body = {
    embeds: [{
      title:       `${data.category} — ${data.type}`,
      url:         reviewUrl,   // makes the embed title a clickable link → opens that submission
      description: data.suggestion.slice(0, 400),
      color:       isFlagged ? 0xf87171 : 0x4ade80,
      fields: [
        { name: 'Why',    value: data.why.slice(0, 300) },
        { name: 'Source', value: data.source,               inline: true },
        { name: 'From',   value: data.username || '(anon)',  inline: true },
        { name: 'Review', value: `[Open submission](${reviewUrl})` },
      ],
      footer:    { text: isFlagged ? '⚠ flagged' : 'Nasty N8 Dashboard' },
      timestamp: new Date().toISOString(),
    }],
  }

  await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

// ─── Flagged-content email ────────────────────────────────────────────────────

async function sendFlaggedNotification(req: NextRequest, data: SubmitPayload, docId: string, flags: string[]) {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM
  const to   = process.env.NOTIFY_EMAIL_TO
  if (!pass || !from || !to) return

  const transport  = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })
  const reviewUrl  = adminLink(req, docId)
  const subject    = `[FLAGGED] New Suggestion: ${data.category} from ${data.source}`
  const text = [
    '⚠ This submission was flagged by the moderation filter.',
    '',
    `Matched terms: ${flags.join(', ')}`,
    '',
    `CATEGORY:\n${data.category}`,
    `TYPE:\n${data.type}`,
    `SUGGESTION:\n${data.suggestion}`,
    `WHY IT WOULD HELP:\n${data.why}`,
    `SOURCE:\n${data.source}`,
    `FROM:\n${data.username || '(not provided)'}`,
    '',
    `Review this submission:\n${reviewUrl}`,
    `Submission ID: ${docId}`,
    '— Sent from the Nasty N8 Suggestion Box',
  ].join('\n\n')

  await transport.sendMail({ from, to, subject, text })
}

// ─── Email notification ───────────────────────────────────────────────────────

async function sendEmailNotification(req: NextRequest, data: SubmitPayload, docId: string) {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM
  const to   = process.env.NOTIFY_EMAIL_TO

  if (!pass || !from || !to) return

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })
  const reviewUrl = adminLink(req, docId)
  const subject   = `New Suggestion: ${data.category} from ${data.source}`

  const text = [
    'A new Nasty N8 suggestion came in.',
    '',
    `CATEGORY:\n${data.category}`,
    `TYPE:\n${data.type}`,
    `SUGGESTION:\n${data.suggestion}`,
    `WHY IT WOULD HELP:\n${data.why}`,
    `DISCORD USERNAME:\n${data.username || '(not provided)'}`,
    `ANYTHING ELSE:\n${data.extra || '—'}`,
    `SOURCE:\n${data.source}`,
    '',
    `Review this submission:\n${reviewUrl}`,
    `Submission ID: ${docId}`,
    '— Sent from the Nasty N8 Suggestion Box',
  ].join('\n\n')

  await transport.sendMail({ from, to, subject, text })
}
