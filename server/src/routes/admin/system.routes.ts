import { Router } from 'express';
import { bookingSettingsSchema, reviewModerationSchema } from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, ah, pageParams, paged, str } from '../../utils/http';
import { toCsv } from '../../utils/csv';
import { can, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit.service';
import { getBookingSettings, saveBookingSettings } from '../../services/settings.service';
import { paymentProvider } from '../../services/payments';
import { emailProvider } from '../../services/email/provider';
import * as reports from '../../services/reports.service';

export const systemRouter = Router();

systemRouter.get('/dashboard', requirePermission('dashboard.view'), ah(async (req, res) => {
  const range = await reports.resolveRange(req.query as Record<string, string>);
  const data = await reports.dashboard(range);
  if (!can(req.user, 'reports.financial')) {
    // Non-financial roles see operations, not money.
    const k = data.kpis as Record<string, number>;
    for (const key of ['revenueCollected', 'refunded', 'netRevenue']) k[key] = -1;
    data.series = data.series.map((s) => ({ ...s, revenue: 0, bookedValue: 0 }));
    data.recentPayments = [];
  }
  res.json({ ...data, financial: can(req.user, 'reports.financial') });
}));

const REPORTS: Record<string, { perm: 'reports.view' | 'reports.financial'; run: (r: reports.Range) => Promise<unknown> }> = {
  occupancy: { perm: 'reports.view', run: reports.occupancyReport },
  rooms: { perm: 'reports.financial', run: reports.roomPerformance },
  cancellations: { perm: 'reports.view', run: reports.cancellationReport },
  promotions: { perm: 'reports.financial', run: reports.promotionReport },
  sources: { perm: 'reports.view', run: reports.sourceReport },
  revenue: { perm: 'reports.financial', run: reports.revenueReport },
  bookings: { perm: 'reports.view', run: reports.dailySeries },
};

systemRouter.get('/reports/:name', requirePermission('reports.view'), ah(async (req, res) => {
  const def = REPORTS[req.params.name];
  if (!def) throw AppError.notFound('Report');
  if (!can(req.user, def.perm)) throw AppError.forbidden('This report requires financial reporting access.');
  const range = await reports.resolveRange(req.query as Record<string, string>);
  const data = await def.run(range);
  if (req.query.format === 'csv') {
    const rows = Array.isArray(data) ? data : (data as { days?: unknown[]; items?: unknown[]; series?: unknown[] }).days ?? (data as { items?: unknown[] }).items ?? (data as { series?: unknown[] }).series ?? [data];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}-${range.from}-${range.to}.csv"`);
    return res.send(`﻿${toCsv(rows as Record<string, unknown>[])}`);
  }
  res.json({ range, data });
}));

// ─── Reviews moderation ────────────────────────────────────────────────────
systemRouter.patch('/reviews/:id/moderate', requirePermission('reviews.manage'), validate(reviewModerationSchema), ah(async (req, res) => {
  const r = await prisma.review.update({ where: { id: req.params.id }, data: { status: req.body.status, ...(req.body.isFeatured != null ? { isFeatured: req.body.isFeatured } : {}), ...(req.body.response != null ? { response: req.body.response } : {}) } });
  await audit(req, { action: 'review.moderate', entity: 'Review', entityId: r.id, summary: `${r.name}: ${r.status}${r.isFeatured ? ' (featured)' : ''}` });
  res.json(r);
}));

// ─── Settings & integrations ───────────────────────────────────────────────
systemRouter.get('/settings/booking', requirePermission('dashboard.view'), ah(async (_req, res) => {
  res.json(await getBookingSettings());
}));

systemRouter.put('/settings/booking', requirePermission('settings.manage'), ah(async (req, res) => {
  const before = await getBookingSettings();
  const value = await saveBookingSettings(bookingSettingsSchema.parse(req.body), req.user!.id);
  await audit(req, { action: 'settings.booking', entity: 'Setting', entityId: 'booking', summary: 'Updated booking & payment policy', before, after: value });
  res.json(value);
}));

systemRouter.get('/integrations', requirePermission('dashboard.view'), (_req, res) => {
  res.json({
    payments: { provider: paymentProvider.name, testMode: paymentProvider.isTest, webhookConfigured: paymentProvider.name === 'SANDBOX' || !!env.RAZORPAY_WEBHOOK_SECRET, webhookUrl: `${env.API_URL}/api/payments/webhooks/razorpay` },
    email: { provider: emailProvider.name, live: emailProvider.name !== 'log' },
    storage: { provider: env.STORAGE_PROVIDER },
  });
});

// ─── Audit log ─────────────────────────────────────────────────────────────
systemRouter.get('/audit', requirePermission('audit.view'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query, { pageSize: 50 });
  const where: Prisma.AuditLogWhereInput = {};
  if (str(req.query.entity)) where.entity = str(req.query.entity);
  if (str(req.query.actorId)) where.actorId = str(req.query.actorId);
  if (str(req.query.q)) where.OR = [{ summary: { contains: str(req.query.q), mode: 'insensitive' } }, { action: { contains: str(req.query.q) } }];
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { actor: { select: { name: true, email: true } } } }), prisma.auditLog.count({ where })]);
  res.json(paged(items, total, page, pageSize));
}));

systemRouter.get('/email-logs', requirePermission('settings.manage'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query, { pageSize: 30 });
  const [items, total] = await Promise.all([prisma.emailLog.findMany({ skip, take, orderBy: { createdAt: 'desc' } }), prisma.emailLog.count()]);
  res.json(paged(items, total, page, pageSize));
}));

// ─── Notifications ─────────────────────────────────────────────────────────
systemRouter.get('/notifications', ah(async (req, res) => {
  const perms = req.user!.permissions.includes('*') ? undefined : req.user!.permissions;
  const where: Prisma.NotificationWhereInput = { OR: [{ userId: req.user!.id }, { userId: null, ...(perms ? { permission: { in: perms } } : {}) }] };
  const items = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ items: items.map((n) => ({ ...n, read: n.readBy.includes(req.user!.id), readBy: undefined })), unread: items.filter((n) => !n.readBy.includes(req.user!.id)).length });
}));

systemRouter.post('/notifications/read-all', ah(async (req, res) => {
  const perms = req.user!.permissions.includes('*') ? undefined : req.user!.permissions;
  const rows = await prisma.notification.findMany({ where: { NOT: { readBy: { has: req.user!.id } }, OR: [{ userId: req.user!.id }, { userId: null, ...(perms ? { permission: { in: perms } } : {}) }] }, select: { id: true } });
  for (const r of rows) await prisma.notification.update({ where: { id: r.id }, data: { readBy: { push: req.user!.id } } });
  res.json({ ok: true });
}));
