import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { closeEvidenceDb } from '../lib/evidence/db.ts'
import { ingestEvidence, normalizeCsvRow } from '../lib/evidence/ingest.ts'
import { getCardById, getCardVariants, getSearchMeta, searchCards } from '../lib/evidence/query.ts'
import { getSearchMeta as getSearchMetaFromService, searchCards as searchCardsFromService } from '../lib/evidence/search-service.ts'
import { getEvidenceProviderMode } from '../lib/evidence/supabase.ts'
import { formatCardCopy, getPreferredEvidenceText, pickSourceArticleUrl, sanitizeEvidenceMarkup } from '../lib/evidence/text.ts'

const FIXTURE_PATH = path.join(process.cwd(), 'fixtures', 'evidence-sample.csv')
const SAMPLE_CSV = readFileSync(FIXTURE_PATH, 'utf8')

test('ingest builds clustered multi-event evidence search', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'debatica-evidence-'))
  const csvPath = path.join(tempDir, 'evidence-sample.csv')
  const dbPath = path.join(tempDir, 'evidence.sqlite')
  const originalDbPath = process.env.EVIDENCE_DB_PATH

  writeFileSync(csvPath, SAMPLE_CSV, 'utf8')
  process.env.EVIDENCE_DB_PATH = dbPath

  t.after(() => {
    closeEvidenceDb()

    if (originalDbPath) {
      process.env.EVIDENCE_DB_PATH = originalDbPath
    } else {
      delete process.env.EVIDENCE_DB_PATH
    }

    rmSync(tempDir, { recursive: true, force: true })
  })

  const manifest = await ingestEvidence({
    source: csvPath,
    dbPath,
    logger: {
      log() {},
      error() {},
    },
  })

  assert.equal(manifest.importedRows, 39)
  assert.equal(manifest.skippedRows, 1)
  assert.equal(manifest.canonicalClusters, 23)
  assert.equal(manifest.eventFilter, 'policy,ld,pf,bq')

  const policyWarQuery = searchCards({ q: 'US China war', page: 1, pageSize: 10, event: '' })
  assert.equal(policyWarQuery.results[0]?.tag, 'No U.S.-China war now')
  assert.ok(policyWarQuery.results.length >= 5)

  const policyQuery = searchCards({ q: 'courts', page: 1, pageSize: 10, event: 'policy' })
  assert.equal(policyQuery.results[0]?.tag, 'Courts solve warming now')
  assert.ok(policyQuery.results.length >= 3)

  const ldQuery = searchCards({ q: 'deterrence', page: 1, pageSize: 10, event: 'ld' })
  assert.equal(ldQuery.results[0]?.tag, 'Deterrence prevents great power war')
  assert.ok(ldQuery.results.length >= 3)

  const pfQuery = searchCards({ q: 'cryptocurrency', page: 1, pageSize: 10, event: 'pf' })
  assert.equal(pfQuery.results[0]?.tag, 'Cryptocurrency expands financial inclusion')
  assert.ok(pfQuery.results.length >= 3)

  const bqQuery = searchCards({ q: 'community service', page: 1, pageSize: 10, event: 'bq' })
  assert.equal(bqQuery.results[0]?.tag, 'Community service should be required for graduation')
  assert.ok(bqQuery.results.length >= 3)

  const detail = getCardById(policyQuery.results[0]!.id)
  assert.ok(detail)
  assert.match(detail?.renderedMarkup || '', /<mark>/)
  assert.equal(detail?.sourceArticleUrl, 'https://example.com/courts-warming')
  assert.equal(detail?.sourcePageUrl, 'https://opencaselist.com/wiki/1')
  assert.equal(detail?.fileUrl, 'https://opencaselist.com/files/1')
  assert.match(detail?.copyText || '', /Courts solve warming now/)

  const variants = getCardVariants(policyWarQuery.results[0]!.id, 6)
  assert.equal(variants[0]?.kind, 'variant')
  assert.equal(variants[0]?.tag, 'China and the U.S. remain far from major war')

  const variantDetail = getCardById(variants[0]!.id)
  assert.ok(variantDetail)
  assert.equal(variantDetail?.kind, 'variant')
  assert.equal(variantDetail?.clusterId, policyWarQuery.results[0]!.id)
  assert.equal(variantDetail?.tag, 'China and the U.S. remain far from major war')

  const variantAlternates = getCardVariants(variants[0]!.id, 6)
  assert.equal(variantAlternates[0]?.kind, 'cluster')
  assert.equal(variantAlternates[0]?.id, policyWarQuery.results[0]!.id)

  const meta = getSearchMeta()
  assert.equal(meta.status, 'ready')
  assert.equal(meta.totalClusters, 23)
  assert.equal(meta.totalVariants, 39)
})

