import { Router } from 'express';
import {
  BOOKING_STATUS_LABEL, adminBookingStatusSchema, adminCancelSchema, adminCreateBookingSchema, adminNoteSchema, assignRoomsSchema,
  modifyBookingSchema, recordPaymentSchema, refundSchema, isValidISODate, type BookingStatus,
} from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ah, pageParams, paged, str } from '../../utils/http';
import { dbDate, isoOf } from '../../utils/dates';
import { toCsv } from '../../utils/csv';
import { can, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { addNote, assignRooms, bookingInclude, cancelBooking, changeStatus, createBooking, modifyBooking, recordOfflinePayment } from '../../services/booking.service';
import { refundBooking } from '../../services/payment.service';
import { availabilityForStay } from '../../services/availability.service';
import { audit } from '../../services/audit.service';
import { getPublishedConfig } from '../../services/siteConfig.service';

export const adminBookingsRouter = Router();

function listWhere(q: Record<string, unknown>): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  const search = str(q.q);
  if (search) {
    where.OR = [
      { reference: { contains: search.toUpperCase() } },
      { guestEmail: { contains: search.toLowerCase() } },
      { guestPhone: { contains: search } },
      { guestFirstName: { contains: search, mode: 'insensitive' } },
      { guestLastName: { contains: search, mode: 'insensitive' } },
    ];
  }
  const status = str(q.status);
  if (status) where.status = { in: status.split(',') as BookingStatus[] };
  else if (q.includeExpired !== '1') where.status = { not: 'EXPIRED' };
  const paymentStatus = str(q.paymentStatus);
  if (paymentStatus) where.paymentStatus = { in: paymentStatus.split(',') as Prisma.EnumPaymentStatusFilter['in'] };
  const refundStatus = str(q.refundStatus);
  if (refundStatus) where.refundStatus = { in: refundStatus.split(',') as Prisma.EnumRefundStatusFilter['in'] };
  if (str(q.roomTypeId)) where.roomTypeId = str(q.roomTypeId);
  if (str(q.source)) where.source = str(q.source);
  const from = str(q.from);
  const to = str(q.to);
  const field = q.dateField === 'checkOut' ? 'checkOut' : q.dateField === 'created' ? 'createdAt' : 'checkIn';
  if ((from && isValidISODate(from)) || (to && isValidISODate(to))) {
    const range: Prisma.DateTimeFilter = {};
    if (from && isValidISODate(from)) range.gte = field === 'createdAt' ? new Date(`${from}T00:00:00+05:30`) : dbDate(from);
    if (to && isValidISODate(to)) range.lte = field === 'createdAt' ? new Date(`${to}T23:59:59+05:30`) : dbDate(to);
    where[field] = range;
  }
  return where;
}

const SORTS: Record<string, Prisma.BookingOrderByWithRelationInput> = {
  created: { createdAt: 'desc' }, checkIn: { checkIn: 'asc' }, checkInDesc: { checkIn: 'desc' }, total: { grandTotal: 'desc' },
};

adminBookingsRouter.get('/', requirePermission('bookings.view'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const where = listWhere(req.query as Record<string, unknown>);
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where, skip, take, orderBy: SORTS[String(req.query.sort)] ?? SORTS.created,
      include: { roomType: { select: { name: true } }, rooms: { where: { active: true }, include: { room: { select: { number: true } } } } },
    }),
    prisma.booking.count({ where }),
  ]);
  res.json(paged(items.map((b) => ({
    id: b.id, reference: b.reference, status: b.status, paymentStatus: b.paymentStatus, refundStatus: b.refundStatus, paymentMethod: b.paymentMethod, source: b.source,
    guest: `${b.guestFirstName} ${b.guestLastName}`, guestEmail: b.guestEmail, guestPhone: b.guestPhone, roomType: b.roomType.name, roomNumbers: b.rooms.map((r) => r.room.number),
    checkIn: isoOf(b.checkIn), checkOut: isoOf(b.checkOut), nights: b.nights, rooms: b.roomsCount, adults: b.adults, children: b.children,
    grandTotal: b.grandTotal, amountPaid: b.amountPaid, amountRefunded: b.amountRefunded, createdAt: b.createdAt,
  })), total, page, pageSize));
}));

