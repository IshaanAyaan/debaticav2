import type {
  CardFilterState,
  CardSearchParams,
  EvidenceCardDetail,
  EvidenceCardSummary,
  EvidenceVariantSummary,
  SearchMetaResponse,
  SearchResponse,
  SearchSort,
} from './contracts.ts'
import { embedEvidenceText, isSemanticSearchEnabled } from './embeddings.ts'
import {
  FALLBACK_CANDIDATE_LIMIT,
  MAX_PAGE_SIZE,
  MIN_EXACT_RESULTS,
  clampPageSize,
  coerceFilters,
  computeClosestScore,
  computeExactBlendScore,
  dedupeSummaries,
  describeEventScope,
  mapManifestRow,
  mapSummaryRow,
  mapVariantRow,
  numericValue,
  parseSort,
} from './query.ts'
import { formatCardCopy, getAvailableViews, getPreferredEvidenceText, normalizeWhitespace, tokenizeSearchText } from './text.ts'
import { getSupabaseServiceRoleClient } from './supabase.ts'

type SupabaseRow = Record<string, unknown>

const CLUSTER_SELECT = [
  'id',
  'cluster_key',
  'bucket_id',
  'event',
  'hat',
  'block',
  'tag',
  'cite',
  'fullcite',
  'summary',
  'spoken',
  'fulltext',
  'markup',
  'rendered_markup',
  'support_count',
  'variant_count',
  'canonical_quality_score',
  'team_display_name',
  'school_display_name',
  'caselist_display_name',
  'tournament',
  'round',
  'opponent',
  'judge',
  'year',
  'level',
  'source_article_url',
  'source_page_url',
  'file_url',
].join(',')

const VARIANT_SELECT = [
  'id',
  'cluster_id',
  'cluster_key',
  'event',
  'hat',
  'block',
  'tag',
  'cite',
  'fullcite',
  'summary',
  'spoken',
  'fulltext',
  'markup',
  'rendered_markup',
  'duplicate_count',
  'quality_score',
  'team_display_name',
  'school_display_name',
  'caselist_display_name',
  'tournament',
  'round',
  'opponent',
  'judge',
  'year',
  'level',
  'source_article_url',
  'source_page_url',
  'file_url',
].join(',')

function toRecord(value: unknown): SupabaseRow {
  return value && typeof value === 'object' ? (value as SupabaseRow) : {}
}

function remapClusterRow(row: SupabaseRow, score?: number): SupabaseRow {
  return {
    id: row.id,
    clusterKey: row.cluster_key,
    bucketId: row.bucket_id,
    event: row.event,
    hat: row.hat,
    block: row.block,
    tag: row.tag,
    cite: row.cite,
    fullcite: row.fullcite,
    summary: row.summary,
    spoken: row.spoken,
    fulltext: row.fulltext,
    markup: row.markup,
    renderedMarkup: row.rendered_markup,
    supportCount: row.support_count,
    variantCount: row.variant_count,
    canonicalQualityScore: row.canonical_quality_score,
    teamDisplayName: row.team_display_name,
    schoolDisplayName: row.school_display_name,
    caselistDisplayName: row.caselist_display_name,
    tournament: row.tournament,
    round: row.round,
    opponent: row.opponent,
    judge: row.judge,
    year: row.year,
    level: row.level,
    sourceArticleUrl: row.source_article_url,
    sourcePageUrl: row.source_page_url,
    fileUrl: row.file_url,
    score,
  }
}

function remapVariantRow(row: SupabaseRow): SupabaseRow {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    kind: row.kind || 'variant',
    clusterKey: row.cluster_key,
    event: row.event,
    hat: row.hat,
    block: row.block,
    tag: row.tag,
    cite: row.cite,
    fullcite: row.fullcite,
    summary: row.summary,
    spoken: row.spoken,
    fulltext: row.fulltext,
    markup: row.markup,
    renderedMarkup: row.rendered_markup,
    duplicateCount: row.duplicate_count,
    qualityScore: row.quality_score,
    teamDisplayName: row.team_display_name,
    schoolDisplayName: row.school_display_name,
    caselistDisplayName: row.caselist_display_name,
    tournament: row.tournament,
    round: row.round,
    opponent: row.opponent,
    judge: row.judge,
    year: row.year,
    level: row.level,
    sourceArticleUrl: row.source_article_url,
    sourcePageUrl: row.source_page_url,
    fileUrl: row.file_url,
  }
}

