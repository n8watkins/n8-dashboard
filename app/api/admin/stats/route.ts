import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchStats } from '@/lib/queries'

// GET /api/admin/stats → Stats
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  return NextResponse.json(await fetchStats())
}
