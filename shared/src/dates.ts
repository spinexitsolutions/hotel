/** Stay dates are calendar dates (YYYY-MM-DD) handled in UTC to avoid timezone drift. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error(`Invalid date: ${iso}`);
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || toISODate(d) !== iso) throw new Error(`Invalid date: ${iso}`);
  return d;
}

export function isValidISODate(iso: string): boolean {
  try {
    parseDate(iso);
    return true;
  } catch {
    return false;
  }
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / 86_400_000);
}

/** Each night of a stay: [checkIn, checkOut). */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights = diffDays(checkIn, checkOut);
  return Array.from({ length: Math.max(0, nights) }, (_, i) => addDays(checkIn, i));
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseDate(iso).getUTCDay();
}

/** Today's calendar date in a given IANA timezone (hotel-local "today"). */
export function todayInZone(timeZone = 'Asia/Kolkata', now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isWithin(iso: string, start: string, endInclusive: string): boolean {
  return iso >= start && iso <= endInclusive;
}