function mapCanonicalVariantSummary(row: SupabaseRow): EvidenceVariantSummary {
  return mapVariantRow({
    id: row.id,
    clusterId: row.id,
    kind: 'cluster',
    tag: row.tag,
    fullcite: row.fullcite,
    summary: row.summary,
    spoken: row.spoken,
    fulltext: row.fulltext,
    event: row.event,
    year: row.year,
    duplicateCount: row.supportCount,
    schoolDisplayName: row.schoolDisplayName,
    teamDisplayName: row.teamDisplayName,
    tournament: row.tournament,
    round: row.round,
    sourceArticleUrl: row.sourceArticleUrl,
    sourcePageUrl: row.sourcePageUrl,
    fileUrl: row.fileUrl,
  })
}

function remapManifestResult(row: SupabaseRow | null): SupabaseRow | undefined {
  if (!row) {
    return undefined
  }

  return {
    sourceName: row.source_name,
    sourceReference: row.source_reference,
    sourceYearStart: row.source_year_start,
    sourceYearEnd: row.source_year_end,
    eventFilter: row.event_filter,
    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    canonicalClusters: row.canonical_clusters,
    skippedRows: row.skipped_rows,
    importedAt: row.imported_at,
    filterSettings:
      typeof row.filter_settings === 'string' ? row.filter_settings : JSON.stringify(row.filter_settings || {}),
  }
}

function applyEventFilter<T>(query: T, filters: CardFilterState): T {
  if (filters.event && typeof query === 'object' && query && 'eq' in query && typeof (query as any).eq === 'function') {
    return (query as any).eq('event', filters.event.toLowerCase())
  }

  return query
}

function sortSupabaseCandidates(
  items: EvidenceCardSummary[],
  normalizedQuery: string,
  sort: SearchSort,
  similarityMap?: Map<string, number>
): EvidenceCardSummary[] {
  return [...items].sort((left, right) => {
    const leftSimilarity = similarityMap?.get(left.id) || 0
    const rightSimilarity = similarityMap?.get(right.id) || 0
    const leftScore = computeExactBlendScore(left, normalizedQuery) + leftSimilarity * 4
    const rightScore = computeExactBlendScore(right, normalizedQuery) + rightSimilarity * 4

    if (sort === 'support') {
      if (right.supportCount !== left.supportCount) {
        return right.supportCount - left.supportCount
      }
    } else if (sort === 'recent') {
      const leftYear = Number.parseInt(left.year, 10) || 0
      const rightYear = Number.parseInt(right.year, 10) || 0
      if (rightYear !== leftYear) {
        return rightYear - leftYear
      }
    }

    return rightScore - leftScore
  })
}

async function queryExactCandidates(
  normalizedQuery: string,
  filters: CardFilterState,
  sort: SearchSort
): Promise<{ total: number; items: EvidenceCardSummary[] }> {
  const client = getSupabaseServiceRoleClient()
  let query = client
    .from('evidence_clusters')
    .select(CLUSTER_SELECT, { count: 'exact' })
    .textSearch('search_document', normalizedQuery, {
      config: 'english',
      type: 'websearch',
    })
    .limit(FALLBACK_CANDIDATE_LIMIT)

  query = applyEventFilter(query, filters)

  const { data, error, count } = await query
  if (error) {
    throw new Error(`Supabase exact evidence search failed: ${error.message}`)
  }

  const items = (data || [])
    .map((row) => mapSummaryRow(remapClusterRow(toRecord(row))))
    .filter((item) => item.id)

  return {
    total: count ?? items.length,
    items: sortSupabaseCandidates(items, normalizedQuery, sort),
  }
}

