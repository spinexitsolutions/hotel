import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #C8A96A');
const link = z.string().max(500).refine((v) => v === '' || v.startsWith('/') || v.startsWith('#') || /^https?:\/\//.test(v) || v.startsWith('mailto:') || v.startsWith('tel:'), 'Links must be relative (/page) or start with http(s)://, mailto: or tel:');
const optionalUrl = z.string().max(1000).refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Must be a URL or a /path');

/** Font pairs are an allowlist so the site can only load known Google Fonts families. */
export const FONT_OPTIONS = {
  heading: ['Cormorant Garamond', 'Playfair Display', 'Bodoni Moda', 'Marcellus', 'Cinzel', 'Libre Caslon Display', 'DM Serif Display', 'Italiana'],
  body: ['Jost', 'Inter', 'Manrope', 'Lato', 'Montserrat', 'Raleway', 'Nunito Sans', 'Work Sans'],
} as const;

export const navItemSchema: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(60),
    href: link,
    children: z.array(navItemSchema).max(12).optional(),
  }),
);
export interface NavItem {
  id: string;
  label: string;
  href: string;
  children?: NavItem[];
}

export const themeTokensSchema = z.object({
  presetKey: z.string().max(40).default('midnight-champagne'),
  colors: z.object({
    primary: hex, // champagne gold — accents, buttons
    primaryContrast: hex,
    secondary: hex, // midnight — dark sections, header
    background: hex, // ivory
    surface: hex, // warm beige
    text: hex,
    muted: hex,
    border: hex,
  }),
  typography: z.object({
    headingFont: z.enum(FONT_OPTIONS.heading),
    bodyFont: z.enum(FONT_OPTIONS.body),
    headingWeight: z.enum(['300', '400', '500', '600']),
    headingCase: z.enum(['normal', 'uppercase']),
    baseSize: z.number().int().min(14).max(19),
  }),
  radius: z.enum(['none', 'sm', 'md', 'lg']),
  buttonStyle: z.enum(['solid', 'outline', 'minimal']),
  buttonCase: z.enum(['uppercase', 'normal']),
  spacing: z.enum(['compact', 'comfortable', 'airy']),
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const siteConfigSchema = z.object({
  brand: z.object({
    name: z.string().min(1).max(80),
    tagline: z.string().max(140),
    logoUrl: optionalUrl,
    logoLightUrl: optionalUrl,
    faviconUrl: optionalUrl,
    monogram: z.string().max(3),
  }),
  theme: themeTokensSchema,
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().max(200),
    linkLabel: z.string().max(40),
    linkHref: link,
    dismissible: z.boolean(),
  }),
  header: z.object({
    transparentOnHero: z.boolean(),
    ctaLabel: z.string().max(30),
    ctaHref: link,
    menu: z.array(navItemSchema).max(12),
  }),
  footer: z.object({
    about: z.string().max(400),
    columns: z.array(z.object({ id: z.string(), title: z.string().max(40), links: z.array(navItemSchema).max(12) })).max(5),
    bottomText: z.string().max(200),
    showNewsletter: z.boolean(),
  }),
  contact: z.object({
    phone: z.string().max(40),
    email: z.string().max(120),
    whatsapp: z.string().max(20).regex(/^\d*$/, 'Digits only, with country code, e.g. 919876543210'),
    whatsappMessage: z.string().max(200),
    addressLine1: z.string().max(120),
    addressLine2: z.string().max(120),
    city: z.string().max(60),
    country: z.string().max(60),
    mapQuery: z.string().max(200),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  }),
  social: z.object({
    instagram: optionalUrl,
    facebook: optionalUrl,
    x: optionalUrl,
    youtube: optionalUrl,
    linkedin: optionalUrl,
    tripadvisor: optionalUrl,
  }),
  seo: z.object({
    titleTemplate: z.string().max(80),
    defaultTitle: z.string().max(80),
    description: z.string().max(300),
    ogImage: optionalUrl,
    keywords: z.string().max(300),
  }),
  integrations: z.object({
    gaMeasurementId: z.string().max(30).regex(/^(G-[A-Z0-9]+)?$/, 'Looks like G-XXXXXXX'),
    showWhatsappButton: z.boolean(),
    cookieConsent: z.boolean(),
  }),
  locale: z.object({
    defaultLanguage: z.string().max(10),
    languages: z.array(z.string().max(10)).max(10),
    displayCurrencies: z.array(z.object({ code: z.string().length(3), ratePerInr: z.number().positive() })).max(10),
  }),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;

export const THEME_PRESETS: Record<string, { label: string; tokens: ThemeTokens }> = {
  'midnight-champagne': {
    label: 'Midnight & Champagne',
    tokens: {
      presetKey: 'midnight-champagne',
      colors: { primary: '#C8A96A', primaryContrast: '#14120F', secondary: '#0E0E10', background: '#FAF7F0', surface: '#F1E9DB', text: '#1C1A17', muted: '#6F675C', border: '#E3D8C4' },
      typography: { headingFont: 'Cormorant Garamond', bodyFont: 'Jost', headingWeight: '400', headingCase: 'normal', baseSize: 16 },
      radius: 'none',
      buttonStyle: 'solid',
      buttonCase: 'uppercase',
      spacing: 'airy',
    },
  },
  'ivory-noir': {
    label: 'Ivory Noir',
    tokens: {
      presetKey: 'ivory-noir',
      colors: { primary: '#1A1A1A', primaryContrast: '#FFFFFF', secondary: '#111111', background: '#FFFFFF', surface: '#F4F1EC', text: '#141414', muted: '#6B6B6B', border: '#E6E1D8' },
      typography: { headingFont: 'Bodoni Moda', bodyFont: 'Inter', headingWeight: '400', headingCase: 'normal', baseSize: 16 },
      radius: 'none',
      buttonStyle: 'outline',
      buttonCase: 'uppercase',
      spacing: 'airy',
    },
  },
  'desert-rose': {
    label: 'Desert Rose',
    tokens: {
      presetKey: 'desert-rose',
      colors: { primary: '#B9826B', primaryContrast: '#FFFFFF', secondary: '#2B1F1B', background: '#FBF6F1', surface: '#EFE2D6', text: '#2B1F1B', muted: '#7A6A60', border: '#E7D7C9' },
      typography: { headingFont: 'Marcellus', bodyFont: 'Manrope', headingWeight: '400', headingCase: 'uppercase', baseSize: 16 },
      radius: 'sm',
      buttonStyle: 'solid',
      buttonCase: 'uppercase',
      spacing: 'comfortable',
    },
  },
  'emerald-palace': {
    label: 'Emerald Palace',
    tokens: {
      presetKey: 'emerald-palace',
      colors: { primary: '#B89B5E', primaryContrast: '#0B1F1A', secondary: '#0B1F1A', background: '#F8F5EE', surface: '#E9E3D3', text: '#13211D', muted: '#5E6B66', border: '#DCD3BF' },
      typography: { headingFont: 'Playfair Display', bodyFont: 'Lato', headingWeight: '400', headingCase: 'normal', baseSize: 16 },
      radius: 'md',
      buttonStyle: 'solid',
      buttonCase: 'normal',
      spacing: 'comfortable',
    },
  },
};

export const RADIUS_PX: Record<ThemeTokens['radius'], number> = { none: 0, sm: 4, md: 10, lg: 18 };
export const SPACING_SCALE: Record<ThemeTokens['spacing'], number> = { compact: 0.75, comfortable: 1, airy: 1.25 };

export function defaultSiteConfig(): SiteConfig {
  return {
    brand: { name: 'The Aurelle', tagline: 'A Palace on Lake Pichola', logoUrl: '', logoLightUrl: '', faviconUrl: '', monogram: 'A' },
    theme: THEME_PRESETS['midnight-champagne'].tokens,
    announcement: {
      enabled: true,
      text: 'Monsoon Escape — stay 3 nights, pay for 2, with complimentary spa ritual.',
      linkLabel: 'View offer',
      linkHref: '/offers',
      dismissible: true,
    },
    header: {
      transparentOnHero: true,
      ctaLabel: 'Reserve',
      ctaHref: '/book',
      menu: [
        { id: 'rooms', label: 'Rooms & Suites', href: '/rooms' },
        { id: 'dining', label: 'Dining', href: '/dining' },
        { id: 'spa', label: 'Spa & Wellness', href: '/spa' },
        { id: 'experiences', label: 'Experiences', href: '/experiences' },
        { id: 'weddings', label: 'Weddings & Events', href: '/weddings-events' },
        { id: 'offers', label: 'Offers', href: '/offers' },
        {
          id: 'discover', label: 'Discover', href: '/about', children: [
            { id: 'about', label: 'Our Story', href: '/about' },
            { id: 'gallery', label: 'Gallery', href: '/gallery' },
            { id: 'journal', label: 'Journal', href: '/journal' },
            { id: 'faq', label: 'FAQ', href: '/faq' },
            { id: 'contact', label: 'Contact', href: '/contact' },
          ],
        },
      ],
    },
    footer: {
      about: 'A restored eighteenth-century lake palace with sixty-two rooms and suites, three restaurants, and a spa drawn from the Ayurvedic tradition.',
      columns: [
        { id: 'stay', title: 'Stay', links: [
          { id: 'f-rooms', label: 'Rooms & Suites', href: '/rooms' },
          { id: 'f-offers', label: 'Offers & Packages', href: '/offers' },
          { id: 'f-book', label: 'Book a Stay', href: '/book' },
          { id: 'f-manage', label: 'Manage Booking', href: '/manage-booking' },
        ] },
        { id: 'explore', title: 'Explore', links: [
          { id: 'f-dining', label: 'Dining', href: '/dining' },
          { id: 'f-spa', label: 'Spa & Wellness', href: '/spa' },
          { id: 'f-exp', label: 'Experiences', href: '/experiences' },
          { id: 'f-wed', label: 'Weddings & Events', href: '/weddings-events' },
          { id: 'f-gallery', label: 'Gallery', href: '/gallery' },
        ] },
        { id: 'info', title: 'Information', links: [
          { id: 'f-about', label: 'Our Story', href: '/about' },
          { id: 'f-faq', label: 'FAQ', href: '/faq' },
          { id: 'f-contact', label: 'Contact', href: '/contact' },
          { id: 'f-privacy', label: 'Privacy Policy', href: '/privacy-policy' },
          { id: 'f-terms', label: 'Terms & Conditions', href: '/terms' },
          { id: 'f-cancel', label: 'Cancellation Policy', href: '/cancellation-policy' },
        ] },
      ],
      bottomText: '© {year} The Aurelle Hotels & Resorts. All rights reserved.',
      showNewsletter: true,
    },
    contact: {
      phone: '+91 294 000 0000',
      email: 'reservations@theaurelle.example',
      whatsapp: '912940000000',
      whatsappMessage: 'Hello, I would like to enquire about a stay at The Aurelle.',
      addressLine1: 'Lake Pichola, Old City',
      addressLine2: 'Udaipur, Rajasthan 313001',
      city: 'Udaipur',
      country: 'India',
      mapQuery: 'Lake Pichola, Udaipur, Rajasthan',
      latitude: 24.5764,
      longitude: 73.6797,
    },
    social: { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', x: '', youtube: 'https://youtube.com/', linkedin: '', tripadvisor: 'https://tripadvisor.com/' },
    seo: {
      titleTemplate: '%s · The Aurelle, Udaipur',
      defaultTitle: 'The Aurelle — Luxury Lake Palace Hotel in Udaipur',
      description: 'A restored lake palace in Udaipur with luxury suites, private pool villas, fine dining, an Ayurvedic spa and unforgettable weddings.',
      ogImage: '',
      keywords: 'luxury hotel udaipur, lake palace hotel, five star hotel rajasthan, palace wedding venue',
    },
    integrations: { gaMeasurementId: '', showWhatsappButton: true, cookieConsent: true },
    locale: { defaultLanguage: 'en', languages: ['en'], displayCurrencies: [{ code: 'USD', ratePerInr: 0.012 }, { code: 'EUR', ratePerInr: 0.011 }, { code: 'GBP', ratePerInr: 0.0095 }] },
  };
}
