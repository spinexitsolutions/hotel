import { z } from 'zod';

/**
 * CMS section registry. Each section type declares:
 *  - a zod schema for its props (validated on save/publish on the server),
 *  - field metadata the admin page builder uses to render editing forms automatically,
 *  - default props (used for "add section" and "reset to default").
 * Adding a new section type = add an entry here + a renderer in web/src/sections.
 */

export type FieldDef =
  | { key: string; label: string; type: 'text'; placeholder?: string; help?: string }
  | { key: string; label: string; type: 'textarea'; rows?: number; help?: string }
  | { key: string; label: string; type: 'markdown'; help?: string }
  | { key: string; label: string; type: 'image'; help?: string }
  | { key: string; label: string; type: 'link'; help?: string }
  | { key: string; label: string; type: 'number'; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: 'boolean'; help?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: 'icon'; help?: string }
  | { key: string; label: string; type: 'list'; itemLabel: string; fields: FieldDef[]; max?: number; help?: string };

const str = (max = 300) => z.string().max(max).default('');
const md = () => z.string().max(20_000).default('');
const img = () => z.string().max(1000).default('');
const lnk = () => z.string().max(500).default('');

export const ICONS = [
  'sparkles', 'waves', 'utensils', 'wine', 'flower', 'dumbbell', 'car', 'plane', 'wifi', 'concierge', 'bed', 'bath',
  'sun', 'mountain', 'palmtree', 'heart', 'gem', 'crown', 'coffee', 'music', 'baby', 'dog', 'shield', 'leaf', 'ship', 'map', 'clock', 'star',
] as const;

const tone = z.enum(['light', 'surface', 'dark']).default('light');
const toneField: FieldDef = {
  key: 'tone', label: 'Background', type: 'select',
  options: [{ value: 'light', label: 'Ivory' }, { value: 'surface', label: 'Warm beige' }, { value: 'dark', label: 'Midnight' }],
};
const headingFields: FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'subheading', label: 'Subheading', type: 'textarea', rows: 2 },
];
const headingSchema = { eyebrow: str(80), heading: str(160), subheading: str(400) };

