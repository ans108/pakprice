import * as cheerio from 'cheerio';

async function checkMegaLinks() {
  for (const url of ['https://www.mega.pk/mobiles/', 'https://www.mega.pk/laptop-price-pakistan/']) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const $ = cheerio.load(html);
      const links: string[] = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html') || href.includes('/laptop_products/'))) {
          const fullUrl = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          if (!links.includes(fullUrl)) links.push(fullUrl);
        }
      });
      console.log(url, 'found product links:', links.length, 'sample:', links.slice(0, 3));
    } catch (e: any) {
      console.error(url, e.message);
    }
  }
}
checkMegaLinks();
