import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, Copy, CreditCard, Eye, HardDrive, Info, Lock, Mail, Save, ShieldCheck, Undo2, User } from 'lucide-react';
import type { BookingSettings } from '@aurelle/shared';
import { ApiError, errorMessage, get, post, put } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, Pager, Toggle } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Section = 'booking' | 'integrations' | 'email' | 'account';

export default function SettingsPage() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const [params, setParams] = useSearchParams();
  const sections: { key: Section; label: string; icon: typeof Info }[] = [
    { key: 'booking', label: 'Booking & payment policy', icon: CreditCard },
    { key: 'integrations', label: 'Integrations', icon: ShieldCheck },
    ...(manage ? [{ key: 'email' as const, label: 'Email outbox', icon: Mail }] : []),
    { key: 'account', label: 'Your account', icon: User },
  ];
  const active = sections.find((s) => s.key === params.get('section'))?.key ?? (can('dashboard.view') ? 'booking' : 'account');

  return (
    <div>
      <PageHeader title="Settings" description="Operational policies, integrations and your own account." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
          {sections.map((s) => (
            <button key={s.key} onClick={() => setParams({ section: s.key }, { replace: true })} aria-current={active === s.key ? 'page' : undefined}
              className={cn('flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition', active === s.key ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-zinc-100')}>
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {active === 'booking' && <BookingSettingsSection canEdit={manage} />}
          {active === 'integrations' && <IntegrationsSection />}
          {active === 'email' && manage && <EmailOutboxSection />}
          {active === 'account' && <AccountSection />}
        </div>
      </div>
    </div>
  );
}

// ─── (1) Booking & payment policy ────────────────────────────────────────────
type Form = Omit<BookingSettings, 'notificationEmails'> & { notificationEmails: string };
const toForm = (s: BookingSettings): Form => ({ ...s, notificationEmails: s.notificationEmails.join('\n') });
const toBody = (f: Form): BookingSettings => ({ ...f, notificationEmails: f.notificationEmails.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) });

function NumberField({ id, label, value, onChange, min, max, hint, error, suffix, disabled }: { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; hint?: string; error?: string; suffix?: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Labeled label={label} htmlFor={id} hint={hint} error={error}>
      <div className="relative">
        <input id={id} type="number" inputMode="numeric" className={cn('admin-input', suffix && 'pr-16')} min={min} max={max} step={1} value={text} disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => { setText(e.target.value); if (e.target.value !== '' && !Number.isNaN(Number(e.target.value))) onChange(Number(e.target.value)); }} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{suffix}</span>}
      </div>
    </Labeled>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-zinc-100 pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4"><h3 className="text-sm font-semibold text-zinc-900">{title}</h3>{description && <p className="text-xs text-zinc-500">{description}</p>}</div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function BookingSettingsSection({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'settings', 'booking'], queryFn: () => get<BookingSettings>('/admin/settings/booking') });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setForm(toForm(data)); }, [data]);
  const timezones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { return []; } }, []);

  const save = useMutation({
    mutationFn: (f: Form) => put<BookingSettings>('/admin/settings/booking', toBody(f)),
    onSuccess: (s) => { setErrors({}); qc.setQueryData(['admin', 'settings', 'booking'], s); toast.success('Booking & payment policy saved — in effect now'); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });

  if (isLoading || (!form && !error)) return <Card><Loading /></Card>;
  if (error || !form) return <ErrorBox error={error} onRetry={() => refetch()} />;

  const dirty = data ? JSON.stringify(toBody(form)) !== JSON.stringify(data) : false;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setC = <K extends keyof Form['cancellation']>(k: K, v: Form['cancellation'][K]) => setForm((f) => (f ? { ...f, cancellation: { ...f.cancellation, [k]: v } } : f));
  const setM = <K extends keyof Form['modification']>(k: K, v: Form['modification'][K]) => setForm((f) => (f ? { ...f, modification: { ...f.modification, [k]: v } } : f));
  const err = (k: string) => errors[k];
  const emailErr = Object.entries(errors).find(([k]) => k.startsWith('notificationEmails'))?.[1];
  const ro = !canEdit;
  const otherErrors = Object.entries(errors).filter(([k]) => !k.includes('.') && !(k in form) && k !== '_');

  return (
    <Card title="Booking & payment policy" actions={canEdit && dirty ? <Badge color="amber">Unsaved changes</Badge> : undefined}>
      {ro && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700" role="note">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p>You can view these settings but not change them — editing requires the <span className="font-mono text-xs">settings.manage</span> permission (Super Admin by default). Ask an administrator if a policy needs updating.</p>
        </div>
      )}
      {canEdit && <p className="mb-5 flex items-start gap-2 text-xs text-zinc-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> These are operational settings: changes take effect immediately for new bookings (no draft/publish step). Existing bookings keep the terms they were made under.</p>}
      {(errors._ || otherErrors.length > 0) && <div className="mb-4"><ErrorBox error={new Error(errors._ ?? otherErrors.map(([k, v]) => `${k}: ${v}`).join(' · '))} /></div>}

      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (canEdit) save.mutate(form); }}>
        <fieldset disabled={ro} className="space-y-6">
          <Group title="Stay rules" description="Property timezone, check-in/out and booking window.">
            <Labeled label="Timezone" htmlFor="bs-tz" error={err('timezone')}>
              <input id="bs-tz" className="admin-input" list="bs-tz-list" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
              <datalist id="bs-tz-list">{timezones.map((t) => <option key={t} value={t} />)}</datalist>
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Check-in from" htmlFor="bs-ci" error={err('checkInTime')}><input id="bs-ci" type="time" className="admin-input" value={form.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} /></Labeled>
              <Labeled label="Check-out by" htmlFor="bs-co" error={err('checkOutTime')}><input id="bs-co" type="time" className="admin-input" value={form.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} /></Labeled>
            </div>
            <NumberField id="bs-min" label="Minimum advance booking" suffix="days" min={0} max={30} value={form.minAdvanceDays} onChange={(n) => set('minAdvanceDays', n)} error={err('minAdvanceDays')} hint="0 allows same-day bookings." />
            <NumberField id="bs-max" label="Maximum advance booking" suffix="days" min={1} max={730} value={form.maxAdvanceDays} onChange={(n) => set('maxAdvanceDays', n)} error={err('maxAdvanceDays')} hint="How far ahead guests can book." />
            <NumberField id="bs-rooms" label="Max rooms per booking" min={1} max={20} value={form.maxRoomsPerBooking} onChange={(n) => set('maxRoomsPerBooking', n)} error={err('maxRoomsPerBooking')} />
            <NumberField id="bs-child" label="Children up to age" suffix="years" min={0} max={17} value={form.childMaxAge} onChange={(n) => set('childMaxAge', n)} error={err('childMaxAge')} hint="Older guests are counted as adults." />
            <div className="sm:col-span-2">
              <span className="admin-label" id="bs-wk-label">Weekend nights</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="bs-wk-label">
                {DAYS.map((d, i) => {
                  const on = form.weekendDays.includes(i);
                  return <button type="button" key={d} disabled={ro} aria-pressed={on} onClick={() => set('weekendDays', on ? form.weekendDays.filter((x) => x !== i) : [...form.weekendDays, i].sort())}
                    className={cn('rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed', on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')}>{d}</button>;
                })}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{err('weekendDays') ?? 'Nights that start on these days get weekend pricing (e.g. Fri & Sat = the nights of Friday and Saturday).'}</p>
            </div>
          </Group>

          <Group title="Payment" description="How guests pay and when bookings are confirmed.">
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.onlinePaymentEnabled} onChange={(v) => set('onlinePaymentEnabled', v)} label="Online payment" description="Card / UPI / netbanking via the payment gateway." /></div>
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.payAtHotelEnabled} onChange={(v) => set('payAtHotelEnabled', v)} label="Pay at hotel" description="Reserve now, settle at check-in." /></div>
            {!form.onlinePaymentEnabled && !form.payAtHotelEnabled && <p className="flex items-center gap-2 text-xs text-red-600 sm:col-span-2" role="alert"><AlertTriangle className="h-3.5 w-3.5" /> With both methods off, guests cannot complete a booking.</p>}
            <NumberField id="bs-dep" label="Online deposit" suffix="% of total" min={1} max={100} value={form.depositPercent} onChange={(n) => set('depositPercent', n)} error={err('depositPercent')} hint="100 = full prepayment. Lower values collect a deposit online." />
            <NumberField id="bs-hold" label="Inventory hold during checkout" suffix="minutes" min={5} max={120} value={form.holdMinutes} onChange={(n) => set('holdMinutes', n)} error={err('holdMinutes')} hint="Rooms are held while the guest pays, then released." />
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.autoConfirmPaid} onChange={(v) => set('autoConfirmPaid', v)} label="Auto-confirm paid bookings" description="Confirm as soon as payment is captured." /></div>
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.autoConfirmPayAtHotel} onChange={(v) => set('autoConfirmPayAtHotel', v)} label="Auto-confirm pay-at-hotel" description="Otherwise staff must confirm them manually." /></div>
            <div className="rounded-lg border border-zinc-200 p-3 sm:col-span-2"><Toggle disabled={ro} checked={form.allowGuestCheckout} onChange={(v) => set('allowGuestCheckout', v)} label="Allow guest checkout" description="Guests can book without creating an account." /></div>
          </Group>

          <Group title="Cancellation policy" description="Shown to guests at checkout and in confirmation emails.">
            <NumberField id="bs-fc" label="Free cancellation until" suffix="days before" min={0} max={60} value={form.cancellation.freeCancellationDays} onChange={(n) => setC('freeCancellationDays', n)} error={err('cancellation.freeCancellationDays')} hint="0 = free cancellation until the day of arrival." />
            <Labeled label="Late cancellation penalty" htmlFor="bs-pb" error={err('cancellation.penaltyBasis')}>
              <select id="bs-pb" className="admin-input" value={form.cancellation.penaltyBasis} onChange={(e) => setC('penaltyBasis', e.target.value as Form['cancellation']['penaltyBasis'])}>
                <option value="FIRST_NIGHT">First night’s charge</option>
                <option value="PERCENT_OF_TOTAL">Percentage of booking total</option>
              </select>
            </Labeled>
            {form.cancellation.penaltyBasis === 'PERCENT_OF_TOTAL' && (
              <NumberField id="bs-pp" label="Penalty percentage" suffix="%" min={0} max={100} value={form.cancellation.penaltyPercent} onChange={(n) => setC('penaltyPercent', n)} error={err('cancellation.penaltyPercent')} />
            )}
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.cancellation.allowOnlineCancellation} onChange={(v) => setC('allowOnlineCancellation', v)} label="Guests can cancel online" description="From their account or booking link." /></div>
          </Group>

          <Group title="Modifications">
            <div className="rounded-lg border border-zinc-200 p-3"><Toggle disabled={ro} checked={form.modification.allowOnlineModification} onChange={(v) => setM('allowOnlineModification', v)} label="Guests can modify online" description="Change dates or guests themselves." /></div>
            <NumberField id="bs-mc" label="Modification cutoff" suffix="days before" min={0} max={60} value={form.modification.cutoffDays} onChange={(n) => setM('cutoffDays', n)} error={err('modification.cutoffDays')} />
          </Group>

          <Group title="Notifications">
            <Labeled label="Staff notification emails" htmlFor="bs-ne" error={emailErr} hint="One address per line (max 10). These receive new booking, cancellation and inquiry alerts." className="sm:col-span-2">
              <textarea id="bs-ne" rows={3} className="admin-input font-mono text-xs" value={form.notificationEmails} onChange={(e) => set('notificationEmails', e.target.value)} placeholder="frontdesk@theaurelle.example" />
            </Labeled>
          </Group>
        </fieldset>

        {canEdit && (
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-zinc-100 bg-white/95 px-5 py-3 backdrop-blur">
            <button type="button" className="admin-btn-secondary" disabled={!dirty || save.isPending} onClick={() => { if (data) { setForm(toForm(data)); setErrors({}); } }}><Undo2 className="h-4 w-4" /> Discard</button>
            <button type="submit" className="admin-btn-primary" disabled={!dirty || save.isPending}><Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save policy'}</button>
          </div>
        )}
      </form>
    </Card>
  );
}

