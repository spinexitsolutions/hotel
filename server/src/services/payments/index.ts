import { env } from '../../config/env';
import type { PaymentProvider } from './provider';
import { RazorpayProvider } from './razorpay.provider';
import { SandboxProvider } from './sandbox.provider';

export const paymentProvider: PaymentProvider = env.PAYMENT_PROVIDER === 'razorpay' ? new RazorpayProvider() : new SandboxProvider();
export const sandbox = paymentProvider instanceof SandboxProvider ? paymentProvider : null;
export type { PaymentProvider } from './provider';
