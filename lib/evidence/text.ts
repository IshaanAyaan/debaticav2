import type {
  EvidenceCardDetail,
  EvidenceCardRecord,
  EvidenceCardSummary,
  EvidenceTextView,
  EvidenceVariantSummary,
} from './contracts.ts'

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  quot: '"',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: '-',
  mdash: '-',
  hellip: '...',
}

const OPEN_CASELIST_BASE_URL = 'https://opencaselist.com'
const ALLOWED_MARKUP_TAGS = new Set(['p', 'br', 'mark', 'strong', 'em', 'b', 'i', 'u', 'blockquote'])

function sanitizeUrlCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[([{"'`]+/g, '')
    .replace(/[\])}"'`]+$/g, '')
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity in HTML_ENTITY_MAP) {
      return HTML_ENTITY_MAP[entity]
    }

    if (entity.startsWith('#x')) {
      const codePoint = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    return match
  })
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|section|article|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

export function normalizeEvidenceText(value: string): string {
  if (!value) {
    return ''
  }

  return normalizeWhitespace(decodeHtmlEntities(stripHtml(value)))
}

export function normalizeFilterToken(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

export function buildFtsQuery(input: string, operator: 'AND' | 'OR' = 'AND'): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  if (tokens.length === 0) {
    return ''
  }

  return tokens.map((token) => `${token}*`).join(` ${operator} `)
}

export function tokenizeSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

export function truncateText(value: string, maxLength = 220): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

export function pickSnippet(card: Pick<EvidenceCardRecord, 'spoken' | 'summary' | 'fulltext'>): string {
  const source = card.spoken || card.summary || card.fulltext
  return truncateText(source, 240)
}

export function getAvailableViews(
  card: Pick<EvidenceCardRecord, 'spoken' | 'summary' | 'fulltext'>
): EvidenceTextView[] {
  const views: EvidenceTextView[] = []

  if (card.spoken) {
    views.push('spoken')
  }
  if (card.summary) {
    views.push('summary')
  }
  if (card.fulltext) {
    views.push('full')
  }

  return views.length > 0 ? views : ['summary']
}

export function getPreferredEvidenceText(
  card: Pick<EvidenceCardRecord, 'spoken' | 'summary' | 'fulltext'>,
  preferredView?: EvidenceTextView
): string {
  if (preferredView === 'spoken' && card.spoken) {
    return card.spoken
  }
  if (preferredView === 'summary' && card.summary) {
    return card.summary
  }
  if (preferredView === 'full' && card.fulltext) {
    return card.fulltext
  }

  return card.spoken || card.summary || card.fulltext
}

export function renderMarkupFromText(value: string): string {
  const cleaned = normalizeWhitespace(value)
  if (!cleaned) {
    return '<p>No evidence text is available for this card.</p>'
  }

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export function sanitizeEvidenceMarkup(value: string, fallbackText = ''): string {
  const rawMarkup = (value || '').trim()
  if (!rawMarkup) {
    return renderMarkupFromText(fallbackText)
  }

  const withoutScripts = rawMarkup
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\sstyle\s*=\s*(['"]).*?\1/gi, '')

  const sanitized = withoutScripts.replace(/<\/?([a-z0-9-]+)(\s[^>]*)?>/gi, (match, tagName) => {
    const normalizedTag = String(tagName || '').toLowerCase()
    if (!ALLOWED_MARKUP_TAGS.has(normalizedTag)) {
      return ''
    }

    return match.startsWith('</') ? `</${normalizedTag}>` : `<${normalizedTag}>`
  })

  const normalized = sanitized.trim()
  return normalized ? normalized : renderMarkupFromText(fallbackText)
}

export function extractExternalUrls(...values: string[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  const pattern = /https?:\/\/[^\s"'<>)]*[^\s"'<>).,;:]/gi

  for (const value of values) {
    const matches = value.match(pattern) || []
    for (const match of matches) {
      const sanitized = sanitizeUrlCandidate(match)

      if (!sanitized || seen.has(sanitized)) {
        continue
      }

      seen.add(sanitized)
      urls.push(sanitized)
    }
  }

  return urls
}

export function resolveOpenCaselistUrl(value: string): string | null {
  if (!value) {
    return null
  }

  const sanitized = sanitizeUrlCandidate(value)

  if (/^https?:\/\//i.test(sanitized)) {
    return sanitized
  }

  if (sanitized.startsWith('/')) {
    return `${OPEN_CASELIST_BASE_URL}${sanitized}`
  }

  return `${OPEN_CASELIST_BASE_URL}/${sanitized}`
}

export function pickSourceArticleUrl(...values: string[]): string | null {
  const urls = extractExternalUrls(...values)
  return urls.find((url) => !url.startsWith(OPEN_CASELIST_BASE_URL)) || null
}

export function resolvePrimaryLinkUrl(options: {
  sourceArticleUrl: string | null
  sourcePageUrl: string | null
  fileUrl: string | null
}): string | null {
  return options.sourceArticleUrl || options.sourcePageUrl || options.fileUrl || null
}

export function formatCardCopy(card: EvidenceCardDetail, preferredView?: EvidenceTextView): string {
  return [card.tag, card.fullcite || card.cite, getPreferredEvidenceText(card, preferredView)]
    .filter(Boolean)
    .join('\n\n')
}

export function formatEventLabel(event: string): string {
  const normalized = normalizeFilterToken(event)

  if (!normalized) {
    return 'Open'
  }
  if (normalized === 'ld' || normalized === 'pf' || normalized === 'bq') {
    return normalized.toUpperCase()
  }

  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`
}

export function formatSupportLabel(supportCount: number, variantCount: number): string {
  const support = supportCount.toLocaleString()
  const variants = variantCount.toLocaleString()
  return `${support} supporting cuts · ${variants} variants`
}

export function formatMetaLine(
  card: Pick<
    EvidenceCardSummary | EvidenceVariantSummary,
    'event' | 'schoolDisplayName' | 'teamDisplayName' | 'tournament' | 'round' | 'year'
  >
): string {
  return [
    formatEventLabel(card.event),
    [card.schoolDisplayName, card.teamDisplayName].filter(Boolean).join(' · '),
    [card.tournament, card.round].filter(Boolean).join(' · '),
    card.year,
  ]
    .filter(Boolean)
    .join('   ')
}
