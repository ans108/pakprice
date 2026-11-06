import { createClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';
import { Product, ProductVariant, BrandWithNormalized, Category, normalizeProductName, specsCompatible } from '@pakprice/shared';

const supabase = createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);

export class ProductRepository {
  async getBrandByNormalizedName(normalizedName: string): Promise<BrandWithNormalized | null> {
    const { data } = await supabase
      .from('brands')
      .select('*')
      .eq('normalized_name', normalizedName)
      .single();
    return data || null;
  }

  async getBrandByName(name: string): Promise<BrandWithNormalized | null> {
    const { data } = await supabase
      .from('brands')
      .select('*')
      .ilike('name', name)
      .maybeSingle();
    return data || null;
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    return data || null;
  }

  async getVariantByIdentifier(storeId: string, identifierType: string, identifier: string): Promise<{ variant: ProductVariant, product: Product } | null> {
    const { data } = await supabase
      .from('store_product_identifiers')
      .select('variant_id, product_variants(*, products(*))')
      .eq('store_id', storeId)
      .eq('identifier_type', identifierType)
      .eq('identifier', identifier)
      .single();
    
    if (data && data.product_variants) {
      const variant = Array.isArray(data.product_variants) ? data.product_variants[0] : data.product_variants;
      if (variant) {
        const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
        if (product) {
          // Remove products from variant to match interface
          const { products, ...cleanVariant } = variant as any;
          return { variant: cleanVariant as ProductVariant, product: product as Product };
        }
      }
    }
    return null;
  }

  async getVariantByGtin(gtin: string): Promise<{ variant: ProductVariant, product: Product } | null> {
    const { data } = await supabase
      .from('product_variants')
      .select('*, products(*)')
      .eq('gtin', gtin)
      .single();
    
    if (data) {
      const product = Array.isArray(data.products) ? data.products[0] : data.products;
      const { products, ...cleanVariant } = data as any;
      return { variant: cleanVariant as ProductVariant, product: product as Product };
    }
    return null;
  }
  
  async findVariantBySpecs(productId: string, ramGb: number | null, storageGb: number | null, color: string | null, modelNumber: string | null): Promise<ProductVariant | null> {
    let query = supabase.from('product_variants').select('*').eq('product_id', productId);
    
    if (ramGb !== null) query = query.eq('ram_gb', ramGb);
    else query = query.is('ram_gb', null);
    
    if (storageGb !== null) query = query.eq('storage_gb', storageGb);
    else query = query.is('storage_gb', null);
    
    if (color !== null) query = query.eq('color', color);
    else query = query.is('color', null);
    
    if (modelNumber !== null) query = query.eq('model_number', modelNumber);
    else query = query.is('model_number', null);
    
    const { data } = await query.single();
    return data || null;
  }

