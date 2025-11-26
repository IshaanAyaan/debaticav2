import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_KEY = process.env.GEMINI_API_KEY
const SCRAPER_API = process.env.SCRAPER_API_URL

const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null

export async function POST(request: NextRequest) {
  try {
    if (!SCRAPER_API) {
      throw new Error('SCRAPER_API_URL is not configured')
    }
    if (!genAI) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const { query, numResults } = await request.json()

    const scraperResponse = await fetch(`${SCRAPER_API}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, num_results: numResults }),
    })

    if (!scraperResponse.ok) {
      throw new Error('Scraper API failed')
    }

    const scraperData = await scraperResponse.json()

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const summaryPromises = scraperData.articles.map(async (article: any) => {
      const prompt = `
        Analyze this article for debate evidence. Provide a concise summary focusing on:
        1. Main claim or argument
        2. Key statistics or evidence
        3. Expert opinions or studies cited
        4. Implications or consequences discussed

        Keep it under 150 words and focus on factual claims that could be used in debate.

        Article content: ${article.content.substring(0, 3000)}
      `

      const result = await model.generateContent(prompt)
      const summary = result.response.text()

      return {
        url: article.url,
        title: article.title,
        author: article.author || 'Unknown',
        date: article.date || new Date().toISOString().split('T')[0],
        summary,
        content: article.content,
      }
    })

    const results = await Promise.all(summaryPromises)

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
  }
}
