'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, FileText, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'

import type {
  EvidenceCardDetail,
  EvidenceCardSummary,
  EvidenceTextView,
  EvidenceVariantSummary,
  SearchMetaResponse,
  SearchResponse,
} from '@/lib/evidence/contracts'
import {
  formatCardCopy,
  formatEventLabel,
  formatMetaLine,
  formatSupportLabel,
  getPreferredEvidenceText,
} from '@/lib/evidence/text'

const VIEW_LABELS: Record<EvidenceTextView, string> = {
  spoken: 'Spoken',
  summary: 'Summary',
  full: 'Full',
}

async function readResponsePayload<T>(response: Response): Promise<T | { error?: string }> {
  const body = await response.text()

  if (!body) {
    return {} as T
  }

  try {
    return JSON.parse(body) as T | { error?: string }
  } catch {
    throw new Error(response.ok ? 'Received an invalid server response.' : 'The server returned an unreadable error.')
  }
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-semibold">Evidence index not built yet</div>
      <p className="mt-1 text-amber-800">{message}</p>
      <div className="mt-3 rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-50">
        npm run ingest:evidence:demo
      </div>
    </div>
  )
}

function ResultCard({
  card,
  selected,
  onSelect,
}: {
  card: EvidenceCardSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
        selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              {formatEventLabel(card.event)}
            </span>
            {card.block ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{card.block}</span>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-6 text-slate-900">{card.tag}</h3>
        </div>
        <div className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
          {card.supportCount}
        </div>
      </div>

      <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{card.fullcite || card.cite}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{card.snippet}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{formatMetaLine(card)}</p>
    </button>
  )
}

function Placeholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-slate-500">
      <div>
        <div className="text-xl font-medium text-slate-600">{title}</div>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function VariantItem({
  item,
  onSelect,
}: {
  item: EvidenceVariantSummary
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{item.tag}</div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {item.kind === 'cluster' ? 'Main cut' : 'Alt cut'}
        </span>
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{item.fullcite}</div>
    </button>
  )
}

function linkLabel(detail: EvidenceCardDetail): string {
  return detail.sourceArticleUrl ? 'Open source article' : 'Open source page'
}

export default function EvidenceFinderPage() {
  const [inputQuery, setInputQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const [meta, setMeta] = useState<SearchMetaResponse | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<EvidenceCardDetail | null>(null)
  const [variants, setVariants] = useState<EvidenceVariantSummary[]>([])
  const [detailError, setDetailError] = useState<string | null>(null)
  const [textView, setTextView] = useState<EvidenceTextView>('spoken')
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch('/api/search/meta', { signal: controller.signal })
        const payload = await readResponsePayload<SearchMetaResponse>(response)

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error || 'Unable to load metadata' : 'Unable to load metadata')
        }

        setMeta(payload as SearchMetaResponse)
        setMetaError(null)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setMetaError(error instanceof Error ? error.message : 'Unable to load metadata')
      } finally {
        setMetaLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!hasSearched) {
      return
    }

    const controller = new AbortController()
    setSearchError(null)
    setSearchLoading(true)
    setSelectedId(null)
    setSelectedCard(null)
    setVariants([])
    setDetailError(null)

    ;(async () => {
      try {
        const params = new URLSearchParams({
          q: activeQuery,
          page: '1',
          pageSize: '10',
        })

        const response = await fetch(`/api/search/cards?${params.toString()}`, {
          signal: controller.signal,
        })
        const payload = await readResponsePayload<SearchResponse>(response)

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error || 'Search failed' : 'Search failed')
        }

        setSearchResponse(payload as SearchResponse)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setSearchResponse(null)
        setSearchError(error instanceof Error ? error.message : 'Search failed')
      } finally {
        setSearchLoading(false)
      }
    })()

    return () => controller.abort()
  }, [activeQuery, hasSearched])

  useEffect(() => {
    if (!searchResponse?.results.length) {
      setSelectedId(null)
      return
    }

    setSelectedId(searchResponse.results[0].id)
  }, [searchResponse])

  useEffect(() => {
    if (!selectedId) {
      setSelectedCard(null)
      setVariants([])
      setDetailError(null)
      return
    }

    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)

    ;(async () => {
      try {
        const detailResponse = await fetch(`/api/cards/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
        const detailPayload = await readResponsePayload<EvidenceCardDetail>(detailResponse)

        if (!detailResponse.ok) {
          throw new Error(
            'error' in detailPayload ? detailPayload.error || 'Unable to load card detail' : 'Unable to load card detail'
          )
        }

        const detail = detailPayload as EvidenceCardDetail
        setSelectedCard(detail)
        setVariants(detail.variantsPreview || [])
        setTextView(detail.availableViews[0] || 'full')

        try {
          const variantsResponse = await fetch(`/api/cards/${encodeURIComponent(selectedId)}/variants?limit=6`, {
            signal: controller.signal,
          })
          const variantsPayload = await readResponsePayload<{ items?: EvidenceVariantSummary[] }>(variantsResponse)

          if (!variantsResponse.ok) {
            throw new Error(
              'error' in variantsPayload ? variantsPayload.error || 'Unable to load card variants' : 'Unable to load card variants'
            )
          }

          const nextVariants = 'items' in variantsPayload ? variantsPayload.items || [] : []
          setVariants(nextVariants.length > 0 ? nextVariants : detail.variantsPreview || [])
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            return
          }

          setVariants(detail.variantsPreview || [])
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setDetailError(error instanceof Error ? error.message : 'Unable to load card')
      } finally {
        setDetailLoading(false)
      }
    })()

    return () => controller.abort()
  }, [selectedId])

  async function copyCard() {
    if (!selectedCard) {
      return
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }

      await navigator.clipboard.writeText(formatCardCopy(selectedCard, textView))
      toast.success('Card copied to clipboard')
    } catch {
      toast.error('Clipboard permission failed')
    }
  }

  function submitSearch() {
    setHasSearched(true)
    setActiveQuery(inputQuery.trim())
  }

  const results = searchResponse?.results || []
  const statusLabel =
    searchResponse?.mode === 'closest'
      ? 'Closest matches'
      : hasSearched
        ? 'Exact matches'
        : 'Card finder'

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-slate-900">DEBATICA</h1>
            <span className="ml-3 text-sm text-slate-500">Debate Evidence Search</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <form
          className="flex flex-col gap-3 lg:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            submitSearch()
          }}
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={inputQuery}
              onChange={(event) => setInputQuery(event.target.value)}
              placeholder='Search for evidence (e.g., "US China war")...'
              className="w-full rounded-xl border border-slate-300 bg-white px-12 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white transition hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span>{meta?.scopeLabel || (metaLoading ? 'Loading evidence index' : 'Evidence index unavailable')}</span>
          {meta ? (
            <>
              <span>•</span>
              <span>{meta.totalClusters.toLocaleString()} clusters</span>
              <span>•</span>
              <span>{meta.totalVariants.toLocaleString()} cards</span>
            </>
          ) : null}
        </div>

        {meta?.status === 'missing' ? (
          <div className="mt-6">
            <SetupNotice message={meta.message || 'Build the evidence index before using the card finder.'} />
          </div>
        ) : null}

        {metaError ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {metaError}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {!hasSearched ? (
              <Placeholder
                title="Enter a topic to search for cards."
                description="Search by argument, author, citation, or a phrase from the evidence. Debatica will surface exact matches first and closest matches when the query is weak."
              />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-4 px-1">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{statusLabel}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {searchResponse
                        ? `${searchResponse.total.toLocaleString()} results for ${activeQuery ? `“${activeQuery}”` : 'top evidence'}`
                        : 'Searching evidence...'}
                    </div>
                  </div>
                  {searchLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : null}
                </div>

                {searchError ? (
                  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {searchError}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {results.length > 0 ? (
                    results.map((card) => (
                      <ResultCard
                        key={card.id}
                        card={card}
                        selected={selectedId === card.id}
                        onSelect={() => setSelectedId(card.id)}
                      />
                    ))
                  ) : (
                    <Placeholder
                      title="No cards found."
                      description="Try a broader query. When the index has nearby evidence, Debatica will surface closest matches automatically."
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {!hasSearched ? (
              <Placeholder
                title="Select a card to view"
                description="Your selected evidence card will appear here with full citation, rendered cut text, copy controls, and source links."
              />
            ) : detailLoading ? (
              <div className="flex min-h-[28rem] items-center justify-center text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !selectedCard ? (
              <Placeholder
                title="Select a card to view"
                description="Search results will auto-load here once Debatica finds evidence."
              />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                        {formatEventLabel(selectedCard.event)}
                      </span>
                      {selectedCard.block ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                          {selectedCard.block}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-500">
                        {formatSupportLabel(selectedCard.supportCount, selectedCard.variantCount)}
                      </span>
                    </div>
                    <h2 className="text-[1.65rem] font-bold leading-tight text-slate-900">{selectedCard.tag}</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{selectedCard.fullcite || selectedCard.cite}</p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{formatMetaLine(selectedCard)}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCard.availableViews.map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setTextView(view)}
                        className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                          textView === view
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {VIEW_LABELS[view]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={copyCard}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Card
                    </button>
                  </div>
                </div>

                {detailError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {detailError}
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Card View</div>
                  {textView === 'full' ? (
                    <div
                      className="evidence-card text-[15px] leading-8 text-slate-900"
                      dangerouslySetInnerHTML={{
                        __html: selectedCard.renderedMarkup,
                      }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-900">
                      {getPreferredEvidenceText(selectedCard, textView)}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {selectedCard.primaryLinkUrl ? (
                    <a
                      href={selectedCard.primaryLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {linkLabel(selectedCard)}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}

                  {selectedCard.sourcePageUrl && selectedCard.sourcePageUrl !== selectedCard.primaryLinkUrl ? (
                    <a
                      href={selectedCard.sourcePageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Open evidence page
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}

                  {selectedCard.fileUrl ? (
                    <a
                      href={selectedCard.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Open file
                      <FileText className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold text-slate-900">Other cuts in this cluster</div>
                  {variants.length > 0 ? (
                    <div className="space-y-2">
                      {variants.map((item) => (
                        <VariantItem key={item.id} item={item} onSelect={() => setSelectedId(item.id)} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                      No additional cuts were stored for this cluster.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
