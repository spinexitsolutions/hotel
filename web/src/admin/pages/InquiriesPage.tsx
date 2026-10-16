import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Inbox, Mail, MessageSquarePlus, Phone, UserRound, Users } from 'lucide-react';
import { get, patch } from '@/lib/api';
import { dateLong, dateTime, relTime, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, Pager, SearchBox, StatusBadge } from '../components/ui';

type Status = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'SPAM';
interface Inquiry {
  id: string; name: string; email: string; phone: string; type: string; subject: string; message: string; eventDate: string | null; guestCount: number | null;
  status: Status; assignedTo: { id: string; name: string } | null; internalNotes: { by: string; at: string; body: string }[] | null; createdAt: string; userId?: string | null;
}
type Paged<T> = { items: T[]; total: number; page: number; pages: number };

const STATUSES: { key: '' | Status; label: string }[] = [
  { key: '', label: 'All' }, { key: 'NEW', label: 'New' }, { key: 'IN_PROGRESS', label: 'In progress' }, { key: 'RESOLVED', label: 'Resolved' }, { key: 'SPAM', label: 'Spam' },
];
const TYPES = ['GENERAL', 'RESERVATION', 'WEDDING', 'EVENT', 'DINING', 'SPA', 'SUPPORT', 'FEEDBACK'];

