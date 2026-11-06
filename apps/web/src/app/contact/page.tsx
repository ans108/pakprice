import type { Metadata } from 'next';
import { Mail, MessageSquare } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact PakPrice',
  description: 'Get in touch with the PakPrice team. We\'d love to hear from you.',
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="container-section max-w-2xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <MessageSquare className="w-8 h-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Contact Us</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Have a question, feedback, or a store you&apos;d like us to track? We&apos;d love to
            hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 mb-12">
          <a
            href="mailto:hello@pakprice.pk"
            className="flex items-center gap-4 p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all group"
            aria-label="Email PakPrice"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Email Us</p>
              <p className="text-sm text-muted-foreground">hello@pakprice.pk</p>
            </div>
          </a>
        </div>

        {/* Contact form placeholder */}
        <div className="p-8 rounded-2xl border border-border bg-card">
          <h2 className="text-xl font-bold mb-2">Send a Message</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Contact form is coming soon. For now, please email us directly.
          </p>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">
            <span>📧</span>
            <span>
              Email us at{' '}
              <a href="mailto:hello@pakprice.pk" className="font-semibold hover:underline">
                hello@pakprice.pk
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
