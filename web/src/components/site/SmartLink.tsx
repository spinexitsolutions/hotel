import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Internal paths use client-side routing; external, mailto: and tel: links open normally. */
export function SmartLink({ href, className, children, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  if (/^(https?:|mailto:|tel:)/.test(href)) {
    const external = href.startsWith('http');
    return <a href={href} className={className} aria-label={ariaLabel} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
  }
  if (href.startsWith('#')) return <a href={href} className={className} aria-label={ariaLabel}>{children}</a>;
  return <Link to={href} className={className} aria-label={ariaLabel}>{children}</Link>;
}
