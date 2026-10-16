import { useEffect, useState } from 'react';
import { SmartLink } from '@/components/site/SmartLink';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { SectionProps } from '@aurelle/shared';
import { SmartImage } from '@/components/site/SmartImage';
import { BookingBar } from '@/components/site/BookingBar';
import { Reveal } from '@/components/site/Reveal';
import { useOverlayHeader } from '@/components/site/HeaderContext';
import { cn } from '@/lib/cn';

export function HeroSection({ props, first }: { props: SectionProps<'hero'>; first?: boolean }) {
  const slides = props.slides.length ? props.slides : [{ image: '', alt: '', eyebrow: '', heading: '', subheading: '' }];
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 160]);
  useOverlayHeader(!!first);

  useEffect(() => {
    if (slides.length < 2 || reduce) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), props.interval * 1000);
    return () => clearInterval(t);
  }, [slides.length, props.interval, reduce]);

  const s = slides[i];
  return (
    <section className={cn('relative isolate flex flex-col overflow-hidden bg-ink text-white', props.height === 'full' ? 'min-h-[100svh]' : 'min-h-[78svh]', first && '-mt-[var(--header-h)]')} aria-roledescription="carousel" aria-label="Featured">
      <motion.div className="absolute inset-0 -z-10" style={{ y }}>
        <AnimatePresence initial={false}>
          <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.8, ease: 'easeInOut' }}>
            <SmartImage quiet src={s.image} alt={s.alt || s.heading} priority={i === 0} className="h-full w-full" imgClassName={reduce ? '' : 'animate-kenburns'} width={2400} />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/70" />
      </motion.div>

      <div className="container-luxe flex flex-1 flex-col items-center justify-center pb-10 pt-[calc(var(--header-h)+3rem)] text-center">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="max-w-4xl">
            {s.eyebrow && <p className="eyebrow mb-6 text-primary">{s.eyebrow}</p>}
            <h1 className="h-display text-balance">{s.heading}</h1>
            {s.subheading && <p className="mx-auto mt-7 max-w-2xl text-base font-light leading-relaxed text-white/85 sm:text-lg">{s.subheading}</p>}
          </motion.div>
        </AnimatePresence>
        {props.ctaLabel && props.ctaHref && (
          <Reveal delay={0.4}><SmartLink href={props.ctaHref} className="btn btn-light mt-10">{props.ctaLabel}</SmartLink></Reveal>
        )}
      </div>

      <div className="container-luxe relative pb-8">
        {props.showBookingBar && <BookingBar />}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Slides">
            {slides.length > 1 && slides.map((sl, idx) => (
              <button key={idx} role="tab" aria-selected={idx === i} aria-label={`Slide ${idx + 1}: ${sl.heading}`} onClick={() => setI(idx)} className="group py-3">
                <span className={cn('block h-px transition-all duration-700', idx === i ? 'w-12 bg-primary' : 'w-6 bg-white/40 group-hover:bg-white/70')} />
              </button>
            ))}
          </div>
          <a href="#content" className="hidden items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-white/70 hover:text-white sm:flex">Scroll <ChevronDown className="h-3.5 w-3.5 animate-bounce" /></a>
        </div>
      </div>
      <span id="content" className="absolute bottom-0" />
    </section>
  );
}

export function PageHeaderSection({ props, first }: { props: SectionProps<'pageHeader'>; first?: boolean }) {
  const hasImage = !!props.image;
  useOverlayHeader(!!first && hasImage);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 120]);
  if (!hasImage) {
    return (
      <section className="tone-surface pb-14 pt-20 sm:pt-28">
        <div className={cn('container-luxe', props.align === 'center' ? 'text-center' : '')}>
          <Reveal>
            {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
            <h1 className="h-display text-balance">{props.heading}</h1>
            {props.subheading && <p className={cn('mt-6 max-w-2xl text-lg text-muted', props.align === 'center' && 'mx-auto')}>{props.subheading}</p>}
          </Reveal>
        </div>
      </section>
    );
  }
  return (
    <section className={cn('relative isolate flex min-h-[64svh] items-end overflow-hidden bg-ink text-white', first && '-mt-[var(--header-h)]')}>
      <motion.div className="absolute inset-0 -z-10" style={{ y }}>
        <SmartImage quiet src={props.image} alt={props.alt || props.heading} priority className="h-full w-full" width={2400} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/65" />
      </motion.div>
      <div className={cn('container-luxe pb-16 pt-[calc(var(--header-h)+5rem)] sm:pb-20', props.align === 'center' && 'text-center')}>
        <Reveal>
          {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
          <h1 className="h-display text-balance">{props.heading}</h1>
          {props.subheading && <p className={cn('mt-6 max-w-2xl text-lg text-white/85', props.align === 'center' && 'mx-auto')}>{props.subheading}</p>}
        </Reveal>
      </div>
    </section>
  );
}

export function CtaBannerSection({ props }: { props: SectionProps<'ctaBanner'> }) {
  const reduce = useReducedMotion();
  return (
    <section className="relative isolate overflow-hidden bg-ink py-32 text-white sm:py-44">
      <div className="absolute inset-0 -z-10">
        <SmartImage quiet src={props.image} alt={props.alt || props.heading} className={cn('h-full w-full', !reduce && 'scale-105')} width={2400} />
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="container-luxe text-center">
        <Reveal>
          {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
          <h2 className="h-section mx-auto max-w-3xl text-balance">{props.heading}</h2>
          {props.subheading && <p className="mx-auto mt-6 max-w-xl text-white/80">{props.subheading}</p>}
          {props.ctaLabel && props.ctaHref && <SmartLink href={props.ctaHref} className="btn btn-light mt-10">{props.ctaLabel}</SmartLink>}
        </Reveal>
      </div>
    </section>
  );
}
