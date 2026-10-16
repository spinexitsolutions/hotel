import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calculator, Info } from 'lucide-react';
import { get, post } from '@/lib/api';
import { dateLong, dateShort, money, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { QuoteResponse } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';
import { CrudPage, type Column, type FieldSpec } from '../components/CrudPage';
import { Badge, Card, ErrorBox, Labeled, PageHeader } from '../components/ui';

type RoomTypeLite = { id: string; name: string; basePrice: number };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const signedPct = (bps: number) => `${bps > 0 ? '+' : ''}${pct(bps)}`;
const signedMoney = (paise: number) => `${paise > 0 ? '+' : paise < 0 ? '−' : ''}${money(Math.abs(paise))}`;
const activeBadge = (v: boolean) => <Badge color={v ? 'green' : 'zinc'}>{v ? 'Active' : 'Inactive'}</Badge>;
const opts = (arr: readonly string[]) => arr.map((v) => ({ value: v, label: titleCase(v) }));
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localIso(d); };

const TABS = [
  { key: 'rates', label: 'Seasonal rates' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'meals', label: 'Meal plans' },
  { key: 'addons', label: 'Add-ons & services' },
  { key: 'taxes', label: 'Taxes & fees' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function useRoomTypes() {
  return useQuery({ queryKey: ['admin', 'room-types', 'lite'], queryFn: () => get<{ items: RoomTypeLite[] }>('/admin/room-types'), staleTime: 60_000 });
}

export default function PricingPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'rates') as TabKey;
  const setTab = (t: TabKey) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });

  return (
    <div>
      <PageHeader title="Pricing & taxes" description="Seasonal rates, holiday uplifts, meal plans, extras and the taxes applied at checkout." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist" aria-label="Pricing sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', tab === t.key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'rates' && <RatesTab />}
        {tab === 'holidays' && <HolidaysTab />}
        {tab === 'meals' && <MealPlansTab />}
        {tab === 'addons' && <AddOnsTab />}
        {tab === 'taxes' && <ChargesTab />}
      </div>
      <div className="mt-8"><PricePreview /></div>
    </div>
  );
}

