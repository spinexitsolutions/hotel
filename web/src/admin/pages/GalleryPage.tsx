import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, PlayCircle, Trash2 } from 'lucide-react';
import { GALLERY_CATEGORIES } from '@aurelle/shared';
import { ApiError, del, errorMessage, get, post, put } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { srcFor } from '@/lib/image';
import { cn } from '@/lib/cn';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormGrid, type FieldSpec } from '../components/CrudPage';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, useConfirm } from '../components/ui';

type Category = (typeof GALLERY_CATEGORIES)[number];
interface GalleryItem { id: string; url: string; alt: string; caption: string; category: Category; type: 'IMAGE' | 'VIDEO'; videoUrl: string; sortOrder: number; isPublished: boolean; createdAt?: string }

const fields: FieldSpec[] = [
  { key: 'url', label: 'Image', type: 'image', hint: 'For videos, this is the poster image.' },
  { key: 'alt', label: 'Alt text', type: 'text', span: 2, hint: 'Required (at least 3 characters). Describe what the image shows for screen readers.' },
  { key: 'caption', label: 'Caption', type: 'text', span: 2, hint: 'Optional, shown in the lightbox.' },
  { key: 'category', label: 'Category', type: 'select', options: GALLERY_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) })) },
  { key: 'type', label: 'Type', type: 'select', options: [{ value: 'IMAGE', label: 'Image' }, { value: 'VIDEO', label: 'Video' }] },
  { key: 'videoUrl', label: 'Video URL', type: 'text', span: 2, placeholder: 'https://www.youtube.com/watch?v=… or https://…/video.mp4', when: (v) => v.type === 'VIDEO' },
  { key: 'sortOrder', label: 'Sort order', type: 'number', hint: 'Lower numbers appear first. You can also use the arrows on each tile.' },
  { key: 'isPublished', label: 'Published', type: 'boolean', hint: 'Hidden items are not shown on the website.' },
];

const bodyOf = (i: Pick<GalleryItem, 'url' | 'alt' | 'caption' | 'category' | 'type' | 'videoUrl' | 'sortOrder' | 'isPublished'>) => ({
  url: i.url, alt: String(i.alt ?? '').trim(), caption: i.caption ?? '', category: i.category, type: i.type, videoUrl: i.type === 'VIDEO' ? (i.videoUrl ?? '') : '', sortOrder: Number(i.sortOrder) || 0, isPublished: !!i.isPublished,
});

