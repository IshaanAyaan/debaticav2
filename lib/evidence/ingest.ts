import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { parse } from 'csv-parse'

import type { EvidenceCardRecord, ImportManifest } from './contracts.ts'
import { createEvidenceDb, resetEvidenceSchema, resolveEvidenceDbPath } from './db.ts'
import {
  normalizeEvidenceText,
  normalizeWhitespace,
  pickSourceArticleUrl,
  renderMarkupFromText,
  resolveOpenCaselistUrl,
  sanitizeEvidenceMarkup,
} from './text.ts'

const DATASET_BASE_URL = 'https://huggingface.co/datasets/Yusuf5/OpenCaselist/resolve/main'
export const DEFAULT_SOURCE_YEARS = ['2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'] as const
export const DEFAULT_SUPPORTED_EVENTS = ['policy', 'ld', 'pf', 'bq'] as const

export type SkipReason = 'missing-id' | 'unsupported-event' | 'empty-searchable-text'

export type NormalizedRowResult =
  | { kind: 'card'; card: EvidenceCardRecord }
  | { kind: 'skip'; reason: SkipReason }

export interface IngestEvidenceOptions {
  dbPath?: string
  source?: string
  sources?: string[]
  years?: string[]
  events?: string[]
  limit?: number
  limitPerEvent?: number
  limitPerSource?: number
  limitPerEventPerSource?: number
  limitPerEventPerYear?: number
  logger?: Pick<Console, 'log' | 'error'>
}

export interface IngestEvidenceResult extends ImportManifest {
  dbPath: string
}

type CsvRow = Record<string, string | undefined>

interface CsvSource {
  reference: string
  close: () => void
  stream: Readable
}

interface PreparedVariant {
  id: string
  clusterId: string
  clusterKey: string
  event: string
  hat: string
  block: string
  tag: string
  cite: string
  fullcite: string
  summary: string
  spoken: string
  fulltext: string
  markup: string
  renderedMarkup: string
  duplicateCount: number
  qualityScore: number
  teamDisplayName: string
  schoolDisplayName: string
  caselistDisplayName: string
  tournament: string
  round: string
  opponent: string
  judge: string
  year: string
  level: string
  sourceArticleUrl: string
  sourcePageUrl: string
  fileUrl: string
  bucketId: string
}

interface ClusterAggregate {
  id: string
  clusterKey: string
  bucketId: string
  event: string
  hat: string
  block: string
  tag: string
  cite: string
  fullcite: string
  summary: string
  spoken: string
  fulltext: string
  markup: string
  renderedMarkup: string
  supportCount: number
  variantCount: number
  canonicalQualityScore: number
  teamDisplayName: string
  schoolDisplayName: string
  caselistDisplayName: string
  tournament: string
  round: string
  opponent: string
  judge: string
  year: string
  level: string
  sourceArticleUrl: string
  sourcePageUrl: string
  fileUrl: string
  variants: PreparedVariant[]
}

function buildDatasetSource(year: string): string {
  return `${DATASET_BASE_URL}/evidence-${year}.csv?download=true`
}

function normalizeEvents(events?: string[]): string[] {
  const normalized = (events || [])
    .map((value) => normalizeWhitespace(value).toLowerCase())
    .filter(Boolean)

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_SUPPORTED_EVENTS]
}

function normalizeYears(years?: string[]): string[] {
  const normalized = (years || [])
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean)

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_SOURCE_YEARS]
}

function resolveSources(options: IngestEvidenceOptions): { sources: string[]; yearStart: string; yearEnd: string } {
  const customSources = options.source ? [options.source] : options.sources && options.sources.length > 0 ? options.sources : null
  if (customSources) {
    const detectedYears = customSources
      .map((source) => source.match(/evidence-(\d{4})\.csv/i)?.[1] || '')
      .filter(Boolean)
      .sort()

    return {
      sources: customSources,
      yearStart: detectedYears[0] || 'custom',
      yearEnd: detectedYears[detectedYears.length - 1] || 'custom',
    }
  }

  const years = normalizeYears(options.years)

  return {
    sources: years.map(buildDatasetSource),
    yearStart: years[0],
    yearEnd: years[years.length - 1],
  }
}

export function defaultEvidenceSource(): string {
  return buildDatasetSource('2022')
}

