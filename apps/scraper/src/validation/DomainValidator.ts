/**
 * DomainValidator (Increment 6I)
 * Provides strict hostname-boundary validation for store domains.
 */

export const STORE_BASE_DOMAINS: Record<string, string> = {
  priceoye: 'priceoye.pk',
  telemart: 'telemart.pk',
  'mega-pk': 'mega.pk',
  shophive: 'shophive.com',
  paklap: 'paklap.pk',
  daraz: 'daraz.pk',
};

/**
 * Validates that a raw URL belongs strictly to the expected domain.
 * Enforces hostname boundary: hostname === expectedDomain OR hostname.endsWith(`.${expectedDomain}`).
 * Normalizes hostnames by lowercasing, trimming, and stripping trailing dots.
 */
export function isValidStoreDomain(rawUrl: string, expectedDomain: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname
      .toLowerCase()
      .trim()
      .replace(/\.+$/, '');

    const expected = expectedDomain
      .toLowerCase()
      .trim()
      .replace(/\.+$/, '');

    if (!hostname || !expected) return false;

    return hostname === expected || hostname.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}