function Explainer({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Seasonal rates ──────────────────────────────────────────────────────────
type RateRule = { id: string; name: string; roomTypeId: string | null; startDate: string; endDate: string; kind: 'OVERRIDE' | 'PERCENT' | 'FIXED'; value: number; daysOfWeek: number[]; priority: number; isActive: boolean };

function RatesTab() {
  const { can } = useAuth();
  const { data: rt } = useRoomTypes();
  const types = useMemo(() => rt?.items ?? [], [rt]);
  const typeName = (id: string | null) => (id ? types.find((t) => t.id === id)?.name ?? 'Unknown room type' : 'All room types');

  const fields: FieldSpec[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Diwali peak season', span: 2 },
    { key: 'roomTypeId', label: 'Room type', type: 'select', options: [{ value: '', label: 'All room types' }, ...types.map((t) => ({ value: t.id, label: t.name }))] },
    { key: 'kind', label: 'Rule type', type: 'select', options: [
      { value: 'OVERRIDE', label: 'Override — set the nightly price' },
      { value: 'PERCENT', label: 'Percent adjustment (stacks)' },
      { value: 'FIXED', label: 'Fixed amount adjustment (stacks)' },
    ] },
    { key: 'startDate', label: 'Start date', type: 'date' },
    { key: 'endDate', label: 'End date (inclusive)', type: 'date', hint: 'The night of this date is included.' },
    { key: 'valueAmount', label: 'Nightly price (₹)', type: 'number', hint: 'Replaces the base price for matching nights.', when: (v) => v.kind === 'OVERRIDE' },
    { key: 'valueAmount', label: 'Adjustment (₹ per night)', type: 'number', hint: 'Use a negative number for a discount, e.g. -1500.', when: (v) => v.kind === 'FIXED' },
    { key: 'valuePct', label: 'Adjustment (%)', type: 'bps', hint: 'Use a negative number for a discount, e.g. -10.', when: (v) => v.kind === 'PERCENT' },
    { key: 'priority', label: 'Priority', type: 'number', hint: 'Higher wins when several overrides match the same night.' },
    { key: 'daysOfWeek', label: 'Days of week', type: 'days', hint: 'Leave all unselected to apply on every day.', span: 2 },
    { key: 'isActive', label: 'Active', type: 'boolean', hint: 'Inactive rules are ignored when pricing.', span: 2 },
  ], [types]);

  const columns: Column<RateRule>[] = [
    { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'roomTypeId', label: 'Room type', render: (r) => typeName(r.roomTypeId) },
    { key: 'dates', label: 'Dates', render: (r) => <span className="whitespace-nowrap">{dateShort(r.startDate)} – {dateLong(r.endDate)}</span> },
    { key: 'kind', label: 'Effect', className: 'tabular-nums whitespace-nowrap', render: (r) => (r.kind === 'OVERRIDE' ? <span>Set to {money(r.value)}</span> : r.kind === 'PERCENT' ? signedPct(r.value) : signedMoney(r.value)) },
    { key: 'days', label: 'Days', render: (r) => (r.daysOfWeek.length && r.daysOfWeek.length < 7 ? r.daysOfWeek.map((d) => DAYS[d]).join(', ') : 'Every day') },
    { key: 'priority', label: 'Priority', className: 'tabular-nums' },
    { key: 'isActive', label: 'Status', render: (r) => activeBadge(r.isActive) },
  ];

  return (
    <>
      <Explainer>
        <p><strong>How seasonal rates combine:</strong> for each night, the highest-priority active <em>Override</em> that matches replaces the room’s base (or weekend) price.</p>
        <p>Every matching <em>Percent</em> and <em>Fixed</em> adjustment then stacks on top of that price. Holiday uplifts are applied last, on top of everything.</p>
      </Explainer>
      <CrudPage<RateRule>
        embedded title="Seasonal rates" description="Date-ranged price rules, per room type or hotel-wide." endpoint="/rate-rules" itemLabel="rate rule"
        canEdit={can('pricing.manage')} fields={fields} columns={columns}
        defaults={{ name: '', roomTypeId: null, startDate: addDays(0), endDate: addDays(30), kind: 'PERCENT', value: 1000, daysOfWeek: [], priority: 10, isActive: true }}
        mapRow={(r) => ({ ...r, valuePct: r.kind === 'PERCENT' ? Number(r.value) / 100 : '', valueAmount: r.kind !== 'PERCENT' && r.value != null ? Number(r.value) / 100 : '' })}
        mapBody={(b, form) => {
          const { valuePct, valueAmount, ...rest } = b;
          return {
            ...rest, roomTypeId: rest.roomTypeId || null, priority: rest.priority ?? 10,
            value: form.kind === 'PERCENT' ? valuePct : valueAmount == null || Number.isNaN(valueAmount) ? null : Math.round(Number(valueAmount) * 100),
          };
        }}
      />
    </>
  );
}

// ─── Holidays ────────────────────────────────────────────────────────────────
type Holiday = { id: string; date: string; name: string; upliftBps: number };
function HolidaysTab() {
  const { can } = useAuth();
  return (
    <CrudPage<Holiday>
      embedded title="Holidays" description="A percentage uplift applied on top of all rate rules for the night of each holiday." endpoint="/holidays" itemLabel="holiday" searchable={false}
      canEdit={can('pricing.manage')}
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. New Year’s Eve' },
        { key: 'upliftBps', label: 'Uplift (%)', type: 'bps', hint: 'e.g. 25 for +25%. Negative values discount the night (min −50%).', span: 2 },
      ]}
      columns={[
        { key: 'date', label: 'Date', render: (r) => dateLong(r.date) },
        { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'upliftBps', label: 'Uplift', render: (r) => signedPct(r.upliftBps), className: 'tabular-nums' },
      ]}
      defaults={{ date: addDays(0), name: '', upliftBps: 2000 }}
    />
  );
}

