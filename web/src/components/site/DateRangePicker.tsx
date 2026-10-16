import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker, type DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { addDays, diffDays } from '@aurelle/shared';
import { CalendarDays } from 'lucide-react';
import { get } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateShort, money } from '@/lib/format';
import { useSite } from '@/app/SiteProvider';

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

interface CalendarData { nights: { date: string; available: number; rate: number | null }[] }

/** Range date picker showing sold-out nights (and nightly rates when a room is chosen). */
export function DateRangePicker({ checkIn, checkOut, onChange, roomTypeId, className, dark, compact }: {
  checkIn: string; checkOut: string; onChange: (ci: string, co: string) => void; roomTypeId?: string; className?: string; dark?: boolean; compact?: boolean;
}) {
  const { today, booking } = useSite();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from: fromIso(checkIn), to: fromIso(checkOut) });
  const [month, setMonth] = useState(fromIso(checkIn));
  const from = toIso(new Date(month.getFullYear(), month.getMonth(), 1));
  const { data } = useQuery({
    queryKey: ['calendar', roomTypeId ?? 'all', from],
    queryFn: () => get<CalendarData>('/availability/calendar', { roomTypeId, from: from < today ? today : from, days: 70 }),
    enabled: open,
    staleTime: 60_000,
  });
  const soldOut = useMemo(() => (data?.nights ?? []).filter((n) => n.available <= 0).map((n) => fromIso(n.date)), [data]);
  const rates = useMemo(() => new Map((data?.nights ?? []).map((n) => [n.date, n.rate])), [data]);
  const nights = diffDays(checkIn, checkOut);

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setRange({ from: fromIso(checkIn), to: fromIso(checkOut) }); }}>
      <Popover.Trigger asChild>
        <button type="button" className={cn('flex w-full items-center gap-3 text-left', className)} aria-label={`Dates: ${dateShort(checkIn)} to ${dateShort(checkOut)}, ${nights} nights. Change dates`}>
          <CalendarDays className={cn('h-5 w-5 shrink-0', dark ? 'text-primary' : 'text-primary')} strokeWidth={1.2} />
          <span className="flex flex-1 items-center gap-4">
            <span>
              {!compact && <span className={cn('block text-[0.62rem] uppercase tracking-[0.2em]', dark ? 'text-white/60' : 'text-muted')}>Check-in</span>}
              <span className="font-display text-xl">{dateShort(checkIn)}</span>
            </span>
            <span className={cn('h-px w-6', dark ? 'bg-white/40' : 'bg-fg/30')} />
            <span>
              {!compact && <span className={cn('block text-[0.62rem] uppercase tracking-[0.2em]', dark ? 'text-white/60' : 'text-muted')}>Check-out</span>}
              <span className="font-display text-xl">{dateShort(checkOut)}</span>
            </span>
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={14} align="start" className="z-[70] max-w-[calc(100vw-1.5rem)] border border-line bg-canvas p-4 text-fg shadow-2xl sm:p-6" style={{ borderRadius: 'var(--radius)' }}>
          <DayPicker
            mode="range"
            numberOfMonths={typeof window !== 'undefined' && window.innerWidth > 720 ? 2 : 1}
            month={month}
            onMonthChange={setMonth}
            selected={range}
            min={1}
            onSelect={(r) => {
              setRange(r);
              if (r?.from && r?.to && toIso(r.from) !== toIso(r.to)) {
                onChange(toIso(r.from), toIso(r.to));
                setOpen(false);
              }
            }}
            disabled={[{ before: fromIso(today) }, { after: fromIso(addDays(today, booking.maxAdvanceDays)) }, ...soldOut]}
            excludeDisabled
            modifiers={{ soldOut }}
            classNames={{
              months: 'flex flex-col gap-8 sm:flex-row',
              month_caption: 'mb-3 flex h-9 items-center justify-center font-display text-lg',
              nav: 'absolute inset-x-4 top-4 flex justify-between sm:inset-x-6 sm:top-6',
              button_previous: 'flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface disabled:opacity-30',
              button_next: 'flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface disabled:opacity-30',
              weekday: 'w-11 pb-2 text-center text-[0.62rem] font-medium uppercase tracking-wider text-muted',
              day: 'p-0 text-center',
              day_button: 'flex h-11 w-11 flex-col items-center justify-center text-sm transition hover:bg-surface disabled:cursor-not-allowed disabled:text-muted/40 disabled:line-through disabled:hover:bg-transparent',
              selected: '!bg-ink !text-canvas',
              range_start: '!bg-ink !text-canvas',
              range_end: '!bg-ink !text-canvas',
              range_middle: '!bg-surface !text-fg',
              today: 'font-semibold text-primary',
              root: 'relative',
            }}
            components={{
              DayButton: ({ day, modifiers, ...props }) => {
                const iso = toIso(day.date);
                const rate = rates.get(iso);
                return (
                  <button {...props}>
                    <span>{day.date.getDate()}</span>
                    {roomTypeId && rate && !modifiers.disabled && <span className="text-[0.55rem] leading-none opacity-60">{Math.round(rate / 100_000)}k</span>}
                  </button>
                );
              },
            }}
          />
          <div className="mt-4 flex items-center justify-between gap-6 border-t border-line pt-4 text-xs text-muted">
            <span>{range?.from && !range.to ? 'Select your check-out date' : `${nights} night${nights === 1 ? '' : 's'}`}</span>
            <span className="flex items-center gap-2"><span className="inline-block h-2 w-4 bg-muted/30" /> Sold out{roomTypeId ? ` · nightly from ${money(Math.min(...Array.from(rates.values()).filter(Boolean).map(Number)) || null)}` : ''}</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
