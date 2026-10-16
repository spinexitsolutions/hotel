import { bookingSettingsSchema, defaultBookingSettings, type BookingSettings } from '@aurelle/shared';
import { prisma, type Db } from '../config/prisma';

const KEY = 'booking';
let cache: { value: BookingSettings; at: number } | null = null;

export async function getBookingSettings(db: Db = prisma): Promise<BookingSettings> {
  if (cache && Date.now() - cache.at < 5_000) return cache.value;
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = bookingSettingsSchema.safeParse({ ...defaultBookingSettings(), ...((row?.value as object) ?? {}) });
  const value = parsed.success ? parsed.data : defaultBookingSettings();
  cache = { value, at: Date.now() };
  return value;
}

export async function saveBookingSettings(input: BookingSettings, userId?: string) {
  const value = bookingSettingsSchema.parse(input);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
  cache = null;
  return value;
}

export function clearSettingsCache() {
  cache = null;
}
