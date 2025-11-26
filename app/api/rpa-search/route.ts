import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'
import * as cheerio from 'cheerio'

export async function POST(request: NextRequest) {
    try {
        const { query, numResults = 10 } = await request.json()

        if (!query) {
            return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 })
        }

        // Launch puppeteer
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
        })

        const page = await browser.newPage()

        // Set user agent to look like a real browser
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')

        // Go to DuckDuckGo (HTML version is easier to scrape and less likely to block)
        await page.goto('https://html.duckduckgo.com/html/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        })

        // Type query and submit
        await page.type('input[name="q"]', query)
        await page.click('input[type="submit"]')
        await page.waitForSelector('.result', { timeout: 10000 })

        // Get page content
        const content = await page.content()
        await browser.close()

        // Parse with Cheerio
        const $ = cheerio.load(content)
        const results: any[] = []

        // Select search results from DuckDuckGo
        $('.result').each((i, element) => {
            const titleElement = $(element).find('.result__a')
            const snippetElement = $(element).find('.result__snippet')
            const extrasElement = $(element).find('.result__extras__url')

            const title = titleElement.text().trim()
            const url = titleElement.attr('href')
            const snippet = snippetElement.text().trim()

            // Try to extract date from snippet (e.g., "Sep 15, 2023 ...")
            const dateMatch = snippet.match(/([A-Z][a-z]{2}\s\d{1,2},\s\d{4})/)
            const date = dateMatch ? dateMatch[1] : 'Unknown Date'

            // Try to extract domain/publisher from URL or extras
            let author = 'Unknown Author'
            if (url) {
                try {
                    const domain = new URL(url).hostname.replace('www.', '')
                    author = domain.charAt(0).toUpperCase() + domain.slice(1)
                } catch (e) {
                    author = 'Unknown Source'
                }
            }

            if (title && url && !url.includes('duckduckgo.com')) {
                // Avoid duplicates
                if (!results.some(r => r.url === url)) {
                    results.push({
                        title,
                        url,
                        snippet: snippet || 'No preview available',
                        content: snippet, // Use snippet as initial content
                        author,
                        date
                    })
                }
            }
        })

        console.log(`RPA Search found ${results.length} results for query: ${query}`)

        return NextResponse.json({ success: true, results: results.slice(0, numResults) })

    } catch (error) {
        console.error('RPA Search error:', error)
        return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
    }
}
