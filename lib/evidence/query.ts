import type {
  CardFilterState,
  CardSearchParams,
  EvidenceCardDetail,
  EvidenceCardSummary,
  EvidenceTextView,
  EvidenceVariantSummary,
  FilterOption,
  ImportManifest,
  SearchMetaResponse,
  SearchResponse,
  SearchSort,
} from './contracts.ts'
import { EvidenceDatabaseUnavailableError, getEvidenceDb } from './db.ts'
import {
  buildFtsQuery,
  formatCardCopy,
  formatEventLabel,
  getAvailableViews,
  getPreferredEvidenceText,
  normalizeFilterToken,
  normalizeWhitespace,
  pickSnippet,
  resolvePrimaryLinkUrl,
  tokenizeSearchText,
} from './text.ts'

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 24
export const MIN_EXACT_RESULTS = 8
export const FALLBACK_CANDIDATE_LIMIT = 80

type SqlRow = Record<string, unknown>

export function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function clampPageSize(value: string | undefined): number {
  const parsed = parseInteger(value, DEFAULT_PAGE_SIZE)
  return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE)
}

export function coerceFilters(params: CardSearchParams): CardFilterState {
  return {
    event: params.event?.trim() || '',
  }
}

export function parseSort(value: string | undefined, hasQuery: boolean): SearchSort {
  if (value === 'support' || value === 'recent') {
    return value
  }

  return hasQuery ? 'relevance' : 'support'
}

export function numericValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function mapSummaryRow(row: SqlRow): EvidenceCardSummary {
  const sourceArticleUrl = stringValue(row.sourceArticleUrl) || null
  const sourcePageUrl = stringValue(row.sourcePageUrl) || null
  const fileUrl = stringValue(row.fileUrl) || null

  return {
    id: stringValue(row.id),
    tag: stringValue(row.tag),
    cite: stringValue(row.cite),
    fullcite: stringValue(row.fullcite),
    snippet: pickSnippet({
      spoken: stringValue(row.spoken),
      summary: stringValue(row.summary),
      fulltext: stringValue(row.fulltext),
    }),
    event: stringValue(row.event),
    hat: stringValue(row.hat),
    block: stringValue(row.block),
    year: stringValue(row.year),
    supportCount: numericValue(row.supportCount),
    variantCount: numericValue(row.variantCount),
    schoolDisplayName: stringValue(row.schoolDisplayName),
    teamDisplayName: stringValue(row.teamDisplayName),
    tournament: stringValue(row.tournament),
    round: stringValue(row.round),
    score: typeof row.score === 'number' ? row.score : numericValue(row.score || 0) || undefined,
    sourceArticleUrl,
    sourcePageUrl,
    fileUrl,
    primaryLinkUrl: resolvePrimaryLinkUrl({ sourceArticleUrl, sourcePageUrl, fileUrl }),
  }
}

export function mapVariantRow(row: SqlRow): EvidenceVariantSummary {
  const sourceArticleUrl = stringValue(row.sourceArticleUrl) || null
  const sourcePageUrl = stringValue(row.sourcePageUrl) || null
  const fileUrl = stringValue(row.fileUrl) || null

  return {
    id: stringValue(row.id),
    clusterId: stringValue(row.clusterId),
    kind: stringValue(row.kind) === 'cluster' ? 'cluster' : 'variant',
    tag: stringValue(row.tag),
    fullcite: stringValue(row.fullcite),
    snippet: pickSnippet({
      spoken: stringValue(row.spoken),
      summary: stringValue(row.summary),
      fulltext: stringValue(row.fulltext),
    }),
    event: stringValue(row.event),
    year: stringValue(row.year),
    duplicateCount: numericValue(row.duplicateCount),
    schoolDisplayName: stringValue(row.schoolDisplayName),
    teamDisplayName: stringValue(row.teamDisplayName),
    tournament: stringValue(row.tournament),
    round: stringValue(row.round),
    sourceArticleUrl,
    sourcePageUrl,
    fileUrl,
    primaryLinkUrl: resolvePrimaryLinkUrl({ sourceArticleUrl, sourcePageUrl, fileUrl }),
  }
}

