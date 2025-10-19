import type { Metadata, PageProps } from 'next';

import ImportForm from './ImportForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Import from LiveRC',
  description: 'Preview LiveRC results links before triggering an import.',
};

const enableWizard = process.env.ENABLE_IMPORT_WIZARD === '1';
const resolvedAppOrigin =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  `http://localhost:${process.env.PORT?.trim() || '3001'}`;
const appOrigin = resolvedAppOrigin.replace(/\/+$/, '');
const bookmarkletTarget = `${appOrigin}/import?src=`;
const sanitizedBookmarkletTarget = bookmarkletTarget.replace(/'/g, "\\'");
const bookmarkletHref = `javascript:(()=>{var u=encodeURIComponent(location.href);location.href='${sanitizedBookmarkletTarget}'+u;})();`;
const enableFileImport =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_IMPORT_FILE === '1';

export default async function Page({ searchParams }: PageProps) {
  const sp = ((await searchParams) ?? {}) as Awaited<PageProps['searchParams']>;
  const srcParam = sp.src;
  let initialUrl: string | undefined;

  if (typeof srcParam === 'string' && srcParam.length > 0) {
    try {
      initialUrl = decodeURIComponent(srcParam);
    } catch {
      initialUrl = srcParam;
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Import from LiveRC</h1>
        <p className={styles.subtitle}>
          Paste a LiveRC results link to see whether it resolves to an import-ready JSON endpoint.
        </p>
      </header>
      <section className={styles.bookmarkletCard}>
        <h2 className={styles.bookmarkletTitle}>Bookmarklet</h2>
        <p className={styles.bookmarkletDescription}>
          Drag to bookmarks bar. When on a LiveRC race page, click it to open this importer with the
          page URL prefilled.
        </p>
        <a className={styles.bookmarkletLink} href={bookmarkletHref}>
          Import to My Race Engineer
        </a>
      </section>
      <ImportForm
        enableWizard={enableWizard}
        initialUrl={initialUrl}
        enableFileImport={enableFileImport}
      />
    </div>
  );
}
