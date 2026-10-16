import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { sandbox } from '../src/services/payments';
import { agent, bookingBody, login, resetFixtures } from './helpers';

let roomTypeId: string;
beforeEach(async () => {
  roomTypeId = (await resetFixtures({ rooms: 2 })).roomType.id;
});

async function bookAndPay() {
  const a = await agent();
  const res = await a.post('/api/bookings', bookingBody(roomTypeId));
  const { reference } = res.body.booking;
  const orderId = res.body.payment.orderId;
  const sim = await a.post('/api/payments/sandbox/simulate', { orderId, reference, token: res.body.manageToken, outcome: 'success' });
  return { a, res, reference, orderId, sim: sim.body };
}

function webhook(payload: object, eventId: string, signature?: string) {
  const raw = JSON.stringify(payload);
  return agent().then((a) => a.raw.post('/api/payments/webhooks/razorpay')
    .set('content-type', 'application/json')
    .set('x-razorpay-event-id', eventId)
    .set('x-razorpay-signature', signature ?? sandbox!.signWebhook(raw))
    .send(raw));
}

describe('payment verification', () => {
  it('confirms the booking after a valid signature, exactly once', async () => {
    const { a, reference, orderId, sim } = await bookAndPay();
    const v1 = await a.post('/api/payments/verify', { bookingReference: reference, providerOrderId: orderId, providerPaymentId: sim.providerPaymentId, signature: sim.signature });
    expect(v1.status).toBe(200);
    expect(v1.body.status).toBe('CONFIRMED');
    const v2 = await a.post('/api/payments/verify', { bookingReference: reference, providerOrderId: orderId, providerPaymentId: sim.providerPaymentId, signature: sim.signature });
    expect(v2.status).toBe(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { reference } });
    expect(b.amountPaid).toBe(b.grandTotal); // not doubled
    expect(b.paymentStatus).toBe('PAID');
  });

  it('rejects a forged signature', async () => {
    const { a, reference, orderId, sim } = await bookAndPay();
    const res = await a.post('/api/payments/verify', { bookingReference: reference, providerOrderId: orderId, providerPaymentId: sim.providerPaymentId, signature: 'f'.repeat(64) });
    expect(res.status).toBe(400);
    expect((await prisma.booking.findUniqueOrThrow({ where: { reference } })).status).toBe('PENDING_PAYMENT');
  });

  it('records a failed payment and keeps the hold so the guest can retry', async () => {
    const a = await agent();
    const res = await a.post('/api/bookings', bookingBody(roomTypeId));
    const fail = await a.post('/api/payments/failure', { bookingReference: res.body.booking.reference, providerOrderId: res.body.payment.orderId, code: 'BAD_REQUEST_ERROR', description: 'Card declined' });
    expect(fail.status).toBe(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.booking.id } });
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(b.paymentStatus).toBe('FAILED');
    const retry = await a.raw.post(`/api/bookings/${b.reference}/pay?token=${res.body.manageToken}`).set('x-csrf-token', a.token);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.orderId).toMatch(/^order_sbx_/);
  });
});

describe('webhooks', () => {
  it('rejects an invalid signature', async () => {
    const res = await webhook({ event: 'payment.captured', payload: {} }, 'evt_bad', 'nope');
    expect(res.status).toBe(400);
  });

  it('processes duplicate deliveries exactly once', async () => {
    const { reference, orderId } = await bookAndPay();
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_webhook_1', order_id: orderId, amount: 1 } } } };
    const r1 = await webhook(payload, 'evt_1');
    const r2 = await webhook(payload, 'evt_1');
    expect(r1.body.status).toBe('processed');
    expect(r2.body.status).toBe('duplicate');
    const b = await prisma.booking.findUniqueOrThrow({ where: { reference } });
    expect(b.status).toBe('CONFIRMED');
    expect(b.amountPaid).toBe(b.grandTotal);
    expect(await prisma.webhookEvent.count()).toBe(1);
  });

  it('a webhook after browser verification does not double count', async () => {
    const { a, reference, orderId, sim } = await bookAndPay();
    await a.post('/api/payments/verify', { bookingReference: reference, providerOrderId: orderId, providerPaymentId: sim.providerPaymentId, signature: sim.signature });
    await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: sim.providerPaymentId, order_id: orderId, amount: 1 } } } }, 'evt_2');
    const b = await prisma.booking.findUniqueOrThrow({ where: { reference } });
    expect(b.amountPaid).toBe(b.grandTotal);
  });
});

describe('refunds', () => {
  it('refunds through the gateway and tracks refund status separately from the booking', async () => {
    const { a, reference, orderId, sim } = await bookAndPay();
    await a.post('/api/payments/verify', { bookingReference: reference, providerOrderId: orderId, providerPaymentId: sim.providerPaymentId, signature: sim.signature });
    const b = await prisma.booking.findUniqueOrThrow({ where: { reference } });
    const manager = await login('hotel_manager@test.dev');
    expect((await manager.post(`/api/admin/bookings/${b.id}/refunds`, { amount: b.grandTotal + 1, reason: 'Too much' })).status).toBe(400);
    const r = await manager.post(`/api/admin/bookings/${b.id}/refunds`, { amount: 5_000_00, reason: 'Goodwill gesture' });
    expect(r.status).toBe(201);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.status).toBe('CONFIRMED');
    expect(after.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(after.amountRefunded).toBe(5_000_00);
    const bm = await login('booking_manager@test.dev');
    expect((await bm.post(`/api/admin/bookings/${b.id}/refunds`, { amount: 100, reason: 'Nope' })).status).toBe(403);
  });
});
