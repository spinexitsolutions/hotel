import {
  formatMoney, BOOKING_STATUS_LABEL, BOOKING_TRANSITIONS, addDays, cancellationOutcome, diffDays, makeBookingReference, todayInZone,
  type BookingSettings, type BookingStatus, type CreateBookingInput,
} from '@aurelle/shared';
import type { Request } from 'express';
import { Prisma, prisma, type Tx } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/http';
import { randomToken, sha256 } from '../utils/crypto';
import { dbDate, isoOf } from '../utils/dates';
import { availabilityForStay, isOverlapViolation, lockRoomType, releaseExpiredHolds } from './availability.service';
import { assertBookingWindow, buildQuote, type QuoteContext } from './quote.service';
import { getBookingSettings } from './settings.service';
import { getBrand, queueEmail, sendEmail, templates } from './email';
import { notifyStaff } from './notification.service';
import { audit } from './audit.service';
import type { AuthUser } from '../middleware/auth';

export const bookingInclude = {
  roomType: { select: { id: true, name: true, slug: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
  rooms: { include: { room: { select: { id: true, number: true, floor: true } } }, orderBy: { createdAt: 'asc' } },
  guests: true,
  lineItems: { orderBy: { sortOrder: 'asc' } },
  mealPlan: true,
  offer: { select: { id: true, title: true, slug: true } },
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const TX_OPTS = { timeout: 20_000, maxWait: 10_000 };

function bookingEmailData(b: BookingFull, settings: BookingSettings, manageToken?: string) {
  return {
    reference: b.reference,
    guestName: `${b.guestFirstName} ${b.guestLastName}`,
    roomName: b.roomType.name,
    checkIn: isoOf(b.checkIn),
    checkOut: isoOf(b.checkOut),
    nights: b.nights,
    rooms: b.roomsCount,
    adults: b.adults,
    children: b.children,
    grandTotal: b.grandTotal,
    amountPaid: b.amountPaid,
    paymentMethod: b.paymentMethod,
    statusLabel: BOOKING_STATUS_LABEL[b.status as BookingStatus],
    manageUrl: `${env.APP_URL}/booking/${b.reference}${manageToken ? `?token=${manageToken}` : ''}`,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
  };
}

export async function emailBooking(bookingId: string, kind: 'confirmed' | 'received' | 'paymentFailed' | 'status', extra?: { message?: string }) {
  const [b, settings, brand] = await Promise.all([prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude }), getBookingSettings(), getBrand()]);
  const data = bookingEmailData(b, settings);
  const rendered =
    kind === 'confirmed' ? templates.bookingConfirmed(brand, data)
    : kind === 'received' ? templates.bookingReceived(brand, data)
    : kind === 'paymentFailed' ? templates.paymentFailed(brand, data)
    : templates.bookingStatus(brand, data, extra?.message ?? 'your reservation has been updated.');
  await sendEmail(b.guestEmail, `booking.${kind}`, rendered);
}

async function staffAlert(title: string, lines: string[], bookingId: string) {
  const settings = await getBookingSettings();
  await notifyStaff({ permission: 'bookings.view', type: 'booking', title, body: lines.join(' · '), link: `/admin/bookings/${bookingId}` });
  if (settings.notificationEmails.length) {
    const brand = await getBrand();
    const rendered = templates.staffAlert(brand, { title, lines, link: `${env.APP_URL}/admin/bookings/${bookingId}` });
    for (const to of settings.notificationEmails) await sendEmail(to, 'staff.alert', rendered);
  }
}

/** Picks free rooms, preferring to keep previously-held rooms (for modifications), then lowest room numbers. */
function pickRooms(freeRoomIds: string[], count: number, prefer: string[] = []): string[] {
  const preferred = prefer.filter((id) => freeRoomIds.includes(id));
  const rest = freeRoomIds.filter((id) => !preferred.includes(id));
  return [...preferred, ...rest].slice(0, count);
}

async function uniqueReference(tx: Tx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = makeBookingReference('AUR');
    const exists = await tx.booking.findUnique({ where: { reference: ref }, select: { id: true } });
    if (!exists) return ref;
  }
  throw new Error('Could not generate a unique booking reference');
}

