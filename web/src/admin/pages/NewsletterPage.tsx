import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { del, get, patch } from '@/lib/api';
import { dateTime, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { Card, Empty, ErrorBox, Loading, PageHeader, Pager, SearchBox, Stat, StatusBadge, useConfirm } from '../components/ui';

type Status = 'SUBSCRIBED' | 'UNSUBSCRIBED';
interface Subscriber { id: string; email: string; name: string | null; status: Status; source: string | null; createdAt: string; unsubscribedAt: string | null }
type Resp = { items: Subscriber[]; total: number; page: number; pages: number; subscribed: number };

const FILTERS: { key: '' | Status; label: string }[] = [{ key: '', label: 'All' }, { key: 'SUBSCRIBED', label: 'Subscribed' }, { key: 'UNSUBSCRIBED', label: 'Unsubscribed' }];

export default function NewsletterPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [debounced, status]);

  const query = { status, q: debounced, page };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'newsletter', query], queryFn: () => get<Resp>('/admin/newsletter', query), placeholderData: keepPreviousData,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'newsletter'] });

  const toggle = useMutation({
    mutationFn: (s: Subscriber) => patch(`/admin/newsletter/${s.id}`, { status: s.status === 'SUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUBSCRIBED' }),
    onSuccess: (_d, s) => { toast.success(s.status === 'SUBSCRIBED' ? `${s.email} unsubscribed` : `${s.email} resubscribed`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/newsletter/${id}`),
    onSuccess: () => { toast.success('Subscriber deleted'); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  return (
    <div>
      <PageHeader title="Newsletter" description="People who signed up for news and offers from the website footer, booking flow or account."
        actions={<a href="/api/admin/newsletter/export.csv" className="admin-btn-secondary" download><Download className="h-4 w-4" /> Export subscribed (CSV)</a>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active subscribers" value={data ? data.subscribed.toLocaleString('en-IN') : '—'} tone="good" />
        <Stat label={status ? `${titleCase(status)} (filtered)` : 'All records'} value={data ? data.total.toLocaleString('en-IN') : '—'} hint={debounced ? `Matching “${debounced}”` : undefined} />
        <div className="admin-card p-5 text-xs leading-relaxed text-zinc-500">
          Only export subscribed contacts into your email tool. Unsubscribing here is immediate; delete a record when someone asks to have their data erased.
        </div>
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search by email…" />
          <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.key || 'all'} type="button" onClick={() => setStatus(f.key)} aria-pressed={status === f.key}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium', status === f.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>{f.label}</button>
            ))}
          </div>
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title={debounced || status ? 'No subscribers match' : 'No subscribers yet'} body={debounced || status ? 'Try a different search or filter.' : 'Sign-ups from the website will appear here.'} />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th>Signed up</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium"><a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a></td>
                    <td>{s.name || <span className="text-zinc-400">—</span>}</td>
                    <td className="text-xs text-zinc-600">{s.source ? titleCase(s.source) : '—'}</td>
                    <td>
                      <StatusBadge status={s.status} />
                      {s.unsubscribedAt && s.status === 'UNSUBSCRIBED' && <p className="mt-0.5 text-[11px] text-zinc-500">{dateTime(s.unsubscribedAt)}</p>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-zinc-600">{dateTime(s.createdAt)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="admin-btn-ghost !px-2 !py-1 text-xs" disabled={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)}>
                        {s.status === 'SUBSCRIBED' ? 'Unsubscribe' : 'Resubscribe'}
                      </button>
                      <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label={`Delete ${s.email}`}
                        onClick={async () => { if (await confirm({ title: 'Delete subscriber?', body: `${s.email} will be permanently removed. Use this for data-erasure requests; to stop emails, unsubscribe instead.`, confirmLabel: 'Delete', danger: true })) remove.mutate(s.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </Card>
      {dialog}
    </div>
  );
}
