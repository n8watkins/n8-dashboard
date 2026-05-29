import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { ADMIN_EMAILS, SOURCE_OPTIONS } from '@/lib/config'
import nodemailer from 'nodemailer'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RecapStats {
  weekStart:  string
  weekEnd:    string
  submissions: {
    total:      number
    bySource:   Record<string, number>
    byCategory: Array<[string, number]>   // sorted desc, up to 6
    flagged:    number
  }
  pipeline: {
    queueSize:   number  // current 'New' count
    activeSize:  number  // current 'Active' count
    doneAllTime: number  // total ever 'Done'
  }
  actionsThisWeek: {
    movedToDone:   Array<{ id: string; preview: string }>
    movedToActive: Array<{ id: string; preview: string }>
    total:         number  // unique items that had at least one status decision
  }
}

export type ChannelResult = 'sent' | 'skipped' | 'error'

// Action strings that mean a status decision was made — must match strings
// written by saveReview() in lib/firestore.ts.
// FIX #9: centralised so a future action name can't silently slip through.
const DECISION_ACTIONS = ['Decision saved', 'Status edited'] as const

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization') || ''

  // Cron / CLI path: Bearer token
  const secret = process.env.RECAP_SECRET
  // FIX #8: warn when secret is absent so a cron operator knows why they're
  // getting 401s instead of silently failing.
  if (!secret) {
    console.warn('[weekly-recap] RECAP_SECRET is not set — Bearer token auth disabled; only Firebase admin tokens will work.')
  }
  if (secret && authHeader === `Bearer ${secret}`) return true

  // Admin UI path: Firebase ID token in X-Firebase-Token header
  const idToken = req.headers.get('x-firebase-token') || ''
  if (idToken) {
    try {
      const decoded = await getAuth().verifyIdToken(idToken)
      return ADMIN_EMAILS.includes(decoded.email || '')
    } catch {
      return false
    }
  }

  return false
}

// ─── Stats builder ─────────────────────────────────────────────────────────────

async function buildRecapStats(): Promise<RecapStats> {
  const now       = new Date()
  const weekAgo   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoTs = Timestamp.fromDate(weekAgo)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // FIX #3: query only this week's documents instead of a full collection scan.
  // Single-field timestamp index is auto-created by Firestore.
  type SugData = Record<string, unknown>
  const weekSnap = await getAdminDb()
    .collection('suggestions')
    .where('timestamp', '>=', weekAgoTs)
    .get()
  const thisWeek: (SugData & { id: string })[] = weekSnap.docs.map(d =>
    ({ id: d.id, ...(d.data() as SugData) })
  )

  // By source (keep all 5, zero-fill missing)
  const bySource: Record<string, number> = Object.fromEntries(SOURCE_OPTIONS.map(s => [s, 0]))
  for (const s of thisWeek) {
    const src = String(s.source || '')
    if (src in bySource) bySource[src]++
  }

  // By category (sorted desc, top 6)
  const catMap: Record<string, number> = {}
  for (const s of thisWeek) {
    const cat = String(s.category || '')
    if (cat) catMap[cat] = (catMap[cat] || 0) + 1
  }
  const byCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const flagged = thisWeek.filter(s => s.moderationState === 'flagged').length

  // FIX #3 cont.: use count() aggregation for pipeline numbers — reads no documents.
  const [newCount, activeCount, doneCount] = await Promise.all([
    getAdminDb().collection('suggestions').where('status', '==', 'New').count().get(),
    getAdminDb().collection('suggestions').where('status', '==', 'Active').count().get(),
    getAdminDb().collection('suggestions').where('status', '==', 'Done').count().get(),
  ])
  const queueSize   = newCount.data().count
  const activeSize  = activeCount.data().count
  const doneAllTime = doneCount.data().count

  // ── Activity log — this week ──────────────────────────────────────────────────
  type LogData = Record<string, unknown>
  const logSnap = await getAdminDb()
    .collection('activity_log')
    .where('timestamp', '>=', weekAgoTs)
    .get()
  const logEntries = logSnap.docs.map(d => d.data() as LogData)

  const decisions = logEntries.filter(e =>
    DECISION_ACTIONS.includes(e.action as typeof DECISION_ACTIONS[number])
  )

  // FIX #4: deduplicate by last decision per suggestion.
  // Sort ascending by timestamp so the final (latest) entry wins per item.
  const sorted = [...decisions].sort((a, b) => {
    const ta = (a.timestamp as Timestamp)?.toMillis?.() ?? 0
    const tb = (b.timestamp as Timestamp)?.toMillis?.() ?? 0
    return ta - tb
  })

  const lastDecision = new Map<string, LogData>()
  for (const e of sorted) {
    lastDecision.set(String(e.suggestionId), e)
  }

  const movedToDone = Array.from(lastDecision.values())
    .filter(e => String(e.newStatus) === 'Done')
    .map(e => ({ id: String(e.suggestionId), preview: String(e.preview || '') }))
    .slice(0, 10)

  const movedToActive = Array.from(lastDecision.values())
    .filter(e => String(e.newStatus) === 'Active')
    .map(e => ({ id: String(e.suggestionId), preview: String(e.preview || '') }))
    .slice(0, 10)

  // unique items that received at least one status decision this week
  const total = lastDecision.size

  return {
    weekStart:   fmt(weekAgo),
    weekEnd:     fmt(now),
    submissions: { total: thisWeek.length, bySource, byCategory, flagged },
    pipeline:    { queueSize, activeSize, doneAllTime },
    actionsThisWeek: { movedToDone, movedToActive, total },
  }
}

