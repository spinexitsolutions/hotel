import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, del, get, post, put } from '@/lib/api';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { Card, Empty, ErrorBox, Labeled, Loading, PageHeader, Pager, SearchBox, Toggle, useConfirm } from './ui';
import { ImageField } from './MediaPicker';

export type FieldSpec = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'markdown' | 'number' | 'money' | 'bps' | 'select' | 'multiselect' | 'boolean' | 'date' | 'datetime' | 'image' | 'tags' | 'days';
  options?: { value: string; label: string }[];
  hint?: string;
  span?: 2;
  placeholder?: string;
  /** Show only when predicate is true for the current form values. */
  when?: (v: Record<string, unknown>) => boolean;
};

export interface Column<T> { key: string; label: string; render?: (row: T) => ReactNode; className?: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Converts API values (paise, bps, ISO datetimes) to form values and back. */
function toForm(fields: FieldSpec[], row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = row[f.key];
    if (f.type === 'money') out[f.key] = v == null ? '' : String(Number(v) / 100);
    if (f.type === 'bps') out[f.key] = v == null ? '' : String(Number(v) / 100);
    if (f.type === 'datetime') out[f.key] = v ? new Date(String(v)).toISOString().slice(0, 16) : '';
    if (f.type === 'tags') out[f.key] = Array.isArray(v) ? (v as string[]).join('\n') : '';
  }
  return out;
}
function toBody(fields: FieldSpec[], form: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.when && !f.when(form)) continue;
    switch (f.type) {
      case 'money': out[f.key] = v === '' || v == null ? null : Math.round(Number(v) * 100); break;
      case 'bps': out[f.key] = v === '' || v == null ? null : Math.round(Number(v) * 100); break;
      case 'number': out[f.key] = v === '' || v == null ? null : Number(v); break;
      case 'datetime': out[f.key] = v ? new Date(String(v)).toISOString() : null; break;
      case 'date': out[f.key] = v ? String(v) : null; break;
      case 'tags': out[f.key] = String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean); break;
      default: out[f.key] = v;
    }
  }
  return out;
}

export function FieldInput({ f, value, onChange, setValue }: { f: FieldSpec; value: unknown; onChange: (v: unknown) => void; setValue?: (k: string, v: unknown) => void }) {
  const id = `f-${f.key}`;
  switch (f.type) {
    case 'textarea': case 'markdown':
      return <textarea id={id} className="admin-input min-h-[96px] font-[inherit]" rows={f.type === 'markdown' ? 8 : 3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
    case 'boolean':
      return <Toggle checked={!!value} onChange={onChange} label={f.label} description={f.hint} />;
    case 'select':
      return <select id={id} className="admin-input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' && f.options?.every((o) => o.value !== '') ? null : e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-zinc-300 p-2">
          {f.options?.map((o) => {
            const on = arr.includes(o.value);
            return <button type="button" key={o.value} onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} className={cn('rounded-md px-2 py-1 text-xs', on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')} aria-pressed={on}>{o.label}</button>;
          })}
          {!arr.length && <span className="px-1 py-1 text-xs text-zinc-400">None selected = applies to all</span>}
        </div>
      );
    }
    case 'days': {
      const arr = Array.isArray(value) ? (value as number[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = arr.includes(i);
            return <button type="button" key={d} onClick={() => onChange(on ? arr.filter((x) => x !== i) : [...arr, i].sort())} className={cn('rounded-md px-2.5 py-1 text-xs', on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700')} aria-pressed={on}>{d}</button>;
          })}
        </div>
      );
    }
    case 'image':
      return <ImageField value={String(value ?? '')} onChange={onChange} label="" onAlt={(alt) => setValue?.('alt', alt)} />;
    case 'money':
      return <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₹</span><input id={id} type="number" min={0} step="0.01" className="admin-input pl-7" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></div>;
    case 'bps':
      return <div className="relative"><input id={id} type="number" step="0.01" className="admin-input pr-8" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span></div>;
    case 'tags':
      return <textarea id={id} className="admin-input" rows={4} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="One per line" />;
    default:
      return <input id={id} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'} className="admin-input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
  }
}

