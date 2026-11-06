import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — PakPrice',
  description: 'PakPrice Terms of Service. Read our terms and conditions for using the PakPrice platform.',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms' },
};

export default function TermsPage() {
  const lastUpdated = 'September 2026';
  return (
    <div className="pt-24 pb-16">
      <div className="container-section max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {lastUpdated}</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section aria-labelledby="terms-acceptance">
            <h2 id="terms-acceptance" className="text-xl font-bold text-foreground mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using PakPrice (&quot;the Service&quot;), you agree to be bound by
              these Terms of Service. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section aria-labelledby="terms-service">
            <h2 id="terms-service" className="text-xl font-bold text-foreground mb-3">
              2. Description of Service
            </h2>
            <p>
              PakPrice is a price comparison platform that aggregates and displays product prices
              from third-party Pakistani retailers. We do not sell products directly. All purchases
              are made on the respective retailer&apos;s website.
            </p>
          </section>

          <section aria-labelledby="terms-accuracy">
            <h2 id="terms-accuracy" className="text-xl font-bold text-foreground mb-3">
              3. Price Accuracy
            </h2>
            <p>
              Prices displayed on PakPrice are sourced from third-party stores and may not always
              reflect the current price at the time of purchase. Prices are subject to change
              without notice. PakPrice is not responsible for any discrepancies between displayed
              prices and actual prices at checkout.
            </p>
          </section>

          <section aria-labelledby="terms-prohibited">
            <h2 id="terms-prohibited" className="text-xl font-bold text-foreground mb-3">
              4. Prohibited Use
            </h2>
            <p>You may not use PakPrice to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Scrape or harvest data from our platform in an automated manner</li>
              <li>Attempt to disrupt or damage our service</li>
              <li>Use the service for any illegal purpose</li>
            </ul>
          </section>

          <section aria-labelledby="terms-limitation">
            <h2 id="terms-limitation" className="text-xl font-bold text-foreground mb-3">
              5. Limitation of Liability
            </h2>
            <p>
              PakPrice is provided &quot;as is&quot; without warranties of any kind. We are not
              liable for any indirect, incidental, or consequential damages arising from your use of
              the Service.
            </p>
          </section>

          <section aria-labelledby="terms-changes">
            <h2 id="terms-changes" className="text-xl font-bold text-foreground mb-3">
              6. Changes to Terms
            </h2>
            <p>
              We reserve the right to update these terms at any time. Continued use of the Service
              after changes constitutes acceptance of the new terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
