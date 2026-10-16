import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { releaseExpiredHolds } from '../services/availability.service';
import { publishScheduled } from '../services/pages.service';

async function run(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    if (result) logger.info({ job: name, result }, 'job completed');
  } catch (err) {
    logger.error({ err, job: name }, 'job failed');
  }
}

/** In-process scheduler. Every job is idempotent, so running several API instances is safe. */
export function startJobs() {
  cron.schedule('* * * * *', () => run('expire-holds', () => releaseExpiredHolds(prisma)));
  cron.schedule('* * * * *', () => run('scheduled-publishing', publishScheduled));
  cron.schedule('17 3 * * *', () => run('cleanup', async () => {
    const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const tokens = await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const notifications = await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
    return sessions.count + tokens.count + notifications.count;
  }));
  logger.info('⏱  background jobs scheduled');
}
