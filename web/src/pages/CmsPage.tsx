import { useParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { PageRenderer } from '@/sections/PageRenderer';
import { Seo } from '@/components/site/Seo';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { usePage } from './usePage';
import NotFoundPage from './NotFoundPage';

export default function CmsPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error, refetch } = usePage(slug);
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <Seo title={data.content.seo.title || data.title} description={data.content.seo.description} image={data.content.seo.ogImage} noIndex={data.content.seo.noIndex} />
      <PageRenderer sections={data.content.sections} />
    </>
  );
}
