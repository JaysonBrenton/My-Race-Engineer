import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Open Graph Preview',
  description: 'Telemetry insights that keep your team fast.',
};

const backgroundStyle =
  'linear-gradient(135deg, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 65%, var(--color-fg) 35%) 100%)';

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6rem 1.5rem',
  backgroundColor: 'var(--color-bg)',
  backgroundImage: backgroundStyle,
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  width: '100%',
  maxWidth: '49rem',
};

const labelStyle: CSSProperties = {
  fontSize: '2rem',
  color: 'var(--color-accent)',
  letterSpacing: '0.4rem',
  textTransform: 'uppercase',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: '5rem',
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: '-0.125rem',
  color: 'var(--color-fg)',
};

const subheadingStyle: CSSProperties = {
  margin: 0,
  fontSize: '2.25rem',
  color: 'var(--color-fg-muted)',
};

export default function OpengraphImagePage() {
  return (
    <main style={pageStyle}>
      <div style={contentStyle}>
        <span style={labelStyle}>My Race Engineer</span>
        <h1 style={headingStyle}>Telemetry insights that keep your team fast</h1>
        <p style={subheadingStyle}>Next.js • Prisma • Layered architecture</p>
      </div>
    </main>
  );
}
