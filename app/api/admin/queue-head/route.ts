import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { getQueueHead } from '@/lib/queries'

// GET /api/admin/queue-head → the next 'New' suggestion (polled by the review queue)
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  return NextResponse.json({ suggestion: await getQueueHead() })
}
