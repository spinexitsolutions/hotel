import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { addDays, todayInZone } from '@aurelle/shared';
import { ApiError, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import type { MealPlan, QuoteResponse } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { Card, Labeled, PageHeader, Toggle } from '../components/ui';

export default function NewBookingPage() {
  const nav = useNavigate();
  const toast = useToast();
  const today = todayInZone();
  const [v, setV] = useState({
    roomTypeId: '', checkIn: today, checkOut: addDays(today, 2), adults: 2, children: 0, rooms: 1, extraBeds: 0, mealPlanId: '', couponCode: '',
    firstName: '', lastName: '', email: '', phone: '', country: 'India', source: 'PHONE', confirm: true, specialInstructions: '', occasion: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));
  const { data: types } = useQuery({ queryKey: ['admin', 'room-types', 'min'], queryFn: () => get<{ items: { id: string; name: string; status: string }[] }>('/admin/room-types') });
  const { data: opts } = useQuery({ queryKey: ['booking-options'], queryFn: () => get<{ mealPlans: MealPlan[] }>('/booking-options') });
  const quoteBody = v.roomTypeId && v.checkOut > v.checkIn ? { roomTypeId: v.roomTypeId, checkIn: v.checkIn, checkOut: v.checkOut, adults: v.adults, children: v.children, rooms: v.rooms, extraBeds: v.extraBeds, mealPlanId: v.mealPlanId || null, addOns: [], couponCode: v.couponCode || null } : null;
  const quote = useQuery({ queryKey: ['admin-quote', quoteBody], queryFn: () => post<QuoteResponse>('/quote', quoteBody), enabled: !!quoteBody, retry: false });

  const create = useMutation({
    mutationFn: () => post<{ id: string; reference: string }>('/admin/bookings', {
      roomTypeId: v.roomTypeId, checkIn: v.checkIn, checkOut: v.checkOut, adults: v.adults, children: v.children, rooms: v.rooms, extraBeds: v.extraBeds,
      mealPlanId: v.mealPlanId || null, addOns: [], couponCode: v.couponCode || null, source: v.source, confirm: v.confirm,
      guest: { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone, country: v.country },
      requests: { arrivalTime: '', earlyCheckIn: false, lateCheckOut: false, occasion: v.occasion, airportTransfer: { required: false, flightNumber: '', arrivalAt: '' }, specialInstructions: v.specialInstructions },
    }),
    onSuccess: (r) => { toast.success(`Reservation ${r.reference} created`); nav(`/admin/bookings/${r.id}`); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(e instanceof Error ? e.message : 'Could not create the reservation'); },
  });

  const num = (k: keyof typeof v, label: string, min = 0) => (
    <Labeled label={label} htmlFor={`nb-${k}`}><input id={`nb-${k}`} type="number" min={min} className="admin-input" value={String(v[k])} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<typeof v>)} /></Labeled>
  );
  const txt = (k: keyof typeof v, label: string, type = 'text', errKey?: string) => (
    <Labeled label={label} error={errors[errKey ?? k]} htmlFor={`nb-${k}`}><input id={`nb-${k}`} type={type} className="admin-input" value={String(v[k])} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof v>)} /></Labeled>
  );

  return (
    <div>
      <PageHeader back={<Link to="/admin/bookings" className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Reservations</Link>}
        title="New reservation" description="For phone, email and walk-in guests. Payment is collected at the hotel and recorded on the reservation." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Stay">
            <div className="grid gap-4 sm:grid-cols-3">
              <Labeled label="Room type" className="sm:col-span-3" htmlFor="nb-rt">
                <select id="nb-rt" className="admin-input" value={v.roomTypeId} onChange={(e) => set({ roomTypeId: e.target.value })}>
                  <option value="">Choose a room type…</option>
                  {types?.items.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status !== 'PUBLISHED' ? ` (${t.status.toLowerCase()})` : ''}</option>)}
                </select>
              </Labeled>
              {txt('checkIn', 'Arrival', 'date')}{txt('checkOut', 'Departure', 'date')}{num('rooms', 'Rooms', 1)}
              {num('adults', 'Adults', 1)}{num('children', 'Children')}{num('extraBeds', 'Extra beds')}
              <Labeled label="Meal plan" htmlFor="nb-mp"><select id="nb-mp" className="admin-input" value={v.mealPlanId} onChange={(e) => set({ mealPlanId: e.target.value })}><option value="">Room only</option>{opts?.mealPlans.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Labeled>
              {txt('couponCode', 'Coupon code')}
              <Labeled label="Source" htmlFor="nb-src"><select id="nb-src" className="admin-input" value={v.source} onChange={(e) => set({ source: e.target.value })}>{['PHONE', 'EMAIL', 'WALK_IN', 'OTA', 'ADMIN'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</select></Labeled>
            </div>
          </Card>
          <Card title="Guest">
            <div className="grid gap-4 sm:grid-cols-2">
              {txt('firstName', 'First name', 'text', 'guest.firstName')}{txt('lastName', 'Last name', 'text', 'guest.lastName')}
              {txt('email', 'Email', 'email', 'guest.email')}{txt('phone', 'Phone', 'tel', 'guest.phone')}{txt('country', 'Country')}
              <Labeled label="Occasion" htmlFor="nb-occ"><select id="nb-occ" className="admin-input" value={v.occasion} onChange={(e) => set({ occasion: e.target.value })}><option value="">None</option>{['BIRTHDAY', 'ANNIVERSARY', 'HONEYMOON', 'PROPOSAL', 'BUSINESS', 'OTHER'].map((o) => <option key={o} value={o}>{o.toLowerCase()}</option>)}</select></Labeled>
              <Labeled label="Special instructions" className="sm:col-span-2" htmlFor="nb-si"><textarea id="nb-si" className="admin-input" rows={3} value={v.specialInstructions} onChange={(e) => set({ specialInstructions: e.target.value })} /></Labeled>
            </div>
          </Card>
        </div>
        <div>
          <Card title="Summary" className="sticky top-24">
            {!quoteBody ? <p className="text-sm text-zinc-500">Choose a room type and dates.</p> : quote.isLoading ? <p className="text-sm text-zinc-500">Calculating…</p> : quote.error ? <p className="text-sm text-red-600">{(quote.error as Error).message}</p> : quote.data && (
              <div className="space-y-2 text-sm">
                <p className={quote.data.availability.available >= v.rooms ? 'text-emerald-700' : 'text-red-600'}>{quote.data.availability.closed ? 'Closed for sale on these dates' : `${quote.data.availability.available} room(s) available`}</p>
                {quote.data.quote.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="text-zinc-600">{l.label}</span><span className="tabular-nums">{money(l.amount)}</span></div>)}
                <div className="flex justify-between border-t border-zinc-200 pt-2 font-semibold"><span>Total</span><span>{money(quote.data.quote.grandTotal)}</span></div>
              </div>
            )}
            <div className="mt-5 border-t border-zinc-100 pt-4"><Toggle checked={v.confirm} onChange={(c) => set({ confirm: c })} label="Confirm immediately" description="Sends a confirmation email to the guest." /></div>
            <button className="admin-btn-primary mt-5 w-full" disabled={!quoteBody || create.isPending || !v.firstName || !v.email} onClick={() => { setErrors({}); create.mutate(); }}>{create.isPending ? 'Creating…' : 'Create reservation'}</button>
          </Card>
        </div>
      </div>
    </div>
  );
}
