/**
 * Normalization utilities for PakPrice.
 *
 * All functions are deterministic: the same input always produces the same output.
 * Used in Phase 2 by the API (slug generation, display) and by Phase 3 scrapers
 * (product deduplication and variant matching).
 *
 * Design rules:
 *   - Inputs are always trimmed before processing.
 *   - Outputs never contain leading/trailing whitespace.
 *   - Storage values are always returned as integers (GB).
 *   - parseRam / parseStorage return null for unrecognised input rather than 0,
 *     so callers can distinguish "not applicable" from "parsed as zero".
 */

// ────────────────────────────────────────────────────────────────────────────
// Brand
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a brand name for deduplication and fuzzy matching.
 * Lowercases and collapses internal whitespace. Preserves known acronyms
 * (hp, lg, tcl, jbl) in their lowercase form — the database slug is the
 * canonical identifier, not this string.
 *
 * Examples:
 *   "SAMSUNG"       → "samsung"
 *   "  Apple  "     → "apple"
 *   "OnePlus"       → "oneplus"
 *   "HP"            → "hp"
 */
export function normalizeBrandName(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ────────────────────────────────────────────────────────────────────────────
// Product name
// ────────────────────────────────────────────────────────────────────────────

// Pakistani retailer marketing fluff patterns (e.g. Telemart, Mega.pk, Shophive)
// These phrases are merchandising text appended by retailers and do not define the product identity.
const RETAIL_NOISE_PATTERNS = [
  /\bdual[\s-]sim\b/gi,
  /\bwith\s+official\s+warranty\b/gi,
  /\bofficial\s+warranty\b/gi,
  /\bwith\s+1\s+year\s+warranty\b/gi,
  /\bwith\s+warranty\b/gi,
  /\b1\s+year\s+warranty\b/gi,
  /\bpta\s+approved\b/gi,
  /\bnon[\s-]pta\b/gi,
  /\b100%\s+original\b/gi,
  /\bofficial\s+brand\s+warranty\b/gi,
  /\btrue\s+wireless\b/gi,
  /\bbluetooth\b/gi,
  /\btws\b/gi,
  /\bgaming\s+(?=(?:wireless\s+)?earbuds\b)/gi,
  /\bfast\s+charging\b/gi,
  /\bpd\s*\d+(?:\.\d+)?\s*w\b/gi,
  /\b\d+(?:\.\d+)?\s*w\s+fast\s+charging\b/gi,
  /\bprice\s+in\s+pakistan\b/gi,
  /\bpin\s+pack\b/gi,
];

/**
 * Strips common Pakistani retail merchandising noise (e.g. "Dual Sim With Official Warranty", "PTA Approved").
 */
export function stripRetailNoise(name: string): string {
  let cleaned = name;
  for (const pat of RETAIL_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pat, ' ');
  }
  return cleaned.trim().replace(/\s+/g, ' ');
}

/**
 * Normalise a product name for fuzzy matching and deduplication.
 * Lowercases, strips store merchandising noise, trims, and collapses runs of whitespace.
 * Does NOT strip model information — "Galaxy A56 5G" stays as-is.
 *
 * Examples:
 *   "Samsung Galaxy A56 5G"                                 → "samsung galaxy a56 5g"
 *   "Samsung Galaxy A07 Dual Sim With Official Warranty"    → "samsung galaxy a07"
 *   "  iPhone  16  Pro  "                                   → "iphone 16 pro"
 *   "Redmi Note 13 Pro+"                                    → "redmi note 13 pro+"
 */
export function normalizeProductName(name: string): string {
  // Strip parentheses and brackets around alphanumeric tokens: (XE30) -> XE30
  let cleaned = name.replace(/[()[\]]/g, ' ');
  cleaned = stripRetailNoise(cleaned);
  let normalized = cleaned
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bsmart[\s-]watch\b/g, 'smartwatch')
    .replace(/\bpower\s*bank\b/g, 'powerbank')
    .replace(/(\d+)\s*mah\b/g, '$1mah')
    .replace(/\bpowerbank\s+(\d+mah)\b/g, '$1 powerbank')
    .replace(/(?:true\s+wireless|wireless|bluetooth|gaming)\s+earbuds\b/g, 'earbuds');

  // Transpose "earbuds <model>" if the model token was appended after earbuds (e.g. from "(XE30)")
  normalized = normalized.replace(/\bearbuds\s+([a-z0-9]+(?:-[a-z0-9]+)?)\b/g, '$1 earbuds');

  // Deduplicate consecutive identical words (e.g. "infinix infinix xe30" -> "infinix xe30")
  normalized = normalized.replace(/\b(\w+)(?:\s+\1\b)+/g, '$1');

  return normalized.trim().replace(/\s+/g, ' ');
}

