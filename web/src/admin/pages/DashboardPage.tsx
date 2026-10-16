import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BedDouble, CalendarCheck, CalendarX, CircleDollarSign, Clock, Inbox, LogIn, LogOut, Percent, Plus, Star, Users } from 'lucide-react';
import { get } from '@/lib/api';
import { dateShort, money, relTime } from '@/lib/format';
import { useAuth } from '@/app/AuthProvider';
import { Card, ErrorBox, Loading, PageHeader, RangeFilter, Stat, StatusBadge, rangeQuery } from '../components/ui';

interface Mini { id: string; reference: string; guestFirstName: string; guestLastName: string; status: string; roomsCount: number; roomType: { name: string } }
interface Dash {
  range: { from: string; to: string };
  financial: boolean;
  kpis: Record<string, number>;
  byStatus: Record<string, number>;
  series: { date: string; bookings: number; bookedValue: number; revenue: number }[];
  arrivals: Mini[];
  departures: Mini[];
  recentPayments: { id: string; amount: number; status: string; provider: string; isTest: boolean; createdAt: string; booking: { id: string; reference: string; guestFirstName: string; guestLastName: string } }[];
  recentActivity: { id: string; type: string; message: string; createdAt: string; booking: { id: string; reference: string; guestFirstName: string; guestLastName: string } }[];
}