adminBookingsRouter.get('/export.csv', requirePermission('bookings.export'), ah(async (req, res) => {
  const rows = await prisma.booking.findMany({ where: listWhere(req.query as Record<string, unknown>), orderBy: { createdAt: 'desc' }, take: 10_000, include: { roomType: { select: { name: true } }, rooms: { include: { room: { select: { number: true } } } } } });
  const financial = can(req.user, 'reports.financial') || can(req.user, 'payments.view');
  const csv = toCsv(rows.map((b) => ({
    reference: b.reference, status: b.status, payment_status: b.paymentStatus, refund_status: b.refundStatus, source: b.source,
    guest_name: `${b.guestFirstName} ${b.guestLastName}`, email: b.guestEmail, phone: b.guestPhone, country: b.guestCountry,
    room_type: b.roomType.name, rooms: b.roomsCount, room_numbers: b.rooms.filter((r) => r.active).map((r) => r.room.number).join(' '),
    check_in: isoOf(b.checkIn), check_out: isoOf(b.checkOut), nights: b.nights, adults: b.adults, children: b.children,
    ...(financial ? { total_inr: (b.grandTotal / 100).toFixed(2), paid_inr: (b.amountPaid / 100).toFixed(2), refunded_inr: (b.amountRefunded / 100).toFixed(2), tax_inr: (b.taxTotal / 100).toFixed(2) } : {}),
    coupon: b.couponCode ?? '', created_at: b.createdAt.toISOString(), cancelled_reason: b.cancellationReason ?? '',
  })));
  await audit(req, { action: 'booking.export', entity: 'Booking', summary: `Exported ${rows.length} bookings` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${csv}`);
}));

adminBookingsRouter.get('/:id', requirePermission('bookings.view'), ah(async (req, res) => {
  const b = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { ...bookingInclude, notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, user: { select: { id: true, name: true, email: true } }, reviews: { take: 1 } },
  });
  if (!b) throw AppError.notFound('Reservation');
  const showPayments = can(req.user, 'payments.view');
  const freeRooms = ['PENDING', 'CONFIRMED', 'PENDING_PAYMENT', 'CHECKED_IN'].includes(b.status)
    ? await prisma.room.findMany({ where: { roomTypeId: b.roomTypeId, isArchived: false }, select: { id: true, number: true, status: true, housekeeping: true }, orderBy: { number: 'asc' } })
    : [];
  const avail = freeRooms.length ? (await availabilityForStay(prisma, isoOf(b.checkIn), isoOf(b.checkOut), [b.roomTypeId])).get(b.roomTypeId) : null;
  const config = (await getPublishedConfig()).config;
  res.json({
    ...b,
    reviews: undefined,
    review: b.reviews[0] ?? null,
    checkIn: isoOf(b.checkIn), checkOut: isoOf(b.checkOut),
    statusLabel: BOOKING_STATUS_LABEL[b.status as BookingStatus],
    manageTokenHash: undefined,
    payments: showPayments ? b.payments : [],
    refunds: showPayments ? b.refunds : [],
    rooms: b.rooms.map((r) => ({ ...r, checkIn: isoOf(r.checkIn), checkOut: isoOf(r.checkOut) })),
    roomOptions: freeRooms.map((r) => ({ ...r, free: avail?.freeRoomIds.includes(r.id) ?? false })),
    hotel: { name: config.brand.name, address: [config.contact.addressLine1, config.contact.addressLine2].join(', '), phone: config.contact.phone, email: config.contact.email },
  });
}));

adminBookingsRouter.post('/', requirePermission('bookings.manage'), validate(adminCreateBookingSchema), ah(async (req, res) => {
  const b = req.body as ReturnType<typeof adminCreateBookingSchema.parse>;
  const { booking } = await createBooking(
    { ...b, offerId: null, additionalGuests: [], paymentMethod: 'PAY_AT_HOTEL', acceptTerms: true, marketingOptIn: false, expectedTotal: undefined, utm: undefined },
    { user: req.user, staff: true, source: b.source, forceConfirm: b.confirm, req },
  );
  res.status(201).json({ id: booking.id, reference: booking.reference });
}));

adminBookingsRouter.post('/:id/status', requirePermission('bookings.manage'), validate(adminBookingStatusSchema), ah(async (req, res) => {
  if (req.body.status === 'REJECTED' && !can(req.user, 'bookings.cancel')) throw AppError.forbidden();
  const b = await changeStatus(req.params.id, req.body.status, { reason: req.body.reason, notifyGuest: req.body.notifyGuest, req });
  res.json({ ok: true, status: b.status });
}));

adminBookingsRouter.post('/:id/cancel', requirePermission('bookings.cancel'), validate(adminCancelSchema), ah(async (req, res) => {
  if (req.body.waivePenalty && !can(req.user, 'refunds.manage')) throw AppError.forbidden('Only managers can waive cancellation penalties.');
  const result = await cancelBooking(req.params.id, { by: 'STAFF', reason: req.body.reason, waivePenalty: req.body.waivePenalty, notifyGuest: req.body.notifyGuest, req });
  res.json({ ok: true, outcome: result.outcome });
}));

adminBookingsRouter.post('/:id/notes', requirePermission('bookings.manage'), validate(adminNoteSchema), ah(async (req, res) => {
  res.status(201).json(await addNote(req.params.id, req.body.body, req));
}));

adminBookingsRouter.post('/:id/assign-rooms', requirePermission('bookings.manage'), validate(assignRoomsSchema), ah(async (req, res) => {
  await assignRooms(req.params.id, req.body.assignments, req);
  res.json({ ok: true });
}));

adminBookingsRouter.post('/:id/modify', requirePermission('bookings.manage'), validate(modifyBookingSchema), ah(async (req, res) => {
  const b = await modifyBooking(req.params.id, req.body, req);
  res.json({ ok: true, grandTotal: b.grandTotal });
}));

adminBookingsRouter.post('/:id/payments', requirePermission('bookings.manage', 'payments.view'), validate(recordPaymentSchema), ah(async (req, res) => {
  const b = await recordOfflinePayment(req.params.id, req.body, req);
  res.status(201).json({ ok: true, paymentStatus: b.paymentStatus });
}));

adminBookingsRouter.post('/:id/refunds', requirePermission('refunds.manage'), validate(refundSchema), ah(async (req, res) => {
  res.status(201).json({ ok: true, refunds: await refundBooking(req.params.id, req.body, req) });
}));

/** Marks an outstanding refund obligation as settled outside the system (e.g. bank transfer) or waived. */
adminBookingsRouter.post('/:id/refund-status', requirePermission('refunds.manage'), ah(async (req, res) => {
  const status = String(req.body?.status);
  if (!['NONE', 'PROCESSED'].includes(status)) throw AppError.badRequest('Invalid refund status.');
  const b = await prisma.booking.update({ where: { id: req.params.id }, data: { refundStatus: status as 'NONE', refundableAmount: 0, events: { create: { type: 'REFUND_STATUS', message: `Refund marked ${status.toLowerCase()} by staff. ${String(req.body?.note ?? '')}`.trim(), actorId: req.user!.id } } } });
  await audit(req, { action: 'refund.status', entity: 'Booking', entityId: b.id, summary: `${b.reference} refund → ${status}` });
  res.json({ ok: true });
}));
