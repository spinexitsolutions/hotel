import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, X } from 'lucide-react';
import { useSite } from '@/app/SiteProvider';
import { exitPreview } from '@/app/preview';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function AnnouncementBar() {
  const { config } = useSite();
  const a = config.announcement;
  const key = `aur_ann_${a.text.length}_${a.text.slice(0, 12)}`;
  const [hidden, setHidden] = useState(() => read(key) === '1');
  if (!a.enabled || !a.text || hidden) return null;
  return (
    <div className="relative z-50 bg-ink px-10 py-2.5 text-center text-[0.72rem] tracking-[0.08em] text-canvas/85">
      <span>{a.text}</span>
      {a.linkLabel && a.linkHref && <Link to={a.linkHref} className="ml-3 whitespace-nowrap uppercase tracking-[0.18em] text-primary underline-offset-4 hover:underline">{a.linkLabel}</Link>}
      {a.dismissible && <button onClick={() => { write(key, '1'); setHidden(true); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-canvas/60 hover:text-canvas" aria-label="Dismiss announcement"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

/**
 * Always-on notice: this site is a portfolio concept of a real hotel, so every public page says so.
 * Deliberately not CMS-editable or dismissible.
 */
export function ConceptNotice() {
  return (
    <div role="note" className="no-print relative z-50 bg-primary px-4 py-2 text-center text-[0.7rem] font-medium leading-snug tracking-[0.04em] text-ink">
      Portfolio concept — not the official Rambagh Palace website and not affiliated with Taj Hotels or IHCL. No real bookings or payments are taken.
    </div>
  );
}

export function PreviewBanner() {
  const { preview } = useSite();
  if (!preview) return null;
  return (
    <div className="no-print sticky top-0 z-[60] flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-xs font-medium text-amber-950">
      <Eye className="h-4 w-4" /> Preview mode — you are viewing unpublished drafts.
      <button onClick={exitPreview} className="underline underline-offset-2">Exit preview</button>
    </div>
  );
}

export function WhatsAppButton() {
  const { config } = useSite();
  if (!config.integrations.showWhatsappButton || !config.contact.whatsapp) return null;
  const href = `https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(config.contact.whatsappMessage)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" className="no-print fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition hover:scale-105">
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor" aria-hidden><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.1c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3Zm0 23.1c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-4.1 1.2 1.2-4-.3-.4a10.4 10.4 0 0 1-1.6-5.6C5.4 9.8 10.2 5.2 16 5.2s10.6 4.6 10.6 10.4S21.8 26.1 16 26.1Zm5.8-7.8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3.1 2.1 3.3 5.2 4.6c1.9.8 2.7.9 3.6.7.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.2-.2-.5-.3Z" /></svg>
    </a>
  );
}

/** Cookie consent; Google Analytics is only loaded after the visitor accepts. */
export function CookieConsent() {
  const { config } = useSite();
  const [choice, setChoice] = useState(() => read('aur_consent'));
  const gaId = config.integrations.gaMeasurementId;

  useEffect(() => {
    if (choice !== 'all' || !gaId || document.getElementById('ga-script')) return;
    const s = document.createElement('script');
    s.id = 'ga-script';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(s);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { w.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
    w.gtag('js', new Date());
    w.gtag('config', gaId, { anonymize_ip: true });
  }, [choice, gaId]);

  if (!config.integrations.cookieConsent || choice) return null;
  const decide = (v: 'all' | 'essential') => { write('aur_consent', v); setChoice(v); };
  return (
    <AnimatePresence>
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2 }} role="dialog" aria-label="Cookie preferences"
        className="no-print fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl border border-line bg-canvas p-6 shadow-2xl sm:left-6 sm:right-auto" style={{ borderRadius: 'var(--radius)' }}>
        <p className="font-display text-xl">Your privacy</p>
        <p className="mt-2 text-sm text-muted">We use essential cookies to keep you signed in and to protect forms. With your permission we also use analytics cookies to improve our website. <Link to="/privacy-policy" className="underline underline-offset-4">Privacy policy</Link></p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary btn-sm" onClick={() => decide('all')}>Accept all</button>
          <button className="btn btn-ghost btn-sm" onClick={() => decide('essential')}>Essential only</button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