async function queryFallbackCandidates(normalizedQuery: string, filters: CardFilterState): Promise<EvidenceCardSummary[]> {
  const client = getSupabaseServiceRoleClient()
  const tokens = tokenizeSearchText(normalizedQuery)
  let query = client.from('evidence_clusters').select(CLUSTER_SELECT).limit(FALLBACK_CANDIDATE_LIMIT)

  if (tokens.length > 0) {
    const clauses = tokens.flatMap((token) => [
      `tag.ilike.%${token}%`,
      `fullcite.ilike.%${token}%`,
      `block.ilike.%${token}%`,
      `summary.ilike.%${token}%`,
      `spoken.ilike.%${token}%`,
    ])
    query = query.or(clauses.join(','))
  } else {
    query = query.order('support_count', { ascending: false })
  }

  query = applyEventFilter(query, filters)

  const { data, error } = await query
  if (error) {
    throw new Error(`Supabase fallback evidence search failed: ${error.message}`)
  }

  return dedupeSummaries((data || []).map((row) => mapSummaryRow(remapClusterRow(toRecord(row))))).sort(
    (left, right) => computeClosestScore(right, normalizedQuery) - computeClosestScore(left, normalizedQuery)
  )
}

async function querySemanticCandidates(
  normalizedQuery: string,
  filters: CardFilterState,
  sort: SearchSort
): Promise<EvidenceCardSummary[]> {
  if (!isSemanticSearchEnabled()) {
    return []
  }

  const queryEmbedding = await embedEvidenceText(normalizedQuery)
  if (!queryEmbedding) {
    return []
  }

  const client = getSupabaseServiceRoleClient()
  const { data: matches, error: rpcError } = await client.rpc('match_evidence_clusters', {
    query_embedding: queryEmbedding,
    match_count: FALLBACK_CANDIDATE_LIMIT,
    event_filter: filters.event || null,
  })

  if (rpcError || !matches || matches.length === 0) {
    return []
  }

  const matchRows = (matches as SupabaseRow[]).filter((row) => typeof row.id === 'string')
  const ids = matchRows.map((row) => String(row.id))
  if (ids.length === 0) {
    return []
  }

  const similarityMap = new Map<string, number>(
    matchRows.map((row) => [String(row.id), numericValue(row.similarity || row.score || 0)])
  )

  let query = client.from('evidence_clusters').select(CLUSTER_SELECT).in('id', ids)
  query = applyEventFilter(query, filters)

  const { data, error } = await query
  if (error) {
    return []
  }

  return sortSupabaseCandidates(
    (data || []).map((row) => mapSummaryRow(remapClusterRow(toRecord(row)))),
    normalizedQuery,
    sort,
    similarityMap
  )
}

export async function searchCardsWithSupabase(params: CardSearchParams): Promise<SearchResponse> {
  const page = Math.max(params.page || 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize || clampPageSize(undefined), 1), MAX_PAGE_SIZE)
  const filters = coerceFilters(params)
  const normalizedQuery = normalizeWhitespace(params.q || '')
  const hasQuery = normalizedQuery.length > 0
  const sort = parseSort(params.sort, hasQuery)
  const offset = (page - 1) * pageSize
  const client = getSupabaseServiceRoleClient()

  if (!hasQuery) {
    let query = client
      .from('evidence_clusters')
      .select(CLUSTER_SELECT, { count: 'exact' })
      .range(offset, offset + pageSize - 1)

    query =
      sort === 'recent'
        ? query.order('year', { ascending: false }).order('support_count', { ascending: false })
        : query.order('support_count', { ascending: false }).order('year', { ascending: false })

    query = applyEventFilter(query, filters)

    const { data, error, count } = await query
    if (error) {
      throw new Error(`Supabase browse search failed: ${error.message}`)
    }

    const results = (data || []).map((row) => mapSummaryRow(remapClusterRow(toRecord(row))))

    return {
      query: normalizedQuery,
      mode: 'exact',
      page,
      pageSize,
      total: count ?? results.length,
      hasMore: offset + results.length < (count ?? results.length),
      sort,
      filters,
      results,
    }
  }

  const exact = await queryExactCandidates(normalizedQuery, filters, sort)
  const mode = exact.items.length >= MIN_EXACT_RESULTS ? 'exact' : 'closest'
  const semantic = mode === 'closest' ? await querySemanticCandidates(normalizedQuery, filters, sort) : []
  const fallback = mode === 'closest' ? await queryFallbackCandidates(normalizedQuery, filters) : []
  const combined = mode === 'exact' ? exact.items : dedupeSummaries([...exact.items, ...semantic, ...fallback]).slice(0, FALLBACK_CANDIDATE_LIMIT)
  const pageItems = combined.slice(offset, offset + pageSize)

  return {
    query: normalizedQuery,
    mode,
    page,
    pageSize,
    total: mode === 'exact' ? exact.total : combined.length,
    hasMore: offset + pageItems.length < (mode === 'exact' ? exact.total : combined.length),
    sort,
    filters,
    results: pageItems,
  }
}

