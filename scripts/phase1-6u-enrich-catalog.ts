/**
 * Increment 6U — Phase 1: Catalog Brand & Category Enrichment, Name Cleanup
 *
 * Idempotent script that:
 *   Step 1a: Inspects products with brand_id IS NULL to discover unmapped brands
 *   Step 1b: Seeds all missing brands into the brands table
 *   Step 1c: Assigns brand_id to products
 *   Step 1d: Assigns category_id to products with NULL category
 *   Step 1e: Fixes duplicate leading brand prefixes, recomputes normalized_name
 *
 * Non-negotiable: products=822, variants=822, slug preservation, allowCreate=false
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizeProductName } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// Brand definitions — all brands to seed (ON CONFLICT DO NOTHING)
// ═══════════════════════════════════════════════════════════════════════════

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

const BRANDS_TO_SEED = [
  // Audio brands
  'Audionic', 'Soundpeats', 'Soundcore', 'QCY', 'Edifier', 'Bose', 'Beats',
  'Sennheiser', 'Marshall', 'Harman Kardon', 'Awei', 'Aukey', 'Rock', 'Lecoo',
  'Maxon', 'Vizo', 'A4Tech', 'Hifiman', 'KZ', 'Moondrop', 'Skullcandy',
  // Smart watch / wearable brands
  'Amazfit', 'Mibro', 'Kieslect', 'Kospet', 'Haylou', 'Garmin', 'Fitbit',
  'Nothing', 'CMF', 'Colmi', 'Noise', 'Fire-Boltt', 'Titan', 'Login', 'Crown',
  'Blaktron', 'Imiki', 'Imilab', 'Glorimi', 'HiFuture', 'BML',
  // Mobile / accessory brands
  'Honor', 'Itel', 'Dany', 'Zero', 'Ronin', 'Faster', 'Calme', 'E-Tachi',
  'Sego', 'VGO TEL', 'Villaon', 'Me Mobile', 'XMobile', 'Club Mobile', 'Gresso',
  'Gfive', 'QMobile', 'RedMagic', 'Dcode', 'Sparx', 'ZTE', 'Motorola', 'Alcatel',
  'Redmi', 'Poco', 'iQOO', 'Docomo', 'T-Mobile',
  // Accessory / charging / PC brands
  'Baseus', 'Ugreen', 'Joyroom', 'Bluks', 'Urpin', 'Yosonda', 'Mirror',
  'Logitech', 'Razer', 'Corsair', 'HyperX', 'Redragon', 'Xtrike Me',
  'Crucial', 'Kingston', 'SanDisk', 'Transcend', 'Spigen', 'Nillkin', 'UAG',
  // Camera brands
  'Canon', 'Nikon', 'Fujifilm', 'GoPro', 'DJI',
  // Networking
  'TP-Link', 'D-Link', 'Tenda', 'Mercusys', 'Netgear', 'Ubiquiti',
  // Power / UPS
  'APC',
  // Home appliances / Living / Lifestyle
  'Gree', 'Kenwood', 'Westpoint', 'Anex', 'Philips', 'Panasonic', 'Braun', 'Remington',
  'Nasgas', 'Diamond', 'Casvena', 'Fresh Street', 'Amazon', 'Zentality',
  'Epson', 'Brother', 'Miniso', 'Oraimo', 'Tronsmart', 'Havit', 'Riversong', 'Yolo'
];

// ═══════════════════════════════════════════════════════════════════════════
// Brand matching patterns — maps leading name tokens to brand slugs
// Order matters: longer/more specific patterns first
// ═══════════════════════════════════════════════════════════════════════════

const BRAND_PATTERNS: Array<{ pattern: RegExp; brandSlug: string }> = [
  // Multi-word brands (must come before single-word)
  { pattern: /^harman\s+kardon\b/i, brandSlug: 'harman-kardon' },
  { pattern: /^tp[- ]?link\b/i, brandSlug: 'tp-link' },
  { pattern: /^d[- ]?link\b/i, brandSlug: 'd-link' },
  { pattern: /^t[- ]?mobile\b/i, brandSlug: 't-mobile' },
  { pattern: /^fire[- ]?boltt?\b/i, brandSlug: 'fire-boltt' },
  { pattern: /^hyper\s*x\b/i, brandSlug: 'hyperx' },
  { pattern: /^one\s*plus\b/i, brandSlug: 'oneplus' },
  { pattern: /^vgo[\s-]?tel\b/i, brandSlug: 'vgo-tel' },
  { pattern: /^x[\s-]?mobile\b/i, brandSlug: 'xmobile' },
  { pattern: /^e[\s-]?tachi\b/i, brandSlug: 'e-tachi' },
  { pattern: /^(?:me[\s-]?mobile|memobile)\b/i, brandSlug: 'me-mobile' },
  { pattern: /^club[\s-]?mobile\b/i, brandSlug: 'club-mobile' },
  { pattern: /^fresh[\s-]?street\b/i, brandSlug: 'fresh-street' },
  { pattern: /^xtrike[\s-]?me\b/i, brandSlug: 'xtrike-me' },
  { pattern: /^diamond\s+supreme\b/i, brandSlug: 'diamond' },
  { pattern: /^a4tech\b/i, brandSlug: 'a4tech' },
  { pattern: /^bloody\b/i, brandSlug: 'a4tech' },
  { pattern: /^soundcore\b/i, brandSlug: 'soundcore' },
  { pattern: /^soundpeats\b/i, brandSlug: 'soundpeats' },
  { pattern: /^red\s*magic\b/i, brandSlug: 'redmagic' },
  { pattern: /^hi\s*future\b/i, brandSlug: 'hifuture' },

  // Single-word brands (alphabetical for readability)
  { pattern: /^a4tech\b/i, brandSlug: 'a4tech' },
  { pattern: /^acer\b/i, brandSlug: 'acer' },
  { pattern: /^alcatel\b/i, brandSlug: 'alcatel' },
  { pattern: /^amazfit\b/i, brandSlug: 'amazfit' },
  { pattern: /^amazon\b/i, brandSlug: 'amazon' },
  { pattern: /^tablet\s*fire\b/i, brandSlug: 'amazon' },
  { pattern: /^anex\b/i, brandSlug: 'anex' },
  { pattern: /^anker\b/i, brandSlug: 'anker' },
  { pattern: /^apc\b/i, brandSlug: 'apc' },
  { pattern: /^apple\b/i, brandSlug: 'apple' },
  { pattern: /^airpods\b/i, brandSlug: 'apple' },
  { pattern: /^asus\b/i, brandSlug: 'asus' },
  { pattern: /^audionic\b/i, brandSlug: 'audionic' },
  { pattern: /^aukey\b/i, brandSlug: 'aukey' },
  { pattern: /^awei\b/i, brandSlug: 'awei' },
  { pattern: /^baseus\b/i, brandSlug: 'baseus' },
  { pattern: /^beats\b/i, brandSlug: 'beats' },
  { pattern: /^blaktron\b/i, brandSlug: 'blaktron' },
  { pattern: /^bluks\b/i, brandSlug: 'bluks' },
  { pattern: /^bml\b/i, brandSlug: 'bml' },
  { pattern: /^bose\b/i, brandSlug: 'bose' },
  { pattern: /^braun\b/i, brandSlug: 'braun' },
  { pattern: /^brother\b/i, brandSlug: 'brother' },
  { pattern: /^calme\b/i, brandSlug: 'calme' },
  { pattern: /^canon\b/i, brandSlug: 'canon' },
  { pattern: /^casvena\b/i, brandSlug: 'casvena' },
  { pattern: /^cmf\b/i, brandSlug: 'cmf' },
  { pattern: /^colmi\b/i, brandSlug: 'colmi' },
  { pattern: /^corsair\b/i, brandSlug: 'corsair' },
  { pattern: /^crown\b/i, brandSlug: 'crown' },
  { pattern: /^crucial\b/i, brandSlug: 'crucial' },
  { pattern: /^dany\b/i, brandSlug: 'dany' },
  { pattern: /^dawlance\b/i, brandSlug: 'dawlance' },
  { pattern: /^(?:dcode|decode)\b/i, brandSlug: 'dcode' },
  { pattern: /^dell\b/i, brandSlug: 'dell' },
  { pattern: /^diamond\b/i, brandSlug: 'diamond' },
  { pattern: /^dji\b/i, brandSlug: 'dji' },
  { pattern: /^docomo\b/i, brandSlug: 'docomo' },
  { pattern: /^dyson\b/i, brandSlug: 'dyson' },
  { pattern: /^edifier\b/i, brandSlug: 'edifier' },
  { pattern: /^epson\b/i, brandSlug: 'epson' },
  { pattern: /^faster\b/i, brandSlug: 'faster' },
  { pattern: /^fitbit\b/i, brandSlug: 'fitbit' },
  { pattern: /^fujifilm\b/i, brandSlug: 'fujifilm' },
  { pattern: /^garmin\b/i, brandSlug: 'garmin' },
  { pattern: /^gfive\b/i, brandSlug: 'gfive' },
  { pattern: /^glorimi\b/i, brandSlug: 'glorimi' },
  { pattern: /^google\b/i, brandSlug: 'google' },
  { pattern: /^gopro\b/i, brandSlug: 'gopro' },
  { pattern: /^gree\b/i, brandSlug: 'gree' },
  { pattern: /^gresso\b/i, brandSlug: 'gresso' },
  { pattern: /^haier\b/i, brandSlug: 'haier' },
  { pattern: /^havit\b/i, brandSlug: 'havit' },
  { pattern: /^haylou\b/i, brandSlug: 'haylou' },
  { pattern: /^hifuture\b/i, brandSlug: 'hifuture' },
  { pattern: /^hisense\b/i, brandSlug: 'hisense' },
  { pattern: /^honor\b/i, brandSlug: 'honor' },
  { pattern: /^hp\b/i, brandSlug: 'hp' },
  { pattern: /^huawei\b/i, brandSlug: 'huawei' },
  { pattern: /^imilab\b/i, brandSlug: 'imilab' },
  { pattern: /^imiki\b/i, brandSlug: 'imiki' },
  { pattern: /^infinix\b/i, brandSlug: 'infinix' },
  { pattern: /^iqoo\b/i, brandSlug: 'iqoo' },
  { pattern: /^itel\b/i, brandSlug: 'itel' },
  { pattern: /^jbl\b/i, brandSlug: 'jbl' },
  { pattern: /^joyroom\b/i, brandSlug: 'joyroom' },
  { pattern: /^kenwood\b/i, brandSlug: 'kenwood' },
  { pattern: /^kieslect\b/i, brandSlug: 'kieslect' },
  { pattern: /^kingston\b/i, brandSlug: 'kingston' },
  { pattern: /^kospet\b/i, brandSlug: 'kospet' },
  { pattern: /^lecoo\b/i, brandSlug: 'lecoo' },
  { pattern: /^lenovo\b/i, brandSlug: 'lenovo' },
  { pattern: /^lg\b/i, brandSlug: 'lg' },
  { pattern: /^login\b/i, brandSlug: 'login' },
  { pattern: /^logitech\b/i, brandSlug: 'logitech' },
  { pattern: /^marshall\b/i, brandSlug: 'marshall' },
  { pattern: /^maxon\b/i, brandSlug: 'maxon' },
  { pattern: /^mercusys\b/i, brandSlug: 'mercusys' },
  { pattern: /^mibro\b/i, brandSlug: 'mibro' },
  { pattern: /^microsoft\b/i, brandSlug: 'microsoft' },
  { pattern: /^miniso\b/i, brandSlug: 'miniso' },
  { pattern: /^motorola\b/i, brandSlug: 'motorola' },
  { pattern: /^msi\b/i, brandSlug: 'msi' },
  { pattern: /^nasgas\b/i, brandSlug: 'nasgas' },
  { pattern: /^netgear\b/i, brandSlug: 'netgear' },
  { pattern: /^nikon\b/i, brandSlug: 'nikon' },
  { pattern: /^nintendo\b/i, brandSlug: 'nintendo' },
  { pattern: /^noise\b/i, brandSlug: 'noise' },
  { pattern: /^nokia\b/i, brandSlug: 'nokia' },
  { pattern: /^nothing\b/i, brandSlug: 'nothing' },
  { pattern: /^oppo\b/i, brandSlug: 'oppo' },
  { pattern: /^oraimo\b/i, brandSlug: 'oraimo' },
  { pattern: /^orient\b/i, brandSlug: 'orient' },
  { pattern: /^panasonic\b/i, brandSlug: 'panasonic' },
  { pattern: /^pel\b/i, brandSlug: 'pel' },
  { pattern: /^philips\b/i, brandSlug: 'philips' },
  { pattern: /^playstation\b/i, brandSlug: 'playstation' },
  { pattern: /^ps5\b/i, brandSlug: 'playstation' },
  { pattern: /^poco\b/i, brandSlug: 'poco' },
  { pattern: /^qcy\b/i, brandSlug: 'qcy' },
  { pattern: /^qphantom\b/i, brandSlug: 'qmobile' },
  { pattern: /^razer\b/i, brandSlug: 'razer' },
  { pattern: /^realme\b/i, brandSlug: 'realme' },
  { pattern: /^redmagic\b/i, brandSlug: 'redmagic' },
  { pattern: /^redragon\b/i, brandSlug: 'redragon' },
  { pattern: /^redmi\b/i, brandSlug: 'redmi' },
  { pattern: /^remington\b/i, brandSlug: 'remington' },
  { pattern: /^riversong\b/i, brandSlug: 'riversong' },
  { pattern: /^rock\b/i, brandSlug: 'rock' },
  { pattern: /^ronin\b/i, brandSlug: 'ronin' },
  { pattern: /^samsung\b/i, brandSlug: 'samsung' },
  { pattern: /^sandisk\b/i, brandSlug: 'sandisk' },
  { pattern: /^sego\b/i, brandSlug: 'sego' },
  { pattern: /^sennheiser\b/i, brandSlug: 'sennheiser' },
  { pattern: /^skullcandy\b/i, brandSlug: 'skullcandy' },
  { pattern: /^sony\b/i, brandSlug: 'sony' },
  { pattern: /^sparx\b/i, brandSlug: 'sparx' },
  { pattern: /^spigen\b/i, brandSlug: 'spigen' },
  { pattern: /^tcl\b/i, brandSlug: 'tcl' },
  { pattern: /^tecno\b/i, brandSlug: 'tecno' },
  { pattern: /^tenda\b/i, brandSlug: 'tenda' },
  { pattern: /^titan\b/i, brandSlug: 'titan' },
  { pattern: /^transcend\b/i, brandSlug: 'transcend' },
  { pattern: /^tronsmart\b/i, brandSlug: 'tronsmart' },
  { pattern: /^ugreen\b/i, brandSlug: 'ugreen' },
  { pattern: /^urpin\b/i, brandSlug: 'urpin' },
  { pattern: /^villaon\b/i, brandSlug: 'villaon' },
  { pattern: /^vivo\b/i, brandSlug: 'vivo' },
  { pattern: /^vizo\b/i, brandSlug: 'vizo' },
  { pattern: /^westpoint\b/i, brandSlug: 'westpoint' },
  { pattern: /^xbox\b/i, brandSlug: 'xbox' },
  { pattern: /^xiaomi\b/i, brandSlug: 'xiaomi' },
  { pattern: /^yolo\b/i, brandSlug: 'yolo' },
  { pattern: /^yosonda\b/i, brandSlug: 'yosonda' },
  { pattern: /^zentality\b/i, brandSlug: 'zentality' },
  { pattern: /^zero\b/i, brandSlug: 'zero' },
  { pattern: /^zte\b/i, brandSlug: 'zte' },
  // iPhone / iPad / iPod → Apple
  { pattern: /^i(?:phone|pad|pod)\b/i, brandSlug: 'apple' },
  // Galaxy → Samsung
  { pattern: /^galaxy\b/i, brandSlug: 'samsung' },
  // Mi Band / Mi Watch → Xiaomi
  { pattern: /^mi\s+(?:band|watch|smart)/i, brandSlug: 'xiaomi' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Category assignment keywords
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_KEYWORDS: Array<{ keywords: RegExp; categorySlug: string }> = [
  // Laptops (highest precedence for PC models)
  {
    keywords: /\b(?:laptop|notebook|chromebook|macbook|thinkpad|thinkbook|probook|elitebook|latitude|omen|victus|omnibook|expertbook|cyborg|tuf|zenbook|vivobook|legion|predator|nitro|pavilion|spectre|envy|inspiron|vostro|ideapad|yoga|raptor\s*lake|ci[3579][-\s]\w+|core\s*ultra|core\s*7\b|ryzen\s*[3579]|rtx\s*\d0\d0|dos\s*silver|backlit\s*kb|dos\s*star\s*black|\bci[3579]\b)\b/i,
    categorySlug: 'laptops'
  },
  // Tablets
  {
    keywords: /\b(?:tablet|ipad|tab\s*[as]\d|galaxy\s*tab|matepad|mediapad|\bpad\s*\d|\bpad9\b|s\s*pad\s*4g)\b/i,
    categorySlug: 'tablets'
  },
  // Audio
  {
    keywords: /\b(?:earbuds?|headphones?|headset|earphones?|neckband|speaker|soundbar|airpods|echopods|zbuds|earpods|battlebuds|erabuds|\bbuds\b|olymbuds|flybuds|colorbuds|glasspods|dark\s*bass|bass\s*nest|boom\s*sphere|strompods|soundcore|liberty\s*buds|fury\s*buds)\b/i,
    categorySlug: 'headphones-audio'
  },
  // Smart Watches
  {
    keywords: /\b(?:smartwatch|smart\s*watch|fitness\s*band|fitness\s*tracker|mi\s*band|band\s*\d|gt\s*\d|gtr|gts|t-rex|bip|active\s*\d|watch\s*\d|watch\s*ultra|watch\s*se|galaxy\s*watch|pixel\s*watch|apple\s*watch|calling\s*watch|smart\s*band|inspire\s*3|fit\s*3|five\s*straps|seven\s*straps|\bstraps\s*smart\s*watch\b|caliber\s*pro)\b/i,
    categorySlug: 'smart-watches'
  },
  // Computer Accessories
  {
    keywords: /\b(?:power\s*bank|powerbank|\d+\s*mah|wall\s*adapter|fast\s*charger|passthrough|laptop\s*stand|gaming\s*mouse|optical\s*mouse|\bstrap\b)\b/i,
    categorySlug: 'computer-accessories'
  },
  // TVs & Monitors
  {
    keywords: /\b(?:tv|television|led\s*tv|smart\s*tv|oled|qled|uhd\s*tv|4k\s*tv)\b/i,
    categorySlug: 'tvs'
  },
  {
    keywords: /\b(?:monitor|display|ultrawide)\b(?!.*\b(?:watch|band|smartwatch)\b)/i,
    categorySlug: 'monitors'
  },
  // Cameras
  {
    keywords: /\b(?:camera|dslr|mirrorless|action\s*cam|gopro|webcam|camcorder)\b/i,
    categorySlug: 'cameras'
  },
  // Networking
  {
    keywords: /\b(?:router|mesh|wifi|wi-fi|modem|repeater|extender|switch|access\s*point|networking|ethernet)\b/i,
    categorySlug: 'networking'
  },
  // Printers
  {
    keywords: /\b(?:printer|scanner|inkjet|laserjet|ink\s*tank)\b/i,
    categorySlug: 'printers'
  },
  // Gaming
  {
    keywords: /\b(?:ps5|ps4|playstation|xbox|nintendo|switch|gaming\s*console)\b/i,
    categorySlug: 'gaming-consoles'
  },
  {
    keywords: /\b(?:gamepad|controller|gaming\s*chair|joystick)\b/i,
    categorySlug: 'gaming-accessories'
  },
  // Kitchen
  {
    keywords: /\b(?:salt|himalayan|spice|sauce|blender|juicer|food\s*processor|oven|toaster)\b/i,
    categorySlug: 'kitchen'
  },
  // Home appliances / Living / Lifestyle
  {
    keywords: /\b(?:refrigerator|fridge|washing\s*machine|washer|dryer|ac|air\s*conditioner|microwave|vacuum|iron|geyser|water\s*heater|water\s*heating\s*rod|car\s*washer|mosquito\s*killer|iron\s*protector|toothbrush|flying\s*orb|recliner|supreme\s*foam|stencil|writing\s*board|drill\s*set|water\s*dispenser|toy|bunny|plush)\b/i,
    categorySlug: 'home-appliances'
  },
  // Mobiles & Feature Phones
  {
    keywords: /\b(?:phone|mobile|smartphone|5g|4g|lte|dual\s*sim|android|4g\s*power|4g\s*music|imax|c222|epicx|magic\s*e4|i252|smart\s*hi-fi|i15|v5606|v210|v220|v230|v50s|onyx|dabang|ismart|power\s*bold|x2\s*selfie|champion|x1000|d4\s*ultra|g3\s*plus|x4\s*music|x3\b|ipower|15\s*pro\s*metal|silk\s*slim|a10\b|cygnal|blade|blade\s*a\d|neo\s*7\s*plus|s24\b|a70\b|a100c|a200\s*plus|11s\s*pro|150\s*2g|5310\s*2g|15\s*pro\b)\b/i,
    categorySlug: 'mobiles'
  },
];

const MOBILE_FAMILIES = /\b(?:galaxy\s*[aszfm]\d|galaxy\s*note|iphone|pixel\s*\d|redmi\s*note|redmi\s*\d|poco\s*[fxmc]|note\s*\d\d|hot\s*\d|camon|spark|pop|smart\s*\d|y\d\d|v\d\d|reno|find|gt\s*neo|narzo|nord|nova|p\d0|mate\s*\d|magic)\b/i;

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6U — PHASE 1: CATALOG ENRICHMENT');
  console.log('════════════════════════════════════════════════════════════════\n');

  // ── Baseline Integrity Check ───────────────────────────────────────────
  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline: ${prodCount} products, ${varCount} variants`);
  if (prodCount !== 822 || varCount !== 822) {
    console.error(`❌ ABORT: Expected 822/822, got ${prodCount}/${varCount}`);
    process.exit(1);
  }

  // ── Before Counts ─────────────────────────────────────────────────────
  const { count: brandsBeforeCount } = await supabase.from('brands').select('*', { count: 'exact', head: true });
  const { count: nullBrandCountBefore } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('brand_id', null);
  const { count: nullCatCountBefore } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('category_id', null);
  console.log(`Current: ${brandsBeforeCount} brands, ${nullBrandCountBefore} products with NULL brand_id, ${nullCatCountBefore} products with NULL category_id\n`);

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1b: Seed missing brands
  // ══════════════════════════════════════════════════════════════════════
  console.log('────────────────────────────────────────────────────────────────');
  console.log('  STEP 1b: Seeding missing brands');
  console.log('────────────────────────────────────────────────────────────────');

  const uniqueBrands = new Map<string, string>();
  for (const name of BRANDS_TO_SEED) {
    const slug = slugify(name);
    if (!uniqueBrands.has(slug)) {
      uniqueBrands.set(slug, name);
    }
  }

  const batchSize = 25;
  const brandEntries = [...uniqueBrands.entries()];

  for (let i = 0; i < brandEntries.length; i += batchSize) {
    const batch = brandEntries.slice(i, i + batchSize).map(([slug, name]) => ({
      name,
      slug,
      normalized_name: name.toLowerCase().replace(/\s+/g, ' ').trim(),
      logo_url: null,
    }));

    const { error } = await supabase
      .from('brands')
      .upsert(batch, { onConflict: 'slug', ignoreDuplicates: true });

    if (error) {
      console.error(`  ❌ Error seeding brands batch ${i}: ${error.message}`);
    }
  }

  const { count: brandsAfterSeed } = await supabase.from('brands').select('*', { count: 'exact', head: true });
  console.log(`  Brands in DB after seeding: ${brandsAfterSeed} (was ${brandsBeforeCount})`);

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1c: Assign brand_id to products
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STEP 1c: Assigning brand_id to products');
  console.log('────────────────────────────────────────────────────────────────');

  const { data: allBrands } = await supabase.from('brands').select('id, slug, name, normalized_name');
  if (!allBrands) {
    console.error('❌ Failed to fetch brands');
    process.exit(1);
  }
  const brandBySlug = new Map(allBrands.map(b => [b.slug, b]));

  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, slug, brand_id, category_id, normalized_name');

  if (!allProducts) {
    console.error('❌ Failed to fetch products');
    process.exit(1);
  }

  let brandAssignCount = 0;
  for (const p of allProducts) {
    if (p.brand_id !== null) continue;

    let matchedSlug: string | null = null;
    for (const bp of BRAND_PATTERNS) {
      if (bp.pattern.test(p.name)) {
        matchedSlug = bp.brandSlug;
        break;
      }
    }

    if (matchedSlug) {
      const brand = brandBySlug.get(matchedSlug);
      if (brand) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { error } = await supabase
            .from('products')
            .update({ brand_id: brand.id })
            .eq('id', p.id);

          if (!error) {
            brandAssignCount++;
            break;
          } else if (attempt === 3) {
            console.error(`  ❌ Failed to assign brand to "${p.name}": ${error.message}`);
          } else {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    }
  }

  console.log(`  Assigned brand_id to ${brandAssignCount} additional products`);
  const { count: nullBrandCountAfter } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('brand_id', null);
  console.log(`  Products still with NULL brand_id: ${nullBrandCountAfter}`);

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1d: Assign category_id to products with NULL category
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STEP 1d: Assigning category_id to products');
  console.log('────────────────────────────────────────────────────────────────');

  const { data: allCategories } = await supabase.from('categories').select('id, slug, name');
  if (!allCategories) {
    console.error('❌ Failed to fetch categories');
    process.exit(1);
  }
  const catBySlug = new Map(allCategories.map(c => [c.slug, c]));

  const { data: productsForCat } = await supabase
    .from('products')
    .select('id, name, slug, brand_id, category_id')
    .is('category_id', null);

  let catAssignCount = 0;
  for (const p of productsForCat || []) {
    let matchedCatSlug: string | null = null;

    if (MOBILE_FAMILIES.test(p.name)) {
      matchedCatSlug = 'mobiles';
    }

    if (!matchedCatSlug) {
      for (const ck of CATEGORY_KEYWORDS) {
        if (ck.keywords.test(p.name)) {
          matchedCatSlug = ck.categorySlug;
          break;
        }
      }
    }

    if (matchedCatSlug) {
      const cat = catBySlug.get(matchedCatSlug);
      if (cat) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { error } = await supabase
            .from('products')
            .update({ category_id: cat.id })
            .eq('id', p.id);

          if (!error) {
            catAssignCount++;
            break;
          } else if (attempt === 3) {
            console.error(`  ❌ Failed to assign category to "${p.name}": ${error.message}`);
          } else {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    }
  }

  console.log(`  Assigned category_id to ${catAssignCount} additional products`);
  const { count: nullCatCountAfter } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('category_id', null);
  console.log(`  Products still with NULL category_id: ${nullCatCountAfter}`);

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1e: Fix duplicate leading brand prefixes + Recompute normalized_name
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STEP 1e: Fixing duplicate prefixes & recomputing normalized_name');
  console.log('────────────────────────────────────────────────────────────────');

  const { data: allProductsFresh } = await supabase
    .from('products')
    .select('id, name, slug, normalized_name');

  let dupPrefixFixCount = 0;
  let normalizedUpdateCount = 0;

  for (const p of allProductsFresh || []) {
    let newName = p.name;
    let nameChanged = false;

    // Check for duplicate leading word (case-insensitive)
    // E.g. "Infinix Infinix XE30" -> "Infinix XE30" or "Samsung Samsung Galaxy"
    const cleanedLeading = newName.replace(/^([A-Za-z0-9]+)[\s-]+(\1)\b/i, '$1');
    if (cleanedLeading !== newName) {
      newName = cleanedLeading;
      nameChanged = true;
      dupPrefixFixCount++;
      console.log(`  Fixed dup prefix: "${p.name}" → "${newName}"`);
    }

    const newNormalized = normalizeProductName(newName);
    const needsNormUpdate = newNormalized !== p.normalized_name;

    if (nameChanged || needsNormUpdate) {
      const updateData: any = { normalized_name: newNormalized };
      if (nameChanged) {
        updateData.name = newName;
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', p.id);

        if (!error) {
          normalizedUpdateCount++;
          break;
        } else if (attempt === 3) {
          console.error(`  ❌ Failed to update "${p.name}": ${error.message}`);
        } else {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }

  console.log(`  Duplicate prefix fixes: ${dupPrefixFixCount}`);
  console.log(`  normalized_name recomputed: ${normalizedUpdateCount} / ${allProductsFresh?.length || 0}`);

  // ══════════════════════════════════════════════════════════════════════
  // Final Integrity Check
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  PHASE 1 COMPLETE — FINAL INTEGRITY CHECK');
  console.log('════════════════════════════════════════════════════════════════');

  const { count: prodCountFinal } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCountFinal } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: brandsCountFinal } = await supabase.from('brands').select('*', { count: 'exact', head: true });
  const { count: nullBrandFinal } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('brand_id', null);
  const { count: nullCatFinal } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('category_id', null);

  console.log(`  Products          : ${prodCountFinal} (expected 822) ${prodCountFinal === 822 ? '✓' : '❌'}`);
  console.log(`  Variants          : ${varCountFinal} (expected 822) ${varCountFinal === 822 ? '✓' : '❌'}`);
  console.log(`  Brands in DB      : ${brandsBeforeCount} → ${brandsCountFinal}`);
  console.log(`  NULL brand_id     : ${nullBrandCountBefore} → ${nullBrandFinal}`);
  console.log(`  NULL category_id  : ${nullCatCountBefore} → ${nullCatFinal}`);
  console.log(`  Dup prefix fixes  : ${dupPrefixFixCount}`);
  console.log(`  Normalized updates: ${normalizedUpdateCount}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (prodCountFinal !== 822 || varCountFinal !== 822) {
    console.error('❌ INTEGRITY VIOLATION: Product/variant counts changed!');
    process.exit(1);
  }

  console.log('✅ Phase 1 completed successfully — catalog enriched.\n');
}

main().catch(err => {
  console.error('Fatal error in phase1-6u-enrich-catalog:', err);
  process.exit(1);
});
