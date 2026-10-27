import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env, isProd } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { loadSession } from './middleware/auth';
import { csrf } from './middleware/csrf';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { publicRouter } from './routes/public.routes';
import { authRouter } from './routes/auth.routes';
import { accountRouter } from './routes/account.routes';
import { bookingsRouter } from './routes/bookings.routes';
import { paymentsRouter } from './routes/payments.routes';
import { adminRouter } from './routes/admin';
import { UPLOAD_ROOT } from './services/media.service';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://www.googletagmanager.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://images.pexels.com', 'https://res.cloudinary.com', 'https://www.google-analytics.com'],
          // Hero background videos: self-hosted (/videos, /uploads) or royalty-free CDNs.
          mediaSrc: ["'self'", 'blob:', 'https://videos.pexels.com', 'https://player.vimeo.com', 'https://assets.mixkit.co', 'https://cdn.coverr.co', 'https://res.cloudinary.com'],
          connectSrc: ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com', 'https://www.google-analytics.com', 'https://*.analytics.google.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com', 'https://maps.google.com', 'https://www.youtube-nocookie.com'],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  const origins = [env.APP_URL, ...env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  app.use(cors({ origin: origins, credentials: true }));
  app.use(compression());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' || !!req.url?.startsWith('/uploads') } }));

  // JSON for everything except provider webhooks, which need the raw body for signature checks.
  const json = express.json({ limit: '1mb' });
  app.use((req, res, next) => (req.path.startsWith('/api/payments/webhooks/') ? next() : json(req, res, next)));
  app.use(cookieParser());

  app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '365d', immutable: true, index: false, dotfiles: 'deny' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$runCommandRaw({ ping: 1 });
      res.json({ ok: true, db: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(loadSession);
  api.use(csrf);
  api.get('/csrf', (req, res) => res.json({ token: req.cookies.aur_csrf }));
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/payments', paymentsRouter);
  api.use('/admin', adminRouter);
  api.use(publicRouter);
  api.use(notFoundHandler);
  app.use('/api', api);

  // Production: serve the built web app (SPA) from the same origin.
  const webDist = path.resolve(process.cwd(), '../web/dist');
  if (env.SERVE_WEB === 'true' && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: isProd ? '1y' : 0, immutable: isProd, setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
