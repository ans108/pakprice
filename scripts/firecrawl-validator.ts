/**
 * Increment 6S — Firecrawl Candidate Validator
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { ScrapedProduct } from '../packages/shared/src/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

export interface FirecrawlCandidateJson {
  store_name: string;
  store_slug: string;
  source_product_title: string;
  source_product_url: string;
  brand: string | null;
  model: string | null;
  model_number: string | null;
  category: string | null;
  ram: string | null;
  storage: string | null;
  physical_size: string | null;
  color: string | null;
  price: number;
  original_price: number | null;
  currency: string;
  stock_status: 'in_stock' | 'out_of_stock';
  sku: string | null;
  image_url: string | null;
  description: string | null;
  discovery_method: string;
  extraction_timestamp: string;
}

export interface FirecrawlValidationResult {
  valid: boolean;
  status: 'approved' | 'rejected' | 'collision' | 'ambiguous' | 'spec_conflict' | 'invalid_price';
  canonicalProductId: string;
  matchedVariantId?: string;
  matchedVariantName?: string;
  strategy?: string;
  confidence?: number;
  reason?: string;
  candidateUrl: string;
  candidateTitle: string;
  extractedPrice: number;
}

export class FirecrawlValidator {
  private supabase: SupabaseClient;
  private matcher: ProductMatcher;
  private storeIdMap: Map<string, string> = new Map();

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    this.matcher = new ProductMatcher();
  }

  async init() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: stores, error } = await this.supabase.from('stores').select('id, slug, name');
        if (error) throw error;
        for (const s of stores || []) {
          this.storeIdMap.set(s.slug, s.id);
          if (s.slug === 'mega-pk') this.storeIdMap.set('mega', s.id);
        }
        console.log(`  ✓ Loaded ${this.storeIdMap.size} store mappings`);
        return;
      } catch (err: any) {
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  validateDomain(url: string, storeSlug: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (storeSlug === 'priceoye' && host.includes('priceoye.pk')) return true;
      if (storeSlug === 'telemart' && (host.includes('telemart.pk') || host.includes('telex.pk'))) return true;
      if (storeSlug === 'shophive' && host.includes('shophive.com')) return true;
      if ((storeSlug === 'mega' || storeSlug === 'mega-pk') && host.includes('mega.pk')) return true;
      return false;
    } catch {
      return false;
    }
  }

  async validateCandidate(
    targetCanonicalProduct: any,
    candidate: FirecrawlCandidateJson
  ): Promise<FirecrawlValidationResult> {
    const defaultResult: FirecrawlValidationResult = {
      valid: false,
      status: 'rejected',
      canonicalProductId: targetCanonicalProduct.id,
      candidateUrl: candidate.source_product_url,
      candidateTitle: candidate.source_product_title,
      extractedPrice: candidate.price,
    };

    // 1. Domain verification
    if (!this.validateDomain(candidate.source_product_url, candidate.store_slug)) {
      return {
        ...defaultResult,
        status: 'rejected',
        reason: `Domain mismatch: URL ${candidate.source_product_url} does not match store ${candidate.store_slug}`,
      };
    }

    // 2. Price validation
    if (!candidate.price || candidate.price <= 0 || isNaN(candidate.price)) {
      return {
        ...defaultResult,
        status: 'invalid_price',
        reason: `Invalid price value: ${candidate.price}`,
      };
    }

    const storeId = this.storeIdMap.get(candidate.store_slug);
    if (!storeId) {
      return {
        ...defaultResult,
        status: 'rejected',
        reason: `Unknown store slug: ${candidate.store_slug}`,
      };
    }

    // 3. Map to ScrapedProduct for ProductMatcher
    const scraped: ScrapedProduct = {
      name: candidate.source_product_title,
      price: candidate.price,
      originalPrice: candidate.original_price || undefined,
      url: candidate.source_product_url,
      imageUrl: candidate.image_url || undefined,
      inStock: candidate.stock_status === 'in_stock',
      brand: candidate.brand || undefined,
      model: candidate.model || undefined,
      ram: candidate.ram || undefined,
      storage: candidate.storage || undefined,
      color: candidate.color || undefined,
      sku: candidate.sku || undefined,
    };

    // 4. ProductMatcher evaluation
    const matchResult = await this.matcher.match(scraped, storeId);

    if (matchResult.status === 'ambiguous') {
      return {
        ...defaultResult,
        status: 'ambiguous',
        reason: matchResult.reason || 'Multiple ambiguous variants detected (delta <= 0.05)',
      };
    }

    if (matchResult.status === 'no_match' || !matchResult.product) {
      return {
        ...defaultResult,
        status: 'rejected',
        reason: matchResult.reason || 'Matcher confidence below locked threshold (0.75)',
        confidence: matchResult.confidence,
      };
    }

    // 5. Cross-Product Collision Guard
    if (matchResult.product.id !== targetCanonicalProduct.id) {
      return {
        ...defaultResult,
        status: 'collision',
        reason: `Cross-product collision: Matched product "${matchResult.product.name}" (${matchResult.product.id}) instead of target "${targetCanonicalProduct.name}" (${targetCanonicalProduct.id})`,
        confidence: matchResult.confidence,
      };
    }

    // 6. Size Conflict Guard
    const canonicalSize = (targetCanonicalProduct.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
    const candidateSize = (candidate.source_product_title || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
    if (canonicalSize && candidateSize && canonicalSize !== candidateSize) {
      return {
        ...defaultResult,
        status: 'spec_conflict',
        reason: `Watch size conflict: canonical ${canonicalSize}mm vs candidate ${candidateSize}mm`,
      };
    }

    // 7. Variant Isolation (allowCreate=false)
    const targetVariantId = matchResult.variant?.id || targetCanonicalProduct.variantId;
    if (!targetVariantId) {
      return {
        ...defaultResult,
        status: 'spec_conflict',
        reason: 'Candidate specs do not match any existing variant (allowCreate=false)',
      };
    }

    // 8. Approved Match
    return {
      valid: true,
      status: 'approved',
      canonicalProductId: targetCanonicalProduct.id,
      matchedVariantId: targetVariantId,
      matchedVariantName: matchResult.variant?.name || targetCanonicalProduct.variantName,
      strategy: matchResult.method,
      confidence: matchResult.confidence,
      candidateUrl: candidate.source_product_url,
      candidateTitle: candidate.source_product_title,
      extractedPrice: candidate.price,
      reason: matchResult.reason || 'Exact specifications verified',
    };
  }
}
