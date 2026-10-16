import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Dialog } from '@/components/ui/Dialog';

export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('admin-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'default' | 'good' | 'warn' }) {
  return (
    <div className="admin-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        {icon && <span className={cn('rounded-lg p-1.5', tone === 'good' ? 'bg-emerald-50 text-emerald-600' : tone === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-zinc-100 text-zinc-600')}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20', red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20', zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20', violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
export function Badge({ children, color = 'zinc' }: { children: ReactNode; color?: keyof typeof BADGE }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[color])}>{children}</span>;
}

const STATUS_COLOR: Record<string, keyof typeof BADGE> = {
  CONFIRMED: 'green', CHECKED_IN: 'blue', CHECKED_OUT: 'zinc', PENDING: 'amber', PENDING_PAYMENT: 'amber', CANCELLED: 'red', REJECTED: 'red', EXPIRED: 'zinc', NO_SHOW: 'red',
  PAID: 'green', PARTIALLY_PAID: 'amber', UNPAID: 'zinc', FAILED: 'red', REFUNDED: 'violet', PARTIALLY_REFUNDED: 'violet',
  CAPTURED: 'green', CREATED: 'zinc', PROCESSED: 'green', PROCESSING: 'amber', NONE: 'zinc',
  PUBLISHED: 'green', DRAFT: 'zinc', ARCHIVED: 'zinc', SCHEDULED: 'blue', APPROVED: 'green', NEW: 'blue', IN_PROGRESS: 'amber', RESOLVED: 'green', SPAM: 'zinc',
  SUBSCRIBED: 'green', UNSUBSCRIBED: 'zinc', AVAILABLE: 'green', OUT_OF_SERVICE: 'red', CLEAN: 'green', DIRTY: 'amber', INSPECTED: 'blue',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge color={STATUS_COLOR[status] ?? 'zinc'}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="admin-input w-64 pl-9" aria-label={placeholder} />
    </div>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <p className="px-1 py-3 text-xs text-zinc-500">{total} result{total === 1 ? '' : 's'}</p>;
  return (
    <div className="flex items-center justify-between px-1 py-3 text-xs text-zinc-500">
      <span>{total} results · page {page} of {pages}</span>
      <div className="flex gap-1">
        <button className="admin-btn-secondary !px-2 !py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <button className="admin-btn-secondary !px-2 !py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Loading({ className }: { className?: string }) {
  return <div className={cn('flex items-center justify-center py-16 text-zinc-400', className)}><Loader2 className="h-6 w-6 animate-spin" /></div>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="text-sm font-medium text-zinc-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      {error instanceof Error ? error.message : 'Something went wrong.'}
      {onRetry && <button className="ml-3 underline" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-60')}>
      <span>
        <span className="block text-sm font-medium text-zinc-800">{label}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-zinc-900' : 'bg-zinc-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Labeled({ label, hint, error, children, className, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label className="admin-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = (o: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ ...o, resolve }));
  const dialog = state && (
    <Dialog open onOpenChange={(o) => { if (!o) { state.resolve(false); setState(null); } }} title={state.title} description={state.body}
      footer={<>
        <button className="admin-btn-secondary" onClick={() => { state.resolve(false); setState(null); }}>Cancel</button>
        <button className={state.danger ? 'admin-btn-danger' : 'admin-btn-primary'} onClick={() => { state.resolve(true); setState(null); }}>{state.confirmLabel ?? 'Confirm'}</button>
      </>}>
      <span />
    </Dialog>
  );
  return { confirm, dialog };
}

export const RANGE_PRESETS = [{ v: 'today', l: 'Today' }, { v: 'week', l: 'Last 7 days' }, { v: 'month', l: 'Last 30 days' }, { v: 'year', l: 'Last 12 months' }, { v: 'custom', l: 'Custom' }];

export function RangeFilter({ value, onChange }: { value: { preset: string; from?: string; to?: string }; onChange: (v: { preset: string; from?: string; to?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => (
          <button key={p.v} onClick={() => onChange({ preset: p.v, from: value.from, to: value.to })} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', value.preset === p.v ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')} aria-pressed={value.preset === p.v}>{p.l}</button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <>
          <input type="date" className="admin-input w-auto py-1.5" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From date" />
          <span className="text-zinc-400">–</span>
          <input type="date" className="admin-input w-auto py-1.5" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To date" />
        </>
      )}
    </div>
  );
}

export const rangeQuery = (r: { preset: string; from?: string; to?: string }) => (r.preset === 'custom' ? { from: r.from, to: r.to } : { preset: r.preset });
