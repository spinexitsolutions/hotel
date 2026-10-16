import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { slugify } from '@aurelle/shared';
import { ApiError, errorMessage, get, post, put } from '@/lib/api';
import { dateShort, money, toRupees } from '@/lib/format';
import { srcFor } from '@/lib/image';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, ErrorBox, Labeled, Loading, PageHeader, Toggle } from '../components/ui';
import { MediaPickerDialog } from '../components/MediaPicker';

const CATEGORIES = ['ROOM', 'SUITE', 'VILLA', 'PENTHOUSE'] as const;
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RoomTypeDto {
  id: string;
  slug: string; name: string; tagline: string; description: string; category: string;
  basePrice: number; weekendPrice: number | null;
  baseOccupancy: number; maxAdults: number; maxChildren: number; maxOccupancy: number; maxExtraBeds: number;
  extraAdultCharge: number; extraChildCharge: number; extraBedCharge: number;
  bedType: string; sizeSqm: number; view: string; minStay: number; maxStay: number;
  isFeatured: boolean; status: string; sortOrder: number;
  amenityIds: string[]; images: { url: string; alt: string }[]; highlights: string[];
  seoTitle: string; seoDescription: string;
  roomCount?: number; bookingCount?: number;
}

interface Amenity { id: string; name: string; category?: string }
interface RateRule { id: string; name: string; roomTypeId: string | null; startDate: string; endDate: string; kind: 'OVERRIDE' | 'PERCENT' | 'FIXED'; value: number; daysOfWeek: number[]; priority: number; isActive: boolean }

/** Form state keeps numeric inputs as strings so fields can be cleared while typing. */
type Form = {
  slug: string; name: string; tagline: string; description: string; category: string;
  basePrice: string; weekendPrice: string;
  baseOccupancy: string; maxAdults: string; maxChildren: string; maxOccupancy: string; maxExtraBeds: string;
  extraAdultCharge: string; extraChildCharge: string; extraBedCharge: string;
  bedType: string; sizeSqm: string; view: string; minStay: string; maxStay: string;
  isFeatured: boolean; status: string; sortOrder: string;
  amenityIds: string[]; images: { url: string; alt: string }[]; highlights: string;
  seoTitle: string; seoDescription: string;
};
type StrKey = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];

const EMPTY: Form = {
  slug: '', name: '', tagline: '', description: '', category: 'ROOM',
  basePrice: '', weekendPrice: '',
  baseOccupancy: '2', maxAdults: '2', maxChildren: '1', maxOccupancy: '3', maxExtraBeds: '1',
  extraAdultCharge: '0', extraChildCharge: '0', extraBedCharge: '0',
  bedType: 'King', sizeSqm: '', view: '', minStay: '1', maxStay: '30',
  isFeatured: false, status: 'DRAFT', sortOrder: '0',
  amenityIds: [], images: [], highlights: '', seoTitle: '', seoDescription: '',
};

function fromDto(t: RoomTypeDto): Form {
  return {
    slug: t.slug, name: t.name, tagline: t.tagline ?? '', description: t.description ?? '', category: t.category,
    basePrice: toRupees(t.basePrice), weekendPrice: toRupees(t.weekendPrice),
    baseOccupancy: String(t.baseOccupancy), maxAdults: String(t.maxAdults), maxChildren: String(t.maxChildren), maxOccupancy: String(t.maxOccupancy), maxExtraBeds: String(t.maxExtraBeds),
    extraAdultCharge: toRupees(t.extraAdultCharge), extraChildCharge: toRupees(t.extraChildCharge), extraBedCharge: toRupees(t.extraBedCharge),
    bedType: t.bedType ?? '', sizeSqm: String(t.sizeSqm), view: t.view ?? '', minStay: String(t.minStay), maxStay: String(t.maxStay),
    isFeatured: t.isFeatured, status: t.status, sortOrder: String(t.sortOrder),
    amenityIds: t.amenityIds ?? [], images: (t.images ?? []).map((i) => ({ url: i.url, alt: i.alt ?? '' })), highlights: (t.highlights ?? []).join('\n'),
    seoTitle: t.seoTitle ?? '', seoDescription: t.seoDescription ?? '',
  };
}

const int = (v: string) => (v.trim() === '' ? undefined : Number(v));
const paise = (v: string) => (v.trim() === '' ? undefined : Math.round(Number(v) * 100));

