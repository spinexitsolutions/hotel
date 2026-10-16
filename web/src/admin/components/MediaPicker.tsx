import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Link2, Upload, X } from 'lucide-react';
import { get, post, upload, errorMessage } from '@/lib/api';
import { srcFor } from '@/lib/image';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Loading } from './ui';

export interface MediaAsset { id: string; url: string; alt: string; folder: string; width: number | null; height: number | null; provider: string; size: number; createdAt: string }

export function UploadButton({ folder = 'general', onUploaded, label = 'Upload images' }: { folder?: string; onUploaded?: (a: MediaAsset[]) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        setBusy(true);
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        fd.append('folder', folder);
        try {
          const r = await upload<{ items: MediaAsset[] }>('/admin/cms/media', fd);
          toast.success(`Uploaded ${r.items.length} image${r.items.length > 1 ? 's' : ''}`);
          void qc.invalidateQueries({ queryKey: ['admin', 'media'] });
          onUploaded?.(r.items);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
          if (ref.current) ref.current.value = '';
        }
      }} />
      <button type="button" className="admin-btn-secondary" disabled={busy} onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />{busy ? 'Uploading & optimizing…' : label}</button>
    </>
  );
}

export function MediaPickerDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (url: string, alt: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'media', 'picker'], queryFn: () => get<{ items: MediaAsset[] }>('/admin/cms/media', { pageSize: 96 }), enabled: open });
  const [url, setUrl] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const addExternal = useMutation({
    mutationFn: () => post<MediaAsset>('/admin/cms/media/external', { url, alt: '' }),
    onSuccess: (a) => { void qc.invalidateQueries({ queryKey: ['admin', 'media'] }); onPick(a.url, a.alt); onOpenChange(false); setUrl(''); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Choose an image" description="Upload high-resolution JPEG, PNG or WebP (at least 1600px wide recommended). Images are optimized automatically." wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <UploadButton onUploaded={(a) => { if (a[0]) { onPick(a[0].url, a[0].alt); onOpenChange(false); } }} />
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (url) addExternal.mutate(); }}>
          <input className="admin-input" placeholder="…or paste an image URL (https://images.unsplash.com/…)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Image URL" />
          <button className="admin-btn-secondary" type="submit"><Link2 className="h-4 w-4" /> Use URL</button>
        </form>
      </div>
      {isLoading ? <Loading /> : (
        <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
          {(data?.items ?? []).map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m.url, m.alt); onOpenChange(false); }} className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 focus:ring-2 focus:ring-zinc-900" title={m.alt}>
              <img src={srcFor(m.url, 320)} alt={m.alt} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
            </button>
          ))}
          {!data?.items.length && <p className="col-span-full py-10 text-center text-sm text-zinc-500">The library is empty. Upload an image or paste a URL.</p>}
        </div>
      )}
    </Dialog>
  );
}

/** Image input with preview: pick from library, upload, paste URL, or clear. */
export function ImageField({ value, onChange, onAlt, onPick, label = 'Image' }: { value: string; onChange: (url: string) => void; onAlt?: (alt: string) => void; onPick?: (url: string, alt: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="admin-label">{label}</span>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen(true)} className="relative flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 hover:border-zinc-500" aria-label={value ? 'Change image' : 'Choose image'}>
          {value ? <img src={srcFor(value, 320)} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} /> : <ImagePlus className="h-6 w-6" />}
        </button>
        <div className="flex-1 space-y-2">
          <input className="admin-input text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Image URL" aria-label={`${label} URL`} />
          <div className="flex gap-2">
            <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={() => setOpen(true)}>Library</button>
            {value && <button type="button" className="admin-btn-ghost !py-1 text-xs" onClick={() => onChange('')}><X className="h-3.5 w-3.5" /> Remove</button>}
          </div>
        </div>
      </div>
      <MediaPickerDialog open={open} onOpenChange={setOpen} onPick={(url, alt) => { if (onPick) onPick(url, alt); else { onChange(url); if (alt) onAlt?.(alt); } }} />
    </div>
  );
}