function mapCanonicalVariantSummary(row: SqlRow): EvidenceVariantSummary {
  const sourceArticleUrl = stringValue(row.sourceArticleUrl) || null
  const sourcePageUrl = stringValue(row.sourcePageUrl) || null
  const fileUrl = stringValue(row.fileUrl) || null

  return {
    id: stringValue(row.id),
    clusterId: stringValue(row.id),
    kind: 'cluster',
    tag: stringValue(row.tag),
    fullcite: stringValue(row.fullcite),
    snippet: pickSnippet({
      spoken: stringValue(row.spoken),
      summary: stringValue(row.summary),
      fulltext: stringValue(row.fulltext),
    }),
    event: stringValue(row.event),
    year: stringValue(row.year),
    duplicateCount: numericValue(row.supportCount),
    schoolDisplayName: stringValue(row.schoolDisplayName),
    teamDisplayName: stringValue(row.teamDisplayName),
    tournament: stringValue(row.tournament),
    round: stringValue(row.round),
    sourceArticleUrl,
    sourcePageUrl,
    fileUrl,
    primaryLinkUrl: resolvePrimaryLinkUrl({ sourceArticleUrl, sourcePageUrl, fileUrl }),
  }
}

export function mapManifestRow(row: SqlRow | undefined): ImportManifest | null {
  if (!row) {
    return null
  }

  return {
    sourceName: stringValue(row.sourceName),
    sourceReference: stringValue(row.sourceReference),
    sourceYearStart: stringValue(row.sourceYearStart),
    sourceYearEnd: stringValue(row.sourceYearEnd),
    eventFilter: stringValue(row.eventFilter),
    totalRows: numericValue(row.totalRows),
    importedRows: numericValue(row.importedRows),
    canonicalClusters: numericValue(row.canonicalClusters),
    skippedRows: numericValue(row.skippedRows),
    importedAt: stringValue(row.importedAt),
    filterSettings: stringValue(row.filterSettings),
  }
}

export function mapFilterOptions(rows: SqlRow[]): FilterOption[] {
  return rows.map((row) => ({
    value: stringValue(row.value),
    count: numericValue(row.count),
  }))
}

function buildFilterSql(filters: CardFilterState, params: Record<string, unknown>): string {
  const clauses: string[] = []

  if (filters.event) {
    clauses.push(`lower(clusters.event) = lower($event)`)
    params.event = filters.event
  }

  return clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : ''
}

function buildBrowseOrder(sort: SearchSort): string {
  if (sort === 'recent') {
    return `CAST(NULLIF(clusters.year, '') AS INTEGER) DESC, clusters.supportCount DESC, clusters.id DESC`
  }

  return `clusters.supportCount DESC, CAST(NULLIF(clusters.year, '') AS INTEGER) DESC, clusters.id DESC`
}

function buildSearchOrder(sort: SearchSort): string {
  if (sort === 'support') {
    return `clusters.supportCount DESC, score DESC, clusters.id DESC`
  }
  if (sort === 'recent') {
    return `CAST(NULLIF(clusters.year, '') AS INTEGER) DESC, score DESC, clusters.id DESC`
  }

  return `score DESC, clusters.supportCount DESC, clusters.id DESC`
}

export function describeEventScope(eventFilter: string): string {
  const events = eventFilter
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (events.length === 0) {
    return 'evidence clusters'
  }
  if (events.length === 1) {
    return `${formatEventLabel(events[0])} evidence clusters`
  }

  const labels = events.map(formatEventLabel)
  const finalLabel = labels.pop()
  return `${labels.join(', ')}${labels.length > 1 ? ',' : ''} and ${finalLabel} evidence clusters`
}

export function computeClosestScore(row: EvidenceCardSummary, normalizedQuery: string): number {
  const tokens = tokenizeSearchText(normalizedQuery)
  if (tokens.length === 0) {
    return Math.log1p(row.supportCount) * 2 + (Number.parseInt(row.year, 10) || 0) / 1000
  }

  const tag = normalizeFilterToken(row.tag)
  const cite = normalizeFilterToken(row.fullcite || row.cite)
  const block = normalizeFilterToken(row.block)
  const snippet = normalizeFilterToken(row.snippet)
  const haystack = `${tag} ${cite} ${block} ${snippet}`

  let matchedTokens = 0
  let score = 0

  if (haystack.includes(normalizedQuery)) {
    score += 8
  }
  if (tag.includes(normalizedQuery)) {
    score += 4
  }

  for (const token of tokens) {
    let tokenScore = 0

    if (tag.includes(token)) {
      tokenScore = 3.25
    } else if (cite.includes(token)) {
      tokenScore = 2.4
    } else if (block.includes(token)) {
      tokenScore = 1.8
    } else if (snippet.includes(token)) {
      tokenScore = 1.35
    }

    if (tokenScore > 0) {
      matchedTokens += 1
      score += tokenScore
    }
  }

  score += (matchedTokens / tokens.length) * 5
  score += Math.log1p(row.supportCount) * 1.75
  score += Math.log1p(row.variantCount) * 1.2
  score += (Number.parseInt(row.year, 10) || 0) / 1000

  return score
}

