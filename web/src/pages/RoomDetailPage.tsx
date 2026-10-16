import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays } from '@aurelle/shared';
import { BedDouble, Check, Eye, Maximize2, Moon, Users } from 'lucide-react';
import { get, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import type { Review, Room } from '@/lib/types';
import { useSite } from '@/app/SiteProvider';
import { previewQuery } from '@/app/preview';
import { Seo } from '@/components/site/Seo';
import { SmartImage } from '@/components/site/SmartImage';
import { Reveal } from '@/components/site/Reveal';
import { Markdown } from '@/components/site/Markdown';
import { Icon } from '@/components/site/Icon';
import { Stars } from '@/components/site/Stars';
import { RoomCard, WishlistButton } from '@/components/site/RoomCard';
import { DateRangePicker } from '@/components/site/DateRangePicker';
import { GuestPicker } from '@/components/site/GuestPicker';
import { useOverlayHeader } from '@/components/site/HeaderContext';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { Lightbox } from '@/sections/Dynamic';
import NotFoundPage from './NotFoundPage';

export default function RoomDetailPage() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const { today } = useSite();
  useOverlayHeader(true);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['room', slug], queryFn: () => get<{ room: Room; reviews: Review[]; similar: Room[] }>(`/rooms/${slug}`, previewQuery()) });
  const [ci, setCi] = useState(sp.get('checkIn') ?? addDays(today, 14));
  const [co, setCo] = useState(sp.get('checkOut') ?? addDays(today, 16));
  const [g, setG] = useState({ adults: Number(sp.get('adults') ?? 2), children: Number(sp.get('children') ?? 0), rooms: Number(sp.get('rooms') ?? 1) });
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error || !data) return <ErrorState onRetry={() => refetch()} />;
  const r = data.room;
  const imgs = r.images.length ? r.images : [{ url: '', alt: r.name }];
  const bookHref = `/book?room=${r.slug}&checkIn=${ci}&checkOut=${co}&adults=${g.adults}&children=${g.children}&rooms=${g.rooms}`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'HotelRoom', name: r.name, description: r.tagline, floorSize: { '@type': 'QuantitativeValue', value: r.sizeSqm, unitCode: 'MTK' }, occupancy: { '@type': 'QuantitativeValue', maxValue: r.maxOccupancy }, bed: r.bedType, image: imgs.map((i) => i.url) };

  return (
    <>
      <Seo title={r.seoTitle || r.name} description={r.seoDescription || r.tagline} image={imgs[0].url} jsonLd={jsonLd} />
      {/* Gallery hero */}
      <section className="relative -mt-[var(--header-h)] bg-ink">
        <div className="grid h-[78svh] min-h-[520px] grid-cols-1 gap-1 md:grid-cols-4 md:grid-rows-2">
          {imgs.slice(0, 5).map((img, i) => (
            <button key={i} onClick={() => setLightbox(i)} className={i === 0 ? 'relative md:col-span-2 md:row-span-2' : 'relative hidden md:block'} aria-label={`View photo ${i + 1}: ${img.alt}`}>
              <SmartImage src={img.url} alt={img.alt} priority={i === 0} className="h-full w-full" imgClassName="transition duration-1000 hover:scale-105" sizes={i === 0 ? '(min-width: 768px) 50vw, 100vw' : '25vw'} />
            </button>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pb-10 pt-32 text-white">
          <div className="container-luxe flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow mb-4">{r.category.toLowerCase()} · {r.view}</p>
              <h1 className="h-display">{r.name}</h1>
              <p className="mt-4 max-w-xl text-white/80">{r.tagline}</p>
            </div>
            <div className="flex gap-3">
              <WishlistButton roomId={r.id} className="h-12 w-12" />
              <button className="btn btn-light btn-sm" onClick={() => setLightbox(0)}><Eye className="h-4 w-4" /> All {imgs.length} photos</button>
            </div>
          </div>
        </div>
      </section>
      <Lightbox items={imgs} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />

      <section className="py-section">
        <div className="container-luxe grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <dl className="grid grid-cols-2 gap-6 border-y border-line py-8 sm:grid-cols-4">
                {[
                  { icon: Maximize2, k: 'Size', v: `${r.sizeSqm} m²` },
                  { icon: Users, k: 'Guests', v: `Up to ${r.maxOccupancy}` },
                  { icon: BedDouble, k: 'Bed', v: r.bedType || '—' },
                  { icon: Moon, k: 'Minimum stay', v: `${r.minStay} night${r.minStay > 1 ? 's' : ''}` },
                ].map(({ icon: I, k, v }) => (
                  <div key={k}><I className="mb-3 h-5 w-5 text-primary" strokeWidth={1.2} /><dt className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">{k}</dt><dd className="mt-1 font-display text-xl">{v}</dd></div>
                ))}
              </dl>
            </Reveal>
            <Reveal className="mt-12">
              <Markdown className="text-[1.08rem]">{r.description}</Markdown>
              {r.highlights.length > 0 && (
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">{r.highlights.map((h) => <li key={h} className="flex gap-3"><Check className="mt-1 h-4 w-4 text-primary" />{h}</li>)}</ul>
              )}
            </Reveal>
            <Reveal className="mt-16">
              <h2 className="font-display text-3xl">Amenities</h2>
              <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {r.amenities.map((a) => <li key={a.id} className="flex items-center gap-4 text-[0.95rem]"><Icon name={a.icon} className="h-5 w-5 text-primary" />{a.name}</li>)}
              </ul>
            </Reveal>
            <Reveal className="mt-16 border-t border-line pt-12">
              <h2 className="font-display text-3xl">Good to know</h2>
              <ul className="mt-6 space-y-2 text-sm text-muted">
                <li>Rates include {r.baseOccupancy} adults. Extra adults {money(r.extraAdultCharge)} per night{r.extraChildCharge ? `, children ${money(r.extraChildCharge)} per night` : ', children stay free using existing bedding'}.</li>
                {r.maxExtraBeds > 0 && <li>Extra bed available on request: {money(r.extraBedCharge)} per night.</li>}
                <li>Stays from {r.minStay} to {r.maxStay} nights.</li>
                <li><Link className="underline underline-offset-4" to="/cancellation-policy">Cancellation policy</Link></li>
              </ul>
            </Reveal>
            {data.reviews.length > 0 && (
              <Reveal className="mt-16 border-t border-line pt-12">
                <h2 className="font-display text-3xl">Guest reviews {r.rating && <span className="ml-3 align-middle text-base"><Stars rating={r.rating} /> <span className="text-muted">{r.rating} · {r.reviewCount}</span></span>}</h2>
                <div className="mt-8 space-y-8">
                  {data.reviews.map((v) => (
                    <figure key={v.id} className="border-b border-line pb-8">
                      <Stars rating={v.rating} />
                      <p className="mt-3 font-display text-xl">{v.title}</p>
                      <blockquote className="mt-2 text-muted">{v.body}</blockquote>
                      <figcaption className="mt-3 text-xs uppercase tracking-[0.18em]">{v.name}{v.location ? ` · ${v.location}` : ''}</figcaption>
                      {v.response && <p className="mt-4 border-l-2 border-primary pl-4 text-sm text-muted"><span className="font-medium text-fg">Response from the hotel: </span>{v.response}</p>}
                    </figure>
                  ))}
                </div>
              </Reveal>
            )}
          </div>

          <aside className="lg:col-span-5">
            <div className="card-luxe sticky top-[calc(var(--header-h)+1.5rem)] p-8 shadow-xl">
              <p className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">From</p>
              <p className="font-display text-4xl">{money(r.basePrice)}<span className="text-base text-muted"> / night</span></p>
              <p className="mt-1 text-xs text-muted">Before taxes · best rate guaranteed when booking direct</p>
              <div className="mt-8 divide-y divide-line border-y border-line">
                <div className="py-4"><DateRangePicker checkIn={ci} checkOut={co} onChange={(a, b) => { setCi(a); setCo(b); }} roomTypeId={r.id} /></div>
                <div className="py-4"><GuestPicker value={g} onChange={setG} /></div>
              </div>
              <Link to={bookHref} className="btn btn-primary mt-8 w-full">Check availability & book</Link>
              <p className="mt-4 text-center text-xs text-muted">No charge until you confirm on the next step.</p>
            </div>
          </aside>
        </div>
      </section>

      {data.similar.length > 0 && (
        <section className="tone-surface py-section">
          <div className="container-luxe">
            <h2 className="h-section mb-12 text-center">You may also like</h2>
            <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">{data.similar.map((s) => <RoomCard key={s.id} room={s} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
