import { useEffect, useRef, useState } from 'react';
import { SmartLink } from '@/components/site/SmartLink';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { SectionProps } from '@aurelle/shared';
import { SmartImage } from '@/components/site/SmartImage';
import { BookingBar } from '@/components/site/BookingBar';
import { Reveal } from '@/components/site/Reveal';
import { useOverlayHeader } from '@/components/site/HeaderContext';
import { cn } from '@/lib/cn';

/** object-position per focal point, so the important subject survives cover-cropping on any aspect ratio. */
const FOCUS = { center: 'object-center', top: 'object-[50%_22%]', bottom: 'object-[50%_78%]', left: 'object-[28%_50%]', right: 'object-[72%_50%]' } as const;

export function HeroSection({ props, first }: { props: SectionProps<'hero'>; first?: boolean }) {
  const slides = props.slides.length ? props.slides : [{ image: '', alt: '', eyebrow: '', heading: '', subheading: '' }];
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 160]);
  useOverlayHeader(!!first);

  // Pages saved before the video fields existed have no video props; they keep the image slideshow.
  const [videoFailed, setVideoFailed] = useState(false);
  const hasVideo = !!props.videoUrl && !videoFailed;
  const video = useBackgroundVideo(hasVideo ? props.videoUrl : '', props.videoUrlMobile, props.videoWebmUrl);
  const poster = props.poster || slides[0].image;
  const focus = FOCUS[props.focus ?? 'center'] ?? FOCUS.center;
  const overlay = Math.min(Math.max(props.overlay ?? 45, 0), 85) / 100;

  useEffect(() => {
    if (slides.length < 2 || reduce) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), props.interval * 1000);
    return () => clearInterval(t);
  }, [slides.length, props.interval, reduce]);

  const s = slides[i];
  return (
    <section className={cn('relative isolate flex flex-col overflow-hidden bg-ink text-white', props.height === 'full' ? 'min-h-[100svh]' : 'min-h-[78svh]', first && '-mt-[var(--header-h)]')} aria-roledescription="carousel" aria-label="Featured">
      <motion.div className="absolute inset-0 -z-10" style={{ y }}>
        {hasVideo ? (
          <>
            <SmartImage quiet src={poster} alt="" priority className="h-full w-full" imgClassName={focus} width={2400} />
            <video
              key={video.mp4}
              ref={video.ref}
              className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-out', focus, video.playing ? 'opacity-100' : 'opacity-0')}
              poster={poster || undefined}
              autoPlay={!video.stopped}
              muted
              loop
              playsInline
              preload={video.stopped ? 'none' : 'auto'}
              controls={false}
              disablePictureInPicture
              disableRemotePlayback
              aria-hidden
              tabIndex={-1}
              onPlaying={video.onPlaying}
              onError={() => setVideoFailed(true)}
            >
              {video.webm && <source src={video.webm} type="video/webm" />}
              <source src={video.mp4} type="video/mp4" onError={() => setVideoFailed(true)} />
            </video>
          </>
        ) : (
          <AnimatePresence initial={false}>
            <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.8, ease: 'easeInOut' }}>
              <SmartImage quiet src={s.image} alt={s.alt || s.heading} priority={i === 0} className="h-full w-full" imgClassName={reduce ? '' : 'animate-kenburns'} width={2400} />
            </motion.div>
          </AnimatePresence>
        )}
        {/* Cinematic grade: an adjustable scrim plus a top/bottom gradient and soft vignette for legible type. */}
        <div className="absolute inset-0 bg-black" style={{ opacity: overlay * 0.6 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />
        <div className="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]" />
      </motion.div>

      <div className="container-luxe flex flex-1 flex-col items-center justify-center pb-10 pt-[calc(var(--header-h)+3rem)] text-center">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="max-w-4xl">
            {s.eyebrow && (
              <p className="eyebrow mb-6 flex items-center justify-center gap-4 text-primary">
                <span aria-hidden className="h-px w-8 bg-primary/70 sm:w-12" />{s.eyebrow}<span aria-hidden className="h-px w-8 bg-primary/70 sm:w-12" />
              </p>
            )}
            <h1 className="h-display text-balance [text-shadow:0_2px_30px_rgba(0,0,0,0.35)]">{s.heading}</h1>
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
          <div className="flex items-center gap-6">
            {hasVideo && (
              <button type="button" onClick={video.toggle} aria-label={video.stopped ? 'Play background video' : 'Pause background video'} className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-white/70 transition hover:text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40">{video.stopped ? <Play className="h-3 w-3 translate-x-px" /> : <Pause className="h-3 w-3" />}</span>
                <span className="hidden sm:inline">{video.stopped ? 'Play' : 'Pause'}</span>
              </button>
            )}
            <a href="#content" className="hidden items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-white/70 hover:text-white sm:flex">Scroll <ChevronDown className="h-3.5 w-3.5 animate-bounce" /></a>
          </div>
        </div>
      </div>
      <span id="content" className="absolute bottom-0" />
    </section>
  );
}

/**
 * Drives a muted, looping, inline background video: picks the mobile or desktop encode, fades it in only
 * once frames are actually playing (the poster stays underneath until then), pauses it while off-screen or
 * in a background tab, and leaves it stopped for reduced-motion and Save-Data visitors. If the browser
 * refuses autoplay the poster stays, with the play button to start it.
 */
function useBackgroundVideo(src: string, mobileSrc?: string, webmSrc?: string) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)');
  const saveData = typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const [playing, setPlaying] = useState(false);
  // Stopped by the visitor (or by preference); off-screen and background-tab pauses don't count.
  const [stopped, setStopped] = useState(!!reduce || saveData);
  const stoppedRef = useRef(stopped);
  stoppedRef.current = stopped;

  const mp4 = (mobile && mobileSrc) || src;
  const webm = mobile && mobileSrc ? '' : webmSrc ?? '';

  useEffect(() => {
    const v = ref.current;
    if (!v || !mp4) return;
    // React does not reliably reflect `muted` as an attribute, and browsers only autoplay muted media.
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => {
      if (stoppedRef.current) return;
      v.play().catch(() => setStopped(true));
    };
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tryPlay() : v.pause()), { threshold: 0.05 });
    io.observe(v);
    const onVisibility = () => (document.hidden ? v.pause() : tryPlay());
    document.addEventListener('visibilitychange', onVisibility);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [mp4]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (stopped) { setStopped(false); v.play().catch(() => setStopped(true)); }
    else { setStopped(true); v.pause(); }
  };

  return { ref, mp4, webm, playing, stopped, toggle, onPlaying: () => setPlaying(true) };
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
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
