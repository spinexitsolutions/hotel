import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Star } from 'lucide-react';
import { get } from '@/lib/api';
import { dateShort, dateTime, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { CrudPage, type Column, type FieldSpec } from '../components/CrudPage';
import { Badge, PageHeader } from '../components/ui';

type RoomTypeLite = { id: string; name: string };
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

const TABS = [{ key: 'offers', label: 'Offers & packages' }, { key: 'coupons', label: 'Coupons' }] as const;
type TabKey = (typeof TABS)[number]['key'];

function useRoomTypes() {
  return useQuery({ queryKey: ['admin', 'room-types', 'lite'], queryFn: () => get<{ items: RoomTypeLite[] }>('/admin/room-types'), staleTime: 60_000 });
}

export default function OffersPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'offers') as TabKey;
  const setTab = (t: TabKey) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  const { data: rt } = useRoomTypes();
  const types = useMemo(() => rt?.items ?? [], [rt]);
  const roomOptions = useMemo(() => types.map((t) => ({ value: t.id, label: t.name })), [types]);
  const roomNames = (ids: string[]) => (ids.length ? ids.map((id) => types.find((t) => t.id === id)?.name ?? '?').join(', ') : 'All room types');

  return (
    <div>
      <PageHeader title="Offers & coupons" description="Packages shown on the website and promo codes guests enter at checkout." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist" aria-label="Offer sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', tab === t.key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'offers' ? <OffersTab roomOptions={roomOptions} roomNames={roomNames} /> : <CouponsTab roomOptions={roomOptions} roomNames={roomNames} />}
      </div>
    </div>
  );
}

type TabProps = { roomOptions: { value: string; label: string }[]; roomNames: (ids: string[]) => string };

// ─── Offers ──────────────────────────────────────────────────────────────────
type Offer = {
  id: string; slug: string; title: string; subtitle: string; description: string; image: string; discountType: 'NONE' | 'PERCENT' | 'FIXED_PER_NIGHT'; value: number;
  minNights: number; roomTypeIds: string[]; stayStart: string | null; stayEnd: string | null; inclusions: string[]; terms: string; isActive: boolean; isFeatured: boolean; sortOrder: number;
};
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

function offerDiscount(o: Offer) {
  if (o.discountType === 'PERCENT') return `${pct(o.value)} off`;
  if (o.discountType === 'FIXED_PER_NIGHT') return `${money(o.value)} off / night`;
  return <span className="text-zinc-400">Package (no discount)</span>;
}
function offerWindow(o: Offer) {
  if (!o.stayStart && !o.stayEnd) return <span className="text-zinc-400">Any dates</span>;
  return `${o.stayStart ? dateShort(o.stayStart) : 'Now'} – ${o.stayEnd ? dateShort(o.stayEnd) : 'open'}`;
}

