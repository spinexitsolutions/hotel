import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Menu, User, X } from 'lucide-react';
import type { NavItem } from '@aurelle/shared';
import { useSite } from '@/app/SiteProvider';
import { useAuth } from '@/app/AuthProvider';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { useHeader } from './HeaderContext';

function NavLinkItem({ item, light }: { item: NavItem; light: boolean }) {
  const [open, setOpen] = useState(false);
  const base = cn('relative py-2 text-[0.7rem] font-medium uppercase tracking-[0.2em] transition-colors', light ? 'text-white/90 hover:text-white' : 'text-fg/80 hover:text-fg');
  if (!item.children?.length) {
    return (
      <NavLink to={item.href} className={({ isActive }) => cn(base, 'after:absolute after:-bottom-0.5 after:left-0 after:h-px after:bg-primary after:transition-all after:duration-500', isActive ? 'after:w-full' : 'after:w-0 hover:after:w-full')}>
        {item.label}
      </NavLink>
    );
  }
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={cn(base, 'flex items-center gap-1')} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
        {item.label} <ChevronDown className="h-3 w-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25 }} className="absolute left-1/2 top-full z-50 min-w-[220px] -translate-x-1/2 pt-3">
            <div className="border border-line bg-canvas py-3 shadow-2xl" style={{ borderRadius: 'var(--radius)' }}>
              {item.children.map((c) => (
                <Link key={c.id} to={c.href} onClick={() => setOpen(false)} className="block px-6 py-2.5 text-[0.82rem] text-fg/80 transition hover:bg-surface hover:text-fg">{c.label}</Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const { config } = useSite();
  const { user } = useAuth();
  const { overlay } = useHeader();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setMobile(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
  }, [mobile]);

  const transparent = overlay && config.header.transparentOnHero && !scrolled && !mobile;
  const menu = config.header.menu;
  const left = menu.slice(0, Math.ceil(menu.length / 2));
  const right = menu.slice(Math.ceil(menu.length / 2));

  return (
    <>
      <header
        className={cn('sticky top-0 z-40 w-full transition-all duration-700 ease-luxe', transparent ? 'bg-transparent' : 'border-b border-line/70 bg-canvas/95 backdrop-blur-md')}
        style={{ height: 'var(--header-h)' }}
      >
        <div className="container-luxe flex h-full items-center justify-between gap-6">
          <button className={cn('lg:hidden', transparent ? 'text-white' : 'text-fg')} onClick={() => setMobile(true)} aria-label="Open menu" aria-expanded={mobile}>
            <Menu className="h-6 w-6" strokeWidth={1.2} />
          </button>
          <nav className="hidden flex-1 items-center gap-7 lg:flex" aria-label="Primary">
            {left.map((i) => <NavLinkItem key={i.id} item={i} light={transparent} />)}
          </nav>
          <Link to="/" className={cn('shrink-0 transition-colors', transparent ? 'text-white' : 'text-fg')} aria-label={`${config.brand.name} — home`}>
            <Logo light={transparent} />
          </Link>
          <div className="flex flex-1 items-center justify-end gap-7">
            <nav className="hidden items-center gap-7 lg:flex" aria-label="Secondary">
              {right.map((i) => <NavLinkItem key={i.id} item={i} light={transparent} />)}
            </nav>
            <Link to={user && !user.isStaff ? '/account' : user?.isStaff ? '/admin' : '/login'} aria-label={user ? 'Your account' : 'Sign in'} className={cn('hidden sm:block', transparent ? 'text-white' : 'text-fg')}>
              <User className="h-5 w-5" strokeWidth={1.2} />
            </Link>
            <Link to={config.header.ctaHref || '/book'} className={cn('btn btn-sm', transparent ? 'btn-light' : 'btn-primary')}>{config.header.ctaLabel || 'Reserve'}</Link>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col bg-ink text-canvas" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="container-luxe flex items-center justify-between" style={{ height: 'var(--header-h)' }}>
              <button onClick={() => setMobile(false)} aria-label="Close menu"><X className="h-6 w-6" strokeWidth={1.2} /></button>
              <Logo light />
              <span className="w-6" />
            </div>
            <nav className="container-luxe flex-1 overflow-y-auto py-8" aria-label="Mobile">
              <ul className="space-y-1">
                {menu.map((i, idx) => (
                  <motion.li key={i.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * idx }}>
                    <Link to={i.href} className="block py-3 font-display text-3xl">{i.label}</Link>
                    {i.children?.length ? (
                      <ul className="mb-3 ml-1 space-y-1 border-l border-primary/40 pl-4">
                        {i.children.map((c) => <li key={c.id}><Link to={c.href} className="block py-1.5 text-sm uppercase tracking-[0.18em] text-canvas/70">{c.label}</Link></li>)}
                      </ul>
                    ) : null}
                  </motion.li>
                ))}
              </ul>
              <div className="mt-10 flex flex-col gap-3">
                <Link to="/book" className="btn btn-primary">{config.header.ctaLabel || 'Reserve'}</Link>
                <Link to={user ? (user.isStaff ? '/admin' : '/account') : '/login'} className="btn btn-light">{user ? 'My account' : 'Sign in'}</Link>
              </div>
              <p className="mt-10 text-sm text-canvas/60">{config.contact.phone}<br />{config.contact.email}</p>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
