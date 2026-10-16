import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from 'lucide-react';
import type { SectionProps } from '@aurelle/shared';
import { get } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money, titleCase } from '@/lib/format';
import type { BlogPostSummary, Faq, GalleryItem, Offer, Review, Room } from '@/lib/types';
import { SectionHeading } from '@/components/site/SectionHeading';
import { Reveal } from '@/components/site/Reveal';
import { RoomCard } from '@/components/site/RoomCard';
import { SmartImage } from '@/components/site/SmartImage';
import { Stars } from '@/components/site/Stars';
import { Markdown } from '@/components/site/Markdown';
import { DateRangePicker } from '@/components/site/DateRangePicker';
import { GuestPicker } from '@/components/site/GuestPicker';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useSite } from '@/app/SiteProvider';
import { addDays } from '@aurelle/shared';
import { Shell } from './Shell';

const RoomSkeletons = ({ n = 3 }: { n?: number }) => (
  <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: n }, (_, i) => <div key={i}><Skeleton className="aspect-[4/5]" /><Skeleton className="mt-6 h-7 w-2/3" /><Skeleton className="mt-3 h-4 w-1/2" /></div>)}
  </div>
);

export function FeaturedRoomsSection({ props }: { props: SectionProps<'featuredRooms'> }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['rooms', 'featured'], queryFn: () => get<{ items: Room[] }>('/rooms', { featured: 1 }) });
  const rooms = (data?.items ?? []).slice(0, props.limit);
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        {isLoading ? <RoomSkeletons n={props.limit} /> : error ? <ErrorState onRetry={() => refetch()} /> : (
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r, i) => <Reveal key={r.id} delay={i * 0.1}><RoomCard room={r} /></Reveal>)}
          </div>
        )}
        {props.ctaLabel && <div className="mt-16 text-center"><Link to="/rooms" className="btn btn-ghost">{props.ctaLabel}</Link></div>}
      </div>
    </Shell>
  );
}

const SORTS = [{ v: '', l: 'Recommended' }, { v: 'price_asc', l: 'Price: low to high' }, { v: 'price_desc', l: 'Price: high to low' }, { v: 'popularity', l: 'Most popular' }, { v: 'size', l: 'Largest first' }];
const CATS = ['ROOM', 'SUITE', 'VILLA', 'PENTHOUSE'];

