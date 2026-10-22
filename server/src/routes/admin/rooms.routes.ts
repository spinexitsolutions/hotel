import { Router } from 'express';
import { addDays, blackoutSchema, isValidISODate, roomBlockSchema, roomSchema, roomTypeSchema, todayInZone } from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma, runTransaction } from '../../config/prisma';
import { AppError, ah, str } from '../../utils/http';
import { dbDate, isoOf } from '../../utils/dates';
import { requirePermission } from '../../middleware/auth';
import { audit } from '../../services/audit.service';
import { nightlyInventory } from '../../services/availability.service';
import { getBookingSettings } from '../../services/settings.service';

export const roomsRouter = Router();

const typeInclude = {
  images: { orderBy: { sortOrder: 'asc' } },
  amenities: { select: { amenityId: true } },
  _count: { select: { rooms: { where: { isArchived: false } }, bookings: true } },
} satisfies Prisma.RoomTypeInclude;

const serializeType = (t: Prisma.RoomTypeGetPayload<{ include: typeof typeInclude }>) => ({
  ...t, amenityIds: t.amenities.map((a) => a.amenityId), images: t.images.map((i) => ({ url: i.url, alt: i.alt })), roomCount: t._count.rooms, bookingCount: t._count.bookings,
});

// ─── Room types ────────────────────────────────────────────────────────────
roomsRouter.get('/room-types', requirePermission('rooms.view'), ah(async (req, res) => {
  const includeArchived = req.query.archived === '1';
  const rows = await prisma.roomType.findMany({ where: includeArchived ? {} : { status: { not: 'ARCHIVED' } }, include: typeInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  res.json({ items: rows.map(serializeType) });
}));

roomsRouter.get('/room-types/:id', requirePermission('rooms.view'), ah(async (req, res) => {
  const t = await prisma.roomType.findUnique({ where: { id: req.params.id }, include: typeInclude });
  if (!t) throw AppError.notFound('Room type');
  res.json(serializeType(t));
}));

function typeData(body: ReturnType<typeof roomTypeSchema.parse>) {
  const { amenityIds: _a, images: _i, ...rest } = body;
  return rest;
}

roomsRouter.post('/room-types', requirePermission('rooms.manage'), ah(async (req, res) => {
  const body = roomTypeSchema.parse(req.body);
  const t = await prisma.roomType.create({
    data: {
      ...typeData(body),
      images: { create: body.images.map((img, i) => ({ url: img.url, alt: img.alt, sortOrder: i })) },
      amenities: { create: body.amenityIds.map((amenityId) => ({ amenityId })) },
    },
    include: typeInclude,
  });
  await audit(req, { action: 'roomtype.create', entity: 'RoomType', entityId: t.id, summary: `Created room type ${t.name}` });
  res.status(201).json(serializeType(t));
}));

roomsRouter.put('/room-types/:id', requirePermission('rooms.manage'), ah(async (req, res) => {
  const body = roomTypeSchema.parse(req.body);
  const before = await prisma.roomType.findUnique({ where: { id: req.params.id } });
  if (!before) throw AppError.notFound('Room type');
  const t = await runTransaction(async (tx) => {
    await tx.roomImage.deleteMany({ where: { roomTypeId: before.id } });
    await tx.roomTypeAmenity.deleteMany({ where: { roomTypeId: before.id } });
    return tx.roomType.update({
      where: { id: before.id },
      data: {
        ...typeData(body),
        images: { create: body.images.map((img, i) => ({ url: img.url, alt: img.alt, sortOrder: i })) },
        amenities: { create: body.amenityIds.map((amenityId) => ({ amenityId })) },
      },
      include: typeInclude,
    });
  });
  const priceChanged = before.basePrice !== t.basePrice || before.weekendPrice !== t.weekendPrice;
  await audit(req, { action: 'roomtype.update', entity: 'RoomType', entityId: t.id, summary: `Updated ${t.name}${priceChanged ? ` (price ${before.basePrice / 100} → ${t.basePrice / 100})` : ''}`, before, after: typeData(body) });
  res.json(serializeType(t));
}));

/** Room types with booking history are archived, never hard-deleted. */
roomsRouter.delete('/room-types/:id', requirePermission('rooms.manage'), ah(async (req, res) => {
  const t = await prisma.roomType.findUnique({ where: { id: req.params.id }, include: { _count: { select: { bookings: true } } } });
  if (!t) throw AppError.notFound('Room type');
  if (t._count.bookings > 0) {
    await prisma.roomType.update({ where: { id: t.id }, data: { status: 'ARCHIVED', isFeatured: false } });
    await audit(req, { action: 'roomtype.archive', entity: 'RoomType', entityId: t.id, summary: `Archived ${t.name} (has bookings)` });
    return res.json({ ok: true, archived: true });
  }
  await prisma.$transaction([prisma.room.deleteMany({ where: { roomTypeId: t.id } }), prisma.roomType.delete({ where: { id: t.id } })]);
  await audit(req, { action: 'roomtype.delete', entity: 'RoomType', entityId: t.id, summary: `Deleted ${t.name}` });
  res.json({ ok: true, archived: false });
}));

// ─── Physical rooms ────────────────────────────────────────────────────────
roomsRouter.get('/rooms', requirePermission('rooms.view'), ah(async (req, res) => {
  const settings = await getBookingSettings();
  const today = todayInZone(settings.timezone);
  const rooms = await prisma.room.findMany({
    where: { isArchived: req.query.archived === '1' ? undefined : false, ...(str(req.query.roomTypeId) ? { roomTypeId: str(req.query.roomTypeId) } : {}) },
    include: {
      roomType: { select: { id: true, name: true } },
      allocations: { where: { active: true, checkIn: { lte: dbDate(today) }, checkOut: { gt: dbDate(today) }, booking: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING', 'PENDING_PAYMENT'] } } }, include: { booking: { select: { id: true, reference: true, guestFirstName: true, guestLastName: true, status: true, checkOut: true } } } },
      blocks: { where: { endDate: { gt: dbDate(today) } }, orderBy: { startDate: 'asc' } },
    },
    orderBy: { number: 'asc' },
  });
  res.json({
    items: rooms.map((r) => ({
      id: r.id, number: r.number, floor: r.floor, status: r.status, housekeeping: r.housekeeping, notes: r.notes, isArchived: r.isArchived, roomType: r.roomType,
      occupant: r.allocations[0] ? { ...r.allocations[0].booking, checkOut: isoOf(r.allocations[0].booking.checkOut) } : null,
      blocks: r.blocks.map((b) => ({ id: b.id, startDate: isoOf(b.startDate), endDate: isoOf(b.endDate), reason: b.reason })),
    })),
  });
}));

roomsRouter.post('/rooms', requirePermission('rooms.manage'), ah(async (req, res) => {
  const body = roomSchema.parse(req.body);
  const room = await prisma.room.create({ data: body });
  await audit(req, { action: 'room.create', entity: 'Room', entityId: room.id, summary: `Added room ${room.number}` });
  res.status(201).json(room);
}));

roomsRouter.put('/rooms/:id', requirePermission('rooms.manage'), ah(async (req, res) => {
  const body = roomSchema.parse(req.body);
  const before = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!before) throw AppError.notFound('Room');
  if (before.roomTypeId !== body.roomTypeId) {
    const future = await prisma.bookingRoom.count({ where: { roomId: before.id, active: true, checkOut: { gt: new Date() } } });
    if (future) throw AppError.conflict('This room has upcoming reservations. Reassign them before changing its room type.');
  }
  const room = await prisma.room.update({ where: { id: before.id }, data: body });
  await audit(req, { action: 'room.update', entity: 'Room', entityId: room.id, summary: `Updated room ${room.number}`, before, after: room });
  res.json(room);
}));

roomsRouter.patch('/rooms/:id/housekeeping', requirePermission('bookings.manage'), ah(async (req, res) => {
  const hk = String(req.body?.housekeeping);
  if (!['CLEAN', 'DIRTY', 'INSPECTED'].includes(hk)) throw AppError.badRequest('Invalid housekeeping status.');
  res.json(await prisma.room.update({ where: { id: req.params.id }, data: { housekeeping: hk } }));
}));

roomsRouter.delete('/rooms/:id', requirePermission('rooms.manage'), ah(async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { _count: { select: { allocations: true } } } });
  if (!room) throw AppError.notFound('Room');
  const future = await prisma.bookingRoom.count({ where: { roomId: room.id, active: true, checkOut: { gt: new Date() } } });
  if (future) throw AppError.conflict('This room has upcoming reservations. Reassign them first.');
  if (room._count.allocations) await prisma.room.update({ where: { id: room.id }, data: { isArchived: true } });
  else await prisma.room.delete({ where: { id: room.id } });
  await audit(req, { action: 'room.delete', entity: 'Room', entityId: room.id, summary: `Removed room ${room.number}` });
  res.json({ ok: true });
}));

