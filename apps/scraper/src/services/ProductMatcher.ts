import { ScrapedProductSchemaType } from '../types/scraperTypes';
import { ProductRepository } from '../repositories/ProductRepository';
import { 
  normalizeProductName, 
  normalizeModelNumber, 
  normalizeGtin,
  calculateStringSimilarity,
  isConflictingProductFamily,
  specsCompatible,
} from '@pakprice/shared';
import { Product, ProductVariant, MatchResult, MatchCandidate, MatchMethod } from '@pakprice/shared';
import { logger } from '../scrapers/base/BaseScraper';

export class ProductMatcher {
  private productRepo = new ProductRepository();

  /**
   * Matches a scraped product to an existing variant/product in the database.
   *
   * Returns a structured MatchResult with status, method, confidence,
   * matched product/variant, candidates, and reason.
   *
   * Matching priority (strict, first match wins):
   *   1. GTIN exact match (with mod-10 checksum validation)
   *   2. Store Identifier (store_id, identifier_type, identifier)
   *   3. Brand + Model Number → product family, then variant specs
   *   4. Exact product name + variant specs (NULL = unknown, not different)
   *   5. Strong specs match (heuristic, ≥ 0.90 confidence, not proof)
   *   6. Fuzzy candidate evaluation (ambiguous → reject auto-merge)
   */
  async match(scraped: ScrapedProductSchemaType, storeId: string): Promise<MatchResult> {
    
    // ── Tier 1: GTIN exact match ─────────────────────────────────────
    if (scraped.gtin) {
      const validatedGtin = normalizeGtin(scraped.gtin);
      if (validatedGtin) {
        const match = await this.productRepo.getVariantByGtin(validatedGtin);
        if (match) {
          logger.info({ variantId: match.variant.id, strategy: 'GTIN', gtin: validatedGtin }, 'Product matched');
          return {
            status: 'matched',
            method: 'gtin',
            confidence: 1.0,
            product: match.product,
            variant: match.variant,
            candidates: [],
            reason: `GTIN exact match: ${validatedGtin}`,
          };
        }
      } else {
        logger.warn({ gtin: scraped.gtin, product: scraped.name }, 'GTIN failed checksum validation, skipping GTIN tier');
      }
    }

    // ── Tier 2: Store Identifier ──────────────────────────────────────
    if (scraped.sourceIdentifier) {
      const match = await this.productRepo.getVariantByIdentifier(storeId, scraped.sourceIdentifierType, scraped.sourceIdentifier);
      if (match) {
        logger.info({ variantId: match.variant.id, strategy: 'StoreIdentifier' }, 'Product matched');
        return {
          status: 'matched',
          method: 'store_identifier',
          confidence: 1.0,
          product: match.product,
          variant: match.variant,
          candidates: [],
          reason: `Store identifier match: ${scraped.sourceIdentifierType}=${scraped.sourceIdentifier}`,
        };
      }
    }

    // ── Tier 3: Brand + Model Number → product family (NOT variant) ──
    // Brand + model identifies the product family. Variant identity
    // requires further spec matching within that family.
    if (scraped.modelNumber) {
      const normalizedModel = normalizeModelNumber(scraped.modelNumber);
      const variants = await this.productRepo.getVariantsByModelNumber(normalizedModel);
      
      if (variants.length > 0) {
        // We have product family candidates via model number.
        // Now find the variant with compatible specs within this family.
        const familyVariants = variants.map(v => v.variant);
        for (const { variant, product } of variants) {
          if (this.variantSpecsCompatible(scraped, variant, familyVariants)) {
            logger.info({ variantId: variant.id, strategy: 'BrandModel+Specs', model: normalizedModel }, 'Product matched');
            return {
              status: 'matched',
              method: 'brand_model',
              confidence: 0.95,
              product,
              variant,
              candidates: [],
              reason: `Brand+model family match (${normalizedModel}), variant specs compatible`,
            };
          }
        }
        
        // Model matched but no variant has compatible specs — this is likely
        // a new variant within the known product family
        logger.info({ model: normalizedModel, variantCount: variants.length }, 'Model matched but no compatible variant found');
      }
    }

    // ── Tier 4: Exact product name + variant specs ────────────────────
    const normalizedName = normalizeProductName(scraped.name);
    const brand = scraped.brand ? await this.productRepo.getBrandByNormalizedName(normalizeProductName(scraped.brand)) : null;
    const brandId = brand ? brand.id : null;

    const matchedProduct = await this.productRepo.fuzzySearchProduct(normalizedName, brandId);
    
    if (matchedProduct) {
      // Find variant with compatible specs (NULL = unknown, not different)
      const compatibleVariant = await this.productRepo.findVariantBySpecsNullSafe(
        matchedProduct.id,
        scraped.ramGb || null,
        scraped.storageGb || null,
        scraped.color || null,
        scraped.modelNumber ? normalizeModelNumber(scraped.modelNumber) : null
      );
      
      if (compatibleVariant) {
        logger.info({ variantId: compatibleVariant.id, strategy: 'ExactSpecs' }, 'Product matched');
        return {
          status: 'matched',
          method: 'exact_specs',
          confidence: 0.90,
          product: matchedProduct,
          variant: compatibleVariant,
          candidates: [],
          reason: `Exact product name match + compatible variant specs`,
        };
      }
    }

    // ── Tier 5: Strong specs match (heuristic, ≥ 0.90, not proof) ─────
    if (matchedProduct) {
      const allVariants = await this.productRepo.getAllVariants(matchedProduct.id);
      const strongCandidates: MatchCandidate[] = [];

      for (const v of allVariants) {
        if (this.variantSpecsCompatible(scraped, v, allVariants)) {
          const similarity = calculateStringSimilarity(normalizedName, matchedProduct.normalized_name || matchedProduct.name);
          if (similarity >= 0.90) {
            strongCandidates.push({
              productId: matchedProduct.id,
              variantId: v.id,
              productName: matchedProduct.name,
              variantName: v.name,
              confidence: similarity,
              method: 'strong_specs',
            });
          }
        }
      }

      if (strongCandidates.length === 1) {
        const c = strongCandidates[0];
        const variant = allVariants.find(v => v.id === c.variantId)!;
        logger.info({ variantId: variant.id, strategy: 'StrongSpecs', confidence: c.confidence }, 'Product matched');
        return {
          status: 'matched',
          method: 'strong_specs',
          confidence: c.confidence,
          product: matchedProduct,
          variant,
          candidates: strongCandidates,
          reason: `Strong specs match (confidence: ${c.confidence.toFixed(3)})`,
        };
      }

      if (strongCandidates.length > 1) {
        logger.warn({ productName: scraped.name, candidateCount: strongCandidates.length }, 'Multiple strong candidates — ambiguous');
        return {
          status: 'ambiguous',
          method: 'strong_specs',
          confidence: 0,
          product: null,
          variant: null,
          candidates: strongCandidates,
          reason: `${strongCandidates.length} strong candidates with close scores — ambiguous, rejecting auto-merge`,
        };
      }
    }

    // ── Tier 6: Fuzzy candidate evaluation ────────────────────────────
    // Search all products for name similarity. This is a last resort.
    // Ambiguous or conflicting candidates are strictly rejected.
    const fuzzyCandidates = await this.findFuzzyCandidates(scraped, normalizedName, brandId);

    if (fuzzyCandidates.length === 1) {
      const c = fuzzyCandidates[0];
      // Safety check: product family conflict detection
      const candidateProduct = await this.productRepo.getProductById(c.productId);
      if (candidateProduct && !isConflictingProductFamily(normalizedName, candidateProduct.normalized_name || candidateProduct.name)) {
        const variant = await this.productRepo.getVariantById(c.variantId);
        if (variant) {
          const productVariants = await this.productRepo.getAllVariants(c.productId);
          if (this.variantSpecsCompatible(scraped, variant, productVariants)) {
            logger.info({ variantId: c.variantId, strategy: 'Fuzzy', confidence: c.confidence }, 'Product matched via fuzzy');
            return {
              status: 'matched',
              method: 'fuzzy',
              confidence: c.confidence,
              product: candidateProduct,
              variant,
              candidates: fuzzyCandidates,
              reason: `Fuzzy match (confidence: ${c.confidence.toFixed(3)}, no family conflict)`,
            };
          }
        }
      }
    }

    if (fuzzyCandidates.length > 1) {
      // Check if top two candidates are too close in score
      const sorted = [...fuzzyCandidates].sort((a, b) => b.confidence - a.confidence);
      const delta = sorted[0].confidence - sorted[1].confidence;
      if (delta < 0.05) {
        logger.warn({ productName: scraped.name, candidateCount: sorted.length, topDelta: delta }, 'Fuzzy candidates too close — ambiguous');
        return {
          status: 'ambiguous',
          method: 'fuzzy',
          confidence: 0,
          product: null,
          variant: null,
          candidates: fuzzyCandidates,
          reason: `${fuzzyCandidates.length} fuzzy candidates with delta ${delta.toFixed(3)} < 0.05 — ambiguous`,
        };
      }
    }

    // ── No match ──────────────────────────────────────────────────────
    return {
      status: 'no_match',
      method: null,
      confidence: 0,
      product: null,
      variant: null,
      candidates: fuzzyCandidates,
      reason: 'No matching product/variant found',
    };
  }

