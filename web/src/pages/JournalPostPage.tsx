import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, ApiError } from '@/lib/api';
import { previewQuery } from '@/app/preview';
import { Seo } from '@/components/site/Seo';
import { SmartImage } from '@/components/site/SmartImage';
import { Markdown } from '@/components/site/Markdown';
import { useOverlayHeader } from '@/components/site/HeaderContext';
import { ErrorState, PageLoader } from '@/components/ui/States';
import NotFoundPage from './NotFoundPage';

interface Post { slug: string; title: string; excerpt: string; body: string; coverImage: string; category: string; tags: string[]; authorName: string; publishedAt: string | null; seoTitle: string; seoDescription: string }

export default function JournalPostPage() {
  const { slug = '' } = useParams();
  useOverlayHeader(true);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['post', slug], queryFn: () => get<{ post: Post; more: Post[] }>(`/blog/${slug}`, previewQuery()) });
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const p = data.post;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, image: p.coverImage, author: { '@type': 'Person', name: p.authorName }, datePublished: p.publishedAt };
  return (
    <article>
      <Seo title={p.seoTitle || p.title} description={p.seoDescription || p.excerpt} image={p.coverImage} jsonLd={jsonLd} />
      <header className="relative isolate -mt-[var(--header-h)] flex min-h-[70svh] items-end bg-ink text-white">
        <SmartImage quiet src={p.coverImage} alt={p.title} priority className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/40 to-black/75" />
        <div className="container-luxe max-w-4xl pb-16 pt-40">
          <p className="eyebrow mb-4">{p.category}{p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
          <h1 className="h-display">{p.title}</h1>
          {p.authorName && <p className="mt-6 text-sm uppercase tracking-[0.2em] text-white/70">By {p.authorName}</p>}
        </div>
      </header>
      <div className="container-luxe max-w-3xl py-section">
        <p className="mb-10 font-display text-2xl leading-snug text-fg/90">{p.excerpt}</p>
        <Markdown className="text-[1.08rem]">{p.body}</Markdown>
        {p.tags.length > 0 && <p className="mt-12 flex flex-wrap gap-2">{p.tags.map((t) => <span key={t} className="border border-line px-3 py-1 text-xs uppercase tracking-[0.15em] text-muted">{t}</span>)}</p>}
      </div>
      {data.more.length > 0 && (
        <section className="tone-surface py-section-sm">
          <div className="container-luxe">
            <h2 className="mb-10 font-display text-3xl">More from the journal</h2>
            <div className="grid gap-8 md:grid-cols-3">
              {data.more.map((m) => (
                <Link key={m.slug} to={`/journal/${m.slug}`} className="group block">
                  <SmartImage src={m.coverImage} alt={m.title} className="aspect-[3/2]" imgClassName="img-zoom" sizes="33vw" />
                  <p className="eyebrow mt-4">{m.category}</p>
                  <p className="mt-2 font-display text-2xl group-hover:text-primary">{m.title}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
