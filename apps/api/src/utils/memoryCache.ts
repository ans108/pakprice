/**
 * In-Memory LRU Cache for Public Reference Data.
 *
 * ARCHITECTURAL NOTICE:
 * - This cache is PER-PROCESS and PER-INSTANCE.
 * - It is a best-effort latency optimization for quasi-static public reference data
 *   (categories, brands, stores, slug resolution).
 * - It MUST NEVER cache private or user-specific data (favorites, alerts, profiles).
 * - The PostgreSQL database remains the single source of truth at all times.
 */

export const CACHE_NOT_FOUND = Symbol('PAKPRICE_CACHE_NOT_FOUND');

export interface CacheEntry<T> {
  value: T | typeof CACHE_NOT_FOUND;
  expiresAt: number;
}

export interface MemoryCacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
  negativeTtlMs?: number;
}

export class MemoryCache {
  // JavaScript Map preserves insertion order.
  // LRU strategy: On get/set, entry is re-inserted at the end (MRU).
  // When maxEntries is reached, the first key (LRU) is evicted.
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly negativeTtlMs: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 10 * 60 * 1000; // 10 minutes
    this.negativeTtlMs = options.negativeTtlMs ?? 30 * 1000;      // 30 seconds
  }

  /** Normalize key with lowercase, trimmed namespace and identifier */
  private normalizeKey(namespace: string, key: string): string {
    return `${namespace.trim().toLowerCase()}:${key.trim().toLowerCase()}`;
  }

  /**
   * Retrieve an item from cache.
   * - If expired, deletes and returns undefined (cache miss).
   * - If valid, moves entry to MRU end and returns value or CACHE_NOT_FOUND sentinel.
   * - If absent, returns undefined (cache miss).
   */
  get<T>(namespace: string, key: string): T | typeof CACHE_NOT_FOUND | undefined {
    const fullKey = this.normalizeKey(namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      return undefined;
    }

    // Move accessed entry to MRU position
    this.cache.delete(fullKey);
    this.cache.set(fullKey, entry);

    return entry.value as T | typeof CACHE_NOT_FOUND;
  }

  /**
   * Store an item in the cache.
   * Uses strict LRU eviction if size reaches maxEntries.
   */
  set<T>(namespace: string, key: string, value: T, ttlMs?: number): void {
    const fullKey = this.normalizeKey(namespace, key);

    // If key exists, delete it first to refresh insertion order
    if (this.cache.has(fullKey)) {
      this.cache.delete(fullKey);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict least recently used (first key in Map)
      const lruKey = this.cache.keys().next().value;
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    const ttl = ttlMs ?? this.defaultTtlMs;
    this.cache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Store a bounded negative cache entry (explicit sentinel for missing slugs/resources).
   * Bounded to a short TTL (default 30s) so newly added resources are quickly recognized.
   */
  setNotFound(namespace: string, key: string, ttlMs?: number): void {
    this.set(namespace, key, CACHE_NOT_FOUND, ttlMs ?? this.negativeTtlMs);
  }

  /**
   * Invalidate a specific key.
   */
  delete(namespace: string, key: string): boolean {
    return this.cache.delete(this.normalizeKey(namespace, key));
  }

  /**
   * Invalidate all keys under a given namespace (e.g., 'categories', 'brands', 'stores').
   * Provided for future mutation endpoints to invalidate cached public reference data.
   */
  invalidateNamespace(namespace: string): number {
    const prefix = `${namespace.trim().toLowerCase()}:`;
    let count = 0;
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(prefix)) {
        this.cache.delete(k);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Current number of entries stored.
   */
  size(): number {
    return this.cache.size;
  }
}

// Global shared singleton for public reference data
export const memoryCache = new MemoryCache({
  maxEntries: 1000,
  defaultTtlMs: 10 * 60 * 1000,
  negativeTtlMs: 30 * 1000,
});