const compact = (paise: number) => `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(paise / 100)}`;

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [range, setRange] = useState({ preset: 'month' } as { preset: string; from?: string; to?: string });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'dashboard', range], queryFn: () => get<Dash>('/admin/dashboard', rangeQuery(range)), refetchInterval: 60_000 });
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greeting}, ${user?.name.split(' ')[0]}`} description="Here is what is happening at the hotel." actions={<>
        <RangeFilter value={range} onChange={setRange} />
        {can('bookings.manage') && <Link to="/admin/bookings/new" className="admin-btn-primary"><Plus className="h-4 w-4" /> New reservation</Link>}
      </>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} onRetry={() => refetch()} /> : data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Arrivals today" value={data.kpis.checkInsToday} icon={<LogIn className="h-4 w-4" />} hint={`${data.kpis.inHouse} reservations in house`} />
            <Stat label="Departures today" value={data.kpis.checkOutsToday} icon={<LogOut className="h-4 w-4" />} />
            <Stat label="Occupancy tonight" value={`${data.kpis.occupancyTonight}%`} icon={<Percent className="h-4 w-4" />} tone={data.kpis.occupancyTonight > 70 ? 'good' : 'default'} hint={`${data.kpis.availableTonight} of ${data.kpis.totalRooms - data.kpis.outOfService} rooms available`} />
            {data.financial ? (
              <Stat label="Net revenue" value={money(data.kpis.netRevenue)} icon={<CircleDollarSign className="h-4 w-4" />} tone="good" hint={`${money(data.kpis.revenueCollected)} collected · ${money(data.kpis.refunded)} refunded`} />
            ) : (
              <Stat label="Out of service" value={data.kpis.outOfService} icon={<BedDouble className="h-4 w-4" />} />
            )}
            <Stat label="Bookings in period" value={data.kpis.totalBookings} icon={<CalendarCheck className="h-4 w-4" />} hint={`${data.kpis.confirmed} confirmed`} />
            <Stat label="Pending" value={data.kpis.pending} icon={<Clock className="h-4 w-4" />} tone={data.kpis.pending ? 'warn' : 'default'} hint="Awaiting payment or confirmation" />
            <Stat label="Cancelled" value={data.kpis.cancelled} icon={<CalendarX className="h-4 w-4" />} />
            <Stat label="Customers" value={data.kpis.customers} icon={<Users className="h-4 w-4" />} hint={`+${data.kpis.newCustomers} new in period`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={data.financial ? 'Revenue collected' : 'Bookings created'} className="lg:col-span-2">
              <div className="h-72" role="img" aria-label="Chart of activity over the selected period">
                <ResponsiveContainer width="100%" height="100%">
                  {data.financial ? (
                    <AreaChart data={data.series} margin={{ left: 0, right: 8, top: 8 }}>
                      <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b45309" stopOpacity={0.35} /><stop offset="100%" stopColor="#b45309" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="#f4f4f5" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={dateShort} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => dateShort(String(l))} />
                      <Area type="monotone" dataKey="revenue" name="Collected" stroke="#b45309" strokeWidth={2} fill="url(#rev)" />
                    </AreaChart>
                  ) : (
                    <BarChart data={data.series}>
                      <CartesianGrid stroke="#f4f4f5" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={dateShort} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip labelFormatter={(l) => dateShort(String(l))} />
                      <Bar dataKey="bookings" name="Bookings" fill="#27272a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Reservation status">
              <ul className="space-y-2.5">
                {Object.entries(data.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <li key={s} className="flex items-center justify-between text-sm"><StatusBadge status={s} /><span className="font-medium tabular-nums">{n}</span></li>
                ))}
                {!Object.keys(data.byStatus).length && <li className="text-sm text-zinc-500">No reservations in this period.</li>}
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
                <Link to="/admin/inquiries" className="rounded-lg bg-zinc-50 p-3 text-sm hover:bg-zinc-100"><Inbox className="mb-1 h-4 w-4 text-zinc-500" />{data.kpis.pendingInquiries} new inquiries</Link>
                <Link to="/admin/reviews" className="rounded-lg bg-zinc-50 p-3 text-sm hover:bg-zinc-100"><Star className="mb-1 h-4 w-4 text-zinc-500" />{data.kpis.pendingReviews} reviews to moderate</Link>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {[{ title: 'Arrivals today', rows: data.arrivals, empty: 'No arrivals today.' }, { title: 'Departures today', rows: data.departures, empty: 'No departures today.' }].map((block) => (
              <Card key={block.title} title={block.title} bodyClassName="p-0">
                {block.rows.length ? (
                  <ul className="divide-y divide-zinc-100">
                    {block.rows.map((b) => (
                      <li key={b.id}><Link to={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-50">
                        <div><p className="text-sm font-medium">{b.guestFirstName} {b.guestLastName}</p><p className="text-xs text-zinc-500">{b.reference} · {b.roomType.name}{b.roomsCount > 1 ? ` × ${b.roomsCount}` : ''}</p></div>
                        <StatusBadge status={b.status} />
                      </Link></li>
                    ))}
                  </ul>
                ) : <p className="px-5 py-8 text-center text-sm text-zinc-500">{block.empty}</p>}
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {data.financial && (
              <Card title="Recent transactions" actions={<Link to="/admin/reports" className="text-xs text-zinc-500 hover:text-zinc-900">Reports →</Link>} bodyClassName="p-0">
                <table className="admin-table">
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr key={p.id}>
                        <td><Link to={`/admin/bookings/${p.booking.id}`} className="font-medium hover:underline">{p.booking.reference}</Link><p className="text-xs text-zinc-500">{p.booking.guestFirstName} {p.booking.guestLastName}</p></td>
                        <td className="text-xs text-zinc-500">{p.provider.replace(/_/g, ' ')}{p.isTest && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">TEST</span>}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="text-right font-medium tabular-nums">{money(p.amount)}</td>
                      </tr>
                    ))}
                    {!data.recentPayments.length && <tr><td className="py-8 text-center text-zinc-500">No transactions yet.</td></tr>}
                  </tbody>
                </table>
              </Card>
            )}
            <Card title="Recent activity" bodyClassName="p-0" className={data.financial ? '' : 'lg:col-span-2'}>
              <ul className="divide-y divide-zinc-100">
                {data.recentActivity.map((e) => (
                  <li key={e.id} className="flex gap-3 px-5 py-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm"><Link to={`/admin/bookings/${e.booking.id}`} className="font-medium hover:underline">{e.booking.reference}</Link> · {e.message}</p>
                      <p className="text-xs text-zinc-500">{e.booking.guestFirstName} {e.booking.guestLastName} · {relTime(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