  /**
   * Check if scraped specs are compatible with an existing variant.
   * NULL on scraped side = unknown = compatible (correction #2).
   * Only explicit conflicting values constitute a mismatch.
   *
   * In Increment 6X:
   * 1. Strict RAM and Storage matching is preserved.
   * 2. Color difference alone does NOT reject a match if the product only has 1 variant
   *    or if only 1 variant exists for that RAM+storage tier.
   * 3. If multiple variants exist for the same RAM+storage, exact color match is prioritized.
   */
  private variantSpecsCompatible(
    scraped: ScrapedProductSchemaType,
    variant: ProductVariant,
    allProductVariants?: ProductVariant[]
  ): boolean {
    const ramOk = specsCompatible(scraped.ramGb || null, variant.ram_gb);
    const storageOk = specsCompatible(scraped.storageGb || null, variant.storage_gb);
    if (!ramOk || !storageOk) return false;

    // Strict color match
    if (specsCompatible(scraped.color || null, variant.color)) {
      return true;
    }

    // If only 1 variant exists (or no siblings passed), allow color relaxation
    if (!allProductVariants || allProductVariants.length <= 1) {
      return true;
    }

    // Check variants sharing the same RAM + Storage tier
    const sameTierVariants = allProductVariants.filter(
      v => specsCompatible(v.ram_gb, variant.ram_gb) && specsCompatible(v.storage_gb, variant.storage_gb)
    );
    if (sameTierVariants.length <= 1) {
      return true;
    }

    // If another sibling variant has an exact match for the scraped color, prefer that one
    const exactColorMatchExists = sameTierVariants.some(
      v => specsCompatible(scraped.color || null, v.color)
    );
    return !exactColorMatchExists;
  }

  /**
   * Search for fuzzy product name candidates, filtered by brand if available.
   */
  private async findFuzzyCandidates(
    scraped: ScrapedProductSchemaType,
    normalizedName: string,
    brandId: string | null,
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];
    const products = await this.productRepo.searchProductsByNameSimilarity(normalizedName, brandId, 5);

    for (const p of products) {
      const candidateNormName = normalizeProductName(p.normalized_name || p.name);
      const similarity = calculateStringSimilarity(normalizedName, candidateNormName);
      if (similarity < 0.75) continue;

      // Product family conflict check
      if (isConflictingProductFamily(normalizedName, candidateNormName)) continue;

      const variants = await this.productRepo.getAllVariants(p.id);
      for (const v of variants) {
        if (this.variantSpecsCompatible(scraped, v, variants)) {
          candidates.push({
            productId: p.id,
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            confidence: similarity,
            method: 'fuzzy',
          });
        }
      }
    }

    return candidates;
  }
}
