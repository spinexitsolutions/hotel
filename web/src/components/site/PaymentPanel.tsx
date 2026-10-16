import { useState } from 'react';
import { CreditCard, FlaskConical, Lock, ShieldCheck } from 'lucide-react';
import { useSite } from '@/app/SiteProvider';
import { money } from '@/lib/format';
import { payWithRazorpay, payWithSandbox } from '@/lib/payment';
import type { PaymentInit } from '@/lib/types';
import { errorMessage } from '@/lib/api';

/** Payment step. With the sandbox provider it is explicitly labelled TEST MODE and never claims real payment. */
export function PaymentPanel({ payment, token, onPaid, onFailed }: { payment: PaymentInit; token: string | null; onPaid: (status: string | null) => void; onFailed?: (m: string) => void }) {
  const { config } = useSite();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fail = (m: string) => { setBusy(false); setError(m); onFailed?.(m); };

  async function pay(outcome: 'success' | 'failure' = 'success') {
    setBusy(true);
    setError('');
    try {
      if (payment.provider === 'RAZORPAY') {
        await payWithRazorpay(payment, { brandName: config.brand.name, primaryColor: config.theme.colors.primary, onVerified: (s) => { setBusy(false); onPaid(s); }, onFailed: fail, onDismiss: () => setBusy(false) });
      } else {
        await payWithSandbox(payment, outcome, token, { onVerified: (s) => { setBusy(false); onPaid(s); }, onFailed: fail });
      }
    } catch (e) {
      fail(errorMessage(e));
    }
  }

  const holdMins = Math.max(0, Math.round((new Date(payment.holdExpiresAt).getTime() - Date.now()) / 60000));
  return (
    <div className="card-luxe p-8">
      {payment.isTest && (
        <div className="mb-6 flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Test mode — no real money will be charged.</p>
            <p className="mt-1 text-amber-800">{payment.provider === 'SANDBOX' ? 'The payment gateway is running in sandbox mode. Use the buttons below to simulate the outcome.' : 'Razorpay test keys are configured. Use Razorpay test cards or UPI test IDs.'}</p>
          </div>
        </div>
      )}
      <p className="eyebrow">Secure payment</p>
      <p className="mt-3 font-display text-4xl">{money(payment.amount)}</p>
      <p className="mt-2 text-sm text-muted">Your room is held for {holdMins} more minute{holdMins === 1 ? '' : 's'} while you complete payment.</p>
      {error && <p className="mt-5 border-l-2 border-red-600 bg-red-50 p-3 text-sm text-red-800" role="alert">{error} You can try again.</p>}
      <div className="mt-8 flex flex-col gap-3">
        {payment.provider === 'SANDBOX' ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => pay('success')}><CreditCard className="h-4 w-4" /> {busy ? 'Processing…' : 'Simulate successful payment'}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => pay('failure')}>Simulate failed payment</button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => pay()}><Lock className="h-4 w-4" /> {busy ? 'Opening secure checkout…' : `Pay ${money(payment.amount)}`}</button>
        )}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-primary" /> Payments are processed by {payment.provider === 'RAZORPAY' ? 'Razorpay' : 'a test gateway'}. We never see or store your card details.</p>
    </div>
  );
}
