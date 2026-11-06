/**
 * RedirectValidator (Increment 6I)
 * Verifies that redirected PDP URLs preserve store-specific source identities.
 * Does NOT treat HTTP 200 as proof of validity.
 */

export interface RedirectValidationInput {
  storeSlug: string;
  originalUrl: string;
  finalUrl: string;
  scrapedIdentifier?: string | null;
  scrapedIdentifierType?: string | null;
  scrapedSku?: string | null;
  knownIdentifier?: string | null;
  knownIdentifierType?: string | null;
}

export interface RedirectValidationResult {
  isValid: boolean;
  reason?: string;
}

export function validateStoreRedirect(input: RedirectValidationInput): RedirectValidationResult {
  const { storeSlug, originalUrl, finalUrl, scrapedIdentifier, scrapedSku, knownIdentifier } = input;

  try {
    const originalParsed = new URL(originalUrl);
    const finalParsed = new URL(finalUrl);

    // Fast path: No redirect occurred (exact URL match, ignoring trailing slashes/hashes)
    if (
      originalParsed.hostname === finalParsed.hostname &&
      originalParsed.pathname.replace(/\/+$/, '') === finalParsed.pathname.replace(/\/+$/, '')
    ) {
      return { isValid: true };
    }

    const finalPath = finalParsed.pathname.toLowerCase();

    // Reject generic home/category/search landings across all stores
    if (finalPath === '/' || finalPath === '' || finalPath === '/search' || finalPath.startsWith('/search/')) {
      return { isValid: false, reason: 'Redirected to homepage or search page' };
    }

    switch (storeSlug) {
      case 'priceoye': {
        // PriceOye: Reject category pages
        const isCategory =
          finalPath === '/smart-phones' ||
          finalPath === '/laptops' ||
          finalPath === '/tablets' ||
          finalPath === '/smart-watches' ||
          finalPath === '/earbuds' ||
          finalPath === '/power-banks' ||
          finalPath.split('/').filter(Boolean).length <= 1;

        if (isCategory) {
          return { isValid: false, reason: 'PriceOye redirected to category or listing page' };
        }

        // If knownIdentifier exists and scrapedIdentifier exists, verify identity matches
        if (knownIdentifier && scrapedIdentifier && knownIdentifier !== scrapedIdentifier) {
          return {
            isValid: false,
            reason: `PriceOye product identity mismatch: known ${knownIdentifier} vs scraped ${scrapedIdentifier}`,
          };
        }
        return { isValid: true };
      }

      case 'telemart': {
        // Telemart (Shopify): Reject collection or catalog landings
        if (finalPath.startsWith('/collections/') && !finalPath.includes('/products/')) {
          return { isValid: false, reason: 'Telemart redirected to collections listing' };
        }
        if (!finalPath.includes('/products/')) {
          return { isValid: false, reason: 'Telemart redirected outside /products/ namespace' };
        }

        // If knownIdentifier exists (Shopify raw.id, SKU, or handle)
        if (knownIdentifier && scrapedIdentifier && knownIdentifier !== scrapedIdentifier) {
          // If both are present and differ, reject
          return {
            isValid: false,
            reason: `Telemart product identity mismatch: known ${knownIdentifier} vs scraped ${scrapedIdentifier}`,
          };
        }
        return { isValid: true };
      }

      case 'mega-pk': {
        // Mega.pk: Must maintain numeric ID in pattern `_products/(\d+)/`
        const origIdMatch = originalUrl.match(/_products\/(\d+)\//);
        const finalIdMatch = finalUrl.match(/_products\/(\d+)\//);

        if (!finalIdMatch) {
          return { isValid: false, reason: 'Mega.pk redirected to non-product URL (missing numeric product ID)' };
        }

        const origId = origIdMatch ? origIdMatch[1] : knownIdentifier;
        const finalId = finalIdMatch[1];

        if (origId && origId !== finalId) {
          return {
            isValid: false,
            reason: `Mega.pk product ID changed during redirect: expected ${origId}, got ${finalId}`,
          };
        }
        return { isValid: true };
      }

      case 'shophive': {
        // Shophive (Magento): Reject category or cart landings
        if (finalPath.includes('/checkout/') || finalPath.includes('/customer/')) {
          return { isValid: false, reason: 'Shophive redirected to checkout/customer page' };
        }

        // Shophive stable identity is SKU
        const effectiveSku = scrapedSku || scrapedIdentifier;
        if (knownIdentifier && effectiveSku && knownIdentifier !== effectiveSku) {
          return {
            isValid: false,
            reason: `Shophive SKU changed during redirect: expected ${knownIdentifier}, got ${effectiveSku}`,
          };
        }
        return { isValid: true };
      }

      default:
        // Generic fallback for any other store: ensure path didn't collapse to root
        return { isValid: finalPath !== '/' };
    }
  } catch (err: any) {
    return { isValid: false, reason: `URL parse failure during redirect validation: ${err.message}` };
  }
}
