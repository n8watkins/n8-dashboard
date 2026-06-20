import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchActivityLog } from '@/lib/queries'
import type { LogFilters } from '@/lib/types'

// GET /api/admin/activity-log?search=&year=&monthKey=&interaction=&result=&sortDirection=&onlyWithNotes=&onlyDecisions=
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const sp = req.nextUrl.searchParams
  const filters: LogFilters = {
    search:        sp.get('search')      || undefined,
    year:          sp.get('year')        || undefined,
    monthKey:      sp.get('monthKey')    || undefined,
    interaction:   sp.get('interaction') || undefined,
    result:        sp.get('result')      || undefined,
    sortDirection: (sp.get('sortDirection') as 'asc' | 'desc') || undefined,
    onlyWithNotes: sp.get('onlyWithNotes') === 'true',
    onlyDecisions: sp.get('onlyDecisions') === 'true',
  }
  return NextResponse.json({ entries: await fetchActivityLog(filters) })
}
