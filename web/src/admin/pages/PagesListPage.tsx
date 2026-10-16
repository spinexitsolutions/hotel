import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { slugify } from '@aurelle/shared';
import { ApiError, del, get, post } from '@/lib/api';
import { dateTime, titleCase } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, ErrorBox, Labeled, Loading, PageHeader, StatusBadge, useConfirm } from '../components/ui';

interface PageRow { id: string; slug: string; title: string; kind: string; status: string; isSystem: boolean; hasUnpublishedChanges: boolean; publishedAt: string | null; scheduledAt: string | null; updatedAt: string }

export default function PagesListPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'cms-pages'], queryFn: () => get<{ items: PageRow[] }>('/admin/cms/pages') });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [err, setErr] = useState('');
  const create = useMutation({
    mutationFn: () => post<PageRow>('/admin/cms/pages', { title, slug: slug || slugify(title), showInSitemap: true }),
    onSuccess: (p) => { void qc.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); nav(`/admin/content/pages/${p.id}`); },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not create page'),
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/admin/cms/pages/${id}`), onSuccess: () => { toast.success('Page deleted'); void qc.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); }, onError: (e) => toast.error((e as Error).message) });
  const url = (p: PageRow) => (p.kind === 'HOME' ? '/' : `/${p.slug}`);

  return (
    <div>
      <PageHeader title="Pages" description="Every public page is built from editable sections. Edit, preview and publish without touching code." actions={<button className="admin-btn-primary" onClick={() => { setTitle(''); setSlug(''); setErr(''); setOpen(true); }}><Plus className="h-4 w-4" /> New page</button>} />
      <Card bodyClassName="p-0">
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : (
          <table className="admin-table">
            <thead><tr><th>Page</th><th>URL</th><th>Type</th><th>Status</th><th>Last change</th><th /></tr></thead>
            <tbody>
              {data!.items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/admin/content/pages/${p.id}`} className="font-medium hover:underline">{p.title}</Link></td>
                  <td className="font-mono text-xs text-zinc-500">{url(p)}</td>
                  <td className="text-xs">{titleCase(p.kind)}</td>
                  <td className="space-x-1"><StatusBadge status={p.status} />{p.hasUnpublishedChanges && <Badge color="amber">Unpublished changes</Badge>}{p.scheduledAt && <Badge color="blue">Scheduled {dateTime(p.scheduledAt)}</Badge>}</td>
                  <td className="text-xs text-zinc-500">{dateTime(p.updatedAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    <a href={url(p)} target="_blank" rel="noreferrer" className="admin-btn-ghost !p-1.5" aria-label="View live"><ExternalLink className="h-4 w-4" /></a>
                    {!p.isSystem && <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label="Delete page" onClick={async () => { if (await confirm({ title: `Delete “${p.title}”?`, body: 'The page and its revisions will be removed.', confirmLabel: 'Delete', danger: true })) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title="New page" footer={<><button className="admin-btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="admin-btn-primary" disabled={!title || create.isPending} onClick={() => create.mutate()}>Create & edit</button></>}>
        <div className="space-y-4">
          <Labeled label="Title" htmlFor="np-title"><input id="np-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Labeled>
          <Labeled label="URL slug" hint={`The page will live at /${slug || slugify(title) || 'your-page'}`} htmlFor="np-slug"><input id="np-slug" className="admin-input" value={slug} placeholder={slugify(title)} onChange={(e) => setSlug(slugify(e.target.value))} /></Labeled>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </Dialog>
      {dialog}
    </div>
  );
}
