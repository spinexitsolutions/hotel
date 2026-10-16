import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { get, ApiError } from '@/lib/api';
import { dateLong, money } from '@/lib/format';
import type { Offer } from '@/lib/types';
import { Seo } from '@/components/site/Seo';
import { SmartImage } from '@/components/site/SmartImage';
import { Markdown } from '@/components/site/Markdown';
import { Reveal } from '@/components/site/Reveal';
import { useOverlayHeader } from '@/components/site/HeaderContext';
import { ErrorState, PageLoader } from '@/components/ui/States';
import NotFoundPage from './NotFoundPage';

export default function OfferPage() {
  const { slug = '' } = useParams();
  useOverlayHeader(true);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['offer', slug], queryFn: () => get<{ offer: Offer; rooms: { id: string; slug: string; name: string; basePrice: number; images: { url: string; alt: string }[] }[] }>(`/offers/${slug}`) });
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const o = data.offer;
  return (
    <>
      <Seo title={o.title} description={o.subtitle} image={o.image} />
      <section className="relative isolate -mt-[var(--header-h)] flex min-h-[70svh] items-end bg-ink text-white">
        <SmartImage quiet src={o.image} alt={o.title} priority className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/40 to-black/70" />
        <div className="container-luxe pb-16 pt-40">
          <p className="eyebrow mb-4">Special offer</p>
          <h1 className="h-display max-w-3xl">{o.title}</h1>
          <p className="mt-5 max-w-xl text-lg text-white/85">{o.subtitle}</p>
        </div>
      </section>
      <section className="py-section">
        <div className="container-luxe grid gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <Markdown className="text-[1.08rem]">{o.description}</Markdown>
            {o.inclusions.length > 0 && (
              <>
                <h2 className="mt-12 font-display text-3xl">Inclusions</h2>
                <ul className="mt-6 space-y-3">{o.inclusions.map((x) => <li key={x} className="flex gap-3"><Check className="mt-1 h-4 w-4 text-primary" />{x}</li>)}</ul>
              </>
            )}
            {o.terms && <><h2 className="mt-12 font-display text-2xl">Terms</h2><p className="mt-3 text-sm text-muted">{o.terms}</p></>}
          </Reveal>
          <aside className="lg:col-span-5">
            <div className="card-luxe sticky top-[calc(var(--header-h)+1.5rem)] p-8">
              {o.discountType !== 'NONE' && o.value > 0 && <p className="font-display text-4xl text-primary">{o.discountType === 'PERCENT' ? `${Math.round(o.value / 100)}% off` : `${money(o.value)} off / night`}</p>}
              <ul className="mt-4 space-y-1 text-sm text-muted">
                <li>Minimum stay: {o.minNights} night{o.minNights > 1 ? 's' : ''}</li>
                {o.stayStart && o.stayEnd && <li>Valid for arrivals {dateLong(o.stayStart)} – {dateLong(o.stayEnd)}</li>}
                {o.discountType !== 'NONE' && <li>Applied automatically to eligible stays at checkout.</li>}
              </ul>
              {o.discountType === 'NONE' ? (
                <Link to="/contact" className="btn btn-primary mt-8 w-full">Enquire</Link>
              ) : (
                <Link to={`/book?offer=${o.id}`} className="btn btn-primary mt-8 w-full">Book this offer</Link>
              )}
              {data.rooms.length > 0 && o.discountType !== 'NONE' && (
                <div className="mt-8 border-t border-line pt-6">
                  <p className="label-luxe">Eligible rooms</p>
                  <ul className="mt-3 space-y-2 text-sm">{data.rooms.map((r) => <li key={r.id} className="flex justify-between gap-4"><Link to={`/rooms/${r.slug}`} className="hover:text-primary">{r.name}</Link><span className="text-muted">from {money(r.basePrice)}</span></li>)}</ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
