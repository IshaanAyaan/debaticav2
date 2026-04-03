import { NextRequest, NextResponse } from 'next/server'

import { EvidenceDatabaseUnavailableError } from '@/lib/evidence/db'
import { getCardVariants } from '@/lib/evidence/search-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limitValue = Number.parseInt(request.nextUrl.searchParams.get('limit') || '6', 10)
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 12) : 6

    return NextResponse.json({
      items: await getCardVariants(context.params.id, limit),
    })
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('Card variants error:', error)
    return NextResponse.json({ error: 'Unable to load card variants' }, { status: 500 })
  }
}