// ─── Blocks (maintenance) & blackouts (stop-sell) ──────────────────────────
roomsRouter.post('/room-blocks', requirePermission('inventory.manage'), ah(async (req, res) => {
  const body = roomBlockSchema.parse(req.body);
  const conflicts = await prisma.bookingRoom.findMany({ where: { roomId: body.roomId, active: true, checkIn: { lt: dbDate(body.endDate) }, checkOut: { gt: dbDate(body.startDate) } }, include: { booking: { select: { reference: true } } } });
  if (conflicts.length) throw AppError.conflict(`Room is reserved on these dates (${conflicts.map((c) => c.booking.reference).join(', ')}). Reassign those reservations first.`);
  const block = await prisma.roomBlock.create({ data: { roomId: body.roomId, startDate: dbDate(body.startDate), endDate: dbDate(body.endDate), reason: body.reason, createdById: req.user!.id } });
  await audit(req, { action: 'room.block', entity: 'Room', entityId: body.roomId, summary: `Blocked ${body.startDate} → ${body.endDate}: ${body.reason}` });
  res.status(201).json(block);
}));

roomsRouter.delete('/room-blocks/:id', requirePermission('inventory.manage'), ah(async (req, res) => {
  await prisma.roomBlock.delete({ where: { id: req.params.id } });
  await audit(req, { action: 'room.unblock', entity: 'RoomBlock', entityId: req.params.id });
  res.json({ ok: true });
}));

