import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, bookingBody, login, PASSWORD, resetFixtures } from './helpers';

let roomTypeId: string;
beforeEach(async () => {
  roomTypeId = (await resetFixtures()).roomType.id;
});

describe('authorization', () => {
  it('blocks anonymous and customer access to admin APIs', async () => {
    const anon = await agent();
    expect((await anon.get('/api/admin/bookings')).status).toBe(401);
    const customer = await login('customer@test.dev');
    expect((await customer.get('/api/admin/bookings')).status).toBe(403);
    expect((await customer.get('/api/admin/dashboard')).status).toBe(403);
  });

  it('applies least-privilege role permissions on the server', async () => {
    const editor = await login('content_editor@test.dev');
    expect((await editor.get('/api/admin/bookings')).status).toBe(403);
    expect((await editor.get('/api/admin/cms/pages')).status).toBe(200);
    const desk = await login('receptionist@test.dev');
    expect((await desk.post('/api/admin/coupons', { code: 'HACK', discountType: 'PERCENT', value: 10000 })).status).toBe(403);
    expect((await desk.get('/api/admin/staff')).status).toBe(403);
    expect((await desk.get('/api/admin/reports/revenue')).status).toBe(403);
    const manager = await login('hotel_manager@test.dev');
    expect((await manager.put('/api/admin/settings/booking', {})).status).toBe(403);
    expect((await manager.get('/api/admin/reports/revenue')).status).toBe(200);
  });

  it('hides money on the dashboard from non-financial roles', async () => {
    const desk = await login('receptionist@test.dev');
    const res = await desk.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.kpis.revenueCollected).toBe(-1);
    expect(res.body.financial).toBe(false);
  });

  it('revokes access immediately when a staff member is deactivated', async () => {
    const desk = await login('receptionist@test.dev');
    const admin = await login('super_admin@test.dev');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'receptionist@test.dev' } });
    expect((await admin.put(`/api/admin/staff/${user.id}`, { name: 'Desk', phone: '', roleKey: 'RECEPTIONIST', isActive: false })).status).toBe(200);
    expect((await desk.get('/api/admin/bookings')).status).toBe(401);
  });

  it('has no public way to create staff', async () => {
    const a = await agent();
    const res = await a.post('/api/auth/register', { name: 'Eve', email: 'eve@example.com', password: 'Strong-Pass-123', roleKey: 'SUPER_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.roleKey).toBe('CUSTOMER');
    expect((await a.get('/api/admin/dashboard')).status).toBe(403);
  });
});

describe('authentication', () => {
  it('locks an account after repeated failures', async () => {
    const a = await agent();
    for (let i = 0; i < 5; i++) expect((await a.post('/api/auth/login', { email: 'customer@test.dev', password: 'wrong' })).status).toBe(401);
    const locked = await a.post('/api/auth/login', { email: 'customer@test.dev', password: PASSWORD });
    expect(locked.status).toBe(423);
  });

  it('uses the same error for unknown emails and wrong passwords', async () => {
    const a = await agent();
    const r1 = await a.post('/api/auth/login', { email: 'nobody@test.dev', password: 'x' });
    const r2 = await a.post('/api/auth/login', { email: 'customer@test.dev', password: 'x' });
    expect(r1.body.error).toEqual(r2.body.error);
  });

  it('rejects weak passwords', async () => {
    const a = await agent();
    expect((await a.post('/api/auth/register', { name: 'W', email: 'w@example.com', password: 'password' })).status).toBe(422);
  });
});

describe('coupons', () => {
  it('rejects unknown, expired and exhausted codes', async () => {
    await prisma.coupon.createMany({
      data: [
        { code: 'OLD', discountType: 'PERCENT', value: 1000, endsAt: new Date(Date.now() - 86_400_000), roomTypeIds: [] },
        { code: 'ONCE', discountType: 'FIXED', value: 1_000_00, usageLimit: 1, roomTypeIds: [] },
      ],
    });
    const a = await agent();
    const q = (code: string) => a.post('/api/quote', { roomTypeId, checkIn: bookingBody(roomTypeId).checkIn, checkOut: bookingBody(roomTypeId).checkOut, adults: 2, children: 0, rooms: 1, couponCode: code });
    expect((await q('NOPE')).body.error.code).toBe('COUPON_INVALID');
    expect((await q('OLD')).body.error.code).toBe('COUPON_EXPIRED');
    expect((await q('once')).status).toBe(200);
    // Two concurrent bookings race for the last use: exactly one wins.
    const results = await Promise.all([0, 1].map(async (i) => (await agent()).post('/api/bookings', bookingBody(roomTypeId, { couponCode: 'ONCE', guest: { firstName: 'C', lastName: String(i), email: `c${i}@x.com`, phone: '+91 9000000000' } }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'ONCE' } })).usedCount).toBe(1);
    expect((await q('ONCE')).body.error.code).toBe('COUPON_EXHAUSTED');
  });
});