// ─── Email builder ─────────────────────────────────────────────────────────────

function buildEmailHtml(s: RecapStats): string {
  const total = s.submissions.total

  const sourceRows = Object.entries(s.submissions.bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => {
      const pct = total > 0 ? Math.round((n / total) * 100) : 0
      // src keys always come from SOURCE_OPTIONS so are safe, but escHtml
      // here anyway for defense-in-depth.
      return `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#ccc;border-bottom:1px solid #1e1e1e">${escHtml(src)}</td>
          <td style="padding:6px 0;font-size:13px;color:#fff;text-align:right;border-bottom:1px solid #1e1e1e;font-variant-numeric:tabular-nums">
            ${n} <span style="color:#555;font-size:11px">${pct}%</span>
          </td>
        </tr>`
    }).join('')

  // FIX #1: escape cat — comes from raw Firestore data, not a closed enum.
  const catRows = s.submissions.byCategory.map(([cat, n]) => `
    <tr>
      <td style="padding:5px 0;font-size:13px;color:#ccc;border-bottom:1px solid #1e1e1e">${escHtml(cat)}</td>
      <td style="padding:5px 0;font-size:13px;color:#fff;text-align:right;border-bottom:1px solid #1e1e1e">${n}</td>
    </tr>`).join('')

  const doneItems = s.actionsThisWeek.movedToDone.length > 0
    ? s.actionsThisWeek.movedToDone.map((item, i) =>
        `<li style="padding:6px 0;border-bottom:1px solid #1e1e1e;font-size:13px;color:#d4d4d4">
          <span style="color:#4ade80">${i + 1}.</span> ${escHtml(item.preview)}
        </li>`
      ).join('')
    : '<li style="padding:6px 0;font-size:13px;color:#555">None this week</li>'

  const activeItems = s.actionsThisWeek.movedToActive.length > 0
    ? s.actionsThisWeek.movedToActive.map((item, i) =>
        `<li style="padding:6px 0;border-bottom:1px solid #1e1e1e;font-size:13px;color:#d4d4d4">
          <span style="color:#60a5fa">${i + 1}.</span> ${escHtml(item.preview)}
        </li>`
      ).join('')
    : '<li style="padding:6px 0;font-size:13px;color:#555">None this week</li>'

  const flaggedNote = s.submissions.flagged > 0
    ? `<div style="margin:16px 0;padding:10px 14px;background:#1c1410;border:1px solid #5c3d1e;border-radius:8px;font-size:13px;color:#f97316">
        ⚠ ${s.submissions.flagged} submission${s.submissions.flagged > 1 ? 's' : ''} flagged for review
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly Recap — Nasty N8 Suggestion Box</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;color:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">

  <div style="margin-bottom:28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#4ade80;letter-spacing:-.01em">Weekly Recap</h1>
    <p style="margin:0;font-size:13px;color:#555">Nasty N8 Suggestion Box · ${escHtml(s.weekStart)} – ${escHtml(s.weekEnd)}</p>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">New submissions this week</div>
    <div style="font-size:42px;font-weight:700;color:#fff;line-height:1;margin-bottom:16px">${total}</div>
    <table style="width:100%;border-collapse:collapse">${sourceRows}</table>
  </div>

  ${flaggedNote}

  ${s.submissions.byCategory.length > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">Top categories</div>
    <table style="width:100%;border-collapse:collapse">${catRows}</table>
  </div>` : ''}

  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:12px">Pipeline snapshot</div>
    <div style="display:flex;gap:12px">
      <div style="flex:1;background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px">
        <div style="font-size:11px;color:#555;margin-bottom:4px">In queue</div>
        <div style="font-size:28px;font-weight:700;color:#fbbf24">${s.pipeline.queueSize}</div>
      </div>
      <div style="flex:1;background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px">
        <div style="font-size:11px;color:#555;margin-bottom:4px">In progress</div>
        <div style="font-size:28px;font-weight:700;color:#60a5fa">${s.pipeline.activeSize}</div>
      </div>
      <div style="flex:1;background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px">
        <div style="font-size:11px;color:#555;margin-bottom:4px">Done all-time</div>
        <div style="font-size:28px;font-weight:700;color:#4ade80">${s.pipeline.doneAllTime}</div>
      </div>
    </div>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">
      ✓ Moved to done this week (${s.actionsThisWeek.movedToDone.length})
    </div>
    <ul style="list-style:none;padding:0;margin:0">${doneItems}</ul>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">
      → Picked up this week (${s.actionsThisWeek.movedToActive.length})
    </div>
    <ul style="list-style:none;padding:0;margin:0">${activeItems}</ul>
  </div>

  <div style="margin-top:36px;padding-top:16px;border-top:1px solid #1e1e1e;font-size:11px;color:#444;text-align:center">
    ${s.actionsThisWeek.total} item${s.actionsThisWeek.total !== 1 ? 's' : ''} reviewed this week
    &nbsp;·&nbsp; Nasty N8 Suggestion Box
  </div>

