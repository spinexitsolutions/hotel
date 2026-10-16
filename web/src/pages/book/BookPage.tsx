import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Minus, Plus, Tag, X } from 'lucide-react';
import { addDays, bookingRequestsSchema, guestDetailsSchema, type Quote } from '@aurelle/shared';
import { ApiError, get, post } from '@/lib/api';
import { money, plural, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AddOn, MealPlan, PaymentInit, PublicBooking, QuoteResponse, Room } from '@/lib/types';
import { rememberBookingToken } from '@/lib/payment';
import { useSite } from '@/app/SiteProvider';
import { useAuth } from '@/app/AuthProvider';
import { Seo } from '@/components/site/Seo';
import { SmartImage } from '@/components/site/SmartImage';
import { DateRangePicker } from '@/components/site/DateRangePicker';
import { GuestPicker } from '@/components/site/GuestPicker';
import { PriceSummary } from '@/components/site/PriceSummary';
import { PaymentPanel } from '@/components/site/PaymentPanel';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/States';

const STEPS = ['Room', 'Enhance', 'Details', 'Payment'] as const;

const detailsSchema = z.object({
  guest: guestDetailsSchema,
  requests: bookingRequestsSchema,
  paymentMethod: z.enum(['ONLINE', 'PAY_AT_HOTEL']),
  acceptTerms: z.boolean().refine((v) => v, 'Please accept the booking terms'),
  marketingOptIn: z.boolean(),
});
type Details = z.input<typeof detailsSchema>;

function Steps({ step }: { step: number }) {
  return (
    <ol className="mb-12 flex items-center justify-center gap-2 sm:gap-6" aria-label="Booking progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2 sm:gap-6" aria-current={i === step ? 'step' : undefined}>
          <span className={cn('flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em]', i <= step ? 'text-fg' : 'text-muted/60')}>
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border text-[0.7rem]', i < step ? 'border-primary bg-primary text-primary-contrast' : i === step ? 'border-fg' : 'border-line')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-line sm:w-12" />}
        </li>
      ))}
    </ol>
  );
}

