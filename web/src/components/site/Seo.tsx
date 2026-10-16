import { useSite } from '@/app/SiteProvider';
import { srcFor } from '@/lib/image';

/** React 19 hoists <title>/<meta> into <head>. */
export function Seo({ title, description, image, noIndex, jsonLd }: { title?: string; description?: string; image?: string; noIndex?: boolean; jsonLd?: object }) {
  const { config } = useSite();
  const fullTitle = title ? config.seo.titleTemplate.replace('%s', title) : config.seo.defaultTitle;
  const desc = description || config.seo.description;
  const og = image || config.seo.ogImage;
  const url = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {config.seo.keywords && <meta name="keywords" content={config.seo.keywords} />}
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={config.brand.name} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      {og && <meta property="og:image" content={og.startsWith('http') ? srcFor(og, 1200) : window.location.origin + og} />}
      <meta name="twitter:card" content="summary_large_image" />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </>
  );
}
