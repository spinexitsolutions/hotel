import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { get } from '@/lib/api';
import { dateShort, dateTime, money, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, RangeFilter, Stat, StatusBadge, rangeQuery } from '../components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────
type Range = { from: string; to: string };
type DayRow = { date: string; bookings: number; bookedValue: number; revenue: number };
type RevenueData = { gross: number; refunds: number; refundCount: number; net: number; byProvider: { provider: string; amount: number; count: number }[]; series: DayRow[] };
type OccupancyData = { days: { date: string; sold: number; available: number; occupancy: number }[]; soldRoomNights: number; availableRoomNights: number; occupancy: number };
type RoomRow = { roomTypeId: string; name: string; bookings: number; roomNights: number; revenue: number; adr: number; revpar: number; occupancy: number };
type CancelItem = { id: string; reference: string; status: string; cancelledBy: string | null; cancellationReason: string | null; cancellationPenalty: number; grandTotal: number; cancelledAt: string | null; refundStatus: string; guestFirstName: string; guestLastName: string };
type CancelData = { created: number; cancelled: number; cancellationRate: number; lostValue: number; penaltiesRetained: number; byWho: Record<string, number>; items: CancelItem[] };
type PromoData = {
  coupons: { id: string; code: string; usedCount: number; usageLimit: number | null; isActive: boolean; redemptionsInRange: number; discountGiven: number }[];
  offers: { id: string; title: string; bookings: number; bookedValue: number; discountGiven: number }[];
};
type Bucket = Record<string, { bookings: number; value: number }>;
type SourceData = { bySource: Bucket; byUtm: Bucket };

const REPORTS = [
  { key: 'bookings', label: 'Bookings', financial: false, description: 'Reservations created per day, booked value and payments collected.' },
  { key: 'revenue', label: 'Revenue', financial: true, description: 'Payments captured, refunds processed and net revenue.' },
  { key: 'occupancy', label: 'Occupancy', financial: false, description: 'Room-nights sold against sellable inventory for stays in the period.' },
  { key: 'rooms', label: 'Room performance', financial: true, description: 'Per room type: room-nights, net room revenue, ADR, RevPAR and occupancy.' },
  { key: 'cancellations', label: 'Cancellations', financial: false, description: 'Cancelled, rejected and no-show reservations in the period.' },
  { key: 'promotions', label: 'Promotions', financial: true, description: 'Coupon redemptions and offer performance.' },
  { key: 'sources', label: 'Sources', financial: false, description: 'Where reservations came from: channel and UTM source.' },
] as const;
type ReportKey = (typeof REPORTS)[number]['key'];

// Restrained palette: ink, gold, sage and soft neutrals.
const C = { ink: '#27272a', gold: '#d97706', sage: '#059669', mist: '#a1a1aa', goldSoft: '#fcd34d', sageSoft: '#6ee7b7', grid: '#e4e4e7' };
const PIE = [C.ink, C.gold, C.sage, C.mist, C.goldSoft, C.sageSoft, '#52525b', '#b45309'];

const compactMoney = (paise: number) => {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (Math.abs(r) >= 1e3) return `₹${(r / 1e3).toFixed(0)}k`;
  return `₹${r.toFixed(0)}`;
};
const tickDate = (d: string) => (d ? dateShort(d) : '');
const fullDate = (d: string) => `${dateShort(d)} ${d.slice(0, 4)}`;
const axis = { fontSize: 11, fill: '#71717a' };
const tooltipStyle = { contentStyle: { borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12, boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)' }, labelStyle: { color: '#18181b', fontWeight: 600 } };

function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  return s.toString();
}

/** Chart wrapper with an accessible title and text summary for screen readers. */
function ChartFrame({ title, summary, height = 280, children }: { title: string; summary: string; height?: number; children: ReactElement }) {
  return (
    <figure className="break-inside-avoid">
      <figcaption className="mb-3 text-sm font-semibold text-zinc-900">{title}<span className="sr-only">. {summary}</span></figcaption>
      <div style={{ height }} className="w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </figure>
  );
}