describe('uploads', () => {
  it('rejects non-images, disguised files and SVGs; accepts real images', async () => {
    const admin = await login('super_admin@test.dev');
    const up = (buf: Buffer, name: string, type: string) => admin.raw.post('/api/admin/cms/media').set('x-csrf-token', admin.token).attach('files', buf, { filename: name, contentType: type });
    expect((await up(Buffer.from('<script>alert(1)</script>'), 'x.png', 'image/png')).status).toBe(400);
    expect((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml')).status).toBe(400);
    expect((await up(Buffer.from('MZ...'), 'x.exe', 'application/octet-stream')).status).toBe(400);
    const png = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#c8a96a' } }).png().toBuffer();
    const ok = await up(png, 'pool.png', 'image/png');
    expect(ok.status).toBe(201);
    expect(ok.body.items[0].url).toMatch(/\.webp$/);
    const editorless = await login('receptionist@test.dev');
    const denied = await editorless.raw.post('/api/admin/cms/media').set('x-csrf-token', editorless.token).attach('files', png, { filename: 'p.png', contentType: 'image/png' });
    expect(denied.status).toBe(403);
  });
});

describe('cms publishing', () => {
  it('validates drafts on publish and only shows drafts to staff in preview', async () => {
    const admin = await login('super_admin@test.dev');
    const page = await prisma.page.create({ data: { slug: 'spa-offer', title: 'Spa', status: 'DRAFT', draft: { sections: [], seo: {} } } });
    const bad = { sections: [{ id: 's1', type: 'hero', enabled: true, props: { slides: [] } }], seo: { title: '', description: '', ogImage: '', noIndex: false } };
    expect((await admin.put(`/api/admin/cms/pages/${page.id}/draft`, bad)).status).toBe(200);
    expect((await admin.post(`/api/admin/cms/pages/${page.id}/publish`)).status).toBe(422);
    const good = { sections: [{ id: 's1', type: 'intro', enabled: true, props: { heading: 'Rituals', body: 'Hello' } }], seo: { title: 'Spa', description: '', ogImage: '', noIndex: false } };
    await admin.put(`/api/admin/cms/pages/${page.id}/draft`, good);
    const anon = await agent();
    expect((await anon.get('/api/pages/spa-offer')).status).toBe(404);
    expect((await anon.get('/api/pages/spa-offer?preview=1')).status).toBe(404);
    expect((await admin.get('/api/pages/spa-offer?preview=1')).status).toBe(200);
    expect((await admin.post(`/api/admin/cms/pages/${page.id}/publish`)).status).toBe(200);
    expect((await anon.get('/api/pages/spa-offer')).body.content.sections[0].props.heading).toBe('Rituals');
  });

  it('publishes theme changes only when published', async () => {
    const admin = await login('content_editor@test.dev');
    const cfg = (await admin.get('/api/admin/cms/site-config')).body.config;
    cfg.brand.name = 'Hotel Nova';
    cfg.theme.colors.primary = '#112233';
    expect((await admin.put('/api/admin/cms/site-config/draft', cfg)).status).toBe(200);
    const anon = await agent();
    expect((await anon.get('/api/site')).body.config.brand.name).not.toBe('Hotel Nova');
    expect((await admin.get('/api/site?preview=1')).body.config.brand.name).toBe('Hotel Nova');
    expect((await admin.post('/api/admin/cms/site-config/publish')).status).toBe(200);
    expect((await anon.get('/api/site')).body.config.brand.name).toBe('Hotel Nova');
    cfg.theme.colors.primary = 'red';
    expect((await admin.put('/api/admin/cms/site-config/draft', cfg)).status).toBe(422);
  });
});
