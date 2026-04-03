import { NextRequest, NextResponse } from 'next/server'

import { EvidenceDatabaseUnavailableError } from '@/lib/evidence/db'
import { getCardById } from '@/lib/evidence/search-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: {
    id: string
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const card = await getCardById(context.params.id)

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    return NextResponse.json(card)
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('Card detail error:', error)
    return NextResponse.json({ error: 'Unable to load card' }, { status: 500 })
  }
}
