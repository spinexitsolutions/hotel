import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Shell({ tone = 'light', children, className, id, tight }: { tone?: string; children: ReactNode; className?: string; id?: string; tight?: boolean }) {
  return (
    <section id={id} className={cn(`tone-${tone}`, tight ? 'py-section-sm' : 'py-section', className)}>
      {children}
    </section>
  );
}
