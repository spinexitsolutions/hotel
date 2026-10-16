import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import { ICONS, type FieldDef } from '@aurelle/shared';
import { Icon } from '@/components/site/Icon';
import { cn } from '@/lib/cn';
import { ImageField } from './MediaPicker';
import { Labeled, Toggle } from './ui';

type Obj = Record<string, unknown>;

function emptyItem(fields: FieldDef[]): Obj {
  const o: Obj = {};
  for (const f of fields) o[f.key] = f.type === 'boolean' ? false : f.type === 'number' ? 0 : f.type === 'list' ? [] : f.type === 'icon' ? 'sparkles' : '';
  return o;
}

/** Renders an editing form from the shared section registry's field metadata (recursive for lists). */
export function SchemaForm({ fields, value, onChange, idPrefix = 'sf' }: { fields: FieldDef[]; value: Obj; onChange: (v: Obj) => void; idPrefix?: string }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const v = value[f.key];
        switch (f.type) {
          case 'boolean':
            return <div key={f.key} className="rounded-lg border border-zinc-200 p-3"><Toggle checked={!!v} onChange={(x) => set(f.key, x)} label={f.label} description={f.help} /></div>;
          case 'image':
            return <div key={f.key}><ImageField label={f.label} value={String(v ?? '')} onChange={(x) => set(f.key, x)} onPick={(url, alt) => onChange({ ...value, [f.key]: url, ...('alt' in value && !value.alt && alt ? { alt } : {}) })} /></div>;
          case 'textarea':
            return <Labeled key={f.key} label={f.label} hint={f.help} htmlFor={id}><textarea id={id} className="admin-input" rows={f.rows ?? 3} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} /></Labeled>;
          case 'markdown':
            return <Labeled key={f.key} label={f.label} hint={f.help ?? 'Markdown: **bold**, *italic*, ## heading, - list, [link](/page)'} htmlFor={id}><textarea id={id} className="admin-input font-mono text-[13px]" rows={8} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} /></Labeled>;
          case 'number':
            return <Labeled key={f.key} label={f.label} hint={f.help} htmlFor={id}><input id={id} type="number" min={f.min} max={f.max} className="admin-input" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} /></Labeled>;
          case 'select':
            return <Labeled key={f.key} label={f.label} hint={f.help} htmlFor={id}><select id={id} className="admin-input" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Labeled>;
          case 'icon':
            return (
              <div key={f.key}>
                <span className="admin-label">{f.label}</span>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map((ic) => <button type="button" key={ic} onClick={() => set(f.key, ic)} title={ic} aria-label={ic} aria-pressed={v === ic} className={cn('rounded-md p-1.5', v === ic ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}><Icon name={ic} className="h-4 w-4" strokeWidth={1.6} /></button>)}
                </div>
              </div>
            );
          case 'list':
            return <ListField key={f.key} f={f} value={Array.isArray(v) ? (v as Obj[]) : []} onChange={(x) => set(f.key, x)} idPrefix={id} />;
          case 'link':
            return <Labeled key={f.key} label={f.label} hint={f.help ?? 'A page path like /rooms or a full URL'} htmlFor={id}><input id={id} className="admin-input" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder="/contact" /></Labeled>;
          default:
            return <Labeled key={f.key} label={f.label} hint={f.help} htmlFor={id}><input id={id} className="admin-input" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={'placeholder' in f ? f.placeholder : undefined} /></Labeled>;
        }
      })}
    </div>
  );
}

function ListField({ f, value, onChange, idPrefix }: { f: Extract<FieldDef, { type: 'list' }>; value: Obj[]; onChange: (v: Obj[]) => void; idPrefix: string }) {
  const [open, setOpen] = useState<number | null>(value.length === 1 ? 0 : null);
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
    setOpen(i + d);
  };
  const title = (o: Obj, i: number) => String(o.heading || o.title || o.name || o.label || o.value || `${f.itemLabel} ${i + 1}`);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="admin-label !mb-0">{f.label}</span>
        <span className="text-[11px] text-zinc-400">{value.length}{f.max ? ` / ${f.max}` : ''}</span>
      </div>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50/50">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button type="button" className="flex-1 truncate px-1 text-left text-sm font-medium" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{title(item, i)}</button>
              <button type="button" className="admin-btn-ghost !p-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="admin-btn-ghost !p-1" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="admin-btn-ghost !p-1" disabled={!!f.max && value.length >= f.max} onClick={() => onChange([...value.slice(0, i + 1), { ...item }, ...value.slice(i + 1)])} aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
              <button type="button" className="admin-btn-ghost !p-1 text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {open === i && <div className="border-t border-zinc-200 bg-white p-3"><SchemaForm fields={f.fields} value={item} onChange={(x) => onChange(value.map((y, j) => (j === i ? x : y)))} idPrefix={`${idPrefix}-${i}`} /></div>}
          </div>
        ))}
      </div>
      <button type="button" className="admin-btn-secondary mt-2 !py-1 text-xs" disabled={!!f.max && value.length >= f.max} onClick={() => { onChange([...value, emptyItem(f.fields)]); setOpen(value.length); }}><Plus className="h-3.5 w-3.5" /> Add {f.itemLabel.toLowerCase()}</button>
    </div>
  );
}
