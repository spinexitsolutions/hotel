import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquareReply, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { ApiError, del, get, patch, post, put } from '@/lib/api';
import { dateTime, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormGrid, type FieldSpec } from '../components/CrudPage';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pager, SearchBox, StatusBadge, useConfirm } from '../components/ui';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
interface Review {
  id: string; name: string; location: string; rating: number; title: string; body: string; status: Status; isFeatured: boolean; response: string;
  source: 'GUEST' | 'EDITORIAL' | 'PRESS'; createdAt: string; roomTypeId: string | null;
}
type Paged<T> = { items: T[]; total: number; page: number; pages: number };

const TABS: { key: Status | ''; label: string }[] = [
  { key: 'PENDING', label: 'Pending' }, { key: 'APPROVED', label: 'Approved' }, { key: 'REJECTED', label: 'Rejected' }, { key: '', label: 'All' },
];
const SOURCE_COLOR = { GUEST: 'zinc', EDITORIAL: 'violet', PRESS: 'blue' } as const;

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden className={cn('h-3.5 w-3.5', i <= n ? 'fill-amber-400 text-amber-400' : 'text-zinc-300')} />)}
    </span>
  );
}

export default function ReviewsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get('status');
  const status = (tabParam === null ? 'PENDING' : tabParam) as Status | '';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [debounced, setDebounced] = useState(q.trim());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [debounced, status]);
  const setStatus = (s: Status | '') => setSp((p) => { const n = new URLSearchParams(p); n.set('status', s); return n; }, { replace: true });

  const { data: rt } = useQuery({ queryKey: ['admin', 'room-types', 'lite'], queryFn: () => get<{ items: { id: string; name: string }[] }>('/admin/room-types'), staleTime: 60_000 });
  const query = { status, q: debounced, page, pageSize: 20 };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'reviews', query], queryFn: () => get<Paged<Review>>('/admin/reviews', query), placeholderData: keepPreviousData,
  });
  const pendingCount = useQuery({ queryKey: ['admin', 'reviews', 'pending-count'], queryFn: () => get<Paged<Review>>('/admin/reviews', { status: 'PENDING', pageSize: 1 }) }).data?.total;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
  const moderate = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: Status; isFeatured?: boolean; response?: string }) => patch(`/admin/reviews/${id}/moderate`, body),
    onSuccess: (_d, v) => { toast.success(v.response !== undefined ? 'Response saved' : `Review ${v.status === 'APPROVED' ? 'approved' : v.status === 'REJECTED' ? 'rejected' : 'updated'}`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/reviews/${id}`),
    onSuccess: () => { toast.success('Review deleted'); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  const roomName = (id: string | null) => (id ? rt?.items.find((t) => t.id === id)?.name : null);

  return (
    <div>
      <PageHeader title="Reviews & testimonials" description="Moderate guest reviews before they appear on the website, reply publicly, and add editorial or press quotes."
        actions={<button className="admin-btn-primary" onClick={() => setEditing({ name: '', location: '', rating: 5, title: '', body: '', roomTypeId: null, status: 'APPROVED', isFeatured: false, source: 'EDITORIAL' })}><Plus className="h-4 w-4" /> Add testimonial</button>} />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
          <div className="flex gap-1" role="tablist" aria-label="Filter by status">
            {TABS.map((t) => (
              <button key={t.key || 'all'} type="button" role="tab" aria-selected={status === t.key} onClick={() => setStatus(t.key)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium', status === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>
                {t.label}
                {t.key === 'PENDING' && pendingCount ? <span className={cn('ml-1.5 rounded-full px-1.5 tabular-nums', status === t.key ? 'bg-white/20' : 'bg-amber-100 text-amber-800')}>{pendingCount}</span> : null}
              </button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Search reviews…" />
        </div>

        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title={status === 'PENDING' && !debounced ? 'All caught up' : 'No reviews'} body={status === 'PENDING' && !debounced ? 'There are no reviews waiting for moderation.' : 'Nothing matches this filter.'} />
        ) : (
          <ul className={cn('divide-y divide-zinc-100 transition-opacity', isFetching && 'opacity-60')}>
            {data.items.map((r) => (
              <ReviewItem key={r.id} r={r} roomName={roomName(r.roomTypeId)} busy={moderate.isPending}
                onModerate={(body) => moderate.mutate({ id: r.id, ...body })}
                onEdit={() => setEditing({ ...r })}
                onDelete={async () => { if (await confirm({ title: 'Delete this review?', body: 'It will be removed from the website permanently.', confirmLabel: 'Delete', danger: true })) remove.mutate(r.id); }} />
            ))}
          </ul>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </Card>

      {editing && <TestimonialDialog initial={editing} roomTypes={rt?.items ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />}
      {dialog}
    </div>
  );
}

function ReviewItem({ r, roomName, busy, onModerate, onEdit, onDelete }: {
  r: Review; roomName: string | null | undefined; busy: boolean;
  onModerate: (b: { status: Status; isFeatured?: boolean; response?: string }) => void; onEdit: () => void; onDelete: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [response, setResponse] = useState(r.response ?? '');
  useEffect(() => setResponse(r.response ?? ''), [r.response]);

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stars n={r.rating} />
            <StatusBadge status={r.status} />
            <Badge color={SOURCE_COLOR[r.source] ?? 'zinc'}>{titleCase(r.source)}</Badge>
            {r.isFeatured && <Badge color="amber">Featured</Badge>}
          </div>
          <h3 className="mt-2 font-semibold text-zinc-900">{r.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{r.body}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {r.name}{r.location && `, ${r.location}`} · {dateTime(r.createdAt)}{roomName && ` · ${roomName}`}
          </p>
          {r.response && !replying && (
            <div className="mt-3 rounded-lg border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <p className="text-xs font-medium text-zinc-500">Hotel response</p>
              <p className="whitespace-pre-wrap">{r.response}</p>
            </div>
          )}
          {replying && (
            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); onModerate({ status: r.status, response: response.trim() }); setReplying(false); }}>
              <label htmlFor={`resp-${r.id}`} className="admin-label">Public response from the hotel</label>
              <textarea id={`resp-${r.id}`} className="admin-input" rows={3} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Thank you for staying with us…" autoFocus />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="admin-btn-secondary" onClick={() => { setReplying(false); setResponse(r.response ?? ''); }}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={busy}>Save response</button>
              </div>
            </form>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.status !== 'APPROVED' && <button className="admin-btn-secondary !py-1.5 text-emerald-700" disabled={busy} onClick={() => onModerate({ status: 'APPROVED' })}><Check className="h-4 w-4" /> Approve</button>}
          {r.status !== 'REJECTED' && <button className="admin-btn-secondary !py-1.5 text-red-700" disabled={busy} onClick={() => onModerate({ status: 'REJECTED', isFeatured: false })}><X className="h-4 w-4" /> Reject</button>}
          <button className="admin-btn-ghost !p-1.5" disabled={busy || r.status !== 'APPROVED'} title={r.status !== 'APPROVED' ? 'Approve first to feature' : r.isFeatured ? 'Unfeature' : 'Feature on website'}
            aria-label={r.isFeatured ? 'Unfeature review' : 'Feature review'} aria-pressed={r.isFeatured} onClick={() => onModerate({ status: r.status, isFeatured: !r.isFeatured })}>
            <Star className={cn('h-4 w-4', r.isFeatured && 'fill-amber-400 text-amber-500')} />
          </button>
          <button className="admin-btn-ghost !p-1.5" aria-label={r.response ? 'Edit response' : 'Write response'} title="Respond" onClick={() => setReplying((v) => !v)}><MessageSquareReply className="h-4 w-4" /></button>
          {r.source !== 'GUEST' && <button className="admin-btn-ghost !p-1.5" aria-label="Edit testimonial" title="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></button>}
          <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label="Delete review" title="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </li>
  );
}

function TestimonialDialog({ initial, roomTypes, onClose, onSaved }: { initial: Record<string, unknown>; roomTypes: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial, roomTypeId: initial.roomTypeId ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields: FieldSpec[] = useMemo(() => [
    { key: 'name', label: 'Name / publication', type: 'text', placeholder: 'e.g. Condé Nast Traveller' },
    { key: 'location', label: 'Location (optional)', type: 'text', placeholder: 'e.g. London, UK' },
    { key: 'source', label: 'Source', type: 'select', options: [{ value: 'EDITORIAL', label: 'Editorial' }, { value: 'PRESS', label: 'Press' }, { value: 'GUEST', label: 'Guest' }] },
    { key: 'rating', label: 'Rating', type: 'select', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n})` })) },
    { key: 'title', label: 'Headline', type: 'text', span: 2 },
    { key: 'body', label: 'Quote', type: 'textarea', hint: 'At least 10 characters.' },
    { key: 'roomTypeId', label: 'Room type (optional)', type: 'select', options: [{ value: '', label: 'None / whole hotel' }, ...roomTypes.map((t) => ({ value: t.id, label: t.name }))] },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'APPROVED', label: 'Approved (visible)' }, { value: 'PENDING', label: 'Pending' }, { value: 'REJECTED', label: 'Rejected' }] },
    { key: 'isFeatured', label: 'Featured', type: 'boolean', hint: 'Show in featured testimonial spots.', span: 2 },
  ], [roomTypes]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: String(values.name ?? ''), location: String(values.location ?? ''), rating: Number(values.rating) || 5, title: String(values.title ?? ''), body: String(values.body ?? ''),
        roomTypeId: values.roomTypeId ? String(values.roomTypeId) : null, status: values.status, isFeatured: !!values.isFeatured, source: values.source,
      };
      return values.id ? put(`/admin/reviews/${values.id}`, body) : post('/admin/reviews', body);
    },
    onSuccess: () => { toast.success('Testimonial saved'); onSaved(); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(e instanceof Error ? e.message : 'Could not save'); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={values.id ? 'Edit testimonial' : 'Add testimonial'} description="Editorial and press quotes appear alongside guest reviews." wide
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button></>}>
      <FormGrid fields={fields} values={{ ...values, rating: String(values.rating ?? 5) }} setValue={(k, v) => setValues((s) => ({ ...s, [k]: v }))} errors={errors} />
    </Dialog>
  );
}
