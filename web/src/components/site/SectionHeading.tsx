import { cn } from '@/lib/cn';
import { Reveal } from './Reveal';

export function SectionHeading({ eyebrow, heading, subheading, align = 'center', className }: { eyebrow?: string; heading?: string; subheading?: string; align?: 'center' | 'left'; className?: string }) {
  if (!eyebrow && !heading && !subheading) return null;
  return (
    <Reveal className={cn('mb-12 lg:mb-16', align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl', className)}>
      {eyebrow && <p className="eyebrow mb-5">{eyebrow}</p>}
      {heading && <h2 className="h-section text-balance">{heading}</h2>}
      {subheading && <p className="mt-6 text-[1.05rem] leading-relaxed text-muted text-pretty">{subheading}</p>}
    </Reveal>
  );
}