// ────────────────────────────────────────────────────────────────────────────
// Model number
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a manufacturer model number.
 * Uppercases and removes all internal whitespace.
 * Preserves hyphens and slashes which are structurally significant.
 *
 * Examples:
 *   "sm-a566blbdpak"    → "SM-A566BLBDPAK"
 *   " SM A566BLBD PAK " → "SMA566BLBDPAK"
 *   "MXWK3PK/A"         → "MXWK3PK/A"
 */
export function normalizeModelNumber(model: string): string {
  return model.trim().toUpperCase().replace(/\s+/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// RAM
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a RAM string into a number of gigabytes.
 * Returns null if the string cannot be parsed (not 0 — callers must distinguish
 * "not applicable" from "zero").
 *
 * Examples:
 *   "8GB"    → 8
 *   "8 GB"   → 8
 *   "8 gb"   → 8
 *   "6"      → 6   (bare integer interpreted as GB)
 *   "12.0GB" → 12
 *   "abc"    → null
 */
export function parseRam(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw > 0 ? Math.round(raw) : null;

  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)\s*GB?$/);
  if (!match) {
    // Try bare integer
    const bare = parseInt(s, 10);
    return isNaN(bare) || bare <= 0 ? null : bare;
  }
  const gb = parseFloat(match[1]);
  return gb > 0 ? Math.round(gb) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Storage
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a storage string into a number of gigabytes.
 * Handles TB/TB input and converts to GB.
 * Returns null if the string cannot be parsed.
 *
 * Examples:
 *   "128GB"   → 128
 *   "128 GB"  → 128
 *   "256 gb"  → 256
 *   "1TB"     → 1024
 *   "1 TB"    → 1024
 *   "512"     → 512  (bare integer interpreted as GB)
 *   "abc"     → null
 */
export function parseStorage(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw > 0 ? Math.round(raw) : null;

  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');

  // TB match
  const tbMatch = s.match(/^(\d+(?:\.\d+)?)\s*TB?$/);
  if (tbMatch) {
    const tb = parseFloat(tbMatch[1]);
    return tb > 0 ? Math.round(tb * 1024) : null;
  }

  // GB match
  const gbMatch = s.match(/^(\d+(?:\.\d+)?)\s*GB?$/);
  if (gbMatch) {
    const gb = parseFloat(gbMatch[1]);
    return gb > 0 ? Math.round(gb) : null;
  }

  // Bare integer — treated as GB
  const bare = parseInt(s, 10);
  return isNaN(bare) || bare <= 0 ? null : bare;
}

// ────────────────────────────────────────────────────────────────────────────
// Color
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a color name for comparison and deduplication.
 * Lowercases, trims, and collapses whitespace.
 * Preserves full color names (e.g. "awesome navy") since these are
 * manufacturer-specific and meaningful.
 *
 * Examples:
 *   "Awesome Navy"   → "awesome navy"
 *   "BLACK"          → "black"
 *   "  Midnight  Black  " → "midnight black"
 */
export function normalizeColor(color: string): string {
  return color.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ────────────────────────────────────────────────────────────────────────────
// Product slug
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug for a product.
 * Combines brand name and product name, lowercases, replaces non-alphanumeric
 * characters with hyphens, and collapses consecutive hyphens.
 *
 * This slug is used as the permanent URL identifier for a product.
 * Once assigned and stored in the database, a slug must not be regenerated
 * from a different input — it would create a different URL.
 *
 * Examples:
 *   ('Samsung', 'Galaxy A56')  → "samsung-galaxy-a56"
 *   ('Apple', 'iPhone 16 Pro') → "apple-iphone-16-pro"
 *   ('HP', 'Spectre x360 14')  → "hp-spectre-x360-14"
 */
export function generateProductSlug(brand: string, productName: string): string {
  const combined = `${brand.trim()} ${productName.trim()}`;
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric except hyphens
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^-|-$/g, '');         // strip leading/trailing hyphens
}

// ────────────────────────────────────────────────────────────────────────────
// Variant display name
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the human-readable variant name label stored in product_variants.name.
 * Only includes non-null fields. Separator is " / ".
 *
 * Examples:
 *   (8, 128, "Awesome Navy")   → "8GB / 128GB / Awesome Navy"
 *   (8, 128, null)             → "8GB / 128GB"
 *   (null, null, "Black")      → "Black"
 *   (null, null, null)         → "Default"
 */
export function buildVariantName(
  ramGb: number | null,
  storageGb: number | null,
  color: string | null
): string {
  const parts: string[] = [];
  if (ramGb !== null) parts.push(`${ramGb}GB`);
  if (storageGb !== null) {
    parts.push(storageGb >= 1024 ? `${storageGb / 1024}TB` : `${storageGb}GB`);
  }
  if (color !== null && color.trim() !== '') parts.push(color.trim());
  return parts.length > 0 ? parts.join(' / ') : 'Default';
}

// ────────────────────────────────────────────────────────────────────────────
// Normalised variant name (for deduplication)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the normalised variant name stored in product_variants.normalized_name.
 * Used by Phase 3 scrapers to identify duplicate variants.
 *
 * Examples:
 *   (8, 128, "Awesome Navy")   → "8gb 128gb awesome navy"
 *   (null, null, "Black")      → "black"
 */
export function buildNormalizedVariantName(
  ramGb: number | null,
  storageGb: number | null,
  color: string | null
): string {
  const parts: string[] = [];
  if (ramGb !== null) parts.push(`${ramGb}gb`);
  if (storageGb !== null) {
    parts.push(storageGb >= 1024 ? `${storageGb / 1024}tb` : `${storageGb}gb`);
  }
  if (color !== null && color.trim() !== '') parts.push(normalizeColor(color));
  return parts.join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
// GTIN validation (with GS1 mod-10 check digit)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate and normalise a GTIN (EAN/UPC barcode).
 *
 * Validates:
 *   1. Only digits (after stripping whitespace).
 *   2. Length is 8, 12, 13, or 14.
 *   3. The GS1 mod-10 check digit is correct.
 *
 * Returns the cleaned digit string, or null if invalid.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s+/g, '');
  if (!/^\d+$/.test(s)) return null;
  if (![8, 12, 13, 14].includes(s.length)) return null;

  const digits = s.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check ? s : null;
}