test('normalization, markup sanitization, and copy formatting work for card rendering', () => {
  const valid = normalizeCsvRow({
    id: '10',
    tag: '<p>Courts solve now</p>',
    cite: 'Smith 22',
    summary: 'Summary text',
    spoken: 'Spoken text',
    fulltext: 'Full text',
    markup: '<p onclick="alert(1)">Marked <mark>text</mark></p>',
    event: 'policy',
  })

  assert.equal(valid.kind, 'card')
  if (valid.kind === 'card') {
    assert.equal(valid.card.tag, 'Courts solve now')
    assert.equal(getPreferredEvidenceText(valid.card, 'spoken'), 'Spoken text')
    assert.equal(sanitizeEvidenceMarkup(valid.card.markup, valid.card.fulltext), '<p>Marked <mark>text</mark></p>')
    assert.match(
      formatCardCopy(
        {
          id: 'cluster-1',
          kind: 'cluster',
          clusterId: 'cluster-1',
          tag: valid.card.tag,
          cite: valid.card.cite,
          fullcite: valid.card.cite,
          snippet: 'Snippet',
          event: 'policy',
          hat: '',
          block: '',
          year: '2022',
          supportCount: 1,
          variantCount: 1,
          schoolDisplayName: '',
          teamDisplayName: '',
          tournament: '',
          round: '',
          sourceArticleUrl: null,
          sourcePageUrl: null,
          fileUrl: null,
          primaryLinkUrl: null,
          summary: valid.card.summary,
          spoken: valid.card.spoken,
          fulltext: valid.card.fulltext,
          markup: valid.card.markup,
          renderedMarkup: '<p>Marked <mark>text</mark></p>',
          copyText: '',
          preferredText: '',
          availableViews: ['spoken'],
          variantsPreview: [],
        },
        'spoken'
      ),
      /Spoken text/
    )
  }

  const skippedEvent = normalizeCsvRow({
    id: '11',
    tag: 'Skip',
    event: 'cx',
  })
  assert.deepEqual(skippedEvent, { kind: 'skip', reason: 'unsupported-event' })

  const skippedEmpty = normalizeCsvRow({
    id: '12',
    event: 'policy',
  })
  assert.deepEqual(skippedEmpty, { kind: 'skip', reason: 'empty-searchable-text' })

  assert.equal(
    pickSourceArticleUrl('See https://example.com/report.pdf] for more detail.'),
    'https://example.com/report.pdf'
  )
})

test('search service defaults to sqlite for demo mode even when supabase env vars are present', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'debatica-evidence-provider-'))
  const csvPath = path.join(tempDir, 'evidence-sample.csv')
  const dbPath = path.join(tempDir, 'evidence.sqlite')
  const originalDbPath = process.env.EVIDENCE_DB_PATH
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const originalProvider = process.env.EVIDENCE_PROVIDER
  const originalFetch = globalThis.fetch

  writeFileSync(csvPath, SAMPLE_CSV, 'utf8')
  process.env.EVIDENCE_DB_PATH = dbPath
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.invalid.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'demo-service-role'
  delete process.env.EVIDENCE_PROVIDER

  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    throw new Error('hosted provider should not be touched in default demo mode')
  }) as typeof fetch

  t.after(() => {
    closeEvidenceDb()

    if (originalDbPath) {
      process.env.EVIDENCE_DB_PATH = originalDbPath
    } else {
      delete process.env.EVIDENCE_DB_PATH
    }

    if (originalSupabaseUrl) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    }

    if (originalServiceRole) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole
    } else {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }

    if (originalProvider) {
      process.env.EVIDENCE_PROVIDER = originalProvider
    } else {
      delete process.env.EVIDENCE_PROVIDER
    }

    globalThis.fetch = originalFetch
    rmSync(tempDir, { recursive: true, force: true })
  })

  await ingestEvidence({
    source: csvPath,
    dbPath,
    logger: {
      log() {},
      error() {},
    },
  })

  assert.equal(getEvidenceProviderMode(), 'sqlite')

  const meta = await getSearchMetaFromService()
  const search = await searchCardsFromService({ q: 'courts', page: 1, pageSize: 5, event: '' })

  assert.equal(meta.status, 'ready')
  assert.equal(search.results[0]?.tag, 'Courts solve warming now')
  assert.equal(fetchCalled, false)
})
