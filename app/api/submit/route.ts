import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { makeTitle, makePreview } from '@/lib/utils'
import { STATUS_OPTIONS, CATEGORY_OPTIONS, TYPE_OPTIONS, SOURCE_OPTIONS } from '@/lib/config'
import type { SubmitPayload } from '@/lib/types'
import nodemailer from 'nodemailer'

// ─── POST /api/submit ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SubmitPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
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

  try {
    // Write to Firestore
    const docRef = await adminDb.collection('suggestions').add({
      timestamp:     FieldValue.serverTimestamp(),
      category:      category.trim(),
      type:          type.trim(),
      suggestion:    suggestion.trim(),
      why:           why.trim(),
      username,
      extra,
      source:        source.trim(),
      status:        'New',
      internalNotes: '',
      preview:       makePreview(suggestion),
      title:         makeTitle(suggestion),
    })

    // Send email notification (non-blocking — failure doesn't fail the request)
    sendEmailNotification(body, docRef.id).catch(err => {
      console.error('[email] Notification failed (submission still saved):', err)
    })

    return NextResponse.json({ ok: true, id: docRef.id })
  } catch (err) {
    console.error('[submit] Firestore write failed:', err)
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 })
  }
}

// ─── Email notification ───────────────────────────────────────────────────────

async function sendEmailNotification(data: SubmitPayload, docId: string) {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM
  const to   = process.env.NOTIFY_EMAIL_TO

  if (!pass || !from || !to) return // Email not configured — skip silently

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass },
  })

  const subject = `New Suggestion: ${data.category} from ${data.source}`

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
    `Firestore doc ID: ${docId}`,
    '— Sent from the Nasty N8 Suggestion Box',
  ].join('\n\n')

  await transport.sendMail({ from, to, subject, text })
}
