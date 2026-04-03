import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export class SupabaseEvidenceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseEvidenceUnavailableError'
  }
}

let cachedClient: SupabaseClient | null = null
let lastSupabaseNetworkFailureAt = 0

const SUPABASE_RETRY_BACKOFF_MS = 5 * 60 * 1000

export function hasSupabaseEvidenceConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getEvidenceProviderMode(): 'auto' | 'sqlite' | 'supabase' {
  const rawMode = (process.env.EVIDENCE_PROVIDER || '').trim().toLowerCase()
  if (!rawMode) {
    return 'sqlite'
  }

  if (rawMode === 'sqlite' || rawMode === 'supabase' || rawMode === 'auto') {
    return rawMode
  }

  return 'sqlite'
}

export function shouldSkipSupabaseAttempt(): boolean {
  return lastSupabaseNetworkFailureAt > 0 && Date.now() - lastSupabaseNetworkFailureAt < SUPABASE_RETRY_BACKOFF_MS
}

export function markSupabaseAttemptFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : ''

  const isNetworkFailure =
    message.includes('fetch failed') ||
    message.includes('enotfound') ||
    message.includes('getaddrinfo') ||
    message.includes('network')

  if (!isNetworkFailure) {
    return false
  }

  const shouldReport = !shouldSkipSupabaseAttempt()
  lastSupabaseNetworkFailureAt = Date.now()
  return shouldReport
}

export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new SupabaseEvidenceUnavailableError(
      'Supabase evidence provider is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'debatica-evidence-search',
      },
    },
  })

  return cachedClient
}
