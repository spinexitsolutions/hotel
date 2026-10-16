import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { addDays } from '@aurelle/shared';
import { Search } from 'lucide-react';
import { useSite } from '@/app/SiteProvider';
import { cn } from '@/lib/cn';
import { DateRangePicker } from './DateRangePicker';
import { GuestPicker, type Guests } from './GuestPicker';

/** Availability search used in the hero and on inner pages. */
export function BookingBar({ variant = 'glass', className }: { variant?: 'glass' | 'solid'; className?: string }) {
  const { today } = useSite();
  const nav = useNavigate();
  const [ci, setCi] = useState(addDays(today, 14));
  const [co, setCo] = useState(addDays(today, 16));
  const [g, setG] = useState<Guests>({ adults: 2, children: 0, rooms: 1 });
  const dark = variant === 'glass';
  return (
    <motion.form
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={(e) => { e.preventDefault(); nav(`/book?checkIn=${ci}&checkOut=${co}&adults=${g.adults}&children=${g.children}&rooms=${g.rooms}`); }}
      className={cn('grid w-full grid-cols-1 items-stretch md:grid-cols-[1.3fr_1fr_auto]', dark ? 'border border-white/25 bg-black/30 text-white backdrop-blur-md' : 'border border-line bg-canvas text-fg shadow-xl', className)}
      style={{ borderRadius: 'var(--radius)' }}
      aria-label="Check availability"
    >
      <div className={cn('px-6 py-4', dark ? 'border-b border-white/20 md:border-b-0 md:border-r' : 'border-b border-line md:border-b-0 md:border-r')}>
        <DateRangePicker checkIn={ci} checkOut={co} onChange={(a, b) => { setCi(a); setCo(b); }} dark={dark} />
      </div>
      <div className={cn('px-6 py-4', dark ? 'border-b border-white/20 md:border-b-0 md:border-r' : 'border-b border-line md:border-b-0 md:border-r')}>
        <GuestPicker value={g} onChange={setG} dark={dark} />
      </div>
      <button type="submit" className="btn btn-primary m-2 min-h-[56px] gap-3 md:m-0 md:h-full md:px-10" style={{ borderRadius: 'var(--radius)' }}>
        <Search className="h-4 w-4" /> Check availability
      </button>
    </motion.form>
  );
}
