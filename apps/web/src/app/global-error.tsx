'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', margin: 0, backgroundColor: '#f9fafb', color: '#111827' }}>
        <div style={{ maxWidth: '480px', textAlign: 'center', background: '#ffffff', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>Application Error</h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            A critical error occurred while rendering the application. Please try reloading.
          </p>
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
