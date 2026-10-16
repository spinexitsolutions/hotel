import { addDays, diffDays, eachNight, todayInZone } from '@aurelle/shared';
import { Prisma, prisma } from '../config/prisma';
import { dbDate, isoOf } from '../utils/dates';
import { getBookingSettings } from './settings.service';

export interface Range { from: string; to: string } // inclusive dates

export async function resolveRange(q: { from?: string; to?: string; preset?: string }): Promise<Range> {
  const s = await getBookingSettings();
  const today = todayInZone(s.timezone);
  if (q.from && q.to && q.from <= q.to) return { from: q.from, to: q.to };
  switch (q.preset) {
    case 'today': return { from: today, to: today };
    case 'week': return { from: addDays(today, -6), to: today };
    case 'year': return { from: addDays(today, -364), to: today };
    case 'month':
    default: return { from: addDays(today, -29), to: today };
  }
}

/** Range bounds as timestamps in hotel-local days (IST offset applied for createdAt/capturedAt filters). */
function tsBounds(r: Range) {
  return { gte: new Date(`${r.from}T00:00:00+05:30`), lt: new Date(`${addDays(r.to, 1)}T00:00:00+05:30`) };
}

const ACTIVE: Prisma.EnumBookingStatusFilter = { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'PENDING'] };

export async function dashboard(range: Range) {
  const s = await getBookingSettings();
  const today = todayInZone(s.timezone);
  const ts = tsBounds(range);
  const [
    bookingsInRange, statusGroups, checkInsToday, checkOutsToday, inHouse, totalRooms, outOfService, occupiedTonight, customers,
    newCustomers, payments, refunds, recentPayments, recentEvents, pendingInquiries, pendingReviews,
  ] = await Promise.all([
    prisma.booking.count({ where: { createdAt: ts } }),
    prisma.booking.groupBy({ by: ['status'], where: { createdAt: ts }, _count: true }),
    prisma.booking.findMany({ where: { checkIn: dbDate(today), status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] } }, select: { id: true, reference: true, guestFirstName: true, guestLastName: true, status: true, roomsCount: true, roomType: { select: { name: true } } }, take: 50 }),
    prisma.booking.findMany({ where: { checkOut: dbDate(today), status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } }, select: { id: true, reference: true, guestFirstName: true, guestLastName: true, status: true, roomsCount: true, roomType: { select: { name: true } } }, take: 50 }),
    prisma.booking.count({ where: { status: 'CHECKED_IN' } }),
    prisma.room.count({ where: { isArchived: false } }),
    prisma.room.count({ where: { isArchived: false, status: { not: 'AVAILABLE' } } }),
    prisma.bookingRoom.count({ where: { active: true, checkIn: { lte: dbDate(today) }, checkOut: { gt: dbDate(today) }, booking: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING', 'PENDING_PAYMENT'] } } } }),
    prisma.user.count({ where: { role: { key: 'CUSTOMER' } } }),
    prisma.user.count({ where: { role: { key: 'CUSTOMER' }, createdAt: ts } }),
    prisma.payment.aggregate({ where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, capturedAt: ts }, _sum: { amount: true }, _count: true }),
    prisma.refund.aggregate({ where: { status: 'PROCESSED', processedAt: ts }, _sum: { amount: true } }),
    prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { booking: { select: { id: true, reference: true, guestFirstName: true, guestLastName: true } } } }),
    prisma.bookingEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { booking: { select: { id: true, reference: true, guestFirstName: true, guestLastName: true } } } }),
    prisma.contactInquiry.count({ where: { status: 'NEW' } }),
    prisma.review.count({ where: { status: 'PENDING' } }),
  ]);
  const sellable = totalRooms - outOfService;
  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count]));
  const [series] = await Promise.all([dailySeries(range)]);
  return {
    range,
    kpis: {
      totalBookings: bookingsInRange,
      confirmed: (byStatus.CONFIRMED ?? 0) + (byStatus.CHECKED_IN ?? 0) + (byStatus.CHECKED_OUT ?? 0),
      pending: (byStatus.PENDING ?? 0) + (byStatus.PENDING_PAYMENT ?? 0),
      cancelled: (byStatus.CANCELLED ?? 0) + (byStatus.REJECTED ?? 0),
      checkInsToday: checkInsToday.length,
      checkOutsToday: checkOutsToday.length,
      inHouse,
      occupancyTonight: sellable ? Math.round((occupiedTonight / sellable) * 1000) / 10 : 0,
      availableTonight: Math.max(0, sellable - occupiedTonight),
      totalRooms,
      outOfService,
      customers,
      newCustomers,
      revenueCollected: payments._sum.amount ?? 0,
      refunded: refunds._sum.amount ?? 0,
      netRevenue: (payments._sum.amount ?? 0) - (refunds._sum.amount ?? 0),
      transactions: payments._count,
      pendingInquiries,
      pendingReviews,
    },
    byStatus,
    series,
    arrivals: checkInsToday,
    departures: checkOutsToday,
    recentPayments: recentPayments.map((p) => ({ id: p.id, amount: p.amount, status: p.status, provider: p.provider, isTest: p.isTest, createdAt: p.createdAt, booking: p.booking })),
    recentActivity: recentEvents.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt, booking: e.booking })),
  };
}

