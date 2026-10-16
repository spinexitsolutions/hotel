import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, Mail } from 'lucide-react';
import { get } from '@/lib/api';
import { dateTime, money, relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pager, SearchBox } from '../components/ui';

export interface CustomerRow {
  id: string; name: string; email: string; phone: string; country: string; isActive: boolean; marketingOptIn: boolean;
  createdAt: string; lastLoginAt: string | null; stays: number; lifetimeValue: number;
}
type Paged<T> = { items: T[]; total: number; page: number; pages: number };

const FILTERS = [
  { key: '', label: 'All customers' },
  { key: 'marketing', label: 'Marketing opt-in' },
  { key: 'inactive', label: 'Deactivated' },
] as const;

export default function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const filter = sp.get('filter') ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const [debounced, setDebounced] = useState(q);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const update = (patch: Record<string, string | null>) => setSp((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });
  useEffect(() => { if ((sp.get('q') ?? '') !== debounced) update({ q: debounced || null, page: null }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debounced]);

  const query = { q: debounced, page, marketing: filter === 'marketing' ? 1 : undefined, active: filter === 'inactive' ? 0 : undefined };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'customers', query],
    queryFn: () => get<Paged<CustomerRow>>('/admin/customers', query),
    placeholderData: keepPreviousData,
  });

  const exportQs = new URLSearchParams();
  if (debounced) exportQs.set('q', debounced);
  if (filter === 'marketing') exportQs.set('marketing', '1');
  if (filter === 'inactive') exportQs.set('active', '0');
  const exportHref = `/api/admin/customers/export.csv${exportQs.toString() ? `?${exportQs}` : ''}`;

  return (
    <div>
      <PageHeader title="Customers" description="Registered guest accounts, their stays and lifetime value."
        actions={can('customers.export') && <a href={exportHref} className="admin-btn-secondary" download><Download className="h-4 w-4" /> Export CSV</a>} />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, email or phone…" />
          <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-label="Filter customers">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => update({ filter: f.key || null, page: null })} aria-pressed={filter === f.key}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium', filter === f.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>{f.label}</button>
            ))}
          </div>
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title={debounced || filter ? 'No customers match' : 'No customers yet'} body={debounced || filter ? 'Try a different search or filter.' : 'Guests appear here once they create an account.'} />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Phone</th><th>Country</th><th className="text-right">Stays</th><th className="text-right">Lifetime value</th><th>Joined</th><th>Last login</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/customers/${c.id}`); }} tabIndex={0} aria-label={`Open ${c.name}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600" aria-hidden>{initials(c.name)}</span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium">{c.name}{!c.isActive && <Badge color="red">Deactivated</Badge>}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-zinc-500">{c.email}{c.marketingOptIn && <Mail className="h-3 w-3 text-emerald-600" aria-label="Opted in to marketing" />}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{c.phone || <span className="text-zinc-400">—</span>}</td>
                    <td>{c.country || <span className="text-zinc-400">—</span>}</td>
                    <td className="text-right tabular-nums">{c.stays}</td>
                    <td className="text-right tabular-nums">{money(c.lifetimeValue)}</td>
                    <td className="whitespace-nowrap text-xs text-zinc-600">{dateTime(c.createdAt)}</td>
                    <td className="whitespace-nowrap text-xs text-zinc-600">{c.lastLoginAt ? relTime(c.lastLoginAt) : 'Never'}</td>
                    <td className="text-right"><ChevronRight className="inline h-4 w-4 text-zinc-400" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: p > 1 ? String(p) : null })} /></div>}
      </Card>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
}
