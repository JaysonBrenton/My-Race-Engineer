import type { Metadata } from 'next';

import ImportForm from './ImportForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Import from LiveRC',
  description: 'Preview LiveRC results links before triggering an import.',
};

export default function ImportPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Import from LiveRC</h1>
        <p className={styles.subtitle}>
          Paste a LiveRC results link to see whether it resolves to an import-ready JSON endpoint.
        </p>
      </header>
      <ImportForm />
    </div>
  );
}