export function computeExactBlendScore(row: EvidenceCardSummary, normalizedQuery: string): number {
  const tokens = tokenizeSearchText(normalizedQuery)
  const tag = normalizeFilterToken(row.tag)
  const cite = normalizeFilterToken(row.fullcite || row.cite)
  const block = normalizeFilterToken(row.block)
  const snippet = normalizeFilterToken(row.snippet)
  const haystack = `${tag} ${cite} ${block} ${snippet}`
  const tagWordCount = tag.split(/\s+/).filter(Boolean).length || 1

  let lexicalBoost = 0
  let tagTokenMatches = 0
  let citeTokenMatches = 0
  let blockTokenMatches = 0

  if (haystack.includes(normalizedQuery)) {
    lexicalBoost += 10
  }
  if (tag.includes(normalizedQuery)) {
    lexicalBoost += 14

    if (tag.startsWith(normalizedQuery)) {
      lexicalBoost += 16
    }

    if (tagWordCount <= Math.max(tokens.length + 4, 8)) {
      lexicalBoost += 14
    }
  }
  if (cite.includes(normalizedQuery)) {
    lexicalBoost += 4
  }
  if (block.includes(normalizedQuery)) {
    lexicalBoost += 10
  }

  if (tokens.length > 0) {
    let matchedTokens = 0

    for (const token of tokens) {
      if (tag.includes(token)) {
        lexicalBoost += 2.8
        tagTokenMatches += 1
        matchedTokens += 1
      } else if (cite.includes(token)) {
        lexicalBoost += 1.9
        citeTokenMatches += 1
        matchedTokens += 1
      } else if (block.includes(token)) {
        lexicalBoost += 1.4
        blockTokenMatches += 1
        matchedTokens += 1
      } else if (snippet.includes(token)) {
        lexicalBoost += 1
        matchedTokens += 1
      }
    }

    lexicalBoost += (matchedTokens / tokens.length) * 9

    if (tagTokenMatches === tokens.length) {
      lexicalBoost += 28

      if (tag.length <= 96) {
        lexicalBoost += 8
      }

      if (tagWordCount <= Math.max(tokens.length + 3, 7)) {
        lexicalBoost += 18
      }
    } else if (tokens.length > 1 && tagTokenMatches >= tokens.length - 1) {
      lexicalBoost += 12
    }

    if (citeTokenMatches === tokens.length) {
      lexicalBoost += 5
    }

    if (blockTokenMatches === tokens.length) {
      lexicalBoost += 8
    }
  }

  const supportBoost = Math.log1p(row.supportCount) * 0.55 + Math.log1p(row.variantCount) * 0.2
  const recencyBoost = (Number.parseInt(row.year, 10) || 0) / 3000
  const densityBoost = tokens.length > 0 ? (tagTokenMatches / tagWordCount) * 22 : 0
  const longTagPenalty = tagWordCount >= 24 ? (tagWordCount - 23) * 0.28 : 0

  return lexicalBoost * 2.35 + densityBoost + (row.score || 0) * 0.82 + supportBoost + recencyBoost - longTagPenalty
}

function formatScopeLabel(manifest: ImportManifest | null): string {
  if (!manifest) {
    return 'Debate evidence index'
  }

  const base = `Indexed ${manifest.canonicalClusters.toLocaleString()} ${describeEventScope(manifest.eventFilter)}`
  const hasConcreteYears =
    manifest.sourceYearStart &&
    manifest.sourceYearEnd &&
    manifest.sourceYearStart !== 'custom' &&
    manifest.sourceYearEnd !== 'custom'

  if (hasConcreteYears) {
    return `${base} from ${manifest.sourceYearStart}-${manifest.sourceYearEnd}`
  }

  if (manifest.sourceName.toLowerCase().includes('sample') || manifest.sourceReference.includes('fixtures/')) {
    return `${base} in the demo archive`
  }

  return base
}

