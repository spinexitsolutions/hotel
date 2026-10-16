import { Router, type Request } from 'express';
import {
  addDays, contactSchema, newsletterSchema, publicBookingSettings, quoteRequestSchema, reviewSubmitSchema, stayQuerySchema, todayInZone,
  isValidISODate, diffDays, nightlyRate,
} from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError, ah, clientIp, str } from '../utils/http';
import { randomToken } from '../utils/crypto';
import { isoOf, isoOrNull } from '../utils/dates';
import { can } from '../middleware/auth';
import { formLimiter, quoteLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { getDraftConfig, getPublishedConfig } from '../services/siteConfig.service';
import { draftPage, publishedPage } from '../services/pages.service';
import { getBookingSettings } from '../services/settings.service';
import { availabilityForStay, nightlyInventory } from '../services/availability.service';
import { buildQuote, loadPricingInputs, toPricingRoomType } from '../services/quote.service';
import { getBrand, queueEmail, sendEmail, templates } from '../services/email';
import { notifyStaff } from '../services/notification.service';
import { paymentProvider } from '../services/payments';
import { findBookingForGuest } from '../services/booking.service';

export const publicRouter = Router();

const wantsPreview = (req: Request) =>
  req.query.preview === '1' && (can(req.user, 'theme.manage') || can(req.user, 'content.manage'));

// ─── Site bootstrap ──────────────────────────────────────────────────────────
publicRouter.get('/site', ah(async (req, res) => {
  const preview = wantsPreview(req);
  const [cfg, settings, mealPlans] = await Promise.all([
    preview ? getDraftConfig().then((d) => ({ config: d.config, version: d.version })) : getPublishedConfig(),
    getBookingSettings(),
    prisma.mealPlan.count({ where: { isActive: true } }),
  ]);
  res.set('Cache-Control', preview ? 'no-store' : 'public, max-age=30');
  res.json({
    config: cfg.config,
    version: cfg.version,
    preview,
    booking: publicBookingSettings(settings),
    payments: { ...paymentProvider.checkoutConfig() },
    hasMealPlans: mealPlans > 0,
    today: todayInZone(settings.timezone),
  });
}));

publicRouter.get('/pages/:slug', ah(async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const page = wantsPreview(req) ? await draftPage(slug) : await publishedPage(slug);
  if (!page) throw AppError.notFound('Page');
  res.set('Cache-Control', wantsPreview(req) ? 'no-store' : 'public, max-age=30');
  res.json(page);
}));

// ─── Rooms ───────────────────────────────────────────────────────────────────
const roomInclude = {
  images: { orderBy: { sortOrder: 'asc' } },
  amenities: { include: { amenity: true } },
  _count: { select: { bookings: true } },
} satisfies Prisma.RoomTypeInclude;

type RoomRow = Prisma.RoomTypeGetPayload<{ include: typeof roomInclude }>;

async function ratings() {
  const rows = await prisma.review.groupBy({ by: ['roomTypeId'], where: { status: 'APPROVED', roomTypeId: { not: null } }, _avg: { rating: true }, _count: true });
  return new Map(rows.map((r) => [r.roomTypeId, { rating: Math.round((r._avg.rating ?? 0) * 10) / 10, reviews: r._count }]));
}

function serializeRoom(r: RoomRow, rating?: { rating: number; reviews: number }) {
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description, category: r.category,
    basePrice: r.basePrice, weekendPrice: r.weekendPrice, baseOccupancy: r.baseOccupancy, maxAdults: r.maxAdults, maxChildren: r.maxChildren,
    maxOccupancy: r.maxOccupancy, maxExtraBeds: r.maxExtraBeds, extraAdultCharge: r.extraAdultCharge, extraChildCharge: r.extraChildCharge,
    extraBedCharge: r.extraBedCharge, bedType: r.bedType, sizeSqm: r.sizeSqm, view: r.view, minStay: r.minStay, maxStay: r.maxStay,
    isFeatured: r.isFeatured, highlights: r.highlights, seoTitle: r.seoTitle, seoDescription: r.seoDescription,
    images: r.images.map((i) => ({ url: i.url, alt: i.alt || r.name })),
    amenities: r.amenities.map((a) => ({ id: a.amenity.id, name: a.amenity.name, icon: a.amenity.icon, category: a.amenity.category })),
    popularity: r._count.bookings,
    rating: rating?.rating ?? null,
    reviewCount: rating?.reviews ?? 0,
  };
}

