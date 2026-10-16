import { env } from '../../config/env';
import { hmacHex, safeEqual } from '../../utils/crypto';
import type { CreateOrderInput, ParsedWebhook, PaymentProvider, RefundResult } from './provider';

const API = 'https://api.razorpay.com/v1';

/**
 * Razorpay Orders API integration (https://razorpay.com/docs/payments/server-integration/).
 * Requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (use rzp_test_* keys for the test environment)
 * and RAZORPAY_WEBHOOK_SECRET for webhook verification.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'RAZORPAY' as const;
  readonly isTest = env.RAZORPAY_KEY_ID.startsWith('rzp_test_');

  private async call<T>(path: string, body: unknown): Promise<T> {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
    if (!res.ok) throw new Error(`Razorpay ${path} failed (${res.status}): ${json.error?.description ?? 'unknown error'}`);
    return json;
  }

  async createOrder(input: CreateOrderInput) {
    const order = await this.call<{ id: string }>('/orders', { amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes });
    return { orderId: order.id };
  }

  checkoutConfig() {
    return { provider: this.name, keyId: env.RAZORPAY_KEY_ID, isTest: this.isTest };
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
    return safeEqual(hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
    return safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ParsedWebhook {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload: {
        payment?: { entity: { id: string; order_id: string; amount: number; method?: string; error_code?: string; error_description?: string } };
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
      created_at?: number;
    };
    const p = body.payload.payment?.entity;
    const r = body.payload.refund?.entity;
    return {
      eventId: headers['x-razorpay-event-id'] ?? `${body.event}:${p?.id ?? r?.id}:${body.created_at ?? ''}`,
      type: body.event,
      orderId: p?.order_id,
      paymentId: p?.id ?? r?.payment_id,
      amount: p?.amount ?? r?.amount,
      refundId: r?.id,
      errorCode: p?.error_code,
      errorDescription: p?.error_description,
      method: p?.method,
    };
  }

  async refund(paymentId: string, amount: number, notes?: Record<string, string>): Promise<RefundResult> {
    const r = await this.call<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount, speed: 'normal', notes });
    return { refundId: r.id, status: r.status === 'processed' ? 'PROCESSED' : 'PROCESSING' };
  }
}
