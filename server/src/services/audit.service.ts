import type { Request } from 'express';
import { prisma, type Db } from '../config/prisma';
import { logger } from '../config/logger';
import { clientIp } from '../utils/http';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

const SENSITIVE = /password|token|secret|hash/i;
function scrub(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(scrub);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SENSITIVE.test(k)).map(([k, x]) => [k, scrub(x)]));
}

/** Records an admin action. Never throws (auditing must not break the operation itself). */
export async function audit(req: Request | null, entry: AuditEntry, db: Db = prisma) {
  try {
    await db.auditLog.create({
      data: {
        actorId: req?.user?.id ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? '',
        before: entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(scrub(entry.before))) as object),
        after: entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(scrub(entry.after))) as object),
        ip: req ? clientIp(req) : '',
      },
    });
  } catch (err) {
    logger.warn({ err }, 'audit log write failed');
  }
}
