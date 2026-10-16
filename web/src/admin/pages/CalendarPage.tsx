import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, diffDays, isValidISODate, todayInZone } from '@aurelle/shared';
import { get } from '@/lib/api';
import { dateLong, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Card, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';

interface Stay { bookingId: string; reference: string; guest: string; status: string; checkIn: string; checkOut: string }
interface Block { id: string; startDate: string; endDate: string; reason: string }
interface TapeRoom { id: string; number: string; status: string; housekeeping: string; roomType: { id: string; name: string }; stays: Stay[]; blocks: Block[] }
interface TapeChart { from: string; days: number; rooms: TapeRoom[] }

const DAYS = 14;
const COL = 64; // px per night
const LABEL = 168; // px for the room column

const STAY_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-500 text-white hover:bg-emerald-600',
  CHECKED_IN: 'bg-sky-600 text-white hover:bg-sky-700',
  PENDING: 'bg-amber-400 text-amber-950 hover:bg-amber-500',
  PENDING_PAYMENT: 'bg-amber-400 text-amber-950 hover:bg-amber-500',
  CHECKED_OUT: 'bg-zinc-300 text-zinc-700 hover:bg-zinc-400',
};
const STATUS_LABEL: Record<string, string> = { CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked in', PENDING: 'Pending', PENDING_PAYMENT: 'Pending payment', CHECKED_OUT: 'Checked out' };
const HK_DOT: Record<string, string> = { CLEAN: 'bg-emerald-500', DIRTY: 'bg-amber-500', INSPECTED: 'bg-sky-500' };
const STRIPES: CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, rgb(161 161 170 / 0.55) 0 5px, rgb(228 228 231) 5px 10px)' };

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const monthShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const isWeekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 5 || d === 6; };

/** Clamp a [start, end) date range to the visible window and return column offsets. */
function span(from: string, start: string, end: string) {
  const s = Math.max(0, diffDays(from, start));
  const e = Math.min(DAYS, diffDays(from, end));
  return e > s ? { s, e, cutLeft: start < from, cutRight: diffDays(from, end) > DAYS } : null;
}

