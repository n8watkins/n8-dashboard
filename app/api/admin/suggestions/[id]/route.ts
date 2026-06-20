import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { fetchSuggestion, saveReview } from '@/lib/queries'
import type { SaveReviewPayload } from '@/lib/types'

// GET /api/admin/suggestions/:id  → single suggestion
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { id } = await params
  return NextResponse.json({ suggestion: await fetchSuggestion(id) })
}

// POST /api/admin/suggestions/:id  → save review (status + notes), returns Stats
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { id } = await params
  const body = await req.json() as Omit<SaveReviewPayload, 'suggestionId'>
  const stats = await saveReview({ ...body, suggestionId: id })
  return NextResponse.json({ stats })
}