export async function getCardVariantsWithSupabase(clusterId: string, limit = 6): Promise<EvidenceVariantSummary[]> {
  const client = getSupabaseServiceRoleClient()
  let resolvedClusterId = clusterId
  let { data: clusterData, error: clusterError } = await client
    .from('evidence_clusters')
    .select(CLUSTER_SELECT)
    .eq('id', clusterId)
    .limit(1)
    .maybeSingle()

  if (clusterError) {
    throw new Error(`Supabase card variants lookup failed: ${clusterError.message}`)
  }

  let selectedVariantId: string | null = null

  if (!clusterData) {
    const { data: variantData, error: variantError } = await client
      .from('evidence_variants')
      .select(VARIANT_SELECT)
      .eq('id', clusterId)
      .limit(1)
      .maybeSingle()

    if (variantError) {
      throw new Error(`Supabase card variants lookup failed: ${variantError.message}`)
    }

    if (!variantData) {
      return []
    }

    const resolvedVariant = toRecord(variantData)
    selectedVariantId = String(resolvedVariant.id)
    resolvedClusterId = String(resolvedVariant.cluster_id)

    const { data: parentCluster, error: parentClusterError } = await client
      .from('evidence_clusters')
      .select(CLUSTER_SELECT)
      .eq('id', resolvedClusterId)
      .limit(1)
      .maybeSingle()

    if (parentClusterError) {
      throw new Error(`Supabase card variants lookup failed: ${parentClusterError.message}`)
    }

    if (!parentCluster) {
      return []
    }

    clusterData = parentCluster
  }

  const canonical = remapClusterRow(toRecord(clusterData))
  const { data, error } = await client
    .from('evidence_variants')
    .select(VARIANT_SELECT)
    .eq('cluster_id', resolvedClusterId)
    .order('quality_score', { ascending: false })
    .order('duplicate_count', { ascending: false })
    .order('year', { ascending: false })
    .limit(limit + 3)

  if (error) {
    throw new Error(`Supabase card variants lookup failed: ${error.message}`)
  }

  const variantItems = (data || [])
    .map((row) => toRecord(row))
    .filter(
      (row) =>
        String(row.id) !== selectedVariantId &&
        !(
          numericValue(row.quality_score) === numericValue(canonical.canonicalQualityScore) &&
          String(row.tag || '') === String(canonical.tag || '') &&
          String(row.fullcite || '') === String(canonical.fullcite || '') &&
          String(row.rendered_markup || '') === String(canonical.renderedMarkup || '')
        )
    )
    .map((row) => mapVariantRow(remapVariantRow(row)))

  const items = selectedVariantId ? [mapCanonicalVariantSummary(canonical)] : []
  items.push(...variantItems)

  return items.slice(0, limit)
}

