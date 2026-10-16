import { env } from '../../config/env';
import { hmacHex, randomToken, safeEqual } from '../../utils/crypto';
import type { CreateOrderInput, ParsedWebhook, PaymentProvider, RefundResult } from './provider';

/**
 * TEST MODE ONLY — simulates a payment gateway so the complete booking flow can be exercised without
 * credentials. No money moves. Every payment it records is flagged `isTest` and labelled in the UI.
 * The browser asks the server to "simulate" an outcome, receiving a signed payment id exactly like a
 * real gateway callback; verification then follows the same code path as Razorpay.
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = 'SANDBOX' as const;
  readonly isTest = true;

  async createOrder(_input: CreateOrderInput) {
    return { orderId: `order_sbx_${randomToken(10)}` };
  }

  checkoutConfig() {
    return { provider: this.name, isTest: true };
  }

  sign(orderId: string, paymentId: string) {
    return hmacHex(env.SANDBOX_PAYMENT_SECRET, `${orderId}|${paymentId}`);
  }

  simulateSuccess(orderId: string) {
    const paymentId = `pay_sbx_${randomToken(10)}`;
    return { providerOrderId: orderId, providerPaymentId: paymentId, signature: this.sign(orderId, paymentId) };
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
    return safeEqual(this.sign(orderId, paymentId), signature);
  }

  signWebhook(rawBody: Buffer | string) {
    return hmacHex(env.SANDBOX_PAYMENT_SECRET, rawBody);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    return !!signature && safeEqual(this.signWebhook(rawBody), signature);
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ParsedWebhook {
    // Same shape as Razorpay so tests exercise the real webhook handler.
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload: { payment?: { entity: { id: string; order_id: string; amount: number; error_code?: string; error_description?: string } }; refund?: { entity: { id: string; payment_id: string; amount: number } } };
    };
    const p = body.payload.payment?.entity;
    const r = body.payload.refund?.entity;
    return {
      eventId: headers['x-razorpay-event-id'] ?? `${body.event}:${p?.id ?? r?.id}`,
      type: body.event, orderId: p?.order_id, paymentId: p?.id ?? r?.payment_id, amount: p?.amount ?? r?.amount,
      refundId: r?.id, errorCode: p?.error_code, errorDescription: p?.error_description, method: 'sandbox',
    };
  }

  async refund(_paymentId: string, _amount: number): Promise<RefundResult> {
    return { refundId: `rfnd_sbx_${randomToken(10)}`, status: 'PROCESSED' };
  }
}
