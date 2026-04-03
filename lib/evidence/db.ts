import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class EvidenceDatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvidenceDatabaseUnavailableError'
  }
}

const DEFAULT_DB_FILE = 'evidence-index.sqlite'
const DEFAULT_VERCEL_RUNTIME_DIR = '/tmp/debatica'

let cachedDb: DatabaseSync | null = null
let cachedDbPath: string | null = null

export function resolveEvidenceDataDir(): string {
  return path.join(process.cwd(), 'data')
}

export function resolveEvidenceDbPath(dbPath?: string): string {
  return dbPath || process.env.EVIDENCE_DB_PATH || path.join(resolveEvidenceDataDir(), DEFAULT_DB_FILE)
}

export function resolveEvidenceRuntimeDir(): string {
  return process.env.EVIDENCE_RUNTIME_DIR || DEFAULT_VERCEL_RUNTIME_DIR
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1'
}

function resolveRuntimeEvidenceDbPath(sourcePath: string): string {
  return path.join(resolveEvidenceRuntimeDir(), path.basename(sourcePath))
}

export function ensureEvidenceDataDir(): string {
  const dataDir = resolveEvidenceDataDir()
  mkdirSync(dataDir, { recursive: true })
  return dataDir
}

function configureLocalDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `)
}

function configureRuntimeDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA busy_timeout = 5000;
  `)
}

function openDatabaseConnection(resolvedPath: string, mode: 'local' | 'runtime'): DatabaseSync {
  const db = new DatabaseSync(resolvedPath, {
    enableForeignKeyConstraints: true,
  })

  if (mode === 'runtime') {
    configureRuntimeDatabase(db)
  } else {
    configureLocalDatabase(db)
  }

  return db
}

function removeRuntimeTempFile(tempPath: string): void {
  try {
    rmSync(tempPath, { force: true })
  } catch {
    // best effort cleanup only
  }
}

function ensureRuntimeEvidenceDb(sourcePath: string): string {
  if (!existsSync(sourcePath)) {
    throw new EvidenceDatabaseUnavailableError(
      `Bundled evidence database not found at ${sourcePath}. Ensure the deployment includes data/evidence-index.sqlite.`
    )
  }

  const runtimeDir = resolveEvidenceRuntimeDir()
  const runtimePath = resolveRuntimeEvidenceDbPath(sourcePath)
  mkdirSync(runtimeDir, { recursive: true })

  let shouldCopy = !existsSync(runtimePath)

  if (!shouldCopy) {
    try {
      const sourceStat = statSync(sourcePath)
      const runtimeStat = statSync(runtimePath)
      shouldCopy = sourceStat.size !== runtimeStat.size || sourceStat.mtimeMs > runtimeStat.mtimeMs
    } catch {
      shouldCopy = true
    }
  }

  if (shouldCopy) {
    const tempPath = `${runtimePath}.${process.pid}.${Date.now()}.tmp`

    try {
      copyFileSync(sourcePath, tempPath)
      renameSync(tempPath, runtimePath)
      console.info(`[evidence-db] copied bundled database to runtime path ${runtimePath}`)
    } catch (error) {
      removeRuntimeTempFile(tempPath)
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[evidence-db] failed to prepare runtime database at ${runtimePath}: ${message}`)
      throw new EvidenceDatabaseUnavailableError(
        `Unable to prepare runtime evidence database at ${runtimePath}: ${message}`
      )
    }
  }

  return runtimePath
}

export function createEvidenceDb(dbPath?: string): DatabaseSync {
  const resolvedPath = resolveEvidenceDbPath(dbPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  return openDatabaseConnection(resolvedPath, 'local')
}

export function getEvidenceDb(): DatabaseSync {
  const sourcePath = resolveEvidenceDbPath()
  const resolvedPath = isVercelRuntime() ? ensureRuntimeEvidenceDb(sourcePath) : sourcePath

  if (!existsSync(sourcePath)) {
    throw new EvidenceDatabaseUnavailableError(
      `Evidence database not found at ${sourcePath}. Run npm run ingest:evidence:demo or npm run ingest:evidence first.`
    )
  }

  if (cachedDb && cachedDbPath === resolvedPath) {
    return cachedDb
  }

  if (cachedDb) {
    cachedDb.close()
  }

  try {
    cachedDb = openDatabaseConnection(resolvedPath, isVercelRuntime() ? 'runtime' : 'local')
    cachedDbPath = resolvedPath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[evidence-db] failed to open database at ${resolvedPath}: ${message}`)
    throw new EvidenceDatabaseUnavailableError(`Unable to open evidence database at ${resolvedPath}: ${message}`)
  }

  if (isVercelRuntime()) {
    console.info(`[evidence-db] using runtime database at ${resolvedPath}`)
  }

  return cachedDb
}

