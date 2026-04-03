import { NextResponse } from 'next/server'

import { EvidenceDatabaseUnavailableError } from '@/lib/evidence/db'
import { getSearchMeta } from '@/lib/evidence/search-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getSearchMeta())
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('Search meta error:', error)
    return NextResponse.json({ error: 'Unable to load search metadata' }, { status: 500 })
  }
}
