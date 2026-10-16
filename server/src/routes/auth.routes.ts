import { Router } from 'express';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, profileSchema, registerSchema, resetPasswordSchema } from '@aurelle/shared';
import { prisma } from '../config/prisma';
import { ah } from '../utils/http';
import { sha256 } from '../utils/crypto';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { changePassword, createSession, login, registerCustomer, requestPasswordReset, resetPassword } from '../services/auth.service';
import { audit } from '../services/audit.service';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, email, name, phone, roleKey, permissions, isStaff } = req.user;
  res.json({ user: { id, email, name, phone, roleKey, permissions, isStaff } });
});

authRouter.post('/login', authLimiter, validate(loginSchema), ah(async (req, res) => {
  const user = await login(req.body.email, req.body.password);
  // Prevent session fixation: drop any existing session cookie first.
  const old = req.cookies?.[SESSION_COOKIE];
  if (old) await prisma.session.deleteMany({ where: { tokenHash: sha256(old) } });
  await createSession(res, req, user.id);
  if (user.role.key !== 'CUSTOMER') {
    req.user = { id: user.id, email: user.email, name: user.name, phone: user.phone, roleKey: user.role.key, permissions: user.role.permissions, isStaff: true, sessionId: '' };
    await audit(req, { action: 'auth.login', entity: 'User', entityId: user.id, summary: `Staff sign-in (${user.role.key})` });
  }
  res.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, roleKey: user.role.key, permissions: user.role.key === 'SUPER_ADMIN' ? ['*'] : user.role.permissions, isStaff: user.role.key !== 'CUSTOMER' } });
}));

authRouter.post('/register', authLimiter, validate(registerSchema), ah(async (req, res) => {
  const user = await registerCustomer(req.body);
  await createSession(res, req, user.id);
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, roleKey: 'CUSTOMER', permissions: [], isStaff: false } });
}));

authRouter.post('/logout', ah(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}));

authRouter.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), ah(async (req, res) => {
  await requestPasswordReset(req.body.email);
  res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
}));

authRouter.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), ah(async (req, res) => {
  await resetPassword(req.body.token, req.body.password);
  res.json({ ok: true });
}));

authRouter.post('/change-password', requireAuth, authLimiter, validate(changePasswordSchema), ah(async (req, res) => {
  await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword, req.user!.sessionId);
  res.json({ ok: true });
}));

authRouter.patch('/profile', requireAuth, validate(profileSchema), ah(async (req, res) => {
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: { name: req.body.name, phone: req.body.phone, country: req.body.country, ...(req.body.marketingOptIn != null ? { marketingOptIn: req.body.marketingOptIn } : {}) } });
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, country: u.country, marketingOptIn: u.marketingOptIn } });
}));
