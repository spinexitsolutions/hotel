import { Router } from 'express';
import { ALL_PERMISSIONS, customerUpdateSchema, inquiryUpdateSchema, rolePermissionsSchema, staffCreateSchema, staffUpdateSchema } from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ah, pageParams, paged, str } from '../../utils/http';
import { isoOf } from '../../utils/dates';
import { toCsv } from '../../utils/csv';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit.service';
import { hashPassword } from '../../services/auth.service';

export const peopleRouter = Router();

// ─── Customers ─────────────────────────────────────────────────────────────
function customerWhere(q: Record<string, unknown>): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: { key: 'CUSTOMER' } };
  const s = str(q.q);
  if (s) where.OR = [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s.toLowerCase() } }, { phone: { contains: s } }];
  if (q.marketing === '1') where.marketingOptIn = true;
  if (q.active === '0') where.isActive = false;
  return where;
}

peopleRouter.get('/customers', requirePermission('customers.view'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const where = customerWhere(req.query as Record<string, unknown>);
  const [rows, total] = await Promise.all([prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.user.count({ where })]);
  const stats = await prisma.booking.groupBy({ by: ['userId'], where: { userId: { in: rows.map((r) => r.id) }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } }, _count: true, _sum: { grandTotal: true } });
  res.json(paged(rows.map((u) => {
    const s = stats.find((x) => x.userId === u.id);
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, country: u.country, isActive: u.isActive, marketingOptIn: u.marketingOptIn, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, stays: s?._count ?? 0, lifetimeValue: s?._sum.grandTotal ?? 0 };
  }), total, page, pageSize));
}));

