import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type Permission } from '@aurelle/shared';
import { prisma } from '../config/prisma';
import { env, isProd } from '../config/env';
import { AppError } from '../utils/http';
import { sha256 } from '../utils/crypto';

export const SESSION_COOKIE = 'aur_sid';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  roleKey: string;
  permissions: string[];
  isStaff: boolean;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: env.SESSION_TTL_DAYS * 86_400_000,
});

/** Resolves the session cookie to a user, re-reading role & permissions from the DB on every request. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20) {
      const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { role: true } } } });
      if (session && session.expiresAt > new Date() && session.user.isActive) {
        const u = session.user;
        req.user = {
          id: u.id, email: u.email, name: u.name, phone: u.phone, roleKey: u.role.key,
          permissions: u.role.key === 'SUPER_ADMIN' ? ['*'] : u.role.permissions,
          isStaff: u.role.key !== 'CUSTOMER', sessionId: session.id,
        };
        // Sliding expiry, written at most every 10 minutes.
        if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
          await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000) } });
        }
      } else if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
        res.clearCookie(SESSION_COOKIE, { path: '/' });
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(AppError.unauthorized());
  next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.isStaff) return next(AppError.forbidden());
  next();
}

/** Requires ALL listed permissions. */
export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!req.user.isStaff) return next(AppError.forbidden());
    const ok = perms.every((p) => can(req.user, p));
    if (!ok) return next(AppError.forbidden());
    next();
  };
}

export function can(user: AuthUser | undefined, p: Permission): boolean {
  if (!user) return false;
  if (user.permissions.includes('*')) return true;
  return hasPermission(user, p);
}