/** Bookings created and revenue collected per day. */
export async function dailySeries(range: Range) {
  const ts = tsBounds(range);
  const [bookings, revenue] = await Promise.all([
    prisma.$queryRaw<{ day: Date; count: bigint; value: bigint }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS count, coalesce(sum("grandTotal"),0) AS value
      FROM bookings WHERE "createdAt" >= ${ts.gte} AND "createdAt" < ${ts.lt} AND status NOT IN ('EXPIRED') GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; amount: bigint }[]>`
      SELECT date_trunc('day', "capturedAt" AT TIME ZONE 'Asia/Kolkata')::date AS day, coalesce(sum(amount),0) AS amount
      FROM payments WHERE status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND "capturedAt" >= ${ts.gte} AND "capturedAt" < ${ts.lt} GROUP BY 1`,
  ]);
  const days = eachNight(range.from, addDays(range.to, 1));
  const bMap = new Map(bookings.map((r) => [isoOf(r.day), r]));
  const rMap = new Map(revenue.map((r) => [isoOf(r.day), Number(r.amount)]));
  return days.map((d) => ({ date: d, bookings: Number(bMap.get(d)?.count ?? 0), bookedValue: Number(bMap.get(d)?.value ?? 0), revenue: rMap.get(d) ?? 0 }));
}

/** Room-nights sold vs available per day for stays within the range. */
export async function occupancyReport(range: Range) {
  const to = addDays(range.to, 1);
  const [rooms, allocations] = await Promise.all([
    prisma.room.findMany({ where: { isArchived: false }, select: { id: true, roomTypeId: true, status: true } }),
    prisma.bookingRoom.findMany({
      where: { active: true, checkIn: { lt: dbDate(to) }, checkOut: { gt: dbDate(range.from) }, booking: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'PENDING'] } } },
      select: { checkIn: true, checkOut: true, roomId: true },
    }),
  ]);
  const sellable = rooms.filter((r) => r.status === 'AVAILABLE').length;
  const days = eachNight(range.from, to).map((date) => {
    const sold = allocations.filter((a) => isoOf(a.checkIn) <= date && isoOf(a.checkOut) > date).length;
    return { date, sold, available: sellable, occupancy: sellable ? Math.round((sold / sellable) * 1000) / 10 : 0 };
  });
  const soldTotal = days.reduce((s, d) => s + d.sold, 0);
  const capacity = sellable * days.length;
  return { days, soldRoomNights: soldTotal, availableRoomNights: capacity, occupancy: capacity ? Math.round((soldTotal / capacity) * 1000) / 10 : 0 };
}

/** Per room type: bookings, room nights, revenue (booked value), ADR, RevPAR and occupancy for stays in range. */
export async function roomPerformance(range: Range) {
  const to = addDays(range.to, 1);
  const nightsInRange = diffDays(range.from, to);
  const [types, bookings, rooms] = await Promise.all([
    prisma.roomType.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.booking.findMany({ where: { status: ACTIVE, checkIn: { lt: dbDate(to) }, checkOut: { gt: dbDate(range.from) } }, select: { roomTypeId: true, checkIn: true, checkOut: true, roomsCount: true, grandTotal: true, taxTotal: true, nights: true } }),
    prisma.room.groupBy({ by: ['roomTypeId'], where: { isArchived: false, status: 'AVAILABLE' }, _count: true }),
  ]);
  return types.map((t) => {
    const bs = bookings.filter((b) => b.roomTypeId === t.id);
    let roomNights = 0;
    let revenue = 0;
    for (const b of bs) {
      const start = isoOf(b.checkIn) > range.from ? isoOf(b.checkIn) : range.from;
      const end = isoOf(b.checkOut) < to ? isoOf(b.checkOut) : to;
      const n = Math.max(0, diffDays(start, end));
      roomNights += n * b.roomsCount;
      revenue += Math.round(((b.grandTotal - b.taxTotal) * n) / b.nights); // pro-rated net room revenue
    }
    const inventory = (rooms.find((r) => r.roomTypeId === t.id)?._count ?? 0) * nightsInRange;
    return {
      roomTypeId: t.id, name: t.name, bookings: bs.length, roomNights, revenue,
      adr: roomNights ? Math.round(revenue / roomNights) : 0,
      revpar: inventory ? Math.round(revenue / inventory) : 0,
      occupancy: inventory ? Math.round((roomNights / inventory) * 1000) / 10 : 0,
    };
  });
}