  async createProduct(product: Partial<Product>): Promise<Product | null> {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) {
      console.error('Failed to create product:', error);
      return null;
    }
    return data;
  }

  async createVariant(variant: Partial<ProductVariant>): Promise<ProductVariant | null> {
    const { data, error } = await supabase.from('product_variants').insert(variant).select().single();
    if (error) {
      console.error('Failed to create variant:', error);
      return null;
    }
    return data;
  }

  async upsertIdentifier(variantId: string, storeId: string, identifier: string, identifierType: string): Promise<void> {
    await supabase.from('store_product_identifiers').upsert({
      variant_id: variantId,
      store_id: storeId,
      identifier,
      identifier_type: identifierType
    }, { onConflict: 'variant_id,store_id,identifier_type' });
  }

  async fuzzySearchProduct(normalizedName: string, brandId: string | null): Promise<Product | null> {
    // Exact match first
    let query = supabase.from('products').select('*').eq('normalized_name', normalizedName);
    if (brandId) query = query.eq('brand_id', brandId);
    
    const { data: exactMatch } = await query;
    if (exactMatch && exactMatch.length === 1) return exactMatch[0];
    
    // Fallback: search products by title words and match via normalizeProductName (handles historical DB rows)
    const words = normalizedName.split(' ').slice(0, 3).join('%');
    let ilikeQuery = supabase.from('products').select('*').ilike('name', `%${words}%`);
    if (brandId) ilikeQuery = ilikeQuery.eq('brand_id', brandId);
    const { data: candidates } = await ilikeQuery;
    if (candidates) {
      const matches = candidates.filter(c => normalizeProductName(c.name) === normalizedName);
      if (matches.length === 1) return matches[0];
    }

    return null; 
  }

  /**
   * Get variants by model number (across all products).
   * Brand + model identifies product family, NOT automatically exact variant.
   */
  async getVariantsByModelNumber(modelNumber: string): Promise<{ variant: ProductVariant, product: Product }[]> {
    const { data } = await supabase
      .from('product_variants')
      .select('*, products(*)')
      .eq('model_number', modelNumber);
    
    if (!data) return [];
    return data.map((d: any) => {
      const product = Array.isArray(d.products) ? d.products[0] : d.products;
      const { products, ...cleanVariant } = d;
      return { variant: cleanVariant as ProductVariant, product: product as Product };
    }).filter((r: any) => r.product);
  }

  /**
   * Find variant by specs with NULL = unknown semantics.
   *
   * NULL on the scraped side means "unknown" (source didn't report it),
   * NOT "different variant". Only explicit conflicting values reject.
   */
  async findVariantBySpecsNullSafe(
    productId: string,
    ramGb: number | null,
    storageGb: number | null,
    color: string | null,
    modelNumber: string | null
  ): Promise<ProductVariant | null> {
    // Get all variants for this product and filter in application code
    // because SQL can't express "NULL = wildcard" vs "NULL = NULL" easily
    const { data } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId);
    
    if (!data || data.length === 0) return null;

    for (const v of data) {
      const ramOk = specsCompatible(ramGb, v.ram_gb);
      const storageOk = specsCompatible(storageGb, v.storage_gb);
      const colorOk = specsCompatible(color, v.color);
      const modelOk = specsCompatible(modelNumber, v.model_number);
      if (ramOk && storageOk && colorOk && modelOk) return v;
    }

    return null;
  }

  /**
   * Get all variants for a product.
   */
  async getAllVariants(productId: string): Promise<ProductVariant[]> {
    const { data } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId);
    return data || [];
  }

  /**
   * Get a product by ID.
   */
  async getProductById(productId: string): Promise<Product | null> {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
    return data || null;
  }

  /**
   * Get a variant by ID.
   */
  async getVariantById(variantId: string): Promise<ProductVariant | null> {
    const { data } = await supabase
      .from('product_variants')
      .select('*')
      .eq('id', variantId)
      .single();
    return data || null;
  }

  /**
   * Search products by name similarity using trigram index.
   * Returns top N candidates ordered by similarity.
   */
  async searchProductsByNameSimilarity(
    normalizedName: string,
    brandId: string | null,
    limit: number = 5
  ): Promise<Product[]> {
    let query = supabase
      .from('products')
      .select('*')
      .ilike('normalized_name', `%${normalizedName.split(' ').slice(0, 3).join('%')}%`)
      .limit(limit);
    
    if (brandId) query = query.eq('brand_id', brandId);
    
    const { data } = await query;
    return data || [];
  }

  /**
   * 5D: Update product image_url only when the current value is NULL.
   *
   * The `.is('image_url', null)` filter makes this unconditionally safe:
   * a valid existing URL can never be overwritten by this method.
   */
  async updateProductImageIfMissing(productId: string, imageUrl: string): Promise<void> {
    await supabase
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', productId)
      .is('image_url', null);
  }

  /**
   * 5D: Update variant image_url only when the current value is NULL.
   *
   * The `.is('image_url', null)` filter makes this unconditionally safe:
   * a valid existing URL can never be overwritten by this method.
   */
  async updateVariantImageIfMissing(variantId: string, imageUrl: string): Promise<void> {
    await supabase
      .from('product_variants')
      .update({ image_url: imageUrl })
      .eq('id', variantId)
      .is('image_url', null);
  }
}