export default function BookPage() {
  const { today, booking: policy, config } = useSite();
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const checkIn = sp.get('checkIn') ?? addDays(today, 14);
  const checkOut = sp.get('checkOut') ?? addDays(today, 16);
  const adults = Number(sp.get('adults') ?? 2);
  const children = Number(sp.get('children') ?? 0);
  const rooms = Number(sp.get('rooms') ?? 1);
  const roomSlug = sp.get('room');
  const offerId = sp.get('offer');
  const setParams = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, String(v)));
    setSp(next, { replace: true });
  };

  const stay = { checkIn, checkOut, adults, children, rooms };
  const roomsQ = useQuery({ queryKey: ['rooms', 'book', stay], queryFn: () => get<{ items: Room[] }>('/rooms', stay), placeholderData: (p) => p });
  const options = useQuery({ queryKey: ['booking-options'], queryFn: () => get<{ mealPlans: MealPlan[]; addOns: AddOn[] }>('/booking-options'), staleTime: 300_000 });
  const room = roomsQ.data?.items.find((r) => r.slug === roomSlug) ?? null;

  const [step, setStep] = useState(roomSlug ? 1 : 0);
  useEffect(() => { if (!roomSlug) setStep(0); }, [roomSlug]);

  // Enhancements
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [extraBeds, setExtraBeds] = useState(0);
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  useEffect(() => {
    if (room) setExtraBeds(Math.max(0, Math.min(room.maxExtraBeds * rooms, adults + children - room.maxOccupancy * rooms)));
  }, [room, adults, children, rooms]);
  useEffect(() => {
    if (!mealPlanId && options.data?.mealPlans.length) setMealPlanId(options.data.mealPlans.find((m) => m.code === 'CP')?.id ?? options.data.mealPlans[0].id);
  }, [options.data, mealPlanId]);

  const quoteBody = room ? { roomTypeId: room.id, ...stay, extraBeds, mealPlanId, addOns: Object.entries(addOns).filter(([, q]) => q > 0).map(([addOnId, quantity]) => ({ addOnId, quantity })), offerId, couponCode: appliedCoupon } : null;
  const quoteQ = useQuery({
    queryKey: ['quote', quoteBody],
    queryFn: () => post<QuoteResponse>('/quote', quoteBody),
    enabled: !!quoteBody && step >= 1,
    placeholderData: (p) => p,
    retry: false,
  });
  useEffect(() => {
    if (quoteQ.error instanceof ApiError && quoteQ.error.code.startsWith('COUPON')) {
      setCouponError(quoteQ.error.message);
      setAppliedCoupon(null);
    }
  }, [quoteQ.error]);
  const quote: Quote | undefined = quoteQ.data?.quote;

  // Details & submission
  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      guest: { firstName: user?.name.split(' ')[0] ?? '', lastName: user?.name.split(' ').slice(1).join(' ') ?? '', email: user?.email ?? '', phone: user?.phone ?? '', country: 'India' },
      requests: { arrivalTime: '', earlyCheckIn: false, lateCheckOut: false, occasion: '', airportTransfer: { required: false, flightNumber: '', arrivalAt: '' }, specialInstructions: '' },
      paymentMethod: policy.onlinePaymentEnabled ? 'ONLINE' : 'PAY_AT_HOTEL',
      acceptTerms: false,
      marketingOptIn: false,
    },
  });
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState<{ booking: PublicBooking; manageToken: string; payment: PaymentInit | null } | null>(null);

  const submit = form.handleSubmit(async (d) => {
    if (!quoteBody || !quote) return;
    setSubmitError('');
    try {
      const res = await post<{ booking: PublicBooking; manageToken: string; payment: PaymentInit | null }>('/bookings', {
        ...quoteBody, ...d, offerId: quoteQ.data?.offer?.id ?? offerId, expectedTotal: quote.grandTotal, source: 'WEBSITE',
        utm: Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign'].map((k) => [k, sp.get(k) ?? sessionStorage.getItem(k) ?? '']).filter(([, v]) => v)),
      });
      rememberBookingToken(res.booking.reference, res.manageToken);
      if (res.booking.status === 'PENDING_PAYMENT' && res.payment) {
        setCreated(res);
        setStep(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        nav(`/booking/${res.booking.reference}?token=${res.manageToken}&new=1`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
        void quoteQ.refetch();
        setSubmitError('The price for your stay has just changed. Please review the updated total and confirm again.');
      } else if (e instanceof ApiError && (e.code === 'SOLD_OUT' || e.code === 'UNAVAILABLE')) {
        setSubmitError(`${e.message} Please choose another room or dates.`);
      } else setSubmitError(e instanceof Error ? e.message : 'We could not complete your booking.');
    }
  });

  const selectRoom = (r: Room) => { setParams({ room: r.slug }); setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="tone-surface min-h-screen pb-24 pt-12">
      <Seo title="Book your stay" noIndex />
      <div className="container-luxe">
        <h1 className="mb-8 text-center font-display text-4xl sm:text-5xl">Reserve your stay</h1>
        <Steps step={step} />

        {/* Stay bar */}
        {step < 3 && (
          <div className="mb-10 grid border border-line bg-canvas md:grid-cols-2" style={{ borderRadius: 'var(--radius)' }}>
            <div className="border-b border-line px-6 py-4 md:border-b-0 md:border-r"><DateRangePicker checkIn={checkIn} checkOut={checkOut} roomTypeId={room?.id} onChange={(a, b) => setParams({ checkIn: a, checkOut: b })} /></div>
            <div className="px-6 py-4"><GuestPicker value={{ adults, children, rooms }} onChange={(g) => setParams({ adults: g.adults, children: g.children, rooms: g.rooms })} /></div>
          </div>
        )}

        {step === 0 && (
          <section aria-labelledby="choose-room">
            <h2 id="choose-room" className="sr-only">Choose a room</h2>
            {roomsQ.isLoading ? <div className="space-y-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div> : roomsQ.error ? <ErrorState onRetry={() => roomsQ.refetch()} /> : (
              <div className="space-y-6">
                {roomsQ.data!.items.filter((r) => r.availability && r.availability.available > 0 && r.availability.fitsGuests && !r.availability.restriction && !r.availability.closed).length === 0 && (
                  <EmptyState title="No rooms available for these dates" body="Try different dates or fewer guests, or contact us — we may be able to help." action={<Link to="/contact" className="btn btn-ghost btn-sm">Contact reservations</Link>} />
                )}
                {roomsQ.data!.items.map((r) => {
                  const a = r.availability!;
                  const ok = a.available > 0 && a.fitsGuests && !a.restriction && !a.closed;
                  return (
                    <article key={r.id} className={cn('grid overflow-hidden border border-line bg-canvas md:grid-cols-[320px_1fr]', !ok && 'opacity-60')} style={{ borderRadius: 'var(--radius)' }}>
                      <SmartImage src={r.images[0]?.url ?? ''} alt={r.images[0]?.alt ?? r.name} className="aspect-[4/3] md:aspect-auto md:h-full" sizes="320px" />
                      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="eyebrow">{titleCase(r.category)} · {r.sizeSqm} m² · sleeps {r.maxOccupancy}</p>
                          <h3 className="mt-2 font-display text-3xl">{r.name}</h3>
                          <p className="mt-2 max-w-md text-sm text-muted">{r.tagline}</p>
                          <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">{r.amenities.slice(0, 5).map((m) => <li key={m.id} className="border border-line px-2 py-1">{m.name}</li>)}</ul>
                          <Link to={`/rooms/${r.slug}`} className="btn btn-link btn-sm mt-3">Room details</Link>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          {ok ? (
                            <>
                              <p className="font-display text-3xl">{money(a.stayTotal)}</p>
                              <p className="text-xs text-muted">{plural(stay.rooms, 'room')} · {money(a.avgNightly)} avg/night · incl. taxes</p>
                              {a.available <= 3 && <p className="mt-1 text-xs font-medium text-primary">Only {a.available} left</p>}
                              <button className="btn btn-primary mt-4" onClick={() => selectRoom(r)}>Select</button>
                            </>
                          ) : (
                            <p className="max-w-[220px] text-sm text-muted">{a.restriction ?? (!a.fitsGuests ? 'Too many guests for this room — add rooms or choose a larger suite.' : 'Sold out for these dates')}</p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {step >= 1 && step <= 2 && (
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <button className="btn btn-link btn-sm mb-6" onClick={() => (step === 1 ? setParams({ room: null }) : setStep(1))}><ArrowLeft className="h-3.5 w-3.5" /> {step === 1 ? 'Change room' : 'Back to enhancements'}</button>

              {step === 1 && (
                <div className="space-y-10">
                  {quoteQ.error && !(quoteQ.error instanceof ApiError && quoteQ.error.code.startsWith('COUPON')) && (
                    <p className="border-l-2 border-red-600 bg-red-50 p-4 text-sm text-red-800" role="alert">{(quoteQ.error as Error).message}</p>
                  )}
                  {options.data && options.data.mealPlans.length > 0 && (
                    <fieldset>
                      <legend className="mb-4 font-display text-3xl">Dining plan</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {options.data.mealPlans.map((m) => (
                          <label key={m.id} className={cn('cursor-pointer border bg-canvas p-5 transition', mealPlanId === m.id ? 'border-fg ring-1 ring-fg' : 'border-line hover:border-fg/50')} style={{ borderRadius: 'var(--radius)' }}>
                            <input type="radio" name="meal" className="sr-only" checked={mealPlanId === m.id} onChange={() => setMealPlanId(m.id)} />
                            <span className="flex justify-between gap-3"><span className="font-medium">{m.name}</span><span className="text-sm">{m.pricePerAdult ? `+${money(m.pricePerAdult)}` : 'Included'}</span></span>
                            <span className="mt-1 block text-xs text-muted">{m.description}{m.pricePerAdult ? ' · per adult per night' : ''}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {room && room.maxExtraBeds > 0 && (
                    <div className="flex items-center justify-between gap-6 border-y border-line py-6">
                      <div><p className="font-display text-2xl">Extra bed</p><p className="text-sm text-muted">{money(room.extraBedCharge)} per bed per night · max {room.maxExtraBeds * rooms}</p></div>
                      <Counter value={extraBeds} min={0} max={room.maxExtraBeds * rooms} onChange={setExtraBeds} label="extra beds" />
                    </div>
                  )}
                  {options.data && options.data.addOns.length > 0 && (
                    <fieldset>
                      <legend className="mb-4 font-display text-3xl">Enhance your stay</legend>
                      <div className="space-y-3">
                        {options.data.addOns.map((a) => (
                          <div key={a.id} className="flex items-center gap-4 border border-line bg-canvas p-4" style={{ borderRadius: 'var(--radius)' }}>
                            {a.image && <SmartImage src={a.image} alt="" className="hidden h-16 w-16 shrink-0 sm:block" width={200} sizes="64px" />}
                            <div className="flex-1">
                              <p className="font-medium">{a.name}</p>
                              <p className="text-xs text-muted">{a.description}</p>
                              <p className="mt-1 text-xs">{money(a.price)} {a.pricingType === 'PER_STAY' ? 'per stay' : a.pricingType === 'PER_NIGHT' ? 'per night' : a.pricingType === 'PER_GUEST' ? 'per guest' : 'per guest per night'}</p>
                            </div>
                            <Counter value={addOns[a.id] ?? 0} min={0} max={a.maxQuantity} onChange={(q) => setAddOns((s) => ({ ...s, [a.id]: q }))} label={a.name} />
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div>
                    <p className="mb-3 font-display text-2xl">Promotional code</p>
                    {appliedCoupon ? (
                      <p className="flex items-center gap-3 text-sm"><Tag className="h-4 w-4 text-emerald-700" /> <strong>{appliedCoupon}</strong> applied <button className="text-muted hover:text-fg" aria-label="Remove code" onClick={() => setAppliedCoupon(null)}><X className="h-4 w-4" /></button></p>
                    ) : (
                      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setCouponError(''); if (coupon.trim()) setAppliedCoupon(coupon.trim().toUpperCase()); }}>
                        <label className="sr-only" htmlFor="coupon">Promotional code</label>
                        <Input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Enter code" className="uppercase" aria-invalid={!!couponError} aria-describedby={couponError ? 'coupon-err' : undefined} />
                        <button className="btn btn-ghost btn-sm" type="submit">Apply</button>
                      </form>
                    )}
                    {couponError && <p id="coupon-err" className="mt-2 text-sm text-red-700" role="alert">{couponError}</p>}
                  </div>
                  <button className="btn btn-primary w-full sm:w-auto" disabled={!quote || quoteQ.isFetching || !!quoteQ.error && !(quoteQ.error instanceof ApiError && quoteQ.error.code.startsWith('COUPON'))} onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Continue to guest details</button>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={submit} noValidate className="space-y-10">
                  <fieldset className="grid gap-5 sm:grid-cols-2">
                    <legend className="mb-4 font-display text-3xl">Lead guest</legend>
                    <Field label="First name" error={form.formState.errors.guest?.firstName?.message}>{(p) => <Input {...p} autoComplete="given-name" {...form.register('guest.firstName')} />}</Field>
                    <Field label="Last name" error={form.formState.errors.guest?.lastName?.message}>{(p) => <Input {...p} autoComplete="family-name" {...form.register('guest.lastName')} />}</Field>
                    <Field label="Email" error={form.formState.errors.guest?.email?.message} hint="Your confirmation is sent here">{(p) => <Input {...p} type="email" autoComplete="email" {...form.register('guest.email')} />}</Field>
                    <Field label="Mobile number" error={form.formState.errors.guest?.phone?.message}>{(p) => <Input {...p} type="tel" autoComplete="tel" {...form.register('guest.phone')} />}</Field>
                    <Field label="Country of residence" error={form.formState.errors.guest?.country?.message}>{(p) => <Input {...p} autoComplete="country-name" {...form.register('guest.country')} />}</Field>
                    {!user && <p className="self-end text-xs text-muted sm:pb-3">Have an account? <Link to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="underline underline-offset-4">Sign in</Link> for faster booking.</p>}
                  </fieldset>

                  <fieldset className="grid gap-5 sm:grid-cols-2">
                    <legend className="mb-4 font-display text-3xl">Your preferences</legend>
                    <Field label="Estimated arrival time">{(p) => <Select {...p} {...form.register('requests.arrivalTime')}><option value="">Not sure yet</option>{['Before 12:00', '12:00 – 14:00', '14:00 – 17:00', '17:00 – 20:00', 'After 20:00'].map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
                    <Field label="Special occasion">{(p) => <Select {...p} {...form.register('requests.occasion')}><option value="">None</option>{['BIRTHDAY', 'ANNIVERSARY', 'HONEYMOON', 'PROPOSAL', 'BUSINESS', 'OTHER'].map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}</Select>}</Field>
                    <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('requests.earlyCheckIn')} /> Request early check-in (subject to availability)</label>
                    <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('requests.lateCheckOut')} /> Request late check-out (subject to availability)</label>
                    <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('requests.airportTransfer.required')} /> I would like an airport transfer</label>
                    {form.watch('requests.airportTransfer.required') && (
                      <>
                        <Field label="Flight number">{(p) => <Input {...p} {...form.register('requests.airportTransfer.flightNumber')} />}</Field>
                        <Field label="Arrival date & time">{(p) => <Input {...p} type="datetime-local" {...form.register('requests.airportTransfer.arrivalAt')} />}</Field>
                      </>
                    )}
                    <Field label="Special instructions" className="sm:col-span-2" hint="Dietary needs, accessibility, bed preference…">{(p) => <Textarea {...p} rows={3} {...form.register('requests.specialInstructions')} />}</Field>
                  </fieldset>

                  <fieldset>
                    <legend className="mb-4 font-display text-3xl">Payment</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {policy.onlinePaymentEnabled && (
                        <label className={cn('cursor-pointer border bg-canvas p-5', form.watch('paymentMethod') === 'ONLINE' ? 'border-fg ring-1 ring-fg' : 'border-line')} style={{ borderRadius: 'var(--radius)' }}>
                          <input type="radio" value="ONLINE" className="sr-only" {...form.register('paymentMethod')} />
                          <span className="font-medium">Pay online now</span>
                          <span className="mt-1 block text-xs text-muted">{policy.depositPercent < 100 ? `${policy.depositPercent}% deposit now, balance at the hotel` : 'Secure instant confirmation'} · cards, UPI, net banking</span>
                        </label>
                      )}
                      {policy.payAtHotelEnabled && (
                        <label className={cn('cursor-pointer border bg-canvas p-5', form.watch('paymentMethod') === 'PAY_AT_HOTEL' ? 'border-fg ring-1 ring-fg' : 'border-line')} style={{ borderRadius: 'var(--radius)' }}>
                          <input type="radio" value="PAY_AT_HOTEL" className="sr-only" {...form.register('paymentMethod')} />
                          <span className="font-medium">Pay at the hotel</span>
                          <span className="mt-1 block text-xs text-muted">No payment now. Our team will confirm your reservation.</span>
                        </label>
                      )}
                    </div>
                  </fieldset>

                  <div className="space-y-3 border-t border-line pt-8 text-sm">
                    <p className="text-muted">Free cancellation until {policy.cancellation.freeCancellationDays} day{policy.cancellation.freeCancellationDays === 1 ? '' : 's'} before arrival; after that {policy.cancellation.penaltyBasis === 'FIRST_NIGHT' ? `${policy.cancellation.penaltyPercent}% of the first night` : `${policy.cancellation.penaltyPercent}% of the total`} is charged. Check-in from {policy.checkInTime}, check-out by {policy.checkOutTime}.</p>
                    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('acceptTerms')} /> <span>I accept the <Link to="/terms" target="_blank" className="underline underline-offset-4">terms & conditions</Link>, <Link to="/cancellation-policy" target="_blank" className="underline underline-offset-4">cancellation policy</Link> and <Link to="/privacy-policy" target="_blank" className="underline underline-offset-4">privacy policy</Link>.</span></label>
                    {form.formState.errors.acceptTerms && <p className="text-red-700" role="alert">{form.formState.errors.acceptTerms.message}</p>}
                    <label className="flex items-start gap-3 text-muted"><input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('marketingOptIn')} /> Send me occasional offers from {config.brand.name}.</label>
                  </div>
                  {submitError && <p className="border-l-2 border-red-600 bg-red-50 p-4 text-sm text-red-800" role="alert">{submitError}</p>}
                  <button className="btn btn-primary w-full sm:w-auto" disabled={form.formState.isSubmitting || !quote}>
                    {form.formState.isSubmitting ? <><Spinner className="h-4 w-4" /> Securing your room…</> : form.watch('paymentMethod') === 'ONLINE' ? `Continue to payment · ${money(quote?.depositDue)}` : 'Request reservation'}
                  </button>
                </form>
              )}
            </div>

            <aside className="lg:col-span-5">
              <div className="card-luxe sticky top-[calc(var(--header-h)+1.5rem)] overflow-hidden">
                {room && <SmartImage src={room.images[0]?.url ?? ''} alt={room.name} className="aspect-[16/9]" sizes="40vw" />}
                <div className="p-6 sm:p-8" aria-live="polite">
                  {quote ? <PriceSummary quote={quote} roomName={room?.name} depositPercent={policy.depositPercent} /> : quoteQ.isLoading ? <Skeleton className="h-64" /> : <p className="text-sm text-muted">Select your options to see the price.</p>}
                  {quoteQ.isFetching && quote && <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Spinner className="h-3 w-3" /> Updating price…</p>}
                </div>
              </div>
            </aside>
          </div>
        )}

        <AnimatePresence>
          {step === 3 && created?.payment && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
              <PaymentPanel payment={created.payment} token={created.manageToken} onPaid={() => nav(`/booking/${created.booking.reference}?token=${created.manageToken}&new=1`)} />
              <div className="card-luxe p-8">
                <p className="eyebrow">Reservation {created.booking.reference}</p>
                <PriceSummary quote={{ ...(quote as Quote) }} roomName={created.booking.roomType.name} compact depositPercent={policy.depositPercent} />
                <p className="mt-6 text-xs text-muted">Not ready to pay? Your reservation is held briefly; you can also pay later from your confirmation link while the hold lasts.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Counter({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:border-fg disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-5 text-center font-display text-xl" aria-live="polite" aria-label={`${value} ${label}`}>{value}</span>
      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:border-fg disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

