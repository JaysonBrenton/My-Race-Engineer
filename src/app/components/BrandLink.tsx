/**
 * Project: My Race Engineer
 * File: src/app/components/BrandLink.tsx
 * Summary: Provides the static brand label for the application header without linking to navigation routes.
 */

'use client';

export function BrandLink() {
  // Render the brand as non-interactive text to keep the header label consistent across all routes.
  return <span className="app-header__brand">My Race Engineer</span>;
}
