import { Router } from 'express';
import type { ZodTypeAny } from 'zod';
import type { Permission } from '@aurelle/shared';
import { prisma } from '../../config/prisma';
import { AppError, ah, pageParams, paged, str } from '../../utils/http';
import { requirePermission } from '../../middleware/auth';
import { audit } from '../../services/audit.service';

type Delegate = {
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  findUnique(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<{ id: string }>;
  delete(args: unknown): Promise<unknown>;
};

export interface CrudOptions {
  model: keyof typeof prisma & string;
  entity: string;
  schema: ZodTypeAny;
  permission: Permission;
  viewPermission?: Permission;
  searchFields?: string[];
  orderBy?: unknown;
  toData?: (body: Record<string, unknown>) => Record<string, unknown>;
  serialize?: (row: Record<string, unknown>) => unknown;
  filters?: (q: Record<string, unknown>) => Record<string, unknown>;
  label?: (row: Record<string, unknown>) => string;
  afterChange?: () => void | Promise<void>;
}

/** Standard list/get/create/update/delete endpoints with validation, permission checks and audit logging. */
export function crudRouter(o: CrudOptions) {
  const r = Router();
  const db = (prisma as unknown as Record<string, Delegate>)[o.model];
  const ser = o.serialize ?? ((x) => x);
  const toData = o.toData ?? ((b) => b);
  const label = o.label ?? ((x) => String(x.name ?? x.title ?? x.code ?? x.question ?? x.id));

  r.get('/', requirePermission(o.viewPermission ?? o.permission), ah(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, { pageSize: 50 });
    const q = str(req.query.q);
    const where: Record<string, unknown> = { ...(o.filters?.(req.query as Record<string, unknown>) ?? {}) };
    if (q && o.searchFields?.length) where.OR = o.searchFields.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
    const [items, total] = await Promise.all([db.findMany({ where, orderBy: o.orderBy ?? { createdAt: 'desc' }, skip, take }), db.count({ where })]);
    res.json(paged(items.map((i) => ser(i as Record<string, unknown>)), total, page, pageSize));
  }));

  r.get('/:id', requirePermission(o.viewPermission ?? o.permission), ah(async (req, res) => {
    const row = await db.findUnique({ where: { id: req.params.id } });
    if (!row) throw AppError.notFound(o.entity);
    res.json(ser(row as Record<string, unknown>));
  }));

  r.post('/', requirePermission(o.permission), ah(async (req, res) => {
    const body = o.schema.parse(req.body);
    const row = await db.create({ data: toData(body) });
    await audit(req, { action: `${o.entity.toLowerCase()}.create`, entity: o.entity, entityId: row.id, summary: `Created ${label(row as Record<string, unknown>)}`, after: row });
    await o.afterChange?.();
    res.status(201).json(ser(row as Record<string, unknown>));
  }));

  r.put('/:id', requirePermission(o.permission), ah(async (req, res) => {
    const before = await db.findUnique({ where: { id: req.params.id } });
    if (!before) throw AppError.notFound(o.entity);
    const body = o.schema.parse(req.body);
    const row = await db.update({ where: { id: req.params.id }, data: toData(body) });
    await audit(req, { action: `${o.entity.toLowerCase()}.update`, entity: o.entity, entityId: row.id, summary: `Updated ${label(row as Record<string, unknown>)}`, before, after: row });
    await o.afterChange?.();
    res.json(ser(row as Record<string, unknown>));
  }));

  r.delete('/:id', requirePermission(o.permission), ah(async (req, res) => {
    const before = await db.findUnique({ where: { id: req.params.id } });
    if (!before) throw AppError.notFound(o.entity);
    await db.delete({ where: { id: req.params.id } });
    await audit(req, { action: `${o.entity.toLowerCase()}.delete`, entity: o.entity, entityId: req.params.id, summary: `Deleted ${label(before as Record<string, unknown>)}`, before });
    await o.afterChange?.();
    res.json({ ok: true });
  }));

  return r;
}
