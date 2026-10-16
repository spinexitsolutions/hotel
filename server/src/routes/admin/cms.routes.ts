import { Router } from 'express';
import { pageMetaSchema, schedulePublishSchema, SECTION_REGISTRY, SECTION_TYPES } from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ah, pageParams, paged, str } from '../../utils/http';
import { requirePermission } from '../../middleware/auth';
import { imageUpload } from '../../middleware/upload';
import { audit } from '../../services/audit.service';
import { discardDraft, publishPage, resetPageToDefault, restoreRevision, saveDraft, sectionDefaults } from '../../services/pages.service';
import { configHistory, discardDraftConfig, getDraftConfig, publishConfig, resetDraftGroup, restoreVersionToDraft, saveDraftConfig } from '../../services/siteConfig.service';
import { deleteMedia, storeImage } from '../../services/media.service';

export const cmsRouter = Router();

// ─── Section registry (drives the page builder UI) ─────────────────────────
cmsRouter.get('/sections', requirePermission('content.manage'), (_req, res) => {
  res.json({ items: SECTION_TYPES.map((t) => ({ type: t, label: SECTION_REGISTRY[t].label, description: SECTION_REGISTRY[t].description })) });
});

// ─── Pages ─────────────────────────────────────────────────────────────────
cmsRouter.get('/pages', requirePermission('content.manage'), ah(async (_req, res) => {
  const pages = await prisma.page.findMany({ orderBy: [{ kind: 'asc' }, { title: 'asc' }], select: { id: true, slug: true, title: true, kind: true, status: true, isSystem: true, hasUnpublishedChanges: true, publishedAt: true, scheduledAt: true, updatedAt: true, showInSitemap: true } });
  res.json({ items: pages });
}));

cmsRouter.get('/pages/:id', requirePermission('content.manage'), ah(async (req, res) => {
  const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { revisions: { orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, note: true, createdAt: true, createdById: true } } } });
  if (!page) throw AppError.notFound('Page');
  res.json(page);
}));

cmsRouter.post('/pages', requirePermission('content.manage'), ah(async (req, res) => {
  const meta = pageMetaSchema.parse(req.body);
  const page = await prisma.page.create({
    data: {
      slug: meta.slug, title: meta.title, kind: 'STANDARD', showInSitemap: meta.showInSitemap, status: 'DRAFT', updatedById: req.user!.id,
      draft: { sections: [{ id: `s-${Date.now().toString(36)}`, type: 'pageHeader', enabled: true, props: { eyebrow: '', heading: meta.title, subheading: '', image: '', alt: '', align: 'center' } }], seo: { title: meta.title, description: '', ogImage: '', noIndex: false } },
    },
  });
  await audit(req, { action: 'page.create', entity: 'Page', entityId: page.id, summary: `Created page /${page.slug}` });
  res.status(201).json(page);
}));

cmsRouter.patch('/pages/:id/meta', requirePermission('content.manage'), ah(async (req, res) => {
  const meta = pageMetaSchema.parse(req.body);
  const page = await prisma.page.findUniqueOrThrow({ where: { id: req.params.id } });
  if (page.isSystem && meta.slug !== page.slug) throw AppError.badRequest('System pages cannot be renamed.');
  const updated = await prisma.page.update({ where: { id: page.id }, data: { slug: meta.slug, title: meta.title, showInSitemap: meta.showInSitemap } });
  await audit(req, { action: 'page.meta', entity: 'Page', entityId: page.id, summary: `Updated /${updated.slug}` });
  res.json(updated);
}));

cmsRouter.put('/pages/:id/draft', requirePermission('content.manage'), ah(async (req, res) => {
  const page = await saveDraft(req.params.id, req.body, req.user!.id);
  res.json({ ok: true, updatedAt: page.updatedAt });
}));

cmsRouter.post('/pages/:id/publish', requirePermission('content.manage'), ah(async (req, res) => {
  const page = await publishPage(req.params.id, req.user!.id);
  await audit(req, { action: 'page.publish', entity: 'Page', entityId: page.id, summary: `Published /${page.slug}` });
  res.json({ ok: true, publishedAt: page.publishedAt });
}));

cmsRouter.post('/pages/:id/schedule', requirePermission('content.manage'), ah(async (req, res) => {
  const { scheduledAt } = schedulePublishSchema.parse(req.body);
  if (scheduledAt && new Date(scheduledAt) < new Date()) throw AppError.badRequest('Choose a time in the future.');
  const page = await prisma.page.update({ where: { id: req.params.id }, data: { scheduledAt: scheduledAt ? new Date(scheduledAt) : null, ...(scheduledAt ? {} : {}) } });
  await audit(req, { action: 'page.schedule', entity: 'Page', entityId: page.id, summary: scheduledAt ? `Scheduled /${page.slug} for ${scheduledAt}` : `Unscheduled /${page.slug}` });
  res.json({ ok: true, scheduledAt: page.scheduledAt });
}));

cmsRouter.post('/pages/:id/unpublish', requirePermission('content.manage'), ah(async (req, res) => {
  const page = await prisma.page.findUniqueOrThrow({ where: { id: req.params.id } });
  if (page.kind === 'HOME') throw AppError.badRequest('The home page cannot be unpublished.');
  await prisma.page.update({ where: { id: page.id }, data: { status: 'DRAFT' } });
  await audit(req, { action: 'page.unpublish', entity: 'Page', entityId: page.id, summary: `Unpublished /${page.slug}` });
  res.json({ ok: true });
}));

cmsRouter.post('/pages/:id/discard', requirePermission('content.manage'), ah(async (req, res) => {
  await discardDraft(req.params.id);
  res.json({ ok: true });
}));

