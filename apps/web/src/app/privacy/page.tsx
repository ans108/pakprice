import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — PakPrice',
  description:
    'PakPrice Privacy Policy. Learn how we collect, use, and protect your personal data.',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy' },
};

export default function PrivacyPage() {
  const lastUpdated = 'September 2026';
  return (
    <div className="pt-24 pb-16">
      <div className="container-section max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {lastUpdated}</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section aria-labelledby="privacy-intro">
            <h2 id="privacy-intro" className="text-xl font-bold text-foreground mb-3">
              1. Introduction
            </h2>
            <p>
              PakPrice (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting
              your privacy. This Privacy Policy explains how we collect, use, and safeguard your
              information when you use our price comparison platform.
            </p>
          </section>

          <section aria-labelledby="privacy-collect">
            <h2 id="privacy-collect" className="text-xl font-bold text-foreground mb-3">
              2. Information We Collect
            </h2>
            <p className="mb-2">We may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-foreground">Account data:</strong> Email address and display
                name if you create an account.
              </li>
              <li>
                <strong className="text-foreground">Usage data:</strong> Search queries, pages
                visited, and features used.
              </li>
              <li>
                <strong className="text-foreground">Device data:</strong> Browser type, operating
                system, and IP address (for analytics and security).
              </li>
              <li>
                <strong className="text-foreground">Favorites & alerts:</strong> Products you save
                or set price alerts for.
              </li>
            </ul>
          </section>

          <section aria-labelledby="privacy-use">
            <h2 id="privacy-use" className="text-xl font-bold text-foreground mb-3">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and improve the PakPrice service</li>
              <li>To send price alert notifications you have opted into</li>
              <li>To personalise your experience</li>
              <li>To detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section aria-labelledby="privacy-share">
            <h2 id="privacy-share" className="text-xl font-bold text-foreground mb-3">
              4. Data Sharing
            </h2>
            <p>
              We do not sell your personal data. We do not share your data with third parties
              except as necessary to operate the service (e.g., our database provider, Supabase)
              or as required by law.
            </p>
          </section>

          <section aria-labelledby="privacy-security">
            <h2 id="privacy-security" className="text-xl font-bold text-foreground mb-3">
              5. Data Security
            </h2>
            <p>
              We use industry-standard security practices including Row Level Security (RLS) on our
              database, encrypted connections (HTTPS), and secure authentication via Supabase Auth.
              Users can only access their own private data.
            </p>
          </section>

          <section aria-labelledby="privacy-rights">
            <h2 id="privacy-rights" className="text-xl font-bold text-foreground mb-3">
              6. Your Rights
            </h2>
            <p>
              You have the right to access, correct, or delete your personal data. To exercise
              these rights, please contact us at{' '}
              <a href="mailto:privacy@pakprice.pk" className="text-primary hover:underline">
                privacy@pakprice.pk
              </a>
              .
            </p>
          </section>

          <section aria-labelledby="privacy-changes">
            <h2 id="privacy-changes" className="text-xl font-bold text-foreground mb-3">
              7. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes by posting the new policy on this page with an updated date.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
