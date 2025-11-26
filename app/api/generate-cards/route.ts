import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import puppeteer from 'puppeteer'
import * as cheerio from 'cheerio'

const GEMINI_KEY = process.env.GEMINI_API_KEY
const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null

export async function POST(request: NextRequest) {
  try {
    if (!genAI) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const { articles } = await request.json()

    // Launch browser once for all articles
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const cardPromises = articles.map(async (article: any) => {
      try {
        let content = article.content || ''

        // If content is short (likely just a snippet), fetch the full page
        if (content.length < 500 && article.url) {
          try {
            const page = await browser.newPage()
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

            // Set timeout to 10s to avoid hanging
            await page.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 10000 })

            const html = await page.content()
            const $ = cheerio.load(html)

            // Remove scripts, styles, nav, footer to clean up text
            $('script, style, nav, footer, header, aside, iframe').remove()

            content = $('body').text().replace(/\s+/g, ' ').trim()
            await page.close()
          } catch (fetchError) {
            console.error(`Failed to fetch ${article.url}:`, fetchError)
            // Fallback to snippet if fetch fails
            content = article.snippet || article.summary || content
          }
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

        const prompt = `
          You are an expert debate coach creating NSDA Policy Debate evidence cards.
          
          Create a properly formatted debate card from this article following NSDA standards.
          
          REQUIREMENTS:
          1. TAG: Create a clear, argumentative tagline (8-12 words) that makes a claim.
          2. CITATION: Format as: Author's Last Name, Year (Publication, Date, "Article Title", URL).
          3. CARD TEXT: Cut the most impactful 150-300 words from the article that support the tag.
          4. HIGHLIGHTING: Use <mark> tags around the 2-3 most important phrases.
          
          Article Title: ${article.title}
          URL: ${article.url}
          Content: ${content.substring(0, 15000)}
          
          Format your response EXACTLY like this:
          TAG: [Your tag here]
          CITATION: [Formatted citation]
          CARD: [The cut card text with <mark> tags]
        `

        const result = await model.generateContent(prompt)
        const response = result.response.text()

        const tagMatch = response.match(/TAG:\s*(.+)/)
        const citationMatch = response.match(/CITATION:\s*(.+)/)
        const cardMatch = response.match(/CARD:\s*([\s\S]+)/)

        return {
          id: Math.random().toString(36).substring(7),
          tag: tagMatch ? tagMatch[1].trim() : 'Evidence Card',
          citation: citationMatch ? citationMatch[1].trim() : `${article.title}, ${new Date().getFullYear()}`,
          content: cardMatch ? cardMatch[1].trim() : content.substring(0, 500),
          url: article.url,
          originalArticle: article,
        }
      } catch (err) {
        console.error(`Error generating card for ${article.url}:`, err)
        return null
      }
    })

    const results = await Promise.all(cardPromises)
    await browser.close()

    // Filter out failed cards
    const cards = results.filter(c => c !== null)

    return NextResponse.json({ success: true, cards })
  } catch (error: any) {
    console.error('Card generation error details:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      name: error.name
    })
    return NextResponse.json({
      success: false,
      error: error.message || 'Card generation failed',
      details: error.toString()
    }, { status: 500 })
  }
}