export default function CalendarPage() {
  const { can } = useAuth();
  const today = todayInZone('Asia/Kolkata');
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from');
  const [from, setFromState] = useState(fromParam && isValidISODate(fromParam) ? fromParam : addDays(today, -1));
  const setFrom = (d: string) => {
    if (!isValidISODate(d)) return;
    setFromState(d);
    const p = new URLSearchParams(params);
    p.set('from', d);
    setParams(p, { replace: true });
  };

  const q = useQuery({ queryKey: ['admin', 'tape-chart', from, DAYS], queryFn: () => get<TapeChart>('/admin/tape-chart', { from, days: DAYS }) });
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(from, i)), [from]);
  const todayIdx = diffDays(from, today);

  const groups = useMemo(() => {
    const out: { id: string; name: string; rooms: TapeRoom[] }[] = [];
    for (const r of q.data?.rooms ?? []) {
      let g = out.find((x) => x.id === r.roomType.id);
      if (!g) { g = { id: r.roomType.id, name: r.roomType.name, rooms: [] }; out.push(g); }
      g.rooms.push(r);
    }
    return out;
  }, [q.data]);

  const stats = useMemo(() => {
    const rooms = q.data?.rooms ?? [];
    const inHouse = rooms.filter((r) => r.stays.some((s) => s.checkIn <= today && s.checkOut > today && s.status !== 'CHECKED_OUT')).length;
    const arrivals = rooms.reduce((n, r) => n + r.stays.filter((s) => s.checkIn === today).length, 0);
    const departures = rooms.reduce((n, r) => n + r.stays.filter((s) => s.checkOut === today).length, 0);
    return { total: rooms.length, inHouse, arrivals, departures };
  }, [q.data, today]);

  const gridWidth = LABEL + DAYS * COL;
  const showStats = todayIdx >= 0 && todayIdx < DAYS;

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Room-by-room tape chart of stays and maintenance blocks."
        actions={can('bookings.manage') && <Link to="/admin/bookings/new" className="admin-btn-primary"><Plus className="h-4 w-4" /> New booking</Link>}
      />

      <Card bodyClassName="p-0"
        title={<span className="tabular-nums">{dateShort(from)} – {dateShort(addDays(from, DAYS - 1))} {from.slice(0, 4)}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <button className="admin-btn-secondary !px-2 !py-1" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <button className="admin-btn-secondary !py-1 text-xs" onClick={() => setFrom(addDays(today, -1))}>Today</button>
            <button className="admin-btn-secondary !px-2 !py-1" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
            <input type="date" className="admin-input w-auto py-1 text-xs" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Start date" />
          </div>
        }>
        {showStats && q.data && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-zinc-100 px-5 py-2.5 text-xs text-zinc-500">
            <span><strong className="font-semibold text-zinc-900">{stats.inHouse}</strong> / {stats.total} rooms occupied tonight</span>
            <span><strong className="font-semibold text-zinc-900">{stats.arrivals}</strong> arrivals today</span>
            <span><strong className="font-semibold text-zinc-900">{stats.departures}</strong> departures today</span>
          </div>
        )}

        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div> : !groups.length ? (
          <Empty title="No rooms to show" body="Add physical rooms under Rooms → Inventory to use the tape chart." action={<Link to="/admin/rooms/inventory" className="admin-btn-secondary">Open inventory</Link>} />
        ) : (
          <div className="max-w-full overflow-x-auto" role="region" aria-label="Tape chart" tabIndex={0}>
            <div style={{ width: gridWidth, minWidth: '100%' }} className="relative text-xs">
              {/* Date header */}
              <div className="sticky top-0 z-20 flex border-b border-zinc-200 bg-zinc-50">
                <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-zinc-200 bg-zinc-50 px-3 py-2 font-medium uppercase tracking-wide text-zinc-500" style={{ width: LABEL }}>Room</div>
                {dates.map((d, i) => (
                  <div key={d} className={cn('shrink-0 border-r border-zinc-100 py-1.5 text-center', i === todayIdx ? 'bg-sky-100 text-sky-800' : isWeekend(d) ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-500')} style={{ width: COL }} title={dateLong(d)}>
                    <span className="block text-[10px] uppercase">{weekday(d)}</span>
                    <span className="block text-sm font-semibold tabular-nums">{Number(d.slice(8))}</span>
                    {(i === 0 || d.endsWith('-01')) && <span className="block text-[10px]">{monthShort(d)}</span>}
                  </div>
                ))}
              </div>

              {groups.map((g) => (
                <div key={g.id}>
                  <div className="flex border-b border-zinc-200 bg-zinc-50/80">
                    <div className="sticky left-0 z-10 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600" style={{ width: LABEL }}>{g.name}</div>
                  </div>
                  {g.rooms.map((r) => (
                    <div key={r.id} className="relative flex h-11 border-b border-zinc-100">
                      <div className={cn('sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-zinc-200 bg-white px-3', r.status === 'OUT_OF_SERVICE' && 'bg-red-50')} style={{ width: LABEL }}>
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', HK_DOT[r.housekeeping] ?? 'bg-zinc-300')} title={`Housekeeping: ${r.housekeeping.toLowerCase()}`} aria-label={`Housekeeping ${r.housekeeping.toLowerCase()}`} role="img" />
                        <span className="font-semibold text-zinc-900">{r.number}</span>
                        {r.status === 'OUT_OF_SERVICE' && <span className="truncate text-[10px] font-medium uppercase text-red-600">Out of service</span>}
                      </div>
                      {/* Day cells */}
                      {dates.map((d, i) => (
                        <div key={d} className={cn('shrink-0 border-r border-zinc-100', i === todayIdx ? 'bg-sky-50' : isWeekend(d) && 'bg-zinc-50/70')} style={{ width: COL }} />
                      ))}
                      {/* Blocks */}
                      {r.blocks.map((b) => {
                        const sp = span(from, b.startDate, b.endDate);
                        if (!sp) return null;
                        return (
                          <div key={b.id} className={cn('absolute top-1.5 bottom-1.5 flex items-center overflow-hidden px-2 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300', sp.cutLeft ? 'rounded-l-none' : 'rounded-l-md', sp.cutRight ? 'rounded-r-none' : 'rounded-r-md')}
                            style={{ ...STRIPES, left: LABEL + sp.s * COL + (sp.cutLeft ? 0 : 3), width: (sp.e - sp.s) * COL - (sp.cutLeft ? 0 : 3) - (sp.cutRight ? 0 : 3) }}
                            title={`Blocked ${dateShort(b.startDate)} → ${dateShort(b.endDate)}${b.reason ? `: ${b.reason}` : ''}`}>
                            <span className="truncate rounded bg-white/80 px-1">{b.reason || 'Blocked'}</span>
                          </div>
                        );
                      })}
                      {/* Stays */}
                      {r.stays.map((s) => {
                        const sp = span(from, s.checkIn, s.checkOut);
                        if (!sp) return null;
                        const nights = diffDays(s.checkIn, s.checkOut);
                        return (
                          <Link key={`${s.bookingId}-${s.checkIn}`} to={`/admin/bookings/${s.bookingId}`}
                            className={cn('absolute top-1.5 bottom-1.5 z-[5] flex items-center gap-1 overflow-hidden px-2 text-[11px] font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1',
                              STAY_STYLE[s.status] ?? 'bg-zinc-400 text-white', sp.cutLeft ? 'rounded-l-none' : 'rounded-l-md', sp.cutRight ? 'rounded-r-none' : 'rounded-r-md')}
                            style={{ left: LABEL + sp.s * COL + (sp.cutLeft ? 0 : 3), width: (sp.e - sp.s) * COL - (sp.cutLeft ? 0 : 3) - (sp.cutRight ? 0 : 3) }}
                            title={`${s.guest} · ${s.reference}\n${dateShort(s.checkIn)} → ${dateShort(s.checkOut)} (${nights} night${nights === 1 ? '' : 's'})\n${STATUS_LABEL[s.status] ?? s.status}`}
                            aria-label={`${s.guest}, ${s.reference}, ${dateShort(s.checkIn)} to ${dateShort(s.checkOut)}, ${STATUS_LABEL[s.status] ?? s.status}`}>
                            <span className="truncate">{s.guest}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-600">
          {(['CONFIRMED', 'CHECKED_IN', 'PENDING', 'CHECKED_OUT'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('h-3 w-5 rounded-sm', STAY_STYLE[s].split(' ')[0])} />{s === 'PENDING' ? 'Pending / awaiting payment' : STATUS_LABEL[s]}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm ring-1 ring-inset ring-zinc-300" style={STRIPES} />Maintenance block</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-sky-100" />Today</span>
          <span className="mx-1 hidden h-4 w-px bg-zinc-200 sm:block" />
          {Object.entries(HK_DOT).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', c)} />{k[0] + k.slice(1).toLowerCase()}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
