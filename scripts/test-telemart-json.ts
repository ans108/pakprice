import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testTelemart() {
  try {
    const url = 'https://www.telemart.pk/search/suggest.json?q=Samsung%20Galaxy&resources[type]=product';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 8000,
    });
    console.log('Telemart status:', res.status);
    console.log('Telemart products found:', res.data?.resources?.results?.products?.length);
    if (res.data?.resources?.results?.products?.length > 0) {
      console.log('Sample product:', res.data.resources.results.products[0]);
    }
  } catch (e: any) {
    console.error('Telemart error:', e.message, e.response?.status);
  }
}

testTelemart();

