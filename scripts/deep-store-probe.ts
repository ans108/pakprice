import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function inspect(url: string, label: string) {
  console.log(`\n--- Inspecting [${label}]: ${url} ---`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: () => true, // capture all status codes
    });
    console.log(`Status: ${res.status}`);
    console.log(`Final URL: ${res.request?.res?.responseUrl || url}`);
    console.log(`Server: ${res.headers['server'] || 'unknown'}`);
    console.log(`Content-Type: ${res.headers['content-type']}`);
    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    console.log(`Length: ${html.length}`);

    const $ = cheerio.load(html);
    console.log(`Title: ${$('title').text().trim().slice(0, 100)}`);
    
    // Look for anti-bot indicators
    const bodyText = $('body').text().slice(0, 300).replace(/\s+/g, ' ');
    console.log(`Body preview: ${bodyText.slice(0, 150)}...`);

    // Check for links
    const allLinks: string[] = [];
    $('a').each((_, el) => {
      const h = $(el).attr('href');
      if (h && !allLinks.includes(h) && h.length > 5 && !h.startsWith('#')) {
        allLinks.push(h);
      }
    });
    console.log(`Found ${allLinks.length} distinct links.`);
    console.log(`Sample links:`, allLinks.slice(0, 8));
  } catch (err: any) {
    console.log(`Exception: ${err.message}`);
  }
}

async function main() {
  await inspect('https://homeshopping.pk/', 'HomeShopping Home');
  await inspect('https://homeshopping.pk/categories/', 'HomeShopping Categories');
  await inspect('https://www.naheed.pk/catalogsearch/result/?q=milk', 'Naheed Search');
  await inspect('https://www.paklap.pk/', 'Paklap Home');
  await inspect('https://www.ishopping.pk/', 'iShopping Home');
  await inspect('https://www.daraz.pk/', 'Daraz Home');
  await inspect('https://www.alfatah.com.pk/', 'Al-Fatah Home');
  await inspect('https://www.metro.pk/', 'Metro Home');
  await inspect('https://www.carrefour.pk/mafpak/en/', 'Carrefour EN Home');
}

main();