export function dedupeSummaries(rows: EvidenceCardSummary[]): EvidenceCardSummary[] {
  const seen = new Set<string>()
  const deduped: EvidenceCardSummary[] = []

  for (const row of rows) {
    if (seen.has(row.id)) {
      continue
    }

    seen.add(row.id)
    deduped.push(row)
  }

  return deduped
}

function queryExactResults(
  db: ReturnType<typeof getEvidenceDb>,
  normalizedQuery: string,
  filters: CardFilterState,
  sort: SearchSort
): { total: number; items: EvidenceCardSummary[] } {
  const filterParams: Record<string, unknown> = {}
  const filterSql = buildFilterSql(filters, filterParams)
  const ftsQuery = buildFtsQuery(normalizedQuery, 'AND')

  if (!ftsQuery) {
    return { total: 0, items: [] }
  }

  try {
    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM evidence_clusters_fts
        JOIN evidence_clusters AS clusters ON clusters.id = evidence_clusters_fts.id
        WHERE evidence_clusters_fts MATCH $ftsQuery${filterSql}
      `)
      .get({
        ...filterParams,
        ftsQuery,
      })

    const rows = db
      .prepare(`
        WITH ranked AS (
          SELECT
            clusters.*,
            (
              (-bm25(evidence_clusters_fts, 14.0, 10.0, 7.0, 5.0, 6.0, 4.0, 2.0, 1.0))
              + CASE
                  WHEN lower(clusters.tag) = $phrase THEN 4.2
                  WHEN lower(clusters.tag) LIKE ($phrase || '%') THEN 3.2
                  WHEN lower(clusters.tag) LIKE ('%' || $phrase || '%') THEN 2.4
                  ELSE 0
                END
              + CASE
                  WHEN lower(clusters.fullcite) LIKE ('%' || $phrase || '%') THEN 1.2
                  ELSE 0
                END
              + (ln(clusters.supportCount + 1) * 0.55)
              + (ln(clusters.variantCount + 1) * 0.25)
            ) AS score
          FROM evidence_clusters_fts
          JOIN evidence_clusters AS clusters ON clusters.id = evidence_clusters_fts.id
          WHERE evidence_clusters_fts MATCH $ftsQuery${filterSql}
        )
        SELECT *
        FROM ranked AS clusters
        ORDER BY ${buildSearchOrder(sort)}
        LIMIT $limit
      `)
      .all({
        ...filterParams,
        ftsQuery,
        phrase: normalizedQuery.toLowerCase(),
        limit: FALLBACK_CANDIDATE_LIMIT,
      })

    const items = rows
      .map((row) => mapSummaryRow(row as SqlRow))
      .sort((left, right) => {
        const rightScore = computeExactBlendScore(right, normalizedQuery)
        const leftScore = computeExactBlendScore(left, normalizedQuery)
        return rightScore - leftScore
      })

    return {
      total: numericValue(countRow?.total),
      items,
    }
  } catch (error) {
    console.warn(`Exact evidence search failed for query "${normalizedQuery}"`, error)
    return { total: 0, items: [] }
  }
}

function getClusterRowById(db: ReturnType<typeof getEvidenceDb>, id: string): SqlRow | undefined {
  return db.prepare(`SELECT * FROM evidence_clusters WHERE id = $id LIMIT 1`).get({ id }) as SqlRow | undefined
}

function getVariantRowById(db: ReturnType<typeof getEvidenceDb>, id: string): SqlRow | undefined {
  return db
    .prepare(`
      SELECT
        variants.*,
        clusters.supportCount AS clusterSupportCount,
        clusters.variantCount AS clusterVariantCount,
        clusters.id AS canonicalClusterId,
        clusters.tag AS canonicalTag,
        clusters.fullcite AS canonicalFullcite,
        clusters.renderedMarkup AS canonicalRenderedMarkup
      FROM evidence_variants AS variants
      JOIN evidence_clusters AS clusters ON clusters.id = variants.clusterId
      WHERE variants.id = $id
      LIMIT 1
    `)
    .get({ id }) as SqlRow | undefined
}

function buildDetailFromRow(
  summary: EvidenceCardSummary,
  row: SqlRow,
  kind: 'cluster' | 'variant',
  clusterId: string
): EvidenceCardDetail {
  const detail: EvidenceCardDetail = {
    ...summary,
    kind,
    clusterId,
    summary: stringValue(row.summary),
    spoken: stringValue(row.spoken),
    fulltext: stringValue(row.fulltext),
    markup: stringValue(row.markup),
    renderedMarkup: stringValue(row.renderedMarkup) || '',
    copyText: '',
    preferredText: '',
    availableViews: getAvailableViews({
      spoken: stringValue(row.spoken),
      summary: stringValue(row.summary),
      fulltext: stringValue(row.fulltext),
    }),
    variantsPreview: [],
  }

  detail.preferredText = getPreferredEvidenceText(detail)
  detail.copyText = formatCardCopy(detail)

  return detail
}

function resolveClusterSelection(
  db: ReturnType<typeof getEvidenceDb>,
  id: string
): { clusterRow: SqlRow; currentVariantRow?: SqlRow } | null {
  const clusterRow = getClusterRowById(db, id)
  if (clusterRow) {
    return { clusterRow }
  }

  const variantRow = getVariantRowById(db, id)
  if (!variantRow) {
    return null
  }

  const parentCluster = getClusterRowById(db, stringValue(variantRow.clusterId))
  if (!parentCluster) {
    return null
  }

  return {
    clusterRow: parentCluster,
    currentVariantRow: variantRow,
  }
}

function queryFallbackResults(
  db: ReturnType<typeof getEvidenceDb>,
  normalizedQuery: string,
  filters: CardFilterState
): EvidenceCardSummary[] {
  const filterParams: Record<string, unknown> = {}
  const filterSql = buildFilterSql(filters, filterParams)
  const ftsQuery = buildFtsQuery(normalizedQuery, 'OR')
  const tokens = tokenizeSearchText(normalizedQuery)

  let rows: SqlRow[] = []

  if (ftsQuery) {
    try {
      rows = db
        .prepare(`
          SELECT clusters.*
          FROM evidence_clusters_fts
          JOIN evidence_clusters AS clusters ON clusters.id = evidence_clusters_fts.id
          WHERE evidence_clusters_fts MATCH $ftsQuery${filterSql}
          LIMIT $limit
        `)
        .all({
          ...filterParams,
          ftsQuery,
          limit: FALLBACK_CANDIDATE_LIMIT,
        }) as SqlRow[]
    } catch (error) {
      console.warn(`Closest-match FTS search failed for query "${normalizedQuery}"`, error)
      rows = []
    }
  }

  if (rows.length < FALLBACK_CANDIDATE_LIMIT && tokens.length > 0) {
    const likeParams: Record<string, unknown> = { ...filterParams }
    const likeClauses = tokens
      .map((token, index) => {
        const key = `like${index}`
        likeParams[key] = `%${token}%`
        return `(lower(clusters.tag) LIKE $${key} OR lower(clusters.fullcite) LIKE $${key} OR lower(clusters.block) LIKE $${key} OR lower(clusters.summary) LIKE $${key} OR lower(clusters.spoken) LIKE $${key})`
      })
      .join(' OR ')

    if (likeClauses) {
      try {
        const moreRows = db
          .prepare(`
            SELECT clusters.*
            FROM evidence_clusters AS clusters
            WHERE 1 = 1${filterSql} AND (${likeClauses})
            ORDER BY clusters.supportCount DESC, CAST(NULLIF(clusters.year, '') AS INTEGER) DESC, clusters.id DESC
            LIMIT $limit
          `)
          .all({
            ...likeParams,
            limit: FALLBACK_CANDIDATE_LIMIT,
          }) as SqlRow[]

        rows = [...rows, ...moreRows]
      } catch (error) {
        console.warn(`Closest-match LIKE search failed for query "${normalizedQuery}"`, error)
      }
    }
  }

  if (rows.length === 0) {
    try {
      rows = db
        .prepare(`
          SELECT clusters.*
          FROM evidence_clusters AS clusters
          WHERE 1 = 1${filterSql}
          ORDER BY clusters.supportCount DESC, CAST(NULLIF(clusters.year, '') AS INTEGER) DESC, clusters.id DESC
          LIMIT $limit
        `)
        .all({
          ...filterParams,
          limit: FALLBACK_CANDIDATE_LIMIT,
        }) as SqlRow[]
    } catch (error) {
      console.warn(`Browse fallback search failed for query "${normalizedQuery}"`, error)
      rows = []
    }
  }

  return dedupeSummaries(rows.map((row) => mapSummaryRow(row))).sort(
    (left, right) => computeClosestScore(right, normalizedQuery) - computeClosestScore(left, normalizedQuery)
  )
}

function queryBrowsePage(
  db: ReturnType<typeof getEvidenceDb>,
  filters: CardFilterState,
  sort: SearchSort,
  page: number,
  pageSize: number
): { total: number; items: EvidenceCardSummary[] } {
  const filterParams: Record<string, unknown> = {}
  const filterSql = buildFilterSql(filters, filterParams)
  const offset = (page - 1) * pageSize

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM evidence_clusters AS clusters WHERE 1 = 1${filterSql}`)
    .get(filterParams)

  const rows = db
    .prepare(`
      SELECT clusters.*
      FROM evidence_clusters AS clusters
      WHERE 1 = 1${filterSql}
      ORDER BY ${buildBrowseOrder(sort)}
      LIMIT $limit OFFSET $offset
    `)
    .all({
      ...filterParams,
      limit: pageSize,
      offset,
    })

  return {
    total: numericValue(totalRow?.total),
    items: rows.map((row) => mapSummaryRow(row as SqlRow)),
  }
}

