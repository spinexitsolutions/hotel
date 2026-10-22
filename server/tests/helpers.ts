import request from 'supertest';
import { addDays, todayInZone, DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABELS, defaultBookingSettings } from '@aurelle/shared';
import { createApp } from '../src/app';
import { ensureIndexes, prisma, wipeDatabase } from '../src/config/prisma';
import { hashPassword } from '../src/services/auth.service';
import { clearSettingsCache } from '../src/services/settings.service';

export const app = createApp();
export const PASSWORD = 'Test-Password-123';

/** A cookie-jar agent that has fetched a CSRF token. */
export async function agent() {
  const a = request.agent(app);
  const res = await a.get('/api/csrf');
  const token = res.body.token as string;
  return {
    raw: a,
    token,
    get: (url: string) => a.get(url),
    post: (url: string, body?: unknown) => a.post(url).set('x-csrf-token', token).send(body as object),
    put: (url: string, body?: unknown) => a.put(url).set('x-csrf-token', token).send(body as object),
    patch: (url: string, body?: unknown) => a.patch(url).set('x-csrf-token', token).send(body as object),
    del: (url: string) => a.delete(url).set('x-csrf-token', token),
  };
}

export async function login(email: string, password = PASSWORD) {
  const a = await agent();
  const res = await a.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return a;
}

export const today = () => todayInZone('Asia/Kolkata');
export const future = (days: number) => addDays(today(), days);

/** Wipes the test DB and creates roles, one user per role, a room type with N rooms, and GST charges. */
export async function resetFixtures(opts: { rooms?: number } = {}) {
  await wipeDatabase();
  await ensureIndexes();
  clearSettingsCache();
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) roles[key] = (await prisma.role.create({ data: { key, name: ROLE_LABELS[key], permissions: DEFAULT_ROLE_PERMISSIONS[key] } })).id;
  const hash = await hashPassword(PASSWORD);
  for (const key of ROLE_KEYS) {
    await prisma.user.create({ data: { email: `${key.toLowerCase()}@test.dev`, name: key, roleId: roles[key], passwordHash: hash } });
  }
  await prisma.setting.create({ data: { key: 'booking', value: defaultBookingSettings() } });
  const roomType = await prisma.roomType.create({
    data: {
      slug: 'test-suite', name: 'Test Suite', basePrice: 10_000_00, baseOccupancy: 2, maxAdults: 3, maxChildren: 1, maxOccupancy: 3, maxExtraBeds: 1,
      extraAdultCharge: 2_000_00, sizeSqm: 50, status: 'PUBLISHED', minStay: 1, maxStay: 30,
    },
  });
  const rooms = [];
  for (let i = 1; i <= (opts.rooms ?? 2); i++) rooms.push(await prisma.room.create({ data: { number: `T${i}`, roomTypeId: roomType.id } }));
  await prisma.chargeRule.createMany({
    data: [
      { name: 'GST', kind: 'TAX', calculation: 'PERCENT', value: 500, appliesTo: 'ROOM', maxNightlyRate: 7_500_00 },
      { name: 'GST', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'ROOM', minNightlyRate: 7_500_01 },
    ],
  });
  return { roomType, rooms };
}

export function bookingBody(roomTypeId: string, over: Record<string, unknown> = {}) {
  return {
    roomTypeId, checkIn: future(10), checkOut: future(12), adults: 2, children: 0, rooms: 1,
    guest: { firstName: 'Asha', lastName: 'Verma', email: 'asha@example.com', phone: '+91 98765 43210' },
    paymentMethod: 'ONLINE', acceptTerms: true, ...over,
  };
}
