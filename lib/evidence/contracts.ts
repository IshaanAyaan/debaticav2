export type SearchSort = 'relevance' | 'support' | 'recent'

export type SearchMode = 'exact' | 'closest'

export type EvidenceTextView = 'spoken' | 'summary' | 'full'

export type EvidenceCardKind = 'cluster' | 'variant'

export interface CardFilterState {
  event: string
}

export interface EvidenceCardRecord {
  id: string
  tag: string
  cite: string
  fullcite: string
  summary: string
  spoken: string
  fulltext: string
  markup: string
  hat: string
  block: string
  bucketId: string
  duplicateCount: number
  teamDisplayName: string
  schoolDisplayName: string
  caselistDisplayName: string
  tournament: string
  round: string
  opponent: string
  judge: string
  year: string
  event: string
  level: string
  filePath: string
  opensourcePath: string
}

export interface EvidenceVariantSummary {
  id: string
  clusterId: string
  kind: EvidenceCardKind
  tag: string
  fullcite: string
  snippet: string
  event: string
  year: string
  duplicateCount: number
  schoolDisplayName: string
  teamDisplayName: string
  tournament: string
  round: string
  sourceArticleUrl: string | null
  sourcePageUrl: string | null
  fileUrl: string | null
  primaryLinkUrl: string | null
}

export interface EvidenceCardSummary {
  id: string
  tag: string
  cite: string
  fullcite: string
  snippet: string
  event: string
  hat: string
  block: string
  year: string
  supportCount: number
  variantCount: number
  schoolDisplayName: string
  teamDisplayName: string
  tournament: string
  round: string
  score?: number
  sourceArticleUrl: string | null
  sourcePageUrl: string | null
  fileUrl: string | null
  primaryLinkUrl: string | null
}

export interface EvidenceCardDetail extends EvidenceCardSummary {
  kind: EvidenceCardKind
  clusterId: string
  summary: string
  spoken: string
  fulltext: string
  markup: string
  renderedMarkup: string
  copyText: string
  preferredText: string
  availableViews: EvidenceTextView[]
  variantsPreview: EvidenceVariantSummary[]
}

export interface FilterOption {
  value: string
  count: number
}

export interface ImportManifest {
  sourceName: string
  sourceReference: string
  sourceYearStart: string
  sourceYearEnd: string
  eventFilter: string
  totalRows: number
  importedRows: number
  canonicalClusters: number
  skippedRows: number
  importedAt: string
  filterSettings: string
}

export interface SearchMetaResponse {
  status: 'ready' | 'missing'
  scopeLabel: string
  manifest: ImportManifest | null
  topEvents: FilterOption[]
  totalClusters: number
  totalVariants: number
  message?: string
}

export interface SearchResponse {
  query: string
  mode: SearchMode
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  sort: SearchSort
  filters: CardFilterState
  results: EvidenceCardSummary[]
}

export interface CardSearchParams extends CardFilterState {
  q?: string
  page?: number
  pageSize?: number
  sort?: SearchSort
}
