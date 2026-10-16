import { Router, type Request } from 'express';
import { bookingLookupSchema, cancelBookingSchema, createBookingSchema } from '@aurelle/shared';
import { ah, str } from '../utils/http';
import { bookingLimiter, formLimiter, paymentLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { cancelBooking, createBooking, findBookingForGuest, serializeBookingPublic } from '../services/booking.service';
import { startPayment } from '../services/payment.service';
import { getBookingSettings } from '../services/settings.service';

export const bookingsRouter = Router();

const guestAuth = (req: Request) => ({ token: str(req.query.token) ?? str(req.get('x-booking-token')), user: req.user });

bookingsRouter.post('/', bookingLimiter, validate(createBookingSchema), ah(async (req, res) => {
  const { booking, manageToken } = await createBooking(req.body, { user: req.user && !req.user.isStaff ? req.user : undefined, source: 'WEBSITE', req });
  const settings = await getBookingSettings();
  const payment = booking.status === 'PENDING_PAYMENT' ? await startPayment(booking.reference).catch(() => null) : null;
  res.status(201).json({ booking: serializeBookingPublic(booking, settings), manageToken, payment });
}));

bookingsRouter.post('/lookup', formLimiter, validate(bookingLookupSchema), ah(async (req, res) => {
  const b = await findBookingForGuest(req.body.reference, { email: req.body.email, user: req.user });
  res.json({ booking: serializeBookingPublic(b, await getBookingSettings()) });
}));

bookingsRouter.get('/:reference', ah(async (req, res) => {
  const b = await findBookingForGuest(String(req.params.reference), guestAuth(req));
  res.set('Cache-Control', 'no-store');
  res.json({ booking: serializeBookingPublic(b, await getBookingSettings()) });
}));

bookingsRouter.post('/:reference/pay', paymentLimiter, ah(async (req, res) => {
  const b = await findBookingForGuest(String(req.params.reference), guestAuth(req));
  res.json({ payment: await startPayment(b.reference) });
}));

bookingsRouter.post('/:reference/cancel', formLimiter, validate(cancelBookingSchema), ah(async (req, res) => {
  const b = await findBookingForGuest(String(req.params.reference), guestAuth(req));
  const result = await cancelBooking(b.id, { by: 'GUEST', reason: req.body.reason || 'Cancelled by guest' });
  const fresh = await findBookingForGuest(b.reference, { user: req.user, email: b.guestEmail });
  res.json({ booking: serializeBookingPublic(fresh, await getBookingSettings()), outcome: result.outcome });
}));