cmsRouter.post('/pages/:id/reset', requirePermission('content.manage'), ah(async (req, res) => {
  await resetPageToDefault(req.params.id, req.user!.id);
  await audit(req, { action: 'page.reset', entity: 'Page', entityId: req.params.id, summary: 'Reset draft to factory defaults' });
  res.json({ ok: true });
}));

cmsRouter.get('/pages/:id/section-defaults', requirePermission('content.manage'), ah(async (req, res) => {
  res.json({ props: await sectionDefaults(req.params.id, String(req.query.sectionId ?? ''), String(req.query.type ?? '')) });
}));

cmsRouter.post('/pages/:id/revisions/:revisionId/restore', requirePermission('content.manage'), ah(async (req, res) => {
  await restoreRevision(req.params.id, req.params.revisionId, req.user!.id);
  await audit(req, { action: 'page.restore', entity: 'Page', entityId: req.params.id, summary: `Restored revision ${req.params.revisionId} to draft` });
  res.json({ ok: true });
}));

cmsRouter.delete('/pages/:id', requirePermission('content.manage'), ah(async (req, res) => {
  const page = await prisma.page.findUniqueOrThrow({ where: { id: req.params.id } });
  if (page.isSystem) throw AppError.badRequest('System pages cannot be deleted. You can unpublish them instead.');
  await prisma.page.delete({ where: { id: page.id } });
  await audit(req, { action: 'page.delete', entity: 'Page', entityId: page.id, summary: `Deleted /${page.slug}` });
  res.json({ ok: true });
}));

// ─── Site configuration (theme builder) ─────────────────────────────────────
cmsRouter.get('/site-config', requirePermission('theme.manage'), ah(async (_req, res) => {
  res.json({ ...(await getDraftConfig()), history: await configHistory() });
}));

cmsRouter.put('/site-config/draft', requirePermission('theme.manage'), ah(async (req, res) => {
  res.json(await saveDraftConfig(req.body));
}));

cmsRouter.post('/site-config/publish', requirePermission('theme.manage'), ah(async (req, res) => {
  const result = await publishConfig(req.user!.id);
  await audit(req, { action: 'theme.publish', entity: 'SiteConfig', summary: `Published site design v${result.version}` });
  res.json(result);
}));

cmsRouter.post('/site-config/discard', requirePermission('theme.manage'), ah(async (_req, res) => {
  res.json(await discardDraftConfig());
}));

cmsRouter.post('/site-config/reset/:group', requirePermission('theme.manage'), ah(async (req, res) => {
  const result = await resetDraftGroup(req.params.group);
  await audit(req, { action: 'theme.reset', entity: 'SiteConfig', summary: `Reset ${req.params.group} to defaults (draft)` });
  res.json(result);
}));

cmsRouter.post('/site-config/restore/:id', requirePermission('theme.manage'), ah(async (req, res) => {
  const result = await restoreVersionToDraft(req.params.id);
  await audit(req, { action: 'theme.restore', entity: 'SiteConfig', entityId: req.params.id, summary: 'Restored a previous version to draft' });
  res.json(result);
}));

// ─── Media library ─────────────────────────────────────────────────────────
cmsRouter.get('/media', requirePermission('media.manage'), ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query, { pageSize: 48 });
  const where: Prisma.MediaAssetWhereInput = {};
  if (str(req.query.folder)) where.folder = str(req.query.folder);
  if (str(req.query.q)) where.alt = { contains: str(req.query.q), mode: 'insensitive' };
  const [items, total] = await Promise.all([prisma.mediaAsset.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.mediaAsset.count({ where })]);
  res.json(paged(items, total, page, pageSize));
}));

cmsRouter.post('/media', requirePermission('media.manage'), imageUpload.array('files', 10), ah(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw AppError.badRequest('Choose at least one image to upload.');
  const alt = String(req.body?.alt ?? '').slice(0, 200);
  const folder = String(req.body?.folder ?? 'general');
  const assets = [];
  for (const f of files) assets.push(await storeImage(f, { folder, alt: alt || f.originalname.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 200), userId: req.user!.id }));
  await audit(req, { action: 'media.upload', entity: 'MediaAsset', summary: `Uploaded ${assets.length} image(s)` });
  res.status(201).json({ items: assets });
}));

/** Registers an external image URL (e.g. Unsplash) in the library without uploading. */
cmsRouter.post('/media/external', requirePermission('media.manage'), ah(async (req, res) => {
  const url = String(req.body?.url ?? '');
  if (!/^https:\/\//.test(url) || url.length > 1000) throw AppError.badRequest('Provide an https:// image URL.');
  const asset = await prisma.mediaAsset.create({ data: { url, provider: 'EXTERNAL', alt: String(req.body?.alt ?? '').slice(0, 200), folder: String(req.body?.folder ?? 'general').slice(0, 40), uploadedById: req.user!.id } });
  res.status(201).json(asset);
}));

cmsRouter.patch('/media/:id', requirePermission('media.manage'), ah(async (req, res) => {
  res.json(await prisma.mediaAsset.update({ where: { id: req.params.id }, data: { alt: String(req.body?.alt ?? '').slice(0, 200), folder: String(req.body?.folder ?? 'general').slice(0, 40) } }));
}));

cmsRouter.delete('/media/:id', requirePermission('media.manage'), ah(async (req, res) => {
  await deleteMedia(req.params.id);
  await audit(req, { action: 'media.delete', entity: 'MediaAsset', entityId: req.params.id });
  res.json({ ok: true });
}));
