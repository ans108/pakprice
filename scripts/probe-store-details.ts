import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeStore(name: string, url: string) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    console.log(`[${name}] Status: ${res.status}, URL: ${res.request?.res?.responseUrl || url}`);
    const $ = cheerio.load(res.data);
    const title = $('title').text().trim();
    console.log(`[${name}] Title: ${title.slice(0, 80)}`);
    return { status: res.status, html: res.data, $ };
  } catch (err: any) {
    console.log(`[${name}] Failed: ${err.message} (Status: ${err.response?.status})`);
    return { status: err.response?.status || 500, error: err.message };
  }
}

async function run() {
  console.log('=== Probing HomeShopping ===');
  // HomeShopping categories / search
  const hsCategory = await probeStore('HomeShopping Category', 'https://homeshopping.pk/categories/Mobile-Phones-Price-Pakistan/');
  if (hsCategory.$) {
    const links: string[] = [];
    hsCategory.$('a[href*="/products/"]').each((_, el) => {
      const href = hsCategory.$(el).attr('href');
      if (href && !links.includes(href)) links.push(href);
    });
    console.log('HomeShopping product links found:', links.slice(0, 5));
    if (links.length > 0) {
      const sampleUrl = links[0].startsWith('http') ? links[0] : `https://homeshopping.pk${links[0]}`;
      const samplePdp = await probeStore('HomeShopping Sample PDP', sampleUrl);
      if (samplePdp.$) {
        const pName = samplePdp.$('h1').text().trim();
        const price = samplePdp.$('.price, .actual-price, .ProductPrice').text().trim();
        console.log(`HomeShopping PDP parsed -> Name: "${pName}", Price: "${price}"`);
      }
    }
  }

  console.log('\n=== Probing Naheed ===');
  const naheed = await probeStore('Naheed Search', 'https://www.naheed.pk/catalogsearch/result/?q=milk');
  if (naheed.$) {
    const links: string[] = [];
    naheed.$('.product-item-link').each((_, el) => {
      const href = naheed.$(el).attr('href');
      if (href && !links.includes(href)) links.push(href);
    });
    console.log('Naheed product links found:', links.slice(0, 5));
  }

  console.log('\n=== Probing Al-Fatah ===');
  const alfatah = await probeStore('Al-Fatah Search', 'https://www.alfatah.com.pk/search?q=milk');
  if (alfatah.$) {
    const links: string[] = [];
    alfatah.$('a[href*="/products/"]').each((_, el) => {
      const href = alfatah.$(el).attr('href');
      if (href && !links.includes(href)) links.push(href);
    });
    console.log('Al-Fatah product links found:', links.slice(0, 5));
  }

  console.log('\n=== Probing Metro ===');
  const metro = await probeStore('Metro Home', 'https://www.metro.pk');
  if (metro.$) {
    console.log('Metro title:', metro.$('title').text().trim());
  }

  console.log('\n=== Probing Carrefour ===');
  const carrefour = await probeStore('Carrefour Home', 'https://www.carrefour.pk');
  if (carrefour.$) {
    console.log('Carrefour title:', carrefour.$('title').text().trim());
  }
}

run();
