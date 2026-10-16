import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Scroll-triggered fade/rise. Disabled for reduced-motion users. */
export function Reveal({ children, delay = 0, className, y = 28, as = 'div' }: { children: ReactNode; delay?: number; className?: string; y?: number; as?: 'div' | 'li' | 'section' }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </Comp>
  );
}
