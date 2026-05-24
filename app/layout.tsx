import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nasty N8 Suggestion Box',
  description: 'Submit suggestions for the Nasty N8 community.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