function lineItemsData(ctx: QuoteContext) {
  return ctx.quote.lines.map((l, i) => ({
    kind: l.kind, label: l.label, date: l.date ? dbDate(l.date) : null, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.amount, refId: l.refId ?? null, sortOrder: i,
  }));
}

export interface CreateBookingOptions {
  user?: AuthUser;
  source?: string;
  staff?: boolean;
  forceConfirm?: boolean;
  req?: Request;
}

/**
 * Creates a booking atomically: validates policy, re-prices from the database, locks the room type,
 * allocates physical rooms (guarded by the DB exclusion constraint) and records line items, guests and
 * coupon redemption. Payment (if online) is started separately so no network call happens inside the lock.
 */
export async function createBooking(input: CreateBookingInput, opts: CreateBookingOptions = {}) {
  const settings = await getBookingSettings();
  if (!opts.staff) {
    if (input.paymentMethod === 'ONLINE' && !settings.onlinePaymentEnabled) throw AppError.badRequest('Online payment is currently unavailable. Please choose pay at hotel.', 'PAYMENT_METHOD_DISABLED');
    if (input.paymentMethod === 'PAY_AT_HOTEL' && !settings.payAtHotelEnabled) throw AppError.badRequest('Pay at hotel is not available. Please pay online.', 'PAYMENT_METHOD_DISABLED');
    if (!opts.user && !settings.allowGuestCheckout) throw AppError.unauthorized('Please sign in or create an account to book.');
  }
  assertBookingWindow(settings, input.checkIn, input.checkOut, input.rooms, { staff: opts.staff });
  const manageToken = randomToken(24);

  let created: { id: string; reference: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      await lockRoomType(tx, input.roomTypeId);
      await releaseExpiredHolds(tx, input.roomTypeId);

      const ctx = await buildQuote(tx, input, settings, { email: input.guest.email, staff: opts.staff, allowUnpublished: opts.staff });
      if (input.expectedTotal != null && input.expectedTotal !== ctx.quote.grandTotal) {
        throw new AppError(409, 'PRICE_CHANGED', 'The price for this stay has changed. Please review the updated total.', { quote: ctx.quote });
      }

      const avail = (await availabilityForStay(tx, input.checkIn, input.checkOut, [input.roomTypeId])).get(input.roomTypeId);
      if (!avail || avail.closed) throw new AppError(409, 'UNAVAILABLE', avail?.closedReason ?? 'This room is not available for the selected dates.');
      if (avail.available < input.rooms) {
        throw new AppError(409, 'SOLD_OUT', avail.available ? `Only ${avail.available} room(s) of this type remain for these dates.` : 'This room is sold out for the selected dates.', { available: avail.available });
      }
      const roomIds = pickRooms(avail.freeRoomIds, input.rooms);

      const isOnline = input.paymentMethod === 'ONLINE' && ctx.quote.depositDue > 0;
      const status: BookingStatus = isOnline
        ? 'PENDING_PAYMENT'
        : opts.forceConfirm || (!opts.staff && settings.autoConfirmPayAtHotel) ? 'CONFIRMED' : 'PENDING';

      const reference = await uniqueReference(tx);
      const b = await tx.booking.create({
        data: {
          reference,
          userId: opts.user && !opts.staff ? opts.user.id : (await tx.user.findFirst({ where: { email: input.guest.email.toLowerCase(), role: { key: 'CUSTOMER' } }, select: { id: true } }))?.id ?? null,
          roomTypeId: ctx.roomType.id,
          status,
          paymentStatus: 'UNPAID',
          paymentMethod: isOnline ? 'ONLINE' : 'PAY_AT_HOTEL',
          source: opts.source ?? input.source ?? 'WEBSITE',
          checkIn: dbDate(input.checkIn),
          checkOut: dbDate(input.checkOut),
          nights: ctx.quote.nights,
          roomsCount: input.rooms,
          adults: input.adults,
          children: input.children,
          extraBeds: input.extraBeds ?? 0,
          guestFirstName: input.guest.firstName,
          guestLastName: input.guest.lastName,
          guestEmail: input.guest.email.toLowerCase(),
          guestPhone: input.guest.phone,
          guestCountry: input.guest.country ?? '',
          requests: input.requests as Prisma.InputJsonValue,
          mealPlanId: ctx.mealPlan?.id ?? null,
          offerId: ctx.offer && ctx.quote.offerDiscount > 0 ? ctx.offer.id : null,
          couponId: ctx.coupon?.id ?? null,
          couponCode: ctx.coupon?.code ?? null,
          subtotal: ctx.quote.subtotal,
          discountTotal: ctx.quote.discountTotal,
          taxTotal: ctx.quote.taxTotal,
          feeTotal: ctx.quote.feeTotal,
          grandTotal: ctx.quote.grandTotal,
          depositDue: ctx.quote.depositDue,
          pricingSnapshot: ctx.quote as unknown as Prisma.InputJsonValue,
          holdExpiresAt: status === 'PENDING_PAYMENT' ? new Date(Date.now() + settings.holdMinutes * 60_000) : null,
          confirmedAt: status === 'CONFIRMED' ? new Date() : null,
          manageTokenHash: sha256(manageToken),
          utm: input.utm ?? undefined,
          lineItems: { create: lineItemsData(ctx) },
          guests: {
            create: [
              { firstName: input.guest.firstName, lastName: input.guest.lastName, type: 'ADULT', isPrimary: true },
              ...(input.additionalGuests ?? []).map((g) => ({ firstName: g.firstName, lastName: g.lastName, type: g.type, age: g.age ?? null })),
            ],
          },
          rooms: { create: roomIds.map((roomId) => ({ roomId, checkIn: dbDate(input.checkIn), checkOut: dbDate(input.checkOut) })) },
          events: { create: { type: 'CREATED', message: `Booking created via ${opts.source ?? 'website'} (${isOnline ? 'online payment' : 'pay at hotel'}).`, actorId: opts.staff ? opts.user?.id : null } },
        },
        select: { id: true, reference: true },
      });

      if (ctx.coupon) {
        // Conditional increment: fails if a concurrent booking consumed the last use.
        const updated = await tx.coupon.updateMany({
          where: { id: ctx.coupon.id, ...(ctx.coupon.usageLimit != null ? { usedCount: { lt: ctx.coupon.usageLimit } } : {}) },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.count === 0) throw new AppError(422, 'COUPON_EXHAUSTED', `The code "${ctx.coupon.code}" has reached its usage limit.`);
        await tx.couponRedemption.create({ data: { couponId: ctx.coupon.id, bookingId: b.id, email: input.guest.email.toLowerCase(), amount: ctx.quote.couponDiscount } });
      }
      return b;
    }, TX_OPTS);
  } catch (err) {
    if (isOverlapViolation(err)) throw new AppError(409, 'SOLD_OUT', 'Those rooms were just booked by another guest. Please try again.');
    throw err;
  }

  if (input.marketingOptIn) {
    await prisma.newsletterSubscriber
      .upsert({ where: { email: input.guest.email.toLowerCase() }, create: { email: input.guest.email.toLowerCase(), name: input.guest.firstName, source: 'booking', unsubscribeToken: randomToken(24) }, update: {} })
      .catch(() => undefined);
  }

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.id }, include: bookingInclude });
  if (opts.staff && opts.req) await audit(opts.req, { action: 'booking.create', entity: 'Booking', entityId: booking.id, summary: `Created ${booking.reference} (${booking.source})` });

  if (booking.status !== 'PENDING_PAYMENT') {
    queueEmail(() => emailBooking(booking.id, booking.status === 'CONFIRMED' ? 'confirmed' : 'received'));
    queueEmail(() => staffAlert(`New reservation ${booking.reference}`, [`${booking.guestFirstName} ${booking.guestLastName}`, `${booking.roomType.name} × ${booking.roomsCount}`, `${isoOf(booking.checkIn)} → ${isoOf(booking.checkOut)}`, BOOKING_STATUS_LABEL[booking.status as BookingStatus]], booking.id));
  }
  return { booking, manageToken };
}