function OffersTab({ roomOptions, roomNames }: TabProps) {
  const { can } = useAuth();
  const fields: FieldSpec[] = useMemo(() => [
    { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Monsoon Escape' },
    { key: 'slug', label: 'URL slug', type: 'text', placeholder: 'monsoon-escape', hint: 'Lowercase letters, numbers and hyphens. Leave blank to generate from the title.' },
    { key: 'subtitle', label: 'Subtitle', type: 'text', span: 2 },
    { key: 'image', label: 'Image', type: 'image' },
    { key: 'description', label: 'Description', type: 'markdown', hint: 'Markdown supported.' },
    { key: 'discountType', label: 'Discount', type: 'select', options: [
      { value: 'NONE', label: 'None (package / value-add)' }, { value: 'PERCENT', label: 'Percent off room rate' }, { value: 'FIXED_PER_NIGHT', label: 'Fixed amount off per night' },
    ] },
    { key: 'valuePct', label: 'Discount (%)', type: 'bps', when: (v) => v.discountType === 'PERCENT' },
    { key: 'valueFlat', label: 'Discount per night', type: 'money', when: (v) => v.discountType === 'FIXED_PER_NIGHT' },
    { key: 'minNights', label: 'Minimum nights', type: 'number' },
    { key: 'sortOrder', label: 'Sort order', type: 'number' },
    { key: 'stayStart', label: 'Stay window start (optional)', type: 'date' },
    { key: 'stayEnd', label: 'Stay window end (optional)', type: 'date' },
    { key: 'roomTypeIds', label: 'Eligible room types', type: 'multiselect', options: roomOptions },
    { key: 'inclusions', label: 'Inclusions', type: 'tags', hint: 'One per line, e.g. “Daily breakfast for two”. Up to 15.' },
    { key: 'terms', label: 'Terms & conditions', type: 'textarea', span: 2 },
    { key: 'isActive', label: 'Active', type: 'boolean', hint: 'Visible on the website and applied to eligible stays.' },
    { key: 'isFeatured', label: 'Featured', type: 'boolean', hint: 'Highlighted on the home page.' },
  ], [roomOptions]);

  const columns: Column<Offer>[] = [
    { key: 'title', label: 'Offer', render: (o) => (
      <div className="flex items-center gap-3">
        {o.image ? <img src={o.image} alt="" className="h-10 w-14 shrink-0 rounded object-cover" /> : <div className="h-10 w-14 shrink-0 rounded bg-zinc-100" />}
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium">{o.title}{o.isFeatured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />}</p>
          <p className="truncate text-xs text-zinc-500">/offers/{o.slug}</p>
        </div>
      </div>
    ) },
    { key: 'discount', label: 'Discount', render: offerDiscount, className: 'whitespace-nowrap' },
    { key: 'minNights', label: 'Min nights', className: 'tabular-nums' },
    { key: 'window', label: 'Stay window', render: offerWindow, className: 'whitespace-nowrap' },
    { key: 'rooms', label: 'Rooms', render: (o) => <span className="line-clamp-2 max-w-[220px] text-xs">{roomNames(o.roomTypeIds)}</span> },
    { key: 'status', label: 'Status', render: (o) => {
      const today = new Date().toISOString().slice(0, 10);
      if (!o.isActive) return <Badge>Inactive</Badge>;
      if (o.stayEnd && o.stayEnd < today) return <Badge color="red">Ended</Badge>;
      return <Badge color="green">Live</Badge>;
    } },
  ];

  return (
    <CrudPage<Offer>
      embedded title="Offers & packages" description="Eligible stays receive the offer automatically; each offer also gets its own page on the website." endpoint="/offers" itemLabel="offer"
      canEdit={can('offers.manage')} fields={fields} columns={columns}
      rowActions={(o) => <Link to={`/offers/${o.slug}`} target="_blank" rel="noreferrer" className="admin-btn-ghost !p-1.5" aria-label={`View ${o.title} on website`}><ExternalLink className="h-4 w-4" /></Link>}
      defaults={{ slug: '', title: '', subtitle: '', description: '', image: '', discountType: 'PERCENT', value: 1500, minNights: 2, roomTypeIds: [], stayStart: null, stayEnd: null, inclusions: [], terms: '', isActive: true, isFeatured: false, sortOrder: 0 }}
      mapRow={(r) => ({ ...r, valuePct: r.discountType === 'PERCENT' ? Number(r.value) / 100 : '', valueFlat: r.discountType === 'FIXED_PER_NIGHT' ? Number(r.value) / 100 : '' })}
      mapBody={(b, form) => {
        const { valuePct, valueFlat, ...rest } = b;
        return {
          ...rest,
          slug: String(rest.slug || '').trim() || slugify(String(rest.title ?? '')),
          value: form.discountType === 'PERCENT' ? valuePct ?? 0 : form.discountType === 'FIXED_PER_NIGHT' ? valueFlat ?? 0 : 0,
          minNights: rest.minNights ?? 1, sortOrder: rest.sortOrder ?? 0, image: rest.image ?? '',
        };
      }}
    />
  );
}

// ─── Coupons ─────────────────────────────────────────────────────────────────
type Coupon = {
  id: string; code: string; description: string; discountType: 'PERCENT' | 'FIXED'; value: number; maxDiscount: number | null; minSubtotal: number | null; minNights: number | null;
  startsAt: string | null; endsAt: string | null; usageLimit: number | null; perCustomerLimit: number | null; usedCount: number; roomTypeIds: string[]; isActive: boolean;
};

function couponStatus(c: Coupon): { label: string; color: 'green' | 'blue' | 'red' | 'amber' | 'zinc' } {
  const now = Date.now();
  if (!c.isActive) return { label: 'Inactive', color: 'zinc' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', color: 'red' };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { label: 'Exhausted', color: 'amber' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', color: 'blue' };
  return { label: 'Active', color: 'green' };
}

function CouponsTab({ roomOptions, roomNames }: TabProps) {
  const { can } = useAuth();
  const fields: FieldSpec[] = useMemo(() => [
    { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. WELCOME10', hint: 'Letters, numbers, - and _. Saved in uppercase.' },
    { key: 'discountType', label: 'Discount type', type: 'select', options: [{ value: 'PERCENT', label: 'Percent off' }, { value: 'FIXED', label: 'Fixed amount off' }] },
    { key: 'description', label: 'Description (internal)', type: 'text', span: 2 },
    { key: 'valuePct', label: 'Discount (%)', type: 'bps', when: (v) => v.discountType === 'PERCENT', hint: 'Up to 100%.' },
    { key: 'valueFlat', label: 'Discount amount', type: 'money', when: (v) => v.discountType === 'FIXED' },
    { key: 'maxDiscount', label: 'Maximum discount (optional)', type: 'money', when: (v) => v.discountType === 'PERCENT', hint: 'Caps the percent discount.' },
    { key: 'minSubtotal', label: 'Minimum subtotal (optional)', type: 'money' },
    { key: 'minNights', label: 'Minimum nights (optional)', type: 'number' },
    { key: 'startsAt', label: 'Valid from (optional)', type: 'datetime' },
    { key: 'endsAt', label: 'Valid until (optional)', type: 'datetime' },
    { key: 'usageLimit', label: 'Total usage limit (optional)', type: 'number', hint: 'Blank = unlimited.' },
    { key: 'perCustomerLimit', label: 'Per-guest limit (optional)', type: 'number', hint: 'Blank = unlimited.' },
    { key: 'roomTypeIds', label: 'Eligible room types', type: 'multiselect', options: roomOptions },
    { key: 'isActive', label: 'Active', type: 'boolean', span: 2 },
  ], [roomOptions]);

  const columns: Column<Coupon>[] = [
    { key: 'code', label: 'Code', render: (c) => (
      <div><code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold tracking-wide">{c.code}</code>{c.description && <p className="mt-1 max-w-[240px] truncate text-xs text-zinc-500">{c.description}</p>}</div>
    ) },
    { key: 'value', label: 'Discount', className: 'whitespace-nowrap', render: (c) => (c.discountType === 'PERCENT'
      ? <span>{pct(c.value)}{c.maxDiscount != null && <span className="text-xs text-zinc-500"> (max {money(c.maxDiscount)})</span>}</span>
      : money(c.value)) },
    { key: 'conditions', label: 'Conditions', render: (c) => {
      const parts = [c.minSubtotal != null && `Min ${money(c.minSubtotal)}`, c.minNights != null && `${c.minNights}+ nights`, c.roomTypeIds.length > 0 && roomNames(c.roomTypeIds)].filter(Boolean);
      return <span className="text-xs text-zinc-600">{parts.length ? parts.join(' · ') : 'None'}</span>;
    } },
    { key: 'validity', label: 'Validity', render: (c) => <span className="whitespace-nowrap text-xs">{c.startsAt ? dateTime(c.startsAt) : 'Now'} → {c.endsAt ? dateTime(c.endsAt) : 'No end'}</span> },
    { key: 'usage', label: 'Usage', className: 'tabular-nums whitespace-nowrap', render: (c) => (
      <div className="min-w-[90px]">
        <span>{c.usedCount} / {c.usageLimit ?? '∞'}</span>
        {c.usageLimit != null && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-100" aria-hidden><div className="h-full bg-zinc-800" style={{ width: `${Math.min(100, (c.usedCount / c.usageLimit) * 100)}%` }} /></div>
        )}
        {c.perCustomerLimit != null && <p className="text-[11px] text-zinc-500">{c.perCustomerLimit} per guest</p>}
      </div>
    ) },
    { key: 'status', label: 'Status', render: (c) => { const s = couponStatus(c); return <Badge color={s.color}>{s.label}</Badge>; } },
  ];

  return (
    <CrudPage<Coupon>
      embedded title="Coupons" description="Promo codes guests enter at checkout." endpoint="/coupons" itemLabel="coupon"
      canEdit={can('offers.manage')} fields={fields} columns={columns}
      defaults={{ code: '', description: '', discountType: 'PERCENT', value: 1000, maxDiscount: null, minSubtotal: null, minNights: null, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, roomTypeIds: [], isActive: true }}
      mapRow={(r) => ({ ...r, valuePct: r.discountType === 'PERCENT' ? Number(r.value) / 100 : '', valueFlat: r.discountType === 'FIXED' ? Number(r.value) / 100 : '' })}
      mapBody={(b, form) => {
        const { valuePct, valueFlat, ...rest } = b;
        return {
          ...rest,
          code: String(rest.code ?? '').trim().toUpperCase(),
          value: form.discountType === 'PERCENT' ? valuePct : valueFlat,
          maxDiscount: form.discountType === 'PERCENT' ? rest.maxDiscount ?? null : null,
        };
      }}
    />
  );
}