peopleRouter.get('/customers/export.csv', requirePermission('customers.export'), ah(async (req, res) => {
  const rows = await prisma.user.findMany({ where: customerWhere(req.query as Record<string, unknown>), orderBy: { createdAt: 'desc' }, take: 20_000 });
  await audit(req, { action: 'customer.export', entity: 'User', summary: `Exported ${rows.length} customer records` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${toCsv(rows.map((u) => ({ name: u.name, email: u.email, phone: u.phone, country: u.country, marketing_opt_in: u.marketingOptIn, active: u.isActive, joined: u.createdAt.toISOString() })))}`);
}));

peopleRouter.get('/customers/:id', requirePermission('customers.view'), ah(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!u || u.role.key !== 'CUSTOMER') throw AppError.notFound('Customer');
  const [bookings, inquiries, reviews] = await Promise.all([
    prisma.booking.findMany({ where: { OR: [{ userId: u.id }, { guestEmail: u.email }] }, orderBy: { checkIn: 'desc' }, include: { roomType: { select: { name: true } } } }),
    prisma.contactInquiry.findMany({ where: { OR: [{ userId: u.id }, { email: u.email }] }, orderBy: { createdAt: 'desc' } }),
    prisma.review.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    id: u.id, name: u.name, email: u.email, phone: u.phone, country: u.country, isActive: u.isActive, marketingOptIn: u.marketingOptIn, notes: u.notes, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    bookings: bookings.map((b) => ({ id: b.id, reference: b.reference, status: b.status, roomType: b.roomType.name, checkIn: isoOf(b.checkIn), checkOut: isoOf(b.checkOut), grandTotal: b.grandTotal, paymentStatus: b.paymentStatus })),
    inquiries, reviews,
  });
}));

peopleRouter.put('/customers/:id', requirePermission('customers.manage'), validate(customerUpdateSchema), ah(async (req, res) => {
  const before = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!before || before.role.key !== 'CUSTOMER') throw AppError.notFound('Customer');
  const u = await prisma.user.update({ where: { id: before.id }, data: req.body });
  if (!u.isActive) await prisma.session.deleteMany({ where: { userId: u.id } });
  await audit(req, { action: 'customer.update', entity: 'User', entityId: u.id, summary: `Updated customer ${u.email}`, before: { name: before.name, phone: before.phone, isActive: before.isActive }, after: req.body });
  res.json({ ok: true });
}));

// ─── Inquiries / support requests ──────────────────────────────────────────
peopleRouter.get('/inquiries', requirePermission('inquiries.manage'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const where: Prisma.ContactInquiryWhereInput = {};
  if (str(req.query.status)) where.status = str(req.query.status);
  if (str(req.query.type)) where.type = str(req.query.type);
  const s = str(req.query.q);
  if (s) where.OR = [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s.toLowerCase() } }, { subject: { contains: s, mode: 'insensitive' } }, { message: { contains: s, mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    prisma.contactInquiry.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { assignedTo: { select: { id: true, name: true } } } }),
    prisma.contactInquiry.count({ where }),
  ]);
  res.json(paged(items.map((i) => ({ ...i, ip: undefined, eventDate: i.eventDate ? isoOf(i.eventDate) : null })), total, page, pageSize));
}));

peopleRouter.patch('/inquiries/:id', requirePermission('inquiries.manage'), validate(inquiryUpdateSchema), ah(async (req, res) => {
  const cur = await prisma.contactInquiry.findUnique({ where: { id: req.params.id } });
  if (!cur) throw AppError.notFound('Inquiry');
  const notes = (cur.internalNotes as { by: string; at: string; body: string }[]) ?? [];
  if (req.body.note) notes.unshift({ by: req.user!.name, at: new Date().toISOString(), body: req.body.note });
  const i = await prisma.contactInquiry.update({ where: { id: cur.id }, data: { status: req.body.status, ...(req.body.assignedToId !== undefined ? { assignedToId: req.body.assignedToId } : {}), internalNotes: notes } });
  await audit(req, { action: 'inquiry.update', entity: 'ContactInquiry', entityId: i.id, summary: `Inquiry from ${i.email} → ${i.status}` });
  res.json(i);
}));

// ─── Newsletter ────────────────────────────────────────────────────────────
peopleRouter.get('/newsletter', requirePermission('newsletter.manage'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const where: Prisma.NewsletterSubscriberWhereInput = {};
  if (str(req.query.status)) where.status = str(req.query.status);
  if (str(req.query.q)) where.email = { contains: str(req.query.q)!.toLowerCase() };
  const [items, total, subscribed] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, status: true, source: true, createdAt: true, unsubscribedAt: true } }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { status: 'SUBSCRIBED' } }),
  ]);
  res.json({ ...paged(items, total, page, pageSize), subscribed });
}));

peopleRouter.get('/newsletter/export.csv', requirePermission('newsletter.manage'), ah(async (req, res) => {
  const rows = await prisma.newsletterSubscriber.findMany({ where: { status: 'SUBSCRIBED' }, orderBy: { createdAt: 'desc' } });
  await audit(req, { action: 'newsletter.export', entity: 'NewsletterSubscriber', summary: `Exported ${rows.length} subscribers` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
  res.send(`﻿${toCsv(rows.map((r) => ({ email: r.email, name: r.name, source: r.source, subscribed_at: r.createdAt.toISOString() })))}`);
}));

peopleRouter.patch('/newsletter/:id', requirePermission('newsletter.manage'), ah(async (req, res) => {
  const status = req.body?.status === 'SUBSCRIBED' ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
  res.json(await prisma.newsletterSubscriber.update({ where: { id: req.params.id }, data: { status, unsubscribedAt: status === 'UNSUBSCRIBED' ? new Date() : null } }));
}));

peopleRouter.delete('/newsletter/:id', requirePermission('newsletter.manage'), ah(async (req, res) => {
  await prisma.newsletterSubscriber.delete({ where: { id: req.params.id } });
  await audit(req, { action: 'newsletter.delete', entity: 'NewsletterSubscriber', entityId: req.params.id });
  res.json({ ok: true });
}));

// ─── Staff & roles ─────────────────────────────────────────────────────────
peopleRouter.get('/staff', requirePermission('staff.manage'), ah(async (_req, res) => {
  const rows = await prisma.user.findMany({ where: { role: { key: { not: 'CUSTOMER' } } }, include: { role: true }, orderBy: { createdAt: 'asc' } });
  res.json({ items: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, roleKey: u.role.key, roleName: u.role.name, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, lockedUntil: u.lockedUntil })) });
}));

/** Lightweight staff directory for assignment dropdowns. */
peopleRouter.get('/staff/directory', requirePermission('inquiries.manage'), ah(async (_req, res) => {
  res.json({ items: await prisma.user.findMany({ where: { isActive: true, role: { key: { not: 'CUSTOMER' } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) });
}));

peopleRouter.post('/staff', requirePermission('staff.manage'), validate(staffCreateSchema), ah(async (req, res) => {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: req.body.roleKey } });
  const u = await prisma.user.create({ data: { name: req.body.name, email: req.body.email, phone: req.body.phone, roleId: role.id, passwordHash: await hashPassword(req.body.password) } });
  await audit(req, { action: 'staff.create', entity: 'User', entityId: u.id, summary: `Created staff ${u.email} (${role.key})` });
  res.status(201).json({ id: u.id });
}));

peopleRouter.put('/staff/:id', requirePermission('staff.manage'), validate(staffUpdateSchema), ah(async (req, res) => {
  const before = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!before || before.role.key === 'CUSTOMER') throw AppError.notFound('Staff member');
  if (before.id === req.user!.id && (req.body.roleKey !== before.role.key || !req.body.isActive)) throw AppError.badRequest('You cannot change your own role or deactivate yourself.');
  if (before.role.key === 'SUPER_ADMIN' && (req.body.roleKey !== 'SUPER_ADMIN' || !req.body.isActive)) {
    const admins = await prisma.user.count({ where: { role: { key: 'SUPER_ADMIN' }, isActive: true } });
    if (admins <= 1) throw AppError.badRequest('At least one active Super Admin is required.');
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: req.body.roleKey } });
  await prisma.user.update({ where: { id: before.id }, data: { name: req.body.name, phone: req.body.phone, roleId: role.id, isActive: req.body.isActive, ...(req.body.isActive ? {} : { lockedUntil: null }) } });
  if (!req.body.isActive || role.key !== before.role.key) await prisma.session.deleteMany({ where: { userId: before.id } });
  await audit(req, { action: 'staff.update', entity: 'User', entityId: before.id, summary: `Updated ${before.email}: role ${before.role.key} → ${role.key}, active ${req.body.isActive}` });
  res.json({ ok: true });
}));

peopleRouter.post('/staff/:id/reset-password', requirePermission('staff.manage'), ah(async (req, res) => {
  const password = String(req.body?.password ?? '');
  const parsed = staffCreateSchema.shape.password.safeParse(password);
  if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0].message);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } });
  await prisma.session.deleteMany({ where: { userId: req.params.id } });
  await audit(req, { action: 'staff.reset_password', entity: 'User', entityId: req.params.id });
  res.json({ ok: true });
}));

peopleRouter.get('/roles', requirePermission('staff.manage'), ah(async (_req, res) => {
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
  res.json({ items: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, users: r._count.users })), allPermissions: ALL_PERMISSIONS });
}));

peopleRouter.put('/roles/:key', requirePermission('staff.manage'), validate(rolePermissionsSchema), ah(async (req, res) => {
  const key = req.params.key;
  if (key === 'SUPER_ADMIN' || key === 'CUSTOMER') throw AppError.badRequest('This role’s permissions are fixed.');
  const permissions = (req.body.permissions as string[]).filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  const before = await prisma.role.findUniqueOrThrow({ where: { key } });
  await prisma.role.update({ where: { key }, data: { permissions } });
  await audit(req, { action: 'role.update', entity: 'Role', entityId: before.id, summary: `Updated permissions for ${key}`, before: before.permissions, after: permissions });
  res.json({ ok: true });
}));
