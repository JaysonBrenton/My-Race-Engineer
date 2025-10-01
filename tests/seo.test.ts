import assert from 'node:assert/strict';
import test from 'node:test';

process.env.APP_URL = 'https://example.com';

test('absUrl returns absolute URLs using APP_URL as base', async () => {
  const { absUrl } = await import('../src/lib/seo');
  assert.equal(absUrl('/docs'), 'https://example.com/docs');
  assert.equal(absUrl('about'), 'https://example.com/about');
});

test('canonicalFor defaults to the homepage', async () => {
  const { canonicalFor } = await import('../src/lib/seo');
  assert.equal(canonicalFor(), 'https://example.com/');
});

test('sitemap includes the homepage with canonical origin', async () => {
  const sitemapModule = await import('../src/app/sitemap');
  const entries = sitemapModule.default();
  assert.equal(entries[0]?.url, 'https://example.com/');
});

test('robots.txt references the sitemap and disallows sensitive paths', async () => {
  const robotsModule = await import('../src/app/robots.txt/route');
  const response = robotsModule.GET();
  const body = await response.text();

  assert.ok(body.includes('Sitemap: https://example.com/sitemap.xml'));
  assert.ok(body.includes('Disallow: /api/web-vitals'));
});
