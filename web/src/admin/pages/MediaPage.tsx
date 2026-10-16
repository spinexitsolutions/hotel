import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, ExternalLink, Link2, Pencil, Trash2 } from 'lucide-react';
import { errorMessage, get, del, patch, post } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { srcFor } from '@/lib/image';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, Pager, SearchBox, useConfirm } from '../components/ui';
import { UploadButton, type MediaAsset } from '../components/MediaPicker';

const FOLDERS = ['general', 'rooms', 'dining', 'spa', 'gallery', 'blog', 'offers', 'pages', 'events'];

const fmtSize = (b: number) => (!b ? '—' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const absUrl = (u: string) => (u.startsWith('/') ? `${window.location.origin}${u}` : u);

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function FolderSelect({ id, value, onChange, extra, allLabel }: { id: string; value: string; onChange: (v: string) => void; extra?: string[]; allLabel?: string }) {
  const opts = [...new Set([...FOLDERS, ...(extra ?? []), ...(value ? [value] : [])])];
  return (
    <select id={id} className="admin-input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {opts.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
    </select>
  );
}

export default function MediaPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [uploadFolder, setUploadFolder] = useState('general');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [external, setExternal] = useState(false);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, folder]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'media', 'library', dq, folder, page],
    queryFn: () => get<{ items: MediaAsset[]; total: number; page: number; pages: number }>('/admin/cms/media', { q: dq, folder, page }),
    placeholderData: (p) => p,
  });

  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin/cms/media/${id}`),
    onSuccess: () => { toast.success('Image deleted'); void qc.invalidateQueries({ queryKey: ['admin', 'media'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(absUrl(url)); toast.success('URL copied'); } catch { toast.error('Copy failed'); }
  };
  const missingAlt = data?.items.filter((m) => !m.alt.trim()).length ?? 0;

  return (
    <div>
      <PageHeader title="Media library" description="Images used across the website. Uploads are resized and converted to WebP automatically."
        actions={<>
          <label className="sr-only" htmlFor="up-folder">Upload to folder</label>
          <FolderSelect id="up-folder" value={uploadFolder} onChange={setUploadFolder} />
          <button className="admin-btn-secondary" onClick={() => setExternal(true)}><Link2 className="h-4 w-4" /> Add URL</button>
          <UploadButton folder={uploadFolder} />
        </>} />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search alt text…" />
          <label className="sr-only" htmlFor="flt-folder">Filter by folder</label>
          <FolderSelect id="flt-folder" value={folder} onChange={setFolder} allLabel="All folders" />
          {missingAlt > 0 && <span className="flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {missingAlt} on this page missing alt text</span>}
          {isFetching && !isLoading && <span className="text-xs text-zinc-400">Loading…</span>}
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title={q || folder ? 'No images match' : 'The library is empty'} body={q || folder ? 'Try another search or folder.' : 'Upload high-resolution JPEG, PNG or WebP images (1600px+ wide recommended), or add an image by URL.'} action={!q && !folder && <UploadButton folder={uploadFolder} />} />
        ) : (
          <ul className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {data.items.map((m) => (
              <li key={m.id} className="group overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <div className="relative aspect-[4/3] bg-zinc-100">
                  <img src={srcFor(m.url, 480)} alt={m.alt} loading="lazy" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                  {!m.alt.trim() && <span className="absolute left-2 top-2"><Badge color="amber"><AlertTriangle className="mr-1 h-3 w-3" />No alt text</Badge></span>}
                  {m.provider === 'EXTERNAL' && <span className="absolute right-2 top-2"><Badge>External</Badge></span>}
                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button className="rounded-md bg-white/90 p-1.5 text-zinc-800 hover:bg-white" onClick={() => copy(m.url)} aria-label="Copy URL" title="Copy URL"><Copy className="h-3.5 w-3.5" /></button>
                    <a className="rounded-md bg-white/90 p-1.5 text-zinc-800 hover:bg-white" href={m.url} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original"><ExternalLink className="h-3.5 w-3.5" /></a>
                    <button className="rounded-md bg-white/90 p-1.5 text-zinc-800 hover:bg-white" onClick={() => setEditing(m)} aria-label="Edit details" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="rounded-md bg-white/90 p-1.5 text-red-600 hover:bg-white" aria-label="Delete image" title="Delete"
                      onClick={async () => { if (await confirm({ title: 'Delete this image?', body: 'It will be removed from the library. Pages, rooms or posts still using this URL will show a broken image.', confirmLabel: 'Delete', danger: true })) remove.mutate(m.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className={m.alt ? 'truncate text-xs text-zinc-800' : 'truncate text-xs italic text-zinc-400'} title={m.alt}>{m.alt || 'Missing alt text'}</p>
                  <p className="flex flex-wrap gap-x-2 text-[11px] text-zinc-500">
                    <span>{m.width && m.height ? `${m.width}×${m.height}` : 'Size unknown'}</span>
                    <span>{fmtSize(m.size)}</span>
                    <span className="capitalize">{m.folder}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </Card>

      {editing && <EditDialog asset={editing} onClose={() => setEditing(null)} onCopy={copy} />}
      {external && <ExternalDialog defaultFolder={uploadFolder} onClose={() => setExternal(false)} />}
      {dialog}
    </div>
  );
}

function EditDialog({ asset, onClose, onCopy }: { asset: MediaAsset; onClose: () => void; onCopy: (u: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [alt, setAlt] = useState(asset.alt);
  const [folder, setFolder] = useState(asset.folder);
  const save = useMutation({
    mutationFn: () => patch(`/admin/cms/media/${asset.id}`, { alt: alt.trim(), folder }),
    onSuccess: () => { toast.success('Image details saved'); void qc.invalidateQueries({ queryKey: ['admin', 'media'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Image details" wide
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button></>}>
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"><img src={srcFor(asset.url, 960)} alt={alt} className="max-h-80 w-full object-contain" /></div>
        <div className="space-y-4">
          <Labeled label="Alt text" htmlFor="md-alt" hint="Describe what the image shows for screen readers and search engines, e.g. “Sunset over the infinity pool with loungers”.">
            <textarea id="md-alt" rows={3} maxLength={200} className="admin-input" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </Labeled>
          {!alt.trim() && <p className="flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Images without alt text are inaccessible.</p>}
          <Labeled label="Folder" htmlFor="md-folder"><FolderSelect id="md-folder" value={folder} onChange={setFolder} /></Labeled>
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3 text-xs">
            <dt className="text-zinc-500">Dimensions</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}px` : '—'}</dd>
            <dt className="text-zinc-500">File size</dt><dd>{fmtSize(asset.size)}</dd>
            <dt className="text-zinc-500">Storage</dt><dd>{asset.provider}</dd>
            <dt className="text-zinc-500">Added</dt><dd>{dateTime(asset.createdAt)}</dd>
          </dl>
          <div className="flex gap-2">
            <input readOnly className="admin-input font-mono text-xs" value={absUrl(asset.url)} aria-label="Image URL" onFocus={(e) => e.target.select()} />
            <button type="button" className="admin-btn-secondary shrink-0" onClick={() => onCopy(asset.url)}><Copy className="h-4 w-4" /> Copy</button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function ExternalDialog({ defaultFolder, onClose }: { defaultFolder: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [folder, setFolder] = useState(defaultFolder);
  const [err, setErr] = useState<string>();
  const add = useMutation({
    mutationFn: () => post<MediaAsset>('/admin/cms/media/external', { url: url.trim(), alt: alt.trim(), folder }),
    onSuccess: () => { toast.success('Image added to the library'); void qc.invalidateQueries({ queryKey: ['admin', 'media'] }); onClose(); },
    onError: (e) => setErr(errorMessage(e)),
  });
  const valid = /^https:\/\/\S+$/.test(url.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add image by URL" description="Registers an external image (e.g. Unsplash or your CDN) without uploading it. Only https:// URLs are accepted."
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={!valid || add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Adding…' : 'Add image'}</button></>}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) add.mutate(); }}>
        <Labeled label="Image URL" htmlFor="ex-url" error={err ?? (url && !valid ? 'Enter a full https:// URL' : undefined)}>
          <input id="ex-url" type="url" className="admin-input" placeholder="https://images.unsplash.com/photo-…" value={url} onChange={(e) => { setUrl(e.target.value); setErr(undefined); }} autoFocus />
        </Labeled>
        {valid && <div className="h-40 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"><img src={srcFor(url.trim(), 480)} alt="Preview" className="h-full w-full object-contain" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} /></div>}
        <Labeled label="Alt text" htmlFor="ex-alt" hint="Describe the image for screen readers."><input id="ex-alt" className="admin-input" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} /></Labeled>
        <Labeled label="Folder" htmlFor="ex-folder"><FolderSelect id="ex-folder" value={folder} onChange={setFolder} /></Labeled>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