// ─── Meal plans ─────────────────────────────────────────────────────────────
type MealPlan = { id: string; code: string; name: string; description: string; pricePerAdult: number; pricePerChild: number; isActive: boolean; sortOrder: number };
function MealPlansTab() {
  const { can } = useAuth();
  return (
    <CrudPage<MealPlan>
      embedded title="Meal plans" description="Board options guests can add while booking. Prices are per person, per night." endpoint="/meal-plans" itemLabel="meal plan" searchable={false}
      canEdit={can('pricing.manage')}
      fields={[
        { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. CP, MAP, AP', hint: 'Short uppercase code (2–10 characters).' },
        { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Breakfast included' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'pricePerAdult', label: 'Price per adult / night', type: 'money' },
        { key: 'pricePerChild', label: 'Price per child / night', type: 'money' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'boolean', hint: 'Offered to guests during booking.' },
      ]}
      columns={[
        { key: 'code', label: 'Code', render: (r) => <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{r.code}</code> },
        { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'pricePerAdult', label: 'Adult', render: (r) => money(r.pricePerAdult), className: 'tabular-nums' },
        { key: 'pricePerChild', label: 'Child', render: (r) => money(r.pricePerChild), className: 'tabular-nums' },
        { key: 'isActive', label: 'Status', render: (r) => activeBadge(r.isActive) },
        { key: 'sortOrder', label: 'Order', className: 'tabular-nums' },
      ]}
      defaults={{ code: '', name: '', description: '', pricePerAdult: 0, pricePerChild: 0, isActive: true, sortOrder: 0 }}
      mapBody={(b) => ({ ...b, code: String(b.code ?? '').toUpperCase(), sortOrder: b.sortOrder ?? 0, pricePerAdult: b.pricePerAdult ?? 0, pricePerChild: b.pricePerChild ?? 0 })}
    />
  );
}

// ─── Add-ons ─────────────────────────────────────────────────────────────────
type AddOn = { id: string; name: string; description: string; category: string; pricingType: string; price: number; taxable: boolean; maxQuantity: number; image: string; isActive: boolean; sortOrder: number };
const ADDON_CATEGORIES = ['TRANSFER', 'DINING', 'SPA', 'CELEBRATION', 'EXPERIENCE', 'OTHER'] as const;
const ADDON_PRICING = [
  { value: 'PER_STAY', label: 'Per stay' }, { value: 'PER_NIGHT', label: 'Per night' },
  { value: 'PER_GUEST', label: 'Per guest' }, { value: 'PER_GUEST_PER_NIGHT', label: 'Per guest, per night' },
];
function AddOnsTab() {
  const { can } = useAuth();
  return (
    <CrudPage<AddOn>
      embedded title="Add-ons & services" description="Transfers, dining, spa and celebration extras guests can add to a booking." endpoint="/add-ons" itemLabel="add-on"
      canEdit={can('pricing.manage')}
      fields={[
        { key: 'name', label: 'Name', type: 'text', span: 2 },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'category', label: 'Category', type: 'select', options: opts(ADDON_CATEGORIES) },
        { key: 'pricingType', label: 'Pricing', type: 'select', options: ADDON_PRICING },
        { key: 'price', label: 'Price', type: 'money' },
        { key: 'maxQuantity', label: 'Max quantity', type: 'number', hint: '1–20 per booking.' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
        { key: 'taxable', label: 'Taxable', type: 'boolean', hint: 'Included in taxes that apply to extras.' },
        { key: 'isActive', label: 'Active', type: 'boolean', hint: 'Offered to guests.' },
      ]}
      columns={[
        { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'category', label: 'Category', render: (r) => <Badge>{titleCase(r.category)}</Badge> },
        { key: 'price', label: 'Price', render: (r) => <span className="whitespace-nowrap tabular-nums">{money(r.price)} <span className="text-xs text-zinc-500">{ADDON_PRICING.find((p) => p.value === r.pricingType)?.label.toLowerCase()}</span></span> },
        { key: 'taxable', label: 'Taxable', render: (r) => (r.taxable ? 'Yes' : 'No') },
        { key: 'isActive', label: 'Status', render: (r) => activeBadge(r.isActive) },
      ]}
      defaults={{ name: '', description: '', category: 'EXPERIENCE', pricingType: 'PER_STAY', price: 0, taxable: true, maxQuantity: 1, image: '', isActive: true, sortOrder: 0 }}
      mapBody={(b) => ({ ...b, price: b.price ?? 0, maxQuantity: b.maxQuantity ?? 1, sortOrder: b.sortOrder ?? 0, image: b.image ?? '' })}
    />
  );
}

// ─── Taxes & fees ───────────────────────────────────────────────────────────
type Charge = { id: string; name: string; kind: 'TAX' | 'FEE'; calculation: 'PERCENT' | 'FLAT_PER_STAY' | 'FLAT_PER_NIGHT'; value: number; appliesTo: string; minNightlyRate: number | null; maxNightlyRate: number | null; isActive: boolean; sortOrder: number };
const CALC = [{ value: 'PERCENT', label: 'Percentage' }, { value: 'FLAT_PER_STAY', label: 'Flat per stay' }, { value: 'FLAT_PER_NIGHT', label: 'Flat per night' }];
const APPLIES = [{ value: 'ROOM', label: 'Room charges' }, { value: 'EXTRAS', label: 'Extras (meals, add-ons)' }, { value: 'ALL', label: 'Everything' }];
function slab(r: Charge) {
  if (r.minNightlyRate == null && r.maxNightlyRate == null) return <span className="text-zinc-400">All rates</span>;
  if (r.minNightlyRate != null && r.maxNightlyRate != null) return `${money(r.minNightlyRate)} – ${money(r.maxNightlyRate)}`;
  return r.minNightlyRate != null ? `≥ ${money(r.minNightlyRate)}` : `≤ ${money(r.maxNightlyRate)}`;
}
function ChargesTab() {
  const { can } = useAuth();
  return (
    <>
      <Explainer>
        <p><strong>Rate slabs:</strong> set a minimum and/or maximum nightly room rate to apply a charge only within that band (both limits are inclusive). For example, Indian GST on rooms is 5% up to ₹7,500 per night and 18% above — create two taxes: 5% with max ₹7,500, and 18% with min ₹7,500.01.</p>
        <p>Leave both limits blank to apply the charge at every rate.</p>
      </Explainer>
      <CrudPage<Charge>
        embedded title="Taxes & fees" description="Applied automatically to every quote and booking." endpoint="/charges" itemLabel="charge" searchable={false}
        canEdit={can('pricing.manage')}
        fields={[
          { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. GST (5%)' },
          { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'TAX', label: 'Tax' }, { value: 'FEE', label: 'Fee' }] },
          { key: 'calculation', label: 'Calculation', type: 'select', options: CALC },
          { key: 'valuePct', label: 'Rate (%)', type: 'bps', when: (v) => v.calculation === 'PERCENT' },
          { key: 'valueFlat', label: 'Amount', type: 'money', when: (v) => v.calculation !== 'PERCENT', hint: 'Charged per stay or per night, as selected.' },
          { key: 'appliesTo', label: 'Applies to', type: 'select', options: APPLIES },
          { key: 'sortOrder', label: 'Sort order', type: 'number' },
          { key: 'minNightlyRate', label: 'Min nightly rate (optional)', type: 'money', hint: 'Only when the nightly room rate is at least this.' },
          { key: 'maxNightlyRate', label: 'Max nightly rate (optional)', type: 'money', hint: 'Only when the nightly room rate is at most this.' },
          { key: 'isActive', label: 'Active', type: 'boolean', span: 2 },
        ]}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'kind', label: 'Type', render: (r) => <Badge color={r.kind === 'TAX' ? 'blue' : 'violet'}>{titleCase(r.kind)}</Badge> },
          { key: 'value', label: 'Value', render: (r) => (r.calculation === 'PERCENT' ? pct(r.value) : `${money(r.value)} ${r.calculation === 'FLAT_PER_NIGHT' ? '/ night' : '/ stay'}`), className: 'tabular-nums whitespace-nowrap' },
          { key: 'appliesTo', label: 'Applies to', render: (r) => APPLIES.find((a) => a.value === r.appliesTo)?.label ?? r.appliesTo },
          { key: 'slab', label: 'Nightly rate slab', render: slab },
          { key: 'isActive', label: 'Status', render: (r) => activeBadge(r.isActive) },
        ]}
        defaults={{ name: '', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'ROOM', minNightlyRate: null, maxNightlyRate: null, isActive: true, sortOrder: 0 }}
        mapRow={(r) => ({ ...r, valuePct: r.calculation === 'PERCENT' ? Number(r.value) / 100 : '', valueFlat: r.calculation !== 'PERCENT' ? Number(r.value) / 100 : '' })}
        mapBody={(b, form) => {
          const { valuePct, valueFlat, ...rest } = b;
          return { ...rest, value: (form.calculation === 'PERCENT' ? valuePct : valueFlat) ?? 0, sortOrder: rest.sortOrder ?? 0 };
        }}
      />
    </>
  );
}

