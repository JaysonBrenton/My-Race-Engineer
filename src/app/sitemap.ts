import type { MetadataRoute } from 'next';

import { absUrl } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: absUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];
}