export function normalizeCsvRow(
  row: CsvRow,
  options: {
    events?: string[]
  } = {}
): NormalizedRowResult {
  const id = normalizeWhitespace(row.id || '')
  if (!id) {
    return { kind: 'skip', reason: 'missing-id' }
  }

  const event = normalizeWhitespace(row.event || '').toLowerCase()
  const allowedEvents = normalizeEvents(options.events)
  if (!allowedEvents.includes(event)) {
    return { kind: 'skip', reason: 'unsupported-event' }
  }

  const tag = normalizeEvidenceText(row.tag || '')
  const cite = normalizeEvidenceText(row.cite || '')
  const fullcite = normalizeEvidenceText(row.fullcite || cite)
  const summary = normalizeEvidenceText(row.summary || '')
  const spoken = normalizeEvidenceText(row.spoken || '')
  const fulltext = normalizeEvidenceText(row.fulltext || spoken || summary)

  if (!tag && !cite && !summary && !spoken && !fulltext) {
    return { kind: 'skip', reason: 'empty-searchable-text' }
  }

  const duplicateCount = Number.parseInt(normalizeWhitespace(row.duplicateCount || '0'), 10)

  return {
    kind: 'card',
    card: {
      id,
      tag,
      cite,
      fullcite,
      summary,
      spoken,
      fulltext,
      markup: normalizeWhitespace(row.markup || ''),
      hat: normalizeWhitespace(row.hat || ''),
      block: normalizeWhitespace(row.block || ''),
      bucketId: normalizeWhitespace(row.bucketId || ''),
      duplicateCount: Number.isFinite(duplicateCount) ? duplicateCount : 0,
      teamDisplayName: normalizeWhitespace(row.teamDisplayName || ''),
      schoolDisplayName: normalizeWhitespace(row.schoolDisplayName || ''),
      caselistDisplayName: normalizeWhitespace(row.caselistDisplayName || ''),
      tournament: normalizeWhitespace(row.tournament || ''),
      round: normalizeWhitespace(row.round || ''),
      opponent: normalizeWhitespace(row.opponent || ''),
      judge: normalizeWhitespace(row.judge || ''),
      year: normalizeWhitespace(row.year || ''),
      event,
      level: normalizeWhitespace(row.level || ''),
      filePath: normalizeWhitespace(row.filePath || ''),
      opensourcePath: normalizeWhitespace(row.opensourcePath || ''),
    },
  }
}

function scoreCanonicalCandidate(card: EvidenceCardRecord, renderedMarkup: string, sourceArticleUrl: string | null): number {
  const duplicateScore = Math.max(card.duplicateCount, 1) * 10_000
  const citationScore = (card.fullcite.length * 4) + (card.cite.length * 2)
  const textScore = card.spoken.length * 3 + card.summary.length * 2 + card.fulltext.length
  const markupScore = card.markup ? 400 : 0
  const renderedScore = renderedMarkup ? 200 : 0
  const sourceScore = sourceArticleUrl ? 150 : 0
  const yearScore = Number.parseInt(card.year || '0', 10) || 0

  return duplicateScore + citationScore + textScore + markupScore + renderedScore + sourceScore + yearScore
}

function deriveClusterKey(card: EvidenceCardRecord): string {
  if (card.bucketId) {
    return `${card.event}:bucket:${card.bucketId}`
  }

  const fingerprint = [
    card.event,
    normalizeWhitespace(card.cite.toLowerCase()),
    normalizeWhitespace(card.tag.toLowerCase()),
    normalizeWhitespace((card.spoken || card.summary || card.fulltext).toLowerCase()).slice(0, 400),
  ].join('|')

  return `${card.event}:fp:${createHash('sha1').update(fingerprint).digest('hex')}`
}

function buildClusterId(clusterKey: string): string {
  return createHash('sha1').update(clusterKey).digest('hex').slice(0, 24)
}

