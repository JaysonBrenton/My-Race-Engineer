/**
 * Filename: src/app/layout.tsx
 * Purpose: Define the root layout shell, including the global header and logout affordance.
 * Author: OpenAI ChatGPT (gpt-5-codex)
 * Date: 2025-01-15
 * License: MIT
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { logout } from '@/app/actions/logout';
import { getSessionFromCookies } from '@/lib/auth/serverSession';
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionStatus = await getSessionFromCookies();
  const isAuthenticated = sessionStatus.status === 'authenticated';

  return (
    <html lang="en" data-theme="dark">
      <body className={inter.className}>
        <div className="app-shell">
          <header className="app-header" aria-label="Primary">
            <div className="app-header__inner">
              <Link href="/" className="app-header__brand">
                My Race Engineer
              </Link>
              {isAuthenticated ? (
                <form action={logout} className="app-header__logout" aria-label="Sign out form">
                  {/* Provide a consistent logout affordance for authenticated users. */}
                  <button type="submit" className="app-header__logoutButton">
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