publicRouter.get('/rooms', ah(async (req, res) => {
  const where: Prisma.RoomTypeWhereInput = { status: 'PUBLISHED' };
  if (req.query.featured === '1') where.isFeatured = true;
  const [rows, rmap] = await Promise.all([prisma.roomType.findMany({ where, include: roomInclude, orderBy: [{ sortOrder: 'asc' }, { basePrice: 'asc' }] }), ratings()]);
  let rooms = rows.map((r) => serializeRoom(r, rmap.get(r.id)));

  // Optional stay-aware search: availability + nightly "from" price for the requested dates.
  const checkIn = str(req.query.checkIn);
  const checkOut = str(req.query.checkOut);
  if (checkIn && checkOut && isValidISODate(checkIn) && isValidISODate(checkOut) && checkOut > checkIn && diffDays(checkIn, checkOut) <= 90) {
    const stay = stayQuerySchema.parse(req.query);
    const settings = await getBookingSettings();
    const avail = await availabilityForStay(prisma, stay.checkIn, stay.checkOut, rooms.map((r) => r.id));
    const enriched = await Promise.all(rooms.map(async (r) => {
      const a = avail.get(r.id);
      const fits = stay.adults <= r.maxAdults * stay.rooms && stay.children <= r.maxChildren * stay.rooms && stay.adults + stay.children <= (r.maxOccupancy + r.maxExtraBeds) * stay.rooms;
      let stayTotal: number | null = null;
      let avgNightly: number | null = null;
      let restriction: string | null = null;
      if (fits && a && a.available >= stay.rooms) {
        try {
          const ctx = await buildQuote(prisma, { roomTypeId: r.id, ...stay, extraBeds: Math.max(0, stay.adults + stay.children - r.maxOccupancy * stay.rooms) }, settings);
          stayTotal = ctx.quote.grandTotal;
          avgNightly = ctx.quote.averageNightlyRate;
        } catch (err) {
          restriction = err instanceof AppError ? err.message : 'Not bookable for these dates';
        }
      }
      return { ...r, availability: { available: a?.available ?? 0, closed: a?.closed ?? false, fitsGuests: fits, stayTotal, avgNightly, restriction } };
    }));
    rooms = enriched;
  }

  const minPrice = Number(req.query.minPrice) || 0;
  const maxPrice = Number(req.query.maxPrice) || Infinity;
  const guests = Number(req.query.guests) || 0;
  const category = str(req.query.category);
  const amenities = str(req.query.amenities)?.split(',') ?? [];
  rooms = rooms.filter((r) => r.basePrice >= minPrice && r.basePrice <= maxPrice && (!guests || r.maxOccupancy >= guests) && (!category || r.category === category) && amenities.every((a) => r.amenities.some((x) => x.id === a)));
  const sort = str(req.query.sort);
  if (sort === 'price_asc') rooms.sort((a, b) => a.basePrice - b.basePrice);
  if (sort === 'price_desc') rooms.sort((a, b) => b.basePrice - a.basePrice);
  if (sort === 'popularity') rooms.sort((a, b) => b.popularity - a.popularity);
  if (sort === 'size') rooms.sort((a, b) => b.sizeSqm - a.sizeSqm);
  res.json({ items: rooms });
}));

publicRouter.get('/rooms/:slug', ah(async (req, res) => {
  const r = await prisma.roomType.findUnique({ where: { slug: String(req.params.slug) }, include: roomInclude });
  const staffPreview = req.query.preview === '1' && can(req.user, 'rooms.view');
  if (!r || (r.status !== 'PUBLISHED' && !staffPreview)) throw AppError.notFound('Room');
  const [rmap, reviews, similar] = await Promise.all([
    ratings(),
    prisma.review.findMany({ where: { roomTypeId: r.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.roomType.findMany({ where: { status: 'PUBLISHED', id: { not: r.id } }, include: roomInclude, orderBy: { sortOrder: 'asc' }, take: 3 }),
  ]);
  res.json({
    room: serializeRoom(r, rmap.get(r.id)),
    reviews: reviews.map((v) => ({ id: v.id, name: v.name, location: v.location, rating: v.rating, title: v.title, body: v.body, response: v.response, createdAt: v.createdAt })),
    similar: similar.map((s) => serializeRoom(s, rmap.get(s.id))),
  });
}));

publicRouter.get('/amenities', ah(async (_req, res) => {
  res.json({ items: await prisma.amenity.findMany({ orderBy: { name: 'asc' } }) });
}));

// ─── Availability & pricing ─────────────────────────────────────────────────
publicRouter.get('/availability/calendar', ah(async (req, res) => {
  const roomTypeId = str(req.query.roomTypeId);
  const settings = await getBookingSettings();
  const from = str(req.query.from) ?? todayInZone(settings.timezone);
  if (!isValidISODate(from)) throw AppError.badRequest('Invalid date.');
  const to = addDays(from, Math.min(Number(req.query.days) || 62, 120));
  const types = roomTypeId ? [roomTypeId] : (await prisma.roomType.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } })).map((t) => t.id);
  const inv = await nightlyInventory(prisma, from, to, types);
  let rates: Record<string, number> = {};
  if (roomTypeId) {
    const rt = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (rt) {
      const inputs = await loadPricingInputs(prisma, rt.id, from, to);
      rates = Object.fromEntries(inv[roomTypeId].map((n) => [n.date, nightlyRate(n.date, toPricingRoomType(rt), settings.weekendDays, inputs.rateRules, inputs.holidays).rate]));
    }
  }
  // Hotel-wide: a night is bookable if any requested type has a room.
  const nights = inv[types[0]]?.map((n, i) => ({ date: n.date, available: types.reduce((s, t) => s + (inv[t][i]?.available ?? 0), 0), rate: rates[n.date] ?? null })) ?? [];
  res.set('Cache-Control', 'no-store');
  res.json({ from, to, nights });
}));

