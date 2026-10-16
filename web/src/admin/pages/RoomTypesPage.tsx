import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BedDouble, CalendarRange, ImageOff, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { del, get, errorMessage } from '@/lib/api';
import { money, titleCase } from '@/lib/format';
import { srcFor } from '@/lib/image';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Toggle, useConfirm } from '../components/ui';

interface AdminRoomType {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  basePrice: number;
  weekendPrice: number | null;
  status: string;
  isFeatured: boolean;
  images: { url: string; alt: string }[];
  roomCount: number;
  bookingCount: number;
}

export default function RoomTypesPage() {
  const { can } = useAuth();
  const canManage = can('rooms.manage');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [params, setParams] = useSearchParams();
  const showArchived = params.get('archived') === '1';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'room-types', { archived: showArchived }],
    queryFn: () => get<{ items: AdminRoomType[] }>('/admin/room-types', showArchived ? { archived: 1 } : undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del<{ ok: boolean; archived: boolean }>(`/admin/room-types/${id}`),
    onSuccess: (r) => {
      toast.success(r?.archived ? 'Room type archived (it has booking history)' : 'Room type deleted');
      void qc.invalidateQueries({ queryKey: ['admin', 'room-types'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onDelete = async (t: AdminRoomType) => {
    const willArchive = t.bookingCount > 0;
    const ok = await confirm({
      title: willArchive ? `Archive ${t.name}?` : `Delete ${t.name}?`,
      body: willArchive
        ? `This room type has ${t.bookingCount} booking${t.bookingCount === 1 ? '' : 's'}, so it will be archived and hidden from the website instead of deleted.`
        : `This permanently deletes the room type and its ${t.roomCount} physical room${t.roomCount === 1 ? '' : 's'}. This cannot be undone.`,
      confirmLabel: willArchive ? 'Archive' : 'Delete',
      danger: true,
    });
    if (ok) remove.mutate(t.id);
  };

  // An already-archived type with bookings can't be removed further.
  const removable = (t: AdminRoomType) => t.status !== 'ARCHIVED' || t.bookingCount === 0;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Room types"
        description="Categories of accommodation guests can book, with pricing, occupancy and photography."
        actions={<>
          <Link to="/admin/rooms/inventory" className="admin-btn-secondary"><CalendarRange className="h-4 w-4" /> Inventory</Link>
          {canManage && <button className="admin-btn-primary" onClick={() => navigate('/admin/rooms/new')}><Plus className="h-4 w-4" /> New room type</button>}
        </>}
      />
      <Card bodyClassName="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <p className="text-xs text-zinc-500">{data ? `${items.length} room type${items.length === 1 ? '' : 's'}` : ''}</p>
          <div className="w-44">
            <Toggle checked={showArchived} label="Show archived" onChange={(v) => {
              const p = new URLSearchParams(params);
              if (v) p.set('archived', '1'); else p.delete('archived');
              setParams(p, { replace: true });
            }} />
          </div>
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !items.length ? (
          <Empty title="No room types yet" body="Create your first room type to start taking reservations."
            action={canManage && <button className="admin-btn-primary" onClick={() => navigate('/admin/rooms/new')}><Plus className="h-4 w-4" /> New room type</button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="w-20">Image</th><th>Name</th><th>Category</th><th className="text-right">Base price</th><th>Status</th>
                    <th className="text-center">Featured</th><th className="text-right">Rooms</th><th className="text-right">Bookings</th>
                    {canManage && <th className="w-24 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/admin/rooms/${t.id}`)}>
                      <td><Thumb t={t} /></td>
                      <td>
                        <Link to={`/admin/rooms/${t.id}`} className="font-medium text-zinc-900 hover:underline" onClick={(e) => e.stopPropagation()}>{t.name}</Link>
                        {t.tagline && <p className="max-w-xs truncate text-xs text-zinc-500">{t.tagline}</p>}
                      </td>
                      <td>{titleCase(t.category)}</td>
                      <td className="text-right tabular-nums">
                        {money(t.basePrice)}
                        {t.weekendPrice != null && <p className="text-xs text-zinc-500">Weekend {money(t.weekendPrice)}</p>}
                      </td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="text-center">{t.isFeatured ? <Star className="mx-auto h-4 w-4 fill-amber-400 text-amber-400" aria-label="Featured" /> : <span className="text-zinc-300">—</span>}</td>
                      <td className="text-right tabular-nums">{t.roomCount}</td>
                      <td className="text-right tabular-nums">{t.bookingCount}</td>
                      {canManage && (
                        <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <button className="admin-btn-ghost !p-1.5" aria-label={`Edit ${t.name}`} onClick={() => navigate(`/admin/rooms/${t.id}`)}><Pencil className="h-4 w-4" /></button>
                          {removable(t) && (
                            <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label={t.bookingCount > 0 ? `Archive ${t.name}` : `Delete ${t.name}`} disabled={remove.isPending} onClick={() => onDelete(t)}><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-zinc-100 md:hidden">
              {items.map((t) => (
                <li key={t.id} className="flex gap-3 p-4">
                  <Link to={`/admin/rooms/${t.id}`} className="flex min-w-0 flex-1 gap-3">
                    <Thumb t={t} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium text-zinc-900">{t.name}{t.isFeatured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}</p>
                      <p className="text-xs text-zinc-500">{titleCase(t.category)} · {money(t.basePrice)}/night</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        <Badge><BedDouble className="mr-1 h-3 w-3" />{t.roomCount} rooms</Badge>
                        <Badge>{t.bookingCount} bookings</Badge>
                      </div>
                    </div>
                  </Link>
                  {canManage && removable(t) && (
                    <button className="admin-btn-ghost self-start !p-1.5 text-red-600" aria-label={t.bookingCount > 0 ? `Archive ${t.name}` : `Delete ${t.name}`} onClick={() => onDelete(t)}><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {dialog}
    </div>
  );
}

function Thumb({ t }: { t: AdminRoomType }) {
  const img = t.images[0];
  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 text-zinc-400">
      {img ? <img src={srcFor(img.url, 160)} alt={img.alt || t.name} className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="h-4 w-4" aria-hidden />}
    </div>
  );
}
