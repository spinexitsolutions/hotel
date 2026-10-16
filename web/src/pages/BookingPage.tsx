import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, ApiError } from '@/lib/api';
import type { PublicBooking } from '@/lib/types';
import { recallBookingToken, rememberBookingToken } from '@/lib/payment';
import { Seo } from '@/components/site/Seo';
import { BookingView } from '@/components/site/BookingView';
import { ErrorState, PageLoader } from '@/components/ui/States';

export default function BookingPage() {
  const { reference = '' } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? recallBookingToken(reference);
  useEffect(() => { if (sp.get('token')) rememberBookingToken(reference, sp.get('token')!); }, [sp, reference]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['booking', reference, token],
    queryFn: () => get<{ booking: PublicBooking }>(`/bookings/${reference}`, token ? { token } : undefined),
  });
  return (
    <div className="tone-surface min-h-screen py-16">
      <Seo title={`Reservation ${reference}`} noIndex />
      <div className="container-luxe">
        {isLoading ? <PageLoader /> : error instanceof ApiError && error.status === 404 ? (
          <div className="mx-auto max-w-lg py-16 text-center">
            <h1 className="h-section">Reservation not found</h1>
            <p className="mt-4 text-muted">Use the link in your confirmation email, or look up your booking with its reference and your email address.</p>
            <Link to="/manage-booking" className="btn btn-primary mt-8">Find my booking</Link>
          </div>
        ) : error || !data ? <ErrorState onRetry={() => refetch()} /> : (
          <BookingView booking={data.booking} token={token} fresh={sp.get('new') === '1'} onChange={() => refetch()} />
        )}
      </div>
    </div>
  );
}
