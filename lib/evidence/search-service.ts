import type {
  CardSearchParams,
  EvidenceCardDetail,
  EvidenceVariantSummary,
  SearchMetaResponse,
  SearchResponse,
} from './contracts.ts'
import {
  getCardById as getCardByIdFromSqlite,
  getCardVariants as getCardVariantsFromSqlite,
  getSearchMeta as getSearchMetaFromSqlite,
  parseSearchParams,
  searchCards as searchCardsFromSqlite,
  serializeCardForClipboard,
} from './query.ts'
import {
  getCardByIdWithSupabase,
  getCardVariantsWithSupabase,
  getSearchMetaWithSupabase,
  searchCardsWithSupabase,
} from './provider-supabase.ts'
import {
  getEvidenceProviderMode,
  hasSupabaseEvidenceConfig,
  markSupabaseAttemptFailure,
  shouldSkipSupabaseAttempt,
} from './supabase.ts'

async function withProviderFallback<T>(
  actionName: string,
  supabaseAction: () => Promise<T>,
  sqliteAction: () => T
): Promise<T> {
  const providerMode = getEvidenceProviderMode()

  if (providerMode === 'sqlite' || !hasSupabaseEvidenceConfig()) {
    return sqliteAction()
  }

  if (providerMode === 'auto' && shouldSkipSupabaseAttempt()) {
    return sqliteAction()
  }

  try {
    return await supabaseAction()
  } catch (error) {
    if (providerMode === 'supabase') {
      throw error
    }

    if (markSupabaseAttemptFailure(error)) {
      console.warn(`Falling back to SQLite evidence provider during ${actionName}:`, error)
    }
    return sqliteAction()
  }
}

export async function searchCards(params: CardSearchParams): Promise<SearchResponse> {
  return withProviderFallback('search', () => searchCardsWithSupabase(params), () => searchCardsFromSqlite(params))
}

export async function getCardById(id: string): Promise<EvidenceCardDetail | null> {
  return withProviderFallback('card detail', () => getCardByIdWithSupabase(id), () => getCardByIdFromSqlite(id))
}

export async function getCardVariants(clusterId: string, limit = 6): Promise<EvidenceVariantSummary[]> {
  return withProviderFallback(
    'card variants',
    () => getCardVariantsWithSupabase(clusterId, limit),
    () => getCardVariantsFromSqlite(clusterId, limit)
  )
}

export async function getSearchMeta(): Promise<SearchMetaResponse> {
  return withProviderFallback('metadata', () => getSearchMetaWithSupabase(), () => getSearchMetaFromSqlite())
}

export { parseSearchParams, serializeCardForClipboard }