export default function InquiriesPage() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const type = sp.get('type') ?? '';
  const selectedId = sp.get('id');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [debounced, status, type]);

  const update = (p: Record<string, string | null>) => setSp((cur) => {
    const n = new URLSearchParams(cur);
    for (const [k, v] of Object.entries(p)) if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });

  const query = { status, type, q: debounced, page };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'inquiries', query], queryFn: () => get<Paged<Inquiry>>('/admin/inquiries', query), placeholderData: keepPreviousData,
  });
  const newCount = useQuery({ queryKey: ['admin', 'inquiries', 'new-count'], queryFn: () => get<Paged<Inquiry>>('/admin/inquiries', { status: 'NEW', pageSize: 1 }) }).data?.total;

  // A deep-linked inquiry may not be on the current page/filter — look it up in recent inquiries.
  const inList = data?.items.find((i) => i.id === selectedId);
  const fallback = useQuery({
    queryKey: ['admin', 'inquiries', 'lookup', selectedId],
    queryFn: () => get<Paged<Inquiry>>('/admin/inquiries', { pageSize: 100 }),
    enabled: !!selectedId && !!data && !inList,
  });
  const selected = inList ?? fallback.data?.items.find((i) => i.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="Inquiries" description="Contact-form messages, event and wedding enquiries, and guest support requests."
        actions={newCount ? <Badge color="blue">{newCount} new</Badge> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <Card bodyClassName="p-0" className={cn(selectedId && 'hidden lg:block')}>
          <div className="space-y-3 border-b border-zinc-100 p-3">
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
              {STATUSES.map((s) => (
                <button key={s.key} type="button" role="tab" aria-selected={status === s.key} onClick={() => update({ status: s.key || null })}
                  className={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium', status === s.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>
                  {s.label}{s.key === 'NEW' && newCount ? <span className="ml-1 tabular-nums opacity-70">{newCount}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1 [&_input]:w-full"><SearchBox value={q} onChange={setQ} placeholder="Search inquiries…" /></div>
              <select className="admin-input w-auto" value={type} onChange={(e) => update({ type: e.target.value || null })} aria-label="Filter by type">
                <option value="">All types</option>
                {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </div>
          </div>
          {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
            <Empty title="No inquiries" body={status || type || debounced ? 'Nothing matches these filters.' : 'New messages from the website will appear here.'} />
          ) : (
            <ul className={cn('max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto transition-opacity', isFetching && 'opacity-60')}>
              {data.items.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => update({ id: i.id })} aria-current={i.id === selectedId}
                    className={cn('block w-full px-4 py-3 text-left transition hover:bg-zinc-50', i.id === selectedId && 'bg-zinc-100 hover:bg-zinc-100')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-sm', i.status === 'NEW' ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700')}>
                        {i.status === 'NEW' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-500 align-middle" aria-label="Unread" />}{i.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">{relTime(i.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-zinc-700">{i.subject || titleCase(i.type)}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{i.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{titleCase(i.type)}</Badge>
                      <StatusBadge status={i.status} />
                      {i.assignedTo && <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><UserRound className="h-3 w-3" aria-hidden />{i.assignedTo.name}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
        </Card>

        <div className={cn('min-w-0', !selectedId && 'hidden lg:block')}>
          {selected ? <InquiryDetail key={selected.id} inquiry={selected} onClose={() => update({ id: null })} />
            : selectedId && (fallback.isLoading || isLoading) ? <Card><Loading /></Card>
            : selectedId ? <Card><Empty title="Inquiry not found" body="It may have been removed, or is older than the most recent 100 inquiries. Try searching for it." action={<button className="admin-btn-secondary" onClick={() => update({ id: null })}>Back to list</button>} /></Card>
            : <Card><div className="flex flex-col items-center py-16 text-center text-zinc-400"><Inbox className="h-8 w-8" aria-hidden /><p className="mt-2 text-sm">Select an inquiry to read it.</p></div></Card>}
        </div>
      </div>
    </div>
  );
}

function InquiryDetail({ inquiry: i, onClose }: { inquiry: Inquiry; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const staff = useQuery({ queryKey: ['admin', 'staff', 'directory'], queryFn: () => get<{ items: { id: string; name: string }[] }>('/admin/staff/directory'), staleTime: 5 * 60_000 });

  const mut = useMutation({
    mutationFn: (body: { status: Status; assignedToId?: string | null; note?: string }) => patch(`/admin/inquiries/${i.id}`, body),
    onSuccess: (_d, body) => {
      if (body.note) setNote('');
      toast.success(body.note ? 'Note added' : 'Inquiry updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const notes = useMemo(() => (Array.isArray(i.internalNotes) ? i.internalNotes : []), [i.internalNotes]);
  const replySubject = `Re: ${i.subject || `Your ${titleCase(i.type).toLowerCase()} enquiry`}`;
  const replyBody = `\n\n\n— On ${dateTime(i.createdAt)}, ${i.name} wrote:\n> ${i.message.split('\n').join('\n> ')}`;
  const mailto = `mailto:${i.email}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`;

  return (
    <div className="space-y-6">
      <Card>
        <button type="button" onClick={onClose} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> All inquiries</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge>{titleCase(i.type)}</Badge><StatusBadge status={i.status} /></div>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">{i.subject || `${titleCase(i.type)} enquiry`}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Received {dateTime(i.createdAt)} ({relTime(i.createdAt)})</p>
          </div>
          <a href={mailto} className="admin-btn-primary"><Mail className="h-4 w-4" /> Reply by email</a>
        </div>

        <dl className="mt-4 grid gap-3 rounded-lg bg-zinc-50 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-zinc-500">From</dt><dd className="font-medium">{i.name}{i.userId && <Link to={`/admin/customers/${i.userId}`} className="ml-2 text-xs font-normal text-zinc-500 underline">View customer</Link>}</dd></div>
          <div><dt className="text-xs text-zinc-500">Email</dt><dd><a href={`mailto:${i.email}`} className="break-all hover:underline">{i.email}</a></dd></div>
          {i.phone && <div><dt className="text-xs text-zinc-500">Phone</dt><dd><a href={`tel:${i.phone.replace(/[^+0-9]/g, '')}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{i.phone}</a></dd></div>}
          {i.eventDate && <div><dt className="text-xs text-zinc-500">Event date</dt><dd className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{dateLong(i.eventDate)}</dd></div>}
          {i.guestCount != null && <div><dt className="text-xs text-zinc-500">Guests</dt><dd className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{i.guestCount}</dd></div>}
        </dl>

        <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{i.message}</div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Workflow">
          <div className="space-y-4">
            <div>
              <p className="admin-label" id="status-label">Status</p>
              <div className="inline-flex flex-wrap rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-labelledby="status-label">
                {STATUSES.filter((s) => s.key).map((s) => (
                  <button key={s.key} type="button" disabled={mut.isPending} aria-pressed={i.status === s.key} onClick={() => i.status !== s.key && mut.mutate({ status: s.key as Status })}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-medium', i.status === s.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>{s.label}</button>
                ))}
              </div>
            </div>
            <Labeled label="Assigned to" htmlFor="inq-assign">
              <select id="inq-assign" className="admin-input" value={i.assignedTo?.id ?? ''} disabled={mut.isPending || staff.isLoading}
                onChange={(e) => mut.mutate({ status: i.status === 'NEW' && e.target.value ? 'IN_PROGRESS' : i.status, assignedToId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {i.assignedTo && !staff.data?.items.some((s) => s.id === i.assignedTo!.id) && <option value={i.assignedTo.id}>{i.assignedTo.name}</option>}
                {staff.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Labeled>
            {staff.error && <p className="text-xs text-red-600">Could not load staff list.</p>}
            {i.status === 'NEW' && <p className="text-xs text-zinc-500">Assigning a new inquiry moves it to “In progress”.</p>}
          </div>
        </Card>

        <Card title={`Internal notes${notes.length ? ` (${notes.length})` : ''}`}>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) mut.mutate({ status: i.status, note: note.trim() }); }}>
            <label htmlFor="inq-note" className="sr-only">Add an internal note</label>
            <textarea id="inq-note" className="admin-input" rows={3} maxLength={2000} placeholder="Add a note for the team (not sent to the guest)…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex justify-end">
              <button type="submit" className="admin-btn-secondary" disabled={!note.trim() || mut.isPending}><MessageSquarePlus className="h-4 w-4" /> Add note</button>
            </div>
          </form>
          {notes.length > 0 && (
            <ol className="mt-4 space-y-3">
              {notes.map((n, idx) => (
                <li key={`${n.at}-${idx}`} className="rounded-lg border border-zinc-200 p-3">
                  <p className="whitespace-pre-wrap text-sm text-zinc-800">{n.body}</p>
                  <p className="mt-1 text-xs text-zinc-500">{n.by} · {dateTime(n.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
