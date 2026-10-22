import express, { Router } from 'express';
import { paymentFailureSchema, verifyPaymentSchema } from '@aurelle/shared';
import { prisma } from '../config/prisma';
import { AppError, ah, str } from '../utils/http';
import { paymentLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { handleWebhook, recordPaymentFailure, verifyBrowserPayment } from '../services/payment.service';
import { sandbox } from '../services/payments';
import { findBookingForGuest } from '../services/booking.service';

export const paymentsRouter = Router();

paymentsRouter.post('/verify', paymentLimiter, validate(verifyPaymentSchema), ah(async (req, res) => {
  const result = await verifyBrowserPayment(req.body);
  res.json({ ok: true, status: result.status });
}));

paymentsRouter.post('/failure', paymentLimiter, validate(paymentFailureSchema), ah(async (req, res) => {
  res.json(await recordPaymentFailure(req.body));
}));

/**
 * SANDBOX ONLY: stands in for the gateway's hosted checkout. Returns a signed success payload (or records a
 * failure) for an existing order belonging to a booking the caller can access. Disabled with real gateways.
 */
paymentsRouter.post('/sandbox/simulate', paymentLimiter, ah(async (req, res) => {
  if (!sandbox) throw AppError.notFound('Endpoint');
  const orderId = str(req.body?.orderId);
  const reference = str(req.body?.reference);
  const outcome = req.body?.outcome === 'failure' ? 'failure' : 'success';
  if (!orderId || !reference) throw AppError.badRequest('orderId and reference are required.');
  await findBookingForGuest(reference, { token: str(req.body?.token), user: req.user });
  const payment = await prisma.payment.findFirst({ where: { providerOrderId: orderId }, include: { booking: true } });
  if (!payment || payment.booking.reference !== reference.toUpperCase()) throw AppError.notFound('Payment order');
  if (outcome === 'failure') return res.json({ outcome, error: { code: 'BAD_REQUEST_ERROR', description: 'Test mode: the bank declined this payment.' } });
  res.json({ outcome, ...sandbox.simulateSuccess(orderId) });
}));

/** Gateway webhook: needs the exact raw body for signature verification. CSRF-exempt by design. */
paymentsRouter.post('/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), ah(async (req, res) => {
  const signature = req.get('x-razorpay-signature') ?? '';
  const status = await handleWebhook(req.body as Buffer, signature, { 'x-razorpay-event-id': req.get('x-razorpay-event-id') });
  res.json({ ok: true, status });
}));
