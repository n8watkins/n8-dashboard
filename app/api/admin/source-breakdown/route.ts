import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchSourceBreakdown } from '@/lib/queries'

// GET /api/admin/source-breakdown → Record<source, SourceStats>
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  return NextResponse.json(await fetchSourceBreakdown())
}
