import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { contactSchema, type SectionProps } from '@aurelle/shared';
import { post, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSite } from '@/app/SiteProvider';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { SectionHeading } from '@/components/site/SectionHeading';
import { NewsletterForm } from '@/components/site/NewsletterForm';
import { Reveal } from '@/components/site/Reveal';
import { Shell } from './Shell';

type ContactValues = z.input<typeof contactSchema>;

export function ContactFormSection({ props, id }: { props: SectionProps<'contactForm'>; id?: string }) {
  const { config } = useSite();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { type: props.inquiryType, name: '', email: '', phone: '', subject: '', message: '', eventDate: '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    setServerError('');
    try {
      await post('/contact', { ...v, guestCount: v.guestCount ? Number(v.guestCount) : undefined, eventDate: v.eventDate || undefined });
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as keyof ContactValues, { message: m });
      setServerError(e instanceof Error ? e.message : 'Could not send your message.');
    }
  });

  return (
    <Shell tone={props.tone} id={id}>
      <div className={cn('container-luxe grid gap-16', props.showDetails ? 'lg:grid-cols-12' : 'max-w-3xl')}>
        {props.showDetails && (
          <Reveal className="lg:col-span-4">
            <p className="eyebrow mb-5">Reach us</p>
            <h2 className="font-display text-4xl">{config.brand.name}</h2>
            <ul className="mt-8 space-y-6 text-[0.95rem]">
              <li className="flex gap-4"><MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" strokeWidth={1.2} /><span>{config.contact.addressLine1}<br />{config.contact.addressLine2}<br />{config.contact.country}</span></li>
              {config.contact.phone && <li className="flex gap-4"><Phone className="h-5 w-5 text-primary" strokeWidth={1.2} /><a href={`tel:${config.contact.phone.replace(/\s/g, '')}`} className="hover:text-primary">{config.contact.phone}</a></li>}
              {config.contact.email && <li className="flex gap-4"><Mail className="h-5 w-5 text-primary" strokeWidth={1.2} /><a href={`mailto:${config.contact.email}`} className="hover:text-primary">{config.contact.email}</a></li>}
            </ul>
          </Reveal>
        )}
        <div className={props.showDetails ? 'lg:col-span-8' : ''}>
          <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} align={props.showDetails ? 'left' : 'center'} className="!mb-10" />
          {sent ? (
            <div className="card-luxe flex flex-col items-center p-12 text-center" role="status">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-contrast"><Check className="h-6 w-6" /></span>
              <p className="font-display text-3xl">Thank you</p>
              <p className="mt-3 text-muted">Your message has been received. We will reply within one business day.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="grid gap-6 sm:grid-cols-2">
              <Field label="Full name" error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" {...register('name')} />}</Field>
              <Field label="Email" error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</Field>
              <Field label="Phone (optional)" error={errors.phone?.message}>{(p) => <Input {...p} type="tel" autoComplete="tel" {...register('phone')} />}</Field>
              <Field label="Subject" error={errors.subject?.message}>{(p) => <Input {...p} {...register('subject')} />}</Field>
              {props.showEventFields && (
                <>
                  <Field label="Preferred date" error={errors.eventDate?.message}>{(p) => <Input {...p} type="date" {...register('eventDate')} />}</Field>
                  <Field label="Number of guests" error={errors.guestCount?.message}>{(p) => <Input {...p} type="number" min={1} {...register('guestCount', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} />}</Field>
                </>
              )}
              <Field label="Message" error={errors.message?.message} className="sm:col-span-2">{(p) => <Textarea {...p} rows={5} {...register('message')} />}</Field>
              <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...register('website')} />
              {serverError && <p className="text-sm text-red-700 sm:col-span-2" role="alert">{serverError}</p>}
              <div className="sm:col-span-2">
                <button className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send message'}</button>
                <p className="mt-4 text-xs text-muted">By sending this form you agree to our privacy policy. We use your details only to reply to you.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function NewsletterSection({ props }: { props: SectionProps<'newsletter'> }) {
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe max-w-3xl text-center">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} className="!mb-10" />
        <Reveal><NewsletterForm source="section" dark={props.tone === 'dark'} buttonLabel={props.buttonLabel || 'Subscribe'} /></Reveal>
      </div>
    </Shell>
  );
}

/** Google Maps embed (no API key needed). Loaded on demand so no third-party cookies are set without action. */
export function LocationSection({ props }: { props: SectionProps<'location'> }) {
  const { config } = useSite();
  const [loadMap, setLoadMap] = useState(() => { try { return localStorage.getItem('aur_consent') === 'all'; } catch { return false; } });
  const q = encodeURIComponent(config.contact.mapQuery || `${config.contact.addressLine1} ${config.contact.addressLine2}`);
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} align="left" className="!mb-8" />
          <p className="flex gap-3 text-[0.95rem]"><MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" strokeWidth={1.2} />{config.contact.addressLine1}, {config.contact.addressLine2}</p>
          <a className="btn btn-link mt-4" href={`https://www.google.com/maps/dir/?api=1&destination=${q}`} target="_blank" rel="noopener noreferrer"><Navigation className="h-3.5 w-3.5" /> Get directions</a>
          {props.attractions.length > 0 && (
            <ul className="mt-10 divide-y divide-line border-y border-line">
              {props.attractions.map((a, i) => (
                <li key={i} className="py-5">
                  <div className="flex items-baseline justify-between gap-4"><p className="font-display text-xl">{a.name}</p><p className="whitespace-nowrap text-xs uppercase tracking-[0.15em] text-primary">{a.distance}</p></div>
                  {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {props.showMap && (
          <Reveal className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden border border-line bg-surface lg:aspect-auto lg:h-full lg:min-h-[480px]" style={{ borderRadius: 'var(--radius)' }}>
              {loadMap ? (
                <iframe title={`Map showing ${config.brand.name}`} src={`https://www.google.com/maps?q=${q}&output=embed`} className="absolute inset-0 h-full w-full grayscale-[40%]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <MapPin className="h-10 w-10 text-primary" strokeWidth={1} />
                  <p className="text-sm text-muted">The interactive map is provided by Google and may set cookies.</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLoadMap(true)}>Show map</button>
                </div>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </Shell>
  );
}