/** Rooms listing with stay search, filters (price, capacity, category, amenities) and sorting. */
export function RoomExplorerSection({ props }: { props: SectionProps<'roomExplorer'> }) {
  const { today } = useSite();
  const [sp, setSp] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const checkIn = sp.get('checkIn') ?? '';
  const checkOut = sp.get('checkOut') ?? '';
  const adults = Number(sp.get('adults') ?? 2);
  const children = Number(sp.get('children') ?? 0);
  const roomsN = Number(sp.get('rooms') ?? 1);
  const sort = sp.get('sort') ?? '';
  const category = sp.get('category') ?? '';
  const amenities = (sp.get('amenities') ?? '').split(',').filter(Boolean);
  const maxPrice = Number(sp.get('maxPrice') ?? 0);
  const guests = Number(sp.get('guests') ?? 0);
  const hasStay = !!(checkIn && checkOut);

  const set = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' || v === 0 ? next.delete(k) : next.set(k, String(v)));
    setSp(next, { replace: true, preventScrollReset: true });
  };

  const query = { checkIn: hasStay ? checkIn : undefined, checkOut: hasStay ? checkOut : undefined, adults: hasStay ? adults : undefined, children: hasStay ? children : undefined, rooms: hasStay ? roomsN : undefined, sort, category, amenities: amenities.join(','), maxPrice: maxPrice ? maxPrice * 100 : undefined, guests: guests || undefined };
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['rooms', query], queryFn: () => get<{ items: Room[] }>('/rooms', query), placeholderData: (p) => p });
  const { data: amenityData } = useQuery({ queryKey: ['amenities'], queryFn: () => get<{ items: { id: string; name: string }[] }>('/amenities'), staleTime: 300_000 });
  const stayQuery = hasStay ? `checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=${children}&rooms=${roomsN}` : '';
  const activeFilters = [category, maxPrice, guests, amenities.length].filter(Boolean).length;

  return (
    <Shell tone="light" tight>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        <div className="mb-10 grid gap-0 border border-line bg-canvas md:grid-cols-[1.3fr_1fr_auto]" style={{ borderRadius: 'var(--radius)' }}>
          <div className="border-b border-line px-6 py-4 md:border-b-0 md:border-r">
            <DateRangePicker checkIn={checkIn || addDays(today, 14)} checkOut={checkOut || addDays(today, 16)} onChange={(a, b) => set({ checkIn: a, checkOut: b })} />
          </div>
          <div className="border-b border-line px-6 py-4 md:border-b-0 md:border-r">
            <GuestPicker value={{ adults, children, rooms: roomsN }} onChange={(g) => set({ adults: g.adults, children: g.children, rooms: g.rooms, ...(hasStay ? {} : { checkIn: addDays(today, 14), checkOut: addDays(today, 16) }) })} />
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="room-filters"><SlidersHorizontal className="h-4 w-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
            <label className="sr-only" htmlFor="room-sort">Sort rooms</label>
            <select id="room-sort" value={sort} onChange={(e) => set({ sort: e.target.value })} className="h-[38px] border border-line bg-transparent px-3 text-xs uppercase tracking-[0.12em]" style={{ borderRadius: 'var(--radius)' }}>
              {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div id="room-filters" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mb-10 grid gap-8 border border-line bg-surface/50 p-6 md:grid-cols-4" style={{ borderRadius: 'var(--radius)' }}>
                <fieldset>
                  <legend className="label-luxe">Category</legend>
                  <div className="flex flex-wrap gap-2">
                    {['', ...CATS].map((c) => <button key={c} onClick={() => set({ category: c })} className={cn('border px-3 py-1.5 text-xs uppercase tracking-[0.12em]', category === c ? 'border-ink bg-ink text-canvas' : 'border-line hover:border-fg')} aria-pressed={category === c}>{c ? titleCase(c) : 'All'}</button>)}
                  </div>
                </fieldset>
                <div>
                  <label className="label-luxe" htmlFor="maxPrice">Max nightly rate {maxPrice ? `· ${money(maxPrice * 100)}` : ''}</label>
                  <input id="maxPrice" type="range" min={0} max={250000} step={5000} value={maxPrice} onChange={(e) => set({ maxPrice: Number(e.target.value) })} className="w-full accent-[rgb(var(--c-primary))]" />
                  <p className="text-xs text-muted">{maxPrice ? `Up to ${money(maxPrice * 100)}` : 'Any price'}</p>
                </div>
                <div>
                  <label className="label-luxe" htmlFor="capacity">Sleeps at least</label>
                  <select id="capacity" value={guests} onChange={(e) => set({ guests: Number(e.target.value) })} className="input-luxe py-2">
                    {[0, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n ? `${n} guests` : 'Any'}</option>)}
                  </select>
                </div>
                <fieldset>
                  <legend className="label-luxe">Amenities</legend>
                  <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                    {(amenityData?.items ?? []).map((a) => {
                      const on = amenities.includes(a.id);
                      return <button key={a.id} onClick={() => set({ amenities: (on ? amenities.filter((x) => x !== a.id) : [...amenities, a.id]).join(',') })} className={cn('border px-2.5 py-1 text-xs', on ? 'border-ink bg-ink text-canvas' : 'border-line hover:border-fg')} aria-pressed={on}>{a.name}</button>;
                    })}
                  </div>
                </fieldset>
                {activeFilters > 0 && <button className="btn btn-link btn-sm justify-self-start md:col-span-4" onClick={() => set({ category: null, maxPrice: null, guests: null, amenities: null })}>Clear filters</button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div aria-live="polite" className="mb-6 text-sm text-muted">{data && `${data.items.length} room${data.items.length === 1 ? '' : 's'}${hasStay ? ' · prices for your dates, including taxes' : ''}`}{isFetching && !isLoading ? ' · updating…' : ''}</div>
        {isLoading ? <RoomSkeletons n={6} /> : error ? <ErrorState onRetry={() => refetch()} /> : data!.items.length === 0 ? (
          <EmptyState title="No rooms match your filters" body="Try different dates or fewer filters." action={<button className="btn btn-ghost btn-sm" onClick={() => setSp({})}>Reset search</button>} />
        ) : (
          <div className={cn('grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3 transition-opacity', isFetching && 'opacity-60')}>
            {data!.items.map((r, i) => <Reveal key={r.id} delay={(i % 3) * 0.08}><RoomCard room={r} stayQuery={stayQuery} priority={i < 3} /></Reveal>)}
          </div>
        )}
      </div>
    </Shell>
  );
}