export const SECTION_REGISTRY = {
  hero: {
    label: 'Cinematic hero',
    description: 'Full-screen HD background video (or image slideshow) with rotating captions and optional booking bar.',
    schema: z.object({
      videoUrl: lnk(),
      videoUrlMobile: lnk(),
      videoWebmUrl: lnk(),
      poster: img(),
      focus: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
      overlay: z.number().int().min(0).max(85).default(45),
      slides: z.array(z.object({ image: img(), alt: str(200), eyebrow: str(80), heading: str(160), subheading: str(300) })).min(1).max(6),
      showBookingBar: z.boolean().default(true),
      ctaLabel: str(40),
      ctaHref: lnk(),
      height: z.enum(['full', 'large']).default('full'),
      interval: z.number().int().min(3).max(20).default(7),
    }),
    fields: [
      { key: 'videoUrl', label: 'Background video (MP4, 1080p or 4K)', type: 'link', help: 'H.264 MP4, 1920×1080 or 3840×2160, 15–40 s, no audio. A path like /videos/hero-1080p.mp4 or a full https URL. Leave empty to use the image slideshow.' },
      { key: 'videoUrlMobile', label: 'Mobile video (optional, lighter MP4)', type: 'link', help: 'Served on screens narrower than 768px, e.g. a 1280×720 encode. Falls back to the main video.' },
      { key: 'videoWebmUrl', label: 'WebM version (optional)', type: 'link', help: 'VP9/AV1 WebM of the main video; smaller files for browsers that support it.' },
      { key: 'poster', label: 'Poster image', type: 'image', help: 'Shown while the video loads, on Save-Data connections, with reduced motion, or if the video fails. Use the first frame of the video.' },
      { key: 'focus', label: 'Video focal point', type: 'select', help: 'Which part of the frame stays visible when the screen crops it.', options: [
        { value: 'center', label: 'Center' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      ] },
      { key: 'overlay', label: 'Darkening overlay (%)', type: 'number', min: 0, max: 85, help: 'Keeps the headline readable over bright footage.' },
      { key: 'slides', label: 'Slides / captions', type: 'list', itemLabel: 'Slide', max: 6, help: 'With a video, these captions rotate over it; without one, their images form the slideshow.', fields: [
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'alt', label: 'Alt text', type: 'text' },
        { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
        { key: 'heading', label: 'Heading', type: 'text' },
        { key: 'subheading', label: 'Subheading', type: 'textarea', rows: 2 },
      ] },
      { key: 'showBookingBar', label: 'Show booking search bar', type: 'boolean' },
      { key: 'ctaLabel', label: 'Button label', type: 'text' },
      { key: 'ctaHref', label: 'Button link', type: 'link' },
      { key: 'height', label: 'Height', type: 'select', options: [{ value: 'full', label: 'Full screen' }, { value: 'large', label: 'Large' }] },
      { key: 'interval', label: 'Seconds per slide', type: 'number', min: 3, max: 20 },
    ] as FieldDef[],
  },
  pageHeader: {
    label: 'Page header',
    description: 'Editorial banner for inner pages.',
    schema: z.object({ ...headingSchema, image: img(), alt: str(200), align: z.enum(['center', 'left']).default('center') }),
    fields: [...headingFields, { key: 'image', label: 'Background image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'select', options: [{ value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }] }] as FieldDef[],
  },
  intro: {
    label: 'Editorial text',
    description: 'Heading with rich text and an optional image.',
    schema: z.object({
      ...headingSchema, body: md(), image: img(), alt: str(200),
      layout: z.enum(['centered', 'image-left', 'image-right']).default('centered'),
      ctaLabel: str(40), ctaHref: lnk(), tone,
    }),
    fields: [...headingFields, { key: 'body', label: 'Body', type: 'markdown' }, { key: 'image', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'layout', label: 'Layout', type: 'select', options: [{ value: 'centered', label: 'Centered text' }, { value: 'image-left', label: 'Image left' }, { value: 'image-right', label: 'Image right' }] },
      { key: 'ctaLabel', label: 'Button label', type: 'text' }, { key: 'ctaHref', label: 'Button link', type: 'link' }, toneField] as FieldDef[],
  },
  featuredRooms: {
    label: 'Featured rooms',
    description: 'Rooms marked as featured, loaded live from room management.',
    schema: z.object({ ...headingSchema, limit: z.number().int().min(1).max(9).default(3), ctaLabel: str(40), tone }),
    fields: [...headingFields, { key: 'limit', label: 'Number of rooms', type: 'number', min: 1, max: 9 }, { key: 'ctaLabel', label: 'Link label', type: 'text' }, toneField] as FieldDef[],
  },
  roomExplorer: {
    label: 'Rooms explorer',
    description: 'All published rooms with search, filters and sorting.',
    schema: z.object({ ...headingSchema }),
    fields: headingFields,
  },
  amenities: {
    label: 'Amenities grid',
    description: 'Icon list of hotel amenities.',
    schema: z.object({ ...headingSchema, items: z.array(z.object({ icon: z.enum(ICONS).default('sparkles'), title: str(80), description: str(240) })).max(16), tone }),
    fields: [...headingFields, { key: 'items', label: 'Amenities', type: 'list', itemLabel: 'Amenity', max: 16, fields: [
      { key: 'icon', label: 'Icon', type: 'icon' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea', rows: 2 },
    ] }, toneField] as FieldDef[],
  },
  featureSplit: {
    label: 'Feature split',
    description: 'Large image with editorial copy — dining, spa, pools.',
    schema: z.object({
      ...headingSchema, body: md(), image: img(), alt: str(200), reverse: z.boolean().default(false),
      ctaLabel: str(40), ctaHref: lnk(), details: z.array(z.object({ label: str(40), value: str(120) })).max(6), tone,
    }),
    fields: [...headingFields, { key: 'body', label: 'Body', type: 'markdown' }, { key: 'image', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'reverse', label: 'Image on the right', type: 'boolean' }, { key: 'ctaLabel', label: 'Button label', type: 'text' }, { key: 'ctaHref', label: 'Button link', type: 'link' },
      { key: 'details', label: 'Details', type: 'list', itemLabel: 'Detail', max: 6, fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }] },
      toneField] as FieldDef[],
  },
  cards: {
    label: 'Cards',
    description: 'Restaurants, treatments, experiences or venues as image cards.',
    schema: z.object({
      ...headingSchema,
      columns: z.enum(['2', '3', '4']).default('3'),
      items: z.array(z.object({ image: img(), alt: str(200), title: str(100), meta: str(100), description: str(500), linkLabel: str(40), href: lnk() })).max(12),
      tone,
    }),
    fields: [...headingFields, { key: 'columns', label: 'Columns', type: 'select', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
      { key: 'items', label: 'Cards', type: 'list', itemLabel: 'Card', max: 12, fields: [
        { key: 'image', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' }, { key: 'title', label: 'Title', type: 'text' },
        { key: 'meta', label: 'Meta (e.g. hours, duration)', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
        { key: 'linkLabel', label: 'Link label', type: 'text' }, { key: 'href', label: 'Link', type: 'link' },
      ] }, toneField] as FieldDef[],
  },
  offers: {
    label: 'Offers & packages',
    description: 'Active offers, loaded live from Pricing & Offers.',
    schema: z.object({ ...headingSchema, limit: z.number().int().min(1).max(12).default(3), featuredOnly: z.boolean().default(true), tone }),
    fields: [...headingFields, { key: 'limit', label: 'Number of offers', type: 'number', min: 1, max: 12 }, { key: 'featuredOnly', label: 'Featured offers only', type: 'boolean' }, toneField] as FieldDef[],
  },
  testimonials: {
    label: 'Guest testimonials',
    description: 'Approved, featured reviews.',
    schema: z.object({ ...headingSchema, limit: z.number().int().min(1).max(12).default(6), showRating: z.boolean().default(true), tone }),
    fields: [...headingFields, { key: 'limit', label: 'Number of reviews', type: 'number', min: 1, max: 12 }, { key: 'showRating', label: 'Show rating summary', type: 'boolean' }, toneField] as FieldDef[],
  },
  gallery: {
    label: 'Photo gallery',
    description: 'Images from the gallery library.',
    schema: z.object({ ...headingSchema, category: z.string().max(30).default(''), limit: z.number().int().min(1).max(60).default(8), showFilters: z.boolean().default(false), tone }),
    fields: [...headingFields,
      { key: 'category', label: 'Category', type: 'select', options: [{ value: '', label: 'All' }, ...['HOTEL', 'ROOMS', 'DINING', 'SPA', 'POOL', 'EVENTS', 'DESTINATION'].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }))] },
      { key: 'limit', label: 'Number of images', type: 'number', min: 1, max: 60 }, { key: 'showFilters', label: 'Show category filters', type: 'boolean' }, toneField] as FieldDef[],
  },
  location: {
    label: 'Location & attractions',
    description: 'Map (address from site settings) and nearby attractions.',
    schema: z.object({ ...headingSchema, attractions: z.array(z.object({ name: str(80), distance: str(40), description: str(200) })).max(10), showMap: z.boolean().default(true), tone }),
    fields: [...headingFields, { key: 'showMap', label: 'Show map', type: 'boolean' },
      { key: 'attractions', label: 'Nearby attractions', type: 'list', itemLabel: 'Attraction', max: 10, fields: [
        { key: 'name', label: 'Name', type: 'text' }, { key: 'distance', label: 'Distance', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea', rows: 2 },
      ] }, toneField] as FieldDef[],
  },
  stats: {
    label: 'Numbers',
    description: 'A row of highlight figures.',
    schema: z.object({ items: z.array(z.object({ value: str(20), label: str(60) })).max(6), tone }),
    fields: [{ key: 'items', label: 'Figures', type: 'list', itemLabel: 'Figure', max: 6, fields: [{ key: 'value', label: 'Value', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }] }, toneField] as FieldDef[],
  },
  ctaBanner: {
    label: 'Call-to-action banner',
    description: 'Full-width image banner with a button.',
    schema: z.object({ ...headingSchema, image: img(), alt: str(200), ctaLabel: str(40), ctaHref: lnk() }),
    fields: [...headingFields, { key: 'image', label: 'Background image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'ctaLabel', label: 'Button label', type: 'text' }, { key: 'ctaHref', label: 'Button link', type: 'link' }] as FieldDef[],
  },
  newsletter: {
    label: 'Newsletter signup',
    description: 'Email subscription form.',
    schema: z.object({ ...headingSchema, buttonLabel: str(30), tone }),
    fields: [...headingFields, { key: 'buttonLabel', label: 'Button label', type: 'text' }, toneField] as FieldDef[],
  },
  faq: {
    label: 'FAQ',
    description: 'Questions from the FAQ library.',
    schema: z.object({ ...headingSchema, category: z.string().max(40).default(''), tone }),
    fields: [...headingFields, { key: 'category', label: 'Category (blank = all)', type: 'text' }, toneField] as FieldDef[],
  },
  contactForm: {
    label: 'Contact form',
    description: 'Enquiry form with contact details. Submissions arrive in Inquiries.',
    schema: z.object({
      ...headingSchema,
      inquiryType: z.enum(['GENERAL', 'RESERVATION', 'WEDDING', 'EVENT', 'DINING', 'SPA', 'SUPPORT', 'FEEDBACK']).default('GENERAL'),
      showEventFields: z.boolean().default(false),
      showDetails: z.boolean().default(true),
      tone,
    }),
    fields: [...headingFields,
      { key: 'inquiryType', label: 'Enquiry type', type: 'select', options: ['GENERAL', 'RESERVATION', 'WEDDING', 'EVENT', 'DINING', 'SPA', 'SUPPORT', 'FEEDBACK'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() })) },
      { key: 'showEventFields', label: 'Ask for event date & guest count', type: 'boolean' },
      { key: 'showDetails', label: 'Show contact details', type: 'boolean' }, toneField] as FieldDef[],
  },
  roomTour: {
    label: '3D suite layout',
    description: 'Interactive 3D floor plan of a room (static image on mobile).',
    schema: z.object({ ...headingSchema, roomSlug: str(120), fallbackImage: img(), tone }),
    fields: [...headingFields, { key: 'roomSlug', label: 'Room slug', type: 'text', help: 'e.g. lake-palace-suite' }, { key: 'fallbackImage', label: 'Fallback image', type: 'image' }, toneField] as FieldDef[],
  },
  journal: {
    label: 'Journal posts',
    description: 'Latest blog posts and travel guides.',
    schema: z.object({ ...headingSchema, limit: z.number().int().min(1).max(12).default(3), tone }),
    fields: [...headingFields, { key: 'limit', label: 'Number of posts', type: 'number', min: 1, max: 12 }, toneField] as FieldDef[],
  },
  richText: {
    label: 'Long-form text',
    description: 'Policies and long articles.',
    schema: z.object({ body: md(), narrow: z.boolean().default(true), tone }),
    fields: [{ key: 'body', label: 'Body', type: 'markdown' }, { key: 'narrow', label: 'Narrow reading width', type: 'boolean' }, toneField] as FieldDef[],
  },
} as const;

export type SectionType = keyof typeof SECTION_REGISTRY;
export const SECTION_TYPES = Object.keys(SECTION_REGISTRY) as SectionType[];
export type SectionProps<T extends SectionType> = z.infer<(typeof SECTION_REGISTRY)[T]['schema']>;

export interface Section<T extends SectionType = SectionType> {
  id: string;
  type: T;
  enabled: boolean;
  props: SectionProps<T>;
}

export const pageSeoSchema = z.object({
  title: z.string().max(80).default(''),
  description: z.string().max(300).default(''),
  ogImage: z.string().max(1000).default(''),
  noIndex: z.boolean().default(false),
});

export const sectionSchema = z
  .object({ id: z.string().min(1).max(60), type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]), enabled: z.boolean().default(true), props: z.record(z.unknown()) })
  .superRefine((s, ctx) => {
    const parsed = SECTION_REGISTRY[s.type].schema.safeParse(s.props);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['props', ...issue.path] });
    }
  })
  .transform((s) => ({ ...s, props: SECTION_REGISTRY[s.type].schema.parse(s.props) }));

export const pageContentSchema = z.object({
  sections: z.array(sectionSchema).max(40),
  seo: pageSeoSchema,
});
export type PageContent = { sections: Section[]; seo: z.infer<typeof pageSeoSchema> };

/** Lenient schema for drafts: sections are shape-checked but props may be incomplete. */
export const pageDraftSchema = z.object({
  sections: z.array(z.object({ id: z.string().min(1).max(60), type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]), enabled: z.boolean().default(true), props: z.record(z.unknown()) })).max(40),
  seo: pageSeoSchema,
});

export function defaultSectionProps<T extends SectionType>(type: T): SectionProps<T> {
  const base = SECTION_REGISTRY[type].schema as unknown as z.ZodTypeAny;
  if (type === 'hero') return { ...SECTION_REGISTRY.hero.schema.parse({ slides: [{ heading: 'A palace on the water' }] }) } as SectionProps<T>;
  return base.parse(emptyFor(type)) as SectionProps<T>;
}

function emptyFor(type: SectionType): Record<string, unknown> {
  const s = SECTION_REGISTRY[type].schema;
  const shape = s.shape as Record<string, z.ZodTypeAny>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (v instanceof z.ZodArray) out[k] = [];
  }
  return out;
}
