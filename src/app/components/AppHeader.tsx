'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AppHeaderProps = {
  isAuthenticated: boolean;
  onLogout: (formData: FormData) => Promise<void> | void;
};

export function AppHeader({ isAuthenticated, onLogout }: AppHeaderProps) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/' || pathname === '';

  if (isLandingPage) {
    return null;
  }

  return (
    <header className="app-header" aria-label="Primary">
      <div className="app-header__inner">
        <Link href="/" className="app-header__brand">
          My Race Engineer
        </Link>
        {isAuthenticated ? (
          <form action={onLogout} className="app-header__logout" aria-label="Sign out form">
            <button type="submit" className="app-header__logoutButton">
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
