import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Pace Tracer',
  description: 'Telemetry insights for racing teams built with clean architecture.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
