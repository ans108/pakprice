import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testStores() {
  console.log('--- Testing Al-Fatah ---');
  try {
    // Al-Fatah is Shopify! Let's check products.json
    const alfatahRes = await axios.get('https://alfatah.com.pk/products.json?limit=5', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    console.log('Al-Fatah products.json status:', alfatahRes.status);
    console.log('Al-Fatah products count:', alfatahRes.data?.products?.length);
    if (alfatahRes.data?.products?.length > 0) {
      const p = alfatahRes.data.products[0];
      console.log('Sample Al-Fatah product:', {
        id: p.id,
        title: p.title,
        handle: p.handle,
        price: p.variants?.[0]?.price,
        available: p.variants?.[0]?.available,
        sku: p.variants?.[0]?.sku,
        image: p.images?.[0]?.src,
      });
    }
  } catch (err: any) {
    console.log('Al-Fatah error:', err.message, err.response?.status);
  }

  console.log('\n--- Testing Carrefour Pakistan ---');
  try {
    const cfRes = await axios.get('https://www.carrefour.pk/', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    console.log('Carrefour homepage status:', cfRes.status, 'len:', cfRes.data.length);
    const $cf = cheerio.load(cfRes.data);
    console.log('Carrefour title:', $cf('title').text().trim());
  } catch (err: any) {
    console.log('Carrefour error:', err.message, err.response?.status);
  }

  console.log('\n--- Testing Metro Pakistan ---');
  try {
    const metroRes = await axios.get('https://www.metro.pk/', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    console.log('Metro homepage status:', metroRes.status, 'len:', metroRes.data.length);
    const $metro = cheerio.load(metroRes.data);
    console.log('Metro title:', $metro('title').text().trim());
  } catch (err: any) {
    console.log('Metro error:', err.message, err.response?.status);
  }
}

testStores();