// ─── Access ────────────────────────────────────────────────────────────────

/** A guest may access a booking with its manage token, by owning it, or (lookup) by reference + email. */
export async function findBookingForGuest(reference: string, auth: { token?: string; email?: string; user?: AuthUser }) {
  const b = await prisma.booking.findUnique({ where: { reference: reference.toUpperCase() }, include: bookingInclude });
  if (!b) throw AppError.notFound('Reservation');
  const ok =
    (auth.token && b.manageTokenHash && sha256(auth.token) === b.manageTokenHash) ||
    (auth.email && auth.email.toLowerCase() === b.guestEmail) ||
    (auth.user && (b.userId === auth.user.id || auth.user.email === b.guestEmail));
  if (!ok) throw AppError.notFound('Reservation'); // do not reveal existence
  return b;
}

export function serializeBookingPublic(b: BookingFull, settings: BookingSettings) {
  const today = todayInZone(settings.timezone);
  const checkIn = isoOf(b.checkIn);
  const daysBeforeArrival = diffDays(today, checkIn);
  const cancellable = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(b.status) && checkIn >= today && settings.cancellation.allowOnlineCancellation;
  const firstNight = firstNightAmount(b);
  const outcome = cancellationOutcome(settings.cancellation, { grandTotal: b.grandTotal, amountPaid: b.amountPaid - b.amountRefunded, firstNightAmount: firstNight, daysBeforeArrival });
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    statusLabel: BOOKING_STATUS_LABEL[b.status as BookingStatus],
    paymentStatus: b.paymentStatus,
    refundStatus: b.refundStatus,
    paymentMethod: b.paymentMethod,
    roomType: { id: b.roomType.id, name: b.roomType.name, slug: b.roomType.slug, image: b.roomType.images[0]?.url ?? '' },
    checkIn,
    checkOut: isoOf(b.checkOut),
    nights: b.nights,
    rooms: b.roomsCount,
    adults: b.adults,
    children: b.children,
    extraBeds: b.extraBeds,
    guest: { firstName: b.guestFirstName, lastName: b.guestLastName, email: b.guestEmail, phone: b.guestPhone, country: b.guestCountry },
    requests: b.requests,
    mealPlan: b.mealPlan ? { name: b.mealPlan.name, code: b.mealPlan.code } : null,
    offer: b.offer ? { title: b.offer.title } : null,
    couponCode: b.couponCode,
    lineItems: b.lineItems.map((l) => ({ kind: l.kind, label: l.label, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.amount })),
    subtotal: b.subtotal,
    discountTotal: b.discountTotal,
    taxTotal: b.taxTotal,
    feeTotal: b.feeTotal,
    grandTotal: b.grandTotal,
    depositDue: b.depositDue,
    amountPaid: b.amountPaid,
    amountRefunded: b.amountRefunded,
    balanceDue: Math.max(0, b.grandTotal - b.amountPaid + b.amountRefunded),
    refundableAmount: b.refundableAmount,
    currency: b.currency,
    holdExpiresAt: b.holdExpiresAt,
    createdAt: b.createdAt,
    cancelledAt: b.cancelledAt,
    cancellationReason: b.cancellationReason,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    canCancel: cancellable,
    cancellationPreview: cancellable ? outcome : null,
    canPay: b.status === 'PENDING_PAYMENT' && !!b.holdExpiresAt && b.holdExpiresAt > new Date(),
    canReview: b.status === 'CHECKED_OUT',
    payments: b.payments.map((p) => ({ id: p.id, provider: p.provider, amount: p.amount, status: p.status, isTest: p.isTest, createdAt: p.createdAt })),
  };
}

