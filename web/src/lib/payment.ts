import { post } from './api';
import type { PaymentInit } from './types';

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(evt: string, cb: (r: { error: { code: string; description: string } }) => void): void } }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the payment window. Please check your connection.')); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface PaymentCallbacks {
  brandName: string;
  primaryColor: string;
  onVerified: (status: string | null) => void;
  onFailed: (message: string) => void;
  onDismiss: () => void;
}

/** Opens Razorpay Checkout; the server verifies the signature before anything is confirmed. */
export async function payWithRazorpay(p: PaymentInit, cb: PaymentCallbacks) {
  await loadRazorpay();
  const rzp = new window.Razorpay!({
    key: p.keyId,
    order_id: p.orderId,
    amount: p.amount,
    currency: p.currency,
    name: cb.brandName,
    description: `Reservation ${p.reference}`,
    prefill: p.prefill,
    theme: { color: cb.primaryColor },
    handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
      try {
        const r = await post<{ status: string | null }>('/payments/verify', { bookingReference: p.reference, providerOrderId: resp.razorpay_order_id, providerPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
        cb.onVerified(r.status);
      } catch (e) {
        cb.onFailed(e instanceof Error ? e.message : 'Payment verification failed.');
      }
    },
    modal: { ondismiss: cb.onDismiss },
  });
  rzp.on('payment.failed', (r) => {
    void post('/payments/failure', { bookingReference: p.reference, providerOrderId: p.orderId, code: r.error.code, description: r.error.description }).catch(() => undefined);
    cb.onFailed(r.error.description || 'The payment was declined.');
  });
  rzp.open();
}

/** Sandbox (test mode): asks the server to simulate the gateway, then verifies exactly like Razorpay. */
export async function payWithSandbox(p: PaymentInit, outcome: 'success' | 'failure', token: string | null, cb: Pick<PaymentCallbacks, 'onVerified' | 'onFailed'>) {
  const sim = await post<{ outcome: string; providerOrderId: string; providerPaymentId: string; signature: string; error?: { code: string; description: string } }>('/payments/sandbox/simulate', { orderId: p.orderId, reference: p.reference, outcome, token });
  if (sim.outcome === 'failure') {
    await post('/payments/failure', { bookingReference: p.reference, providerOrderId: p.orderId, code: sim.error?.code, description: sim.error?.description });
    cb.onFailed(sim.error?.description ?? 'Payment failed.');
    return;
  }
  const r = await post<{ status: string | null }>('/payments/verify', { bookingReference: p.reference, providerOrderId: sim.providerOrderId, providerPaymentId: sim.providerPaymentId, signature: sim.signature });
  cb.onVerified(r.status);
}

export const bookingTokenKey = (ref: string) => `aur_bt_${ref}`;
export function rememberBookingToken(ref: string, token: string) {
  try { sessionStorage.setItem(bookingTokenKey(ref), token); localStorage.setItem(bookingTokenKey(ref), token); } catch { /* ignore */ }
}
export function recallBookingToken(ref: string): string | null {
  try { return sessionStorage.getItem(bookingTokenKey(ref)) ?? localStorage.getItem(bookingTokenKey(ref)); } catch { return null; }
}
