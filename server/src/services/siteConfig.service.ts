import { defaultSiteConfig, siteConfigSchema, type SiteConfig } from '@aurelle/shared';
import { prisma, runTransaction, type Prisma } from '../config/prisma';

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
import { AppError } from '../utils/http';

let publishedCache: { config: SiteConfig; version: number; publishedAt: Date | null } | null = null;

/** Merge stored data over defaults so newly-added config keys always have values. */
function hydrate(data: unknown): SiteConfig {
  const d = defaultSiteConfig();
  const stored = (data ?? {}) as Partial<SiteConfig>;
  const merged = { ...d } as Record<string, unknown>;
  for (const key of Object.keys(d) as (keyof SiteConfig)[]) {
    const v = stored[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) merged[key] = { ...(d[key] as object), ...(v as object) };
    else if (v !== undefined) merged[key] = v;
  }
  const parsed = siteConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : d;
}

export async function ensureSiteConfig() {
  const count = await prisma.siteConfig.count();
  if (count > 0) return;
  const data = defaultSiteConfig();
  await prisma.siteConfig.createMany({
    data: [
      { status: 'PUBLISHED', version: 1, data: asJson(data), publishedAt: new Date() },
      { status: 'DRAFT', version: 1, data: asJson(data) },
    ],
  });
}

export async function getPublishedConfig() {
  if (publishedCache) return publishedCache;
  await ensureSiteConfig();
  const row = await prisma.siteConfig.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
  publishedCache = { config: hydrate(row.data), version: row.version, publishedAt: row.publishedAt };
  return publishedCache;
}

export async function getDraftConfig() {
  await ensureSiteConfig();
  const [draft, published] = await Promise.all([
    prisma.siteConfig.findFirstOrThrow({ where: { status: 'DRAFT' } }),
    prisma.siteConfig.findFirstOrThrow({ where: { status: 'PUBLISHED' } }),
  ]);
  const draftConfig = hydrate(draft.data);
  const publishedConfig = hydrate(published.data);
  return {
    config: draftConfig,
    version: published.version,
    updatedAt: draft.updatedAt,
    publishedAt: published.publishedAt,
    hasUnpublishedChanges: JSON.stringify(draftConfig) !== JSON.stringify(publishedConfig),
  };
}

export async function saveDraftConfig(input: unknown) {
  const config = siteConfigSchema.parse(input);
  await ensureSiteConfig();
  await prisma.siteConfig.updateMany({ where: { status: 'DRAFT' }, data: { data: asJson(config) } });
  return getDraftConfig();
}

export async function publishConfig(userId: string) {
  await runTransaction(async (tx) => {
    const draft = await tx.siteConfig.findFirstOrThrow({ where: { status: 'DRAFT' } });
    const current = await tx.siteConfig.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
    const config = siteConfigSchema.parse(hydrate(draft.data));
    await tx.siteConfig.update({ where: { id: current.id }, data: { status: 'ARCHIVED' } });
    await tx.siteConfig.create({ data: { status: 'PUBLISHED', version: current.version + 1, data: asJson(config), publishedAt: new Date(), publishedById: userId } });
  });
  publishedCache = null;
  return getDraftConfig();
}

export async function discardDraftConfig() {
  const published = await prisma.siteConfig.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
  await prisma.siteConfig.updateMany({ where: { status: 'DRAFT' }, data: { data: published.data ?? {} } });
  return getDraftConfig();
}

/** Resets one top-level group (theme, header, footer…) of the draft to factory defaults. */
export async function resetDraftGroup(group: string) {
  const defaults = defaultSiteConfig() as Record<string, unknown>;
  if (!(group in defaults)) throw AppError.badRequest('Unknown settings group.');
  const { config } = await getDraftConfig();
  const next = { ...config, [group]: defaults[group] };
  return saveDraftConfig(next);
}

export async function configHistory() {
  return prisma.siteConfig.findMany({
    where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    orderBy: { version: 'desc' },
    take: 20,
    select: { id: true, version: true, status: true, publishedAt: true, publishedById: true },
  });
}

/** Loads a historical version into the draft (it still has to be published). */
export async function restoreVersionToDraft(id: string) {
  const row = await prisma.siteConfig.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Version');
  return saveDraftConfig(hydrate(row.data));
}

export function invalidateSiteConfigCache() {
  publishedCache = null;
}
