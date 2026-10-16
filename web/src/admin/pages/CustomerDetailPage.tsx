import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, ShieldCheck, Star } from 'lucide-react';
import { ApiError, get, put } from '@/lib/api';
import { dateShort, dateTime, money, relTime, titleCase } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, Stat, StatusBadge, Toggle } from '../components/ui';

interface CustomerDetail {
  id: string; name: string; email: string; phone: string; country: string; isActive: boolean; marketingOptIn: boolean; notes: string;
  createdAt: string; lastLoginAt: string | null;
  bookings: { id: string; reference: string; status: string; roomType: string; checkIn: string; checkOut: string; grandTotal: number; paymentStatus: string }[];
  inquiries: { id: string; type: string; subject: string; message: string; status: string; createdAt: string }[];
  reviews: { id: string; title: string; rating: number; status: string; body: string; createdAt: string }[];
}
type Form = { name: string; phone: string; country: string; marketingOptIn: boolean; isActive: boolean; notes: string };

const STAY_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => get<CustomerDetail>(`/admin/customers/${id}`), enabled: !!id });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (c) setForm({ name: c.name, phone: c.phone ?? '', country: c.country ?? '', marketingOptIn: c.marketingOptIn, isActive: c.isActive, notes: c.notes ?? '' });
  }, [c]);

  const save = useMutation({
    mutationFn: (f: Form) => put(`/admin/customers/${id}`, f),
    onSuccess: () => {
      setErrors({});
      toast.success('Customer updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(e instanceof Error ? e.message : 'Could not save');
    },
  });

  const back = <Link to="/admin/customers" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-3.5 w-3.5" /> Customers</Link>;
  if (isLoading) return <Loading />;
  if (error || !c) return <div>{back}<ErrorBox error={error ?? new Error('Customer not found')} onRetry={() => refetch()} /></div>;

  const stays = c.bookings.filter((b) => STAY_STATUSES.includes(b.status));
  const lifetimeValue = stays.reduce((s, b) => s + b.grandTotal, 0);
  const nights = stays.reduce((s, b) => s + nightsBetween(b.checkIn, b.checkOut), 0);
  const canManage = can('customers.manage');
  const dirty = !!form && (form.name !== c.name || form.phone !== (c.phone ?? '') || form.country !== (c.country ?? '') || form.marketingOptIn !== c.marketingOptIn || form.isActive !== c.isActive || form.notes !== (c.notes ?? ''));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div>
      <PageHeader back={back} title={c.name}
        description={`Customer since ${dateTime(c.createdAt)} · last login ${c.lastLoginAt ? relTime(c.lastLoginAt) : 'never'}`}
        actions={<>
          {!c.isActive && <Badge color="red">Deactivated</Badge>}
          {c.marketingOptIn ? <Badge color="green">Marketing opt-in</Badge> : <Badge>No marketing</Badge>}
          <a href={`mailto:${c.email}`} className="admin-btn-secondary"><Mail className="h-4 w-4" /> Email</a>
          {c.phone && <a href={`tel:${c.phone.replace(/[^+0-9]/g, '')}`} className="admin-btn-secondary"><Phone className="h-4 w-4" /> Call</a>}
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Completed / upcoming stays" value={stays.length} hint={`${nights} night${nights === 1 ? '' : 's'}`} />
        <Stat label="Lifetime value" value={money(lifetimeValue)} tone="good" hint="Confirmed and completed stays" />
        <Stat label="All bookings" value={c.bookings.length} hint="Including cancelled" />
        <Stat label="Inquiries · reviews" value={`${c.inquiries.length} · ${c.reviews.length}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="Booking history" bodyClassName="p-0">
            {!c.bookings.length ? <Empty title="No bookings yet" /> : (
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead><tr><th>Reference</th><th>Room</th><th>Dates</th><th>Status</th><th>Payment</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {c.bookings.map((b) => (
                      <tr key={b.id}>
                        <td><Link to={`/admin/bookings/${b.id}`} className="font-mono text-xs font-semibold text-zinc-900 underline-offset-2 hover:underline">{b.reference}</Link></td>
                        <td>{b.roomType}</td>
                        <td className="whitespace-nowrap text-xs">{dateShort(b.checkIn)} → {dateShort(b.checkOut)} <span className="text-zinc-500">({nightsBetween(b.checkIn, b.checkOut)}n)</span></td>
                        <td><StatusBadge status={b.status} /></td>
                        <td><StatusBadge status={b.paymentStatus} /></td>
                        <td className="text-right tabular-nums">{money(b.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Inquiries">
            {!c.inquiries.length ? <p className="text-sm text-zinc-500">No inquiries from this guest.</p> : (
              <ul className="divide-y divide-zinc-100">
                {c.inquiries.map((i) => (
                  <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/admin/inquiries?id=${i.id}`} className="text-sm font-medium text-zinc-900 hover:underline">{i.subject || titleCase(i.type)}</Link>
                      <div className="flex items-center gap-2"><Badge>{titleCase(i.type)}</Badge><StatusBadge status={i.status} /></div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{i.message}</p>
                    <p className="mt-1 text-xs text-zinc-400">{dateTime(i.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Reviews">
            {!c.reviews.length ? <p className="text-sm text-zinc-500">No reviews written.</p> : (
              <ul className="divide-y divide-zinc-100">
                {c.reviews.map((r) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900">{r.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-600" aria-label={`${r.rating} out of 5 stars`}><Star className="h-3.5 w-3.5 fill-current" aria-hidden />{r.rating}</span>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{r.body}</p>
                    <p className="mt-1 text-xs text-zinc-400">{dateTime(r.createdAt)} · <Link to={`/admin/reviews?q=${encodeURIComponent(r.title)}`} className="hover:underline">Moderate</Link></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Profile">
            {!form ? <Loading /> : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canManage) save.mutate(form); }}>
                <Labeled label="Email" htmlFor="c-email" hint="Email is the login and cannot be changed here.">
                  <input id="c-email" className="admin-input" value={c.email} disabled readOnly />
                </Labeled>
                <Labeled label="Full name" htmlFor="c-name" error={errors.name}>
                  <input id="c-name" className="admin-input" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={!canManage} required />
                </Labeled>
                <div className="grid grid-cols-2 gap-3">
                  <Labeled label="Phone" htmlFor="c-phone" error={errors.phone}>
                    <input id="c-phone" type="tel" className="admin-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={!canManage} />
                  </Labeled>
                  <Labeled label="Country" htmlFor="c-country" error={errors.country}>
                    <input id="c-country" className="admin-input" value={form.country} onChange={(e) => set('country', e.target.value)} disabled={!canManage} />
                  </Labeled>
                </div>
                <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                  <Toggle label="Marketing emails" description="Guest has consented to offers and news." checked={form.marketingOptIn} onChange={(v) => set('marketingOptIn', v)} disabled={!canManage} />
                  <Toggle label="Account active" description="Deactivating signs the guest out and blocks login." checked={form.isActive} onChange={(v) => set('isActive', v)} disabled={!canManage} />
                </div>
                <Labeled label="Internal notes" htmlFor="c-notes" hint="Visible to staff only. Preferences, VIP status, allergies…" error={errors.notes}>
                  <textarea id="c-notes" className="admin-input" rows={4} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canManage} />
                </Labeled>
                {canManage ? (
                  <div className="flex justify-end gap-2">
                    <button type="button" className="admin-btn-secondary" disabled={!dirty || save.isPending} onClick={() => { setErrors({}); setForm({ name: c.name, phone: c.phone ?? '', country: c.country ?? '', marketingOptIn: c.marketingOptIn, isActive: c.isActive, notes: c.notes ?? '' }); }}>Reset</button>
                    <button type="submit" className="admin-btn-primary" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
                  </div>
                ) : <p className="text-xs text-zinc-500">You have view-only access to customer profiles.</p>}
              </form>
            )}
          </Card>

          <div className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <p>
              <strong className="font-medium text-zinc-800">Privacy:</strong> this record contains personal data. Access it only for legitimate guest-service purposes, don’t copy it outside the system, and honour requests to stop marketing or delete data. Profile changes are recorded in the audit log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