export function searchCards(params: CardSearchParams): SearchResponse {
  const page = Math.max(params.page || 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const filters = coerceFilters(params)
  const normalizedQuery = normalizeWhitespace(params.q || '')
  const hasQuery = normalizedQuery.length > 0
  const sort = parseSort(params.sort, hasQuery)
  let db: ReturnType<typeof getEvidenceDb> | null = null

  try {
    db = getEvidenceDb()

    if (!hasQuery) {
      const browse = queryBrowsePage(db, filters, sort, page, pageSize)

      return {
        query: normalizedQuery,
        mode: 'exact',
        page,
        pageSize,
        total: browse.total,
        hasMore: page * pageSize < browse.total,
        sort,
        filters,
        results: browse.items,
      }
    }

    const exact = queryExactResults(db, normalizedQuery, filters, sort)
    const mode = exact.items.length >= MIN_EXACT_RESULTS ? 'exact' : 'closest'
    const combined =
      mode === 'exact'
        ? exact.items
        : dedupeSummaries([...exact.items, ...queryFallbackResults(db, normalizedQuery, filters)]).slice(
            0,
            FALLBACK_CANDIDATE_LIMIT
          )
    const offset = (page - 1) * pageSize
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
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      throw error
    }

    console.warn(`Search execution failed for query "${normalizedQuery}", returning browse fallback instead.`, error)

    const fallbackDb = db ?? getEvidenceDb()
    const browse = queryBrowsePage(fallbackDb, filters, sort, page, pageSize)

    return {
      query: normalizedQuery,
      mode: 'closest',
      page,
      pageSize,
      total: browse.total,
      hasMore: page * pageSize < browse.total,
      sort,
      filters,
      results: browse.items,
    }
  }
}

