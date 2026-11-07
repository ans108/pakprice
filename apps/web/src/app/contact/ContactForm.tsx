'use client';

import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export type ContactTopic =
  | 'price_report'
  | 'product_request'
  | 'feedback'
  | 'partnership';

const TOPIC_OPTIONS: Array<{ value: ContactTopic; label: string }> = [
  { value: 'price_report', label: 'Report Incorrect Price / Outdated Stock' },
  { value: 'product_request', label: 'Request a Product or Store' },
  { value: 'feedback', label: 'General Feedback & Suggestions' },
  { value: 'partnership', label: 'Store Listing & Partnership Inquiry' },
];

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<ContactTopic>('price_report');
  const [productUrlOrStore, setProductUrlOrStore] = useState('');
  const [message, setMessage] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Please enter your name (at least 2 characters).';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!message.trim() || message.trim().length < 10) {
      errs.message = 'Please provide details in your message (at least 10 characters).';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    // Simulate API request latency (e.g. sending notification)
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    setSubmitted(true);
  };

  const handleReset = () => {
    setName('');
    setEmail('');
    setTopic('price_report');
    setProductUrlOrStore('');
    setMessage('');
    setErrors({});
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-2xl border border-primary/20 bg-primary/5 text-center flex flex-col items-center gap-4 animate-fade-in">
        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">Message Received!</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Thank you, <span className="font-semibold text-foreground">{name}</span>. Our team will review your inquiry ({TOPIC_OPTIONS.find(t => t.value === topic)?.label}) and get back to you at{' '}
            <span className="font-semibold text-foreground">{email}</span> within 24 hours.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleReset}
          className="mt-2 text-xs font-semibold rounded-xl"
        >
          Send Another Message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-xs" noValidate>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl font-bold text-foreground">Send a Message</h2>
      </div>

      <div className="space-y-4">
        {/* Name & Email Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="block text-xs font-semibold text-foreground mb-1.5">
              Your Name <span className="text-destructive">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. Ali Ahmed"
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20",
                errors.name ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
              )}
            />
            {errors.name && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="contact-email" className="block text-xs font-semibold text-foreground mb-1.5">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
              }}
              placeholder="e.g. ali@example.pk"
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20",
                errors.email ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
              )}
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.email}
              </p>
            )}
          </div>
        </div>

        {/* Topic Select */}
        <div>
          <label htmlFor="contact-topic" className="block text-xs font-semibold text-foreground mb-1.5">
            Inquiry Topic <span className="text-destructive">*</span>
          </label>
          <select
            id="contact-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value as ContactTopic)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {TOPIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Optional Product URL or Store */}
        <div>
          <label htmlFor="contact-product" className="block text-xs font-semibold text-foreground mb-1.5">
            Product URL or Store Name <span className="text-muted-foreground font-normal">(Optional)</span>
          </label>
          <input
            id="contact-product"
            type="text"
            value={productUrlOrStore}
            onChange={(e) => setProductUrlOrStore(e.target.value)}
            placeholder="e.g. https://priceoye.pk/smart-watches/... or Telemart"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Message */}
        <div>
          <label htmlFor="contact-message" className="block text-xs font-semibold text-foreground mb-1.5">
            Message <span className="text-destructive">*</span>
          </label>
          <textarea
            id="contact-message"
            rows={4}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (errors.message) setErrors(prev => ({ ...prev, message: '' }));
            }}
            placeholder="Describe the issue, requested product, or your message in detail..."
            className={cn(
              "w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm transition-colors resize-y focus:outline-hidden focus:ring-2 focus:ring-primary/20",
              errors.message ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
            )}
          />
          {errors.message && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 rounded-xl text-sm font-semibold gap-2 mt-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting Message...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Message
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