function firstNightAmount(b: { grandTotal: number; nights: number }) {
  return Math.round(b.grandTotal / Math.max(1, b.nights));
}

// ─── Cancellation ──────────────────────────────────────────────────────────

export async function cancelBooking(
  bookingId: string,
  opts: { by: 'GUEST' | 'STAFF' | 'SYSTEM'; reason: string; waivePenalty?: boolean; notifyGuest?: boolean; req?: Request },
) {
  const settings = await getBookingSettings();
  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(b.status)) throw AppError.conflict(`A ${BOOKING_STATUS_LABEL[b.status as BookingStatus].toLowerCase()} reservation cannot be cancelled.`, 'INVALID_STATUS');
    const today = todayInZone(settings.timezone);
    const checkIn = isoOf(b.checkIn);
    if (opts.by === 'GUEST') {
      if (!settings.cancellation.allowOnlineCancellation) throw AppError.forbidden('Please contact the hotel to cancel this reservation.');
      if (checkIn < today) throw AppError.conflict('This stay has already started. Please contact the hotel.', 'TOO_LATE');
    }
    const paidNet = b.amountPaid - b.amountRefunded;
    const outcome = opts.waivePenalty
      ? { free: true, penalty: 0, refundable: paidNet }
      : cancellationOutcome(settings.cancellation, { grandTotal: b.grandTotal, amountPaid: paidNet, firstNightAmount: firstNightAmount(b), daysBeforeArrival: diffDays(today, checkIn) });

    await tx.bookingRoom.updateMany({ where: { bookingId }, data: { active: false } });
    const redemption = await tx.couponRedemption.findUnique({ where: { bookingId } });
    if (redemption) {
      await tx.couponRedemption.delete({ where: { id: redemption.id } });
      await tx.coupon.updateMany({ where: { id: redemption.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: opts.by, cancellationReason: opts.reason || null,
        cancellationPenalty: outcome.penalty, refundableAmount: outcome.refundable, holdExpiresAt: null,
        refundStatus: outcome.refundable > 0 ? 'PENDING' : b.refundStatus,
        events: { create: { type: 'CANCELLED', message: `Cancelled by ${opts.by.toLowerCase()}${opts.reason ? `: ${opts.reason}` : ''}. Penalty ${outcome.penalty / 100}, refundable ${outcome.refundable / 100}.`, actorId: opts.req?.user?.id } },
      },
    });
    return { booking: updated, outcome };
  }, TX_OPTS);

  if (opts.req && opts.by === 'STAFF') await audit(opts.req, { action: 'booking.cancel', entity: 'Booking', entityId: bookingId, summary: `Cancelled ${result.booking.reference}: ${opts.reason}` });
  if (opts.notifyGuest !== false) {
    queueEmail(async () => {
      const [b, brand] = await Promise.all([prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude }), getBrand()]);
      await sendEmail(b.guestEmail, 'booking.cancelled', templates.bookingCancelled(brand, bookingEmailData(b, settings), { reason: opts.reason, refundable: result.outcome.refundable }));
    });
  }
  if (opts.by === 'GUEST') {
    queueEmail(() => staffAlert(`Reservation ${result.booking.reference} cancelled by guest`, [result.outcome.refundable > 0 ? `Refund due: ${formatMoney(result.outcome.refundable)}` : 'No refund due'], bookingId));
  }
  return result;
}

