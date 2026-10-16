import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { addDays, todayInZone } from '@aurelle/shared';
import { ApiError, del, errorMessage, get, patch, post, put } from '@/lib/api';
import { dateLong, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, StatusBadge, useConfirm } from '../components/ui';

// ─── Types ──────────────────────────────────────────────────────────────────
interface RoomBlock { id: string; startDate: string; endDate: string; reason: string }
interface PhysicalRoom {
  id: string; number: string; floor: string; status: 'AVAILABLE' | 'OUT_OF_SERVICE'; housekeeping: 'CLEAN' | 'DIRTY' | 'INSPECTED'; notes: string;
  roomType: { id: string; name: string };
  occupant: { id: string; reference: string; guestFirstName: string; guestLastName: string; status: string; checkOut: string } | null;
  blocks: RoomBlock[];
}
interface RoomTypeLite { id: string; name: string; status: string }
interface Blackout { id: string; roomTypeId: string | null; roomType: { name: string } | null; startDate: string; endDate: string; reason: string }
interface Night { date: string; total: number; sold: number; blocked: number; available: number; closed: boolean }
interface InventoryResp { from: string; days: number; types: { id: string; name: string; nights: Night[] }[] }

const HOUSEKEEPING = ['CLEAN', 'DIRTY', 'INSPECTED'] as const;
const TABS = [
  { key: 'rooms', label: 'Physical rooms', icon: Wrench },
  { key: 'blackouts', label: 'Blackout dates', icon: Ban },
  { key: 'grid', label: 'Availability', icon: CalendarDays },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const today = () => todayInZone('Asia/Kolkata');
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const isWeekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 5 || d === 6; };

function useRoomTypes() {
  return useQuery({ queryKey: ['admin', 'room-types', { archived: false }], queryFn: () => get<{ items: RoomTypeLite[] }>('/admin/room-types') });
}

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'rooms') as TabKey;
  const setTab = (k: TabKey) => { const p = new URLSearchParams(params); p.set('tab', k); setParams(p, { replace: true }); };

  return (
    <div>
      <PageHeader
        back={<Link to="/admin/rooms" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"><ChevronLeft className="h-3.5 w-3.5" /> Room types</Link>}
        title="Inventory"
        description="Physical rooms, maintenance blocks, stop-sell dates and nightly availability."
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist" aria-label="Inventory sections">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition', tab === t.key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'blackouts' && <BlackoutsTab />}
        {tab === 'grid' && <AvailabilityTab />}
      </div>
    </div>
  );
}

// ─── Physical rooms ─────────────────────────────────────────────────────────
type RoomForm = { id?: string; number: string; floor: string; roomTypeId: string; status: 'AVAILABLE' | 'OUT_OF_SERVICE'; housekeeping: 'CLEAN' | 'DIRTY' | 'INSPECTED'; notes: string };

