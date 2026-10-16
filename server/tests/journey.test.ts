import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { DEFAULT_PAGES } from '../src/content/pages';
import { agent, future, login, resetFixtures } from './helpers';

/**
 * The full end-to-end journey from the requirements, exercised through the HTTP API:
 * admin edits content/pricing/offers → customer searches, books and pays (test mode) →
 * admin sees and updates the booking → customer is notified.
 */
describe('end-to-end hotel journey', () => {
  it('runs from admin setup to a notified guest', async () => {
    const { roomType } = await resetFixtures({ rooms: 3 });
    const home = DEFAULT_PAGES.find((p) => p.slug === 'home')!;
    const content = JSON.parse(JSON.stringify({ sections: home.sections, seo: home.seo }));
    await prisma.page.create({ data: { slug: 'home', title: 'Home', kind: 'HOME', isSystem: true, status: 'PUBLISHED', draft: content, published: content } });

    // 1. Admin logs in
    const admin = await login('super_admin@test.dev');

    // 2. Admin changes the homepage hero image and publishes
    const pages = (await admin.get('/api/admin/cms/pages')).body.items as { id: string; slug: string }[];
    const homeId = pages.find((p) => p.slug === 'home')!.id;
    const doc = (await admin.get(`/api/admin/cms/pages/${homeId}`)).body;
    const hero = doc.draft.sections.find((s: { type: string }) => s.type === 'hero');
    hero.props.slides[0].image = 'https://images.unsplash.com/photo-new-hero?auto=format';
    expect((await admin.put(`/api/admin/cms/pages/${homeId}/draft`, doc.draft)).status).toBe(200);
    expect((await admin.post(`/api/admin/cms/pages/${homeId}/publish`)).status).toBe(200);
    const live = (await (await agent()).get('/api/pages/home')).body;
    expect(live.content.sections[0].props.slides[0].image).toContain('photo-new-hero');

    // 3. Admin edits room details and pricing
    const rt = (await admin.get(`/api/admin/room-types/${roomType.id}`)).body;
    const upd = await admin.put(`/api/admin/room-types/${roomType.id}`, {
      slug: rt.slug, name: 'Lake Suite', tagline: 'Renovated', description: rt.description, category: 'SUITE', basePrice: 12_000_00, weekendPrice: null,
      baseOccupancy: 2, maxAdults: 3, maxChildren: 1, maxOccupancy: 3, maxExtraBeds: 1, extraAdultCharge: 2_000_00, extraChildCharge: 0, extraBedCharge: 0,
      bedType: 'King', sizeSqm: 55, view: 'Lake', minStay: 1, maxStay: 30, isFeatured: true, status: 'PUBLISHED', sortOrder: 0, amenityIds: [], highlights: [],
      images: [{ url: 'https://images.unsplash.com/photo-room?auto=format', alt: 'Suite' }], seoTitle: '', seoDescription: '',
    });
    expect(upd.status).toBe(200);

    // 4. Admin publishes a special offer (15% off, 2+ nights)
    const offer = await admin.post('/api/admin/offers', { slug: 'autumn', title: 'Autumn Escape', discountType: 'PERCENT', value: 1500, minNights: 2, isActive: true, isFeatured: true });
    expect(offer.status).toBe(201);
    const guest = await agent();
    expect((await guest.get('/api/offers')).body.items.map((o: { slug: string }) => o.slug)).toContain('autumn');

    // 5–6. Customer searches available rooms for dates & guests
    const checkIn = future(20);
    const checkOut = future(23);
    const search = await guest.get(`/api/rooms?checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0&rooms=1`);
    const found = search.body.items.find((r: { id: string }) => r.id === roomType.id);
    expect(found.name).toBe('Lake Suite');
    expect(found.availability.available).toBe(3);
    // 3 nights × 12,000 = 36,000 − 15% = 30,600 + 18% GST = 36,108
    expect(found.availability.stayTotal).toBe(36_108_00);

    // 7–8. Customer books; the server re-validates inventory & price
    const book = await guest.post('/api/bookings', {
      roomTypeId: roomType.id, checkIn, checkOut, adults: 2, children: 0, rooms: 1,
      guest: { firstName: 'Meera', lastName: 'Kapoor', email: 'meera@example.com', phone: '+91 98765 11111' },
      paymentMethod: 'ONLINE', acceptTerms: true, expectedTotal: found.availability.stayTotal,
    });
    expect(book.status).toBe(201);
    expect(book.body.booking.offer.title).toBe('Autumn Escape');
    const { reference } = book.body.booking;

    // 9. Payment in test mode: simulate + signature verification
    const sim = await guest.post('/api/payments/sandbox/simulate', { orderId: book.body.payment.orderId, reference, token: book.body.manageToken, outcome: 'success' });
    const verify = await guest.post('/api/payments/verify', { bookingReference: reference, providerOrderId: sim.body.providerOrderId, providerPaymentId: sim.body.providerPaymentId, signature: sim.body.signature });
    expect(verify.body.status).toBe('CONFIRMED');

    // 10. Booking appears in the admin dashboard and list
    const list = await admin.get(`/api/admin/bookings?q=${reference}`);
    expect(list.body.items[0]).toMatchObject({ reference, status: 'CONFIRMED', paymentStatus: 'PAID' });
    const dash = await admin.get('/api/admin/dashboard?preset=today');
    expect(dash.body.kpis.totalBookings).toBeGreaterThanOrEqual(1);

    // 11. Admin updates the booking (modify stay) …
    const id = list.body.items[0].id;
    expect((await admin.post(`/api/admin/bookings/${id}/modify`, { checkIn, checkOut: future(24), adults: 2, children: 0, reason: 'Guest extended', repriced: true })).status).toBe(200);

    // 12. … and the customer is notified by email (log provider records every message)
    await new Promise((r) => setTimeout(r, 300));
    const emails = await prisma.emailLog.findMany({ where: { to: 'meera@example.com' }, orderBy: { createdAt: 'asc' } });
    expect(emails.map((e) => e.template)).toEqual(expect.arrayContaining(['booking.confirmed', 'booking.status']));
    const view = await guest.get(`/api/bookings/${reference}?token=${book.body.manageToken}`);
    expect(view.body.booking.checkOut).toBe(future(24));
  });
});