// ─── Staff operations ──────────────────────────────────────────────────────

export async function changeStatus(bookingId: string, next: BookingStatus, opts: { reason?: string; notifyGuest?: boolean; req: Request }) {
  const settings = await getBookingSettings();
  const today = todayInZone(settings.timezone);
  const b = await prisma.$transaction(async (tx) => {
    const cur = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { rooms: true } });
    const allowed = BOOKING_TRANSITIONS[cur.status as BookingStatus];
    if (!allowed.includes(next)) throw AppError.conflict(`Cannot change a ${BOOKING_STATUS_LABEL[cur.status as BookingStatus].toLowerCase()} reservation to ${BOOKING_STATUS_LABEL[next].toLowerCase()}.`, 'INVALID_TRANSITION');
    const data: Prisma.BookingUpdateInput = { status: next };
    const checkIn = isoOf(cur.checkIn);
    const checkOut = isoOf(cur.checkOut);
    if (next === 'CONFIRMED') {
      data.confirmedAt = new Date();
      data.holdExpiresAt = null;
    }
    if (next === 'CHECKED_IN') {
      if (today < addDays(checkIn, -1)) throw AppError.conflict(`Check-in is scheduled for ${checkIn}.`, 'TOO_EARLY');
      data.checkedInAt = new Date();
    }
    if (next === 'CHECKED_OUT') {
      data.checkedOutAt = new Date();
      // Early departure frees the remaining nights.
      if (today < checkOut && today > checkIn) await tx.bookingRoom.updateMany({ where: { bookingId, active: true }, data: { checkOut: dbDate(today) } });
    }
    if (next === 'REJECTED' || next === 'NO_SHOW') {
      await tx.bookingRoom.updateMany({ where: { bookingId }, data: { active: false } });
      data.cancellationReason = opts.reason ?? null;
      data.cancelledAt = new Date();
      data.cancelledBy = 'STAFF';
      const paidNet = cur.amountPaid - cur.amountRefunded;
      if (next === 'REJECTED' && paidNet > 0) {
        data.refundableAmount = paidNet;
        data.refundStatus = 'PENDING';
      }
    }
    data.events = { create: { type: next, message: `Status changed to ${BOOKING_STATUS_LABEL[next]}${opts.reason ? ` — ${opts.reason}` : ''}.`, actorId: opts.req.user?.id } };
    return tx.booking.update({ where: { id: bookingId }, data });
  }, TX_OPTS);

  await audit(opts.req, { action: `booking.status.${next.toLowerCase()}`, entity: 'Booking', entityId: bookingId, summary: `${b.reference} → ${next}` });
  if (opts.notifyGuest !== false) {
    if (next === 'CONFIRMED') queueEmail(() => emailBooking(bookingId, 'confirmed'));
    if (next === 'REJECTED') queueEmail(() => emailBooking(bookingId, 'status', { message: `we regret that we are unable to accommodate this request${opts.reason ? ` (${opts.reason})` : ''}. Any payment made will be refunded in full.` }));
  }
  return b;
}

