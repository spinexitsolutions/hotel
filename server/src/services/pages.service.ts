import { defaultSectionProps, pageContentSchema, pageDraftSchema, SECTION_REGISTRY, type SectionType } from '@aurelle/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/http';
import { defaultPage, defaultSection } from '../content/pages';

export type PageContentJson = { sections: { id: string; type: string; enabled: boolean; props: Record<string, unknown> }[]; seo: Record<string, unknown> };

export async function publishedPage(slug: string) {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page || page.status !== 'PUBLISHED' || !page.published) return null;
  return { slug: page.slug, title: page.title, kind: page.kind, content: page.published as PageContentJson, publishedAt: page.publishedAt, updatedAt: page.updatedAt };
}

export async function draftPage(slug: string) {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return null;
  // Previews tolerate incomplete drafts: invalid section props fall back to defaults.
  const draft = page.draft as PageContentJson;
  const sections = draft.sections.map((s) => {
    const def = SECTION_REGISTRY[s.type as SectionType];
    if (!def) return null;
    const parsed = def.schema.safeParse(s.props);
    return { ...s, props: parsed.success ? parsed.data : { ...defaultSectionProps(s.type as SectionType), ...s.props } };
  }).filter(Boolean);
  return { slug: page.slug, title: page.title, kind: page.kind, content: { ...draft, sections }, publishedAt: page.publishedAt, updatedAt: page.updatedAt };
}

export async function saveDraft(id: string, input: unknown, userId: string) {
  const content = pageDraftSchema.parse(input);
  return prisma.page.update({ where: { id }, data: { draft: content as Prisma.InputJsonValue, hasUnpublishedChanges: true, updatedById: userId } });
}

/** Strictly validates the draft and makes it live. A revision snapshot is kept for rollback. */
export async function publishPage(id: string, userId: string) {
  const page = await prisma.page.findUniqueOrThrow({ where: { id } });
  const result = pageContentSchema.safeParse(page.draft);
  if (!result.success) {
    const issue = result.error.issues[0];
    const sectionIdx = typeof issue.path[1] === 'number' ? issue.path[1] : null;
    const section = sectionIdx != null ? (page.draft as PageContentJson).sections[sectionIdx] : null;
    throw new AppError(422, 'INVALID_CONTENT', `Cannot publish: ${section ? `section “${SECTION_REGISTRY[section.type as SectionType]?.label ?? section.type}” — ` : ''}${issue.message} (${issue.path.slice(2).join('.')})`, { issues: result.error.issues.slice(0, 10) });
  }
  const content = result.data as unknown as Prisma.InputJsonValue;
  return prisma.$transaction(async (tx) => {
    await tx.pageRevision.create({ data: { pageId: id, data: content, note: 'Published', createdById: userId } });
    // Keep the 30 most recent revisions.
    const old = await tx.pageRevision.findMany({ where: { pageId: id }, orderBy: { createdAt: 'desc' }, skip: 30, select: { id: true } });
    if (old.length) await tx.pageRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return tx.page.update({ where: { id }, data: { published: content, status: 'PUBLISHED', publishedAt: new Date(), scheduledAt: null, hasUnpublishedChanges: false, updatedById: userId } });
  });
}

export async function discardDraft(id: string) {
  const page = await prisma.page.findUniqueOrThrow({ where: { id } });
  if (!page.published) throw AppError.badRequest('This page has never been published.');
  return prisma.page.update({ where: { id }, data: { draft: page.published as Prisma.InputJsonValue, hasUnpublishedChanges: false } });
}

/** Returns the factory default for a section: the seeded content if the section came from a seed, else registry defaults. */
export async function sectionDefaults(pageId: string, sectionId: string, type: string) {
  const page = await prisma.page.findUniqueOrThrow({ where: { id: pageId } });
  const seeded = defaultSection(page.slug, sectionId);
  if (seeded && seeded.type === type) return seeded.props;
  if (!(type in SECTION_REGISTRY)) throw AppError.badRequest('Unknown section type.');
  return defaultSectionProps(type as SectionType);
}

export async function resetPageToDefault(id: string, userId: string) {
  const page = await prisma.page.findUniqueOrThrow({ where: { id } });
  const def = defaultPage(page.slug);
  if (!def) throw AppError.badRequest('This page has no factory default.');
  return prisma.page.update({ where: { id }, data: { draft: { sections: def.sections.map((s) => ({ ...s, enabled: s.enabled ?? true })), seo: def.seo } as Prisma.InputJsonValue, hasUnpublishedChanges: true, updatedById: userId } });
}

export async function restoreRevision(pageId: string, revisionId: string, userId: string) {
  const rev = await prisma.pageRevision.findFirst({ where: { id: revisionId, pageId } });
  if (!rev) throw AppError.notFound('Revision');
  return prisma.page.update({ where: { id: pageId }, data: { draft: rev.data as Prisma.InputJsonValue, hasUnpublishedChanges: true, updatedById: userId } });
}

/** Called by the scheduler: publishes pages and blog posts whose scheduled time has passed. */
export async function publishScheduled() {
  const due = await prisma.page.findMany({ where: { scheduledAt: { lte: new Date() } }, select: { id: true, updatedById: true } });
  for (const p of due) {
    try {
      await publishPage(p.id, p.updatedById ?? 'system');
    } catch {
      await prisma.page.update({ where: { id: p.id }, data: { scheduledAt: null } });
    }
  }
  const posts = await prisma.blogPost.updateMany({ where: { status: 'SCHEDULED', publishedAt: { lte: new Date() } }, data: { status: 'PUBLISHED' } });
  return due.length + posts.count;
}