export function getCardVariants(clusterId: string, limit = 6): EvidenceVariantSummary[] {
  const db = getEvidenceDb()
  const resolved = resolveClusterSelection(db, clusterId)

  if (!resolved) {
    return []
  }

  const { clusterRow, currentVariantRow } = resolved
  const currentClusterId = stringValue(clusterRow.id)
  const currentSelectionId = currentVariantRow ? stringValue(currentVariantRow.id) : currentClusterId

  const rows = db
    .prepare(`
      SELECT variants.*
      FROM evidence_variants AS variants
      JOIN evidence_clusters AS clusters ON clusters.id = variants.clusterId
      WHERE variants.clusterId = $clusterId
        AND NOT (
          variants.qualityScore = clusters.canonicalQualityScore
          AND variants.tag = clusters.tag
          AND variants.fullcite = clusters.fullcite
          AND variants.renderedMarkup = clusters.renderedMarkup
        )
        AND variants.id <> $excludeId
      ORDER BY variants.qualityScore DESC, variants.duplicateCount DESC, CAST(NULLIF(variants.year, '') AS INTEGER) DESC, variants.id DESC
      LIMIT $limit
    `)
    .all({
      clusterId: currentClusterId,
      excludeId: currentSelectionId,
      limit,
    })

  const items: EvidenceVariantSummary[] = []

  if (currentVariantRow) {
    items.push(mapCanonicalVariantSummary(clusterRow))
  }

  items.push(...rows.map((row) => mapVariantRow(row as SqlRow)))

  return items.slice(0, limit)
}

