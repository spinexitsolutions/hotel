export interface CreateOrderInput {
  amount: number; // paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RefundResult {
  refundId: string;
  status: 'PROCESSED' | 'PROCESSING';
}

export interface ParsedWebhook {
  eventId: string;
  type: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  refundId?: string;
  errorCode?: string;
  errorDescription?: string;
  method?: string;
}

export interface PaymentProvider {
  readonly name: 'RAZORPAY' | 'SANDBOX';
  /** True for Razorpay test keys and for the sandbox — surfaced in the UI and stored on payments. */
  readonly isTest: boolean;
  createOrder(input: CreateOrderInput): Promise<{ orderId: string }>;
  /** Public data the browser needs to open checkout. Never includes secrets. */
  checkoutConfig(): { provider: 'RAZORPAY' | 'SANDBOX'; keyId?: string; isTest: boolean };
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  parseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ParsedWebhook;
  refund(paymentId: string, amount: number, notes?: Record<string, string>): Promise<RefundResult>;
}