// ─── (2) Integrations ────────────────────────────────────────────────────────
interface Integrations { payments: { provider: string; testMode: boolean; webhookConfigured: boolean; webhookUrl: string }; email: { provider: string; live: boolean }; storage: { provider: string } }

function EnvList({ vars }: { vars: [string, string][] }) {
  return (
    <dl className="mt-2 space-y-1 rounded-lg bg-zinc-50 p-3 text-xs">
      {vars.map(([k, v]) => <div key={k} className="flex flex-wrap gap-x-2"><dt className="font-mono font-medium text-zinc-900">{k}</dt><dd className="text-zinc-500">{v}</dd></div>)}
    </dl>
  );
}

function StatusLine({ tone, children }: { tone: 'good' | 'warn' | 'neutral'; children: ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : CircleDashed;
  return <p className={cn('flex items-center gap-2 text-sm font-semibold', tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-zinc-700')}><Icon className="h-4 w-4 shrink-0" />{children}</p>;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); } catch { toast.error('Copy failed — select the text and copy manually'); } }}>
      <Copy className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function IntegrationsSection() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => get<Integrations>('/admin/integrations') });
  if (isLoading) return <Card><Loading /></Card>;
  if (error || !data) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const { payments: p, email: e, storage: s } = data;
  const sandbox = p.provider === 'SANDBOX';

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">Integrations are configured with server environment variables (never stored in the database) and take effect after the API restarts. Secrets are never shown here.</p>

      <Card title={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payments</span>} actions={sandbox ? <Badge color="amber">Test mode</Badge> : p.testMode ? <Badge color="amber">Razorpay test keys</Badge> : <Badge color="green">Live</Badge>}>
        {sandbox ? (
          <StatusLine tone="warn">Payments: SANDBOX — TEST MODE, no real money is collected</StatusLine>
        ) : p.testMode ? (
          <StatusLine tone="warn">Razorpay TEST — using rzp_test_ keys, no real money moves</StatusLine>
        ) : (
          <StatusLine tone="good">Razorpay LIVE — real payments are being collected</StatusLine>
        )}
        <p className="mt-2 text-sm text-zinc-600">
          {sandbox
            ? 'The built-in sandbox simulates successful and failed payments so the full booking flow can be tested. Every sandbox payment is flagged as a test in reports.'
            : 'Card, UPI and netbanking payments are processed by Razorpay. Refunds initiated in the admin are sent to Razorpay automatically.'}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{sandbox ? 'Go live with Razorpay' : 'Configuration'}</p>
            <EnvList vars={[['PAYMENT_PROVIDER', '= razorpay'], ['RAZORPAY_KEY_ID', 'rzp_live_… (rzp_test_… for testing)'], ['RAZORPAY_KEY_SECRET', 'from Razorpay Dashboard → API Keys'], ['RAZORPAY_WEBHOOK_SECRET', 'the secret you set on the webhook']]} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Webhook</p>
            <div className="mt-2 rounded-lg border border-zinc-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                {p.webhookConfigured ? <Badge color="green">{sandbox ? 'Not needed in sandbox' : 'Secret configured'}</Badge> : <Badge color="red">Secret missing</Badge>}
                <CopyButton text={p.webhookUrl} label="Copy URL" />
              </div>
              <code className="block break-all font-mono text-xs text-zinc-800">{p.webhookUrl}</code>
              <p className="mt-2 text-xs text-zinc-500">In Razorpay Dashboard → Webhooks, add this URL with events <span className="font-mono">payment.captured</span>, <span className="font-mono">payment.failed</span>, <span className="font-mono">refund.processed</span>. Webhooks confirm payments even if the guest closes the browser.</p>
            </div>
          </div>
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</span>} actions={e.live ? <Badge color="green">Sending</Badge> : <Badge color="amber">Not sending</Badge>}>
        {e.live ? <StatusLine tone="good">Email: {e.provider.toUpperCase()} — guest and staff emails are delivered</StatusLine> : <StatusLine tone="warn">Email: LOG ONLY — emails are recorded in the outbox but not delivered</StatusLine>}
        <p className="mt-2 text-sm text-zinc-600">Booking confirmations, cancellations, password resets and staff alerts are sent from <span className="font-mono text-xs">EMAIL_FROM</span>. Every message is logged in the email outbox.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Option A — Resend</p><EnvList vars={[['EMAIL_PROVIDER', '= resend'], ['RESEND_API_KEY', 're_…'], ['EMAIL_FROM', 'The Aurelle <reservations@yourdomain>']]} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Option B — SMTP</p><EnvList vars={[['EMAIL_PROVIDER', '= smtp'], ['SMTP_HOST / SMTP_PORT', 'e.g. smtp.gmail.com / 587'], ['SMTP_USER / SMTP_PASS', 'mailbox credentials'], ['SMTP_SECURE', 'true for port 465']]} /></div>
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Media storage</span>} actions={<Badge color={s.provider === 'cloudinary' ? 'green' : 'zinc'}>{s.provider === 'cloudinary' ? 'Cloudinary' : 'Local disk'}</Badge>}>
        {s.provider === 'cloudinary' ? <StatusLine tone="good">Storage: CLOUDINARY — images served from a global CDN</StatusLine> : <StatusLine tone="neutral">Storage: LOCAL — uploads are saved on the API server’s disk</StatusLine>}
        <p className="mt-2 text-sm text-zinc-600">{s.provider === 'cloudinary' ? 'Uploads are optimized and delivered with automatic format and width transforms.' : 'Fine for a single server with persistent storage. Use Cloudinary on hosts with ephemeral disks (most PaaS) so uploads survive redeploys.'}</p>
        <EnvList vars={[['STORAGE_PROVIDER', '= cloudinary'], ['CLOUDINARY_CLOUD_NAME', 'your cloud name'], ['CLOUDINARY_API_KEY', 'API key'], ['CLOUDINARY_API_SECRET', 'API secret']]} />
      </Card>
    </div>
  );
}