export async function cancellationReport(range: Range) {
  const ts = tsBounds(range);
  const [created, cancelled, byWho] = await Promise.all([
    prisma.booking.count({ where: { createdAt: ts, status: { not: 'EXPIRED' } } }),
    prisma.booking.findMany({ where: { cancelledAt: ts, status: { in: ['CANCELLED', 'REJECTED', 'NO_SHOW'] } }, select: { id: true, reference: true, status: true, cancelledBy: true, cancellationReason: true, cancellationPenalty: true, grandTotal: true, cancelledAt: true, refundStatus: true, guestFirstName: true, guestLastName: true }, orderBy: { cancelledAt: 'desc' } }),
    prisma.booking.groupBy({ by: ['cancelledBy'], where: { cancelledAt: ts, status: 'CANCELLED' }, _count: true }),
  ]);
  return {
    created,
    cancelled: cancelled.length,
    cancellationRate: created ? Math.round((cancelled.length / created) * 1000) / 10 : 0,
    lostValue: cancelled.reduce((s, b) => s + b.grandTotal, 0),
    penaltiesRetained: cancelled.reduce((s, b) => s + b.cancellationPenalty, 0),
    byWho: Object.fromEntries(byWho.map((g) => [g.cancelledBy ?? 'UNKNOWN', g._count])),
    items: cancelled,
  };
}

export async function promotionReport(range: Range) {
  const ts = tsBounds(range);
  const [coupons, redemptions, offers, offerBookings] = await Promise.all([
    prisma.coupon.findMany({ select: { id: true, code: true, usedCount: true, usageLimit: true, isActive: true } }),
    prisma.couponRedemption.groupBy({ by: ['couponId'], where: { createdAt: ts }, _count: true, _sum: { amount: true } }),
    prisma.offer.findMany({ select: { id: true, title: true } }),
    prisma.booking.groupBy({ by: ['offerId'], where: { createdAt: ts, offerId: { not: null }, status: { not: 'EXPIRED' } }, _count: true, _sum: { grandTotal: true, discountTotal: true } }),
  ]);
  return {
    coupons: coupons.map((c) => {
      const r = redemptions.find((x) => x.couponId === c.id);
      return { ...c, redemptionsInRange: r?._count ?? 0, discountGiven: r?._sum.amount ?? 0 };
    }),
    offers: offers.map((o) => {
      const r = offerBookings.find((x) => x.offerId === o.id);
      return { ...o, bookings: r?._count ?? 0, bookedValue: r?._sum.grandTotal ?? 0, discountGiven: r?._sum.discountTotal ?? 0 };
    }),
  };
}

export async function sourceReport(range: Range) {
  const ts = tsBounds(range);
  const rows = await prisma.booking.findMany({ where: { createdAt: ts, status: { not: 'EXPIRED' } }, select: { source: true, utm: true, grandTotal: true } });
  const bySource: Record<string, { bookings: number; value: number }> = {};
  const byUtm: Record<string, { bookings: number; value: number }> = {};
  for (const r of rows) {
    (bySource[r.source] ??= { bookings: 0, value: 0 }).bookings++;
    bySource[r.source].value += r.grandTotal;
    const utm = ((r.utm as Record<string, string> | null)?.utm_source ?? 'direct').slice(0, 40);
    (byUtm[utm] ??= { bookings: 0, value: 0 }).bookings++;
    byUtm[utm].value += r.grandTotal;
  }
  return { bySource, byUtm };
}

export async function revenueReport(range: Range) {
  const ts = tsBounds(range);
  const [byProvider, refunds, series] = await Promise.all([
    prisma.payment.groupBy({ by: ['provider'], where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, capturedAt: ts }, _sum: { amount: true }, _count: true }),
    prisma.refund.aggregate({ where: { status: 'PROCESSED', processedAt: ts }, _sum: { amount: true }, _count: true }),
    dailySeries(range),
  ]);
  const gross = byProvider.reduce((s, p) => s + (p._sum.amount ?? 0), 0);
  return {
    gross, refunds: refunds._sum.amount ?? 0, refundCount: refunds._count, net: gross - (refunds._sum.amount ?? 0),
    byProvider: byProvider.map((p) => ({ provider: p.provider, amount: p._sum.amount ?? 0, count: p._count })),
    series,
  };
}
