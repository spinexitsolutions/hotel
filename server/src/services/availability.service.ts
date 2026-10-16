import { addDays, eachNight, todayInZone } from '@aurelle/shared';
import { Prisma, prisma, type Db, type Tx } from '../config/prisma';
import { dbDate, isoOf } from '../utils/dates';

export interface TypeAvailability {
  roomTypeId: string;
  totalRooms: number;
  freeRoomIds: string[];
  available: number;
  closed: boolean;
  closedReason?: string;
}

/**
 * Allocations that currently hold inventory: active rows, excluding unpaid holds whose hold window has lapsed
 * (those are released by `releaseExpiredHolds`, but read paths must not wait for the job).
 */
function holdingAllocationWhere(checkIn: string, checkOut: string): Prisma.BookingRoomWhereInput {
  return {
    active: true,
    checkIn: { lt: dbDate(checkOut) },
    checkOut: { gt: dbDate(checkIn) },
    NOT: { booking: { status: 'PENDING_PAYMENT', holdExpiresAt: { lt: new Date() } } },
  };
}

/** Availability of each room type for the stay [checkIn, checkOut). */
export async function availabilityForStay(db: Db, checkIn: string, checkOut: string, roomTypeIds?: string[]): Promise<Map<string, TypeAvailability>> {
  const typeFilter = roomTypeIds ? { roomTypeId: { in: roomTypeIds } } : {};
  const [rooms, allocations, blocks, blackouts] = await Promise.all([
    db.room.findMany({ where: { ...typeFilter, isArchived: false, status: 'AVAILABLE' }, select: { id: true, roomTypeId: true, number: true }, orderBy: { number: 'asc' } }),
    db.bookingRoom.findMany({ where: { ...holdingAllocationWhere(checkIn, checkOut), ...(roomTypeIds ? { room: { roomTypeId: { in: roomTypeIds } } } : {}) }, select: { roomId: true } }),
    db.roomBlock.findMany({ where: { startDate: { lt: dbDate(checkOut) }, endDate: { gt: dbDate(checkIn) } }, select: { roomId: true } }),
    db.blackoutDate.findMany({
      where: {
        startDate: { lte: dbDate(addDays(checkOut, -1)) },
        endDate: { gte: dbDate(checkIn) },
        ...(roomTypeIds ? { OR: [{ roomTypeId: null }, { roomTypeId: { in: roomTypeIds } }] } : {}),
      },
    }),
  ]);
  const busy = new Set([...allocations.map((a) => a.roomId), ...blocks.map((b) => b.roomId)]);
  const result = new Map<string, TypeAvailability>();
  const ids = roomTypeIds ?? Array.from(new Set(rooms.map((r) => r.roomTypeId)));
  for (const id of ids) result.set(id, { roomTypeId: id, totalRooms: 0, freeRoomIds: [], available: 0, closed: false });
  for (const r of rooms) {
    const t = result.get(r.roomTypeId);
    if (!t) continue;
    t.totalRooms += 1;
    if (!busy.has(r.id)) t.freeRoomIds.push(r.id);
  }
  for (const t of result.values()) {
    const bo = blackouts.find((b) => b.roomTypeId === null || b.roomTypeId === t.roomTypeId);
    if (bo) {
      t.closed = true;
      t.closedReason = bo.reason || 'Not available for these dates';
    }
    t.available = t.closed ? 0 : t.freeRoomIds.length;
  }
  return result;
}

export interface NightInventory {
  date: string;
  total: number;
  sold: number;
  blocked: number;
  available: number;
  closed: boolean;
}

/** Per-night inventory for each room type across [from, to). Used by date pickers and the admin calendar. */
export async function nightlyInventory(db: Db, from: string, to: string, roomTypeIds?: string[]): Promise<Record<string, NightInventory[]>> {
  const typeFilter = roomTypeIds ? { roomTypeId: { in: roomTypeIds } } : {};
  const [rooms, allocations, blocks, blackouts] = await Promise.all([
    db.room.findMany({ where: { ...typeFilter, isArchived: false }, select: { id: true, roomTypeId: true, status: true } }),
    db.bookingRoom.findMany({ where: holdingAllocationWhere(from, to), select: { roomId: true, checkIn: true, checkOut: true } }),
    db.roomBlock.findMany({ where: { startDate: { lt: dbDate(to) }, endDate: { gt: dbDate(from) } }, select: { roomId: true, startDate: true, endDate: true } }),
    db.blackoutDate.findMany({ where: { startDate: { lt: dbDate(to) }, endDate: { gte: dbDate(from) } } }),
  ]);
  const roomType = new Map(rooms.map((r) => [r.id, r.roomTypeId]));
  const nights = eachNight(from, to);
  const out: Record<string, NightInventory[]> = {};
  const types = roomTypeIds ?? Array.from(new Set(rooms.map((r) => r.roomTypeId)));
  for (const t of types) {
    const inService = rooms.filter((r) => r.roomTypeId === t && r.status === 'AVAILABLE');
    const outOfService = rooms.filter((r) => r.roomTypeId === t && r.status !== 'AVAILABLE').length;
    out[t] = nights.map((date) => {
      const sold = new Set(allocations.filter((a) => roomType.get(a.roomId) === t && isoOf(a.checkIn) <= date && isoOf(a.checkOut) > date).map((a) => a.roomId));
      const blocked = new Set(blocks.filter((b) => roomType.get(b.roomId) === t && !sold.has(b.roomId) && isoOf(b.startDate) <= date && isoOf(b.endDate) > date).map((b) => b.roomId));
      const closed = blackouts.some((b) => (b.roomTypeId === null || b.roomTypeId === t) && isoOf(b.startDate) <= date && isoOf(b.endDate) >= date);
      const total = inService.length;
      const soldInService = Array.from(sold).filter((id) => inService.some((r) => r.id === id)).length;
      return { date, total, sold: soldInService, blocked: blocked.size + outOfService, available: closed ? 0 : Math.max(0, total - soldInService - blocked.size), closed };
    });
  }
  return out;
}

/** Serializes concurrent allocations for the same room type within the current transaction. */
export async function lockRoomType(tx: Tx, roomTypeId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'roomtype:' + roomTypeId}))::text`;
}

/** Expires lapsed unpaid holds and frees their rooms. Safe to call repeatedly. */
export async function releaseExpiredHolds(db: Db, roomTypeId?: string): Promise<number> {
  const expired = await db.booking.findMany({
    where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lt: new Date() }, ...(roomTypeId ? { roomTypeId } : {}) },
    select: { id: true },
  });
  if (!expired.length) return 0;
  const ids = expired.map((b) => b.id);
  await db.bookingRoom.updateMany({ where: { bookingId: { in: ids } }, data: { active: false } });
  await db.booking.updateMany({ where: { id: { in: ids }, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED', holdExpiresAt: null } });
  await db.bookingEvent.createMany({ data: ids.map((bookingId) => ({ bookingId, type: 'EXPIRED', message: 'Payment hold expired; rooms released.' })) });
  // Coupon usage held by expired bookings is returned.
  const redemptions = await db.couponRedemption.findMany({ where: { bookingId: { in: ids } } });
  for (const r of redemptions) {
    await db.couponRedemption.delete({ where: { id: r.id } });
    await db.coupon.updateMany({ where: { id: r.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  }
  return ids.length;
}

export const isOverlapViolation = (err: unknown) =>
  err instanceof Error && /booking_rooms_no_overlap|23P01|exclusion constraint/i.test(err.message);

export async function hotelToday(db: Db = prisma, timezone?: string) {
  void db;
  return todayInZone(timezone ?? 'Asia/Kolkata');
}
