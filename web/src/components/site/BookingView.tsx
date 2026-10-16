import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CalendarPlus, Check, Clock, Printer, Star } from 'lucide-react';
import { post, errorMessage } from '@/lib/api';
import { dateLong, money, plural, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PaymentInit, PublicBooking } from '@/lib/types';
import { useSite } from '@/app/SiteProvider';
import { useToast } from '@/components/ui/Toast';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea, Input } from '@/components/ui/Field';
import { SmartImage } from './SmartImage';
import { PaymentPanel } from './PaymentPanel';

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-800 border-emerald-200', CHECKED_IN: 'bg-emerald-50 text-emerald-800 border-emerald-200', CHECKED_OUT: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  PENDING: 'bg-amber-50 text-amber-900 border-amber-200', PENDING_PAYMENT: 'bg-amber-50 text-amber-900 border-amber-200',
  CANCELLED: 'bg-red-50 text-red-800 border-red-200', REJECTED: 'bg-red-50 text-red-800 border-red-200', EXPIRED: 'bg-zinc-100 text-zinc-600 border-zinc-200', NO_SHOW: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

function icsFor(b: PublicBooking, hotel: string, address: string) {
  const d = (iso: string) => iso.replace(/-/g, '');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aurelle//Booking//EN', 'BEGIN:VEVENT', `UID:${b.reference}@aurelle`, `DTSTART;VALUE=DATE:${d(b.checkIn)}`, `DTEND;VALUE=DATE:${d(b.checkOut)}`, `SUMMARY:Stay at ${hotel} (${b.reference})`, `LOCATION:${address}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
}