function toBody(f: Form) {
  return {
    slug: f.slug.trim(), name: f.name.trim(), tagline: f.tagline, description: f.description, category: f.category,
    basePrice: paise(f.basePrice), weekendPrice: f.weekendPrice.trim() === '' ? null : paise(f.weekendPrice),
    baseOccupancy: int(f.baseOccupancy), maxAdults: int(f.maxAdults), maxChildren: int(f.maxChildren), maxOccupancy: int(f.maxOccupancy), maxExtraBeds: int(f.maxExtraBeds),
    extraAdultCharge: paise(f.extraAdultCharge) ?? 0, extraChildCharge: paise(f.extraChildCharge) ?? 0, extraBedCharge: paise(f.extraBedCharge) ?? 0,
    bedType: f.bedType, sizeSqm: int(f.sizeSqm), view: f.view, minStay: int(f.minStay), maxStay: int(f.maxStay),
    isFeatured: f.isFeatured, status: f.status, sortOrder: int(f.sortOrder) ?? 0,
    amenityIds: f.amenityIds, images: f.images.map((i) => ({ url: i.url.trim(), alt: i.alt })),
    highlights: f.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
    seoTitle: f.seoTitle, seoDescription: f.seoDescription,
  };
}

function ruleValue(r: RateRule) {
  if (r.kind === 'OVERRIDE') return `${money(r.value)} / night`;
  if (r.kind === 'PERCENT') return `${r.value > 0 ? '+' : ''}${r.value / 100}%`;
  return `${r.value > 0 ? '+' : r.value < 0 ? '−' : ''}${money(Math.abs(r.value))} / night`;
}