export async function assignRooms(bookingId: string, assignments: { bookingRoomId: string; roomId: string }[], req: Request) {
  try {
    await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { rooms: true } });
      await lockRoomType(tx, b.roomTypeId);
      for (const a of assignments) {
        const br = b.rooms.find((r) => r.id === a.bookingRoomId);
        if (!br || !br.active) throw AppError.badRequest('Unknown room allocation.');
        const room = await tx.room.findUnique({ where: { id: a.roomId } });
        if (!room || room.isArchived) throw AppError.badRequest('Unknown room.');
        if (room.roomTypeId !== b.roomTypeId) throw AppError.badRequest(`Room ${room.number} is a different room type.`);
        const blocked = await tx.roomBlock.count({ where: { roomId: room.id, startDate: { lt: br.checkOut }, endDate: { gt: br.checkIn } } });
        if (blocked) throw AppError.conflict(`Room ${room.number} is blocked for maintenance on these dates.`);
        await tx.bookingRoom.update({ where: { id: br.id }, data: { roomId: room.id } });
        await tx.bookingEvent.create({ data: { bookingId, type: 'ROOM_ASSIGNED', message: `Assigned room ${room.number}.`, actorId: req.user?.id } });
      }
    }, TX_OPTS);
  } catch (err) {
    if (isOverlapViolation(err)) throw AppError.conflict('That room is already occupied on these dates.', 'ROOM_OCCUPIED');
    throw err;
  }
  await audit(req, { action: 'booking.assign_rooms', entity: 'Booking', entityId: bookingId, after: assignments });
}

