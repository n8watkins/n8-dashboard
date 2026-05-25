import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { ADMIN_EMAILS, SOURCE_OPTIONS } from '@/lib/config'
import nodemailer from 'nodemailer'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RecapStats {
  weekStart:  string   // display string e.g. "May 19, 2026"
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
    total:         number
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization') || ''

  // Cron / CLI path: Bearer token
  const secret = process.env.RECAP_SECRET
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
  const now     = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // ── All suggestions ──────────────────────────────────────────────────────────
  type SugData  = Record<string, unknown>
  const sugSnap = await adminDb.collection('suggestions').get()
  const all: (SugData & { id: string })[] = sugSnap.docs.map(d =>
    ({ id: d.id, ...(d.data() as SugData) })
  )

  const thisWeek = all.filter(s => {
    const ts  = s.timestamp as Timestamp | undefined
    const date = ts?.toDate?.()
    return date && date >= weekAgo
  })

  // By source (keep all 5 sources, zero-fill missing)
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

  // Pipeline snapshot (current state, not time-windowed)
  const queueSize   = all.filter(s => String(s.status) === 'New').length
  const activeSize  = all.filter(s => String(s.status) === 'Active').length
  const doneAllTime = all.filter(s => String(s.status) === 'Done').length

  // ── Activity log — this week ──────────────────────────────────────────────────
  const weekAgoTs = Timestamp.fromDate(weekAgo)
  const logSnap   = await adminDb
    .collection('activity_log')
    .where('timestamp', '>=', weekAgoTs)
    .get()

  type LogData = Record<string, unknown>
  const logEntries = logSnap.docs.map(d => d.data() as LogData)

  const decisions    = logEntries.filter(e =>
    e.action === 'Decision saved' || e.action === 'Status edited'
  )
  const movedToDone = decisions
    .filter(e => String(e.newStatus) === 'Done')
    .map(e => ({ id: String(e.suggestionId), preview: String(e.preview || '') }))
    .slice(0, 10)

  const movedToActive = decisions
    .filter(e => String(e.newStatus) === 'Active')
    .map(e => ({ id: String(e.suggestionId), preview: String(e.preview || '') }))
    .slice(0, 10)

  return {
    weekStart:   fmt(weekAgo),
    weekEnd:     fmt(now),
    submissions: { total: thisWeek.length, bySource, byCategory, flagged },
    pipeline:    { queueSize, activeSize, doneAllTime },
    actionsThisWeek: {
      movedToDone,
      movedToActive,
      total: decisions.length,
    },
  }
}

// ─── Email builder ─────────────────────────────────────────────────────────────

function buildEmailHtml(s: RecapStats): string {
  const total = s.submissions.total

  const sourceRows = Object.entries(s.submissions.bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => {
      const pct = total > 0 ? Math.round((n / total) * 100) : 0
      return `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#ccc;border-bottom:1px solid #1e1e1e">${src}</td>
          <td style="padding:6px 0;font-size:13px;color:#fff;text-align:right;border-bottom:1px solid #1e1e1e;font-variant-numeric:tabular-nums">
            ${n} <span style="color:#555;font-size:11px">${pct}%</span>
          </td>
        </tr>`
    }).join('')

  const catRows = s.submissions.byCategory.map(([cat, n]) => `
    <tr>
      <td style="padding:5px 0;font-size:13px;color:#ccc;border-bottom:1px solid #1e1e1e">${cat}</td>
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

  <!-- Header -->
  <div style="margin-bottom:28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#4ade80;letter-spacing:-.01em">Weekly Recap</h1>
    <p style="margin:0;font-size:13px;color:#555">Nasty N8 Suggestion Box · ${escHtml(s.weekStart)} – ${escHtml(s.weekEnd)}</p>
  </div>

  <!-- New submissions -->
  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">New submissions this week</div>
    <div style="font-size:42px;font-weight:700;color:#fff;line-height:1;margin-bottom:16px">${total}</div>
    <table style="width:100%;border-collapse:collapse">${sourceRows}</table>
  </div>

  ${flaggedNote}

  <!-- Top categories -->
  ${s.submissions.byCategory.length > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">Top categories</div>
    <table style="width:100%;border-collapse:collapse">${catRows}</table>
  </div>` : ''}

  <!-- Pipeline snapshot -->
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

  <!-- Moved to done -->
  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">
      ✓ Moved to done this week (${s.actionsThisWeek.movedToDone.length})
    </div>
    <ul style="list-style:none;padding:0;margin:0">${doneItems}</ul>
  </div>

  <!-- Moved to active -->
  <div style="margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#555;margin-bottom:10px">
      → Picked up this week (${s.actionsThisWeek.movedToActive.length})
    </div>
    <ul style="list-style:none;padding:0;margin:0">${activeItems}</ul>
  </div>

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:16px;border-top:1px solid #1e1e1e;font-size:11px;color:#444;text-align:center">
    ${s.actionsThisWeek.total} review decision${s.actionsThisWeek.total !== 1 ? 's' : ''} made this week
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
    `${s.actionsThisWeek.total} review decision${s.actionsThisWeek.total !== 1 ? 's' : ''} made this week.`,
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

async function sendEmail(stats: RecapStats): Promise<void> {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM
  const to   = process.env.NOTIFY_EMAIL_TO
  if (!pass || !from || !to) return

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })

  await transport.sendMail({
    from,
    to,
    subject: `Weekly Recap: ${stats.submissions.total} new suggestion${stats.submissions.total !== 1 ? 's' : ''} (${stats.weekStart} – ${stats.weekEnd})`,
    text:    buildEmailText(stats),
    html:    buildEmailHtml(stats),
  })
}

async function sendDiscord(stats: RecapStats): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return

  const total = stats.submissions.total

  // Source breakdown as field value
  const sourceLines = Object.entries(stats.submissions.bySource)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n > 0)
    .map(([src, n]) => {
      const pct = total > 0 ? Math.round((n / total) * 100) : 0
      return `**${src}**: ${n} (${pct}%)`
    })
    .join('\n') || '_none_'

  const doneLines = stats.actionsThisWeek.movedToDone.length > 0
    ? stats.actionsThisWeek.movedToDone.slice(0, 5).map(item => `• ${item.preview}`).join('\n')
    : '_none_'

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
      footer:      { text: `${stats.actionsThisWeek.total} review decision${stats.actionsThisWeek.total !== 1 ? 's' : ''} made this week` },
      timestamp:   new Date().toISOString(),
    }],
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`)
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
      const results = await Promise.allSettled([
        sendEmail(stats),
        sendDiscord(stats),
      ])

      const emailResult   = results[0]
      const discordResult = results[1]

      const warnings: string[] = []
      if (emailResult.status   === 'rejected') warnings.push(`email: ${String(emailResult.reason)}`)
      if (discordResult.status === 'rejected') warnings.push(`discord: ${String(discordResult.reason)}`)

      return NextResponse.json({ ok: true, dry: false, stats, warnings })
    }

    return NextResponse.json({ ok: true, dry: true, stats })
  } catch (err) {
    console.error('[weekly-recap] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Also accept POST (for admin UI button, same logic)
export const POST = GET
