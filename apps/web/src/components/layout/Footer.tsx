import React from 'react';
import Link from 'next/link';
import { TrendingDown, Twitter, Github, Linkedin } from 'lucide-react';

const footerLinks = {
  Platform: [
    { label: 'Browse Products', href: '/search' },
    { label: 'Coupons & Vouchers', href: '/coupons' },
    { label: 'Bank & Card Offers', href: '/bank-offers' },
    { label: 'Compare Prices', href: '/compare' },
  ],
  Company: [
    { label: 'About Us', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border" role="contentinfo">
      <div className="container-section py-12 lg:py-16">
        {/* Top grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4 group w-fit">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
                <TrendingDown className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="text-lg font-bold">
                <span className="text-primary">Pak</span>
                <span className="text-foreground">Price</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Pakistan&apos;s smart price comparison platform. Find the best deals across 12+ top
              stores in one place.
            </p>
            {/* Social links (placeholder) */}
            <div className="flex items-center gap-3 mt-6" aria-label="Social media links">
              <a
                href="#"
                aria-label="PakPrice on Twitter"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Twitter className="w-4 h-4" aria-hidden="true" />
              </a>
              <a
                href="#"
                aria-label="PakPrice on GitHub"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="w-4 h-4" aria-hidden="true" />
              </a>
              <a
                href="#"
                aria-label="PakPrice on LinkedIn"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Linkedin className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-foreground mb-4">{category}</h3>
              <ul className="space-y-3" role="list">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {currentYear} PakPrice. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Prices may vary. Always verify on the store&apos;s website.
          </p>
        </div>
      </div>
    </footer>
  );
}