function buildPreparedVariant(card: EvidenceCardRecord): PreparedVariant {
  const sourcePageUrl = resolveOpenCaselistUrl(card.opensourcePath) || ''
  const fileUrl = resolveOpenCaselistUrl(card.filePath) || ''
  const sourceArticleUrl = pickSourceArticleUrl(card.fullcite, card.fulltext, card.markup) || ''
  const fallbackText = card.fulltext || card.spoken || card.summary
  const renderedMarkup = sanitizeEvidenceMarkup(card.markup, fallbackText)
  const qualityScore = scoreCanonicalCandidate(card, renderedMarkup, sourceArticleUrl || null)
  const clusterKey = deriveClusterKey(card)
  const clusterId = buildClusterId(clusterKey)

  return {
    id: card.id,
    clusterId,
    clusterKey,
    event: card.event,
    hat: card.hat,
    block: card.block,
    tag: card.tag,
    cite: card.cite,
    fullcite: card.fullcite,
    summary: card.summary,
    spoken: card.spoken,
    fulltext: card.fulltext,
    markup: card.markup,
    renderedMarkup,
    duplicateCount: Math.max(card.duplicateCount, 1),
    qualityScore,
    teamDisplayName: card.teamDisplayName,
    schoolDisplayName: card.schoolDisplayName,
    caselistDisplayName: card.caselistDisplayName,
    tournament: card.tournament,
    round: card.round,
    opponent: card.opponent,
    judge: card.judge,
    year: card.year,
    level: card.level,
    sourceArticleUrl,
    sourcePageUrl,
    fileUrl,
    bucketId: card.bucketId,
  }
}

function createAggregate(variant: PreparedVariant): ClusterAggregate {
  return {
    id: variant.clusterId,
    clusterKey: variant.clusterKey,
    bucketId: variant.bucketId,
    event: variant.event,
    hat: variant.hat,
    block: variant.block,
    tag: variant.tag,
    cite: variant.cite,
    fullcite: variant.fullcite,
    summary: variant.summary,
    spoken: variant.spoken,
    fulltext: variant.fulltext,
    markup: variant.markup,
    renderedMarkup: variant.renderedMarkup,
    supportCount: Math.max(variant.duplicateCount, 1),
    variantCount: 1,
    canonicalQualityScore: variant.qualityScore,
    teamDisplayName: variant.teamDisplayName,
    schoolDisplayName: variant.schoolDisplayName,
    caselistDisplayName: variant.caselistDisplayName,
    tournament: variant.tournament,
    round: variant.round,
    opponent: variant.opponent,
    judge: variant.judge,
    year: variant.year,
    level: variant.level,
    sourceArticleUrl: variant.sourceArticleUrl,
    sourcePageUrl: variant.sourcePageUrl,
    fileUrl: variant.fileUrl,
    variants: [variant],
  }
}

function maybePromoteCanonical(aggregate: ClusterAggregate, variant: PreparedVariant): void {
  if (variant.qualityScore <= aggregate.canonicalQualityScore) {
    return
  }

  aggregate.event = variant.event
  aggregate.hat = variant.hat
  aggregate.block = variant.block
  aggregate.tag = variant.tag
  aggregate.cite = variant.cite
  aggregate.fullcite = variant.fullcite
  aggregate.summary = variant.summary
  aggregate.spoken = variant.spoken
  aggregate.fulltext = variant.fulltext
  aggregate.markup = variant.markup
  aggregate.renderedMarkup = variant.renderedMarkup
  aggregate.teamDisplayName = variant.teamDisplayName
  aggregate.schoolDisplayName = variant.schoolDisplayName
  aggregate.caselistDisplayName = variant.caselistDisplayName
  aggregate.tournament = variant.tournament
  aggregate.round = variant.round
  aggregate.opponent = variant.opponent
  aggregate.judge = variant.judge
  aggregate.year = variant.year
  aggregate.level = variant.level
  aggregate.sourceArticleUrl = variant.sourceArticleUrl
  aggregate.sourcePageUrl = variant.sourcePageUrl
  aggregate.fileUrl = variant.fileUrl
  aggregate.canonicalQualityScore = variant.qualityScore
}

async function openCsvSource(source: string): Promise<CsvSource> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: {
        accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok || !response.body) {
      throw new Error(`Unable to download CSV source: ${response.status} ${response.statusText}`)
    }

    return {
      reference: source,
      stream: Readable.fromWeb(response.body as any),
      close: () => {},
    }
  }

  const stream = createReadStream(source)
  return {
    reference: source,
    stream,
    close: () => stream.destroy(),
  }
}