export function getCardById(id: string): EvidenceCardDetail | null {
  const db = getEvidenceDb()
  const clusterRow = getClusterRowById(db, id)

  if (clusterRow) {
    const summary = mapSummaryRow(clusterRow)
    const detail = buildDetailFromRow(summary, clusterRow, 'cluster', summary.id)
    detail.variantsPreview = getCardVariants(summary.id, 4)
    return detail
  }

  const variantRow = getVariantRowById(db, id)
  if (!variantRow) {
    return null
  }

  const sourceArticleUrl = stringValue(variantRow.sourceArticleUrl) || null
  const sourcePageUrl = stringValue(variantRow.sourcePageUrl) || null
  const fileUrl = stringValue(variantRow.fileUrl) || null

  const summary: EvidenceCardSummary = {
    id: stringValue(variantRow.id),
    tag: stringValue(variantRow.tag),
    cite: stringValue(variantRow.cite),
    fullcite: stringValue(variantRow.fullcite),
    snippet: pickSnippet({
      spoken: stringValue(variantRow.spoken),
      summary: stringValue(variantRow.summary),
      fulltext: stringValue(variantRow.fulltext),
    }),
    event: stringValue(variantRow.event),
    hat: stringValue(variantRow.hat),
    block: stringValue(variantRow.block),
    year: stringValue(variantRow.year),
    supportCount: numericValue(variantRow.clusterSupportCount),
    variantCount: numericValue(variantRow.clusterVariantCount),
    schoolDisplayName: stringValue(variantRow.schoolDisplayName),
    teamDisplayName: stringValue(variantRow.teamDisplayName),
    tournament: stringValue(variantRow.tournament),
    round: stringValue(variantRow.round),
    sourceArticleUrl,
    sourcePageUrl,
    fileUrl,
    primaryLinkUrl: resolvePrimaryLinkUrl({ sourceArticleUrl, sourcePageUrl, fileUrl }),
  }

  const detail = buildDetailFromRow(summary, variantRow, 'variant', stringValue(variantRow.clusterId))
  detail.variantsPreview = getCardVariants(summary.id, 4)

  return detail
}

export function getSearchMeta(): SearchMetaResponse {
  try {
    const db = getEvidenceDb()
    const manifest = mapManifestRow(
      db.prepare(`SELECT * FROM import_manifest ORDER BY importedAt DESC LIMIT 1`).get() as SqlRow | undefined
    )

    const topEvents = mapFilterOptions(
      db
        .prepare(`
          SELECT event AS value, COUNT(*) AS count
          FROM evidence_clusters
          WHERE trim(event) <> ''
          GROUP BY event
          ORDER BY count DESC, value ASC
          LIMIT 8
        `)
        .all() as SqlRow[]
    )

    const totals = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM evidence_clusters) AS totalClusters,
          (SELECT COUNT(*) FROM evidence_variants) AS totalVariants
      `)
      .get() as SqlRow | undefined

    return {
      status: 'ready',
      scopeLabel: formatScopeLabel(manifest),
      manifest,
      topEvents,
      totalClusters: numericValue(totals?.totalClusters),
      totalVariants: numericValue(totals?.totalVariants),
    }
  } catch (error) {
    if (error instanceof EvidenceDatabaseUnavailableError) {
      return {
        status: 'missing',
        scopeLabel: 'Debate evidence index',
        manifest: null,
        topEvents: [],
        totalClusters: 0,
        totalVariants: 0,
        message: error.message,
      }
    }

    throw error
  }
}

export function parseSearchParams(searchParams: URLSearchParams): CardSearchParams {
  const query = searchParams.get('q') || ''

  return {
    q: query,
    page: Math.max(parseInteger(searchParams.get('page') || undefined, 1), 1),
    pageSize: clampPageSize(searchParams.get('pageSize') || undefined),
    event: searchParams.get('event') || '',
    sort: parseSort(searchParams.get('sort') || undefined, Boolean(query.trim())),
  }
}

export function serializeCardForClipboard(card: EvidenceCardDetail, preferredView?: EvidenceTextView): string {
  return formatCardCopy(card, preferredView)
}
