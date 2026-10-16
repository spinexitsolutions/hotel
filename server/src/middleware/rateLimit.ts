import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const make = (windowMinutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit: isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const authLimiter = make(15, 20, 'Too many sign-in attempts. Please wait a few minutes and try again.');
export const passwordResetLimiter = make(60, 5, 'Too many password reset requests. Please try again later.');
export const formLimiter = make(10, 10, 'Too many submissions. Please try again shortly.');
export const bookingLimiter = make(10, 15, 'Too many booking attempts. Please wait a moment.');
export const quoteLimiter = make(1, 60, 'Too many requests. Please slow down.');
export const paymentLimiter = make(10, 30, 'Too many payment attempts. Please wait a moment.');
export const apiLimiter = make(1, 600, 'Too many requests.');