export function FormGrid({ fields, values, setValue, errors }: { fields: FieldSpec[]; values: Record<string, unknown>; setValue: (k: string, v: unknown) => void; errors: Record<string, string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.when || f.when(values)).map((f) => (
        f.type === 'boolean'
          ? <div key={f.key} className={cn('rounded-lg border border-zinc-200 p-3', f.span === 2 && 'sm:col-span-2')}><FieldInput f={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} /></div>
          : <Labeled key={f.key} label={f.label} hint={f.hint} error={errors[f.key]} htmlFor={`f-${f.key}`} className={cn((f.span === 2 || ['textarea', 'markdown', 'multiselect', 'image', 'tags'].includes(f.type)) && 'sm:col-span-2')}>
              <FieldInput f={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} setValue={setValue} />
            </Labeled>
      ))}
    </div>
  );
}

export function CrudPage<T extends { id: string }>({ title, description, endpoint, fields, columns, defaults, itemLabel = 'item', searchable = true, canEdit = true, extraActions, rowActions, filters, mapRow, mapBody, embedded, formIntro }: {
  title: string; description?: string; endpoint: string; fields: FieldSpec[]; columns: Column<T>[]; defaults: Record<string, unknown>; itemLabel?: string;
  searchable?: boolean; canEdit?: boolean; extraActions?: ReactNode; rowActions?: (row: T) => ReactNode; filters?: Record<string, unknown>;
  /** Optional: reshape an API row (or the defaults) before it is converted into form values. */
  mapRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Optional: reshape the converted request body (e.g. merge kind-dependent fields) before saving. */
  mapBody?: (body: Record<string, unknown>, form: Record<string, unknown>) => Record<string, unknown>;
  /** Optional: render a compact section header (h2) instead of the page-level header, for use inside tabs. */
  embedded?: boolean;
  /** Optional: content shown above the form fields in the editor dialog. */
  formIntro?: ReactNode;
}) {
  const openForm = (row: Record<string, unknown>) => toForm(fields, mapRow ? mapRow(row) : row);
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setPage(1), [q]);
  const key = ['admin', endpoint, q, page, filters];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => get<{ items: T[]; total: number; page: number; pages: number }>(`/admin${endpoint}`, { q, page, ...filters }) });

  const save = useMutation({
    mutationFn: (form: Record<string, unknown>) => {
      const raw = toBody(fields, form);
      const body = mapBody ? mapBody(raw, form) : raw;
      return form.id ? put(`/admin${endpoint}/${form.id}`, body) : post(`/admin${endpoint}`, body);
    },
    onSuccess: () => { toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} saved`); setEditing(null); void qc.invalidateQueries({ queryKey: ['admin', endpoint] }); },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(e instanceof Error ? e.message : 'Could not save');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/admin${endpoint}/${id}`),
    onSuccess: () => { toast.success('Deleted'); void qc.invalidateQueries({ queryKey: ['admin', endpoint] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  return (
    <div>
      {(() => {
        const actions = <>{extraActions}{canEdit && <button className="admin-btn-primary" onClick={() => { setErrors({}); setEditing(openForm(defaults)); }}><Plus className="h-4 w-4" /> New {itemLabel}</button>}</>;
        return embedded ? (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
              {description && <p className="mt-0.5 max-w-3xl text-sm text-zinc-500">{description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        ) : <PageHeader title={title} description={description} actions={actions} />;
      })()}
      <Card bodyClassName="p-0">
        {searchable && <div className="border-b border-zinc-100 p-3"><SearchBox value={q} onChange={setQ} /></div>}
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !data?.items.length ? (
          <Empty title={`No ${itemLabel}s yet`} action={canEdit && <button className="admin-btn-primary" onClick={() => setEditing(openForm(defaults))}><Plus className="h-4 w-4" /> Create the first one</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{canEdit && <th className="w-24 text-right">Actions</th>}</tr></thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}</td>)}
                    {canEdit && (
                      <td className="whitespace-nowrap text-right">
                        {rowActions?.(row)}
                        <button className="admin-btn-ghost !p-1.5" onClick={() => { setErrors({}); setEditing(openForm(row as Record<string, unknown>)); }} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button className="admin-btn-ghost !p-1.5 text-red-600" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete this ${itemLabel}?`, body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) remove.mutate(row.id); }}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-zinc-100 px-4"><Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </Card>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)} title={editing.id ? `Edit ${itemLabel}` : `New ${itemLabel}`} wide
          footer={<><button className="admin-btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={() => save.mutate(editing)}>{save.isPending ? 'Saving…' : 'Save'}</button></>}>
          {formIntro && <div className="mb-4">{formIntro}</div>}
          <FormGrid fields={fields} values={editing} setValue={(k, v) => setEditing((s) => ({ ...s!, [k]: v }))} errors={errors} />
        </Dialog>
      )}
      {dialog}
    </div>
  );
}