// ─── (3) Email outbox ────────────────────────────────────────────────────────
interface EmailLog { id: string; to: string; subject: string; template: string; status: 'SENT' | 'LOGGED' | 'FAILED'; provider: string; error: string | null; html: string; createdAt: string }

function EmailOutboxSection() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<EmailLog | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'email-logs', page],
    queryFn: () => get<{ items: EmailLog[]; total: number; page: number; pages: number }>('/admin/email-logs', { page }),
    placeholderData: (p) => p,
  });
  const color = { SENT: 'green', LOGGED: 'amber', FAILED: 'red' } as const;
  return (
    <Card title="Email outbox" bodyClassName="p-0" actions={<button className="admin-btn-ghost !py-1 text-xs" onClick={() => refetch()}>Refresh</button>}>
      <p className="border-b border-zinc-100 px-5 py-3 text-xs text-zinc-500"><strong className="font-medium text-zinc-700">Sent</strong> = delivered to the provider · <strong className="font-medium text-zinc-700">Logged</strong> = recorded only (no email provider configured) · <strong className="font-medium text-zinc-700">Failed</strong> = provider rejected it.</p>
      {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
        <Empty title="No emails yet" body="Emails sent by the system will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Template</th><th>Status</th><th className="text-right"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{dateTime(m.createdAt)}</td>
                  <td className="max-w-[200px] truncate text-xs" title={m.to}>{m.to}</td>
                  <td className="max-w-[320px]"><p className="truncate" title={m.subject}>{m.subject}</p>{m.error && <p className="truncate text-xs text-red-600" title={m.error}>{m.error}</p>}</td>
                  <td className="font-mono text-[11px] text-zinc-500">{m.template}</td>
                  <td><Badge color={color[m.status] ?? 'zinc'}>{m.status.charAt(0) + m.status.slice(1).toLowerCase()}</Badge><p className="mt-0.5 text-[11px] text-zinc-400">{m.provider}</p></td>
                  <td className="text-right"><button className="admin-btn-ghost !py-1 text-xs" onClick={() => setView(m)} aria-label={`View email: ${m.subject}`}><Eye className="h-3.5 w-3.5" /> View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      {view && (
        <Dialog open onOpenChange={(o) => !o && setView(null)} title={view.subject} description={`To ${view.to} · ${dateTime(view.createdAt)} · ${view.status}`} wide>
          {view.error && <div className="mb-3"><ErrorBox error={new Error(view.error)} /></div>}
          {/* sandbox="" blocks scripts, forms, navigation and same-origin access for untrusted email HTML. */}
          <iframe title={`Email preview: ${view.subject}`} sandbox="" srcDoc={view.html} className="h-[60vh] w-full rounded-lg border border-zinc-200 bg-white" />
        </Dialog>
      )}
    </Card>
  );
}