export default function RoomTypeEditorPage() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const { can } = useAuth();
  const readOnly = !can('rooms.manage');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newAmenity, setNewAmenity] = useState('');

  const typeQ = useQuery({
    queryKey: ['admin', 'room-types', id],
    queryFn: () => get<RoomTypeDto>(`/admin/room-types/${id}`),
    enabled: !isNew,
  });
  const amenitiesQ = useQuery({ queryKey: ['admin', 'amenities', 'all'], queryFn: () => get<{ items: Amenity[] }>('/admin/amenities', { pageSize: 100 }) });
  const ratesQ = useQuery({ queryKey: ['admin', 'rate-rules', 'all'], queryFn: () => get<{ items: RateRule[] }>('/admin/rate-rules', { pageSize: 100 }), enabled: !isNew });

  // Reset form when switching between room types (e.g. after creating one).
  useEffect(() => {
    if (isNew) { setForm(EMPTY); setSlugTouched(false); setErrors({}); }
    else setForm(null);
  }, [id, isNew]);
  useEffect(() => {
    if (!isNew && typeQ.data && form === null) setForm(fromDto(typeQ.data));
  }, [isNew, typeQ.data, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [k]: v };
      if (k === 'name' && !slugTouched) next.slug = slugify(String(v));
      return next;
    });
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  const save = useMutation({
    mutationFn: (f: Form) => (isNew ? post<RoomTypeDto>('/admin/room-types', toBody(f)) : put<RoomTypeDto>(`/admin/room-types/${id}`, toBody(f))),
    onSuccess: (t) => {
      setErrors({});
      void qc.invalidateQueries({ queryKey: ['admin', 'room-types'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      if (isNew) {
        toast.success('Room type created');
        navigate(`/admin/rooms/${t.id}`, { replace: true });
      } else {
        toast.success('Changes saved');
        qc.setQueryData(['admin', 'room-types', id], t);
        setForm(fromDto(t));
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(e instanceof ApiError && e.fields ? 'Please fix the highlighted fields' : errorMessage(e));
    },
  });

  const addAmenity = useMutation({
    mutationFn: (name: string) => post<Amenity>('/admin/amenities', { name, icon: 'sparkles', category: 'Room' }),
    onSuccess: (a) => {
      setNewAmenity('');
      void qc.invalidateQueries({ queryKey: ['admin', 'amenities'] });
      setForm((f) => (f ? { ...f, amenityIds: [...f.amenityIds, a.id] } : f));
      toast.success(`Added “${a.name}”`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rules = useMemo(
    () => (ratesQ.data?.items ?? []).filter((r) => r.roomTypeId === id || r.roomTypeId === null).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [ratesQ.data, id],
  );

  if (!isNew && typeQ.isLoading) return <Loading />;
  if (!isNew && typeQ.error) return <ErrorBox error={typeQ.error} onRetry={() => typeQ.refetch()} />;
  if (!form) return <Loading />;

  const err = (k: string) => errors[k];
  const fieldErrorCount = Object.keys(errors).length;
  const text = (k: StrKey, label: string, opts: { hint?: string; placeholder?: string; className?: string; type?: 'text' | 'number'; min?: number; max?: number } = {}) => (
    <Labeled label={label} hint={opts.hint} error={err(k)} htmlFor={`rt-${k}`} className={opts.className}>
      <input id={`rt-${k}`} type={opts.type ?? 'text'} min={opts.min} max={opts.max} className={cn('admin-input', err(k) && 'border-red-400')} value={form[k]} placeholder={opts.placeholder}
        onChange={(e) => set(k, e.target.value)} aria-invalid={!!err(k)} />
    </Labeled>
  );
  const rupees = (k: StrKey, label: string, hint?: string) => (
    <Labeled label={label} hint={hint} error={err(k)} htmlFor={`rt-${k}`}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₹</span>
        <input id={`rt-${k}`} type="number" min={0} step="0.01" inputMode="decimal" className={cn('admin-input pl-7', err(k) && 'border-red-400')} value={form[k]}
          onChange={(e) => set(k, e.target.value)} aria-invalid={!!err(k)} />
      </div>
    </Labeled>
  );

  const moveImage = (i: number, dir: -1 | 1) => {
    const imgs = [...form.images];
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    set('images', imgs);
  };
  const imageErrors = Object.entries(errors).filter(([k]) => k === 'images' || k.startsWith('images.'));

  const saveButton = !readOnly && (
    <button type="submit" form="room-type-form" className="admin-btn-primary" disabled={save.isPending}>
      <Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : isNew ? 'Create room type' : 'Save changes'}
    </button>
  );

  return (
    <div>
      <PageHeader
        back={<Link to="/admin/rooms" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-3.5 w-3.5" /> Room types</Link>}
        title={isNew ? 'New room type' : form.name || 'Room type'}
        description={readOnly ? 'You have view-only access to room types.' : isNew ? 'Describe the accommodation, set pricing and add photography.' : undefined}
        actions={<>
          {!isNew && typeQ.data && (
            <a href={`/rooms/${typeQ.data.slug}?preview=1`} target="_blank" rel="noreferrer" className="admin-btn-secondary"><ExternalLink className="h-4 w-4" /> Preview on site</a>
          )}
          {saveButton}
        </>}
      />

      {fieldErrorCount > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p className="font-medium">Some fields need attention:</p>
          <ul className="mt-1 list-inside list-disc text-xs">{Object.entries(errors).map(([k, m]) => <li key={k}><code>{k}</code>: {m}</li>)}</ul>
        </div>
      )}

      <form id="room-type-form" onSubmit={(e) => { e.preventDefault(); if (!readOnly) save.mutate(form); }} noValidate>
        <fieldset disabled={readOnly} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <Card title="Basics">
              <div className="grid gap-4 sm:grid-cols-2">
                {text('name', 'Name', { placeholder: 'Ocean Pavilion Suite' })}
                <Labeled label="URL slug" hint={`/rooms/${form.slug || '…'}`} error={err('slug')} htmlFor="rt-slug">
                  <input id="rt-slug" className={cn('admin-input font-mono text-xs', err('slug') && 'border-red-400')} value={form.slug}
                    onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value) || e.target.value.toLowerCase()); }} />
                </Labeled>
                {text('tagline', 'Tagline', { className: 'sm:col-span-2', placeholder: 'A short evocative line shown on cards' })}
                <Labeled label="Category" error={err('category')} htmlFor="rt-category">
                  <select id="rt-category" className="admin-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}
                  </select>
                </Labeled>
                {text('view', 'View', { placeholder: 'Ocean, garden, city…' })}
                {text('bedType', 'Bed type', { placeholder: 'King' })}
                {text('sizeSqm', 'Size (m²)', { type: 'number', min: 5 })}
                <Labeled label="Description" hint="Markdown supported: **bold**, _italic_, lists, links." error={err('description')} htmlFor="rt-description" className="sm:col-span-2">
                  <textarea id="rt-description" rows={10} className="admin-input font-mono text-[13px] leading-relaxed" value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Labeled>
              </div>
            </Card>

            <Card title="Pricing">
              <div className="grid gap-4 sm:grid-cols-2">
                {rupees('basePrice', 'Base price per night', 'Before taxes. Applies Sunday–Thursday nights unless a seasonal rate overrides it.')}
                {rupees('weekendPrice', 'Weekend price per night', 'Optional. Leave blank to use the base price on Fri/Sat nights.')}
                {rupees('extraAdultCharge', 'Extra adult / night')}
                {rupees('extraChildCharge', 'Extra child / night')}
                {rupees('extraBedCharge', 'Extra bed / night')}
              </div>
            </Card>

            <Card title="Occupancy & stay rules">
              <div className="grid gap-4 sm:grid-cols-3">
                {text('baseOccupancy', 'Base occupancy', { type: 'number', min: 1, hint: 'Guests included in the price' })}
                {text('maxAdults', 'Max adults', { type: 'number', min: 1 })}
                {text('maxChildren', 'Max children', { type: 'number', min: 0 })}
                {text('maxOccupancy', 'Max occupancy', { type: 'number', min: 1 })}
                {text('maxExtraBeds', 'Max extra beds', { type: 'number', min: 0 })}
                <div className="hidden sm:block" />
                {text('minStay', 'Minimum stay (nights)', { type: 'number', min: 1 })}
                {text('maxStay', 'Maximum stay (nights)', { type: 'number', min: 1 })}
              </div>
            </Card>

            <Card title={`Images (${form.images.length})`} actions={!readOnly && <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={() => setPickerOpen(true)}><ImagePlus className="h-3.5 w-3.5" /> Add image</button>}>
              {imageErrors.length > 0 && <p className="mb-3 text-xs text-red-600" role="alert">{imageErrors.map(([k, m]) => `${k}: ${m}`).join(' · ')}</p>}
              {!form.images.length ? (
                <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 py-10 text-sm text-zinc-500 hover:border-zinc-500">
                  <ImagePlus className="h-6 w-6" /> Add the first photo. The first image is used as the cover.
                </button>
              ) : (
                <ol className="space-y-3">
                  {form.images.map((img, i) => (
                    <li key={`${img.url}-${i}`} className={cn('flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center', errors[`images.${i}.url`] ? 'border-red-300' : 'border-zinc-200')}>
                      <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-md bg-zinc-100 sm:w-28">
                        {img.url && <img src={srcFor(img.url, 320)} alt={img.alt} className="h-full w-full object-cover" />}
                        {i === 0 && <span className="absolute left-1 top-1"><Badge color="violet">Cover</Badge></span>}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input className="admin-input text-xs" value={img.url} aria-label={`Image ${i + 1} URL`} placeholder="Image URL"
                          onChange={(e) => set('images', form.images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                        <input className="admin-input text-xs" value={img.alt} aria-label={`Image ${i + 1} alt text`} placeholder="Alt text — describe the photo for screen readers" maxLength={200}
                          onChange={(e) => set('images', form.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
                      </div>
                      <div className="flex shrink-0 gap-1 sm:flex-col">
                        <button type="button" className="admin-btn-ghost !p-1.5" aria-label={`Move image ${i + 1} up`} disabled={i === 0} onClick={() => moveImage(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" className="admin-btn-ghost !p-1.5" aria-label={`Move image ${i + 1} down`} disabled={i === form.images.length - 1} onClick={() => moveImage(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" className="admin-btn-ghost !p-1.5 text-red-600" aria-label={`Remove image ${i + 1}`} onClick={() => set('images', form.images.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Amenities">
              {amenitiesQ.isLoading ? <Loading className="py-6" /> : amenitiesQ.error ? <ErrorBox error={amenitiesQ.error} onRetry={() => amenitiesQ.refetch()} /> : (
                <>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Amenities">
                    {(amenitiesQ.data?.items ?? []).map((a) => {
                      const on = form.amenityIds.includes(a.id);
                      return (
                        <button type="button" key={a.id} aria-pressed={on} onClick={() => set('amenityIds', on ? form.amenityIds.filter((x) => x !== a.id) : [...form.amenityIds, a.id])}
                          className={cn('rounded-md px-2.5 py-1 text-xs transition', on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')}>
                          {a.name}
                        </button>
                      );
                    })}
                    {!amenitiesQ.data?.items.length && <p className="text-xs text-zinc-500">No amenities yet — add one below.</p>}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{form.amenityIds.length} selected</p>
                  {!readOnly && (
                    <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-4">
                      <input className="admin-input" placeholder="New amenity, e.g. Private plunge pool" aria-label="New amenity name" value={newAmenity} onChange={(e) => setNewAmenity(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newAmenity.trim().length >= 2) addAmenity.mutate(newAmenity.trim()); } }} />
                      <button type="button" className="admin-btn-secondary shrink-0" disabled={newAmenity.trim().length < 2 || addAmenity.isPending} onClick={() => addAmenity.mutate(newAmenity.trim())}>
                        <Plus className="h-4 w-4" /> Add amenity
                      </button>
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card title="Highlights & SEO">
              <div className="grid gap-4">
                <Labeled label="Highlights" hint="One per line, up to 10 (e.g. “Private infinity pool”)." error={err('highlights') ?? Object.entries(errors).find(([k]) => k.startsWith('highlights.'))?.[1]} htmlFor="rt-highlights">
                  <textarea id="rt-highlights" rows={5} className="admin-input" value={form.highlights} onChange={(e) => set('highlights', e.target.value)} />
                </Labeled>
                {text('seoTitle', 'SEO title', { hint: `${form.seoTitle.length}/80 — defaults to the room name if blank` })}
                <Labeled label="SEO description" hint={`${form.seoDescription.length}/300`} error={err('seoDescription')} htmlFor="rt-seoDescription">
                  <textarea id="rt-seoDescription" rows={3} className="admin-input" value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
                </Labeled>
              </div>
            </Card>
          </div>

          <aside className="min-w-0 space-y-6">
            <Card title="Publishing">
              <div className="space-y-4">
                <Labeled label="Status" error={err('status')} htmlFor="rt-status">
                  <select id="rt-status" className="admin-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
                  </select>
                </Labeled>
                <Toggle checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} label="Featured" description="Highlight on the home page and room listings." disabled={readOnly} />
                {text('sortOrder', 'Sort order', { type: 'number', min: 0, hint: 'Lower numbers appear first.' })}
                {!isNew && typeQ.data && (
                  <dl className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 text-xs">
                    <dt className="text-zinc-500">Physical rooms</dt><dd className="text-right font-medium tabular-nums">{typeQ.data.roomCount ?? 0}</dd>
                    <dt className="text-zinc-500">Bookings</dt><dd className="text-right font-medium tabular-nums">{typeQ.data.bookingCount ?? 0}</dd>
                  </dl>
                )}
                {!readOnly && <div className="border-t border-zinc-100 pt-4">{saveButton}</div>}
              </div>
            </Card>

            {!isNew && (
              <Card title="Seasonal rates for this room" actions={<Link to="/admin/pricing" className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline">Manage</Link>} bodyClassName="p-0">
                {ratesQ.isLoading ? <Loading className="py-8" /> : ratesQ.error ? <div className="p-4"><ErrorBox error={ratesQ.error} onRetry={() => ratesQ.refetch()} /></div> : !rules.length ? (
                  <p className="p-5 text-sm text-zinc-500">No seasonal rates apply. Guests pay the base and weekend prices. <Link to="/admin/pricing" className="underline">Add a rate rule</Link></p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {rules.map((r) => (
                      <li key={r.id} className={cn('px-5 py-3 text-sm', !r.isActive && 'opacity-60')}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-zinc-900">{r.name}</p>
                          <span className="whitespace-nowrap text-xs font-medium tabular-nums">{ruleValue(r)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {dateShort(r.startDate)} – {dateShort(r.endDate)}
                          {r.daysOfWeek.length > 0 && r.daysOfWeek.length < 7 && ` · ${r.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')}`}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.roomTypeId === null && <Badge color="blue">All rooms</Badge>}
                          <Badge>{r.kind === 'OVERRIDE' ? 'Override' : r.kind === 'PERCENT' ? 'Percent' : 'Fixed'}</Badge>
                          {!r.isActive && <Badge color="amber">Inactive</Badge>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </aside>
        </fieldset>
      </form>

      <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={(url, alt) => set('images', [...form.images, { url, alt: alt || form.name }])} />
    </div>
  );
}

