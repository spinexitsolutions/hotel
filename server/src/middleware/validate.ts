import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Validates & replaces req.body (or req.query) with the parsed value. ZodErrors become 422 responses. */
export const validate = <S extends ZodTypeAny>(schema: S, where: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(where === 'body' ? req.body : req.query);
    if (!result.success) return next(result.error);
    if (where === 'body') req.body = result.data;
    else (req as unknown as { validQuery: unknown }).validQuery = result.data;
    next();
  };

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);
