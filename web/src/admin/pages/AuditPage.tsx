import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { get } from '@/lib/api';
import { dateTime, relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pager, SearchBox } from '../components/ui';

interface AuditRow {
  id: string; action: string; entity: string; entityId: string | null; summary: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string;
  actor: { name: string; email: string } | null;
}

const ENTITIES = ['Booking', 'RoomType', 'Room', 'RoomBlock', 'BlackoutDate', 'RateRule', 'ChargeRule', 'MealPlan', 'AddOn', 'Amenity', 'Holiday', 'Page', 'SiteConfig', 'BlogPost', 'Faq', 'GalleryItem', 'Coupon', 'Offer', 'Review', 'ContactInquiry', 'NewsletterSubscriber', 'User', 'Role', 'Setting', 'MediaAsset'];

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Flattens nested objects into dot paths so changes can be compared key by key. */
function flatten(v: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length && prefix) out[prefix] = {};
    for (const [k, x] of entries) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out[prefix] = v;
  else out['(value)'] = v;
  return out;
}
const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const [raw, setRaw] = useState(false);
  const rows = useMemo(() => {
    const b = before == null ? {} : flatten(before);
    const a = after == null ? {} : flatten(after);
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
    return keys.map((k) => ({ k, b: b[k], a: a[k], changed: JSON.stringify(b[k]) !== JSON.stringify(a[k]) }));
  }, [before, after]);
  const changed = rows.filter((r) => r.changed);
  const hasBoth = before != null && after != null;

  if (before == null && after == null) return <p className="text-xs text-zinc-500">No data snapshot was recorded for this action.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{hasBoth ? `${changed.length} field${changed.length === 1 ? '' : 's'} changed` : before == null ? 'Created / recorded values' : 'Removed values'}</p>
        <button type="button" className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline" onClick={() => setRaw((r) => !r)}>{raw ? 'Show changes' : 'Show raw JSON'}</button>
      </div>
      {raw ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[{ t: 'Before', v: before }, { t: 'After', v: after }].map(({ t, v }) => (
            <div key={t}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t}</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{v == null ? '—' : JSON.stringify(v, null, 2)}</pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-2 font-medium">Field</th>{before != null && <th className="px-3 py-2 font-medium">Before</th>}{after != null && <th className="px-3 py-2 font-medium">After</th>}</tr>
            </thead>
            <tbody>
              {(hasBoth ? changed : rows).map((r) => (
                <tr key={r.k} className="border-t border-zinc-100 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-zinc-700">{r.k}</td>
                  {before != null && <td className={cn('break-all px-3 py-1.5 font-mono', hasBoth && 'bg-red-50/70 text-red-800')}>{show(r.b)}</td>}
                  {after != null && <td className={cn('break-all px-3 py-1.5 font-mono', hasBoth && 'bg-emerald-50/70 text-emerald-800')}>{show(r.a)}</td>}
                </tr>
              ))}
              {hasBoth && !changed.length && <tr><td colSpan={3} className="px-3 py-3 text-zinc-500">No differences between the snapshots.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const actionColor = (a: string): 'red' | 'green' | 'blue' | 'amber' | 'zinc' => (/delete|cancel|reject|remove/.test(a) ? 'red' : /create|upload|publish|confirm/.test(a) ? 'green' : /login|auth|password/.test(a) ? 'amber' : /update|edit|moderate|restore|settings/.test(a) ? 'blue' : 'zinc');

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, entity]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'audit', dq, entity, page],
    queryFn: () => get<{ items: AuditRow[]; total: number; page: number; pages: number }>('/admin/audit', { q: dq, entity, page }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <PageHeader title="Audit log" description="An immutable record of significant actions taken by staff and the system. Expand a row to see what changed." />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search action or summary…" />
          <label className="sr-only" htmlFor="audit-entity">Entity</label>
          <select id="audit-entity" className="admin-input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All entities</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          {isFetching && !isLoading && <span className="text-xs text-zinc-400" aria-live="polite">Loading…</span>}
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title="No audit entries" body={q || entity ? 'Try clearing the filters.' : 'Actions will appear here as staff make changes.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th className="w-8"><span className="sr-only">Expand</span></th><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Summary</th><th>IP</th></tr></thead>
              <tbody>
                {data.items.map((r) => {
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)}>
                        <td>
                          <button type="button" className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100" aria-expanded={isOpen} aria-controls={`audit-${r.id}`} aria-label={isOpen ? 'Collapse details' : 'Expand details'} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : r.id); }}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap text-xs"><span title={dateTime(r.createdAt)}>{relTime(r.createdAt)}</span><p className="text-[11px] text-zinc-400">{dateTime(r.createdAt)}</p></td>
                        <td className="text-xs">{r.actor ? <><p className="font-medium text-zinc-800">{r.actor.name}</p><p className="text-zinc-500">{r.actor.email}</p></> : <span className="text-zinc-500">System / guest</span>}</td>
                        <td><Badge color={actionColor(r.action)}><span className="font-mono">{r.action}</span></Badge></td>
                        <td className="text-xs"><p>{r.entity}</p>{r.entityId && <p className="max-w-[140px] truncate font-mono text-[11px] text-zinc-400" title={r.entityId}>{r.entityId}</p>}</td>
                        <td className="max-w-md text-sm text-zinc-700">{r.summary || <span className="text-zinc-400">—</span>}</td>
                        <td className="whitespace-nowrap font-mono text-[11px] text-zinc-500">{r.ip ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr id={`audit-${r.id}`}>
                          <td colSpan={7} className="bg-zinc-50/80 !py-4"><DiffView before={r.before} after={r.after} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </Card>
    </div>
  );
}
