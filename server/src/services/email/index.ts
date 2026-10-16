import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getPublishedConfig } from '../siteConfig.service';
import { emailProvider } from './provider';
import type { Brand, Rendered } from './templates';

export { templates } from './templates';

export async function getBrand(): Promise<Brand> {
  const { config } = await getPublishedConfig();
  return {
    name: config.brand.name,
    phone: config.contact.phone,
    email: config.contact.email,
    address: [config.contact.addressLine1, config.contact.addressLine2].filter(Boolean).join(', '),
    appUrl: env.APP_URL,
    primary: config.theme.colors.primary,
    dark: config.theme.colors.secondary,
  };
}

/**
 * Sends an email and records it in email_logs. Failures are logged, never thrown — a
 * failed notification must not roll back a booking or payment.
 */
export async function sendEmail(to: string, template: string, rendered: Rendered) {
  let status: 'SENT' | 'LOGGED' | 'FAILED' = 'FAILED';
  let error: string | undefined;
  try {
    status = await emailProvider.send({ to, ...rendered });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, template }, 'email send failed');
  }
  await prisma.emailLog
    .create({ data: { to, subject: rendered.subject, template, status, provider: emailProvider.name, error, html: rendered.html } })
    .catch((err) => logger.warn({ err }, 'email log write failed'));
  return status;
}

/** Fire-and-forget helper for request handlers. */
export function queueEmail(fn: () => Promise<unknown>) {
  setImmediate(() => {
    fn().catch((err) => logger.error({ err }, 'queued email failed'));
  });
}
