import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, CornerDownRight, Eye, EyeOff, History, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { FONT_OPTIONS, THEME_PRESETS, type NavItem, type SiteConfig } from '@aurelle/shared';
import { ApiError, get, post, put, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, ErrorBox, Labeled, Loading, PageHeader, Toggle, useConfirm } from '../components/ui';
import { ImageField } from '../components/MediaPicker';
import { PreviewFrame } from '../components/PreviewFrame';

interface Resp { config: SiteConfig; version: number; updatedAt: string; publishedAt: string | null; hasUnpublishedChanges: boolean; history: { id: string; version: number; status: string; publishedAt: string | null }[] }

const TABS = [
  { id: 'brand', label: 'Brand' }, { id: 'theme', label: 'Colours & type' }, { id: 'header', label: 'Header & menu' }, { id: 'footer', label: 'Footer' },
  { id: 'announcement', label: 'Announcement' }, { id: 'contact', label: 'Contact & map' }, { id: 'social', label: 'Social' }, { id: 'seo', label: 'SEO' },
  { id: 'integrations', label: 'Integrations' }, { id: 'locale', label: 'Language & currency' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const uid = () => Math.random().toString(36).slice(2, 9);

function Text({ label, value, onChange, hint, error, textarea, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; textarea?: boolean; placeholder?: string }) {
  const id = `tb-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <Labeled label={label} hint={hint} error={error} htmlFor={id}>
      {textarea ? <textarea id={id} className="admin-input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <input id={id} className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </Labeled>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `col-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label className="admin-label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-10 cursor-pointer rounded border border-zinc-300 p-0.5" aria-label={`${label} colour picker`} />
        <input id={id} className="admin-input font-mono text-xs uppercase" value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
    </div>
  );
}

function NavEditor({ items, onChange, depth = 0 }: { items: NavItem[]; onChange: (v: NavItem[]) => void; depth?: number }) {
  const set = (i: number, v: Partial<NavItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const move = (i: number, d: number) => { const a = [...items]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); onChange(a); };
  return (
    <div className={cn('space-y-2', depth > 0 && 'ml-6 mt-2 border-l border-zinc-200 pl-3')}>
      {items.map((it, i) => (
        <div key={it.id}>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2">
            {depth > 0 && <CornerDownRight className="h-4 w-4 text-zinc-400" />}
            <input className="admin-input w-40 flex-1" value={it.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Menu label" placeholder="Label" />
            <input className="admin-input w-40 flex-1 font-mono text-xs" value={it.href} onChange={(e) => set(i, { href: e.target.value })} aria-label="Menu link" placeholder="/page" />
            <button type="button" className="admin-btn-ghost !p-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="admin-btn-ghost !p-1" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
            {depth === 0 && <button type="button" className="admin-btn-ghost !p-1 text-xs" onClick={() => set(i, { children: [...(it.children ?? []), { id: uid(), label: 'New link', href: '/' }] })} aria-label="Add sub-item"><Plus className="h-3.5 w-3.5" /></button>}
            <button type="button" className="admin-btn-ghost !p-1 text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          {!!it.children?.length && <NavEditor items={it.children} onChange={(c) => set(i, { children: c })} depth={depth + 1} />}
        </div>
      ))}
      <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={() => onChange([...items, { id: uid(), label: 'New link', href: '/' }])}><Plus className="h-3.5 w-3.5" /> Add {depth ? 'sub-link' : 'menu item'}</button>
    </div>
  );
}

export default function ThemeBuilderPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'site-config'], queryFn: () => get<Resp>('/admin/cms/site-config') });
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>('brand');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => { if (data && !dirty) setCfg(structuredClone(data.config)); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = <K extends keyof SiteConfig>(k: K, v: Partial<SiteConfig[K]>) => { setCfg((c) => ({ ...c!, [k]: { ...(c![k] as object), ...v } })); setDirty(true); };
  const after = (r: Resp) => { qc.setQueryData(['admin', 'site-config'], (old: Resp | undefined) => ({ ...(old ?? r), ...r })); setCfg(structuredClone(r.config)); setDirty(false); setErrors({}); frame.current?.contentWindow?.postMessage('aurelle:refresh', window.location.origin); setReloadKey((k) => k + 1); };
  const onErr = (e: unknown) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); };

  const save = useMutation({ mutationFn: () => put<Resp>('/admin/cms/site-config/draft', cfg), onSuccess: (r) => { after(r); toast.success('Draft saved — preview updated'); }, onError: onErr });
  const publish = useMutation({ mutationFn: async () => { if (dirty) await put('/admin/cms/site-config/draft', cfg); return post<Resp>('/admin/cms/site-config/publish'); }, onSuccess: (r) => { after(r); void refetch(); toast.success('Published — the live website now uses this design'); }, onError: onErr });
  const discard = useMutation({ mutationFn: () => post<Resp>('/admin/cms/site-config/discard'), onSuccess: (r) => { after(r); toast.success('Draft discarded'); } });
  const reset = useMutation({ mutationFn: (g: string) => post<Resp>(`/admin/cms/site-config/reset/${g}`), onSuccess: (r) => { after(r); toast.success('Reset to default (draft)'); }, onError: onErr });
  const restore = useMutation({ mutationFn: (vid: string) => post<Resp>(`/admin/cms/site-config/restore/${vid}`), onSuccess: (r) => { after(r); setHistoryOpen(false); toast.success('Version loaded into the draft'); } });

  if (isLoading || (data && !cfg)) return <Loading />;
  if (error || !data || !cfg) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const e = (path: string) => errors[path];
  const t = cfg.theme;
  const resettable: Record<TabId, string> = { brand: 'brand', theme: 'theme', header: 'header', footer: 'footer', announcement: 'announcement', contact: 'contact', social: 'social', seo: 'seo', integrations: 'integrations', locale: 'locale' };

  const panels: Record<TabId, ReactNode> = {
    brand: (
      <div className="space-y-4">
        <Text label="Hotel name" value={cfg.brand.name} onChange={(v) => up('brand', { name: v })} error={e('brand.name')} />
        <Text label="Tagline" value={cfg.brand.tagline} onChange={(v) => up('brand', { tagline: v })} />
        <Text label="Monogram" value={cfg.brand.monogram} onChange={(v) => up('brand', { monogram: v })} hint="1–3 letters, used where a compact mark is needed" />
        <ImageField label="Logo (dark, for light backgrounds)" value={cfg.brand.logoUrl} onChange={(v) => up('brand', { logoUrl: v })} />
        <ImageField label="Logo (light, for the transparent header & footer)" value={cfg.brand.logoLightUrl} onChange={(v) => up('brand', { logoLightUrl: v })} />
        <ImageField label="Favicon (square PNG)" value={cfg.brand.faviconUrl} onChange={(v) => up('brand', { faviconUrl: v })} />
        <p className="text-xs text-zinc-500">Without a logo image, the hotel name is shown as an elegant wordmark.</p>
      </div>
    ),
    theme: (
      <div className="space-y-6">
        <div>
          <span className="admin-label">Presets</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(THEME_PRESETS).map(([k, p]) => (
              <button key={k} type="button" onClick={() => { setCfg({ ...cfg, theme: structuredClone(p.tokens) }); setDirty(true); }} className={cn('rounded-lg border p-2 text-left', t.presetKey === k ? 'border-zinc-900 ring-1 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-400')}>
                <div className="flex h-8 overflow-hidden rounded">{[p.tokens.colors.secondary, p.tokens.colors.primary, p.tokens.colors.background, p.tokens.colors.surface].map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</div>
                <p className="mt-1.5 text-xs font-medium">{p.label}</p>
                <p className="text-[11px] text-zinc-500" style={{ fontFamily: `'${p.tokens.typography.headingFont}', serif` }}>{p.tokens.typography.headingFont}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([['primary', 'Accent (gold)'], ['primaryContrast', 'Text on accent'], ['secondary', 'Dark (midnight)'], ['background', 'Background (ivory)'], ['surface', 'Surface (beige)'], ['text', 'Body text'], ['muted', 'Muted text'], ['border', 'Borders']] as const).map(([k, l]) => (
            <ColorInput key={k} label={l} value={t.colors[k]} onChange={(v) => { setCfg({ ...cfg, theme: { ...t, presetKey: 'custom', colors: { ...t.colors, [k]: v } } }); setDirty(true); }} />
          ))}
        </div>
        {Object.keys(errors).some((k) => k.startsWith('theme.colors')) && <p className="text-xs text-red-600">Colours must be 6-digit hex values like #C8A96A.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Heading font" htmlFor="hf"><select id="hf" className="admin-input" value={t.typography.headingFont} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, typography: { ...t.typography, headingFont: ev.target.value as never } } }); setDirty(true); }}>{FONT_OPTIONS.heading.map((f) => <option key={f}>{f}</option>)}</select></Labeled>
          <Labeled label="Body font" htmlFor="bf"><select id="bf" className="admin-input" value={t.typography.bodyFont} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, typography: { ...t.typography, bodyFont: ev.target.value as never } } }); setDirty(true); }}>{FONT_OPTIONS.body.map((f) => <option key={f}>{f}</option>)}</select></Labeled>
          <Labeled label="Heading weight" htmlFor="hw"><select id="hw" className="admin-input" value={t.typography.headingWeight} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, typography: { ...t.typography, headingWeight: ev.target.value as never } } }); setDirty(true); }}>{['300', '400', '500', '600'].map((w) => <option key={w}>{w}</option>)}</select></Labeled>
          <Labeled label="Heading case" htmlFor="hc"><select id="hc" className="admin-input" value={t.typography.headingCase} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, typography: { ...t.typography, headingCase: ev.target.value as never } } }); setDirty(true); }}><option value="normal">Normal</option><option value="uppercase">Uppercase</option></select></Labeled>
          <Labeled label={`Base text size · ${t.typography.baseSize}px`} htmlFor="bs"><input id="bs" type="range" min={14} max={19} value={t.typography.baseSize} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, typography: { ...t.typography, baseSize: Number(ev.target.value) } } }); setDirty(true); }} className="w-full" /></Labeled>
          <Labeled label="Corner radius" htmlFor="rad"><select id="rad" className="admin-input" value={t.radius} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, radius: ev.target.value as never } }); setDirty(true); }}><option value="none">Sharp</option><option value="sm">Subtle</option><option value="md">Soft</option><option value="lg">Round</option></select></Labeled>
          <Labeled label="Button style" htmlFor="btn"><select id="btn" className="admin-input" value={t.buttonStyle} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, buttonStyle: ev.target.value as never } }); setDirty(true); }}><option value="solid">Solid</option><option value="outline">Outline</option><option value="minimal">Minimal underline</option></select></Labeled>
          <Labeled label="Button text" htmlFor="btc"><select id="btc" className="admin-input" value={t.buttonCase} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, buttonCase: ev.target.value as never } }); setDirty(true); }}><option value="uppercase">Uppercase</option><option value="normal">Normal</option></select></Labeled>
          <Labeled label="Spacing" htmlFor="sp" className="col-span-2"><select id="sp" className="admin-input" value={t.spacing} onChange={(ev) => { setCfg({ ...cfg, theme: { ...t, spacing: ev.target.value as never } }); setDirty(true); }}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="airy">Airy (editorial)</option></select></Labeled>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4" style={{ background: t.colors.background, color: t.colors.text }}>
          <p style={{ fontFamily: `'${t.typography.headingFont}', serif`, fontWeight: Number(t.typography.headingWeight), fontSize: 28, textTransform: t.typography.headingCase === 'uppercase' ? 'uppercase' : 'none' }}>A palace on still water</p>
          <p style={{ fontFamily: `'${t.typography.bodyFont}', sans-serif`, color: t.colors.muted, fontSize: t.typography.baseSize }}>Body text sample in {t.typography.bodyFont}.</p>
          <span className="mt-3 inline-block px-4 py-2 text-xs tracking-[0.2em]" style={{ background: t.buttonStyle === 'solid' ? t.colors.primary : 'transparent', color: t.buttonStyle === 'solid' ? t.colors.primaryContrast : t.colors.text, border: t.buttonStyle === 'outline' ? `1px solid ${t.colors.primary}` : 'none', borderBottom: t.buttonStyle === 'minimal' ? `1px solid ${t.colors.primary}` : undefined, borderRadius: { none: 0, sm: 4, md: 10, lg: 18 }[t.radius], textTransform: t.buttonCase === 'uppercase' ? 'uppercase' : 'none' }}>Reserve</span>
        </div>
      </div>
    ),
    header: (
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.header.transparentOnHero} onChange={(v) => up('header', { transparentOnHero: v })} label="Transparent header over hero images" /></div>
        <div className="grid grid-cols-2 gap-3">
          <Text label="Button label" value={cfg.header.ctaLabel} onChange={(v) => up('header', { ctaLabel: v })} />
          <Text label="Button link" value={cfg.header.ctaHref} onChange={(v) => up('header', { ctaHref: v })} error={e('header.ctaHref')} />
        </div>
        <div><span className="admin-label">Main menu (first half shows left of the logo, second half right)</span><NavEditor items={cfg.header.menu} onChange={(m) => up('header', { menu: m })} /></div>
      </div>
    ),
    footer: (
      <div className="space-y-4">
        <Text label="About text" textarea value={cfg.footer.about} onChange={(v) => up('footer', { about: v })} />
        <Text label="Copyright line" value={cfg.footer.bottomText} onChange={(v) => up('footer', { bottomText: v })} hint="{year} is replaced with the current year" />
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.footer.showNewsletter} onChange={(v) => up('footer', { showNewsletter: v })} label="Show newsletter signup in footer" /></div>
        {cfg.footer.columns.map((col, i) => (
          <div key={col.id} className="rounded-lg border border-zinc-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input className="admin-input font-medium" value={col.title} onChange={(ev) => up('footer', { columns: cfg.footer.columns.map((c, j) => (j === i ? { ...c, title: ev.target.value } : c)) })} aria-label="Column title" />
              <button type="button" className="admin-btn-ghost !p-1.5 text-red-600" onClick={() => up('footer', { columns: cfg.footer.columns.filter((_, j) => j !== i) })} aria-label="Remove column"><Trash2 className="h-4 w-4" /></button>
            </div>
            <NavEditor items={col.links} depth={1} onChange={(links) => up('footer', { columns: cfg.footer.columns.map((c, j) => (j === i ? { ...c, links } : c)) })} />
          </div>
        ))}
        {cfg.footer.columns.length < 5 && <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={() => up('footer', { columns: [...cfg.footer.columns, { id: uid(), title: 'New column', links: [] }] })}><Plus className="h-3.5 w-3.5" /> Add column</button>}
      </div>
    ),
    announcement: (
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.announcement.enabled} onChange={(v) => up('announcement', { enabled: v })} label="Show announcement bar" /></div>
        <Text label="Message" textarea value={cfg.announcement.text} onChange={(v) => up('announcement', { text: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Text label="Link label" value={cfg.announcement.linkLabel} onChange={(v) => up('announcement', { linkLabel: v })} />
          <Text label="Link" value={cfg.announcement.linkHref} onChange={(v) => up('announcement', { linkHref: v })} error={e('announcement.linkHref')} />
        </div>
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.announcement.dismissible} onChange={(v) => up('announcement', { dismissible: v })} label="Visitors can dismiss it" /></div>
      </div>
    ),
    contact: (
      <div className="grid grid-cols-2 gap-3">
        <Text label="Phone" value={cfg.contact.phone} onChange={(v) => up('contact', { phone: v })} />
        <Text label="Email" value={cfg.contact.email} onChange={(v) => up('contact', { email: v })} />
        <Text label="WhatsApp number" value={cfg.contact.whatsapp} onChange={(v) => up('contact', { whatsapp: v })} hint="Digits with country code, e.g. 919876543210" error={e('contact.whatsapp')} />
        <Text label="WhatsApp greeting" value={cfg.contact.whatsappMessage} onChange={(v) => up('contact', { whatsappMessage: v })} />
        <div className="col-span-2"><Text label="Address line 1" value={cfg.contact.addressLine1} onChange={(v) => up('contact', { addressLine1: v })} /></div>
        <div className="col-span-2"><Text label="Address line 2" value={cfg.contact.addressLine2} onChange={(v) => up('contact', { addressLine2: v })} /></div>
        <Text label="City" value={cfg.contact.city} onChange={(v) => up('contact', { city: v })} />
        <Text label="Country" value={cfg.contact.country} onChange={(v) => up('contact', { country: v })} />
        <div className="col-span-2"><Text label="Google Maps search" value={cfg.contact.mapQuery} onChange={(v) => up('contact', { mapQuery: v })} hint="What to search on the map, e.g. the hotel name and city" /></div>
        <Text label="Latitude" value={cfg.contact.latitude == null ? '' : String(cfg.contact.latitude)} onChange={(v) => up('contact', { latitude: v === '' ? null : Number(v) })} />
        <Text label="Longitude" value={cfg.contact.longitude == null ? '' : String(cfg.contact.longitude)} onChange={(v) => up('contact', { longitude: v === '' ? null : Number(v) })} />
      </div>
    ),
    social: (
      <div className="space-y-3">
        {(['instagram', 'facebook', 'x', 'youtube', 'linkedin', 'tripadvisor'] as const).map((k) => <Text key={k} label={k === 'x' ? 'X (Twitter)' : k[0].toUpperCase() + k.slice(1)} value={cfg.social[k]} onChange={(v) => up('social', { [k]: v })} error={e(`social.${k}`)} placeholder="https://" />)}
        <p className="text-xs text-zinc-500">Leave blank to hide an icon.</p>
      </div>
    ),
    seo: (
      <div className="space-y-4">
        <Text label="Default title (home page)" value={cfg.seo.defaultTitle} onChange={(v) => up('seo', { defaultTitle: v })} />
        <Text label="Title template" value={cfg.seo.titleTemplate} onChange={(v) => up('seo', { titleTemplate: v })} hint="%s is replaced with the page title" />
        <Text label="Default description" textarea value={cfg.seo.description} onChange={(v) => up('seo', { description: v })} />
        <Text label="Keywords" value={cfg.seo.keywords} onChange={(v) => up('seo', { keywords: v })} />
        <ImageField label="Default social sharing image" value={cfg.seo.ogImage} onChange={(v) => up('seo', { ogImage: v })} />
      </div>
    ),
    integrations: (
      <div className="space-y-4">
        <Text label="Google Analytics 4 measurement ID" value={cfg.integrations.gaMeasurementId} onChange={(v) => up('integrations', { gaMeasurementId: v.trim() })} hint="G-XXXXXXX. Loaded only after visitors accept analytics cookies." error={e('integrations.gaMeasurementId')} />
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.integrations.showWhatsappButton} onChange={(v) => up('integrations', { showWhatsappButton: v })} label="Floating WhatsApp button" /></div>
        <div className="rounded-lg border border-zinc-200 p-3"><Toggle checked={cfg.integrations.cookieConsent} onChange={(v) => up('integrations', { cookieConsent: v })} label="Cookie consent banner" description="Recommended. Required for analytics in many jurisdictions." /></div>
      </div>
    ),
    locale: (
      <div className="space-y-4">
        <Text label="Default language" value={cfg.locale.defaultLanguage} onChange={(v) => up('locale', { defaultLanguage: v })} />
        <Text label="Languages (comma separated codes)" value={cfg.locale.languages.join(', ')} onChange={(v) => up('locale', { languages: v.split(',').map((s) => s.trim()).filter(Boolean) })} hint="The content model is ready for translations; currently English content is served." />
        <span className="admin-label">Display currencies (prices are charged in INR)</span>
        {cfg.locale.displayCurrencies.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input className="admin-input w-24 uppercase" value={c.code} maxLength={3} onChange={(ev) => up('locale', { displayCurrencies: cfg.locale.displayCurrencies.map((x, j) => (j === i ? { ...x, code: ev.target.value.toUpperCase() } : x)) })} aria-label="Currency code" />
            <input className="admin-input" type="number" step="0.0001" value={c.ratePerInr} onChange={(ev) => up('locale', { displayCurrencies: cfg.locale.displayCurrencies.map((x, j) => (j === i ? { ...x, ratePerInr: Number(ev.target.value) } : x)) })} aria-label="Rate per INR" />
            <button type="button" className="admin-btn-ghost !p-1.5 text-red-600" onClick={() => up('locale', { displayCurrencies: cfg.locale.displayCurrencies.filter((_, j) => j !== i) })} aria-label="Remove currency"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" className="admin-btn-secondary !py-1 text-xs" onClick={() => up('locale', { displayCurrencies: [...cfg.locale.displayCurrencies, { code: 'AED', ratePerInr: 0.044 }] })}><Plus className="h-3.5 w-3.5" /> Add currency</button>
      </div>
    ),
  };

  return (
    <div>
      <PageHeader title="Theme & site settings" description="Brand, design, navigation and site-wide content. Changes stay in draft until you publish."
        actions={<>
          {dirty ? <Badge color="amber">Unsaved edits</Badge> : data.hasUnpublishedChanges ? <Badge color="amber">Draft not published</Badge> : <Badge color="green">Live v{data.version}</Badge>}
          <button className="admin-btn-ghost text-xs" onClick={() => setShowPreview((s) => !s)}>{showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Preview</button>
          <button className="admin-btn-ghost text-xs" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /> History</button>
          {data.hasUnpublishedChanges && !dirty && <button className="admin-btn-ghost text-xs" onClick={async () => { if (await confirm({ title: 'Discard the unpublished draft?', confirmLabel: 'Discard', danger: true })) discard.mutate(); }}><RotateCcw className="h-4 w-4" /> Discard draft</button>}
          <button className="admin-btn-secondary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /> Save draft</button>
          <button className="admin-btn-primary" disabled={publish.isPending || (!dirty && !data.hasUnpublishedChanges)} onClick={() => publish.mutate()}><Upload className="h-4 w-4" /> Publish</button>
        </>} />
      <div className={cn('grid gap-6', showPreview && 'xl:grid-cols-[minmax(380px,460px)_1fr]')}>
        <div className="admin-card overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 p-2 scrollbar-none" role="tablist">
            {TABS.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={cn('whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium', tab === x.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>{x.label}</button>)}
          </div>
          <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-5">
            {panels[tab]}
            <div className="mt-6 border-t border-zinc-100 pt-4">
              <button className="admin-btn-ghost text-xs" onClick={async () => { if (await confirm({ title: `Reset “${TABS.find((x) => x.id === tab)?.label}” to factory defaults?`, body: 'Only the draft changes; publish to apply.', confirmLabel: 'Reset' })) reset.mutate(resettable[tab]); }}><RotateCcw className="h-3.5 w-3.5" /> Reset this section to default</button>
            </div>
          </div>
        </div>
        {showPreview && (
          <div className="hidden h-[calc(100vh-11rem)] xl:block">
            <PreviewFrame ref={frame} path="/" reloadKey={reloadKey} />
          </div>
        )}
      </div>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen} title="Published versions" description="Load an earlier design into the draft, review it in the preview, then publish.">
        <ul className="divide-y divide-zinc-100">
          {data.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>v{h.version} · {h.publishedAt ? dateTime(h.publishedAt) : '—'} {h.status === 'PUBLISHED' && <Badge color="green">Live</Badge>}</span>
              {h.status !== 'PUBLISHED' && <button className="admin-btn-secondary !py-1 text-xs" onClick={() => restore.mutate(h.id)}>Load into draft</button>}
            </li>
          ))}
        </ul>
      </Dialog>
      {dialog}
    </div>
  );
}
