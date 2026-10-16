/**
 * Demo data for The Aurelle. DESTRUCTIVE: wipes all tables first.
 *   npm run db:seed
 * Refuses to run when NODE_ENV=production unless SEED_ALLOW_PRODUCTION=yes.
 * Staff demo password comes from SEED_STAFF_PASSWORD (a development default is used otherwise).
 */
import {
  DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABELS, addDays, calculateQuote, defaultBookingSettings, defaultSiteConfig,
  makeBookingReference, todayInZone, type Quote,
} from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { hashPassword } from '../services/auth.service';
import { DEFAULT_PAGES } from '../content/pages';
import { IMG } from '../content/images';
import { randomToken, sha256 } from '../utils/crypto';
import { loadPricingInputs, toPricingRoomType } from '../services/quote.service';
import { dbDate } from '../utils/dates';

const R = (rupees: number) => rupees * 100; // to paise

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'yes') throw new Error('Refusing to wipe a production database. Set SEED_ALLOW_PRODUCTION=yes if you really mean it.');
  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? 'Aurelle-Demo-2026';
  console.log('🧹 wiping database…');
  await wipe();

  // ─── Roles & users ───────────────────────────────────────────────────────
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) {
    const r = await prisma.role.create({ data: { key, name: ROLE_LABELS[key], permissions: DEFAULT_ROLE_PERMISSIONS[key], description: '' } });
    roles[key] = r.id;
  }
  const pw = await hashPassword(staffPassword);
  const staff = [
    { email: 'admin@theaurelle.example', name: 'Aditi Rathore', role: 'SUPER_ADMIN' },
    { email: 'manager@theaurelle.example', name: 'Vikram Singh', role: 'HOTEL_MANAGER' },
    { email: 'reservations@theaurelle.example', name: 'Meera Joshi', role: 'BOOKING_MANAGER' },
    { email: 'frontdesk@theaurelle.example', name: 'Rohan Mehta', role: 'RECEPTIONIST' },
    { email: 'editor@theaurelle.example', name: 'Isha Kapoor', role: 'CONTENT_EDITOR' },
  ];
  for (const s of staff) await prisma.user.create({ data: { email: s.email, name: s.name, roleId: roles[s.role], passwordHash: pw } });

  const customerPw = await hashPassword('Guest-Demo-2026');
  const customers = await Promise.all([
    ['Ananya Sharma', 'ananya.sharma@example.com', '+91 98200 11223', 'India'],
    ['James Whitfield', 'james.whitfield@example.co.uk', '+44 7700 900123', 'United Kingdom'],
    ['Priya Nair', 'priya.nair@example.com', '+91 99870 44556', 'India'],
    ['Sofia Rossi', 'sofia.rossi@example.it', '+39 320 555 0199', 'Italy'],
    ['Arjun Malhotra', 'arjun.malhotra@example.com', '+91 98111 22334', 'India'],
    ['Emily Chen', 'emily.chen@example.com', '+1 415 555 0142', 'United States'],
  ].map(([name, email, phone, country], i) => prisma.user.create({ data: { name, email, phone, country, roleId: roles.CUSTOMER, passwordHash: customerPw, marketingOptIn: i % 2 === 0, createdAt: new Date(Date.now() - (60 - i * 8) * 86_400_000) } })));

  // ─── Settings & site config ──────────────────────────────────────────────
  const settings = { ...defaultBookingSettings(), notificationEmails: ['reservations@theaurelle.example'] };
  await prisma.setting.create({ data: { key: 'booking', value: settings } });
  const config = defaultSiteConfig();
  await prisma.siteConfig.createMany({ data: [{ status: 'PUBLISHED', version: 1, data: config as unknown as Prisma.InputJsonValue, publishedAt: new Date() }, { status: 'DRAFT', version: 1, data: config as unknown as Prisma.InputJsonValue }] });

  for (const p of DEFAULT_PAGES) {
    const content = { sections: p.sections.map((s) => ({ ...s, enabled: s.enabled ?? true })), seo: p.seo } as Prisma.InputJsonValue;
    await prisma.page.create({ data: { slug: p.slug, title: p.title, kind: p.kind, isSystem: p.isSystem, status: 'PUBLISHED', draft: content, published: content, hasUnpublishedChanges: false, publishedAt: new Date() } });
  }

  // ─── Amenities ───────────────────────────────────────────────────────────
  const amenityDefs: [string, string, string][] = [
    ['Lake view', 'waves', 'View'], ['Private balcony', 'sun', 'Room'], ['Private plunge pool', 'waves', 'Room'], ['Butler service', 'concierge', 'Service'],
    ['King bed', 'bed', 'Room'], ['Marble bathroom', 'bath', 'Bathroom'], ['Soaking tub', 'bath', 'Bathroom'], ['Rain shower', 'bath', 'Bathroom'],
    ['High-speed Wi-Fi', 'wifi', 'Technology'], ['Smart TV', 'star', 'Technology'], ['Espresso machine', 'coffee', 'Room'], ['Minibar', 'wine', 'Room'],
    ['Separate living room', 'gem', 'Room'], ['Private garden', 'leaf', 'Room'], ['Dining room', 'utensils', 'Room'], ['24h in-room dining', 'utensils', 'Service'],
  ];
  const amenity: Record<string, string> = {};
  for (const [name, icon, category] of amenityDefs) amenity[name] = (await prisma.amenity.create({ data: { name, icon, category } })).id;
  const am = (...names: string[]) => names.map((n) => ({ amenityId: amenity[n] }));
  const common = ['High-speed Wi-Fi', 'Smart TV', 'Espresso machine', 'Minibar', 'Marble bathroom', 'Rain shower', '24h in-room dining'];

  // ─── Room types & physical rooms ─────────────────────────────────────────
  const roomTypes = [
    { slug: 'heritage-courtyard-room', name: 'Heritage Courtyard Room', tagline: 'Jharokha windows over a fountain courtyard', category: 'ROOM', basePrice: R(15500), weekendPrice: R(17500), baseOccupancy: 2, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, maxExtraBeds: 1, extraAdultCharge: R(3500), extraChildCharge: R(1500), extraBedCharge: R(3500), bedType: 'King or twin', sizeSqm: 38, view: 'Courtyard', minStay: 1, maxStay: 30, isFeatured: false, sortOrder: 1, count: 20, floorPrefix: 1,
      description: 'Our most intimate rooms open onto the palace’s inner courtyards, where fountains play beneath carved balconies. Hand-painted walls, a king bed dressed in block-printed linen and a marble bathroom make for a serene retreat after a day in the old city.',
      highlights: ['Carved jharokha window seat', 'Hand-block-printed linen', 'Courtyard fountain views'],
      images: [[IMG.roomClassic, 'Heritage room with king bed and carved details'], [IMG.roomWarm, 'Warm-lit heritage room'], [IMG.bathroomStone, 'Stone and marble bathroom']],
      amenities: [...common, 'King bed'] },
    { slug: 'lake-view-deluxe-room', name: 'Lake View Deluxe Room', tagline: 'Wake to the lake from your bed', category: 'ROOM', basePrice: R(19500), weekendPrice: R(22500), baseOccupancy: 2, maxAdults: 3, maxChildren: 1, maxOccupancy: 3, maxExtraBeds: 1, extraAdultCharge: R(4000), extraChildCharge: R(1500), extraBedCharge: R(4000), bedType: 'King', sizeSqm: 45, view: 'Lake Pichola', minStay: 1, maxStay: 30, isFeatured: true, sortOrder: 2, count: 18, floorPrefix: 2,
      description: 'Floor-to-ceiling arched windows frame Lake Pichola and the City Palace beyond. A window seat for morning chai, a deep soaking tub, and the gentle sound of the water make these our most requested rooms.',
      highlights: ['Uninterrupted lake views', 'Window seat for two', 'Deep soaking tub'],
      images: [[IMG.roomView, 'Deluxe room with large windows and lake view'], [IMG.roomBright, 'Bright deluxe bedroom'], [IMG.bathroomTub, 'Soaking tub in a marble bathroom']],
      amenities: [...common, 'Lake view', 'King bed', 'Soaking tub'] },
    { slug: 'palace-junior-suite', name: 'Palace Junior Suite', tagline: 'Space to unwind, with a private balcony', category: 'SUITE', basePrice: R(32000), weekendPrice: R(36000), baseOccupancy: 2, maxAdults: 3, maxChildren: 2, maxOccupancy: 4, maxExtraBeds: 1, extraAdultCharge: R(5000), extraChildCharge: R(2000), extraBedCharge: R(5000), bedType: 'King', sizeSqm: 68, view: 'Lake & gardens', minStay: 1, maxStay: 30, isFeatured: true, sortOrder: 3, count: 12, floorPrefix: 3,
      description: 'A generous suite with a sitting area, writing desk and a private balcony above the gardens. Mirror-work ceilings and antique Mewar miniatures sit alongside every modern comfort.',
      highlights: ['Private balcony', 'Sitting area', 'Butler on call'],
      images: [[IMG.suiteBedroom, 'Junior suite bedroom with soft linen'], [IMG.interiorLounge, 'Suite sitting area'], [IMG.bathroomMarble, 'Marble bathroom with double vanity']],
      amenities: [...common, 'Lake view', 'Private balcony', 'King bed', 'Soaking tub', 'Butler service'] },
    { slug: 'lake-palace-suite', name: 'Lake Palace Suite', tagline: 'Our signature suite, suspended over the water', category: 'SUITE', basePrice: R(68000), weekendPrice: R(76000), baseOccupancy: 2, maxAdults: 4, maxChildren: 2, maxOccupancy: 4, maxExtraBeds: 1, extraAdultCharge: R(7500), extraChildCharge: R(3000), extraBedCharge: R(7500), bedType: 'Super king', sizeSqm: 120, view: 'Panoramic lake', minStay: 2, maxStay: 30, isFeatured: true, sortOrder: 4, count: 7, floorPrefix: 4,
      description: 'Occupying a corner of the palace with water on three sides, the Lake Palace Suite has a separate living room, a dining alcove and a bathroom with a freestanding tub facing the lake. A dedicated butler attends from arrival to departure.',
      highlights: ['Water on three sides', 'Separate living & dining', 'Dedicated butler'],
      images: [[IMG.suiteLiving, 'Lake Palace Suite living room'], [IMG.roomKing, 'Super king bed in the suite'], [IMG.bathroomTub, 'Freestanding tub facing the lake'], [IMG.interiorLounge, 'Suite lounge']],
      amenities: [...common, 'Lake view', 'Private balcony', 'King bed', 'Soaking tub', 'Butler service', 'Separate living room', 'Dining room'] },
    { slug: 'royal-pool-villa', name: 'Royal Pool Villa', tagline: 'A private walled garden with your own pool', category: 'VILLA', basePrice: R(125000), weekendPrice: R(140000), baseOccupancy: 2, maxAdults: 4, maxChildren: 2, maxOccupancy: 5, maxExtraBeds: 1, extraAdultCharge: R(10000), extraChildCharge: R(4000), extraBedCharge: R(10000), bedType: 'Super king', sizeSqm: 260, view: 'Private garden & lake', minStay: 2, maxStay: 30, isFeatured: true, sortOrder: 5, count: 4, floorPrefix: 9,
      description: 'Hidden behind sandstone walls at the water’s edge, each villa has its own heated pool, a pavilion for outdoor dining and a garden of jasmine and frangipani. Two bedrooms, butler service and private boat transfers are included.',
      highlights: ['Private heated pool', 'Two bedrooms', 'Private boat transfers included'],
      images: [[IMG.privatePoolVilla, 'Private pool villa at dusk'], [IMG.villaPoolModern, 'Villa pool and terrace'], [IMG.bedroomSerene, 'Villa master bedroom'], [IMG.bathroomMarble, 'Villa bathroom']],
      amenities: [...common, 'Lake view', 'Private plunge pool', 'Private garden', 'King bed', 'Soaking tub', 'Butler service', 'Separate living room', 'Dining room'] },
    { slug: 'maharana-presidential-suite', name: 'Maharana Presidential Suite', tagline: 'The former royal apartments', category: 'PENTHOUSE', basePrice: R(240000), weekendPrice: null, baseOccupancy: 2, maxAdults: 6, maxChildren: 3, maxOccupancy: 6, maxExtraBeds: 1, extraAdultCharge: R(12000), extraChildCharge: R(5000), extraBedCharge: R(12000), bedType: 'Super king + 2 kings', sizeSqm: 420, view: '360° lake & city', minStay: 2, maxStay: 30, isFeatured: false, sortOrder: 6, count: 1, floorPrefix: 5,
      description: 'Once the apartments of the Maharana himself, this three-bedroom suite spans the palace’s top floor with a private rooftop terrace, a durbar hall for entertaining and original frescoes restored over four years.',
      highlights: ['Three bedrooms', 'Private rooftop terrace', 'Original royal frescoes'],
      images: [[IMG.interiorLounge, 'Presidential suite durbar hall'], [IMG.suiteBedroom, 'Presidential master bedroom'], [IMG.bathroomMarble, 'Presidential marble bathroom']],
      amenities: [...common, 'Lake view', 'Private balcony', 'King bed', 'Soaking tub', 'Butler service', 'Separate living room', 'Dining room'] },
  ];
  const typeIds: Record<string, string> = {};
  for (const rt of roomTypes) {
    const { count, floorPrefix, images, amenities, ...data } = rt;
    const created = await prisma.roomType.create({
      data: {
        ...data, status: 'PUBLISHED', seoTitle: '', seoDescription: data.tagline,
        images: { create: images.map(([url, alt], i) => ({ url, alt, sortOrder: i })) },
        amenities: { create: am(...amenities) },
      },
    });
    typeIds[rt.slug] = created.id;
    for (let i = 1; i <= count; i++) {
      await prisma.room.create({ data: { number: `${floorPrefix}${String(i).padStart(2, '0')}`, floor: String(floorPrefix), roomTypeId: created.id, housekeeping: i % 5 === 0 ? 'DIRTY' : 'CLEAN' } });
    }
  }
  // One room out of service for realism.
  await prisma.room.update({ where: { number: '120' }, data: { status: 'OUT_OF_SERVICE', notes: 'Bathroom renovation' } });

  // ─── Pricing ─────────────────────────────────────────────────────────────
  const year = Number(todayInZone().slice(0, 4));
  await prisma.rateRule.createMany({
    data: [
      { name: 'Festive peak', startDate: dbDate(`${year}-12-20`), endDate: dbDate(`${year + 1}-01-05`), kind: 'PERCENT', value: 3500, daysOfWeek: [], priority: 30 },
      { name: 'Winter high season', startDate: dbDate(`${year}-10-01`), endDate: dbDate(`${year + 1}-03-31`), kind: 'PERCENT', value: 1500, daysOfWeek: [], priority: 10 },
      { name: 'Monsoon season', startDate: dbDate(`${year + 1}-07-01`), endDate: dbDate(`${year + 1}-09-15`), kind: 'PERCENT', value: -2000, daysOfWeek: [], priority: 10 },
      { name: 'Villa winter rate', roomTypeId: typeIds['royal-pool-villa'], startDate: dbDate(`${year}-11-01`), endDate: dbDate(`${year + 1}-02-28`), kind: 'OVERRIDE', value: R(135000), daysOfWeek: [], priority: 20 },
    ],
  });
  await prisma.holiday.createMany({
    data: [
      { date: dbDate(`${year}-11-08`), name: 'Diwali', upliftBps: 2500 },
      { date: dbDate(`${year}-12-24`), name: 'Christmas Eve', upliftBps: 1500 },
      { date: dbDate(`${year}-12-31`), name: "New Year's Eve", upliftBps: 4000 },
      { date: dbDate(`${year + 1}-03-22`), name: 'Holi', upliftBps: 2000 },
    ],
    skipDuplicates: true,
  });
  await prisma.mealPlan.createMany({
    data: [
      { code: 'EP', name: 'Room only', description: 'Room without meals.', pricePerAdult: 0, pricePerChild: 0, sortOrder: 0 },
      { code: 'CP', name: 'Bed & breakfast', description: 'À la carte breakfast at Jharokha Terrace.', pricePerAdult: R(1800), pricePerChild: R(900), sortOrder: 1 },
      { code: 'MAP', name: 'Breakfast & dinner', description: 'Breakfast daily and a three-course dinner at Darbar or Jharokha.', pricePerAdult: R(4800), pricePerChild: R(2400), sortOrder: 2 },
      { code: 'AP', name: 'All meals', description: 'Breakfast, lunch and dinner at any of our restaurants.', pricePerAdult: R(7200), pricePerChild: R(3600), sortOrder: 3 },
    ],
  });
  await prisma.addOn.createMany({
    data: [
      { name: 'Airport transfer (luxury sedan)', description: 'Chauffeured transfer from Maharana Pratap Airport, each way.', category: 'TRANSFER', pricingType: 'PER_STAY', price: R(4500), maxQuantity: 2, sortOrder: 1, image: IMG.landscape },
      { name: 'Heritage boat arrival', description: 'Arrive at the palace by private heritage boat with welcome drinks.', category: 'TRANSFER', pricingType: 'PER_STAY', price: R(6000), maxQuantity: 1, sortOrder: 2, image: IMG.overwaterVillas },
      { name: 'Romantic turndown', description: 'Rose petals, candles, champagne and handmade chocolates.', category: 'CELEBRATION', pricingType: 'PER_STAY', price: R(8500), maxQuantity: 1, sortOrder: 3, image: IMG.wine },
      { name: 'Celebration cake', description: 'A cake from our pastry chef, with a personalised message.', category: 'CELEBRATION', pricingType: 'PER_STAY', price: R(3500), maxQuantity: 2, sortOrder: 4, image: IMG.plated },
      { name: 'Sunset boat cruise', description: 'One-hour cruise on Lake Pichola at sunset.', category: 'EXPERIENCE', pricingType: 'PER_GUEST', price: R(3000), maxQuantity: 1, sortOrder: 5, image: IMG.landscape },
      { name: 'Couple’s spa ritual (90 min)', description: 'Abhyanga massage for two in a couples suite.', category: 'SPA', pricingType: 'PER_STAY', price: R(17000), maxQuantity: 2, sortOrder: 6, image: IMG.spaMassage },
      { name: 'Guaranteed early check-in', description: 'Your room ready from 9 am on arrival day.', category: 'OTHER', pricingType: 'PER_STAY', price: R(7500), maxQuantity: 1, sortOrder: 7, image: '' },
      { name: 'Guaranteed late check-out', description: 'Keep your room until 6 pm on departure day.', category: 'OTHER', pricingType: 'PER_STAY', price: R(7500), maxQuantity: 1, sortOrder: 8, image: '' },
    ],
  });
  await prisma.chargeRule.createMany({
    data: [
      { name: 'GST on accommodation', kind: 'TAX', calculation: 'PERCENT', value: 500, appliesTo: 'ROOM', minNightlyRate: null, maxNightlyRate: R(7500), sortOrder: 1 },
      { name: 'GST on accommodation', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'ROOM', minNightlyRate: R(7500) + 1, maxNightlyRate: null, sortOrder: 2 },
      { name: 'GST on services & dining', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'EXTRAS', sortOrder: 3 },
    ],
  });
  await prisma.offer.createMany({
    data: [
      { slug: 'monsoon-escape', title: 'Monsoon Escape', subtitle: 'Stay three nights, pay for two', description: 'When the rains turn the Aravallis emerald, the palace is at its most romantic. Stay three nights or more and enjoy a third off your room rate, plus a complimentary 60-minute spa ritual for two.', image: IMG.landscape, discountType: 'PERCENT', value: 3333, minNights: 3, roomTypeIds: [], stayStart: dbDate(`${year + 1}-06-15`), stayEnd: dbDate(`${year + 1}-09-30`), inclusions: ['One night complimentary for every three', '60-minute spa ritual for two', 'Daily breakfast'], terms: 'Valid for stays 15 June – 30 September. Subject to availability. Not combinable with other offers.', isFeatured: true, sortOrder: 1 },
      { slug: 'honeymoon-at-the-palace', title: 'Honeymoon at the Palace', subtitle: 'Romance, beautifully arranged', description: 'Begin your life together with a sunset boat ride, a candlelit dinner on the jetty and a romantic turndown. 15% off suites and villas for stays of two nights or more.', image: IMG.privatePoolVilla, discountType: 'PERCENT', value: 1500, minNights: 2, roomTypeIds: [typeIds['palace-junior-suite'], typeIds['lake-palace-suite'], typeIds['royal-pool-villa']], inclusions: ['15% off the best available rate', 'Sunset boat cruise', 'Candlelit jetty dinner (one evening)', 'Romantic turndown'], terms: 'Proof of marriage within 6 months may be requested.', isFeatured: true, sortOrder: 2 },
      { slug: 'stay-longer', title: 'Stay Longer', subtitle: '20% off five nights or more', description: 'Slow down and settle in. Stay five nights or more and save 20% on your room, with a complimentary airport transfer.', image: IMG.poolLoungers, discountType: 'PERCENT', value: 2000, minNights: 5, roomTypeIds: [], inclusions: ['20% off the best available rate', 'Complimentary one-way airport transfer', 'Daily breakfast'], terms: 'Minimum five consecutive nights.', isFeatured: true, sortOrder: 3 },
      { slug: 'royal-wedding-package', title: 'Royal Wedding Package', subtitle: 'Celebrations for 100 to 600 guests', description: 'Exclusive use of the palace, a dedicated wedding planner, bespoke décor and menus. Contact our wedding specialists for a tailored proposal.', image: IMG.weddingVenue, discountType: 'NONE', value: 0, minNights: 1, roomTypeIds: [], inclusions: ['Dedicated wedding planner', 'Bridal suite upgrade', 'Mehendi & sangeet venues'], terms: 'Quoted on request.', isFeatured: false, sortOrder: 4 },
    ],
  });
  const now = new Date();
  await prisma.coupon.createMany({
    data: [
      { code: 'WELCOME10', description: '10% off your first stay booked direct', discountType: 'PERCENT', value: 1000, maxDiscount: R(15000), usageLimit: 500, perCustomerLimit: 1, roomTypeIds: [] },
      { code: 'PALACE5000', description: '₹5,000 off stays above ₹50,000', discountType: 'FIXED', value: R(5000), minSubtotal: R(50000), usageLimit: 100, roomTypeIds: [] },
      { code: 'SUMMER25', description: 'Expired summer campaign', discountType: 'PERCENT', value: 2500, endsAt: new Date(now.getTime() - 30 * 86_400_000), roomTypeIds: [], isActive: true },
    ],
  });

  // ─── Reviews, FAQs, gallery, journal ─────────────────────────────────────
  const reviews: [string, string, number, string, string, string | null][] = [
    ['Charlotte & Ben', 'London, UK', 5, 'The most magical week of our lives', 'From the boat that met us at the ghat to the farewell garland, every detail was considered. Our butler Mahesh remembered how we took our tea by the second morning.', 'lake-palace-suite'],
    ['Rahul K.', 'Mumbai, India', 5, 'Royal hospitality, quietly delivered', 'The Darbar tasting menu was the best meal we had in Rajasthan. The spa’s abhyanga is worth the trip alone.', 'palace-junior-suite'],
    ['Hannah M.', 'Sydney, Australia', 5, 'Our private pool villa was a dream', 'Waking up, swimming in our own pool with the City Palace across the water — we didn’t want to leave the villa, and didn’t have to.', 'royal-pool-villa'],
    ['Marco & Giulia', 'Milan, Italy', 5, 'Una favola', 'We celebrated our anniversary with dinner on the jetty. Lanterns, a sitar player and the moon on the lake. Unforgettable.', null],
    ['Neha S.', 'Bengaluru, India', 4, 'Beautiful palace, warm team', 'The lake view room was stunning and immaculate. Breakfast on the terrace was a highlight. Only wish we had stayed longer!', 'lake-view-deluxe-room'],
    ['David L.', 'New York, USA', 5, 'Better than the photographs', 'Impeccable service from the moment of booking. The concierge arranged a vintage car drive to Kumbhalgarh that we will talk about for years.', null],
    ['Condé Nast Traveller', 'Press', 5, '“The lake palace reborn”', 'A masterclass in restoration, where heritage is not a theme but a way of life.', null],
  ];
  for (const [name, location, rating, title, body, slug] of reviews) {
    await prisma.review.create({ data: { name, location, rating, title, body, roomTypeId: slug ? typeIds[slug] : null, status: 'APPROVED', isFeatured: true, source: location === 'Press' ? 'PRESS' : 'GUEST', response: rating === 4 ? 'Thank you, Neha — we hope to welcome you back for a longer stay soon.' : '' } });
  }
  await prisma.review.create({ data: { name: 'Tom R.', location: 'Berlin', rating: 3, title: 'Lovely but the pool was busy', body: 'Wonderful setting, though the pool was crowded during the afternoon. Staff were very helpful.', status: 'PENDING', source: 'GUEST' } });

  await prisma.faq.createMany({
    data: [
      ['Reservations', 'What are the check-in and check-out times?', 'Check-in is from 2:00 pm and check-out is by 11:00 am. Early check-in and late check-out can be guaranteed for a fee when booking, or requested free of charge subject to availability.'],
      ['Reservations', 'Can I modify my reservation?', 'Yes. Please contact our reservations team with your booking reference. Changes are subject to availability and the rates on the new dates.'],
      ['Reservations', 'What is your cancellation policy?', 'Standard rates can be cancelled free of charge up to 3 days before arrival. Later cancellations are charged one night. Some offers have different terms, which are shown before you book.'],
      ['Payments', 'Which payment methods do you accept?', 'Online we accept cards, UPI, net banking and wallets through Razorpay. At the hotel we accept all major cards, UPI and cash. Some rates allow you to pay at the hotel.'],
      ['Payments', 'Are taxes included in the price?', 'Prices are shown per night before taxes. The booking summary shows GST and any fees separately before you pay, and the total you see is the total you pay.'],
      ['Payments', 'Is my payment secure?', 'Payments are processed by Razorpay, a PCI-DSS compliant gateway. We never see or store your card number or CVV.'],
      ['Arrival', 'How do I reach the hotel from the airport?', 'Maharana Pratap Airport (UDR) is 40 minutes away. We offer luxury car transfers and a heritage boat arrival, which you can add when booking.'],
      ['Arrival', 'What documents do I need at check-in?', 'A valid government photo ID for every adult guest. International guests must present a passport and valid visa, as required by Indian law.'],
      ['Facilities', 'Is the pool heated?', 'Yes, the Lake Pool is heated to around 28°C year-round and open from 6 am to 10 pm.'],
      ['Facilities', 'Do you welcome children?', 'Children of all ages are welcome. Children aged 11 and under stay free using existing bedding, and our Little Royals club runs daily activities.'],
      ['Facilities', 'Are pets allowed?', 'We are unable to accommodate pets, with the exception of assistance animals.'],
      ['Dining', 'Do you cater to dietary requirements?', 'Absolutely. Our chefs prepare vegetarian, vegan, Jain, gluten-free and allergy-aware dishes. Please share requirements when booking.'],
    ].map(([category, question, answer], i) => ({ category, question, answer, sortOrder: i })),
  });

  const gallery: [string, string, string][] = [
    [IMG.exteriorDusk, 'The palace illuminated at dusk', 'HOTEL'], [IMG.infinityPool, 'The Lake Pool at sunset', 'POOL'], [IMG.suiteLiving, 'Lake Palace Suite living room', 'ROOMS'],
    [IMG.fineDining, 'Darbar dining hall', 'DINING'], [IMG.spaRitual, 'A treatment suite prepared for a ritual', 'SPA'], [IMG.weddingVenue, 'Courtyard dressed for a wedding', 'EVENTS'],
    [IMG.privatePoolVilla, 'Royal Pool Villa', 'ROOMS'], [IMG.cocktails, 'Cocktails at Sky Bar', 'DINING'], [IMG.lobby, 'The grand lobby', 'HOTEL'],
    [IMG.bathroomTub, 'Freestanding tub with a view', 'ROOMS'], [IMG.spaStones, 'Hot stone therapy', 'SPA'], [IMG.weddingTables, 'Reception tables on the lawns', 'EVENTS'],
    [IMG.poolLoungers, 'Poolside cabanas', 'POOL'], [IMG.landscape, 'Morning mist over the lake', 'DESTINATION'], [IMG.palaceIndia, 'Palaces of Rajasthan', 'DESTINATION'],
    [IMG.terraceDining, 'Breakfast on Jharokha Terrace', 'DINING'],
  ];
  await prisma.galleryItem.createMany({ data: gallery.map(([url, alt, category], i) => ({ url, alt, category, sortOrder: i })) });

  await prisma.blogPost.createMany({
    data: [
      { slug: 'a-perfect-48-hours-in-udaipur', title: 'A perfect 48 hours in Udaipur', excerpt: 'Palaces at dawn, puppets at dusk and the best lassi in the old city — our concierge’s itinerary.', coverImage: IMG.palaceIndia, category: 'Travel guide', tags: ['Udaipur', 'Itinerary'], authorName: 'Kabir, Head Concierge', status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 20 * 86_400_000),
        body: '## Day one\n\n**Sunrise:** Take a private boat across Lake Pichola as the city wakes. Ask your boatman to pause by Jag Mandir.\n\n**Morning:** Explore the City Palace before the crowds arrive — don’t miss the Mor Chowk peacock mosaics.\n\n**Evening:** Dharohar folk dance at Bagore Ki Haveli, then dinner on our jetty.\n\n## Day two\n\nDrive into the Aravalli hills for Kumbhalgarh fort, returning in time for sunset cocktails at Sky Bar.' },
      { slug: 'recipes-from-the-royal-kitchen-laal-maas', title: 'Recipes from the royal kitchen: laal maas', excerpt: 'Our executive chef shares the court recipe for Rajasthan’s fiery signature curry.', coverImage: IMG.plated, category: 'Food & drink', tags: ['Recipe', 'Dining'], authorName: 'Chef Devendra Singh', status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 9 * 86_400_000),
        body: 'Laal maas was once a hunting dish of the Rajput court. The secret is Mathania chillies and patience.\n\n## Ingredients\n- 1 kg mutton on the bone\n- 20 dried Mathania chillies\n- 250 g yoghurt\n- 6 tbsp ghee\n\n## Method\nSoak the chillies, blend to a paste, and cook slowly with the meat for at least two hours.' },
      { slug: 'the-art-of-abhyanga', title: 'The art of abhyanga', excerpt: 'Why a warm-oil massage is the cornerstone of Ayurvedic self-care.', coverImage: IMG.spaRitual, category: 'Wellness', tags: ['Spa', 'Ayurveda'], authorName: 'Dr. Lakshmi Iyer, Spa Physician', status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 3 * 86_400_000),
        body: 'Abhyanga — the rhythmic application of warm herbal oil — calms the nervous system, nourishes the skin and improves sleep.\n\nAt the spa we select oils for your constitution after a short consultation.' },
    ],
  });

  // ─── Sample bookings ─────────────────────────────────────────────────────
  const today = todayInZone(settings.timezone);
  const allRooms = await prisma.room.findMany({ where: { status: 'AVAILABLE' }, orderBy: { number: 'asc' } });
  const used: { roomId: string; ci: string; co: string }[] = [];
  const mealPlans = await prisma.mealPlan.findMany();
  const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME10' } });

  async function seedBooking(o: {
    slug: string; ciOffset: number; nights: number; rooms?: number; adults?: number; children?: number; customer?: number; guest?: [string, string, string];
    status: 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PENDING' | 'CANCELLED'; pay: 'full' | 'none' | 'deposit'; meal?: string; useCoupon?: boolean; source?: string; createdDaysAgo: number;
  }) {
    const rt = await prisma.roomType.findUniqueOrThrow({ where: { slug: o.slug } });
    const ci = addDays(today, o.ciOffset);
    const co = addDays(ci, o.nights);
    const rooms = o.rooms ?? 1;
    const inputs = await loadPricingInputs(prisma, rt.id, ci, co);
    const mp = o.meal ? mealPlans.find((m) => m.code === o.meal) ?? null : null;
    const quote: Quote = calculateQuote({
      checkIn: ci, checkOut: co, rooms, adults: o.adults ?? 2, children: o.children ?? 0, roomType: toPricingRoomType(rt), weekendDays: settings.weekendDays, ...inputs,
      mealPlan: mp && { id: mp.id, code: mp.code, name: mp.name, pricePerAdult: mp.pricePerAdult, pricePerChild: mp.pricePerChild },
      coupon: o.useCoupon ? { id: coupon.id, code: coupon.code, discountType: 'PERCENT', value: coupon.value, maxDiscount: coupon.maxDiscount, roomTypeIds: [] } : null,
      depositPercent: 100,
    });
    const free = allRooms.filter((r) => r.roomTypeId === rt.id && !used.some((u) => u.roomId === r.id && u.ci < co && ci < u.co)).slice(0, rooms);
    if (free.length < rooms) return;
    free.forEach((r) => used.push({ roomId: r.id, ci, co }));
    const cust = o.customer != null ? customers[o.customer] : null;
    const [first, last, email] = cust ? [cust.name.split(' ')[0], cust.name.split(' ').slice(1).join(' '), cust.email] : o.guest!;
    const paid = o.pay === 'full' ? quote.grandTotal : o.pay === 'deposit' ? Math.round(quote.grandTotal * 0.3) : 0;
    const createdAt = new Date(Date.now() - o.createdDaysAgo * 86_400_000);
    const cancelled = o.status === 'CANCELLED';
    const b = await prisma.booking.create({
      data: {
        reference: makeBookingReference('AUR'), userId: cust?.id ?? null, roomTypeId: rt.id, status: o.status,
        paymentStatus: cancelled && paid ? 'REFUNDED' : paid === 0 ? 'UNPAID' : paid >= quote.grandTotal ? 'PAID' : 'PARTIALLY_PAID',
        refundStatus: cancelled && paid ? 'PROCESSED' : 'NONE', paymentMethod: o.pay === 'none' ? 'PAY_AT_HOTEL' : 'ONLINE', source: o.source ?? 'WEBSITE',
        checkIn: dbDate(ci), checkOut: dbDate(co), nights: o.nights, roomsCount: rooms, adults: o.adults ?? 2, children: o.children ?? 0,
        guestFirstName: first, guestLastName: last, guestEmail: email, guestPhone: cust?.phone ?? '+91 90000 00000', guestCountry: cust?.country ?? 'India',
        requests: { arrivalTime: '15:00', earlyCheckIn: false, lateCheckOut: false, occasion: o.nights > 3 ? 'ANNIVERSARY' : '', airportTransfer: { required: false, flightNumber: '', arrivalAt: '' }, specialInstructions: '' },
        mealPlanId: mp?.id ?? null, couponId: o.useCoupon ? coupon.id : null, couponCode: o.useCoupon ? coupon.code : null,
        subtotal: quote.subtotal, discountTotal: quote.discountTotal, taxTotal: quote.taxTotal, feeTotal: quote.feeTotal, grandTotal: quote.grandTotal, depositDue: quote.depositDue,
        amountPaid: paid, amountRefunded: cancelled ? paid : 0, pricingSnapshot: quote as unknown as Prisma.InputJsonValue, createdAt,
        confirmedAt: o.status === 'PENDING' ? null : createdAt, checkedInAt: ['CHECKED_IN', 'CHECKED_OUT'].includes(o.status) ? dbDate(ci) : null,
        checkedOutAt: o.status === 'CHECKED_OUT' ? dbDate(co) : null, cancelledAt: cancelled ? new Date(createdAt.getTime() + 2 * 86_400_000) : null,
        cancellationReason: cancelled ? 'Change of travel plans' : null, cancelledBy: cancelled ? 'GUEST' : null, manageTokenHash: sha256(randomToken(24)),
        utm: o.source === 'WEBSITE' ? { utm_source: ['google', 'instagram', 'direct', 'newsletter'][o.createdDaysAgo % 4] } : undefined,
        lineItems: { create: quote.lines.map((l, i) => ({ kind: l.kind, label: l.label, date: l.date ? dbDate(l.date) : null, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.amount, refId: l.refId ?? null, sortOrder: i })) },
        guests: { create: [{ firstName: first, lastName: last, isPrimary: true }] },
        rooms: { create: free.map((r) => ({ roomId: r.id, checkIn: dbDate(ci), checkOut: dbDate(co), active: !cancelled })) },
        events: { create: [{ type: 'CREATED', message: 'Booking created via website.', createdAt }] },
      },
    });
    if (paid > 0) {
      const payment = await prisma.payment.create({ data: { bookingId: b.id, provider: 'SANDBOX', providerOrderId: `order_sbx_seed_${b.reference}`, providerPaymentId: `pay_sbx_seed_${b.reference}`, amount: paid, status: cancelled ? 'REFUNDED' : 'CAPTURED', amountRefunded: cancelled ? paid : 0, method: 'card', isTest: true, capturedAt: createdAt, createdAt } });
      if (cancelled) await prisma.refund.create({ data: { paymentId: payment.id, bookingId: b.id, amount: paid, status: 'PROCESSED', providerRefundId: `rfnd_sbx_seed_${b.reference}`, reason: 'Free cancellation', processedAt: new Date(createdAt.getTime() + 2 * 86_400_000) } });
    }
    if (o.useCoupon) {
      await prisma.couponRedemption.create({ data: { couponId: coupon.id, bookingId: b.id, email, amount: quote.couponDiscount } });
      await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
    }
    if (o.status === 'CHECKED_OUT' && o.customer != null && o.customer < 2) {
      await prisma.review.create({ data: { bookingId: b.id, userId: cust!.id, roomTypeId: rt.id, name: `${first} ${last[0]}.`, location: cust!.country, rating: 5, title: 'An unforgettable stay', body: 'Everything from the welcome to the farewell was perfect. We are already planning our return.', status: 'APPROVED', source: 'GUEST', stayDate: dbDate(ci) } });
    }
  }

  const plan: Parameters<typeof seedBooking>[0][] = [
    { slug: 'lake-view-deluxe-room', ciOffset: -40, nights: 3, customer: 0, status: 'CHECKED_OUT', pay: 'full', meal: 'CP', createdDaysAgo: 70 },
    { slug: 'lake-palace-suite', ciOffset: -25, nights: 4, customer: 1, status: 'CHECKED_OUT', pay: 'full', meal: 'MAP', createdDaysAgo: 55 },
    { slug: 'royal-pool-villa', ciOffset: -12, nights: 3, guest: ['Kavya', 'Reddy', 'kavya.reddy@example.com'], status: 'CHECKED_OUT', pay: 'full', createdDaysAgo: 40 },
    { slug: 'heritage-courtyard-room', ciOffset: -6, nights: 2, customer: 2, status: 'CHECKED_OUT', pay: 'none', source: 'PHONE', createdDaysAgo: 18 },
    { slug: 'palace-junior-suite', ciOffset: -2, nights: 5, customer: 3, status: 'CHECKED_IN', pay: 'full', meal: 'CP', createdDaysAgo: 28 },
    { slug: 'lake-view-deluxe-room', ciOffset: -1, nights: 3, rooms: 2, adults: 4, guest: ['Rajesh', 'Gupta', 'rajesh.gupta@example.com'], status: 'CHECKED_IN', pay: 'deposit', createdDaysAgo: 12 },
    { slug: 'lake-view-deluxe-room', ciOffset: 0, nights: 2, customer: 4, status: 'CONFIRMED', pay: 'full', useCoupon: true, createdDaysAgo: 6 },
    { slug: 'heritage-courtyard-room', ciOffset: 0, nights: 3, guest: ['Olivia', 'Brown', 'olivia.brown@example.com'], status: 'CONFIRMED', pay: 'none', createdDaysAgo: 4 },
    { slug: 'lake-palace-suite', ciOffset: 6, nights: 3, customer: 5, status: 'CONFIRMED', pay: 'full', meal: 'MAP', createdDaysAgo: 3 },
    { slug: 'royal-pool-villa', ciOffset: 14, nights: 4, guest: ['Siddharth', 'Bose', 'siddharth.bose@example.com'], status: 'CONFIRMED', pay: 'full', createdDaysAgo: 2 },
    { slug: 'palace-junior-suite', ciOffset: 21, nights: 2, guest: ['Lucas', 'Martin', 'lucas.martin@example.fr'], status: 'PENDING', pay: 'none', createdDaysAgo: 1 },
    { slug: 'heritage-courtyard-room', ciOffset: 10, nights: 2, customer: 0, status: 'CANCELLED', pay: 'full', createdDaysAgo: 9 },
    { slug: 'maharana-presidential-suite', ciOffset: 35, nights: 3, guest: ['Sheikh', 'Al Mansoori', 'office@example.ae'], status: 'CONFIRMED', pay: 'deposit', source: 'EMAIL', createdDaysAgo: 5 },
    { slug: 'lake-view-deluxe-room', ciOffset: 45, nights: 6, customer: 1, status: 'CONFIRMED', pay: 'full', useCoupon: false, createdDaysAgo: 0 },
  ];
  for (let i = 0; i < 18; i++) plan.push({ slug: roomTypes[i % 4].slug, ciOffset: -55 + i * 3, nights: 1 + (i % 3), guest: [['Aarav', 'Ishaan', 'Zara', 'Mia', 'Kabir', 'Leo'][i % 6], ['Patel', 'Khan', 'Smith', 'Iyer', 'Dubois', 'Verma'][i % 6], `guest${i}@example.com`], status: 'CHECKED_OUT', pay: 'full', createdDaysAgo: 60 - i * 2 });
  for (const p of plan) await seedBooking(p);

  await prisma.contactInquiry.createMany({
    data: [
      { name: 'Riya Kapoor', email: 'riya.kapoor@example.com', phone: '+91 98765 43210', type: 'WEDDING', subject: 'Wedding in February', message: 'We are planning a wedding for about 250 guests next February and would love to know about availability and packages.', guestCount: 250, eventDate: dbDate(`${year + 1}-02-14`) },
      { name: 'Thomas Weber', email: 'thomas.weber@example.de', type: 'GENERAL', subject: 'Airport transfer', message: 'Could you arrange a transfer for our arrival at 11pm? We have four suitcases.', status: 'IN_PROGRESS' },
      { name: 'Sana Ali', email: 'sana.ali@example.com', type: 'DINING', subject: 'Birthday dinner on the jetty', message: 'Is it possible to book the private jetty dinner for 6 people on Saturday?', status: 'NEW' },
    ],
  });
  await prisma.newsletterSubscriber.createMany({
    data: ['ananya.sharma@example.com', 'priya.nair@example.com', 'arjun.malhotra@example.com', 'traveller@example.com', 'luxury.fan@example.com'].map((email, i) => ({ email, unsubscribeToken: randomToken(24), source: i < 3 ? 'booking' : 'website', createdAt: new Date(Date.now() - i * 5 * 86_400_000) })),
  });
  await prisma.notification.create({ data: { permission: 'bookings.view', type: 'booking', title: 'Welcome to the admin dashboard', body: 'Demo data has been loaded. Explore bookings, rooms and the theme builder.', link: '/admin' } });

  const count = await prisma.booking.count();
  console.log(`✅ Seeded ${roomTypes.length} room types, ${allRooms.length + 1} rooms, ${count} bookings, ${DEFAULT_PAGES.length} pages.`);
  console.log('\nDemo staff accounts (change these before going live):');
  for (const s of staff) console.log(`   ${s.role.padEnd(16)} ${s.email}`);
  console.log(`   password: ${process.env.SEED_STAFF_PASSWORD ? '(from SEED_STAFF_PASSWORD)' : staffPassword}`);
  console.log('Demo customer: ananya.sharma@example.com / Guest-Demo-2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
