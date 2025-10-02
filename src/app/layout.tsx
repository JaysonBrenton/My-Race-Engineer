import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { getAppUrl } from '@/lib/seo';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const appUrl = getAppUrl();

export const metadata: Metadata = {
  metadataBase: appUrl,
  title: {
    default: 'My Race Engineer (MRE)',
    template: '%s | My Race Engineer (MRE)',
  },
  description: 'Telemetry insights for racing teams built on a clean, layered architecture.',
  openGraph: {
    siteName: 'My Race Engineer (MRE)',
    url: appUrl.toString(),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Race Engineer (MRE)',
    description: 'Telemetry insights for racing teams built on a clean, layered architecture.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className={inter.className}>
        <main>{children}</main>
      </body>
    </html>
  );
}
