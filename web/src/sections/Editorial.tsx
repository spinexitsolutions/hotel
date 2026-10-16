import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import type { SectionProps } from '@aurelle/shared';
import { SmartImage } from '@/components/site/SmartImage';
import { Reveal } from '@/components/site/Reveal';
import { Markdown } from '@/components/site/Markdown';
import { SmartLink } from '@/components/site/SmartLink';
import { SectionHeading } from '@/components/site/SectionHeading';
import { Icon } from '@/components/site/Icon';
import { cn } from '@/lib/cn';
import { Shell } from './Shell';

function ParallaxImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-6%', '6%']);
  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)} style={{ borderRadius: 'var(--radius)' }}>
      <motion.div className="absolute inset-[-8%_0]" style={{ y }}>
        <SmartImage src={src} alt={alt} className="h-full w-full" sizes="(min-width: 1024px) 50vw, 100vw" />
      </motion.div>
    </div>
  );
}

export function IntroSection({ props }: { props: SectionProps<'intro'> }) {
  if (props.layout === 'centered' || !props.image) {
    return (
      <Shell tone={props.tone}>
        <div className="container-luxe">
          <Reveal className="mx-auto max-w-3xl text-center">
            {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
            {props.heading && <h2 className="h-section text-balance">{props.heading}</h2>}
            {props.subheading && <p className="mt-5 text-lg text-muted">{props.subheading}</p>}
            {props.body && <div className="divider-ornament" aria-hidden>✦</div>}
            {props.body && <Markdown className="text-[1.08rem]">{props.body}</Markdown>}
            {props.ctaLabel && props.ctaHref && <SmartLink href={props.ctaHref} className="btn btn-link mt-4">{props.ctaLabel}</SmartLink>}
          </Reveal>
        </div>
      </Shell>
    );
  }
  const imageLeft = props.layout === 'image-left';
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
        <Reveal className={cn('lg:col-span-6', imageLeft ? 'lg:order-1' : 'lg:order-2')}>
          <ParallaxImage src={props.image} alt={props.alt || props.heading} className="aspect-[4/5]" />
        </Reveal>
        <Reveal delay={0.15} className={cn('lg:col-span-6', imageLeft ? 'lg:order-2' : 'lg:order-1')}>
          {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
          {props.heading && <h2 className="h-section text-balance">{props.heading}</h2>}
          {props.subheading && <p className="mt-5 text-lg text-muted">{props.subheading}</p>}
          {props.body && <Markdown className="mt-8">{props.body}</Markdown>}
          {props.ctaLabel && props.ctaHref && <SmartLink href={props.ctaHref} className="btn btn-link mt-4">{props.ctaLabel}</SmartLink>}
        </Reveal>
      </div>
    </Shell>
  );
}

export function FeatureSplitSection({ props }: { props: SectionProps<'featureSplit'> }) {
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className={cn('lg:col-span-7', props.reverse && 'lg:order-2')}>
          <ParallaxImage src={props.image} alt={props.alt || props.heading} className="aspect-[4/3] lg:aspect-[5/4]" />
        </Reveal>
        <Reveal delay={0.15} className={cn('lg:col-span-5', props.reverse && 'lg:order-1')}>
          {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
          {props.heading && <h2 className="h-section text-balance">{props.heading}</h2>}
          {props.body && <Markdown className="mt-7">{props.body}</Markdown>}
          {props.details.length > 0 && (
            <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-8">
              {props.details.map((d, i) => (
                <div key={i}>
                  <dt className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">{d.label}</dt>
                  <dd className="mt-1 font-display text-xl">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {props.ctaLabel && props.ctaHref && <SmartLink href={props.ctaHref} className="btn btn-primary mt-10">{props.ctaLabel}</SmartLink>}
        </Reveal>
      </div>
    </Shell>
  );
}

export function StatsSection({ props }: { props: SectionProps<'stats'> }) {
  return (
    <Shell tone={props.tone} tight>
      <div className="container-luxe">
        <dl className={cn('grid gap-10 text-center', props.items.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3')}>
          {props.items.map((s, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <dd className="font-display text-5xl text-primary sm:text-6xl">{s.value}</dd>
              <dt className="mt-3 text-[0.68rem] uppercase tracking-[0.22em] opacity-70">{s.label}</dt>
            </Reveal>
          ))}
        </dl>
      </div>
    </Shell>
  );
}

export function AmenitiesSection({ props }: { props: SectionProps<'amenities'> }) {
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        <ul className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {props.items.map((a, i) => (
            <Reveal as="li" key={i} delay={(i % 4) * 0.08} className="group">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 text-primary transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-contrast">
                <Icon name={a.icon} className="h-6 w-6" />
              </div>
              <h3 className="font-display text-2xl">{a.title}</h3>
              {a.description && <p className="mt-2 text-sm leading-relaxed text-muted">{a.description}</p>}
            </Reveal>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function CardsSection({ props }: { props: SectionProps<'cards'> }) {
  const cols = props.columns === '2' ? 'md:grid-cols-2' : props.columns === '4' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 lg:grid-cols-3';
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        <div className={cn('grid gap-x-8 gap-y-14', cols)}>
          {props.items.map((c, i) => {
            const inner = (
              <>
                <div className="overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                  <SmartImage src={c.image} alt={c.alt || c.title} className="aspect-[4/5]" imgClassName="img-zoom" sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" />
                </div>
                {c.meta && <p className="eyebrow mt-6">{c.meta}</p>}
                <h3 className="h-card mt-3">{c.title}</h3>
                {c.description && <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{c.description}</p>}
                {c.linkLabel && c.href && <span className="btn btn-link mt-4">{c.linkLabel}</span>}
              </>
            );
            return (
              <Reveal key={i} delay={(i % 3) * 0.1} className="group">
                {c.href ? <SmartLink href={c.href} className="block">{inner}</SmartLink> : inner}
              </Reveal>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

export function RichTextSection({ props }: { props: SectionProps<'richText'> }) {
  return (
    <Shell tone={props.tone} tight>
      <div className={cn('container-luxe', props.narrow && 'max-w-3xl')}>
        <Markdown>{props.body}</Markdown>
      </div>
    </Shell>
  );
}
