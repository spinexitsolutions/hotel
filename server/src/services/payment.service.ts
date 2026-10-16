import type { Request } from 'express';
import { Prisma, prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AppError } from '../utils/http';
import { paymentProvider } from './payments';
import type { ParsedWebhook } from './payments/provider';
import { availabilityForStay, isOverlapViolation, lockRoomType, releaseExpiredHolds } from './availability.service';
import { getBookingSettings } from './settings.service';
import { emailBooking, bookingInclude } from './booking.service';
import { getBrand, queueEmail, sendEmail, templates } from './email';
import { notifyStaff } from './notification.service';
import { audit } from './audit.service';
import { isoOf } from '../utils/dates';

/** Creates a gateway order for the outstanding deposit of a booking awaiting payment. */
export async function startPayment(reference: string) {
  const booking = await prisma.booking.findUnique({ where: { reference } });
  if (!booking) throw AppError.notFound('Reservation');
  if (booking.status !== 'PENDING_PAYMENT') throw AppError.conflict('This reservation does not require payment.', 'NO_PAYMENT_DUE');
  if (!booking.holdExpiresAt || booking.holdExpiresAt < new Date()) throw AppError.conflict('Your room hold has expired. Please search again to rebook.', 'HOLD_EXPIRED');
  const amount = booking.depositDue - booking.amountPaid;
  if (amount <= 0) throw AppError.conflict('Nothing is due on this reservation.', 'NO_PAYMENT_DUE');

  // Re-use a recent unpaid order for the same amount to avoid creating duplicates on retries.
  const existing = await prisma.payment.findFirst({
    where: { bookingId: booking.id, status: 'CREATED', amount, provider: paymentProvider.name, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
    orderBy: { createdAt: 'desc' },
  });
  let orderId = existing?.providerOrderId;
  if (!orderId) {
    const order = await paymentProvider.createOrder({ amount, currency: booking.currency, receipt: booking.reference, notes: { bookingId: booking.id, reference: booking.reference } });
    orderId = order.orderId;
    await prisma.payment.create({ data: { bookingId: booking.id, provider: paymentProvider.name, providerOrderId: orderId, amount, currency: booking.currency, status: 'CREATED', isTest: paymentProvider.isTest } });
    await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PENDING' } });
  }
  return {
    ...paymentProvider.checkoutConfig(),
    orderId,
    amount,
    currency: booking.currency,
    reference: booking.reference,
    holdExpiresAt: booking.holdExpiresAt,
    prefill: { name: `${booking.guestFirstName} ${booking.guestLastName}`, email: booking.guestEmail, contact: booking.guestPhone },
  };
}

/**
 * Marks a gateway payment captured and advances the booking. Idempotent: the conditional update on the
 * payment row means only the first caller (browser verify OR webhook) applies the money to the booking.
 */
export async function capturePayment(providerOrderId: string, providerPaymentId: string, method = '') {
  const settings = await getBookingSettings();
  const outcome = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { providerOrderId } });
    if (!payment) throw AppError.notFound('Payment order');
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'FAILED'] } },
      data: { status: 'CAPTURED', providerPaymentId, capturedAt: new Date(), method, errorCode: null, errorDescription: null },
    });
    if (claimed.count === 0) return { alreadyProcessed: true, bookingId: payment.bookingId, status: null as string | null };

    const b = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId }, include: { rooms: true } });
    const amountPaid = b.amountPaid + payment.amount;
    const fullyPaid = amountPaid - b.amountRefunded >= b.grandTotal;
    const paymentStatus = fullyPaid ? 'PAID' : 'PARTIALLY_PAID';

    if (b.status === 'PENDING_PAYMENT' || b.status === 'EXPIRED') {
      let roomsOk = b.status === 'PENDING_PAYMENT';
      if (!roomsOk) {
        // Late payment for a lapsed hold: try to re-allocate rooms for the original stay.
        await lockRoomType(tx, b.roomTypeId);
        await releaseExpiredHolds(tx, b.roomTypeId);
        const avail = (await availabilityForStay(tx, isoOf(b.checkIn), isoOf(b.checkOut), [b.roomTypeId])).get(b.roomTypeId);
        if (avail && !avail.closed && avail.available >= b.roomsCount) {
          await tx.bookingRoom.deleteMany({ where: { bookingId: b.id } });
          await tx.bookingRoom.createMany({ data: avail.freeRoomIds.slice(0, b.roomsCount).map((roomId) => ({ bookingId: b.id, roomId, checkIn: b.checkIn, checkOut: b.checkOut })) });
          roomsOk = true;
        }
      }
      if (roomsOk) {
        const status = settings.autoConfirmPaid ? 'CONFIRMED' : 'PENDING';
        await tx.booking.update({
          where: { id: b.id },
          data: {
            amountPaid, paymentStatus, status, holdExpiresAt: null, confirmedAt: status === 'CONFIRMED' ? new Date() : null,
            events: { create: { type: 'PAYMENT', message: `Online payment of ₹${(payment.amount / 100).toLocaleString('en-IN')} captured (${payment.provider}${payment.isTest ? ', TEST MODE' : ''}).` } },
          },
        });
        return { alreadyProcessed: false, bookingId: b.id, status };
      }
      await tx.booking.update({
        where: { id: b.id },
        data: {
          amountPaid, paymentStatus, refundStatus: 'PENDING', refundableAmount: amountPaid - b.amountRefunded,
          events: { create: { type: 'PAYMENT_AFTER_EXPIRY', message: 'Payment received after the hold expired and the rooms are no longer available — refund required.' } },
        },
      });
      return { alreadyProcessed: false, bookingId: b.id, status: 'EXPIRED_REFUND' };
    }

    // Payment toward an already-active booking (e.g. balance): just record it.
    await tx.booking.update({ where: { id: b.id }, data: { amountPaid, paymentStatus, events: { create: { type: 'PAYMENT', message: `Payment of ₹${(payment.amount / 100).toLocaleString('en-IN')} captured.` } } } });
    return { alreadyProcessed: false, bookingId: b.id, status: b.status };
  }, { timeout: 20_000 }).catch((err) => {
    if (isOverlapViolation(err)) throw AppError.conflict('Rooms are no longer available.');
    throw err;
  });

  if (!outcome.alreadyProcessed) {
    if (outcome.status === 'CONFIRMED') queueEmail(() => emailBooking(outcome.bookingId, 'confirmed'));
    else if (outcome.status === 'PENDING') queueEmail(() => emailBooking(outcome.bookingId, 'received'));
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: outcome.bookingId }, select: { reference: true, guestFirstName: true, guestLastName: true } });
    await notifyStaff({
      permission: 'bookings.view',
      type: outcome.status === 'EXPIRED_REFUND' ? 'refund' : 'booking',
      title: outcome.status === 'EXPIRED_REFUND' ? `Refund required: ${b.reference} paid after hold expired` : `New paid reservation ${b.reference}`,
      body: `${b.guestFirstName} ${b.guestLastName}`,
      link: `/admin/bookings/${outcome.bookingId}`,
    });
  }
  return outcome;
}