function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  if (empty) return <Empty title="No data for this period" body="Try a wider date range." />;
  return (
    <div className="overflow-x-auto">
      <table className="admin-table">
        <thead><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { can } = useAuth();
  const financial = can('reports.financial');
  const tabs = REPORTS.filter((r) => financial || !r.financial);
  const [params, setParams] = useSearchParams();
  const requested = params.get('report');
  const active = tabs.find((t) => t.key === requested) ?? tabs[0];
  const [range, setRange] = useState<{ preset: string; from?: string; to?: string }>({ preset: 'month' });
  const rq = rangeQuery(range);
  const customIncomplete = range.preset === 'custom' && (!range.from || !range.to || range.from > range.to);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'reports', active.key, rq],
    queryFn: () => get<{ range: Range; data: unknown }>(`/admin/reports/${active.key}`, rq),
    enabled: !customIncomplete,
  });

  const csvHref = `/api/admin/reports/${active.key}?${qs({ ...rq, format: 'csv' })}`;

  return (
    <div className="print-area">
      {/* Hide the admin chrome when printing a report. */}
      <style media="print">{`aside, .lg\\:pl-60 > header { display: none !important; } .lg\\:pl-60 { padding-left: 0 !important; } main { max-width: none !important; padding: 0 !important; } .admin-card { break-inside: avoid; box-shadow: none !important; }`}</style>
      <PageHeader
        title="Reports"
        description="Operational and financial reporting for the Rambagh Palace concept."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <a className={cn('admin-btn-secondary', customIncomplete && 'pointer-events-none opacity-50')} href={csvHref} download aria-disabled={customIncomplete || undefined}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
            <button className="admin-btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
          </div>
        }
      />

      <div className="no-print mb-4 flex flex-col gap-3">
        <div className="-mx-1 overflow-x-auto">
          <div role="tablist" aria-label="Reports" className="inline-flex min-w-full gap-1 border-b border-zinc-200 px-1">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={t.key === active.key}
                onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('report', t.key); return n; }, { replace: true })}
                className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', t.key === active.key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeFilter value={range} onChange={setRange} />
          {isFetching && !isLoading && <span className="text-xs text-zinc-400" aria-live="polite">Updating…</span>}
        </div>
        {!financial && <p className="text-xs text-zinc-500">Revenue, room performance and promotion reports require financial reporting access.</p>}
      </div>

      <div className="mb-5">
        <h2 className="text-lg font-semibold text-zinc-900">{active.label} report</h2>
        <p className="text-sm text-zinc-500">
          {active.description}
          {data?.range && <> · <span className="tabular-nums">{fullDate(data.range.from)} – {fullDate(data.range.to)}</span></>}
        </p>
      </div>

      {customIncomplete ? (
        <Card><Empty title="Choose a date range" body="Pick a start and end date (start on or before end) to run this report." /></Card>
      ) : isLoading ? <Card><Loading /></Card> : error ? <ErrorBox error={error} onRetry={() => refetch()} /> : data ? (
        <ReportBody name={active.key} data={data.data} financial={financial} />
      ) : null}
    </div>
  );
}

function ReportBody({ name, data, financial }: { name: ReportKey; data: unknown; financial: boolean }) {
  switch (name) {
    case 'bookings': return <BookingsReport rows={data as DayRow[]} fin={financial} />;
    case 'revenue': return <RevenueReport d={data as RevenueData} />;
    case 'occupancy': return <OccupancyReport d={data as OccupancyData} />;
    case 'rooms': return <RoomsReport rows={data as RoomRow[]} />;
    case 'cancellations': return <CancellationsReport d={data as CancelData} fin={financial} />;
    case 'promotions': return <PromotionsReport d={data as PromoData} />;
    case 'sources': return <SourcesReport d={data as SourceData} fin={financial} />;
  }
}