export function closeEvidenceDb(): void {
  if (!cachedDb) {
    return
  }

  cachedDb.close()
  cachedDb = null
  cachedDbPath = null
}

export function resetEvidenceSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS evidence_clusters_fts;
    DROP TABLE IF EXISTS import_manifest;
    DROP TABLE IF EXISTS evidence_variants;
    DROP TABLE IF EXISTS evidence_clusters;

    CREATE TABLE evidence_clusters (
      id TEXT PRIMARY KEY,
      clusterKey TEXT NOT NULL UNIQUE,
      bucketId TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL DEFAULT '',
      hat TEXT NOT NULL DEFAULT '',
      block TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      cite TEXT NOT NULL DEFAULT '',
      fullcite TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      spoken TEXT NOT NULL DEFAULT '',
      fulltext TEXT NOT NULL DEFAULT '',
      markup TEXT NOT NULL DEFAULT '',
      renderedMarkup TEXT NOT NULL DEFAULT '',
      supportCount INTEGER NOT NULL DEFAULT 0,
      variantCount INTEGER NOT NULL DEFAULT 0,
      canonicalQualityScore INTEGER NOT NULL DEFAULT 0,
      teamDisplayName TEXT NOT NULL DEFAULT '',
      schoolDisplayName TEXT NOT NULL DEFAULT '',
      caselistDisplayName TEXT NOT NULL DEFAULT '',
      tournament TEXT NOT NULL DEFAULT '',
      round TEXT NOT NULL DEFAULT '',
      opponent TEXT NOT NULL DEFAULT '',
      judge TEXT NOT NULL DEFAULT '',
      year TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      sourceArticleUrl TEXT NOT NULL DEFAULT '',
      sourcePageUrl TEXT NOT NULL DEFAULT '',
      fileUrl TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE evidence_variants (
      id TEXT PRIMARY KEY,
      clusterId TEXT NOT NULL REFERENCES evidence_clusters(id) ON DELETE CASCADE,
      clusterKey TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT '',
      hat TEXT NOT NULL DEFAULT '',
      block TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      cite TEXT NOT NULL DEFAULT '',
      fullcite TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      spoken TEXT NOT NULL DEFAULT '',
      fulltext TEXT NOT NULL DEFAULT '',
      markup TEXT NOT NULL DEFAULT '',
      renderedMarkup TEXT NOT NULL DEFAULT '',
      duplicateCount INTEGER NOT NULL DEFAULT 0,
      qualityScore INTEGER NOT NULL DEFAULT 0,
      teamDisplayName TEXT NOT NULL DEFAULT '',
      schoolDisplayName TEXT NOT NULL DEFAULT '',
      caselistDisplayName TEXT NOT NULL DEFAULT '',
      tournament TEXT NOT NULL DEFAULT '',
      round TEXT NOT NULL DEFAULT '',
      opponent TEXT NOT NULL DEFAULT '',
      judge TEXT NOT NULL DEFAULT '',
      year TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      sourceArticleUrl TEXT NOT NULL DEFAULT '',
      sourcePageUrl TEXT NOT NULL DEFAULT '',
      fileUrl TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE import_manifest (
      sourceName TEXT NOT NULL,
      sourceReference TEXT NOT NULL,
      sourceYearStart TEXT NOT NULL,
      sourceYearEnd TEXT NOT NULL,
      eventFilter TEXT NOT NULL,
      totalRows INTEGER NOT NULL,
      importedRows INTEGER NOT NULL,
      canonicalClusters INTEGER NOT NULL,
      skippedRows INTEGER NOT NULL,
      importedAt TEXT NOT NULL,
      filterSettings TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE evidence_clusters_fts USING fts5(
      id UNINDEXED,
      tag,
      cite,
      fullcite,
      summary,
      spoken,
      fulltext,
      block,
      hat,
      tokenize = 'porter unicode61 remove_diacritics 2'
    );

    CREATE INDEX idx_clusters_event ON evidence_clusters(event);
    CREATE INDEX idx_clusters_bucket ON evidence_clusters(bucketId);
    CREATE INDEX idx_clusters_support ON evidence_clusters(supportCount DESC);
    CREATE INDEX idx_clusters_year ON evidence_clusters(year);
    CREATE INDEX idx_variants_cluster ON evidence_variants(clusterId);
    CREATE INDEX idx_variants_quality ON evidence_variants(clusterId, qualityScore DESC, duplicateCount DESC, year DESC);
  `)
}
