import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError, clientIp } from '../utils/http';
import { randomToken, sha256 } from '../utils/crypto';
import { SESSION_COOKIE, sessionCookieOptions } from '../middleware/auth';
import { getBrand, queueEmail, sendEmail, templates } from './email';

const BCRYPT_COST = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Pre-computed hash so unknown-email logins take as long as real ones (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', BCRYPT_COST);

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);

export async function createSession(res: Response, req: Request, userId: string) {
  const token = randomToken(32);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000), ip: clientIp(req), userAgent: (req.get('user-agent') ?? '').slice(0, 300) },
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { role: true } });
  const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'This account is temporarily locked after several failed attempts. Try again in a few minutes or reset your password.');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
    throw invalid;
  }
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Please contact the hotel.');
  return user;
}

export async function registerCustomer(input: { name: string; email: string; phone: string; password: string; marketingOptIn: boolean }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in or resetting your password.', { fields: { email: 'Already registered' } });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'CUSTOMER' } });
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password), roleId: role.id, marketingOptIn: input.marketingOptIn },
  });
  // Link earlier guest-checkout bookings made with the same email.
  await prisma.booking.updateMany({ where: { guestEmail: input.email, userId: null }, data: { userId: user.id } });
  queueEmail(async () => sendEmail(user.email, 'auth.welcome', templates.welcome(await getBrand(), { name: user.name })));
  return user;
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) return; // same response either way
  const token = randomToken(32);
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({ data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const url = `${env.APP_URL}/reset-password?token=${token}`;
  queueEmail(async () => sendEmail(user.email, 'auth.reset', templates.passwordReset(await getBrand(), { name: user.name, url })));
}

export async function resetPassword(token: string, password: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw AppError.badRequest('This reset link is invalid or has expired.', 'TOKEN_INVALID');
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: row.userId } }), // sign out everywhere
  ]);
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) throw new AppError(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect.', { fields: { currentPassword: 'Incorrect password' } });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
}