publicRouter.post('/quote', quoteLimiter, validate(quoteRequestSchema), ah(async (req, res) => {
  const settings = await getBookingSettings();
  const ctx = await buildQuote(prisma, req.body, settings, { email: req.user?.email });
  const avail = (await availabilityForStay(prisma, req.body.checkIn, req.body.checkOut, [req.body.roomTypeId])).get(req.body.roomTypeId);
  res.json({
    quote: ctx.quote,
    availability: { available: avail?.available ?? 0, closed: avail?.closed ?? false, reason: avail?.closedReason },
    offer: ctx.offer && ctx.quote.offerDiscount > 0 ? { id: ctx.offer.id, title: ctx.offer.title } : null,
  });
}));

publicRouter.get('/booking-options', ah(async (_req, res) => {
  const [mealPlans, addOns] = await Promise.all([
    prisma.mealPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.addOn.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] }),
  ]);
  res.json({ mealPlans, addOns });
}));

// ─── Offers, reviews, gallery, FAQ, journal ─────────────────────────────────
const serializeOffer = (o: Prisma.OfferGetPayload<object>) => ({ ...o, stayStart: isoOrNull(o.stayStart), stayEnd: isoOrNull(o.stayEnd) });

publicRouter.get('/offers', ah(async (req, res) => {
  const settings = await getBookingSettings();
  const today = todayInZone(settings.timezone);
  const offers = await prisma.offer.findMany({ where: { isActive: true, ...(req.query.featured === '1' ? { isFeatured: true } : {}) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  res.json({ items: offers.filter((o) => !o.stayEnd || isoOf(o.stayEnd) >= today).map(serializeOffer) });
}));

publicRouter.get('/offers/:slug', ah(async (req, res) => {
  const o = await prisma.offer.findUnique({ where: { slug: String(req.params.slug) } });
  if (!o || !o.isActive) throw AppError.notFound('Offer');
  const rooms = await prisma.roomType.findMany({ where: { status: 'PUBLISHED', ...(o.roomTypeIds.length ? { id: { in: o.roomTypeIds } } : {}) }, select: { id: true, slug: true, name: true, basePrice: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } });
  res.json({ offer: serializeOffer(o), rooms });
}));

publicRouter.get('/reviews', ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 6, 30);
  const featured = req.query.featured === '1';
  const [items, agg] = await Promise.all([
    prisma.review.findMany({ where: { status: 'APPROVED', ...(featured ? { isFeatured: true } : {}) }, orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }], take: limit, include: { roomType: { select: { name: true } } } }),
    prisma.review.aggregate({ where: { status: 'APPROVED' }, _avg: { rating: true }, _count: true }),
  ]);
  res.json({
    items: items.map((r) => ({ id: r.id, name: r.name, location: r.location, rating: r.rating, title: r.title, body: r.body, response: r.response, source: r.source, roomType: r.roomType?.name ?? null, createdAt: r.createdAt })),
    summary: { average: Math.round((agg._avg.rating ?? 0) * 10) / 10, count: agg._count },
  });
}));

publicRouter.get('/gallery', ah(async (req, res) => {
  const category = str(req.query.category);
  const items = await prisma.galleryItem.findMany({ where: { isPublished: true, ...(category ? { category } : {}) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: Math.min(Number(req.query.limit) || 60, 120) });
  res.json({ items });
}));

publicRouter.get('/faqs', ah(async (req, res) => {
  const category = str(req.query.category);
  res.json({ items: await prisma.faq.findMany({ where: { isPublished: true, ...(category ? { category } : {}) }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] }) });
}));

publicRouter.get('/blog', ah(async (req, res) => {
  const items = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED', publishedAt: { lte: new Date() } }, orderBy: { publishedAt: 'desc' }, take: Math.min(Number(req.query.limit) || 12, 50),
    select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, category: true, tags: true, authorName: true, publishedAt: true },
  });
  res.json({ items });
}));