// ─── (4) Your account ────────────────────────────────────────────────────────
const pwProblem = (p: string) => (p.length < 10 ? 'Use at least 10 characters' : !(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) ? 'Include upper and lower case letters and a number' : null);

function AccountSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword }),
    onSuccess: () => { toast.success('Password changed. Other sessions have been signed out.'); setF({ currentPassword: '', newPassword: '', confirm: '' }); setErrors({}); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); else setErrors({ currentPassword: errorMessage(e) }); },
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!f.currentPassword) errs.currentPassword = 'Enter your current password';
    const p = pwProblem(f.newPassword); if (p) errs.newPassword = p;
    if (f.newPassword && f.newPassword === f.currentPassword) errs.newPassword = 'Choose a password different from the current one';
    if (f.confirm !== f.newPassword) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (!Object.keys(errs).length) m.mutate();
  };
  return (
    <div className="space-y-5">
      <Card title="Profile">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-zinc-500">Name</dt><dd className="font-medium">{user?.name}</dd></div>
          <div><dt className="text-xs text-zinc-500">Email</dt><dd className="font-medium">{user?.email}</dd></div>
          <div><dt className="text-xs text-zinc-500">Role</dt><dd className="font-medium">{user?.roleKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-zinc-500">Name, email and role are managed by an administrator under Staff & roles.</p>
      </Card>
      <Card title="Change password">
        <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
          <Labeled label="Current password" htmlFor="cp-cur" error={errors.currentPassword}><input id="cp-cur" type="password" autoComplete="current-password" className="admin-input" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Labeled>
          <Labeled label="New password" htmlFor="cp-new" error={errors.newPassword} hint="At least 10 characters, with upper- and lower-case letters and a number."><input id="cp-new" type="password" autoComplete="new-password" className="admin-input" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Labeled>
          <Labeled label="Confirm new password" htmlFor="cp-conf" error={errors.confirm}><input id="cp-conf" type="password" autoComplete="new-password" className="admin-input" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Labeled>
          <div><button type="submit" className="admin-btn-primary" disabled={m.isPending}><Lock className="h-4 w-4" /> {m.isPending ? 'Updating…' : 'Update password'}</button></div>
        </form>
      </Card>
    </div>
  );
}
