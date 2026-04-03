import OpenAI from 'openai'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

let cachedClient: OpenAI | null = null

function getOpenAiClient(): OpenAI | null {
  if (cachedClient) {
    return cachedClient
  }

  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  cachedClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  return cachedClient
}

export function isSemanticSearchEnabled(): boolean {
  return process.env.EVIDENCE_ENABLE_SEMANTIC_SEARCH === 'true'
}

export async function embedEvidenceTexts(texts: string[]): Promise<number[][]> {
  const client = getOpenAiClient()
  if (!client) {
    throw new Error('OPENAI_API_KEY is required to generate evidence embeddings.')
  }

  if (texts.length === 0) {
    return []
  }

  const response = await client.embeddings.create({
    model: process.env.EVIDENCE_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    input: texts.map((text) => text.slice(0, 8_000)),
  })

  return response.data.map((item) => item.embedding)
}

export async function embedEvidenceText(text: string): Promise<number[] | null> {
  if (!isSemanticSearchEnabled()) {
    return null
  }

  const embeddings = await embedEvidenceTexts([text])
  return embeddings[0] || null
}