export async function verifyBrowserPayment(input: { bookingReference: string; providerOrderId: string; providerPaymentId: string; signature: string }) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.providerOrderId }, include: { booking: { select: { reference: true } } } });
  if (!payment || payment.booking.reference !== input.bookingReference.toUpperCase()) throw AppError.notFound('Payment order');
  if (!paymentProvider.verifyPaymentSignature(input.providerOrderId, input.providerPaymentId, input.signature)) {
    logger.warn({ order: input.providerOrderId }, 'payment signature mismatch');
    throw new AppError(400, 'SIGNATURE_INVALID', 'We could not verify this payment. If money was debited it will be reconciled automatically — please contact us.');
  }
  return capturePayment(input.providerOrderId, input.providerPaymentId);
}

export async function recordPaymentFailure(input: { bookingReference: string; providerOrderId: string; code?: string; description?: string }) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.providerOrderId }, include: { booking: true } });
  if (!payment || payment.booking.reference !== input.bookingReference.toUpperCase()) throw AppError.notFound('Payment order');
  const updated = await prisma.payment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { status: 'FAILED', errorCode: input.code?.slice(0, 100) ?? 'FAILED', errorDescription: input.description?.slice(0, 500) ?? 'Payment failed' } });
  if (updated.count) {
    await prisma.booking.updateMany({ where: { id: payment.bookingId, status: 'PENDING_PAYMENT' }, data: { paymentStatus: 'FAILED' } });
    await prisma.bookingEvent.create({ data: { bookingId: payment.bookingId, type: 'PAYMENT_FAILED', message: `Payment failed: ${input.description ?? input.code ?? 'unknown reason'}` } });
    queueEmail(() => emailBooking(payment.bookingId, 'paymentFailed'));
  }
  return { ok: true };
}

