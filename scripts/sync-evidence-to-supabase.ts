import type { DatabaseSync } from 'node:sqlite'

import { createEvidenceDb, resolveEvidenceDbPath } from '../lib/evidence/db.ts'
import { embedEvidenceTexts } from '../lib/evidence/embeddings.ts'
import { getSupabaseServiceRoleClient } from '../lib/evidence/supabase.ts'

type SqlRow = Record<string, unknown>

const DEFAULT_BATCH_SIZE = 200
const EMBEDDING_BATCH_SIZE = 25

function readFlag(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return { raw: value }
  }
}

function readBatch(db: DatabaseSync, table: string, batchSize: number, offset: number): SqlRow[] {
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY id LIMIT $limit OFFSET $offset`)
    .all({
      limit: batchSize,
      offset,
    }) as SqlRow[]
}

function buildEmbeddingText(row: SqlRow): string {
  return [
    stringValue(row.tag),
    stringValue(row.fullcite) || stringValue(row.cite),
    stringValue(row.spoken),
    stringValue(row.summary),
    stringValue(row.fulltext).slice(0, 2_000),
    stringValue(row.block),
    stringValue(row.hat),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function mapClusterRow(row: SqlRow, embedding?: number[]): Record<string, unknown> {
  return {
    id: stringValue(row.id),
    cluster_key: stringValue(row.clusterKey),
    bucket_id: stringValue(row.bucketId),
    event: stringValue(row.event),
    hat: stringValue(row.hat),
    block: stringValue(row.block),
    tag: stringValue(row.tag),
    cite: stringValue(row.cite),
    fullcite: stringValue(row.fullcite),
    summary: stringValue(row.summary),
    spoken: stringValue(row.spoken),
    fulltext: stringValue(row.fulltext),
    markup: stringValue(row.markup),
    rendered_markup: stringValue(row.renderedMarkup),
    support_count: numberValue(row.supportCount),
    variant_count: numberValue(row.variantCount),
    canonical_quality_score: numberValue(row.canonicalQualityScore),
    team_display_name: stringValue(row.teamDisplayName),
    school_display_name: stringValue(row.schoolDisplayName),
    caselist_display_name: stringValue(row.caselistDisplayName),
    tournament: stringValue(row.tournament),
    round: stringValue(row.round),
    opponent: stringValue(row.opponent),
    judge: stringValue(row.judge),
    year: stringValue(row.year),
    level: stringValue(row.level),
    source_article_url: stringValue(row.sourceArticleUrl),
    source_page_url: stringValue(row.sourcePageUrl),
    file_url: stringValue(row.fileUrl),
    ...(embedding ? { embedding } : {}),
  }
}

function mapVariantRow(row: SqlRow): Record<string, unknown> {
  return {
    id: stringValue(row.id),
    cluster_id: stringValue(row.clusterId),
    cluster_key: stringValue(row.clusterKey),
    event: stringValue(row.event),
    hat: stringValue(row.hat),
    block: stringValue(row.block),
    tag: stringValue(row.tag),
    cite: stringValue(row.cite),
    fullcite: stringValue(row.fullcite),
    summary: stringValue(row.summary),
    spoken: stringValue(row.spoken),
    fulltext: stringValue(row.fulltext),
    markup: stringValue(row.markup),
    rendered_markup: stringValue(row.renderedMarkup),
    duplicate_count: numberValue(row.duplicateCount),
    quality_score: numberValue(row.qualityScore),
    team_display_name: stringValue(row.teamDisplayName),
    school_display_name: stringValue(row.schoolDisplayName),
    caselist_display_name: stringValue(row.caselistDisplayName),
    tournament: stringValue(row.tournament),
    round: stringValue(row.round),
    opponent: stringValue(row.opponent),
    judge: stringValue(row.judge),
    year: stringValue(row.year),
    level: stringValue(row.level),
    source_article_url: stringValue(row.sourceArticleUrl),
    source_page_url: stringValue(row.sourcePageUrl),
    file_url: stringValue(row.fileUrl),
  }
}

function mapManifestRow(row: SqlRow): Record<string, unknown> {
  return {
    source_name: stringValue(row.sourceName),
    source_reference: stringValue(row.sourceReference),
    source_year_start: stringValue(row.sourceYearStart),
    source_year_end: stringValue(row.sourceYearEnd),
    event_filter: stringValue(row.eventFilter),
    total_rows: numberValue(row.totalRows),
    imported_rows: numberValue(row.importedRows),
    canonical_clusters: numberValue(row.canonicalClusters),
    skipped_rows: numberValue(row.skippedRows),
    imported_at: stringValue(row.importedAt),
    filter_settings: parseJson(stringValue(row.filterSettings)),
  }
}

async function deleteRemoteEvidenceData(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient()

  const deleteVariants = await supabase.from('evidence_variants').delete().gte('quality_score', 0)
  if (deleteVariants.error) {
    throw new Error(`Unable to clear evidence_variants: ${deleteVariants.error.message}`)
  }

  const deleteClusters = await supabase.from('evidence_clusters').delete().gte('support_count', 0)
  if (deleteClusters.error) {
    throw new Error(`Unable to clear evidence_clusters: ${deleteClusters.error.message}`)
  }
}

async function uploadClusters(
  db: DatabaseSync,
  batchSize: number,
  withEmbeddings: boolean
): Promise<number> {
  const supabase = getSupabaseServiceRoleClient()
  let offset = 0
  let uploaded = 0

  for (;;) {
    const batch = readBatch(db, 'evidence_clusters', batchSize, offset)
    if (batch.length === 0) {
      break
    }

    let embeddings: number[][] = []
    if (withEmbeddings) {
      embeddings = []
      for (let index = 0; index < batch.length; index += EMBEDDING_BATCH_SIZE) {
        const chunk = batch.slice(index, index + EMBEDDING_BATCH_SIZE)
        const chunkEmbeddings = await embedEvidenceTexts(chunk.map((row) => buildEmbeddingText(row)))
        embeddings.push(...chunkEmbeddings)
      }
    }

    const payload = batch.map((row, index) => mapClusterRow(row, embeddings[index]))
    const { error } = await supabase.from('evidence_clusters').upsert(payload, {
      onConflict: 'id',
      ignoreDuplicates: false,
      defaultToNull: false,
    })

    if (error) {
      throw new Error(`Supabase cluster sync failed: ${error.message}`)
    }

    uploaded += payload.length
    offset += batch.length
    console.log(`Synced ${uploaded.toLocaleString()} evidence clusters`)
  }

  return uploaded
}

async function uploadVariants(db: DatabaseSync, batchSize: number): Promise<number> {
  const supabase = getSupabaseServiceRoleClient()
  let offset = 0
  let uploaded = 0

  for (;;) {
    const batch = readBatch(db, 'evidence_variants', batchSize, offset)
    if (batch.length === 0) {
      break
    }

    const payload = batch.map((row) => mapVariantRow(row))
    const { error } = await supabase.from('evidence_variants').upsert(payload, {
      onConflict: 'id',
      ignoreDuplicates: false,
      defaultToNull: false,
    })

    if (error) {
      throw new Error(`Supabase variant sync failed: ${error.message}`)
    }

    uploaded += payload.length
    offset += batch.length
    console.log(`Synced ${uploaded.toLocaleString()} evidence variants`)
  }

  return uploaded
}

async function uploadManifest(db: DatabaseSync): Promise<void> {
  const supabase = getSupabaseServiceRoleClient()
  const manifest = db.prepare(`SELECT * FROM import_manifest ORDER BY importedAt DESC LIMIT 1`).get() as SqlRow | undefined

  if (!manifest) {
    return
  }

  const { error } = await supabase.from('evidence_import_manifests').insert(mapManifestRow(manifest))
  if (error) {
    throw new Error(`Supabase manifest sync failed: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const dbPath = resolveEvidenceDbPath(readFlag('db'))
  const batchSizeFlag = readFlag('batch-size')
  const batchSize = batchSizeFlag ? Number.parseInt(batchSizeFlag, 10) : DEFAULT_BATCH_SIZE
  const replace = hasFlag('replace')
  const withEmbeddings = hasFlag('with-embeddings')

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error(`Invalid --batch-size value: ${batchSizeFlag}`)
  }

  const db = createEvidenceDb(dbPath)

  try {
    if (replace) {
      console.log('Clearing remote evidence tables')
      await deleteRemoteEvidenceData()
    }

    const clusterCount = await uploadClusters(db, batchSize, withEmbeddings)
    const variantCount = await uploadVariants(db, batchSize)
    await uploadManifest(db)

    console.log(
      JSON.stringify(
        {
          dbPath,
          replace,
          withEmbeddings,
          clusterCount,
          variantCount,
        },
        null,
        2
      )
    )
  } finally {
    db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