roomsRouter.get('/blackouts', requirePermission('rooms.view'), ah(async (_req, res) => {
  const rows = await prisma.blackoutDate.findMany({ orderBy: { startDate: 'desc' }, include: { roomType: { select: { name: true } } } });
  res.json({ items: rows.map((b) => ({ ...b, startDate: isoOf(b.startDate), endDate: isoOf(b.endDate) })) });
}));

roomsRouter.post('/blackouts', requirePermission('inventory.manage'), ah(async (req, res) => {
  const body = blackoutSchema.parse(req.body);
  const row = await prisma.blackoutDate.create({ data: { roomTypeId: body.roomTypeId, startDate: dbDate(body.startDate), endDate: dbDate(body.endDate), reason: body.reason } });
  await audit(req, { action: 'blackout.create', entity: 'BlackoutDate', entityId: row.id, summary: `Stop-sell ${body.startDate} → ${body.endDate}` });
  res.status(201).json(row);
}));

roomsRouter.delete('/blackouts/:id', requirePermission('inventory.manage'), ah(async (req, res) => {
  await prisma.blackoutDate.delete({ where: { id: req.params.id } });
  await audit(req, { action: 'blackout.delete', entity: 'BlackoutDate', entityId: req.params.id });
  res.json({ ok: true });
}));

// ─── Inventory calendar ────────────────────────────────────────────────────
roomsRouter.get('/inventory', requirePermission('rooms.view'), ah(async (req, res) => {
  const settings = await getBookingSettings();
  const from = str(req.query.from) ?? todayInZone(settings.timezone);
  if (!isValidISODate(from)) throw AppError.badRequest('Invalid date.');
  const days = Math.min(Number(req.query.days) || 14, 62);
  const types = await prisma.roomType.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } });
  const inv = await nightlyInventory(prisma, from, addDays(from, days), types.map((t) => t.id));
  res.json({ from, days, types: types.map((t) => ({ ...t, nights: inv[t.id] })) });
}));

/** Room-by-room occupancy grid (tape chart) for the front desk. */
roomsRouter.get('/tape-chart', requirePermission('bookings.view'), ah(async (req, res) => {
  const settings = await getBookingSettings();
  const from = str(req.query.from) ?? todayInZone(settings.timezone);
  if (!isValidISODate(from)) throw AppError.badRequest('Invalid date.');
  const days = Math.min(Number(req.query.days) || 14, 31);
  const to = addDays(from, days);
  const rooms = await prisma.room.findMany({
    where: { isArchived: false },
    include: {
      roomType: { select: { id: true, name: true } },
      allocations: { where: { active: true, checkIn: { lt: dbDate(to) }, checkOut: { gt: dbDate(from) } }, include: { booking: { select: { id: true, reference: true, guestFirstName: true, guestLastName: true, status: true } } } },
      blocks: { where: { startDate: { lt: dbDate(to) }, endDate: { gt: dbDate(from) } } },
    },
    orderBy: [{ roomType: { sortOrder: 'asc' } }, { number: 'asc' }],
  });
  res.json({
    from, days,
    rooms: rooms.map((r) => ({
      id: r.id, number: r.number, status: r.status, housekeeping: r.housekeeping, roomType: r.roomType,
      stays: r.allocations.filter((a) => a.booking.status !== 'EXPIRED').map((a) => ({ bookingId: a.booking.id, reference: a.booking.reference, guest: `${a.booking.guestFirstName} ${a.booking.guestLastName}`, status: a.booking.status, checkIn: isoOf(a.checkIn), checkOut: isoOf(a.checkOut) })),
      blocks: r.blocks.map((b) => ({ id: b.id, startDate: isoOf(b.startDate), endDate: isoOf(b.endDate), reason: b.reason })),
    })),
  });
}));
