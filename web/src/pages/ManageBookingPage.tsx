import { useState } from 'react';
import { post, errorMessage } from '@/lib/api';
import type { PublicBooking } from '@/lib/types';
import { Seo } from '@/components/site/Seo';
import { BookingView } from '@/components/site/BookingView';
import { Field, Input } from '@/components/ui/Field';

export default function ManageBookingPage() {
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ booking: PublicBooking }>('/bookings/lookup', { reference, email });
      setBooking(r.booking);
    } catch (e) {
      setError(errorMessage(e) === 'Reservation not found.' ? 'We could not find a reservation with that reference and email.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tone-surface min-h-screen py-16">
      <Seo title="Manage booking" noIndex />
      <div className="container-luxe">
        {booking ? <BookingView booking={booking} token={null} onChange={lookup} /> : (
          <div className="mx-auto max-w-lg">
            <p className="eyebrow text-center">Your reservation</p>
            <h1 className="h-section mt-4 text-center">Manage your booking</h1>
            <form className="card-luxe mt-10 space-y-5 p-8" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
              <Field label="Booking reference" hint="e.g. AUR-7K2M9Q">{(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} required autoComplete="off" />}</Field>
              <Field label="Email used to book">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />}</Field>
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Searching…' : 'Find my booking'}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
