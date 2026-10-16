import { useSite } from '@/app/SiteProvider';
import { PageRenderer } from '@/sections/PageRenderer';
import { Seo } from '@/components/site/Seo';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { usePage } from './usePage';

export default function HomePage() {
  const { config } = useSite();
  const { data, isLoading, error, refetch } = usePage('home');
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Hotel', name: config.brand.name, description: config.seo.description, telephone: config.contact.phone, email: config.contact.email,
    address: { '@type': 'PostalAddress', streetAddress: config.contact.addressLine1, addressLocality: config.contact.city, addressCountry: config.contact.country },
    ...(config.contact.latitude ? { geo: { '@type': 'GeoCoordinates', latitude: config.contact.latitude, longitude: config.contact.longitude } } : {}),
    url: window.location.origin, starRating: { '@type': 'Rating', ratingValue: '5' },
  };
  return (
    <>
      <Seo title={data.content.seo.title || undefined} description={data.content.seo.description} image={data.content.seo.ogImage} jsonLd={jsonLd} />
      <PageRenderer sections={data.content.sections} />
    </>
  );
}
