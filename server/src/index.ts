import { env } from './config/env';
import { logger } from './config/logger';
import { ensureIndexes, prisma } from './config/prisma';
import { createApp } from './app';
import { startJobs } from './jobs/scheduler';
import { ensureSiteConfig } from './services/siteConfig.service';
import { paymentProvider } from './services/payments';

async function main() {
  await prisma.$connect();
  await ensureIndexes();
  await ensureSiteConfig();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🏨 API listening on http://localhost:${env.PORT}`);
    logger.info(`💳 payments: ${paymentProvider.name}${paymentProvider.isTest ? ' (TEST MODE — no real money)' : ' (LIVE)'} · ✉️  email: ${env.EMAIL_PROVIDER}`);
  });
  if (env.JOBS_ENABLED === 'true') startJobs();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
