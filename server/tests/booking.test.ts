import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { isOverlapViolation, releaseExpiredHolds } from '../src/services/availability.service';
import { agent, bookingBody, future, login, resetFixtures, today } from './helpers';
import { addDays } from '@aurelle/shared';

let roomTypeId: string;

beforeEach(async () => {
  const f = await resetFixtures({ rooms: 2 });
  roomTypeId = f.roomType.id;
});

describe('booking creation', () => {
  it('creates an online booking that holds inventory until paid, with a server-computed price', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId));
    expect(res.status).toBe(201);
    const b = res.body.booking;
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(b.reference).toMatch(/^RBP-[A-Z0-9]{6}$/);
    // 2 nights × ₹10,000 + 18% GST (above ₹7,500 slab)
    expect(b.grandTotal).toBe(23_600_00);
    expect(res.body.payment.orderId).toMatch(/^order_sbx_/);
    expect(res.body.payment.isTest).toBe(true);
    expect(await prisma.bookingRoom.count({ where: { active: true } })).toBe(1);
  });

  it('confirms pay-at-hotel bookings as PENDING (manual confirmation by default)', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('PENDING');
    expect(res.body.payment).toBeNull();
  });

  it('rejects invalid dates', async () => {
    const a = await agent();
    expect((await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(5), checkOut: future(5) }))).status).toBe(422);
    expect((await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(5), checkOut: future(3) }))).status).toBe(422);
    const past = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: addDays(today(), -3), checkOut: addDays(today(), -1) }));
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe('INVALID_DATES');
    expect((await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: '2026-02-30', checkOut: '2026-03-02' }))).status).toBe(422);
  });

  it('enforces occupancy rules', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { adults: 4 }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STAY_RULES');
  });

  it('requires accepted terms and a CSRF token', async () => {
    const a = await agent();
    expect((await a.post('/api/bookings', bookingBody(roomTypeId, { acceptTerms: false }))).status).toBe(422);
    const noCsrf = await a.raw.post('/api/bookings').send(bookingBody(roomTypeId));
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF');
  });

  it('detects a changed price instead of silently charging a different amount', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { expectedTotal: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(res.body.error.details.quote.grandTotal).toBe(23_600_00);
  });
});

describe('overbooking protection', () => {
  it('never sells more rooms than exist under concurrent requests', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const a = await agent();
        return a.post('/api/bookings', bookingBody(roomTypeId, { guest: { firstName: 'G', lastName: String(i), email: `g${i}@example.com`, phone: '+91 90000 0000' + i } }));
      }),
    );
    const ok = attempts.filter((r) => r.status === 201);
    const soldOut = attempts.filter((r) => r.status === 409);
    expect(ok).toHaveLength(2);
    expect(soldOut).toHaveLength(4);
    expect(soldOut[0].body.error.code).toBe('SOLD_OUT');
    const active = await prisma.bookingRoom.findMany({ where: { active: true } });
    expect(new Set(active.map((r) => r.roomId)).size).toBe(2);
  });

  it('allows back-to-back stays (check-out day = next check-in day)', async () => {
    const a = await agent();
    for (let i = 0; i < 2; i++) expect((await a.post('/api/bookings', bookingBody(roomTypeId, { guest: { firstName: 'A', lastName: String(i), email: `a${i}@x.com`, phone: '+91 9000000000' } }))).status).toBe(201);
    const next = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(12), checkOut: future(14) }));
    expect(next.status).toBe(201);
    const overlap = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(11), checkOut: future(13) }));
    expect(overlap.status).toBe(409);
  });

  it('is enforced by the room_nights unique index even outside the service', async () => {
    const a = await agent();
    await a.post('/api/bookings', bookingBody(roomTypeId));
    const night = await prisma.roomNight.findFirstOrThrow();
    expect(await prisma.roomNight.count()).toBe(2); // 2 nights × 1 room
    const err = await prisma.roomNight.create({ data: { roomId: night.roomId, date: night.date, bookingId: 'other', bookingRoomId: 'other' } }).catch((e: unknown) => e);
    expect(isOverlapViolation(err)).toBe(true);
  });

  it('never oversells under concurrent requests', async () => {
    const guests = await Promise.all(Array.from({ length: 6 }, () => agent()));
    const results = await Promise.all(
      guests.map((g, i) => g.post('/api/bookings', bookingBody(roomTypeId, { guest: { firstName: 'C', lastName: String(i), email: `c${i}@x.com`, phone: '+91 9000000000' } }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await prisma.roomNight.count()).toBe(4);
  });

  it('releases inventory when an unpaid hold expires', async () => {
    const a = await agent();
    await a.post('/api/bookings', bookingBody(roomTypeId));
    await a.post('/api/bookings', bookingBody(roomTypeId, { guest: { firstName: 'B', lastName: 'B', email: 'b@x.com', phone: '+91 9000000001' } }));
    expect((await a.post('/api/bookings', bookingBody(roomTypeId))).status).toBe(409);
    await prisma.booking.updateMany({ data: { holdExpiresAt: new Date(Date.now() - 60_000) } });
    // Read paths ignore lapsed holds immediately; the job then frees them.
    expect((await a.post('/api/bookings', bookingBody(roomTypeId))).status).toBe(201);
    await releaseExpiredHolds(prisma);
    expect(await prisma.booking.count({ where: { status: 'EXPIRED' } })).toBe(2);
  });

  it('respects blackout dates and maintenance blocks', async () => {
    const admin = await login('super_admin@test.dev');
    const rooms = await prisma.room.findMany();
    expect((await admin.post('/api/admin/room-blocks', { roomId: rooms[0].id, startDate: future(10), endDate: future(12), reason: 'Painting' })).status).toBe(201);
    const a = await agent();
    expect((await a.post('/api/bookings', bookingBody(roomTypeId))).status).toBe(201);
    expect((await a.post('/api/bookings', bookingBody(roomTypeId))).status).toBe(409);
    expect((await admin.post('/api/admin/blackouts', { roomTypeId, startDate: future(20), endDate: future(21), reason: 'Private event' })).status).toBe(201);
    const closed = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(19), checkOut: future(22) }));
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('UNAVAILABLE');
  });
});

