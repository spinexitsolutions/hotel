import { RADIUS_PX, SPACING_SCALE, type SiteConfig } from '@aurelle/shared';

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Applies theme tokens as CSS variables on :root and loads the chosen Google Fonts. */
export function applyTheme(theme: SiteConfig['theme']) {
  const root = document.documentElement;
  const map: Record<string, string> = {
    primary: theme.colors.primary, 'primary-contrast': theme.colors.primaryContrast, secondary: theme.colors.secondary,
    background: theme.colors.background, surface: theme.colors.surface, text: theme.colors.text, muted: theme.colors.muted, border: theme.colors.border,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(`--c-${k}`, hexToRgb(v));
  root.style.setProperty('--font-heading', `'${theme.typography.headingFont}'`);
  root.style.setProperty('--font-body', `'${theme.typography.bodyFont}'`);
  root.style.setProperty('--heading-weight', theme.typography.headingWeight);
  root.style.setProperty('--heading-case', theme.typography.headingCase === 'uppercase' ? 'uppercase' : 'none');
  root.style.setProperty('--heading-tracking', theme.typography.headingCase === 'uppercase' ? '0.08em' : '-0.01em');
  root.style.setProperty('--radius', `${RADIUS_PX[theme.radius]}px`);
  root.style.setProperty('--space', String(SPACING_SCALE[theme.spacing]));
  root.style.setProperty('--btn-case', theme.buttonCase === 'uppercase' ? 'uppercase' : 'none');
  root.style.fontSize = `${theme.typography.baseSize}px`;
  root.dataset.button = theme.buttonStyle;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.secondary);
  loadFonts([theme.typography.headingFont, theme.typography.bodyFont]);
}

const loaded = new Set<string>();
function loadFonts(families: string[]) {
  const key = families.join('|');
  if (loaded.has(key)) return;
  loaded.add(key);
  const spec = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;1,400`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${spec}&display=swap`;
  link.dataset.themeFont = key;
  document.head.appendChild(link);
}

export function setFavicon(url: string) {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}
