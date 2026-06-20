import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchRelated } from '@/lib/queries'
import type { BrowseFilters } from '@/lib/types'

// GET /api/admin/suggestions/:id/related?limit=&view=&source=&status=&search=
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { id } = await params
  const sp = req.nextUrl.searchParams
  const limitN = Number(sp.get('limit')) || 10

  const extra: Partial<BrowseFilters> = {}
  if (sp.get('view'))   extra.viewGroup = sp.get('view') as BrowseFilters['viewGroup']
  if (sp.get('source')) extra.source = sp.get('source')!
  if (sp.get('status')) extra.status = sp.get('status')!
  if (sp.get('search')) extra.search = sp.get('search')!

  return NextResponse.json({ results: await fetchRelated(id, limitN, extra) })
}
