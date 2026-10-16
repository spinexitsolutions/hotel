import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { srcFor, srcSetFor } from '@/lib/image';

/**
 * Responsive, lazy image with an elegant fallback: if a URL fails (or is empty) it renders a warm gradient
 * panel instead of a broken-image icon. `priority` for above-the-fold heroes (eager + high fetch priority).
 */
export function SmartImage({ src, alt, sizes = '100vw', className, imgClassName, priority, width = 1600, style, quiet }: {
  src: string; alt: string; sizes?: string; className?: string; imgClassName?: string; priority?: boolean; width?: number; style?: CSSProperties; quiet?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const empty = !src || failed;
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-ink via-ink/90 to-primary/40', className)} style={style}>
      {!empty && (
        <img
          src={srcFor(src, width)}
          srcSet={srcSetFor(src)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
        />
      )}
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center" role="img" aria-label={alt}>
          {!quiet && (
          <svg viewBox="0 0 120 60" className="w-24 text-primary/50" aria-hidden><path d="M10 50 L40 20 L60 38 L75 26 L110 50 Z" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="88" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )}
        </div>
      )}
    </div>
  );
}