export function OffersSection({ props }: { props: SectionProps<'offers'> }) {
  const { data, isLoading } = useQuery({ queryKey: ['offers', props.featuredOnly], queryFn: () => get<{ items: Offer[] }>('/offers', props.featuredOnly ? { featured: 1 } : undefined) });
  const offers = (data?.items ?? []).slice(0, props.limit);
  if (!isLoading && offers.length === 0) return null;
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        {isLoading ? <RoomSkeletons n={3} /> : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {offers.map((o, i) => (
              <Reveal key={o.id} delay={i * 0.1} className="group">
                <Link to={`/offers/${o.slug}`} className="block">
                  <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                    <SmartImage src={o.image} alt={o.title} className="aspect-[3/2]" imgClassName="img-zoom" sizes="(min-width: 1024px) 33vw, 100vw" />
                    {o.discountType !== 'NONE' && o.value > 0 && (
                      <span className="absolute left-4 top-4 bg-primary px-3 py-1.5 text-[0.62rem] font-medium uppercase tracking-[0.2em] text-primary-contrast">{o.discountType === 'PERCENT' ? `Save ${Math.round(o.value / 100)}%` : `Save ${money(o.value)} / night`}</span>
                    )}
                  </div>
                  <p className="eyebrow mt-6">{o.subtitle}</p>
                  <h3 className="h-card mt-2 group-hover:text-primary">{o.title}</h3>
                  <ul className="mt-4 space-y-1.5 text-sm text-muted">{o.inclusions.slice(0, 3).map((x, k) => <li key={k} className="flex gap-2"><span className="text-primary">—</span>{x}</li>)}</ul>
                  <span className="btn btn-link mt-5">View offer</span>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

export function TestimonialsSection({ props }: { props: SectionProps<'testimonials'> }) {
  const { data } = useQuery({ queryKey: ['reviews', 'featured', props.limit], queryFn: () => get<{ items: Review[]; summary: { average: number; count: number } }>('/reviews', { featured: 1, limit: props.limit }) });
  const [i, setI] = useState(0);
  const items = data?.items ?? [];
  if (!items.length) return null;
  const r = items[i % items.length];
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        <div className="mx-auto max-w-4xl text-center">
          {props.showRating && data!.summary.count > 0 && (
            <p className="mb-10 flex items-center justify-center gap-3 text-sm text-muted"><Stars rating={data!.summary.average} /> {data!.summary.average.toFixed(1)} from {data!.summary.count} guest reviews</p>
          )}
          <div className="relative min-h-[260px]">
            <AnimatePresence mode="wait">
              <motion.figure key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.7 }}>
                <span className="font-display text-7xl leading-none text-primary" aria-hidden>“</span>
                <blockquote>
                  <p className="font-display text-2xl leading-snug sm:text-[2.1rem] text-balance">{r.title}</p>
                  <p className="mx-auto mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-muted">{r.body}</p>
                </blockquote>
                <figcaption className="mt-8 text-[0.7rem] uppercase tracking-[0.22em]">
                  <Stars rating={r.rating} className="mr-2 inline h-3 w-3" /> {r.name}{r.location ? ` · ${r.location}` : ''}
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>
          {items.length > 1 && (
            <div className="mt-10 flex items-center justify-center gap-6">
              <button onClick={() => setI((x) => (x - 1 + items.length) % items.length)} className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-fg" aria-label="Previous review"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs tracking-[0.2em] text-muted">{(i % items.length) + 1} / {items.length}</span>
              <button onClick={() => setI((x) => (x + 1) % items.length)} className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-fg" aria-label="Next review"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function GallerySection({ props }: { props: SectionProps<'gallery'> }) {
  const [cat, setCat] = useState(props.category);
  const { data, isLoading } = useQuery({ queryKey: ['gallery', cat, props.limit], queryFn: () => get<{ items: GalleryItem[] }>('/gallery', { category: cat, limit: props.limit }) });
  const [open, setOpen] = useState<number | null>(null);
  const items = data?.items ?? [];
  const cats = ['', 'HOTEL', 'ROOMS', 'DINING', 'SPA', 'POOL', 'EVENTS', 'DESTINATION'];
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        {props.showFilters && (
          <div className="mb-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Gallery categories">
            {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={cn('px-4 py-2 text-[0.68rem] uppercase tracking-[0.18em] transition', cat === c ? 'bg-ink text-canvas' : 'text-muted hover:text-fg')}>{c ? titleCase(c) : 'All'}</button>)}
          </div>
        )}
        {isLoading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div> : items.length === 0 ? <EmptyState title="No photographs yet" /> : (
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3">
            {items.map((g, idx) => (
              <button key={g.id} onClick={() => setOpen(idx)} className="group relative block w-full overflow-hidden break-inside-avoid" style={{ borderRadius: 'var(--radius)' }} aria-label={`Open photo: ${g.alt}`}>
                <SmartImage src={g.url} alt={g.alt} className={idx % 3 === 0 ? 'aspect-[3/4]' : idx % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]'} imgClassName="img-zoom" sizes="(min-width: 1024px) 25vw, 50vw" width={900} />
                <span className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4 text-left text-xs text-white opacity-0 transition group-hover:opacity-100"><Plus className="mr-2 h-3.5 w-3.5" />{g.caption || g.alt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </Shell>
  );
}

export function Lightbox({ items, index, onClose, onIndex }: { items: { url: string; alt: string; caption?: string }[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  return (
    <AnimatePresence>
      {index !== null && items[index] && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Photo viewer"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onIndex((index + 1) % items.length); if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length); }} tabIndex={-1} ref={(el) => el?.focus()}>
          <button onClick={onClose} className="absolute right-4 top-4 p-2 text-white/80 hover:text-white" aria-label="Close"><X className="h-7 w-7" strokeWidth={1.2} /></button>
          <button onClick={() => onIndex((index - 1 + items.length) % items.length)} className="absolute left-2 p-3 text-white/70 hover:text-white sm:left-6" aria-label="Previous photo"><ChevronLeft className="h-8 w-8" strokeWidth={1} /></button>
          <motion.figure key={index} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-h-full max-w-6xl">
            <SmartImage src={items[index].url} alt={items[index].alt} className="max-h-[80vh] w-[min(90vw,1200px)] bg-transparent" imgClassName="object-contain" width={2400} priority />
            <figcaption className="mt-4 text-center text-sm text-white/70">{items[index].caption || items[index].alt} <span className="ml-3 text-white/40">{index + 1} / {items.length}</span></figcaption>
          </motion.figure>
          <button onClick={() => onIndex((index + 1) % items.length)} className="absolute right-2 p-3 text-white/70 hover:text-white sm:right-6" aria-label="Next photo"><ChevronRight className="h-8 w-8" strokeWidth={1} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function FaqSection({ props }: { props: SectionProps<'faq'> }) {
  const { data, isLoading } = useQuery({ queryKey: ['faqs', props.category], queryFn: () => get<{ items: Faq[] }>('/faqs', { category: props.category }) });
  const groups = useMemo(() => {
    const m = new Map<string, Faq[]>();
    for (const f of data?.items ?? []) m.set(f.category, [...(m.get(f.category) ?? []), f]);
    return Array.from(m.entries());
  }, [data]);
  const [open, setOpen] = useState<string | null>(null);
  const jsonLd = data?.items.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: data.items.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) } : null;
  return (
    <Shell tone={props.tone}>
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      <div className="container-luxe max-w-4xl">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        {isLoading ? <Skeleton className="h-64" /> : groups.map(([cat, items]) => (
          <div key={cat} className="mb-14">
            <h2 className="eyebrow mb-4">{cat}</h2>
            <div className="divide-y divide-line border-y border-line">
              {items.map((f) => {
                const isOpen = open === f.id;
                return (
                  <div key={f.id}>
                    <h3>
                      <button className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-xl sm:text-2xl" aria-expanded={isOpen} aria-controls={`faq-${f.id}`} onClick={() => setOpen(isOpen ? null : f.id)}>
                        {f.question}
                        <Plus className={cn('h-5 w-5 shrink-0 text-primary transition-transform duration-500', isOpen && 'rotate-45')} strokeWidth={1.2} />
                      </button>
                    </h3>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div id={`faq-${f.id}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
                          <Markdown className="pb-6 pr-10">{f.answer}</Markdown>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function JournalSection({ props }: { props: SectionProps<'journal'> }) {
  const { data, isLoading } = useQuery({ queryKey: ['blog', props.limit], queryFn: () => get<{ items: BlogPostSummary[] }>('/blog', { limit: props.limit }) });
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        {isLoading ? <RoomSkeletons /> : !data?.items.length ? <EmptyState title="No stories yet" body="Check back soon." /> : (
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p, i) => (
              <Reveal key={p.id} delay={(i % 3) * 0.1} className="group">
                <Link to={`/journal/${p.slug}`} className="block">
                  <div className="overflow-hidden" style={{ borderRadius: 'var(--radius)' }}><SmartImage src={p.coverImage} alt={p.title} className="aspect-[3/2]" imgClassName="img-zoom" sizes="(min-width: 1024px) 33vw, 100vw" /></div>
                  <p className="eyebrow mt-6">{p.category} · {new Date(p.publishedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
                  <h3 className="h-card mt-3 group-hover:text-primary">{p.title}</h3>
                  <p className="mt-3 text-sm text-muted">{p.excerpt}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
