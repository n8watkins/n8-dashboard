// ─── Outbound email (server-side) ────────────────────────────────────────────
// Reuses the existing Gmail SMTP app-password (NOTIFY_EMAIL_*). A consumer Gmail
// app-password is NOT a Google Cloud project, so it's fine post-Firebase.
// When SMTP isn't configured, magic links fall back to the server console so
// local dev works without wiring real email.
import nodemailer from 'nodemailer'

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const pass = process.env.NOTIFY_EMAIL_PASS
  const from = process.env.NOTIFY_EMAIL_FROM

  if (!pass || !from) {
    // Dev fallback — print the link so you can sign in without SMTP.
    console.log(`\n🔑 [dev] Magic sign-in link for ${to}:\n${url}\n`)
    return
  }

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })
  await transport.sendMail({
    from,
    to,
    subject: 'Your Nasty N8 admin sign-in link',
    text: [
      'Click to sign in to the Nasty N8 admin dashboard:',
      '',
      url,
      '',
      "This link expires shortly. If you didn't request it, ignore this email.",
    ].join('\n'),
    html: `
      <p>Click to sign in to the Nasty N8 admin dashboard:</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#4ade80;color:#0d0d0d;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
      <p style="color:#888;font-size:12px">This link expires shortly. If you didn't request it, ignore this email.</p>`,
  })
}
