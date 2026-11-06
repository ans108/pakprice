/**
 * Configurable category discovery map for Pakistani e-commerce stores.
 * Maps store-specific category URL paths to canonical PakPrice category slugs.
 */

export interface StoreCategoryDefinition {
  url: string;
  categorySlug: string;
  categoryName: string;
}

export const STORE_CATEGORY_MAP: Record<string, StoreCategoryDefinition[]> = {
  priceoye: [
    { url: 'https://priceoye.pk/smart-phones/apple', categorySlug: 'mobiles', categoryName: 'Smartphones (Apple)' },
    { url: 'https://priceoye.pk/smart-phones/samsung', categorySlug: 'mobiles', categoryName: 'Smartphones (Samsung)' },
    { url: 'https://priceoye.pk/smart-phones', categorySlug: 'mobiles', categoryName: 'Smartphones' },
    { url: 'https://priceoye.pk/laptops', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://priceoye.pk/tablets', categorySlug: 'tablets', categoryName: 'Tablets' },
    { url: 'https://priceoye.pk/smart-watches', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
    { url: 'https://priceoye.pk/earbuds', categorySlug: 'headphones-audio', categoryName: 'Earbuds & Audio' },
    { url: 'https://priceoye.pk/power-banks', categorySlug: 'computer-accessories', categoryName: 'Power Banks' },
  ],
  daraz: [
    { url: 'https://www.daraz.pk/smartphones/', categorySlug: 'mobiles', categoryName: 'Smartphones' },
    { url: 'https://www.daraz.pk/traditional-laptops/', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://www.daraz.pk/tablets/', categorySlug: 'tablets', categoryName: 'Tablets' },
    { url: 'https://www.daraz.pk/smart-watches/', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
    { url: 'https://www.daraz.pk/wireless-earbuds/', categorySlug: 'headphones-audio', categoryName: 'Earbuds' },
  ],
  paklap: [
    { url: 'https://www.paklap.pk/laptops-prices.html', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://www.paklap.pk/apple-products/macbook-prices.html', categorySlug: 'laptops', categoryName: 'MacBooks' },
    { url: 'https://www.paklap.pk/tablets.html', categorySlug: 'tablets', categoryName: 'Tablets' },
    { url: 'https://www.paklap.pk/monitors-prices.html', categorySlug: 'monitors', categoryName: 'Monitors' },
    { url: 'https://www.paklap.pk/accessories.html', categorySlug: 'computer-accessories', categoryName: 'Accessories' },
  ],
  telemart: [
    { url: 'https://www.telemart.pk/collections/smart-phones', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
    { url: 'https://www.telemart.pk/collections/tablets', categorySlug: 'tablets', categoryName: 'Tablets' },
    { url: 'https://www.telemart.pk/collections/smart-watches', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
    { url: 'https://www.telemart.pk/collections/wireless-earbuds', categorySlug: 'headphones-audio', categoryName: 'Audio' },
    { url: 'https://www.telemart.pk/collections/laptops', categorySlug: 'laptops', categoryName: 'Laptops' },
  ],
  'mega-pk': [
    { url: 'https://www.mega.pk/mobiles/', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
    { url: 'https://www.mega.pk/laptop-price-pakistan/', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://www.mega.pk/tablets/', categorySlug: 'tablets', categoryName: 'Tablets' },
  ],
  shophive: [
    { url: 'https://www.shophive.com/mobile-phones', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
    { url: 'https://www.shophive.com/laptops', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://www.shophive.com/smart-watches', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
  ],
  homeshopping: [
    { url: 'https://homeshopping.pk/categories/Mobile-Phones-Price-Pakistan/', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
    { url: 'https://homeshopping.pk/categories/Laptops-Price-Pakistan/', categorySlug: 'laptops', categoryName: 'Laptops' },
    { url: 'https://homeshopping.pk/categories/Smart-Watches-Price-Pakistan/', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
  ],
  ishopping: [
    { url: 'https://www.ishopping.pk/electronics/mobile-phones-tablets.html', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
    { url: 'https://www.ishopping.pk/electronics/computers-tablets/laptops.html', categorySlug: 'laptops', categoryName: 'Laptops' },
  ],
  metro: [
    { url: 'https://www.metro.pk/groceries', categorySlug: 'groceries', categoryName: 'Groceries' },
    { url: 'https://www.metro.pk/electronics-appliances', categorySlug: 'home-appliances', categoryName: 'Electronics & Appliances' },
  ],
  carrefour: [
    { url: 'https://www.carrefour.pk/mafpak/en/c/NFPAK4000000', categorySlug: 'groceries', categoryName: 'Food & Groceries' },
    { url: 'https://www.carrefour.pk/mafpak/en/c/NFPAK1000000', categorySlug: 'home-appliances', categoryName: 'Electronics & Appliances' },
  ],
  naheed: [
    { url: 'https://www.naheed.pk/groceries-pets', categorySlug: 'groceries', categoryName: 'Groceries & Household' },
    { url: 'https://www.naheed.pk/electronics', categorySlug: 'home-appliances', categoryName: 'Electronics & Appliances' },
  ],
  'al-fatah': [
    { url: 'https://www.alfatah.com.pk/wp-json/wc/store/v1/products?per_page=20', categorySlug: 'home-appliances', categoryName: 'Appliances & Electronics' },
    { url: 'https://www.alfatah.com.pk/product-category/geysers-and-heaters/', categorySlug: 'home-appliances', categoryName: 'Geysers & Heaters' },
  ],
};
