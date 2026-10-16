import { describe, expect, it } from 'vitest';
import { srcFor, srcSetFor } from '@/lib/image';
import { applyTheme } from '@/lib/theme';
import { money, toPaise, toRupees } from '@/lib/format';
import { THEME_PRESETS } from '@aurelle/shared';

describe('responsive images', () => {
  it('adds widths to Unsplash URLs', () => {
    const u = 'https://images.unsplash.com/photo-1?auto=format&fit=crop&q=80';
    expect(srcFor(u, 960)).toContain('w=960');
    expect(srcSetFor(u)?.split(',').length).toBe(5);
  });
  it('maps local uploads to available WebP variants', () => {
    expect(srcFor('/uploads/rooms/abc-1600.webp', 700)).toBe('/uploads/rooms/abc-960.webp');
    expect(srcSetFor('/uploads/rooms/abc-960.webp')).toBe('/uploads/rooms/abc-480.webp 480w, /uploads/rooms/abc-960.webp 960w');
  });
  it('leaves unknown URLs untouched', () => {
    expect(srcFor('https://example.com/x.jpg', 480)).toBe('https://example.com/x.jpg');
    expect(srcSetFor('')).toBeUndefined();
  });
});

describe('theme engine', () => {
  it('writes theme tokens to CSS variables', () => {
    applyTheme(THEME_PRESETS['emerald-palace'].tokens);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--c-secondary')).toBe('11 31 26');
    expect(s.getPropertyValue('--font-heading')).toBe("'Playfair Display'");
    expect(s.getPropertyValue('--radius')).toBe('10px');
    expect(document.documentElement.dataset.button).toBe('solid');
  });
});

describe('money helpers', () => {
  it('formats paise as INR and converts inputs', () => {
    expect(money(1_950_000)).toBe('₹19,500');
    expect(toPaise('199.99')).toBe(19999);
    expect(toRupees(150000)).toBe('1500');
  });
});
