import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AppError, ah } from '../utils/http';
import { requireAuth } from '../middleware/auth';
import { bookingInclude, serializeBookingPublic } from '../services/booking.service';
import { getBookingSettings } from '../services/settings.service';

export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.get('/profile', ah(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, country: u.country, marketingOptIn: u.marketingOptIn, createdAt: u.createdAt } });
}));

accountRouter.get('/bookings', ah(async (req, res) => {
  const settings = await getBookingSettings();
  const rows = await prisma.booking.findMany({
    where: { OR: [{ userId: req.user!.id }, { guestEmail: req.user!.email }], status: { not: 'EXPIRED' } },
    include: bookingInclude, orderBy: { checkIn: 'desc' }, take: 100,
  });
  res.json({ items: rows.map((b) => serializeBookingPublic(b, settings)) });
}));

accountRouter.get('/wishlist', ah(async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.user!.id, roomType: { status: 'PUBLISHED' } },
    include: { roomType: { select: { id: true, slug: true, name: true, tagline: true, basePrice: true, sizeSqm: true, maxOccupancy: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: items.map((i) => ({ ...i.roomType, image: i.roomType.images[0]?.url ?? '' })) });
}));

accountRouter.post('/wishlist/:roomTypeId', ah(async (req, res) => {
  const rt = await prisma.roomType.findUnique({ where: { id: String(req.params.roomTypeId) } });
  if (!rt || rt.status !== 'PUBLISHED') throw AppError.notFound('Room');
  await prisma.wishlistItem.upsert({ where: { userId_roomTypeId: { userId: req.user!.id, roomTypeId: rt.id } }, create: { userId: req.user!.id, roomTypeId: rt.id }, update: {} });
  res.status(201).json({ ok: true });
}));

accountRouter.delete('/wishlist/:roomTypeId', ah(async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.id, roomTypeId: String(req.params.roomTypeId) } });
  res.json({ ok: true });
}));
