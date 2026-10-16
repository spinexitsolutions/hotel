import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) { return new AppError(400, code, message, details); }
  static unauthorized(message = 'Please sign in to continue.') { return new AppError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'You do not have permission to do that.') { return new AppError(403, 'FORBIDDEN', message); }
  static notFound(what = 'Resource') { return new AppError(404, 'NOT_FOUND', `${what} not found.`); }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) { return new AppError(409, code, message, details); }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export const ah = (fn: AsyncHandler): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export function clientIp(req: Request): string {
  return (req.ip ?? '').slice(0, 64);
}

export function pageParams(q: Record<string, unknown>, defaults = { pageSize: 25 }) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || defaults.pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
