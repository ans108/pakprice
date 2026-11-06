'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { ProductWithRelations, ProductVariant } from '@/types';

// ── SVG placeholder (inline — no external URL dependency) ────

function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-muted text-muted-foreground ${className ?? ''}`}
      aria-label="No product image available"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-12 h-12 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="mt-2 text-xs">No image</span>
    </div>
  );
}

// ── URL validation ────────────────────────────────────────────

/**
 * Returns true only if `url` is a parseable HTTPS URL pointing to an actual asset path.
 * Rejects root domains (e.g. "https://images.priceoye.pk/") and non-HTTPS schemes.
 */
function isValidHttpsUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    // Must have a real pathname beyond just '/' or empty
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Props ─────────────────────────────────────────────────────

interface ProductImageProps {
  product: Pick<ProductWithRelations, 'name' | 'image_url'>;
  variant?: Pick<ProductVariant, 'image_url' | 'color'> | null;
  className?: string;
  /** Image fill mode — use "fill" inside a positioned container */
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
}

/**
 * ProductImage — safe image component with three-level fallback:
 *   1. variant.image_url  (variant-specific photo, e.g. exact color)
 *   2. product.image_url  (product family hero image)
 *   3. SVG placeholder    (inline — no external URL, never broken)
 *
 * Uses next/image for optimised loading. Handles onError to switch
 * to the next fallback level when a URL loads but returns a broken image.
 */
export default function ProductImage({
  product,
  variant,
  className = '',
  fill = false,
  width = 400,
  height = 400,
  priority = false,
}: ProductImageProps) {
  // Determine the initial src based on fallback chain
  const variantUrl = isValidHttpsUrl(variant?.image_url) ? variant!.image_url! : null;
  const productUrl = isValidHttpsUrl(product.image_url) ? product.image_url! : null;
  const initialSrc = variantUrl ?? productUrl;

  const [currentSrc, setCurrentSrc] = useState<string | null>(initialSrc);
  const [useVariantSrc, setUseVariantSrc] = useState<boolean>(Boolean(variantUrl));

  // When variant changes (user clicks a different variant), reset fallback state
  React.useEffect(() => {
    const newVariantUrl = isValidHttpsUrl(variant?.image_url) ? variant!.image_url! : null;
    const newProductUrl = isValidHttpsUrl(product.image_url) ? product.image_url! : null;
    const newInitial = newVariantUrl ?? newProductUrl;
    setCurrentSrc(newInitial);
    setUseVariantSrc(Boolean(newVariantUrl));
  }, [variant?.image_url, product.image_url]);

  const handleError = () => {
    if (useVariantSrc && productUrl) {
      // Variant image failed — try product image
      setCurrentSrc(productUrl);
      setUseVariantSrc(false);
    } else {
      // Both failed — show placeholder
      setCurrentSrc(null);
    }
  };

  if (!currentSrc) {
    return (
      <ImagePlaceholder
        className={fill ? `absolute inset-0 w-full h-full ${className}` : `w-[${width}px] h-[${height}px] rounded-lg ${className}`}
      />
    );
  }

  const altText = variant?.color
    ? `${product.name} — ${variant.color}`
    : product.name;

  if (fill) {
    return (
      <Image
        src={currentSrc}
        alt={altText}
        fill
        className={`object-contain ${className}`}
        onError={handleError}
        priority={priority}
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={altText}
      width={width}
      height={height}
      className={`object-contain ${className}`}
      onError={handleError}
      priority={priority}
    />
  );
}
