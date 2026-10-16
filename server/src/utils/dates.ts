import { parseDate, toISODate } from '@aurelle/shared';

/** Prisma maps DATE columns to JS Dates at UTC midnight. */
export const dbDate = (iso: string) => parseDate(iso);
export const isoOf = (d: Date) => toISODate(d);
export const isoOrNull = (d: Date | null | undefined) => (d ? toISODate(d) : null);
