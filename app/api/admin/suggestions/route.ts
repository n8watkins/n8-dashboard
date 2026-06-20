import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchSuggestions } from '@/lib/queries'
import type { BrowseFilters } from '@/lib/types'

// GET /api/admin/suggestions?view=&category=&type=&source=&status=&search=
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const sp = req.nextUrl.searchParams
  const filters: BrowseFilters = {
    viewGroup: (sp.get('view') as BrowseFilters['viewGroup']) || 'all',
    category:  sp.get('category') || undefined,
    type:      sp.get('type')     || undefined,
    source:    sp.get('source')   || undefined,
    status:    sp.get('status')   || undefined,
    search:    sp.get('search')   || undefined,
  }
  return NextResponse.json(await fetchSuggestions(filters))
}
