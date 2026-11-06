import { z } from 'zod';
import type { ScrapedProduct as IScrapedProduct, Store } from '@pakprice/shared';

// Zod schema enforcing the ScrapedProduct contract
export const ScrapedProductSchema = z.object({
  storeSlug: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceIdentifier: z.string().min(1),
  sourceIdentifierType: z.enum(['sku', 'url_slug', 'product_id', 'barcode', 'asin']),
  
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  modelNumber: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  
  price: z.number().refine((val) => Number.isFinite(val) && val > 0, {
    message: 'Price must be a positive finite number',
  }),
  originalPrice: z.number().nullable().optional().refine(
    (val) => val === null || val === undefined || (Number.isFinite(val) && val >= 0),
    { message: 'Original price must be non-negative finite number' }
  ),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  shippingFee: z.number().min(0).nullable().optional(),
  
  inStock: z.boolean(),
  stockCount: z.number().min(0).nullable().optional(),
  
  ramGb: z.number().min(0).nullable().optional(),
  storageGb: z.number().min(0).nullable().optional(),
  color: z.string().nullable().optional(),
});

export type ScrapedProductSchemaType = z.infer<typeof ScrapedProductSchema>;

// Validate that our Zod schema matches the shared interface
const _typeCheck: IScrapedProduct = {} as ScrapedProductSchemaType;
const _typeCheck2: ScrapedProductSchemaType = {} as IScrapedProduct;

export interface ScrapeMetrics {
  discovered: number;
  scraped: number;
  matched: number;
  newProducts: number;
  newVariants: number;
  updatedPrices: number;
  rejected: number;
  errors: number;
  durationMs: number;
  // 5B matching telemetry
  gtinMatches: number;
  storeIdentifierMatches: number;
  brandModelMatches: number;
  exactSpecsMatches: number;
  strongSpecsMatches: number;
  fuzzyCandidates: number;
  fuzzyRejected: number;
  ambiguousMatches: number;
  // 5C price quality telemetry
  priceValidationWarnings: number;
  priceOutlierRejections: number;
  historyDeduplicated: number;
  historySnapshots: number;
}

export interface IngestionResult {
  action: 'inserted_product' | 'inserted_variant' | 'updated_price' | 'dry_run_matched' | 'dry_run_new' | 'rejected' | 'ambiguous_rejected' | 'outlier_rejected' | 'validation_corrected';
  reason?: string;
  variantId?: string;
  productId?: string;
  matchMethod?: string;
  /** 5C: whether the history insert was deduplicated (skipped) */
  historyDeduplicated?: boolean;
  /** 5C: whether this was a periodic snapshot despite no price change */
  historySnapshot?: boolean;
}