/** Staff modification of dates/guests. Re-allocates (keeping current rooms where possible) and optionally re-prices. */
export async function modifyBooking(bookingId: string, input: { checkIn: string; checkOut: string; adults: number; children: number; reason: string; repriced: boolean }, req: Request) {
  const settings = await getBookingSettings();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { rooms: true, lineItems: true } });
      if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'].includes(b.status)) throw AppError.conflict('Only upcoming reservations can be modified.', 'INVALID_STATUS');
      await lockRoomType(tx, b.roomTypeId);
      await releaseExpiredHolds(tx, b.roomTypeId);
      const previousRoomIds = b.rooms.filter((r) => r.active).map((r) => r.roomId);
      await tx.bookingRoom.updateMany({ where: { bookingId }, data: { active: false } });

      const avail = (await availabilityForStay(tx, input.checkIn, input.checkOut, [b.roomTypeId])).get(b.roomTypeId);
      if (!avail || avail.closed || avail.available < b.roomsCount) throw new AppError(409, 'SOLD_OUT', `Not enough rooms available for ${input.checkIn} → ${input.checkOut}.`);
      const roomIds = pickRooms(avail.freeRoomIds, b.roomsCount, previousRoomIds);
      await tx.bookingRoom.deleteMany({ where: { bookingId } });
      await tx.bookingRoom.createMany({ data: roomIds.map((roomId) => ({ bookingId, roomId, checkIn: dbDate(input.checkIn), checkOut: dbDate(input.checkOut) })) });

      const data: Prisma.BookingUpdateInput = {
        checkIn: dbDate(input.checkIn), checkOut: dbDate(input.checkOut), nights: diffDays(input.checkIn, input.checkOut), adults: input.adults, children: input.children,
      };
      if (input.repriced) {
        const addOns = b.lineItems.filter((l) => l.kind === 'ADDON' && l.refId).map((l) => ({ addOnId: l.refId!, quantity: 1 }));
        const ctx = await buildQuote(tx, { roomTypeId: b.roomTypeId, checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, rooms: b.roomsCount, extraBeds: b.extraBeds, mealPlanId: b.mealPlanId, addOns, offerId: b.offerId, couponCode: b.couponCode }, settings, { staff: true, bypassCouponLimits: true, allowUnpublished: true });
        await tx.bookingLineItem.deleteMany({ where: { bookingId } });
        await tx.bookingLineItem.createMany({ data: lineItemsData(ctx).map((l) => ({ ...l, bookingId })) });
        Object.assign(data, {
          subtotal: ctx.quote.subtotal, discountTotal: ctx.quote.discountTotal, taxTotal: ctx.quote.taxTotal, feeTotal: ctx.quote.feeTotal,
          grandTotal: ctx.quote.grandTotal, depositDue: ctx.quote.depositDue, pricingSnapshot: ctx.quote as unknown as Prisma.InputJsonValue,
        });
        const paidNet = b.amountPaid - b.amountRefunded;
        if (paidNet > ctx.quote.grandTotal) {
          data.refundableAmount = paidNet - ctx.quote.grandTotal;
          data.refundStatus = 'PENDING';
        } else if (b.amountPaid > 0) {
          data.paymentStatus = paidNet >= ctx.quote.grandTotal ? 'PAID' : 'PARTIALLY_PAID';
        }
      }
      data.events = { create: { type: 'MODIFIED', message: `Stay changed from ${isoOf(b.checkIn)}→${isoOf(b.checkOut)} to ${input.checkIn}→${input.checkOut}${input.reason ? ` (${input.reason})` : ''}.`, actorId: req.user?.id } };
      return tx.booking.update({ where: { id: bookingId }, data });
    }, TX_OPTS);
    await audit(req, { action: 'booking.modify', entity: 'Booking', entityId: bookingId, after: input });
    queueEmail(() => emailBooking(bookingId, 'status', { message: `your reservation has been updated to ${input.checkIn} – ${input.checkOut}.` }));
    return result;
  } catch (err) {
    if (isOverlapViolation(err)) throw new AppError(409, 'SOLD_OUT', 'Rooms became unavailable while modifying. Please try again.');
    throw err;
  }
}

export async function recordOfflinePayment(bookingId: string, input: { amount: number; method: string; reference: string }, req: Request) {
  const settings = await getBookingSettings();
  const b = await prisma.$transaction(async (tx) => {
    const cur = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(cur.status)) throw AppError.conflict('Cannot record a payment against an inactive reservation.');
    const balance = cur.grandTotal - (cur.amountPaid - cur.amountRefunded);
    if (input.amount > balance) throw AppError.badRequest(`Amount exceeds the balance due (${formatMoney(balance)}).`, 'OVERPAYMENT');
    await tx.payment.create({ data: { bookingId, provider: input.method, amount: input.amount, status: 'CAPTURED', method: input.method, reference: input.reference, recordedById: req.user?.id, capturedAt: new Date() } });
    const amountPaid = cur.amountPaid + input.amount;
    const paidNet = amountPaid - cur.amountRefunded;
    return tx.booking.update({
      where: { id: bookingId },
      data: {
        amountPaid,
        paymentStatus: paidNet >= cur.grandTotal ? 'PAID' : 'PARTIALLY_PAID',
        ...(cur.status === 'PENDING_PAYMENT' ? { status: settings.autoConfirmPaid ? 'CONFIRMED' : 'PENDING', holdExpiresAt: null, confirmedAt: settings.autoConfirmPaid ? new Date() : null } : {}),
        events: { create: { type: 'PAYMENT', message: `Recorded ${input.method.replace(/_/g, ' ').toLowerCase()} payment of ${formatMoney(input.amount)}.`, actorId: req.user?.id } },
      },
    });
  }, TX_OPTS);
  await audit(req, { action: 'payment.record', entity: 'Booking', entityId: bookingId, summary: `${b.reference}: ${input.method} ${input.amount}` });
  return b;
}

export async function addNote(bookingId: string, body: string, req: Request) {
  const note = await prisma.bookingNote.create({ data: { bookingId, body, authorId: req.user?.id } });
  return note;
}

export function logBookingError(err: unknown, context: string) {
  logger.error({ err }, context);
}