describe('cancellation', () => {
  it('lets a guest cancel for free before the deadline and frees the room', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    const { reference } = res.body.booking;
    const cancel = await a.raw.post(`/api/bookings/${reference}/cancel?token=${res.body.manageToken}`).set('x-csrf-token', a.token).send({ reason: 'Plans changed' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('CANCELLED');
    expect(cancel.body.outcome.free).toBe(true);
    expect(await prisma.bookingRoom.count({ where: { active: true } })).toBe(0);
  });

  it('does not reveal or cancel bookings without proof of ownership', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    const other = await agent();
    expect((await other.get(`/api/bookings/${res.body.booking.reference}`)).status).toBe(404);
    expect((await other.post(`/api/bookings/${res.body.booking.reference}/cancel`, {})).status).toBe(404);
    expect((await other.post('/api/bookings/lookup', { reference: res.body.booking.reference, email: 'wrong@example.com' })).status).toBe(404);
    expect((await other.post('/api/bookings/lookup', { reference: res.body.booking.reference, email: 'asha@example.com' })).status).toBe(200);
  });

  it('charges the first night when cancelling inside the deadline', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: future(1), checkOut: future(3), paymentMethod: 'PAY_AT_HOTEL' }));
    const staff = await login('super_admin@test.dev');
    const id = res.body.booking.id;
    await staff.post(`/api/admin/bookings/${id}/payments`, { amount: res.body.booking.grandTotal, method: 'CASH', reference: '' });
    const cancel = await staff.post(`/api/admin/bookings/${id}/cancel`, { reason: 'Guest request', notifyGuest: false });
    expect(cancel.status).toBe(200);
    expect(cancel.body.outcome.free).toBe(false);
    expect(cancel.body.outcome.penalty).toBe(11_800_00);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(b.refundStatus).toBe('PENDING');
    expect(b.refundableAmount).toBe(11_800_00);
  });
});

describe('staff operations', () => {
  it('runs the stay lifecycle with valid transitions only', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId, { checkIn: today(), checkOut: future(2), paymentMethod: 'PAY_AT_HOTEL' }));
    const id = res.body.booking.id;
    const desk = await login('receptionist@test.dev');
    expect((await desk.post(`/api/admin/bookings/${id}/status`, { status: 'CHECKED_OUT' })).status).toBe(409);
    expect((await desk.post(`/api/admin/bookings/${id}/status`, { status: 'CONFIRMED', notifyGuest: false })).status).toBe(200);
    expect((await desk.post(`/api/admin/bookings/${id}/status`, { status: 'CHECKED_IN' })).status).toBe(200);
    expect((await desk.post(`/api/admin/bookings/${id}/status`, { status: 'CHECKED_OUT' })).status).toBe(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CHECKED_OUT');
    // Receptionists cannot cancel or refund
    expect((await desk.post(`/api/admin/bookings/${id}/cancel`, { reason: 'x x x' })).status).toBe(403);
  });

  it('reassigns rooms but refuses an occupied one', async () => {
    const a = await agent();
    const r1 = await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    const staff = await login('booking_manager@test.dev');
    const detail = await staff.get(`/api/admin/bookings/${r1.body.booking.id}`);
    const allocation = detail.body.rooms[0];
    const other = detail.body.roomOptions.find((o: { id: string }) => o.id !== allocation.roomId);
    const res = await staff.post(`/api/admin/bookings/${r1.body.booking.id}/assign-rooms`, { assignments: [{ bookingRoomId: allocation.id, roomId: other.id }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_OCCUPIED');
  });

  it('modifies dates and re-prices', async () => {
    const a = await agent();
    const r = await a.post('/api/bookings', bookingBody(roomTypeId, { paymentMethod: 'PAY_AT_HOTEL' }));
    const staff = await login('hotel_manager@test.dev');
    const res = await staff.post(`/api/admin/bookings/${r.body.booking.id}/modify`, { checkIn: future(10), checkOut: future(13), adults: 2, children: 0, reason: 'Extended stay' });
    expect(res.status).toBe(200);
    expect(res.body.grandTotal).toBe(35_400_00);
  });
});