export async function getCardByIdWithSupabase(id: string): Promise<EvidenceCardDetail | null> {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client.from('evidence_clusters').select(CLUSTER_SELECT).eq('id', id).limit(1).maybeSingle()

  if (error) {
    throw new Error(`Supabase card lookup failed: ${error.message}`)
  }

  if (data) {
    const row = remapClusterRow(toRecord(data))
    const summary = mapSummaryRow(row)
    const detail: EvidenceCardDetail = {
      ...summary,
      kind: 'cluster',
      clusterId: summary.id,
      summary: String(row.summary || ''),
      spoken: String(row.spoken || ''),
      fulltext: String(row.fulltext || ''),
      markup: String(row.markup || ''),
      renderedMarkup: String(row.renderedMarkup || ''),
      copyText: '',
      preferredText: '',
      availableViews: getAvailableViews({
        spoken: String(row.spoken || ''),
        summary: String(row.summary || ''),
        fulltext: String(row.fulltext || ''),
      }),
      variantsPreview: [],
    }

    detail.preferredText = getPreferredEvidenceText(detail)
    detail.copyText = formatCardCopy(detail)
    detail.variantsPreview = await getCardVariantsWithSupabase(summary.id, 4)

    return detail
  }

  const { data: variantData, error: variantError } = await client
    .from('evidence_variants')
    .select(`${VARIANT_SELECT}, evidence_clusters!inner(support_count,variant_count)`)
    .eq('id', id)
    .limit(1)
    .maybeSingle()

  if (variantError) {
    throw new Error(`Supabase card lookup failed: ${variantError.message}`)
  }

  if (!variantData) {
    return null
  }

  const row = remapVariantRow(toRecord(variantData))
  const joinedCluster = toRecord(toRecord(variantData).evidence_clusters)
  const summary = mapSummaryRow({
    ...row,
    supportCount: joinedCluster.support_count,
    variantCount: joinedCluster.variant_count,
  })
  const detail: EvidenceCardDetail = {
    ...summary,
    kind: 'variant',
    clusterId: String(row.clusterId || ''),
    summary: String(row.summary || ''),
    spoken: String(row.spoken || ''),
    fulltext: String(row.fulltext || ''),
    markup: String(row.markup || ''),
    renderedMarkup: String(row.renderedMarkup || ''),
    copyText: '',
    preferredText: '',
    availableViews: getAvailableViews({
      spoken: String(row.spoken || ''),
      summary: String(row.summary || ''),
      fulltext: String(row.fulltext || ''),
    }),
    variantsPreview: [],
  }

  detail.preferredText = getPreferredEvidenceText(detail)
  detail.copyText = formatCardCopy(detail)
  detail.variantsPreview = await getCardVariantsWithSupabase(summary.id, 4)

  return detail
}

export async function getSearchMetaWithSupabase(): Promise<SearchMetaResponse> {
  const client = getSupabaseServiceRoleClient()
  const [{ count: totalClusters, error: clusterCountError }, { count: totalVariants, error: variantCountError }, manifestResponse] =
    await Promise.all([
      client.from('evidence_clusters').select('id', { count: 'exact', head: true }),
      client.from('evidence_variants').select('id', { count: 'exact', head: true }),
      client
        .from('evidence_import_manifests')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (clusterCountError) {
    throw new Error(`Supabase metadata lookup failed: ${clusterCountError.message}`)
  }
  if (variantCountError) {
    throw new Error(`Supabase metadata lookup failed: ${variantCountError.message}`)
  }
  if (manifestResponse.error) {
    throw new Error(`Supabase metadata lookup failed: ${manifestResponse.error.message}`)
  }

  const manifest = mapManifestRow(remapManifestResult(manifestResponse.data ? toRecord(manifestResponse.data) : null))

  return {
    status: 'ready',
    scopeLabel: manifest
      ? `Indexed ${manifest.canonicalClusters.toLocaleString()} ${describeEventScope(manifest.eventFilter)} from ${manifest.sourceYearStart}-${manifest.sourceYearEnd}`
      : 'Hosted debate evidence index',
    manifest,
    topEvents: [],
    totalClusters: totalClusters ?? 0,
    totalVariants: totalVariants ?? 0,
  }
}