/** Verified, de-duplicated webhook processing. Returns a short status string for the HTTP response. */
export async function handleWebhook(rawBody: Buffer, signature: string, headers: Record<string, string | undefined>) {
  if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) throw new AppError(400, 'SIGNATURE_INVALID', 'Invalid webhook signature.');
  let evt: ParsedWebhook;
  try {
    evt = paymentProvider.parseWebhook(rawBody, headers);
  } catch {
    throw AppError.badRequest('Malformed webhook payload.');
  }
  try {
    await prisma.webhookEvent.create({ data: { provider: paymentProvider.name, eventId: evt.eventId, type: evt.type, payload: JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
    throw err;
  }

  if ((evt.type === 'payment.captured' || evt.type === 'order.paid') && evt.orderId && evt.paymentId) {
    const exists = await prisma.payment.findUnique({ where: { providerOrderId: evt.orderId } });
    if (exists) await capturePayment(evt.orderId, evt.paymentId, evt.method ?? '');
  } else if (evt.type === 'payment.failed' && evt.orderId) {
    const p = await prisma.payment.findUnique({ where: { providerOrderId: evt.orderId }, include: { booking: true } });
    if (p) await recordPaymentFailure({ bookingReference: p.booking.reference, providerOrderId: evt.orderId, code: evt.errorCode, description: evt.errorDescription });
  } else if ((evt.type === 'refund.processed' || evt.type === 'refund.failed') && evt.refundId) {
    const r = await prisma.refund.findUnique({ where: { providerRefundId: evt.refundId } });
    if (r && r.status !== 'PROCESSED') {
      const ok = evt.type === 'refund.processed';
      await prisma.refund.update({ where: { id: r.id }, data: { status: ok ? 'PROCESSED' : 'FAILED', processedAt: ok ? new Date() : null } });
      await syncRefundStatus(r.bookingId);
    }
  }
  await prisma.webhookEvent.update({ where: { provider_eventId: { provider: paymentProvider.name, eventId: evt.eventId } }, data: { processedAt: new Date() } });
  return 'processed';
}

async function syncRefundStatus(bookingId: string) {
  const refunds = await prisma.refund.findMany({ where: { bookingId } });
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const pending = refunds.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
  const failed = refunds.some((r) => r.status === 'FAILED');
  const outstanding = b.refundableAmount > 0;
  await prisma.booking.update({ where: { id: bookingId }, data: { refundStatus: pending ? 'PROCESSING' : outstanding ? (failed ? 'FAILED' : 'PENDING') : refunds.length ? 'PROCESSED' : 'NONE' } });
}

/**
 * Issues a refund. Gateway payments are refunded through the provider; offline payments are recorded as
 * refunded manually. Amounts are validated against what was actually captured and not yet refunded.
 */
export async function refundBooking(bookingId: string, input: { amount: number; reason: string; paymentId?: string }, req: Request) {
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: { where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } }, orderBy: { capturedAt: 'asc' } } } });
  const refundableTotal = b.amountPaid - b.amountRefunded;
  if (input.amount > refundableTotal) throw AppError.badRequest(`Refund exceeds the amount paid (₹${(refundableTotal / 100).toLocaleString('en-IN')} available).`, 'REFUND_TOO_LARGE');

  const candidates = input.paymentId ? b.payments.filter((p) => p.id === input.paymentId) : b.payments;
  let remaining = input.amount;
  const issued: { paymentId: string; amount: number; status: 'PROCESSED' | 'PROCESSING' }[] = [];
  for (const p of candidates) {
    if (remaining <= 0) break;
    const available = p.amount - p.amountRefunded;
    if (available <= 0) continue;
    const amount = Math.min(available, remaining);
    let providerRefundId: string | null = null;
    let status: 'PROCESSED' | 'PROCESSING' = 'PROCESSED';
    if ((p.provider === 'RAZORPAY' || p.provider === 'SANDBOX') && p.providerPaymentId) {
      if (p.provider !== paymentProvider.name) throw AppError.conflict(`This payment was taken with ${p.provider}, which is not the active gateway.`);
      try {
        const r = await paymentProvider.refund(p.providerPaymentId, amount, { reference: b.reference });
        providerRefundId = r.refundId;
        status = r.status;
      } catch (err) {
        logger.error({ err }, 'refund failed');
        await prisma.refund.create({ data: { paymentId: p.id, bookingId, amount, status: 'FAILED', reason: input.reason, initiatedById: req.user?.id } });
        await syncRefundStatus(bookingId);
        throw new AppError(502, 'REFUND_FAILED', 'The payment gateway rejected the refund. No money was refunded. Please try again or refund manually.');
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({ data: { paymentId: p.id, bookingId, amount, status, providerRefundId, reason: input.reason, initiatedById: req.user?.id, processedAt: status === 'PROCESSED' ? new Date() : null } });
      const newRefunded = p.amountRefunded + amount;
      await tx.payment.update({ where: { id: p.id }, data: { amountRefunded: newRefunded, status: newRefunded >= p.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      const cur = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const amountRefunded = cur.amountRefunded + amount;
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          amountRefunded,
          refundableAmount: Math.max(0, cur.refundableAmount - amount),
          paymentStatus: amountRefunded >= cur.amountPaid ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          events: { create: { type: 'REFUND', message: `Refund of ₹${(amount / 100).toLocaleString('en-IN')} ${status === 'PROCESSED' ? 'issued' : 'initiated'} (${p.provider}). ${input.reason}`, actorId: req.user?.id } },
        },
      });
    });
    issued.push({ paymentId: p.id, amount, status });
    remaining -= amount;
  }
  if (remaining > 0) throw AppError.badRequest('No captured payments with enough balance to refund.', 'REFUND_TOO_LARGE');
  await syncRefundStatus(bookingId);
  await audit(req, { action: 'refund.issue', entity: 'Booking', entityId: bookingId, summary: `Refunded ${input.amount} on ${b.reference}: ${input.reason}` });
  queueEmail(async () => {
    const [full, brand] = await Promise.all([prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude }), getBrand()]);
    await sendEmail(full.guestEmail, 'refund.processed', templates.refundProcessed(brand, { guestName: full.guestFirstName, reference: full.reference, amount: input.amount }));
  });
  return issued;
}
