import * as Popover from '@radix-ui/react-popover';
import { Minus, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSite } from '@/app/SiteProvider';

export interface Guests { adults: number; children: number; rooms: number }

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition hover:border-fg disabled:opacity-30" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-5 text-center font-display text-xl" aria-live="polite">{value}</span>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition hover:border-fg disabled:opacity-30" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export function GuestPicker({ value, onChange, dark, className }: { value: Guests; onChange: (g: Guests) => void; dark?: boolean; className?: string }) {
  const { booking } = useSite();
  const summary = `${value.adults} adult${value.adults > 1 ? 's' : ''}${value.children ? `, ${value.children} child${value.children > 1 ? 'ren' : ''}` : ''} · ${value.rooms} room${value.rooms > 1 ? 's' : ''}`;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={cn('flex w-full items-center gap-3 text-left', className)} aria-label={`Guests: ${summary}. Change`}>
          <Users className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.2} />
          <span>
            <span className={cn('block text-[0.62rem] uppercase tracking-[0.2em]', dark ? 'text-white/60' : 'text-muted')}>Guests</span>
            <span className="font-display text-xl">{summary}</span>
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={14} align="start" className="z-[70] w-[min(92vw,340px)] border border-line bg-canvas px-6 py-3 text-fg shadow-2xl" style={{ borderRadius: 'var(--radius)' }}>
          <div className="divide-y divide-line">
            <Stepper label="Adults" hint="Ages 12+" value={value.adults} min={1} max={value.rooms * 6} onChange={(adults) => onChange({ ...value, adults })} />
            <Stepper label="Children" hint={`Ages 0–${booking.childMaxAge}`} value={value.children} min={0} max={value.rooms * 3} onChange={(children) => onChange({ ...value, children })} />
            <Stepper label="Rooms" value={value.rooms} min={1} max={booking.maxRoomsPerBooking} onChange={(rooms) => onChange({ ...value, rooms, adults: Math.max(value.adults, rooms) })} />
          </div>
          <Popover.Close className="btn btn-dark btn-sm my-3 w-full">Done</Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