</div>
</body>
</html>`
}

function buildEmailText(s: RecapStats): string {
  const total = s.submissions.total
  const lines: string[] = [
    `WEEKLY RECAP — ${s.weekStart} – ${s.weekEnd}`,
    `Nasty N8 Suggestion Box`,
    '',
    `═══════════════════════════════════`,
    `NEW SUBMISSIONS THIS WEEK: ${total}`,
    `═══════════════════════════════════`,
  ]

  const sorted = Object.entries(s.submissions.bySource).sort((a, b) => b[1] - a[1])
  for (const [src, n] of sorted) {
    const pct = total > 0 ? Math.round((n / total) * 100) : 0
    lines.push(`  ${src}: ${n} (${pct}%)`)
  }

  if (s.submissions.flagged > 0) {
    lines.push('', `⚠ FLAGGED: ${s.submissions.flagged} (held for admin review)`)
  }

  if (s.submissions.byCategory.length > 0) {
    lines.push('', 'TOP CATEGORIES:')
    for (const [cat, n] of s.submissions.byCategory) {
      lines.push(`  ${cat}: ${n}`)
    }
  }

  lines.push(
    '',
    'PIPELINE SNAPSHOT:',
    `  In queue (New):  ${s.pipeline.queueSize}`,
    `  In progress:     ${s.pipeline.activeSize}`,
    `  Done all-time:   ${s.pipeline.doneAllTime}`,
  )

  if (s.actionsThisWeek.movedToDone.length > 0) {
    lines.push('', `MOVED TO DONE THIS WEEK (${s.actionsThisWeek.movedToDone.length}):`)
    s.actionsThisWeek.movedToDone.forEach((item, i) => {
      lines.push(`  ${i + 1}. ${item.preview}`)
    })
  } else {
    lines.push('', 'MOVED TO DONE THIS WEEK: none')
  }

  if (s.actionsThisWeek.movedToActive.length > 0) {
    lines.push('', `PICKED UP THIS WEEK (${s.actionsThisWeek.movedToActive.length}):`)
    s.actionsThisWeek.movedToActive.forEach((item, i) => {
      lines.push(`  ${i + 1}. ${item.preview}`)
    })
  }

  lines.push(
    '',
    `${s.actionsThisWeek.total} item${s.actionsThisWeek.total !== 1 ? 's' : ''} reviewed this week.`,
    '— Sent from the Nasty N8 Suggestion Box',
  )

  return lines.join('\n')
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Senders ───────────────────────────────────────────────────────────────────
// FIX #2: return 'sent' | 'skipped' so the caller can report accurate channel status.

async function sendEmail(stats: RecapStats): Promise<ChannelResult> {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM
  const to   = process.env.NOTIFY_EMAIL_TO
  if (!pass || !from || !to) return 'skipped'

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })

  await transport.sendMail({
    from,
    to,
    subject: `Weekly Recap: ${stats.submissions.total} new suggestion${stats.submissions.total !== 1 ? 's' : ''} (${stats.weekStart} – ${stats.weekEnd})`,
    text:    buildEmailText(stats),
    html:    buildEmailHtml(stats),
  })
  return 'sent'
}

async function sendDiscord(stats: RecapStats): Promise<ChannelResult> {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return 'skipped'

  const total = stats.submissions.total

  const sourceLines = Object.entries(stats.submissions.bySource)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n > 0)
    .map(([src, n]) => {
      const pct = total > 0 ? Math.round((n / total) * 100) : 0
      return `**${src}**: ${n} (${pct}%)`
    })
    .join('\n') || '_none_'

  // FIX #6: cap each preview at 200 chars, then hard-cap the whole field at 900.
  const PREVIEW_CAP  = 200
  const FIELD_CAP    = 900
  let doneLines = stats.actionsThisWeek.movedToDone.length > 0
    ? stats.actionsThisWeek.movedToDone
        .slice(0, 5)
        .map(item => `• ${item.preview.slice(0, PREVIEW_CAP)}`)
        .join('\n')
    : '_none_'
  if (doneLines.length > FIELD_CAP) doneLines = doneLines.slice(0, FIELD_CAP) + '…'

  const fields = [
    {
      name:   `📥 New Submissions — ${total}`,
      value:  sourceLines,
      inline: false,
    },
    {
      name:   '📊 Pipeline',
      value:  [
        `Queue (New): **${stats.pipeline.queueSize}**`,
        `In progress: **${stats.pipeline.activeSize}**`,
        `Done all-time: **${stats.pipeline.doneAllTime}**`,
      ].join('\n'),
      inline: true,
    },
    {
      name:   '✅ Moved to Done',
      value:  doneLines,
      inline: false,
    },
  ]

  if (stats.submissions.flagged > 0) {
    fields.push({
      name:   '⚠ Flagged',
      value:  `${stats.submissions.flagged} submission${stats.submissions.flagged > 1 ? 's' : ''} held for review`,
      inline: true,
    })
  }

  const body = {
    embeds: [{
      title:       '📋 Weekly Recap — Nasty N8 Suggestion Box',
      description: `${stats.weekStart} – ${stats.weekEnd}`,
      color:       0x4ade80,
      fields,
      footer:      { text: `${stats.actionsThisWeek.total} item${stats.actionsThisWeek.total !== 1 ? 's' : ''} reviewed this week` },
      timestamp:   new Date().toISOString(),
    }],
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`)
  return 'sent'
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = req.nextUrl.searchParams.get('dry') === 'true'

  try {
    const stats = await buildRecapStats()

    if (!dry) {
      const [emailResult, discordResult] = await Promise.allSettled([
        sendEmail(stats),
        sendDiscord(stats),
      ])

      // FIX #2: report per-channel outcome so the client can show accurate status.
      const channels = {
        email:   emailResult.status   === 'fulfilled' ? emailResult.value   : 'error' as ChannelResult,
        discord: discordResult.status === 'fulfilled' ? discordResult.value : 'error' as ChannelResult,
      }

      const warnings: string[] = []
      if (emailResult.status   === 'rejected') warnings.push(`email: ${String(emailResult.reason)}`)
      if (discordResult.status === 'rejected') warnings.push(`discord: ${String(discordResult.reason)}`)

      return NextResponse.json({ ok: true, dry: false, stats, channels, warnings })
    }

    return NextResponse.json({ ok: true, dry: true, stats })
  } catch (err) {
    console.error('[weekly-recap] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Also accept POST (for admin UI button — same logic, same query-string dry param)
export const POST = GET
