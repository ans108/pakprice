import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow @pakprice/shared (TypeScript source) to be transpiled by Next.js
  transpilePackages: ['@pakprice/shared'],

  // Image configuration: allow absolute HTTPS URLs from any hostname.
  // In Phase 3, restrict to specific store CDN hostnames for security.
  images: {
    remotePatterns: [
      // PriceOye — verified in production (all 394 current images)
      {
        protocol: 'https',
        hostname: 'images.priceoye.pk',
      },
      // Daraz — verified CDN hostnames
      {
        protocol: 'https',
        hostname: 'static-01.daraz.pk',
      },
      {
        protocol: 'https',
        hostname: 'pk-live-21.slatic.net',
      },
      {
        protocol: 'https',
        hostname: 'lzd-img-global.slatic.net',
      },
      // Paklap — verified store image hostname
      {
        protocol: 'https',
        hostname: 'www.paklap.pk',
      },
      // Telemart — verified Shopify CDN
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      // Mega.pk — verified store image hostname
      {
        protocol: 'https',
        hostname: 'www.mega.pk',
      },
      {
        protocol: 'https',
        hostname: 'mega.pk',
      },
      // Daraz — Lazada CDN image hostname
      {
        protocol: 'https',
        hostname: 'img.drz.lazcdn.com',
      },
      // Shophive — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.shophive.com',
      },
      {
        protocol: 'https',
        hostname: 'shophive.com',
      },
      // Telemart — store domains
      {
        protocol: 'https',
        hostname: 'www.telemart.pk',
      },
      {
        protocol: 'https',
        hostname: 'telemart.pk',
      },
      // PriceOye root domain
      {
        protocol: 'https',
        hostname: 'priceoye.pk',
      },
      // Paklap root domain
      {
        protocol: 'https',
        hostname: 'paklap.pk',
      },
      // Al-Fatah — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.alfatah.com.pk',
      },
      {
        protocol: 'https',
        hostname: 'alfatah.com.pk',
      },
      // Naheed — store and media CDN hostnames
      {
        protocol: 'https',
        hostname: 'www.naheed.pk',
      },
      {
        protocol: 'https',
        hostname: 'naheed.pk',
      },
      {
        protocol: 'https',
        hostname: 'media.naheed.pk',
      },
      // HomeShopping — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.homeshopping.pk',
      },
      {
        protocol: 'https',
        hostname: 'homeshopping.pk',
      },
      // iShopping — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.ishopping.pk',
      },
      {
        protocol: 'https',
        hostname: 'ishopping.pk',
      },
      // Metro — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.metro.pk',
      },
      {
        protocol: 'https',
        hostname: 'metro.pk',
      },
      // Carrefour — store image hostnames
      {
        protocol: 'https',
        hostname: 'www.carrefour.pk',
      },
      {
        protocol: 'https',
        hostname: 'carrefour.pk',
      },
    ],
  },

  // 5F: HTTP Security Headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