function RoomsTab() {
  const { can } = useAuth();
  const canRooms = can('rooms.manage');
  const canHk = can('bookings.manage');
  const canBlock = can('inventory.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<RoomForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocking, setBlocking] = useState<PhysicalRoom | null>(null);

  const roomsQ = useQuery({ queryKey: ['admin', 'rooms'], queryFn: () => get<{ items: PhysicalRoom[] }>('/admin/rooms') });
  const typesQ = useRoomTypes();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'room-types'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'tape-chart'] });
  };

  const save = useMutation({
    mutationFn: ({ id, ...body }: RoomForm) => (id ? put(`/admin/rooms/${id}`, body) : post('/admin/rooms', body)),
    onSuccess: () => { toast.success('Room saved'); setEditing(null); invalidate(); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/rooms/${id}`),
    onSuccess: () => { toast.success('Room removed'); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const hk = useMutation({
    mutationFn: ({ id, housekeeping }: { id: string; housekeeping: string }) => patch(`/admin/rooms/${id}/housekeeping`, { housekeeping }),
    onSuccess: () => { toast.success('Housekeeping updated'); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => del(`/admin/room-blocks/${id}`),
    onSuccess: () => { toast.success('Block removed'); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rooms: PhysicalRoom[] }>();
    for (const r of roomsQ.data?.items ?? []) {
      const g = map.get(r.roomType.id) ?? { id: r.roomType.id, name: r.roomType.name, rooms: [] };
      g.rooms.push(r);
      map.set(r.roomType.id, g);
    }
    const order = new Map((typesQ.data?.items ?? []).map((t, i) => [t.id, i]));
    return Array.from(map.values()).sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name));
  }, [roomsQ.data, typesQ.data]);

  const openNew = (roomTypeId?: string) => {
    setErrors({});
    setEditing({ number: '', floor: '', roomTypeId: roomTypeId ?? typesQ.data?.items[0]?.id ?? '', status: 'AVAILABLE', housekeeping: 'CLEAN', notes: '' });
  };

  if (roomsQ.isLoading) return <Loading />;
  if (roomsQ.error) return <ErrorBox error={roomsQ.error} onRetry={() => roomsQ.refetch()} />;
  const total = roomsQ.data?.items.length ?? 0;
  const oos = roomsQ.data?.items.filter((r) => r.status === 'OUT_OF_SERVICE').length ?? 0;
  const dirty = roomsQ.data?.items.filter((r) => r.housekeeping === 'DIRTY').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{total} rooms · {oos} out of service · {dirty} awaiting housekeeping</p>
        {canRooms && <button className="admin-btn-primary" onClick={() => openNew()} disabled={!typesQ.data?.items.length}><Plus className="h-4 w-4" /> Add room</button>}
      </div>
      {!groups.length ? (
        <Card><Empty title="No physical rooms yet" body="Add the numbered rooms that belong to each room type so they can be sold and assigned." action={canRooms && <button className="admin-btn-primary" onClick={() => openNew()}><Plus className="h-4 w-4" /> Add room</button>} /></Card>
      ) : groups.map((g) => (
        <Card key={g.id} bodyClassName="p-0"
          title={<span className="flex items-center gap-2">{g.name}<Badge>{g.rooms.length}</Badge></span>}
          actions={canRooms && <button className="admin-btn-ghost !py-1 text-xs" onClick={() => openNew(g.id)}><Plus className="h-3.5 w-3.5" /> Add</button>}>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th>Room</th><th>Status</th><th>Housekeeping</th><th>In house</th><th>Maintenance blocks</th>{(canRooms || canBlock) && <th className="text-right">Actions</th>}</tr></thead>
              <tbody>
                {g.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <p className="font-medium text-zinc-900">{r.number}</p>
                      <p className="text-xs text-zinc-500">{r.floor ? `Floor ${r.floor}` : '—'}</p>
                      {r.notes && <p className="max-w-[16rem] truncate text-xs text-zinc-500" title={r.notes}>{r.notes}</p>}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {canHk ? (
                        <select className="admin-input w-32 py-1 text-xs" value={r.housekeeping} aria-label={`Housekeeping status for room ${r.number}`} disabled={hk.isPending}
                          onChange={(e) => hk.mutate({ id: r.id, housekeeping: e.target.value })}>
                          {HOUSEKEEPING.map((h) => <option key={h} value={h}>{h[0] + h.slice(1).toLowerCase()}</option>)}
                        </select>
                      ) : <StatusBadge status={r.housekeeping} />}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.occupant ? (
                        <Link to={`/admin/bookings/${r.occupant.id}`} className="hover:underline">
                          <span className="block text-sm">{r.occupant.guestFirstName} {r.occupant.guestLastName}</span>
                          <span className="block text-xs text-zinc-500">{r.occupant.reference} · out {dateShort(r.occupant.checkOut)}</span>
                        </Link>
                      ) : <span className="text-xs text-zinc-400">Vacant</span>}
                    </td>
                    <td>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {r.blocks.map((b) => (
                          <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700" title={b.reason}>
                            {dateShort(b.startDate)} → {dateShort(b.endDate)}{b.reason ? ` · ${b.reason}` : ''}
                            {canBlock && (
                              <button className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-red-600" aria-label={`Remove block ${b.startDate} to ${b.endDate} on room ${r.number}`}
                                onClick={async () => { if (await confirm({ title: 'Remove this block?', body: `Room ${r.number} will become sellable from ${dateLong(b.startDate)}.`, confirmLabel: 'Remove' })) unblock.mutate(b.id); }}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                        {!r.blocks.length && <span className="text-xs text-zinc-400">—</span>}
                      </div>
                    </td>
                    {(canRooms || canBlock) && (
                      <td className="whitespace-nowrap text-right">
                        {canBlock && <button className="admin-btn-ghost !px-2 !py-1 text-xs" onClick={() => setBlocking(r)} aria-label={`Block room ${r.number} for maintenance`}><Wrench className="h-3.5 w-3.5" /> Block</button>}
                        {canRooms && <>
                          <button className="admin-btn-ghost !p-1.5" aria-label={`Edit room ${r.number}`} onClick={() => { setErrors({}); setEditing({ id: r.id, number: r.number, floor: r.floor, roomTypeId: r.roomType.id, status: r.status, housekeeping: r.housekeeping, notes: r.notes }); }}><Pencil className="h-4 w-4" /></button>
                          <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label={`Delete room ${r.number}`}
                            onClick={async () => { if (await confirm({ title: `Remove room ${r.number}?`, body: 'Rooms with past stays are archived; rooms with upcoming reservations cannot be removed.', confirmLabel: 'Remove', danger: true })) remove.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)} title={editing.id ? `Edit room ${editing.number}` : 'Add room'}
          footer={<><button className="admin-btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={() => save.mutate(editing)}>{save.isPending ? 'Saving…' : 'Save'}</button></>}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <Labeled label="Room number" error={errors.number} htmlFor="room-number">
              <input id="room-number" className="admin-input" value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} autoFocus />
            </Labeled>
            <Labeled label="Floor" error={errors.floor} htmlFor="room-floor">
              <input id="room-floor" className="admin-input" value={editing.floor} onChange={(e) => setEditing({ ...editing, floor: e.target.value })} />
            </Labeled>
            <Labeled label="Room type" error={errors.roomTypeId} htmlFor="room-type" className="sm:col-span-2">
              <select id="room-type" className="admin-input" value={editing.roomTypeId} onChange={(e) => setEditing({ ...editing, roomTypeId: e.target.value })}>
                {(typesQ.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="Status" error={errors.status} htmlFor="room-status">
              <select id="room-status" className="admin-input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as RoomForm['status'] })}>
                <option value="AVAILABLE">Available</option>
                <option value="OUT_OF_SERVICE">Out of service</option>
              </select>
            </Labeled>
            <Labeled label="Housekeeping" error={errors.housekeeping} htmlFor="room-hk">
              <select id="room-hk" className="admin-input" value={editing.housekeeping} onChange={(e) => setEditing({ ...editing, housekeeping: e.target.value as RoomForm['housekeeping'] })}>
                {HOUSEKEEPING.map((h) => <option key={h} value={h}>{h[0] + h.slice(1).toLowerCase()}</option>)}
              </select>
            </Labeled>
            <Labeled label="Notes" error={errors.notes} htmlFor="room-notes" className="sm:col-span-2">
              <textarea id="room-notes" className="admin-input" rows={3} maxLength={500} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Labeled>
            <button type="submit" className="hidden" />
          </form>
        </Dialog>
      )}
      {blocking && <BlockDialog room={blocking} onClose={() => setBlocking(null)} onDone={invalidate} />}
      {dialog}
    </div>
  );
}

function BlockDialog({ room, onClose, onDone }: { room: PhysicalRoom; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ startDate: today(), endDate: addDays(today(), 1), reason: 'Maintenance' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => post('/admin/room-blocks', { roomId: room.id, ...form }),
    onSuccess: () => { toast.success(`Room ${room.number} blocked`); onDone(); onClose(); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });
  const invalid = !form.startDate || !form.endDate || form.endDate <= form.startDate;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Block room ${room.number}`} description="The room can't be sold or assigned for these nights. The end date is the first night it's available again."
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={invalid || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Blocking…' : 'Block room'}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="First blocked night" error={errors.startDate} htmlFor="blk-start">
          <input id="blk-start" type="date" className="admin-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate <= e.target.value ? addDays(e.target.value, 1) : form.endDate })} />
        </Labeled>
        <Labeled label="Available again on" error={errors.endDate ?? (invalid && form.endDate ? 'Must be after the first night' : undefined)} htmlFor="blk-end">
          <input id="blk-end" type="date" className="admin-input" min={form.startDate ? addDays(form.startDate, 1) : undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Labeled>
        <Labeled label="Reason" error={errors.reason} htmlFor="blk-reason" className="sm:col-span-2">
          <input id="blk-reason" className="admin-input" maxLength={200} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Labeled>
      </div>
    </Dialog>
  );
}

// ─── Blackouts ──────────────────────────────────────────────────────────────
function BlackoutsTab() {
  const { can } = useAuth();
  const canManage = can('inventory.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ roomTypeId: '', startDate: today(), endDate: today(), reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['admin', 'blackouts'], queryFn: () => get<{ items: Blackout[] }>('/admin/blackouts') });
  const typesQ = useRoomTypes();
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['admin', 'blackouts'] }); void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] }); };

  const create = useMutation({
    mutationFn: () => post('/admin/blackouts', { ...form, roomTypeId: form.roomTypeId || null }),
    onSuccess: () => { toast.success('Stop-sell added'); setOpen(false); invalidate(); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/blackouts/${id}`),
    onSuccess: () => { toast.success('Stop-sell removed'); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const t = today();
  const invalid = !form.startDate || !form.endDate || form.endDate < form.startDate;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-500">Stop-sell dates close a room type (or the whole hotel) to new online bookings. Existing reservations are not affected. End dates are inclusive.</p>
        {canManage && <button className="admin-btn-primary" onClick={() => { setErrors({}); setForm({ roomTypeId: '', startDate: t, endDate: t, reason: '' }); setOpen(true); }}><Plus className="h-4 w-4" /> Add stop-sell</button>}
      </div>
      <Card bodyClassName="p-0">
        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div> : !q.data?.items.length ? (
          <Empty title="No blackout dates" body="All room types are open for sale on every date." />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th>Applies to</th><th>From</th><th>To (inclusive)</th><th>Reason</th><th>State</th>{canManage && <th className="text-right">Actions</th>}</tr></thead>
              <tbody>
                {q.data.items.map((b) => {
                  const past = b.endDate < t;
                  const active = b.startDate <= t && b.endDate >= t;
                  return (
                    <tr key={b.id} className={cn(past && 'opacity-60')}>
                      <td>{b.roomType ? b.roomType.name : <Badge color="red">Whole hotel</Badge>}</td>
                      <td className="whitespace-nowrap">{dateLong(b.startDate)}</td>
                      <td className="whitespace-nowrap">{dateLong(b.endDate)}</td>
                      <td className="max-w-xs truncate">{b.reason || <span className="text-zinc-400">—</span>}</td>
                      <td>{past ? <Badge>Past</Badge> : active ? <Badge color="red">Active</Badge> : <Badge color="blue">Upcoming</Badge>}</td>
                      {canManage && (
                        <td className="text-right">
                          <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label={`Delete stop-sell ${b.startDate} to ${b.endDate}`}
                            onClick={async () => { if (await confirm({ title: 'Remove this stop-sell?', body: 'These dates will reopen for sale immediately.', confirmLabel: 'Remove', danger: true })) remove.mutate(b.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <Dialog open onOpenChange={setOpen} title="Add stop-sell dates"
          footer={<><button className="admin-btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="admin-btn-primary" disabled={invalid || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Saving…' : 'Close dates'}</button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Applies to" error={errors.roomTypeId} htmlFor="bo-type" className="sm:col-span-2">
              <select id="bo-type" className="admin-input" value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}>
                <option value="">Whole hotel (all room types)</option>
                {(typesQ.data?.items ?? []).map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="From" error={errors.startDate} htmlFor="bo-start">
              <input id="bo-start" type="date" className="admin-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} />
            </Labeled>
            <Labeled label="To (inclusive)" error={errors.endDate ?? (invalid && form.endDate ? 'Must be on or after the start date' : undefined)} htmlFor="bo-end">
              <input id="bo-end" type="date" className="admin-input" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Labeled>
            <Labeled label="Reason (internal)" error={errors.reason} htmlFor="bo-reason" className="sm:col-span-2">
              <input id="bo-reason" className="admin-input" maxLength={200} placeholder="Private buy-out, renovation…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Labeled>
          </div>
        </Dialog>
      )}
      {dialog}
    </div>
  );
}

// ─── Availability grid ──────────────────────────────────────────────────────
const DAYS = 14;

function occupancyClass(n: Night) {
  if (n.closed) return '';
  if (n.total === 0) return 'bg-zinc-50 text-zinc-400';
  const r = (n.sold + n.blocked) / n.total;
  if (n.available === 0) return 'bg-zinc-900 text-white';
  if (r >= 0.75) return 'bg-zinc-700 text-white';
  if (r >= 0.5) return 'bg-zinc-400 text-white';
  if (r >= 0.25) return 'bg-zinc-200 text-zinc-900';
  if (r > 0) return 'bg-zinc-100 text-zinc-800';
  return 'bg-white text-zinc-700';
}
const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(220,38,38,0.18) 0 4px, transparent 4px 8px)' };

function AvailabilityTab() {
  const [from, setFrom] = useState(today);
  const q = useQuery({ queryKey: ['admin', 'inventory', from, DAYS], queryFn: () => get<InventoryResp>('/admin/inventory', { from, days: DAYS }) });
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const t = today();

  return (
    <Card bodyClassName="p-0"
      title="Nightly availability"
      actions={
        <div className="flex items-center gap-1">
          <button className="admin-btn-secondary !px-2 !py-1" onClick={() => setFrom(addDays(from, -DAYS))} aria-label="Previous 14 days"><ChevronLeft className="h-4 w-4" /></button>
          <button className="admin-btn-secondary !py-1 text-xs" onClick={() => setFrom(t)}>Today</button>
          <input type="date" className="admin-input w-auto py-1 text-xs" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Start date" />
          <button className="admin-btn-secondary !px-2 !py-1" onClick={() => setFrom(addDays(from, DAYS))} aria-label="Next 14 days"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }>
      {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div> : !q.data?.types.length ? (
        <Empty title="No room types to show" body="Create a room type and add physical rooms to see availability." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[160px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-500">Room type</th>
                  {dates.map((d) => (
                    <th key={d} scope="col" className={cn('min-w-[56px] border-b border-l border-zinc-200 px-1 py-1.5 text-center font-medium', d === t ? 'bg-sky-50 text-sky-700' : isWeekend(d) ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-50 text-zinc-500')}>
                      <span className="block text-[10px] uppercase">{weekday(d)}</span>
                      <span className="block text-sm tabular-nums">{dayNum(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.types.map((rt) => (
                  <tr key={rt.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-zinc-100 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-900">
                      {rt.name}
                      <span className="block text-[11px] font-normal text-zinc-500">{rt.nights[0]?.total ?? 0} in service</span>
                    </th>
                    {dates.map((d) => {
                      const n = rt.nights.find((x) => x.date === d);
                      if (!n) return <td key={d} className="border-b border-l border-zinc-100" />;
                      return (
                        <td key={d} className={cn('h-12 border-b border-l border-zinc-100 text-center tabular-nums', occupancyClass(n), n.closed && 'bg-red-50 text-red-700', d === t && 'ring-1 ring-inset ring-sky-400')}
                          style={n.closed ? HATCH : undefined}
                          title={`${rt.name} · ${dateLong(d)}\n${n.closed ? 'CLOSED (stop-sell)\n' : ''}Available ${n.available} of ${n.total}\nSold ${n.sold} · Blocked ${n.blocked}`}>
                          {n.closed ? <span className="text-[10px] font-semibold uppercase">Closed</span> : (
                            <>
                              <span className="block text-sm font-semibold">{n.available}</span>
                              <span className="block text-[10px] opacity-70">/{n.total}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            <span>Cells show rooms available / in service.</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-zinc-200 bg-white" /> Empty</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-zinc-200" /> 25–50%</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-zinc-400" /> 50–75%</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-zinc-700" /> 75%+</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-zinc-900" /> Sold out</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-50 ring-1 ring-red-200" style={HATCH} /> Closed</span>
          </div>
        </>
      )}
    </Card>
  );
}
