import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from 'lucide-react';
import { useSite } from '@/app/SiteProvider';
import { Logo } from './Logo';
import { NewsletterForm } from './NewsletterForm';

const XIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.828l-5.35-6.993L4.6 22H1.34l8.02-9.168L1 2h7.004l4.83 6.39L18.244 2Zm-1.197 18h1.89L7.04 3.9H5.01L17.047 20Z" /></svg>;
const TripIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><circle cx="7" cy="13" r="3.5" /><circle cx="17" cy="13" r="3.5" /><path d="M3 8h18M12 8l-1.5-2h3L12 8Z" /></svg>;

export function Footer() {
  const { config } = useSite();
  const s = config.social;
  const socials = [
    { href: s.instagram, label: 'Instagram', icon: <Instagram className="h-4 w-4" strokeWidth={1.4} /> },
    { href: s.facebook, label: 'Facebook', icon: <Facebook className="h-4 w-4" strokeWidth={1.4} /> },
    { href: s.x, label: 'X', icon: <XIcon /> },
    { href: s.youtube, label: 'YouTube', icon: <Youtube className="h-4 w-4" strokeWidth={1.4} /> },
    { href: s.linkedin, label: 'LinkedIn', icon: <Linkedin className="h-4 w-4" strokeWidth={1.4} /> },
    { href: s.tripadvisor, label: 'Tripadvisor', icon: <TripIcon /> },
  ].filter((x) => x.href);

  return (
    <footer className="tone-dark relative overflow-hidden pt-20" role="contentinfo">
      <div className="container-luxe">
        {config.footer.showNewsletter && (
          <div className="mb-16 grid gap-8 border-b border-white/10 pb-16 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="eyebrow mb-4">Letters from the palace</p>
              <p className="font-display text-3xl sm:text-4xl">Seasonal offers and stories, a few times a year.</p>
            </div>
            <NewsletterForm source="footer" dark />
          </div>
        )}
        <div className="grid gap-12 pb-16 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo light className="items-start" />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-canvas/60">{config.footer.about}</p>
            <ul className="mt-8 space-y-3 text-sm text-canvas/75">
              <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.3} /><span>{config.contact.addressLine1}<br />{config.contact.addressLine2}</span></li>
              {config.contact.phone && <li className="flex gap-3"><Phone className="h-4 w-4 text-primary" strokeWidth={1.3} /><a href={`tel:${config.contact.phone.replace(/\s/g, '')}`} className="hover:text-white">{config.contact.phone}</a></li>}
              {config.contact.email && <li className="flex gap-3"><Mail className="h-4 w-4 text-primary" strokeWidth={1.3} /><a href={`mailto:${config.contact.email}`} className="hover:text-white">{config.contact.email}</a></li>}
            </ul>
          </div>
          {config.footer.columns.map((col) => (
            <div key={col.id} className="lg:col-span-2 lg:col-start-auto">
              <p className="mb-5 text-[0.68rem] font-medium uppercase tracking-luxe text-primary">{col.title}</p>
              <ul className="space-y-3 text-sm text-canvas/70">
                {col.links.map((l) => <li key={l.id}><Link to={l.href} className="transition hover:text-white">{l.label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-6 border-t border-white/10 py-8 text-xs text-canvas/50 sm:flex-row">
          <p>{config.footer.bottomText.replace('{year}', String(new Date().getFullYear()))}</p>
          <div className="flex items-center gap-4">
            {socials.map((x) => <a key={x.label} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={x.label} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-canvas/70 transition hover:border-primary hover:text-primary">{x.icon}</a>)}
          </div>
        </div>
      </div>
    </footer>
  );
}