publicRouter.get('/blog/:slug', ah(async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { slug: String(req.params.slug) } });
  const preview = req.query.preview === '1' && can(req.user, 'content.manage');
  if (!post || (!preview && (post.status !== 'PUBLISHED' || !post.publishedAt || post.publishedAt > new Date()))) throw AppError.notFound('Article');
  const more = await prisma.blogPost.findMany({ where: { status: 'PUBLISHED', id: { not: post.id } }, orderBy: { publishedAt: 'desc' }, take: 3, select: { slug: true, title: true, coverImage: true, excerpt: true, publishedAt: true, category: true } });
  res.json({ post, more });
}));

// ─── Forms ──────────────────────────────────────────────────────────────────
publicRouter.post('/contact', formLimiter, validate(contactSchema), ah(async (req, res) => {
  const b = req.body as ReturnType<typeof contactSchema.parse>;
  if (b.website) return res.status(201).json({ ok: true }); // honeypot: pretend success
  const inquiry = await prisma.contactInquiry.create({
    data: {
      name: b.name, email: b.email, phone: b.phone ?? '', type: b.type, subject: b.subject, message: b.message,
      eventDate: b.eventDate ? new Date(`${b.eventDate}T00:00:00Z`) : null, guestCount: b.guestCount ?? null, userId: req.user?.id ?? null, ip: clientIp(req),
    },
  });
  await notifyStaff({ permission: 'inquiries.manage', type: 'inquiry', title: `New ${b.type.toLowerCase()} enquiry from ${b.name}`, body: b.subject || b.message.slice(0, 120), link: `/admin/inquiries?id=${inquiry.id}` });
  queueEmail(async () => {
    const brand = await getBrand();
    await sendEmail(b.email, 'contact.ack', templates.contactAck(brand, { name: b.name, subject: b.subject }));
    const settings = await getBookingSettings();
    for (const to of settings.notificationEmails) {
      await sendEmail(to, 'staff.inquiry', templates.staffAlert(brand, { title: `New ${b.type.toLowerCase()} enquiry`, lines: [`From: ${b.name} <${b.email}> ${b.phone ?? ''}`, b.subject, b.message], link: `${env.APP_URL}/admin/inquiries` }));
    }
  });
  res.status(201).json({ ok: true });
}));

publicRouter.post('/newsletter', formLimiter, validate(newsletterSchema), ah(async (req, res) => {
  const { email, name, source, website } = req.body as ReturnType<typeof newsletterSchema.parse>;
  if (website) return res.status(201).json({ ok: true });
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === 'SUBSCRIBED') return res.status(200).json({ ok: true, already: true });
  const sub = existing
    ? await prisma.newsletterSubscriber.update({ where: { email }, data: { status: 'SUBSCRIBED', unsubscribedAt: null } })
    : await prisma.newsletterSubscriber.create({ data: { email, name: name ?? '', source: source ?? 'website', unsubscribeToken: randomToken(24) } });
  queueEmail(async () => sendEmail(email, 'newsletter.welcome', templates.newsletterWelcome(await getBrand(), { unsubscribeUrl: `${env.APP_URL}/unsubscribe?token=${sub.unsubscribeToken}` })));
  res.status(201).json({ ok: true });
}));

publicRouter.post('/newsletter/unsubscribe', formLimiter, ah(async (req, res) => {
  const token = str(req.body?.token);
  if (!token) throw AppError.badRequest('Missing token.');
  const updated = await prisma.newsletterSubscriber.updateMany({ where: { unsubscribeToken: token }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
  if (!updated.count) throw AppError.notFound('Subscription');
  res.json({ ok: true });
}));

publicRouter.post('/reviews', formLimiter, validate(reviewSubmitSchema), ah(async (req, res) => {
  const b = req.body as ReturnType<typeof reviewSubmitSchema.parse>;
  const booking = await findBookingForGuest(b.bookingReference, { token: str(req.query.token) ?? str(req.body.token), user: req.user });
  if (booking.status !== 'CHECKED_OUT') throw AppError.conflict('Reviews can be shared after your stay.');
  const exists = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (exists) throw AppError.conflict('You have already reviewed this stay. Thank you!');
  await prisma.review.create({
    data: {
      bookingId: booking.id, userId: booking.userId, roomTypeId: booking.roomTypeId, name: `${booking.guestFirstName} ${booking.guestLastName.charAt(0)}.`,
      location: booking.guestCountry, rating: b.rating, title: b.title, body: b.body, status: 'PENDING', source: 'GUEST', stayDate: booking.checkIn,
    },
  });
  await notifyStaff({ permission: 'reviews.manage', type: 'review', title: `New ${b.rating}★ review awaiting moderation`, body: b.title, link: '/admin/reviews' });
  res.status(201).json({ ok: true, message: 'Thank you. Your review will appear once it has been approved.' });
}));