export function BookingView({ booking: b, token, fresh, onChange }: { booking: PublicBooking; token: string | null; fresh?: boolean; onChange: () => void }) {
  const { config } = useSite();
  const toast = useToast();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState<PaymentInit | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const tq = token ? `?token=${encodeURIComponent(token)}` : '';

  const cancel = useMutation({
    mutationFn: () => post(`/bookings/${b.reference}/cancel${tq}`, { reason }),
    onSuccess: () => { setCancelOpen(false); toast.success('Your reservation has been cancelled.'); onChange(); void qc.invalidateQueries({ queryKey: ['account-bookings'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const startPay = useMutation({
    mutationFn: () => post<{ payment: PaymentInit }>(`/bookings/${b.reference}/pay${tq}`),
    onSuccess: (r) => setPayment(r.payment),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const confirmed = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status);
  const address = [config.contact.addressLine1, config.contact.addressLine2].join(', ');

  return (
    <div className="print-area">
      {fresh && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-12 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-contrast"><Check className="h-8 w-8" /></motion.span>
          <p className="eyebrow mb-3">{confirmed ? 'Reservation confirmed' : b.status === 'PENDING' ? 'Request received' : 'Reservation created'}</p>
          <h1 className="h-section">{confirmed ? `We look forward to welcoming you, ${b.guest.firstName}` : `Thank you, ${b.guest.firstName}`}</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted">{confirmed ? `A confirmation has been sent to ${b.guest.email}.` : b.status === 'PENDING' ? 'Our reservations team will review your request and confirm by email shortly.' : ''}</p>
        </motion.div>
      )}

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <div className="card-luxe overflow-hidden">
            <div className="grid sm:grid-cols-[220px_1fr]">
              <SmartImage src={b.roomType.image} alt={b.roomType.name} className="aspect-[4/3] sm:aspect-auto sm:h-full" sizes="220px" />
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm tracking-wider">{b.reference}</span>
                  <span className={cn('border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[b.status])}>{b.statusLabel}</span>
                </div>
                <h2 className="mt-3 font-display text-3xl">{b.roomType.name}{b.rooms > 1 ? ` × ${b.rooms}` : ''}</h2>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="label-luxe">Arrival</dt><dd>{dateLong(b.checkIn)}<br /><span className="text-muted">from {b.checkInTime}</span></dd></div>
                  <div><dt className="label-luxe">Departure</dt><dd>{dateLong(b.checkOut)}<br /><span className="text-muted">by {b.checkOutTime}</span></dd></div>
                  <div><dt className="label-luxe">Guests</dt><dd>{plural(b.adults, 'adult')}{b.children ? `, ${plural(b.children, 'child', 'children')}` : ''}</dd></div>
                  <div><dt className="label-luxe">Dining</dt><dd>{b.mealPlan?.name ?? 'Room only'}</dd></div>
                </dl>
              </div>
            </div>
          </div>

          {b.status === 'PENDING_PAYMENT' && (
            payment ? <PaymentPanel payment={payment} token={token} onPaid={() => { setPayment(null); onChange(); toast.success('Payment received — your stay is confirmed.'); }} />
              : b.canPay ? (
                <div className="card-luxe flex flex-wrap items-center justify-between gap-4 p-6">
                  <p className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-primary" /> Payment of {money(b.depositDue - b.amountPaid)} is pending.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => startPay.mutate()} disabled={startPay.isPending}>Complete payment</button>
                </div>
              ) : <p className="border-l-2 border-amber-500 bg-amber-50 p-4 text-sm">The hold on this reservation has expired. Please <Link to="/book" className="underline">search again</Link>.</p>
          )}

          <div className="card-luxe p-6">
            <h3 className="font-display text-2xl">Guest & requests</h3>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="label-luxe">Lead guest</dt><dd>{b.guest.firstName} {b.guest.lastName}<br />{b.guest.email}<br />{b.guest.phone}</dd></div>
              <div><dt className="label-luxe">Requests</dt><dd className="text-muted">
                {[(b.requests.occasion as string) && `Occasion: ${titleCase(b.requests.occasion as string)}`, b.requests.earlyCheckIn && 'Early check-in', b.requests.lateCheckOut && 'Late check-out', (b.requests.airportTransfer as { required?: boolean })?.required && 'Airport transfer', b.requests.arrivalTime && `Arrival ${b.requests.arrivalTime}`, b.requests.specialInstructions].filter(Boolean).join(' · ') || 'None'}
              </dd></div>
            </dl>
          </div>

          <div className="no-print flex flex-wrap gap-3">
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
            {confirmed && <a className="btn btn-ghost btn-sm" href={icsFor(b, config.brand.name, address)} download={`${b.reference}.ics`}><CalendarPlus className="h-4 w-4" /> Add to calendar</a>}
            {b.canReview && <button className="btn btn-ghost btn-sm" onClick={() => setReviewOpen(true)}><Star className="h-4 w-4" /> Review your stay</button>}
            {b.canCancel && <button className="btn btn-ghost btn-sm text-red-700" onClick={() => setCancelOpen(true)}>Cancel reservation</button>}
          </div>
          {!b.canCancel && ['CONFIRMED', 'PENDING'].includes(b.status) && <p className="text-xs text-muted">To change or cancel this reservation please contact us at {config.contact.phone} or {config.contact.email}.</p>}
        </div>

        <aside className="lg:col-span-5">
          <div className="card-luxe p-6 sm:p-8">
            <h3 className="font-display text-2xl">Price details</h3>
            <dl className="mt-4 space-y-1.5 text-sm">
              {b.lineItems.filter((l) => l.kind !== 'ROOM').length < b.lineItems.length && <div className="flex justify-between"><dt>Room · {plural(b.nights, 'night')}</dt><dd>{money(b.lineItems.filter((l) => l.kind === 'ROOM').reduce((s, l) => s + l.amount, 0))}</dd></div>}
              {b.lineItems.filter((l) => l.kind !== 'ROOM').map((l, i) => <div key={i} className={cn('flex justify-between gap-4', l.amount < 0 && 'text-emerald-700', (l.kind === 'TAX' || l.kind === 'FEE') && 'text-muted')}><dt>{l.label}</dt><dd className="whitespace-nowrap">{l.amount < 0 ? `−${money(-l.amount)}` : money(l.amount)}</dd></div>)}
            </dl>
            <div className="mt-4 flex justify-between border-t border-fg/70 pt-4"><span className="uppercase tracking-[0.18em]">Total</span><span className="font-display text-2xl">{money(b.grandTotal)}</span></div>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{money(b.amountPaid)}</dd></div>
              {b.amountRefunded > 0 && <div className="flex justify-between"><dt className="text-muted">Refunded</dt><dd>{money(b.amountRefunded)}</dd></div>}
              {b.balanceDue > 0 && !['CANCELLED', 'REJECTED', 'EXPIRED'].includes(b.status) && <div className="flex justify-between font-medium"><dt>Balance due at hotel</dt><dd>{money(b.balanceDue)}</dd></div>}
              {b.refundStatus !== 'NONE' && <div className="flex justify-between"><dt className="text-muted">Refund</dt><dd>{titleCase(b.refundStatus)}{b.refundableAmount ? ` · ${money(b.refundableAmount)} due` : ''}</dd></div>}
            </dl>
            {b.payments.some((p) => p.isTest) && <p className="mt-4 border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Test-mode payment — no real money was charged.</p>}
          </div>
        </aside>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this reservation?" description={`Reservation ${b.reference}`}
        footer={<><button className="admin-btn-secondary" onClick={() => setCancelOpen(false)}>Keep reservation</button><button className="admin-btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : 'Confirm cancellation'}</button></>}>
        {b.cancellationPreview && (
          <div className="space-y-2 text-sm">
            {b.cancellationPreview.free ? <p>This cancellation is <strong>free of charge</strong>.</p> : <p>A cancellation charge of <strong>{money(b.cancellationPreview.penalty)}</strong> applies under our policy.</p>}
            {b.amountPaid > 0 && <p>Refund due to you: <strong>{money(b.cancellationPreview.refundable)}</strong>, returned to your original payment method.</p>}
          </div>
        )}
        <label className="admin-label mt-4" htmlFor="cancel-reason">Reason (optional)</label>
        <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="!rounded-lg" />
      </Dialog>
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} reference={b.reference} token={token} />
    </div>
  );
}

function ReviewDialog({ open, onOpenChange, reference, token }: { open: boolean; onOpenChange: (o: boolean) => void; reference: string; token: string | null }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const m = useMutation({
    mutationFn: () => post<{ message: string }>(`/reviews${token ? `?token=${encodeURIComponent(token)}` : ''}`, { bookingReference: reference, rating, title, body }),
    onSuccess: (r) => { toast.success(r.message); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share your experience" footer={<button className="admin-btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>Submit review</button>}>
      <fieldset className="mb-4"><legend className="admin-label">Rating</legend>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} star${i > 1 ? 's' : ''}`} aria-pressed={rating === i}><Star className="h-7 w-7 text-amber-500" fill={i <= rating ? 'currentColor' : 'none'} strokeWidth={1.2} /></button>)}</div>
      </fieldset>
      <label className="admin-label" htmlFor="rv-title">Title</label>
      <Input id="rv-title" value={title} onChange={(e) => setTitle(e.target.value)} className="!rounded-lg" />
      <label className="admin-label mt-4" htmlFor="rv-body">Your review</label>
      <Textarea id="rv-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} className="!rounded-lg" />
      <p className="mt-2 text-xs text-zinc-500">Reviews are published after moderation.</p>
    </Dialog>
  );
}
