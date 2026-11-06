/**
 * PriceValidator — Pure, deterministic price validation module.
 *
 * This module is:
 *   - Pure: no side effects
 *   - Deterministic: same input always produces the same output
 *   - Database-independent: no DB queries or writes
 *   - Independently testable
 *
 * Increment 5C — Price & Data Quality Hardening
 */

import { scraperConfig } from '../config/scraperConfig';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type PriceValidationAction = 'accepted' | 'corrected' | 'rejected';

export type PriceRejectReason =
  | 'invalid_price'
  | 'price_drop_outlier'
  | 'price_increase_outlier'
  | null;

export interface PriceValidationInput {
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  shippingFee: number | null;
  inStock: boolean;
  stockCount: number | null;

  /** From the current DB row for this (variant_id, store_id). Null if no previous row. */
  previousPrice: number | null;
  previousOriginalPrice: number | null;
}

export interface PriceValidationResult {
  action: PriceValidationAction;

  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  shippingFee: number | null;
  stockCount: number | null;

  warnings: string[];

  rejectReason: PriceRejectReason;
}

// ────────────────────────────────────────────────────────────────────────────
// Validator
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate and normalize scraped price data.
 *
 * Returns a result with one of three actions:
 *   - 'accepted'  — all values are valid as-is
 *   - 'corrected' — one or more values were normalized; warnings explain what changed
 *   - 'rejected'  — the price observation must not be persisted
 */
export function validatePrice(input: PriceValidationInput): PriceValidationResult {
  const warnings: string[] = [];
  let hasCorrected = false;

  // ── Rule 1: Price must be finite and positive ────────────────────────
  if (!Number.isFinite(input.price) || input.price <= 0) {
    return {
      action: 'rejected',
      price: input.price,
      originalPrice: input.originalPrice,
      discountPercent: input.discountPercent,
      shippingFee: input.shippingFee,
      stockCount: input.stockCount,
      warnings: [`Invalid price: ${input.price}`],
      rejectReason: 'invalid_price',
    };
  }

  let price = input.price;
  let originalPrice = input.originalPrice;
  let discountPercent = input.discountPercent;
  let shippingFee = input.shippingFee;
  let stockCount = input.stockCount;

  // ── Outlier detection (only if valid previous price exists) ──────────
  if (
    input.previousPrice !== null &&
    input.previousPrice > 0 &&
    Number.isFinite(input.previousPrice)
  ) {
    // Price drop check
    const dropPct = ((input.previousPrice - price) / input.previousPrice) * 100;
    if (dropPct > scraperConfig.priceDropThresholdPct) {
      return {
        action: 'rejected',
        price,
        originalPrice,
        discountPercent,
        shippingFee,
        stockCount,
        warnings: [
          `Price drop ${dropPct.toFixed(1)}% exceeds threshold ${scraperConfig.priceDropThresholdPct}% ` +
          `(previous: ${input.previousPrice}, observed: ${price})`,
        ],
        rejectReason: 'price_drop_outlier',
      };
    }

    // Price increase check
    const increasePct = ((price - input.previousPrice) / input.previousPrice) * 100;
    if (increasePct > scraperConfig.priceIncreaseThresholdPct) {
      return {
        action: 'rejected',
        price,
        originalPrice,
        discountPercent,
        shippingFee,
        stockCount,
        warnings: [
          `Price increase ${increasePct.toFixed(1)}% exceeds threshold ${scraperConfig.priceIncreaseThresholdPct}% ` +
          `(previous: ${input.previousPrice}, observed: ${price})`,
        ],
        rejectReason: 'price_increase_outlier',
      };
    }
  }

  // ── Original price validation ────────────────────────────────────────
  if (originalPrice !== null) {
    if (!Number.isFinite(originalPrice) || originalPrice < 0) {
      // Invalid original price
      warnings.push(`Invalid original price: ${originalPrice} → null`);
      originalPrice = null;
      discountPercent = null;
      hasCorrected = true;
    } else if (originalPrice < price) {
      // Original price lower than sale price — logically invalid
      warnings.push(
        `Original price ${originalPrice} < current price ${price} → originalPrice=null, discountPercent=null`
      );
      originalPrice = null;
      discountPercent = null;
      hasCorrected = true;
    } else if (originalPrice === price) {
      // Equal prices — no discount
      if (discountPercent !== null && discountPercent !== 0) {
        warnings.push(
          `Original price equals current price but discountPercent=${discountPercent} → 0`
        );
        discountPercent = 0;
        hasCorrected = true;
      }
    }
  }

  // ── Discount cross-validation ────────────────────────────────────────
  if (originalPrice !== null && originalPrice > 0 && originalPrice > price) {
    const computedDiscount = Math.round(
      ((originalPrice - price) / originalPrice) * 100 * 100
    ) / 100; // Two decimal places

    const clampedDiscount = Math.max(0, Math.min(100, computedDiscount));

    if (discountPercent === null || discountPercent === undefined) {
      // Compute missing discount
      discountPercent = clampedDiscount;
      warnings.push(`Missing discountPercent computed as ${clampedDiscount}%`);
      hasCorrected = true;
    } else {
      // Check if supplied discount is within ±2pp of computed
      const diff = Math.abs(discountPercent - computedDiscount);
      if (diff > 2) {
        warnings.push(
          `Discount mismatch: supplied=${discountPercent}%, computed=${computedDiscount}% → using computed`
        );
        discountPercent = clampedDiscount;
        hasCorrected = true;
      }
    }
  }

  // If no valid original price, ensure discount is null
  if (originalPrice === null && discountPercent !== null) {
    warnings.push(`discountPercent=${discountPercent} but no valid originalPrice → null`);
    discountPercent = null;
    hasCorrected = true;
  }

  // ── Shipping fee validation ──────────────────────────────────────────
  if (shippingFee !== null) {
    if (!Number.isFinite(shippingFee) || shippingFee < 0 || shippingFee > 50000) {
      warnings.push(`Invalid shipping fee: ${shippingFee} → null`);
      shippingFee = null;
      hasCorrected = true;
    }
  }

  // ── Stock count validation ───────────────────────────────────────────
  if (stockCount !== null) {
    if (!Number.isFinite(stockCount) || stockCount < 0 || stockCount > 100000) {
      warnings.push(`Invalid stock count: ${stockCount} → null`);
      stockCount = null;
      hasCorrected = true;
    }
  }

  return {
    action: hasCorrected ? 'corrected' : 'accepted',
    price,
    originalPrice,
    discountPercent,
    shippingFee,
    stockCount,
    warnings,
    rejectReason: null,
  };
}
