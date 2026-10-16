import { useSite } from '@/app/SiteProvider';
import { cn } from '@/lib/cn';

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  const { config } = useSite();
  const src = light ? config.brand.logoLightUrl || config.brand.logoUrl : config.brand.logoUrl;
  if (src) return <img src={src} alt={config.brand.name} className={cn('h-10 w-auto object-contain', className)} />;
  return (
    <span className={cn('flex flex-col items-center leading-none', className)}>
      <span className="font-display text-[1.55rem] tracking-[0.28em] uppercase" style={{ textTransform: 'uppercase' }}>{config.brand.name.replace(/^The\s+/i, '')}</span>
      <span className="mt-1 text-[0.55rem] tracking-[0.45em] uppercase opacity-70">{/^The\s+/i.test(config.brand.name) ? 'The · ' : ''}{config.contact.city || 'Hotel'}</span>
    </span>
  );
}