// ─── Price preview ──────────────────────────────────────────────────────────
function PricePreview() {
  const { data: rt, isLoading: rtLoading, error: rtError } = useRoomTypes();
  const [form, setForm] = useState({ roomTypeId: '', checkIn: addDays(14), checkOut: addDays(17), adults: 2 });
  const roomTypeId = form.roomTypeId || rt?.items[0]?.id || '';
  const quote = useMutation({
    mutationFn: () => post<QuoteResponse>('/quote', { roomTypeId, checkIn: form.checkIn, checkOut: form.checkOut, adults: form.adults, children: 0, rooms: 1, extraBeds: 0, addOns: [] }),
  });
  const q = quote.data?.quote;
  const set = (k: keyof typeof form, v: string | number) => setForm((s) => ({ ...s, [k]: v }));
  const badDates = !!form.checkIn && !!form.checkOut && form.checkOut <= form.checkIn;
  const invalid = !roomTypeId || !form.checkIn || !form.checkOut || badDates;

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Calculator className="h-4 w-4" aria-hidden /> Price preview</span>}>
      <p className="mb-4 text-sm text-zinc-500">Check how rate rules, holidays and taxes combine for a stay. Uses the same engine as the public booking flow (no coupon; eligible offers apply automatically). Save changes above, then preview.</p>
      {rtError ? <ErrorBox error={rtError} /> : (
        <form className="grid gap-3 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!invalid) quote.mutate(); }}>
          <Labeled label="Room type" htmlFor="pp-room" className="sm:col-span-2">
            <select id="pp-room" className="admin-input" value={roomTypeId} onChange={(e) => set('roomTypeId', e.target.value)} disabled={rtLoading}>
              {rtLoading && <option>Loading…</option>}
              {rt?.items.map((t) => <option key={t.id} value={t.id}>{t.name} — base {money(t.basePrice)}</option>)}
            </select>
          </Labeled>
          <Labeled label="Check-in" htmlFor="pp-in"><input id="pp-in" type="date" className="admin-input" value={form.checkIn} onChange={(e) => set('checkIn', e.target.value)} /></Labeled>
          <Labeled label="Check-out" htmlFor="pp-out"><input id="pp-out" type="date" className="admin-input" value={form.checkOut} min={form.checkIn} onChange={(e) => set('checkOut', e.target.value)} /></Labeled>
          <div className="flex items-end gap-2">
            <Labeled label="Adults" htmlFor="pp-ad" className="w-20"><input id="pp-ad" type="number" min={1} max={40} className="admin-input" value={form.adults} onChange={(e) => set('adults', Math.max(1, Number(e.target.value) || 1))} /></Labeled>
            <button type="submit" className="admin-btn-primary" disabled={invalid || quote.isPending}>{quote.isPending ? 'Pricing…' : 'Preview'}</button>
          </div>
        </form>
      )}
      {badDates && <p className="mt-2 text-xs text-red-600" role="alert">Check-out must be after check-in.</p>}
      {quote.error && <div className="mt-4"><ErrorBox error={quote.error} /></div>}
      {q && quote.data && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]" aria-live="polite">
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="admin-table">
              <thead><tr><th>Night</th><th className="text-right">Rate</th><th>Applied</th></tr></thead>
              <tbody>
                {q.nightly.map((n) => (
                  <tr key={n.date}>
                    <td className="whitespace-nowrap">{dateLong(n.date)} {n.isWeekend && <Badge color="blue">Weekend</Badge>}</td>
                    <td className="text-right tabular-nums">{money(n.rate)}</td>
                    <td className="text-xs text-zinc-600">
                      <div className="flex flex-wrap gap-1">
                        {n.holiday && <Badge color="amber">Holiday: {n.holiday}</Badge>}
                        {n.appliedRules.map((r, idx) => <Badge key={`${r}-${idx}`} color="violet">{r}</Badge>)}
                        {!n.holiday && !n.appliedRules.length && <span className="text-zinc-400">Base price</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-1.5 rounded-lg border border-zinc-200 p-4 text-sm">
            <Row label={`Room (${q.nights} night${q.nights === 1 ? '' : 's'})`} value={money(q.roomSubtotal)} />
            {q.extrasSubtotal > 0 && <Row label="Extras" value={money(q.extrasSubtotal)} />}
            {q.discountTotal > 0 && <Row label={quote.data.offer ? `Offer: ${quote.data.offer.title}` : 'Discounts'} value={`−${money(q.discountTotal)}`} />}
            {q.lines.filter((l) => l.kind === 'TAX' || l.kind === 'FEE').map((l, i) => <Row key={i} label={l.label} value={money(l.amount)} muted />)}
            <Row label="Taxes" value={money(q.taxTotal)} />
            {q.feeTotal > 0 && <Row label="Fees" value={money(q.feeTotal)} />}
            <div className="!mt-3 border-t border-zinc-200 pt-3"><Row label="Grand total" value={money(q.grandTotal)} strong /></div>
            <Row label="Average nightly rate" value={money(q.averageNightlyRate)} muted />
            <p className="pt-2 text-xs text-zinc-500">
              Availability: {quote.data.availability.closed ? <span className="text-red-600">closed{quote.data.availability.reason ? ` (${quote.data.availability.reason})` : ''}</span> : `${quote.data.availability.available} room(s) free`}
            </p>
            {q.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
          </dl>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'text-base font-semibold', muted && 'text-xs text-zinc-500')}>
      <dt>{label}</dt><dd className="tabular-nums">{value}</dd>
    </div>
  );
}
