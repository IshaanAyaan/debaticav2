import { NextRequest, NextResponse } from 'next/server'

import { EvidenceDatabaseUnavailableError } from '@/lib/evidence/db'
import { parseSearchParams, searchCards } from '@/lib/evidence/search-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const params = parseSearchParams(request.nextUrl.searchParams)
    return NextResponse.json(await searchCards(params))
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('Card search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
