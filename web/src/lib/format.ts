import { formatMoney } from '@aurelle/shared';

export const money = (minor: number | null | undefined, opts: { decimals?: boolean } = {}) => (minor == null ? '—' : formatMoney(minor, 'INR', 'en-IN', opts));

export const dateLong = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dateShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const dateTime = (v: string | Date) => new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const relTime = (v: string | Date) => {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** Converts rupee input (string/number) to paise. */
export const toPaise = (v: string | number) => Math.round(Number(v || 0) * 100);
export const toRupees = (paise: number | null | undefined) => (paise == null ? '' : String(paise / 100));
