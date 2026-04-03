import { NextResponse } from 'next/server'

import { getSearchMeta } from '@/lib/evidence/search-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getSearchMeta())
  } catch (error) {
    console.error('Search meta error:', error)
    return NextResponse.json({ error: 'Unable to load search metadata' }, { status: 500 })
  }
}
