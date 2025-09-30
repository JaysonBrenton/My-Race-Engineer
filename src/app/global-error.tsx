'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Global error boundary caught', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>We could not render your view. Try again or contact support if it persists.</p>
          <button type="button" onClick={() => reset()} style={{
            background: 'var(--color-accent)',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '9999px',
            cursor: 'pointer',
            color: 'var(--color-bg)',
          }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
