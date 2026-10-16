import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BedDouble, CalendarClock, Check, CircleDollarSign, FileText, LogIn, LogOut, Printer, RotateCcw, UserX, X } from 'lucide-react';
import { BOOKING_TRANSITIONS, type BookingStatus } from '@aurelle/shared';
import { ApiError, get, post, errorMessage } from '@/lib/api';
import { dateLong, dateTime, money, relTime, titleCase, toPaise } from '@/lib/format';
import { useAuth } from '@/app/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, ErrorBox, Labeled, Loading, PageHeader, StatusBadge, Toggle } from '../components/ui';

interface Detail {
  id: string; reference: string; status: BookingStatus; statusLabel: string; paymentStatus: string; refundStatus: string; paymentMethod: string; source: string;
  checkIn: string; checkOut: string; nights: number; roomsCount: number; adults: number; children: number; extraBeds: number;
  guestFirstName: string; guestLastName: string; guestEmail: string; guestPhone: string; guestCountry: string;
  requests: { arrivalTime?: string; earlyCheckIn?: boolean; lateCheckOut?: boolean; occasion?: string; airportTransfer?: { required?: boolean; flightNumber?: string; arrivalAt?: string }; specialInstructions?: string };
  roomType: { id: string; name: string; slug: string }; mealPlan: { name: string; code: string } | null; offer: { title: string } | null; couponCode: string | null;
  subtotal: number; discountTotal: number; taxTotal: number; feeTotal: number; grandTotal: number; depositDue: number; amountPaid: number; amountRefunded: number; refundableAmount: number; cancellationPenalty: number;
  holdExpiresAt: string | null; createdAt: string; confirmedAt: string | null; checkedInAt: string | null; checkedOutAt: string | null; cancelledAt: string | null; cancellationReason: string | null; cancelledBy: string | null;
  rooms: { id: string; roomId: string; active: boolean; checkIn: string; checkOut: string; room: { id: string; number: string; floor: string } }[];
  roomOptions: { id: string; number: string; status: string; housekeeping: string; free: boolean }[];
  lineItems: { id: string; kind: string; label: string; quantity: number; unitAmount: number; amount: number }[];
  payments: { id: string; provider: string; providerPaymentId: string | null; amount: number; amountRefunded: number; status: string; method: string; reference: string; isTest: boolean; errorDescription: string | null; createdAt: string; capturedAt: string | null }[];
  refunds: { id: string; amount: number; status: string; reason: string; providerRefundId: string | null; createdAt: string }[];
  notes: { id: string; body: string; createdAt: string; author: { name: string } | null }[];
  events: { id: string; type: string; message: string; createdAt: string }[];
  user: { id: string; name: string; email: string } | null;
  review: { rating: number; title: string } | null;
  hotel: { name: string; address: string; phone: string; email: string };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function printInvoice(b: Detail) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;
  const rows = b.lineItems.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${l.quantity}</td><td class="n">${esc(money(l.unitAmount))}</td><td class="n">${esc(money(l.amount))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>Invoice ${esc(b.reference)}</title><style>
    body{font-family:Georgia,serif;color:#1c1a17;margin:48px;font-size:13px}h1{font-weight:400;letter-spacing:4px;text-transform:uppercase;margin:0}
    .muted{color:#6f675c}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:8px 6px;border-bottom:1px solid #e3d8c4;text-align:left}
    th{font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6f675c}.n{text-align:right;white-space:nowrap}
    .tot td{border:none;padding:4px 6px}.grand td{font-size:16px;border-top:2px solid #1c1a17}.grid{display:flex;justify-content:space-between;gap:24px;margin-top:32px}
  </style></head><body>
  <div class="grid" style="margin-top:0"><div><h1>${esc(b.hotel.name)}</h1><p class="muted">${esc(b.hotel.address)}<br>${esc(b.hotel.phone)} · ${esc(b.hotel.email)}</p></div>
  <div style="text-align:right"><h2 style="font-weight:400;margin:0">Tax invoice / folio</h2><p class="muted">Reference ${esc(b.reference)}<br>Issued ${esc(new Date().toLocaleDateString('en-GB'))}</p></div></div>
  <div class="grid"><div><strong>Billed to</strong><br>${esc(b.guestFirstName)} ${esc(b.guestLastName)}<br>${esc(b.guestEmail)}<br>${esc(b.guestPhone)}<br>${esc(b.guestCountry)}</div>
  <div style="text-align:right"><strong>Stay</strong><br>${esc(b.roomType.name)}${b.roomsCount > 1 ? ` × ${b.roomsCount}` : ''}<br>${esc(dateLong(b.checkIn))} → ${esc(dateLong(b.checkOut))}<br>${b.nights} night(s) · ${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ''}<br>Room(s): ${esc(b.rooms.filter((r) => r.active).map((r) => r.room.number).join(', ') || '—')}</div></div>
  <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="tot" style="width:320px;margin-left:auto">
    <tr><td>Subtotal</td><td class="n">${esc(money(b.subtotal))}</td></tr>
    ${b.discountTotal ? `<tr><td>Discounts</td><td class="n">−${esc(money(b.discountTotal))}</td></tr>` : ''}
    <tr><td>Taxes</td><td class="n">${esc(money(b.taxTotal))}</td></tr>${b.feeTotal ? `<tr><td>Fees</td><td class="n">${esc(money(b.feeTotal))}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="n">${esc(money(b.grandTotal))}</td></tr>
    <tr><td>Paid</td><td class="n">${esc(money(b.amountPaid))}</td></tr>${b.amountRefunded ? `<tr><td>Refunded</td><td class="n">${esc(money(b.amountRefunded))}</td></tr>` : ''}
    <tr><td><strong>Balance</strong></td><td class="n"><strong>${esc(money(Math.max(0, b.grandTotal - b.amountPaid + b.amountRefunded)))}</strong></td></tr>
  </table>
  ${b.payments.some((p) => p.isTest) ? '<p style="margin-top:24px;color:#92400e">Contains test-mode payments — not a real charge.</p>' : ''}
  <p class="muted" style="margin-top:48px;font-size:11px">Thank you for staying with us. All amounts in INR.</p>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export default function BookingDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: b, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'booking', id], queryFn: () => get<Detail>(`/admin/bookings/${id}`) });
  const [dialog, setDialog] = useState<null | 'cancel' | 'reject' | 'modify' | 'payment' | 'refund'>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const refresh = () => { void refetch(); void qc.invalidateQueries({ queryKey: ['admin', 'bookings'] }); void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] }); };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(`/admin/bookings/${id}/${path}`, body ?? {}),
    onSuccess: (_d, v) => { toast.success(v.path === 'notes' ? 'Note added' : 'Reservation updated'); setDialog(null); setAssign({}); setNote(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Loading />;
  if (error || !b) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const allowed = BOOKING_TRANSITIONS[b.status];
  const status = (s: BookingStatus, extra?: object) => act.mutate({ path: 'status', body: { status: s, notifyGuest: true, ...extra } });
  const active = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(b.status);
  const balance = Math.max(0, b.grandTotal - b.amountPaid + b.amountRefunded);

  return (
    <div>
      <PageHeader
        back={<Link to="/admin/bookings" className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Reservations</Link>}
        title={`${b.guestFirstName} ${b.guestLastName}`}
        description={`${b.reference} · booked ${dateTime(b.createdAt)} via ${titleCase(b.source)}`}
        actions={<>
          <StatusBadge status={b.status} /><StatusBadge status={b.paymentStatus} />
          {b.refundStatus !== 'NONE' && <Badge color="violet">Refund {b.refundStatus.toLowerCase()}</Badge>}
          <button className="admin-btn-secondary" onClick={() => printInvoice(b)}><Printer className="h-4 w-4" /> Invoice</button>
        </>}
      />

      {can('bookings.manage') && (allowed.length > 0 || active) && (
        <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-3">
          {allowed.includes('CONFIRMED') && <button className="admin-btn-primary" disabled={act.isPending} onClick={() => status('CONFIRMED')}><Check className="h-4 w-4" /> Confirm</button>}
          {allowed.includes('CHECKED_IN') && <button className="admin-btn-primary" disabled={act.isPending} onClick={() => status('CHECKED_IN')}><LogIn className="h-4 w-4" /> Check in</button>}
          {allowed.includes('CHECKED_OUT') && <button className="admin-btn-primary" disabled={act.isPending} onClick={() => status('CHECKED_OUT')}><LogOut className="h-4 w-4" /> Check out</button>}
          {['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(b.status) && <button className="admin-btn-secondary" onClick={() => setDialog('modify')}><CalendarClock className="h-4 w-4" /> Modify stay</button>}
          {active && can('payments.view') && balance > 0 && <button className="admin-btn-secondary" onClick={() => setDialog('payment')}><CircleDollarSign className="h-4 w-4" /> Record payment</button>}
          {allowed.includes('NO_SHOW') && <button className="admin-btn-secondary" onClick={() => status('NO_SHOW', { reason: 'Guest did not arrive' })}><UserX className="h-4 w-4" /> No-show</button>}
          <div className="flex-1" />
          {allowed.includes('REJECTED') && can('bookings.cancel') && <button className="admin-btn-secondary text-red-700" onClick={() => setDialog('reject')}><X className="h-4 w-4" /> Reject</button>}
          {allowed.includes('CANCELLED') && can('bookings.cancel') && <button className="admin-btn-danger" onClick={() => setDialog('cancel')}>Cancel reservation</button>}
        </div>
      )}
      {b.status === 'PENDING_PAYMENT' && b.holdExpiresAt && <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Awaiting online payment. Inventory is held until {dateTime(b.holdExpiresAt)}, after which the booking expires automatically.</p>}
      {b.refundStatus === 'PENDING' && b.refundableAmount > 0 && <p className="mb-6 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">A refund of <strong>{money(b.refundableAmount)}</strong> is owed to the guest.{can('refunds.manage') ? ' Use “Issue refund” in Payments below.' : ' A manager must issue it.'}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Stay">
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <Item k="Room type"><Link to={`/admin/rooms/${b.roomType.id}`} className="hover:underline">{b.roomType.name}</Link>{b.roomsCount > 1 && ` × ${b.roomsCount}`}</Item>
              <Item k="Arrival">{dateLong(b.checkIn)}</Item>
              <Item k="Departure">{dateLong(b.checkOut)}</Item>
              <Item k="Nights">{b.nights}</Item>
              <Item k="Guests">{b.adults} adults{b.children ? `, ${b.children} children` : ''}{b.extraBeds ? ` · ${b.extraBeds} extra bed` : ''}</Item>
              <Item k="Meal plan">{b.mealPlan ? `${b.mealPlan.name} (${b.mealPlan.code})` : 'Room only'}</Item>
              <Item k="Offer / coupon">{[b.offer?.title, b.couponCode].filter(Boolean).join(' · ') || '—'}</Item>
              <Item k="Payment method">{b.paymentMethod === 'PAY_AT_HOTEL' ? 'Pay at hotel' : 'Online'}</Item>
            </dl>
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <p className="admin-label">Guest requests</p>
              <ul className="flex flex-wrap gap-2 text-xs">
                {b.requests.occasion && <Badge color="violet">{titleCase(b.requests.occasion)}</Badge>}
                {b.requests.arrivalTime && <Badge>Arrival {b.requests.arrivalTime}</Badge>}
                {b.requests.earlyCheckIn && <Badge color="amber">Early check-in</Badge>}
                {b.requests.lateCheckOut && <Badge color="amber">Late check-out</Badge>}
                {b.requests.airportTransfer?.required && <Badge color="blue">Airport transfer {b.requests.airportTransfer.flightNumber} {b.requests.airportTransfer.arrivalAt}</Badge>}
              </ul>
              {b.requests.specialInstructions && <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm">{b.requests.specialInstructions}</p>}
              {!b.requests.occasion && !b.requests.arrivalTime && !b.requests.earlyCheckIn && !b.requests.lateCheckOut && !b.requests.airportTransfer?.required && !b.requests.specialInstructions && <p className="text-sm text-zinc-500">None</p>}
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><BedDouble className="h-4 w-4" /> Room assignment</span>}>
            {b.rooms.filter((r) => r.active).length === 0 ? <p className="text-sm text-zinc-500">No active room allocation (inventory released).</p> : (
              <div className="space-y-3">
                {b.rooms.filter((r) => r.active).map((r, i) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3">
                    <span className="w-16 text-sm text-zinc-500">Room {i + 1}</span>
                    <select className="admin-input w-56" value={assign[r.id] ?? r.roomId} onChange={(e) => setAssign((s) => ({ ...s, [r.id]: e.target.value }))} disabled={!can('bookings.manage') || !active} aria-label={`Assigned room ${i + 1}`}>
                      {b.roomOptions.map((o) => <option key={o.id} value={o.id} disabled={o.id !== r.roomId && (!o.free || o.status !== 'AVAILABLE')}>{o.number} · {o.housekeeping.toLowerCase()}{o.id === r.roomId ? ' (current)' : !o.free ? ' — occupied' : o.status !== 'AVAILABLE' ? ' — out of service' : ''}</option>)}
                    </select>
                  </div>
                ))}
                {Object.keys(assign).length > 0 && <button className="admin-btn-primary" disabled={act.isPending} onClick={() => act.mutate({ path: 'assign-rooms', body: { assignments: Object.entries(assign).map(([bookingRoomId, roomId]) => ({ bookingRoomId, roomId })) } })}>Save assignment</button>}
              </div>
            )}
          </Card>

          <Card title={<span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Charges</span>} bodyClassName="p-0">
            <table className="admin-table">
              <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {b.lineItems.map((l) => <tr key={l.id}><td className={l.amount < 0 ? 'text-emerald-700' : ''}>{l.label}</td><td className="text-right tabular-nums">{l.quantity}</td><td className="text-right tabular-nums">{money(l.unitAmount)}</td><td className="text-right tabular-nums">{money(l.amount)}</td></tr>)}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="text-right font-semibold">Total</td><td className="text-right font-semibold tabular-nums">{money(b.grandTotal)}</td></tr>
                <tr><td colSpan={3} className="text-right text-zinc-500">Paid · refunded · balance</td><td className="text-right tabular-nums text-zinc-600">{money(b.amountPaid)} · {money(b.amountRefunded)} · {money(balance)}</td></tr>
              </tfoot>
            </table>
          </Card>

          {can('payments.view') && (
            <Card title="Payments & refunds" actions={can('refunds.manage') && b.amountPaid - b.amountRefunded > 0 && <button className="admin-btn-secondary !py-1 text-xs" onClick={() => setDialog('refund')}><RotateCcw className="h-3.5 w-3.5" /> Issue refund</button>} bodyClassName="p-0">
              <table className="admin-table">
                <thead><tr><th>Date</th><th>Method</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap text-xs">{dateTime(p.capturedAt ?? p.createdAt)}</td>
                      <td className="text-xs">{p.provider.replace(/_/g, ' ')}{p.isTest && <Badge color="amber">TEST</Badge>}<p className="text-zinc-400">{p.providerPaymentId ?? p.reference}</p>{p.errorDescription && <p className="text-red-600">{p.errorDescription}</p>}</td>
                      <td><StatusBadge status={p.status} />{p.amountRefunded > 0 && <p className="text-[11px] text-violet-700">−{money(p.amountRefunded)} refunded</p>}</td>
                      <td className="text-right tabular-nums">{money(p.amount)}</td>
                    </tr>
                  ))}
                  {b.refunds.map((r) => (
                    <tr key={r.id} className="bg-violet-50/40">
                      <td className="text-xs">{dateTime(r.createdAt)}</td><td className="text-xs">Refund · {r.reason}<p className="text-zinc-400">{r.providerRefundId}</p></td><td><StatusBadge status={r.status} /></td><td className="text-right tabular-nums text-violet-700">−{money(r.amount)}</td>
                    </tr>
                  ))}
                  {!b.payments.length && !b.refunds.length && <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No payments recorded.</td></tr>}
                </tbody>
              </table>
              {can('refunds.manage') && b.refundStatus === 'PENDING' && (
                <div className="flex justify-end gap-2 border-t border-zinc-100 p-3">
                  <button className="admin-btn-ghost text-xs" onClick={() => act.mutate({ path: 'refund-status', body: { status: 'PROCESSED', note: 'Settled outside the system' } })}>Mark refund settled manually</button>
                  <button className="admin-btn-ghost text-xs" onClick={() => act.mutate({ path: 'refund-status', body: { status: 'NONE', note: 'No refund due' } })}>Waive (no refund due)</button>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Guest">
            <p className="font-medium">{b.guestFirstName} {b.guestLastName}</p>
            <p className="text-sm"><a className="hover:underline" href={`mailto:${b.guestEmail}`}>{b.guestEmail}</a></p>
            <p className="text-sm"><a className="hover:underline" href={`tel:${b.guestPhone.replace(/\s/g, '')}`}>{b.guestPhone}</a></p>
            <p className="text-sm text-zinc-500">{b.guestCountry}</p>
            {b.user && can('customers.view') && <Link to={`/admin/customers/${b.user.id}`} className="mt-3 inline-block text-xs text-zinc-600 underline">View customer profile</Link>}
            {b.review && <p className="mt-3 text-xs text-zinc-500">Reviewed: {'★'.repeat(b.review.rating)} “{b.review.title}”</p>}
            {b.cancelledAt && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-800">Cancelled {dateTime(b.cancelledAt)} by {b.cancelledBy?.toLowerCase()}{b.cancellationReason ? `: ${b.cancellationReason}` : ''}{b.cancellationPenalty ? ` · penalty ${money(b.cancellationPenalty)}` : ''}</p>}
          </Card>

          <Card title="Internal notes">
            {can('bookings.manage') && (
              <form className="mb-4" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act.mutate({ path: 'notes', body: { body: note } }); }}>
                <textarea className="admin-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to staff only" aria-label="New note" />
                <button className="admin-btn-secondary mt-2 !py-1 text-xs" disabled={!note.trim()}>Add note</button>
              </form>
            )}
            <ul className="space-y-3">
              {b.notes.map((n) => <li key={n.id} className="rounded-lg bg-amber-50/60 p-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-[11px] text-zinc-500">{n.author?.name ?? 'Staff'} · {relTime(n.createdAt)}</p></li>)}
              {!b.notes.length && <li className="text-sm text-zinc-500">No notes yet.</li>}
            </ul>
          </Card>

          <Card title="Timeline">
            <ol className="relative space-y-4 border-l border-zinc-200 pl-4">
              {b.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-400" />
                  <p className="text-sm">{e.message}</p>
                  <p className="text-[11px] text-zinc-500">{dateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <CancelDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} b={b} canWaive={can('refunds.manage')} onSubmit={(body) => act.mutate({ path: 'cancel', body })} busy={act.isPending} />
      <SimpleReasonDialog open={dialog === 'reject'} title="Reject this reservation?" description="The guest will be notified. Any payment becomes refundable." confirm="Reject reservation" onClose={() => setDialog(null)} onSubmit={(reason) => status('REJECTED', { reason })} />
      <ModifyDialog open={dialog === 'modify'} b={b} onClose={() => setDialog(null)} onSubmit={(body) => act.mutate({ path: 'modify', body })} busy={act.isPending} error={act.error} />
      <PaymentDialog open={dialog === 'payment'} balance={balance} onClose={() => setDialog(null)} onSubmit={(body) => act.mutate({ path: 'payments', body })} busy={act.isPending} />
      <RefundDialog open={dialog === 'refund'} max={b.amountPaid - b.amountRefunded} suggested={b.refundableAmount} onClose={() => setDialog(null)} onSubmit={(body) => act.mutate({ path: 'refunds', body })} busy={act.isPending} />
    </div>
  );
}

function Item({ k, children }: { k: string; children: ReactNode }) {
  return <div><dt className="text-xs text-zinc-500">{k}</dt><dd className="mt-0.5 font-medium text-zinc-900">{children}</dd></div>;
}

function CancelDialog({ open, onClose, b, canWaive, onSubmit, busy }: { open: boolean; onClose: () => void; b: Detail; canWaive: boolean; onSubmit: (body: object) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  const [waive, setWaive] = useState(false);
  const [notify, setNotify] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`Cancel ${b.reference}?`} description="Rooms are released immediately. The cancellation policy determines the penalty; refunds are tracked separately."
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Keep</button><button className="admin-btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit({ reason, waivePenalty: waive, notifyGuest: notify })}>Cancel reservation</button></>}>
      <Labeled label="Reason (required)" htmlFor="cx-reason"><textarea id="cx-reason" className="admin-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Labeled>
      <div className="mt-4 space-y-3">
        {canWaive && <Toggle checked={waive} onChange={setWaive} label="Waive cancellation penalty" description="Refund everything the guest has paid." />}
        <Toggle checked={notify} onChange={setNotify} label="Email the guest" />
      </div>
    </Dialog>
  );
}

function SimpleReasonDialog({ open, title, description, confirm, onClose, onSubmit }: { open: boolean; title: string; description: string; confirm: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={title} description={description} footer={<><button className="admin-btn-secondary" onClick={onClose}>Back</button><button className="admin-btn-danger" onClick={() => onSubmit(reason)}>{confirm}</button></>}>
      <Labeled label="Reason (shared with the guest)" htmlFor="rj-reason"><textarea id="rj-reason" className="admin-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Labeled>
    </Dialog>
  );
}

function ModifyDialog({ open, b, onClose, onSubmit, busy, error }: { open: boolean; b: Detail; onClose: () => void; onSubmit: (body: object) => void; busy: boolean; error: unknown }) {
  const [v, setV] = useState({ checkIn: b.checkIn, checkOut: b.checkOut, adults: b.adults, children: b.children, reason: '', repriced: true });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Modify stay" description="Availability is re-checked and current rooms are kept where possible."
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={busy} onClick={() => onSubmit(v)}>Save changes</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Arrival" htmlFor="m-ci"><input id="m-ci" type="date" className="admin-input" value={v.checkIn} onChange={(e) => setV({ ...v, checkIn: e.target.value })} /></Labeled>
        <Labeled label="Departure" htmlFor="m-co"><input id="m-co" type="date" className="admin-input" value={v.checkOut} onChange={(e) => setV({ ...v, checkOut: e.target.value })} /></Labeled>
        <Labeled label="Adults" htmlFor="m-a"><input id="m-a" type="number" min={1} className="admin-input" value={v.adults} onChange={(e) => setV({ ...v, adults: Number(e.target.value) })} /></Labeled>
        <Labeled label="Children" htmlFor="m-c"><input id="m-c" type="number" min={0} className="admin-input" value={v.children} onChange={(e) => setV({ ...v, children: Number(e.target.value) })} /></Labeled>
        <Labeled label="Reason" className="sm:col-span-2" htmlFor="m-r"><input id="m-r" className="admin-input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Labeled>
        <div className="sm:col-span-2"><Toggle checked={v.repriced} onChange={(x) => setV({ ...v, repriced: x })} label="Re-price at current rates" description="If off, the original total is kept." /></div>
      </div>
      {error instanceof ApiError && <p className="mt-3 text-sm text-red-600">{error.message}</p>}
    </Dialog>
  );
}

function PaymentDialog({ open, balance, onClose, onSubmit, busy }: { open: boolean; balance: number; onClose: () => void; onSubmit: (body: object) => void; busy: boolean }) {
  const [amount, setAmount] = useState(String(balance / 100));
  const [method, setMethod] = useState('CARD_AT_DESK');
  const [reference, setReference] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Record a payment" description={`Balance due ${money(balance)}. For payments taken at the front desk.`}
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={busy} onClick={() => onSubmit({ amount: toPaise(amount), method, reference })}>Record payment</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Amount (₹)" htmlFor="p-amt"><input id="p-amt" type="number" step="0.01" min={0} className="admin-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Labeled>
        <Labeled label="Method" htmlFor="p-m"><select id="p-m" className="admin-input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CARD_AT_DESK">Card at desk</option><option value="UPI_AT_DESK">UPI at desk</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option></select></Labeled>
        <Labeled label="Reference / receipt no." className="sm:col-span-2" htmlFor="p-ref"><input id="p-ref" className="admin-input" value={reference} onChange={(e) => setReference(e.target.value)} /></Labeled>
      </div>
    </Dialog>
  );
}

function RefundDialog({ open, max, suggested, onClose, onSubmit, busy }: { open: boolean; max: number; suggested: number; onClose: () => void; onSubmit: (body: object) => void; busy: boolean }) {
  const [amount, setAmount] = useState(String((suggested || max) / 100));
  const [reason, setReason] = useState(suggested ? 'Cancellation refund per policy' : '');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Issue a refund" description={`Up to ${money(max)} can be refunded. Gateway payments are refunded through the gateway; desk payments are recorded as refunded.`}
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit({ amount: toPaise(amount), reason })}>Refund {money(toPaise(amount))}</button></>}>
      <div className="grid gap-4">
        <Labeled label="Amount (₹)" htmlFor="r-amt"><input id="r-amt" type="number" step="0.01" min={0} max={max / 100} className="admin-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Labeled>
        <Labeled label="Reason" htmlFor="r-reason"><input id="r-reason" className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} /></Labeled>
      </div>
    </Dialog>
  );
}