function sourceName(reference: string): string {
  try {
    if (/^https?:\/\//i.test(reference)) {
      return basename(new URL(reference).pathname) || 'evidence.csv'
    }
  } catch {
    return basename(reference) || 'evidence.csv'
  }

  return basename(reference) || 'evidence.csv'
}

function buildSourceLabel(references: string[]): string {
  if (references.length === 1) {
    return sourceName(references[0])
  }

  return `multi-source-${references.length}`
}

function detectSourceYear(reference: string): string {
  return reference.match(/evidence-(\d{4})\.csv/i)?.[1] || ''
}

export async function ingestEvidence(options: IngestEvidenceOptions = {}): Promise<IngestEvidenceResult> {
  const logger = options.logger || console
  const dbPath = resolveEvidenceDbPath(options.dbPath)
  const events = normalizeEvents(options.events)
  const sourceConfig = resolveSources(options)
  const db = createEvidenceDb(dbPath)

  resetEvidenceSchema(db)

  const clusters = new Map<string, ClusterAggregate>()
  let totalRows = 0
  let importedRows = 0
  let skippedRows = 0
  const importedByEventTotal = new Map<string, number>()
  const importedByYearEvent = new Map<string, number>()

  for (const source of sourceConfig.sources) {
    const sourceYear = detectSourceYear(source)
    const csvSource = await openCsvSource(source)
    const parser = csvSource.stream.pipe(
      parse({
        bom: true,
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: false,
      })
    )

    let importedFromSource = 0
    const importedByEvent = new Map<string, number>()

    try {
      for await (const rawRow of parser as AsyncIterable<CsvRow>) {
        totalRows += 1

        const normalized = normalizeCsvRow(rawRow, { events })
        if (normalized.kind === 'skip') {
          skippedRows += 1
          continue
        }

        const eventKey = normalized.card.event
        const cardYear = normalized.card.year || sourceYear || 'unknown'
        const yearEventKey = `${cardYear}:${eventKey}`
        const totalEventCount = importedByEventTotal.get(eventKey) || 0
        const currentYearEventCount = importedByYearEvent.get(yearEventKey) || 0

        if (options.limitPerEvent && totalEventCount >= options.limitPerEvent) {
          const allEventTargetsReached = events.every((event) => (importedByEventTotal.get(event) || 0) >= options.limitPerEvent!)
          if (allEventTargetsReached) {
            break
          }

          continue
        }

        if (options.limitPerEventPerSource) {
          const currentEventCount = importedByEvent.get(eventKey) || 0
          if (currentEventCount >= options.limitPerEventPerSource) {
            const allEventLimitsReached = events.every(
              (event) => (importedByEvent.get(event) || 0) >= options.limitPerEventPerSource!
            )
            if (allEventLimitsReached) {
              break
            }

            continue
          }
        }

        if (options.limitPerEventPerYear && currentYearEventCount >= options.limitPerEventPerYear) {
          const currentSourceYearTargetsReached =
            sourceYear &&
            events.every(
              (event) => (importedByYearEvent.get(`${sourceYear}:${event}`) || 0) >= options.limitPerEventPerYear!
            )

          if (currentSourceYearTargetsReached) {
            break
          }

          continue
        }

        const variant = buildPreparedVariant(normalized.card)
        const existing = clusters.get(variant.clusterKey)

        if (!existing) {
          clusters.set(variant.clusterKey, createAggregate(variant))
        } else {
          existing.variants.push(variant)
          existing.variantCount += 1
          existing.supportCount = Math.max(existing.supportCount, variant.duplicateCount, existing.variantCount)
          maybePromoteCanonical(existing, variant)
        }

        importedRows += 1
        importedFromSource += 1
        importedByEvent.set(eventKey, (importedByEvent.get(eventKey) || 0) + 1)
        importedByEventTotal.set(eventKey, totalEventCount + 1)
        importedByYearEvent.set(yearEventKey, currentYearEventCount + 1)

        if (options.limit && importedRows >= options.limit) {
          break
        }

        if (options.limitPerSource && importedFromSource >= options.limitPerSource) {
          break
        }
      }
    } finally {
      csvSource.close()
    }

    logger.log(
      `Processed ${sourceName(source)}: ${importedFromSource.toLocaleString()} rows imported, ${clusters.size.toLocaleString()} clusters so far`
    )

    if (options.limit && importedRows >= options.limit) {
      break
    }

    if (
      options.limitPerEvent &&
      events.every((event) => (importedByEventTotal.get(event) || 0) >= options.limitPerEvent!)
    ) {
      break
    }
  }

  const insertCluster = db.prepare(`
    INSERT INTO evidence_clusters (
      id,
      clusterKey,
      bucketId,
      event,
      hat,
      block,
      tag,
      cite,
      fullcite,
      summary,
      spoken,
      fulltext,
      markup,
      renderedMarkup,
      supportCount,
      variantCount,
      canonicalQualityScore,
      teamDisplayName,
      schoolDisplayName,
      caselistDisplayName,
      tournament,
      round,
      opponent,
      judge,
      year,
      level,
      sourceArticleUrl,
      sourcePageUrl,
      fileUrl
    ) VALUES (
      $id,
      $clusterKey,
      $bucketId,
      $event,
      $hat,
      $block,
      $tag,
      $cite,
      $fullcite,
      $summary,
      $spoken,
      $fulltext,
      $markup,
      $renderedMarkup,
      $supportCount,
      $variantCount,
      $canonicalQualityScore,
      $teamDisplayName,
      $schoolDisplayName,
      $caselistDisplayName,
      $tournament,
      $round,
      $opponent,
      $judge,
      $year,
      $level,
      $sourceArticleUrl,
      $sourcePageUrl,
      $fileUrl
    )
  `)

  const insertVariant = db.prepare(`
    INSERT INTO evidence_variants (
      id,
      clusterId,
      clusterKey,
      event,
      hat,
      block,
      tag,
      cite,
      fullcite,
      summary,
      spoken,
      fulltext,
      markup,
      renderedMarkup,
      duplicateCount,
      qualityScore,
      teamDisplayName,
      schoolDisplayName,
      caselistDisplayName,
      tournament,
      round,
      opponent,
      judge,
      year,
      level,
      sourceArticleUrl,
      sourcePageUrl,
      fileUrl
    ) VALUES (
      $id,
      $clusterId,
      $clusterKey,
      $event,
      $hat,
      $block,
      $tag,
      $cite,
      $fullcite,
      $summary,
      $spoken,
      $fulltext,
      $markup,
      $renderedMarkup,
      $duplicateCount,
      $qualityScore,
      $teamDisplayName,
      $schoolDisplayName,
      $caselistDisplayName,
      $tournament,
      $round,
      $opponent,
      $judge,
      $year,
      $level,
      $sourceArticleUrl,
      $sourcePageUrl,
      $fileUrl
    )
  `)

  const insertFts = db.prepare(`
    INSERT INTO evidence_clusters_fts (
      id,
      tag,
      cite,
      fullcite,
      summary,
      spoken,
      fulltext,
      block,
      hat
    ) VALUES (
      $id,
      $tag,
      $cite,
      $fullcite,
      $summary,
      $spoken,
      $fulltext,
      $block,
      $hat
    )
  `)

  const insertManifest = db.prepare(`
    INSERT INTO import_manifest (
      sourceName,
      sourceReference,
      sourceYearStart,
      sourceYearEnd,
      eventFilter,
      totalRows,
      importedRows,
      canonicalClusters,
      skippedRows,
      importedAt,
      filterSettings
    ) VALUES (
      $sourceName,
      $sourceReference,
      $sourceYearStart,
      $sourceYearEnd,
      $eventFilter,
      $totalRows,
      $importedRows,
      $canonicalClusters,
      $skippedRows,
      $importedAt,
      $filterSettings
    )
  `)

  db.exec('BEGIN')

  try {
    for (const cluster of clusters.values()) {
      cluster.variants.sort((left, right) => {
        if (right.qualityScore !== left.qualityScore) {
          return right.qualityScore - left.qualityScore
        }

        return right.duplicateCount - left.duplicateCount
      })

      insertCluster.run({
        id: cluster.id,
        clusterKey: cluster.clusterKey,
        bucketId: cluster.bucketId,
        event: cluster.event,
        hat: cluster.hat,
        block: cluster.block,
        tag: cluster.tag,
        cite: cluster.cite,
        fullcite: cluster.fullcite,
        summary: cluster.summary,
        spoken: cluster.spoken,
        fulltext: cluster.fulltext,
        markup: cluster.markup,
        renderedMarkup: cluster.renderedMarkup,
        supportCount: cluster.supportCount,
        variantCount: cluster.variantCount,
        canonicalQualityScore: cluster.canonicalQualityScore,
        teamDisplayName: cluster.teamDisplayName,
        schoolDisplayName: cluster.schoolDisplayName,
        caselistDisplayName: cluster.caselistDisplayName,
        tournament: cluster.tournament,
        round: cluster.round,
        opponent: cluster.opponent,
        judge: cluster.judge,
        year: cluster.year,
        level: cluster.level,
        sourceArticleUrl: cluster.sourceArticleUrl,
        sourcePageUrl: cluster.sourcePageUrl,
        fileUrl: cluster.fileUrl,
      })
      insertFts.run({
        id: cluster.id,
        tag: cluster.tag,
        cite: cluster.cite,
        fullcite: cluster.fullcite,
        summary: cluster.summary,
        spoken: cluster.spoken,
        fulltext: cluster.fulltext,
        block: cluster.block,
        hat: cluster.hat,
      })

      for (const variant of cluster.variants) {
        insertVariant.run({
          id: variant.id,
          clusterId: variant.clusterId,
          clusterKey: variant.clusterKey,
          event: variant.event,
          hat: variant.hat,
          block: variant.block,
          tag: variant.tag,
          cite: variant.cite,
          fullcite: variant.fullcite,
          summary: variant.summary,
          spoken: variant.spoken,
          fulltext: variant.fulltext,
          markup: variant.markup,
          renderedMarkup: variant.renderedMarkup,
          duplicateCount: variant.duplicateCount,
          qualityScore: variant.qualityScore,
          teamDisplayName: variant.teamDisplayName,
          schoolDisplayName: variant.schoolDisplayName,
          caselistDisplayName: variant.caselistDisplayName,
          tournament: variant.tournament,
          round: variant.round,
          opponent: variant.opponent,
          judge: variant.judge,
          year: variant.year,
          level: variant.level,
          sourceArticleUrl: variant.sourceArticleUrl,
          sourcePageUrl: variant.sourcePageUrl,
          fileUrl: variant.fileUrl,
        })
      }
    }

    const manifest: IngestEvidenceResult = {
      sourceName: buildSourceLabel(sourceConfig.sources),
      sourceReference: sourceConfig.sources.join(','),
      sourceYearStart: sourceConfig.yearStart,
      sourceYearEnd: sourceConfig.yearEnd,
      eventFilter: events.join(','),
      totalRows,
      importedRows,
      canonicalClusters: clusters.size,
      skippedRows,
      importedAt: new Date().toISOString(),
      filterSettings: JSON.stringify({
        sources: sourceConfig.sources,
        sourceYearStart: sourceConfig.yearStart,
        sourceYearEnd: sourceConfig.yearEnd,
        events,
        limit: options.limit || null,
        limitPerEvent: options.limitPerEvent || null,
        limitPerSource: options.limitPerSource || null,
        limitPerEventPerSource: options.limitPerEventPerSource || null,
        limitPerEventPerYear: options.limitPerEventPerYear || null,
        indexedFields: ['tag', 'cite', 'fullcite', 'summary', 'spoken', 'fulltext', 'block', 'hat'],
      }),
      dbPath,
    }

    insertManifest.run({
      sourceName: manifest.sourceName,
      sourceReference: manifest.sourceReference,
      sourceYearStart: manifest.sourceYearStart,
      sourceYearEnd: manifest.sourceYearEnd,
      eventFilter: manifest.eventFilter,
      totalRows: manifest.totalRows,
      importedRows: manifest.importedRows,
      canonicalClusters: manifest.canonicalClusters,
      skippedRows: manifest.skippedRows,
      importedAt: manifest.importedAt,
      filterSettings: manifest.filterSettings,
    })
    db.exec('COMMIT')
    db.exec('ANALYZE')
    db.close()

    logger.log(
      `Imported ${manifest.importedRows.toLocaleString()} rows into ${manifest.canonicalClusters.toLocaleString()} clusters at ${manifest.dbPath}`
    )

    return manifest
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }
}
