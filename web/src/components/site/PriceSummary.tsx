import type { Quote } from '@aurelle/shared';
import { money, dateShort, plural } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Transparent breakdown: nightly room rates, extras, discounts, each tax and the total. */
export function PriceSummary({ quote, roomName, compact, depositPercent }: { quote: Quote; roomName?: string; compact?: boolean; depositPercent?: number }) {
  const rooms = quote.lines.filter((l) => l.kind === 'ROOM');
  const extras = quote.lines.filter((l) => ['EXTRA_ADULT', 'EXTRA_CHILD', 'EXTRA_BED', 'MEAL_PLAN', 'ADDON'].includes(l.kind));
  const discounts = quote.lines.filter((l) => l.kind === 'OFFER' || l.kind === 'COUPON');
  const charges = quote.lines.filter((l) => l.kind === 'TAX' || l.kind === 'FEE');
  const Row = ({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) => (
    <div className={cn('flex justify-between gap-4 py-1.5 text-sm', muted && 'text-muted', strong && 'font-medium')}><dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{value}</dd></div>
  );
  return (
    <div>
      {roomName && <p className="font-display text-2xl">{roomName}</p>}
      <p className="mt-1 text-sm text-muted">{dateShort(quote.checkIn)} – {dateShort(quote.checkOut)} · {plural(quote.nights, 'night')} · {plural(quote.rooms, 'room')} · {plural(quote.adults, 'adult')}{quote.children ? ` · ${plural(quote.children, 'child', 'children')}` : ''}</p>
      <dl className="mt-5 border-t border-line pt-4">
        {compact ? (
          <Row label={`Room × ${quote.nights} night${quote.nights > 1 ? 's' : ''}`} value={money(rooms.reduce((s, l) => s + l.amount, 0))} />
        ) : (
          <details className="group">
            <summary className="flex cursor-pointer list-none justify-between gap-4 py-1.5 text-sm"><span>Room rate · {plural(quote.nights, 'night')} <span className="text-xs text-primary underline underline-offset-2 group-open:hidden">nightly breakdown</span></span><span className="tabular-nums">{money(rooms.reduce((s, l) => s + l.amount, 0))}</span></summary>
            <div className="mb-2 ml-3 border-l border-line pl-3">
              {quote.nightly.map((n) => <Row key={n.date} muted label={`${dateShort(n.date)}${n.isWeekend ? ' · weekend' : ''}${n.holiday ? ` · ${n.holiday}` : ''}${quote.rooms > 1 ? ` × ${quote.rooms}` : ''}`} value={money(n.rate * quote.rooms)} />)}
            </div>
          </details>
        )}
        {extras.map((l, i) => <Row key={i} label={l.label} value={money(l.amount)} />)}
        {discounts.map((l, i) => <div key={i} className="flex justify-between gap-4 py-1.5 text-sm text-emerald-700"><dt>{l.label}</dt><dd className="tabular-nums">−{money(-l.amount)}</dd></div>)}
        {charges.length > 0 && <div className="mt-2 border-t border-line pt-2">{charges.map((l, i) => <Row key={i} muted label={l.label} value={money(l.amount)} />)}</div>}
      </dl>
      <div className="mt-4 flex items-baseline justify-between border-t border-fg/80 pt-4">
        <span className="text-sm uppercase tracking-[0.18em]">Total</span>
        <span className="font-display text-3xl tabular-nums">{money(quote.grandTotal)}</span>
      </div>
      <p className="mt-1 text-right text-xs text-muted">Includes all taxes and fees · INR</p>
      {depositPercent != null && depositPercent < 100 && quote.depositDue < quote.grandTotal && (
        <p className="mt-3 border border-line bg-surface/60 p-3 text-xs text-muted">Pay a {depositPercent}% deposit of <strong className="text-fg">{money(quote.depositDue)}</strong> now; the balance of {money(quote.grandTotal - quote.depositDue)} is due at the hotel.</p>
      )}
      {quote.warnings.map((w) => <p key={w} className="mt-3 text-xs text-amber-700">{w}</p>)}
    </div>
  );
}
