import type { Metadata } from 'next';
import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { EnvironmentValidationError } from '@/server/config/environment';

import ImportForm from './ImportForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Import from LiveRC',
  description: 'Preview LiveRC results links before triggering an import.',
};

const importWizardFlag = process.env.ENABLE_IMPORT_WIZARD?.trim().toLowerCase();
const enableWizard = importWizardFlag === '0' || importWizardFlag === 'false' ? false : true;
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
const resolverEnabled = process.env.ENABLE_LIVERC_RESOLVER === '1';
const hasInternalProxy =
  typeof process.env.LIVERC_HTTP_BASE === 'string' && process.env.LIVERC_HTTP_BASE.length > 0;

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

export default async function Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  const srcParam = sp.src;
  let initialUrl: string | undefined;

  if (typeof srcParam === 'string' && srcParam.length > 0) {
    try {
      initialUrl = decodeURIComponent(srcParam);
    } catch {
      initialUrl = srcParam;
    }
  }

  let importFormToken: string | null = null;

  try {
    importFormToken = generateAuthFormToken('liverc-import');
  } catch (error) {
    if (
      error instanceof MissingAuthFormTokenSecretError ||
      error instanceof EnvironmentValidationError
    ) {
      importFormToken = null;
    } else {
      throw error;
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
        resolverEnabled={resolverEnabled}
        hasInternalProxy={hasInternalProxy}
        importFormToken={importFormToken}
      />
    </div>
  );
}
