import type { NextFunction, Request, Response } from 'express';
import { isProd } from '../config/env';
import { AppError } from '../utils/http';
import { randomToken, safeEqual } from '../utils/crypto';

export const CSRF_COOKIE = 'aur_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection. The readable `aur_csrf` cookie must be echoed in the
 * `X-CSRF-Token` header on every state-changing request. Combined with SameSite=Lax session cookies.
 * Provider webhooks (server-to-server, signature-verified) are exempt.
 */
export function csrf(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (typeof token !== 'string' || token.length < 20) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: isProd, sameSite: 'lax', path: '/' });
    req.cookies[CSRF_COOKIE] = token;
  }
  if (SAFE.has(req.method) || req.path.startsWith('/payments/webhooks/')) return next();
  const header = req.get('x-csrf-token') ?? '';
  const cookie = req.cookies?.[CSRF_COOKIE] ?? '';
  if (!header || !safeEqual(header, cookie)) return next(new AppError(403, 'CSRF', 'Your session token is missing or expired. Please refresh the page and try again.'));
  next();
}
