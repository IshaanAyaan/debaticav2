const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

async function testSearch() {
    console.log('Starting search test...');
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
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    const query = "climate change causes economic recession";
    const url = 'https://html.duckduckgo.com/html/';

    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.type('input[name="q"]', query);
    await page.click('input[type="submit"]');
    await page.waitForSelector('.result', { timeout: 10000 });

    const content = await page.content();
    fs.writeFileSync('debug_search.html', content);
    console.log('Saved HTML to debug_search.html');

    const $ = cheerio.load(content);
    const results = [];

    // Try to find results
    const resultContainers = $('.result');
    console.log(`Found ${resultContainers.length} result containers`);

    resultContainers.each((i, element) => {
        const titleElement = $(element).find('.result__a');
        const snippetElement = $(element).find('.result__snippet');

        const title = titleElement.text().trim();
        const url = titleElement.attr('href');

        if (title && url) {
            results.push({ title, url });
        }
    });

    console.log('Results found:', results);
    await browser.close();
}

testSearch().catch(console.error);