// ────────────────────────────────────────────────────────────────────────────
// RAM extraction from product title
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract RAM in GB from a product title string.
 * Avoids model numbers and storage-only values.
 * Returns null if no confident RAM extraction is possible.
 */
export function extractRamFromTitle(title: string): number | null {
  if (!title) return null;
  const s = title.trim();

  const ramExplicit = s.match(/(\d{1,3})[-\s]*GB[-\s]*RAM/i)
    || s.match(/RAM\s*:?\s*(\d{1,3})[-\s]*GB/i);
  if (ramExplicit) {
    const val = parseInt(ramExplicit[1], 10);
    if (val > 0 && val <= 128) return val;
  }

  const slashPair = s.match(/\b(\d{1,3})[-\s]*GB\s*[\/+]\s*(\d{1,4})[-\s]*(?:GB|TB)/i);
  if (slashPair) {
    const ram = parseInt(slashPair[1], 10);
    const storage = parseInt(slashPair[2], 10);
    if (ram > 0 && ram <= 128 && storage > ram) return ram;
  }

  const spacePair = s.match(/\b(\d{1,3})[-\s]*GB\s+(\d{1,4})[-\s]*(?:GB|TB)/i);
  if (spacePair) {
    const ram = parseInt(spacePair[1], 10);
    const storage = parseInt(spacePair[2], 10);
    if (ram > 0 && ram <= 128 && storage > ram) return ram;
  }

  const romPattern = s.match(/(\d{1,3})[-\s]*GB\s+(\d{1,4})[-\s]*GB\s*ROM/i);
  if (romPattern) {
    const val = parseInt(romPattern[1], 10);
    if (val > 0 && val <= 128) return val;
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Storage extraction from product title
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract storage in GB from a product title string.
 * Avoids camera megapixels and model numbers.
 * Returns null if no confident storage extraction is possible.
 */
export function extractStorageFromTitle(title: string): number | null {
  if (!title) return null;
  const s = title.trim();

  const tbMatch = s.match(/\b(\d{1,2})[-\s]*TB\b/i);
  if (tbMatch) {
    const val = parseInt(tbMatch[1], 10);
    if (val > 0 && val <= 16) return val * 1024;
  }

  const romExplicit = s.match(/(\d{1,4})[-\s]*GB\s*(?:ROM|Storage|SSD)/i)
    || s.match(/(?:ROM|Storage|SSD)\s*:?\s*(\d{1,4})[-\s]*GB/i);
  if (romExplicit) {
    const val = parseInt(romExplicit[1], 10);
    if (val > 0) return val;
  }

  const slashPair = s.match(/\b\d{1,3}[-\s]*GB\s*[\/+]\s*(\d{1,4})[-\s]*GB/i);
  if (slashPair) {
    const val = parseInt(slashPair[1], 10);
    if (val > 0) return val;
  }

  const VALID_STORAGE = [16, 32, 64, 128, 256, 512, 1024, 2048];
  const allGb = [...s.matchAll(/\b(\d{1,4})[-\s]*GB\b/gi)];
  for (let i = allGb.length - 1; i >= 0; i--) {
    const match = allGb[i];
    const val = parseInt(match[1], 10);
    const prefix = s.substring(0, match.index!);
    if (/\d+\s*MP\s*$/i.test(prefix)) continue;
    if (VALID_STORAGE.includes(val)) return val;
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Model number extraction from product title
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract a likely manufacturer model number from a product title.
 * Returns null if no confident extraction is possible.
 */
export function extractModelNumber(title: string): string | null {
  if (!title) return null;

  const samsung = title.match(/\b(SM-[A-Z0-9]+)\b/i);
  if (samsung) return normalizeModelNumber(samsung[1]);

  const apple = title.match(/\b(M[A-Z0-9]{3,}(?:\/[A-Z])?)\b/i)
    || title.match(/\b(A\d{4,})\b/);
  if (apple) return normalizeModelNumber(apple[1]);

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// String similarity (bigram / Dice coefficient)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the Dice coefficient (bigram similarity) between two strings.
 * Returns a value in [0, 1]. This is a safety heuristic — a high score
 * alone is never standalone proof of identity.
 */
export function calculateStringSimilarity(a: string, b: string): number {
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1.0;
  if (sa.length < 2 || sb.length < 2) return 0.0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < sa.length - 1; i++) {
    const bg = sa.substring(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < sb.length - 1; i++) {
    const bg = sb.substring(i, i + 2);
    const count = bigramsA.get(bg);
    if (count && count > 0) {
      intersection++;
      bigramsA.set(bg, count - 1);
    }
  }

  return (2 * intersection) / ((sa.length - 1) + (sb.length - 1));
}

// ────────────────────────────────────────────────────────────────────────────
// Product family conflict detection
// ────────────────────────────────────────────────────────────────────────────

const TIER_MODIFIERS = [
  'ultra', 'pro max', 'pro+', 'pro plus', 'pro', 'plus',
  'max', 'lite', 'mini', 'fe', 'se', 'neo', 'note',
] as const;

const SUBSERIES_KEYWORDS = ['gtr', 'gts', 't-rex', 'bip', 'band', 'tank'];

/**
 * Detect whether two normalised product names represent conflicting
 * product families. Returns true if they should NOT be merged.
 * False positives are safe (just prevents merge). False negatives corrupt data.
 */
export function isConflictingProductFamily(nameA: string, nameB: string): boolean {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  if (a === b) return false;

  // Check subseries keywords (e.g. Amazfit GTR vs Amazfit T-Rex)
  for (const kw of SUBSERIES_KEYWORDS) {
    const hasA = new RegExp(`\\b${kw.replace('-', '[\\s-]')}\\b`, 'i').test(a);
    const hasB = new RegExp(`\\b${kw.replace('-', '[\\s-]')}\\b`, 'i').test(b);
    if (hasA !== hasB) return true;
  }

  const getTiers = (name: string): string[] => {
    const found: string[] = [];
    for (const mod of TIER_MODIFIERS) {
      const re = new RegExp(`\\b${mod.replace('+', '\\+')}\\b`, 'i');
      if (re.test(name)) found.push(mod);
    }
    return found;
  };

  const tiersA = getTiers(a);
  const tiersB = getTiers(b);

  if (tiersA.length !== tiersB.length) return true;

  const sortedA = [...tiersA].sort().join(',');
  const sortedB = [...tiersB].sort().join(',');
  if (sortedA !== sortedB) return true;

  const getModelNumbers = (name: string): string[] => {
    const nums = [...name.matchAll(/\b([a-z]?\d{1,4}[a-z]?)\b/gi)];
    return nums.map(m => m[1].toLowerCase());
  };

  const modelsA = getModelNumbers(a);
  const modelsB = getModelNumbers(b);
  if (modelsA.length !== modelsB.length) return true;
  for (let i = 0; i < modelsA.length; i++) {
    if (modelsA[i] !== modelsB[i]) return true;
  }

  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Variant spec comparison (NULL = unknown semantics)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compare a scraped spec value against an existing variant spec value.
 *
 * NULL on the scraped side means "unknown" (the source didn't report it),
 * NOT "different". Only explicit conflicting values constitute a mismatch.
 *
 *   (null, 8)   → true   (unknown, compatible)
 *   (8, null)   → true   (unknown, compatible)
 *   (8, 8)      → true   (explicit match)
 *   (8, 12)     → false  (explicit conflict)
 */
export function specsCompatible(
  scrapedValue: number | string | null | undefined,
  existingValue: number | string | null | undefined
): boolean {
  if (scrapedValue === null || scrapedValue === undefined) return true;
  if (existingValue === null || existingValue === undefined) return true;

  if (typeof scrapedValue === 'string' && typeof existingValue === 'string') {
    return scrapedValue.toLowerCase().trim() === existingValue.toLowerCase().trim();
  }

  return scrapedValue === existingValue;
}