// ─── Bookings ────────────────────────────────────────────────────────────────
function BookingsReport({ rows, fin }: { rows: DayRow[]; fin: boolean }) {
  const totals = rows.reduce((a, r) => ({ bookings: a.bookings + r.bookings, bookedValue: a.bookedValue + r.bookedValue, revenue: a.revenue + r.revenue }), { bookings: 0, bookedValue: 0, revenue: 0 });
  const busiest = rows.reduce<DayRow | null>((b, r) => (!b || r.bookings > b.bookings ? r : b), null);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bookings created" value={totals.bookings} />
        <Stat label="Avg per day" value={rows.length ? (totals.bookings / rows.length).toFixed(1) : '0'} />
        {fin ? (
          <>
            <Stat label="Booked value" value={money(totals.bookedValue)} />
            <Stat label="Payments collected" value={money(totals.revenue)} tone="good" />
          </>
        ) : (
          <Stat label="Busiest day" value={busiest?.bookings ? dateShort(busiest.date) : '—'} hint={busiest?.bookings ? `${busiest.bookings} bookings` : undefined} />
        )}
      </div>
      <Card>
        <ChartFrame title="Bookings per day" summary={`${totals.bookings} bookings across ${rows.length} days.`}>
          <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={tickDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis yAxisId="n" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={32} />
            {fin && <YAxis yAxisId="m" orientation="right" tickFormatter={compactMoney} tick={axis} tickLine={false} axisLine={false} width={56} />}
            <Tooltip {...tooltipStyle} labelFormatter={(l) => fullDate(String(l))} formatter={(v, n) => (n === 'Bookings' ? [String(v), n] : [money(Number(v)), n])} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="n" dataKey="bookings" name="Bookings" fill={C.ink} radius={[3, 3, 0, 0]} maxBarSize={28} />
            {fin && <Line yAxisId="m" type="monotone" dataKey="revenue" name="Collected" stroke={C.gold} strokeWidth={2} dot={false} />}
          </ComposedChart>
        </ChartFrame>
      </Card>
      <Card title="Daily breakdown" bodyClassName="p-0">
        <Table empty={!rows.length} head={<><th>Date</th><th className="text-right">Bookings</th>{fin && <><th className="text-right">Booked value</th><th className="text-right">Collected</th></>}</>}>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>{fullDate(r.date)}</td>
              <td className="text-right tabular-nums">{r.bookings}</td>
              {fin && <><td className="text-right tabular-nums">{money(r.bookedValue)}</td><td className="text-right tabular-nums">{money(r.revenue)}</td></>}
            </tr>
          ))}
          <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{totals.bookings}</td>{fin && <><td className="text-right tabular-nums">{money(totals.bookedValue)}</td><td className="text-right tabular-nums">{money(totals.revenue)}</td></>}</tr>
        </Table>
      </Card>
    </div>
  );
}