export default function GalleryPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [category, setCategory] = useState<'' | Category>('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const key = ['admin', '/gallery', 'grid', category];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => get<{ items: GalleryItem[]; total: number }>('/admin/gallery', { category, pageSize: 100 }),
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => ({ published: items.filter((i) => i.isPublished).length, total: data?.total ?? 0 }), [items, data]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', '/gallery'] });

  const save = useMutation({
    mutationFn: (f: Record<string, unknown>) => { const b = bodyOf(f as unknown as GalleryItem); return f.id ? put(`/admin/gallery/${f.id}`, b) : post('/admin/gallery', b); },
    onSuccess: (_r, f) => { toast.success(f.id ? 'Gallery item saved' : 'Added to gallery'); setEditing(null); void invalidate(); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/gallery/${id}`),
    onSuccess: () => { toast.success('Removed from gallery'); void invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const quickUpdate = async (updates: { item: GalleryItem; patch: Partial<GalleryItem> }[]) => {
    setBusyId(updates[0]?.item.id ?? null);
    try {
      for (const u of updates) await put(`/admin/gallery/${u.item.id}`, bodyOf({ ...u.item, ...u.patch }));
      await invalidate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusyId(null); }
  };

  /** Moves an item one step; swaps sort orders, or renumbers the visible list when orders collide. */
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[idx];
    const b = items[j];
    const unique = new Set(items.map((i) => i.sortOrder)).size === items.length;
    if (unique) return quickUpdate([{ item: a, patch: { sortOrder: b.sortOrder } }, { item: b, patch: { sortOrder: a.sortOrder } }]);
    const order = [...items];
    [order[idx], order[j]] = [order[j], order[idx]];
    const updates = order.map((it, n) => ({ item: it, patch: { sortOrder: n * 10 } })).filter((u) => u.item.sortOrder !== u.patch.sortOrder);
    return quickUpdate(updates);
  };

  const openNew = () => {
    setErrors({});
    const max = items.reduce((m, i) => Math.max(m, i.sortOrder), 0);
    setEditing({ url: '', alt: '', caption: '', category: category || 'HOTEL', type: 'IMAGE', videoUrl: '', sortOrder: String(items.length ? max + 10 : 0), isPublished: true });
  };

  return (
    <div>
      <PageHeader title="Gallery" description="Photos and videos on the website gallery, grouped by category. Order matters: the first items appear first."
        actions={<button className="admin-btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Add item</button>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-label="Filter by category">
            {(['', ...GALLERY_CATEGORIES] as const).map((c) => (
              <button key={c || 'all'} onClick={() => setCategory(c)} aria-pressed={category === c}
                className={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium', category === c ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>
                {c ? titleCase(c) : 'All'}
              </button>
            ))}
          </div>
        </div>
        {data && <p className="text-xs text-zinc-500">{counts.total} item{counts.total === 1 ? '' : 's'} · {counts.published} published</p>}
      </div>

      {isLoading ? <Card><Loading /></Card> : error ? <ErrorBox error={error} onRetry={() => refetch()} /> : !items.length ? (
        <Card><Empty title={category ? `No ${titleCase(category).toLowerCase()} items yet` : 'The gallery is empty'} body="Add photos of the hotel, rooms, dining and experiences." action={<button className="admin-btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Add item</button>} /></Card>
      ) : (
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((it, idx) => (
            <li key={it.id} className={cn('group overflow-hidden rounded-lg border bg-white transition', it.isPublished ? 'border-zinc-200' : 'border-dashed border-zinc-300', busyId === it.id && 'opacity-60')}>
              <div className="relative aspect-[4/3] bg-zinc-100">
                <img src={srcFor(it.url, 480)} alt={it.alt} loading="lazy" className={cn('h-full w-full object-cover', !it.isPublished && 'opacity-50 grayscale')} onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                  <Badge>{titleCase(it.category)}</Badge>
                  {it.type === 'VIDEO' && <Badge color="blue"><PlayCircle className="mr-1 h-3 w-3" />Video</Badge>}
                  {!it.isPublished && <Badge color="amber">Hidden</Badge>}
                </div>
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white" title="Sort order">#{it.sortOrder}</span>
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium text-zinc-800" title={it.alt}>{it.alt}</p>
                <p className="truncate text-[11px] text-zinc-500" title={it.caption}>{it.caption || ' '}</p>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <div className="flex gap-0.5">
                    <button className="admin-btn-ghost !p-1.5" disabled={idx === 0 || !!busyId} onClick={() => move(idx, -1)} aria-label={`Move “${it.alt}” earlier`} title="Move earlier"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button className="admin-btn-ghost !p-1.5" disabled={idx === items.length - 1 || !!busyId} onClick={() => move(idx, 1)} aria-label={`Move “${it.alt}” later`} title="Move later"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex gap-0.5">
                    <button className="admin-btn-ghost !p-1.5" disabled={!!busyId} onClick={() => quickUpdate([{ item: it, patch: { isPublished: !it.isPublished } }])} aria-label={it.isPublished ? 'Hide from website' : 'Publish on website'} title={it.isPublished ? 'Hide' : 'Publish'}>
                      {it.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button className="admin-btn-ghost !p-1.5" onClick={() => { setErrors({}); setEditing({ ...it, sortOrder: String(it.sortOrder) }); }} aria-label={`Edit “${it.alt}”`} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label={`Delete “${it.alt}”`} title="Delete"
                      onClick={async () => { if (await confirm({ title: 'Remove this item from the gallery?', body: 'The image stays in the media library.', confirmLabel: 'Remove', danger: true })) remove.mutate(it.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data && data.total > items.length && <p className="mt-3 text-xs text-zinc-500">Showing the first {items.length} of {data.total}. Filter by category to see the rest.</p>}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)} title={editing.id ? 'Edit gallery item' : 'Add gallery item'} wide
          footer={<><button className="admin-btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={() => {
            const errs: Record<string, string> = {};
            if (!editing.url) errs.url = 'Choose an image';
            if (String(editing.alt ?? '').trim().length < 3) errs.alt = 'Describe the image for screen readers (at least 3 characters)';
            setErrors(errs);
            if (!Object.keys(errs).length) save.mutate(editing);
          }}>{save.isPending ? 'Saving…' : 'Save'}</button></>}>
          {errors.url && <p className="mb-3 text-xs text-red-600" role="alert">{errors.url}</p>}
          <FormGrid fields={fields} values={editing} setValue={(k, v) => setEditing((s) => (s ? { ...s, [k]: v } : s))} errors={errors} />
        </Dialog>
      )}
      {dialog}
    </div>
  );
}
