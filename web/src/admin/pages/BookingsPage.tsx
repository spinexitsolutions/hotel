import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL, PAYMENT_STATUSES } from '@aurelle/shared';
import { get } from '@/lib/api';
import { dateShort, money, titleCase } from '@/lib/format';
import { useAuth } from '@/app/AuthProvider';
import { Card, Empty, ErrorBox, Loading, PageHeader, Pager, SearchBox, StatusBadge } from '../components/ui';

interface Row {
  id: string; reference: string; status: string; paymentStatus: string; refundStatus: string; paymentMethod: string; source: string; guest: string; guestEmail: string;
  roomType: string; roomNumbers: string[]; checkIn: string; checkOut: string; nights: number; rooms: number; adults: number; children: number; grandTotal: number; amountPaid: number; createdAt: string;
}

const QUICK = [
  { label: 'All', params: {} },
  { label: 'Pending', params: { status: 'PENDING,PENDING_PAYMENT' } },
  { label: 'Confirmed', params: { status: 'CONFIRMED' } },
  { label: 'In house', params: { status: 'CHECKED_IN' } },
  { label: 'Refunds due', params: { refundStatus: 'PENDING,FAILED' } },
  { label: 'Cancelled', params: { status: 'CANCELLED,REJECTED,NO_SHOW' } },
];

export default function BookingsPage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const filters = Object.fromEntries(sp.entries());
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    if (!('page' in patch)) n.delete('page');
    setSp(n, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get('q') ?? '') !== q) set({ q: q || null }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: types } = useQuery({ queryKey: ['admin', 'room-types', 'min'], queryFn: () => get<{ items: { id: string; name: string }[] }>('/admin/room-types') });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'bookings', filters], queryFn: () => get<{ items: Row[]; total: number; page: number; pages: number }>('/admin/bookings', filters), placeholderData: (p) => p });
  const exportUrl = `/api/admin/bookings/export.csv?${new URLSearchParams(Object.entries(filters).filter(([k]) => k !== 'page')).toString()}`;
  const activeQuick = QUICK.findIndex((x) => JSON.stringify(x.params) === JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([k]) => k === 'status' || k === 'refundStatus'))));

  return (
    <div>
      <PageHeader title="Reservations" description="Search, filter and manage every booking." actions={<>
        {can('bookings.export') && <a href={exportUrl} className="admin-btn-secondary"><Download className="h-4 w-4" /> Export CSV</a>}
        {can('bookings.manage') && <Link to="/admin/bookings/new" className="admin-btn-primary"><Plus className="h-4 w-4" /> New reservation</Link>}
      </>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {QUICK.map((x, i) => (
          <button key={x.label} onClick={() => set({ status: (x.params as Record<string, string>).status ?? null, refundStatus: (x.params as Record<string, string>).refundStatus ?? null })} className={`rounded-full px-3 py-1 text-xs font-medium ${activeQuick === i ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'}`}>{x.label}</button>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Reference, guest name, email or phone" />
          <select className="admin-input w-auto" value={sp.get('status') ?? ''} onChange={(e) => set({ status: e.target.value || null })} aria-label="Status">
            <option value="">Any status</option>
            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}
          </select>
          <select className="admin-input w-auto" value={sp.get('paymentStatus') ?? ''} onChange={(e) => set({ paymentStatus: e.target.value || null })} aria-label="Payment status">
            <option value="">Any payment</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          <select className="admin-input w-auto" value={sp.get('roomTypeId') ?? ''} onChange={(e) => set({ roomTypeId: e.target.value || null })} aria-label="Room type">
            <option value="">All room types</option>
            {types?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="admin-input w-auto" value={sp.get('dateField') ?? 'checkIn'} onChange={(e) => set({ dateField: e.target.value })} aria-label="Date field">
            <option value="checkIn">Arrival</option><option value="checkOut">Departure</option><option value="created">Booked on</option>
          </select>
          <input type="date" className="admin-input w-auto" value={sp.get('from') ?? ''} onChange={(e) => set({ from: e.target.value || null })} aria-label="From" />
          <input type="date" className="admin-input w-auto" value={sp.get('to') ?? ''} onChange={(e) => set({ to: e.target.value || null })} aria-label="To" />
          <select className="admin-input w-auto" value={sp.get('sort') ?? 'created'} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            <option value="created">Newest first</option><option value="checkIn">Arrival (soonest)</option><option value="checkInDesc">Arrival (latest)</option><option value="total">Highest value</option>
          </select>
          {Object.keys(filters).length > 0 && <button className="admin-btn-ghost text-xs" onClick={() => { setQ(''); setSp({}, { replace: true }); }}>Clear</button>}
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? <Empty title="No reservations match" body="Try changing the filters." /> : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th>Reference</th><th>Guest</th><th>Stay</th><th>Room</th><th>Status</th><th>Payment</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id} className="cursor-pointer">
                    <td><Link to={`/admin/bookings/${b.id}`} className="font-mono text-[13px] font-medium hover:underline">{b.reference}</Link><p className="text-[11px] text-zinc-400">{titleCase(b.source)}</p></td>
                    <td><p className="font-medium">{b.guest}</p><p className="text-xs text-zinc-500">{b.guestEmail}</p></td>
                    <td className="whitespace-nowrap">{dateShort(b.checkIn)} → {dateShort(b.checkOut)}<p className="text-xs text-zinc-500">{b.nights}n · {b.adults}A{b.children ? ` ${b.children}C` : ''}</p></td>
                    <td>{b.roomType}{b.rooms > 1 ? ` × ${b.rooms}` : ''}<p className="text-xs text-zinc-500">{b.roomNumbers.length ? `Rm ${b.roomNumbers.join(', ')}` : '—'}</p></td>
                    <td><StatusBadge status={b.status} />{b.refundStatus !== 'NONE' && <div className="mt-1"><span className="text-[11px] text-violet-700">Refund {b.refundStatus.toLowerCase()}</span></div>}</td>
                    <td><StatusBadge status={b.paymentStatus} /><p className="mt-0.5 text-[11px] text-zinc-400">{b.paymentMethod === 'PAY_AT_HOTEL' ? 'At hotel' : 'Online'}</p></td>
                    <td className="text-right tabular-nums"><p className="font-medium">{money(b.grandTotal)}</p><p className="text-xs text-zinc-500">paid {money(b.amountPaid)}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={(p) => set({ page: String(p) })} /></div>}
      </Card>
    </div>
  );
}