// ─── Revenue ─────────────────────────────────────────────────────────────────
function RevenueReport({ d }: { d: RevenueData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gross collected" value={money(d.gross)} hint={`${d.byProvider.reduce((s, p) => s + p.count, 0)} payments`} />
        <Stat label="Refunds" value={money(d.refunds)} hint={`${d.refundCount} processed`} tone={d.refunds ? 'warn' : 'default'} />
        <Stat label="Net revenue" value={money(d.net)} tone="good" />
        <Stat label="Avg collected per day" value={money(d.series.length ? Math.round(d.gross / d.series.length) : 0)} />
      </div>
      <Card>
        <ChartFrame title="Payments collected vs booked value" summary={`Gross ${money(d.gross)}, refunds ${money(d.refunds)}, net ${money(d.net)}.`}>
          <AreaChart data={d.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.gold} stopOpacity={0.3} /><stop offset="100%" stopColor={C.gold} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={tickDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={compactMoney} tick={axis} tickLine={false} axisLine={false} width={56} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => fullDate(String(l))} formatter={(v, n) => [money(Number(v)), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="revenue" name="Collected" stroke={C.gold} strokeWidth={2} fill="url(#rev-fill)" />
            <Area type="monotone" dataKey="bookedValue" name="Booked value" stroke={C.ink} strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
          </AreaChart>
        </ChartFrame>
      </Card>
      <Card title="By payment provider" bodyClassName="p-0">
        <Table empty={!d.byProvider.length} head={<><th>Provider</th><th className="text-right">Payments</th><th className="text-right">Amount</th><th className="text-right">Share</th></>}>
          {d.byProvider.map((p) => (
            <tr key={p.provider}>
              <td>{p.provider === 'SANDBOX' ? <span className="flex items-center gap-2">Sandbox <Badge color="amber">Test</Badge></span> : titleCase(p.provider)}</td>
              <td className="text-right tabular-nums">{p.count}</td>
              <td className="text-right tabular-nums">{money(p.amount)}</td>
              <td className="text-right tabular-nums">{d.gross ? `${Math.round((p.amount / d.gross) * 1000) / 10}%` : '—'}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ─── Occupancy ───────────────────────────────────────────────────────────────
function OccupancyReport({ d }: { d: OccupancyData }) {
  const peak = d.days.reduce<OccupancyData['days'][number] | null>((b, r) => (!b || r.occupancy > b.occupancy ? r : b), null);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Occupancy" value={`${d.occupancy}%`} tone={d.occupancy >= 70 ? 'good' : 'default'} />
        <Stat label="Room-nights sold" value={d.soldRoomNights.toLocaleString('en-IN')} />
        <Stat label="Room-nights available" value={d.availableRoomNights.toLocaleString('en-IN')} />
        <Stat label="Peak night" value={peak ? `${peak.occupancy}%` : '—'} hint={peak ? fullDate(peak.date) : undefined} />
      </div>
      <Card>
        <ChartFrame title="Nightly occupancy" summary={`Average occupancy ${d.occupancy}% over ${d.days.length} nights.`}>
          <LineChart data={d.days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={tickDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axis} tickLine={false} axisLine={false} width={40} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => fullDate(String(l))} formatter={(v, n) => [`${v}%`, n]} />
            <Line type="monotone" dataKey="occupancy" name="Occupancy" stroke={C.sage} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      </Card>
      <Card title="Nightly detail" bodyClassName="p-0">
        <Table empty={!d.days.length} head={<><th>Night of</th><th className="text-right">Sold</th><th className="text-right">Sellable</th><th className="text-right">Occupancy</th></>}>
          {d.days.map((r) => (
            <tr key={r.date}><td>{fullDate(r.date)}</td><td className="text-right tabular-nums">{r.sold}</td><td className="text-right tabular-nums">{r.available}</td><td className="text-right tabular-nums">{r.occupancy}%</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ─── Room performance ────────────────────────────────────────────────────────
function RoomsReport({ rows }: { rows: RoomRow[] }) {
  const total = rows.reduce((a, r) => ({ bookings: a.bookings + r.bookings, roomNights: a.roomNights + r.roomNights, revenue: a.revenue + r.revenue }), { bookings: 0, roomNights: 0, revenue: 0 });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Room revenue (excl. tax)" value={money(total.revenue)} />
        <Stat label="Room-nights sold" value={total.roomNights.toLocaleString('en-IN')} />
        <Stat label="Blended ADR" value={money(total.roomNights ? Math.round(total.revenue / total.roomNights) : 0)} />
      </div>
      <Card>
        <ChartFrame title="Revenue, ADR and RevPAR by room type" summary={rows.map((r) => `${r.name}: ${money(r.revenue)}`).join('; ') || 'No data.'}>
          <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={compactMoney} tick={axis} tickLine={false} axisLine={false} width={56} />
            <Tooltip {...tooltipStyle} formatter={(v, n) => [money(Number(v)), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenue" fill={C.ink} radius={[3, 3, 0, 0]} maxBarSize={40} />
            <Bar dataKey="adr" name="ADR" fill={C.gold} radius={[3, 3, 0, 0]} maxBarSize={40} />
            <Bar dataKey="revpar" name="RevPAR" fill={C.sage} radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartFrame>
      </Card>
      <Card title="By room type" bodyClassName="p-0">
        <Table empty={!rows.length} head={<><th>Room type</th><th className="text-right">Bookings</th><th className="text-right">Room-nights</th><th className="text-right">Revenue</th><th className="text-right">ADR</th><th className="text-right">RevPAR</th><th className="text-right">Occupancy</th></>}>
          {rows.map((r) => (
            <tr key={r.roomTypeId}>
              <td className="font-medium">{r.name}</td>
              <td className="text-right tabular-nums">{r.bookings}</td>
              <td className="text-right tabular-nums">{r.roomNights}</td>
              <td className="text-right tabular-nums">{money(r.revenue)}</td>
              <td className="text-right tabular-nums">{money(r.adr)}</td>
              <td className="text-right tabular-nums">{money(r.revpar)}</td>
              <td className="text-right tabular-nums">{r.occupancy}%</td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="text-xs text-zinc-500">ADR = room revenue ÷ room-nights sold. RevPAR = room revenue ÷ room-nights available. Revenue is pro-rated to nights within the period and excludes taxes.</p>
    </div>
  );
}

// ─── Cancellations ───────────────────────────────────────────────────────────
function CancellationsReport({ d, fin }: { d: CancelData; fin: boolean }) {
  const who = Object.entries(d.byWho);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cancelled" value={d.cancelled} hint={`of ${d.created} created`} />
        <Stat label="Cancellation rate" value={`${d.cancellationRate}%`} tone={d.cancellationRate > 15 ? 'warn' : 'default'} />
        <Stat label="Lost booking value" value={money(d.lostValue)} />
        <Stat label="Penalties retained" value={money(d.penaltiesRetained)} tone="good" />
      </div>
      {who.length > 0 && (
        <Card title="Cancelled by">
          <div className="flex flex-wrap gap-3">
            {who.map(([k, n]) => (
              <div key={k} className="rounded-lg border border-zinc-200 px-4 py-2.5">
                <p className="text-xs text-zinc-500">{titleCase(k)}</p>
                <p className="text-lg font-semibold tabular-nums">{n}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Cancelled reservations" bodyClassName="p-0">
        <Table empty={!d.items.length} head={<><th>Reference</th><th>Guest</th><th>Status</th><th>By</th><th>Reason</th><th>When</th><th className="text-right">Value</th>{fin && <th className="text-right">Penalty</th>}<th>Refund</th></>}>
          {d.items.map((b) => (
            <tr key={b.id}>
              <td><Link className="font-mono text-xs font-medium text-zinc-900 underline-offset-2 hover:underline" to={`/admin/bookings/${b.id}`}>{b.reference}</Link></td>
              <td className="whitespace-nowrap">{b.guestFirstName} {b.guestLastName}</td>
              <td><StatusBadge status={b.status} /></td>
              <td className="text-xs">{b.cancelledBy ? titleCase(b.cancelledBy) : '—'}</td>
              <td className="max-w-[240px] truncate text-xs text-zinc-600" title={b.cancellationReason ?? ''}>{b.cancellationReason || '—'}</td>
              <td className="whitespace-nowrap text-xs">{b.cancelledAt ? dateTime(b.cancelledAt) : '—'}</td>
              <td className="text-right tabular-nums">{money(b.grandTotal)}</td>
              {fin && <td className="text-right tabular-nums">{money(b.cancellationPenalty)}</td>}
              <td><StatusBadge status={b.refundStatus} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ─── Promotions ──────────────────────────────────────────────────────────────
function PromotionsReport({ d }: { d: PromoData }) {
  const coupons = [...d.coupons].sort((a, b) => b.redemptionsInRange - a.redemptionsInRange || b.usedCount - a.usedCount);
  const offers = [...d.offers].sort((a, b) => b.bookings - a.bookings);
  const discount = coupons.reduce((s, c) => s + c.discountGiven, 0) + offers.reduce((s, o) => s + o.discountGiven, 0);
  const offerValue = offers.reduce((s, o) => s + o.bookedValue, 0);
  const charted = offers.filter((o) => o.bookings);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Coupon redemptions" value={coupons.reduce((s, c) => s + c.redemptionsInRange, 0)} />
        <Stat label="Offer bookings" value={offers.reduce((s, o) => s + o.bookings, 0)} hint={`${money(offerValue)} booked`} />
        <Stat label="Total discount given" value={money(discount)} tone="warn" />
      </div>
      {charted.length > 0 && (
        <Card>
          <ChartFrame title="Offer performance" summary={charted.map((o) => `${o.title}: ${o.bookings} bookings, ${money(o.bookedValue)}`).join('; ')} height={Math.max(160, charted.length * 44)}>
            <BarChart data={charted} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={compactMoney} tick={axis} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="title" tick={axis} tickLine={false} axisLine={false} width={150} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [money(Number(v)), n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="bookedValue" name="Booked value" fill={C.ink} radius={[0, 3, 3, 0]} maxBarSize={16} />
              <Bar dataKey="discountGiven" name="Discount" fill={C.gold} radius={[0, 3, 3, 0]} maxBarSize={16} />
            </BarChart>
          </ChartFrame>
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Coupons" bodyClassName="p-0">
          <Table empty={!coupons.length} head={<><th>Code</th><th>Status</th><th className="text-right">In period</th><th className="text-right">Lifetime use</th><th className="text-right">Discount</th></>}>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs font-medium">{c.code}</td>
                <td>{c.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="text-right tabular-nums">{c.redemptionsInRange}</td>
                <td className="text-right tabular-nums">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td className="text-right tabular-nums">{money(c.discountGiven)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Offers & packages" bodyClassName="p-0">
          <Table empty={!offers.length} head={<><th>Offer</th><th className="text-right">Bookings</th><th className="text-right">Booked value</th><th className="text-right">Discount</th></>}>
            {offers.map((o) => (
              <tr key={o.id}>
                <td className="font-medium">{o.title}</td>
                <td className="text-right tabular-nums">{o.bookings}</td>
                <td className="text-right tabular-nums">{money(o.bookedValue)}</td>
                <td className="text-right tabular-nums">{money(o.discountGiven)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}

// ─── Sources ─────────────────────────────────────────────────────────────────
const toRows = (b: Bucket) => Object.entries(b).map(([name, v]) => ({ name, label: titleCase(name), ...v })).sort((a, z) => z.bookings - a.bookings);

function SourcesReport({ d, fin }: { d: SourceData; fin: boolean }) {
  const sources = useMemo(() => toRows(d.bySource), [d]);
  const utm = useMemo(() => toRows(d.byUtm), [d]);
  const total = sources.reduce((s, r) => s + r.bookings, 0);
  if (!total) return <Card><Empty title="No reservations in this period" body="Try a wider date range." /></Card>;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <ChartFrame title="Bookings by channel" summary={sources.map((s) => `${s.label}: ${s.bookings}`).join('; ')}>
            <PieChart>
              <Pie data={sources} dataKey="bookings" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff">
                {sources.map((s, i) => <Cell key={s.name} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} (${Math.round((Number(v) / total) * 100)}%)`, n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ChartFrame>
        </Card>
        <Card>
          <ChartFrame title="Bookings by UTM source" summary={utm.map((s) => `${s.name}: ${s.bookings}`).join('; ')}>
            <BarChart data={utm.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={110} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="bookings" name="Bookings" fill={C.sage} radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[{ t: 'Channels', rows: sources }, { t: 'UTM sources', rows: utm }].map(({ t, rows }) => (
          <Card key={t} title={t} bodyClassName="p-0">
            <Table head={<><th>{t === 'Channels' ? 'Channel' : 'utm_source'}</th><th className="text-right">Bookings</th><th className="text-right">Share</th>{fin && <th className="text-right">Value</th>}</>}>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{t === 'Channels' ? r.label : <span className="font-mono text-xs">{r.name}</span>}</td>
                  <td className="text-right tabular-nums">{r.bookings}</td>
                  <td className="text-right tabular-nums">{Math.round((r.bookings / total) * 1000) / 10}%</td>
                  {fin && <td className="text-right tabular-nums">{money(r.value)}</td>}
                </tr>
              ))}
            </Table>
          </Card>
        ))}
      </div>
    </div>
  );
}
