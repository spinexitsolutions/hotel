import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Copy, Eye, EyeOff, History, LayoutTemplate, Plus, RotateCcw, Save, Search, Trash2, Upload } from 'lucide-react';
import { SECTION_REGISTRY, SECTION_TYPES, defaultSectionProps, type SectionType } from '@aurelle/shared';
import { get, patch, post, put, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, ErrorBox, Labeled, Loading, StatusBadge, Toggle, useConfirm } from '../components/ui';
import { SchemaForm } from '../components/SchemaForm';
import { ImageField } from '../components/MediaPicker';
import { PreviewFrame } from '../components/PreviewFrame';

interface Sec { id: string; type: SectionType; enabled: boolean; props: Record<string, unknown> }
interface Content { sections: Sec[]; seo: { title: string; description: string; ogImage: string; noIndex: boolean } }
interface PageDoc {
  id: string; slug: string; title: string; kind: string; status: string; isSystem: boolean; showInSitemap: boolean; hasUnpublishedChanges: boolean;
  draft: Content; publishedAt: string | null; scheduledAt: string | null; updatedAt: string; revisions: { id: string; note: string; createdAt: string }[];
}

const newId = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default function PageBuilderPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: page, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'cms-page', id], queryFn: () => get<PageDoc>(`/admin/cms/pages/${id}`) });
  const [content, setContent] = useState<Content | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'sections' | 'seo' | 'settings'>('sections');
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const [meta, setMeta] = useState({ title: '', slug: '', showInSitemap: true });

  useEffect(() => {
    if (page && !dirty) {
      setContent(structuredClone(page.draft));
      setMeta({ title: page.title, slug: page.slug, showInSitemap: page.showInSitemap });
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (c: Content) => { setContent(c); setDirty(true); };
  const updateSection = (sid: string, patchObj: Partial<Sec>) => update({ ...content!, sections: content!.sections.map((s) => (s.id === sid ? { ...s, ...patchObj } : s)) });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['admin', 'cms-page', id] }); void qc.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); };

  const save = useMutation({
    mutationFn: () => put(`/admin/cms/pages/${id}/draft`, content),
    onSuccess: () => { setDirty(false); setReloadKey((k) => k + 1); invalidate(); toast.success('Draft saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const publish = useMutation({
    mutationFn: async () => { if (dirty) await put(`/admin/cms/pages/${id}/draft`, content); return post(`/admin/cms/pages/${id}/publish`); },
    onSuccess: () => { setDirty(false); setReloadKey((k) => k + 1); invalidate(); toast.success('Published — the live page is updated'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(`/admin/cms/pages/${id}/${path}`, body ?? {}),
    onSuccess: () => { setDirty(false); setReloadKey((k) => k + 1); void refetch(); invalidate(); toast.success('Done'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveMeta = useMutation({
    mutationFn: () => patch(`/admin/cms/pages/${id}/meta`, meta),
    onSuccess: () => { invalidate(); toast.success('Page settings saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sel = content?.sections.find((s) => s.id === selected) ?? null;
  const previewPath = page ? (page.kind === 'HOME' ? '/' : `/${page.slug}`) : '/';
  const move = (i: number, d: number) => {
    const arr = [...content!.sections];
    const [x] = arr.splice(i, 1);
    arr.splice(i + d, 0, x);
    update({ ...content!, sections: arr });
  };

  if (isLoading || (page && !content)) return <Loading />;
  if (error || !page || !content) return <ErrorBox error={error} onRetry={() => refetch()} />;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <Link to="/admin/content/pages" className="admin-btn-ghost !p-1.5" aria-label="Back to pages"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{page.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-zinc-500"><StatusBadge status={page.status} />{dirty ? <Badge color="amber">Unsaved edits</Badge> : page.hasUnpublishedChanges ? <Badge color="amber">Draft differs from live</Badge> : <span>Live is up to date</span>}{page.scheduledAt && <Badge color="blue">Publishes {dateTime(page.scheduledAt)}</Badge>}</p>
        </div>
        <button className="admin-btn-ghost text-xs" onClick={() => setShowPreview((s) => !s)}>{showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {showPreview ? 'Hide' : 'Show'} preview</button>
        <button className="admin-btn-ghost text-xs" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /> Revisions</button>
        <button className="admin-btn-ghost text-xs" onClick={() => setScheduleOpen(true)}><Clock className="h-4 w-4" /> Schedule</button>
        <button className="admin-btn-secondary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save draft'}</button>
        <button className="admin-btn-primary" disabled={publish.isPending} onClick={() => publish.mutate()}><Upload className="h-4 w-4" /> {publish.isPending ? 'Publishing…' : 'Publish'}</button>
      </div>

      <div className={cn('grid gap-0', showPreview ? 'xl:grid-cols-[440px_1fr]' : '')}>
        {/* Editor column */}
        <div className="min-h-[calc(100vh-8rem)] border-r border-zinc-200 bg-white">
          <div className="flex border-b border-zinc-200" role="tablist">
            {(['sections', 'seo', 'settings'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('flex-1 border-b-2 px-3 py-2.5 text-xs font-medium uppercase tracking-wide', tab === t ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500')}>{t === 'seo' ? 'SEO' : t}</button>)}
          </div>

          {tab === 'sections' && !sel && (
            <div className="p-4">
              <ul className="space-y-1.5">
                {content.sections.map((s, i) => {
                  const def = SECTION_REGISTRY[s.type];
                  const heading = String((s.props.heading as string) || ((s.props.slides as { heading?: string }[] | undefined)?.[0]?.heading) || '');
                  return (
                    <li key={s.id} className={cn('group flex items-center gap-1 rounded-lg border px-2 py-1.5', s.enabled ? 'border-zinc-200 bg-white' : 'border-dashed border-zinc-300 bg-zinc-50 opacity-70')}>
                      <LayoutTemplate className="h-4 w-4 shrink-0 text-zinc-400" />
                      <button className="min-w-0 flex-1 px-1 text-left" onClick={() => setSelected(s.id)}>
                        <p className="truncate text-sm font-medium">{def?.label ?? s.type}</p>
                        {heading && <p className="truncate text-xs text-zinc-500">{heading}</p>}
                      </button>
                      <button className="admin-btn-ghost !p-1" onClick={() => updateSection(s.id, { enabled: !s.enabled })} aria-label={s.enabled ? 'Hide section' : 'Show section'} title={s.enabled ? 'Hide' : 'Show'}>{s.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                      <button className="admin-btn-ghost !p-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button className="admin-btn-ghost !p-1" disabled={i === content.sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button className="admin-btn-ghost !p-1" onClick={() => { const c = [...content.sections]; c.splice(i + 1, 0, { ...structuredClone(s), id: newId() }); update({ ...content, sections: c }); }} aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                      <button className="admin-btn-ghost !p-1 text-red-600" onClick={async () => { if (await confirm({ title: `Remove “${def?.label}”?`, body: 'You can undo by discarding unsaved changes.', confirmLabel: 'Remove', danger: true })) update({ ...content, sections: content.sections.filter((x) => x.id !== s.id) }); }} aria-label="Remove section"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
              <button className="admin-btn-secondary mt-3 w-full" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add section</button>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                {page.hasUnpublishedChanges && page.status === 'PUBLISHED' && <button className="admin-btn-ghost text-xs" onClick={async () => { if (await confirm({ title: 'Discard all draft changes?', body: 'The draft will be replaced with the live version.', confirmLabel: 'Discard', danger: true })) action.mutate({ path: 'discard' }); }}><RotateCcw className="h-3.5 w-3.5" /> Discard draft</button>}
                {page.isSystem && <button className="admin-btn-ghost text-xs" onClick={async () => { if (await confirm({ title: 'Reset this page to factory defaults?', body: 'Only the draft changes; publish to make it live.', confirmLabel: 'Reset draft', danger: true })) action.mutate({ path: 'reset' }); }}><RotateCcw className="h-3.5 w-3.5" /> Reset page to default</button>}
              </div>
            </div>
          )}

          {tab === 'sections' && sel && (
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <button className="admin-btn-ghost !px-1.5 text-xs" onClick={() => setSelected(null)}><ArrowLeft className="h-3.5 w-3.5" /> All sections</button>
                <button className="admin-btn-ghost text-xs" onClick={async () => {
                  if (!(await confirm({ title: 'Reset this section to its default content?', confirmLabel: 'Reset' }))) return;
                  try {
                    const r = await get<{ props: Record<string, unknown> }>(`/admin/cms/pages/${id}/section-defaults`, { sectionId: sel.id, type: sel.type });
                    updateSection(sel.id, { props: r.props });
                  } catch (e) { toast.error(errorMessage(e)); }
                }}><RotateCcw className="h-3.5 w-3.5" /> Reset to default</button>
              </div>
              <p className="text-base font-semibold">{SECTION_REGISTRY[sel.type].label}</p>
              <p className="mb-4 text-xs text-zinc-500">{SECTION_REGISTRY[sel.type].description}</p>
              <div className="mb-4 rounded-lg border border-zinc-200 p-3"><Toggle checked={sel.enabled} onChange={(v) => updateSection(sel.id, { enabled: v })} label="Visible on the page" /></div>
              <SchemaForm key={sel.id} fields={SECTION_REGISTRY[sel.type].fields as never} value={sel.props} onChange={(props) => updateSection(sel.id, { props })} idPrefix={sel.id} />
            </div>
          )}

          {tab === 'seo' && (
            <div className="space-y-4 p-4">
              <Labeled label="SEO title" hint={`${content.seo.title.length}/60 · leave blank to use the page title`} htmlFor="seo-t"><input id="seo-t" className="admin-input" value={content.seo.title} onChange={(e) => update({ ...content, seo: { ...content.seo, title: e.target.value } })} /></Labeled>
              <Labeled label="Meta description" hint={`${content.seo.description.length}/160`} htmlFor="seo-d"><textarea id="seo-d" className="admin-input" rows={3} value={content.seo.description} onChange={(e) => update({ ...content, seo: { ...content.seo, description: e.target.value } })} /></Labeled>
              <ImageField label="Social sharing image" value={content.seo.ogImage} onChange={(v) => update({ ...content, seo: { ...content.seo, ogImage: v } })} />
              <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={content.seo.noIndex} onChange={(v) => update({ ...content, seo: { ...content.seo, noIndex: v } })} label="Hide from search engines (noindex)" /></div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">Search result preview</p>
                <p className="mt-1 truncate text-[17px] text-[#1a0dab]">{content.seo.title || page.title}</p>
                <p className="truncate text-xs text-emerald-800">{window.location.origin}{previewPath}</p>
                <p className="line-clamp-2 text-sm text-zinc-600">{content.seo.description || 'Add a description to control how this page appears in search results.'}</p>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4 p-4">
              <Labeled label="Page title" htmlFor="pm-title"><input id="pm-title" className="admin-input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Labeled>
              <Labeled label="URL slug" hint={page.isSystem ? 'System pages keep their URL.' : `/${meta.slug}`} htmlFor="pm-slug"><input id="pm-slug" className="admin-input" value={meta.slug} disabled={page.isSystem} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} /></Labeled>
              <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={meta.showInSitemap} onChange={(v) => setMeta({ ...meta, showInSitemap: v })} label="Include in sitemap" /></div>
              <button className="admin-btn-primary" onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>Save settings</button>
              {page.status === 'PUBLISHED' && page.kind !== 'HOME' && <div className="border-t border-zinc-100 pt-4"><button className="admin-btn-secondary text-red-700" onClick={async () => { if (await confirm({ title: 'Unpublish this page?', body: 'Visitors will see a 404 until it is published again.', confirmLabel: 'Unpublish', danger: true })) action.mutate({ path: 'unpublish' }); }}>Unpublish page</button></div>}
            </div>
          )}
        </div>

        {showPreview && (
          <div className="hidden h-[calc(100vh-8rem)] p-4 xl:block">
            {dirty && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Save the draft to refresh the preview with your latest edits.</p>}
            <PreviewFrame path={previewPath} reloadKey={reloadKey} className={dirty ? 'h-[calc(100%-2.5rem)]' : 'h-full'} />
          </div>
        )}
      </div>

      <AddSectionDialog open={addOpen} onOpenChange={setAddOpen} onAdd={(type) => {
        const s: Sec = { id: newId(), type, enabled: true, props: defaultSectionProps(type) as Record<string, unknown> };
        const idx = content.sections.findIndex((x) => x.id === selected);
        const arr = [...content.sections];
        arr.splice(idx >= 0 ? idx + 1 : arr.length, 0, s);
        update({ ...content, sections: arr });
        setSelected(s.id);
        setAddOpen(false);
      }} />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen} title="Revisions" description="Each publish is saved. Restoring loads it into the draft; publish to make it live.">
        <ul className="divide-y divide-zinc-100">
          {page.revisions.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{r.note} · {dateTime(r.createdAt)}</span>
              <button className="admin-btn-secondary !py-1 text-xs" onClick={() => { setHistoryOpen(false); action.mutate({ path: `revisions/${r.id}/restore` }); }}>Restore to draft</button>
            </li>
          ))}
          {!page.revisions.length && <li className="py-6 text-center text-sm text-zinc-500">No revisions yet.</li>}
        </ul>
      </Dialog>
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} current={page.scheduledAt} onSave={async (iso) => { if (dirty) await put(`/admin/cms/pages/${id}/draft`, content); action.mutate({ path: 'schedule', body: { scheduledAt: iso } }); setScheduleOpen(false); }} />
      {dialog}
    </div>
  );
}

function AddSectionDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (t: SectionType) => void }) {
  const [q, setQ] = useState('');
  const types = useMemo(() => SECTION_TYPES.filter((t) => `${SECTION_REGISTRY[t].label} ${SECTION_REGISTRY[t].description}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a section" wide>
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input className="admin-input pl-9" placeholder="Search section types" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search section types" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {types.map((t) => (
          <button key={t} onClick={() => onAdd(t)} className="rounded-lg border border-zinc-200 p-3 text-left hover:border-zinc-900 hover:bg-zinc-50">
            <p className="text-sm font-medium">{SECTION_REGISTRY[t].label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{SECTION_REGISTRY[t].description}</p>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function ScheduleDialog({ open, onOpenChange, current, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; current: string | null; onSave: (iso: string | null) => void }) {
  const [v, setV] = useState(current ? new Date(current).toISOString().slice(0, 16) : '');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Schedule publishing" description="The current draft will go live automatically at this time (checked every minute)."
      footer={<>{current && <button className="admin-btn-ghost text-red-700" onClick={() => onSave(null)}>Remove schedule</button>}<button className="admin-btn-primary" disabled={!v} onClick={() => onSave(new Date(v).toISOString())}>Schedule</button></>}>
      <Labeled label="Publish at (your local time)" htmlFor="sch"><input id="sch" type="datetime-local" className="admin-input" value={v} onChange={(e) => setV(e.target.value)} /></Labeled>
    </Dialog>
  );
}
