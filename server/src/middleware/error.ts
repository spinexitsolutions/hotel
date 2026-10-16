import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { PricingError } from '@aurelle/shared';
import { AppError } from '../utils/http';
import { logger } from '../config/logger';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    return res.status(422).json({ error: { code: 'VALIDATION', message: Object.values(fields)[0] ?? 'Invalid input.', fields } });
  }
  if (err instanceof PricingError) {
    return res.status(422).json({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD', message: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : 'Upload failed.' } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with that value already exists.', fields: { [String((err.meta?.target as string[] | undefined)?.[0] ?? '_')]: 'Already in use' } } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
    if (err.code === 'P2003') return res.status(409).json({ error: { code: 'IN_USE', message: 'This record is referenced by other data and cannot be removed. Archive it instead.' } });
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
}
