import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  name: string;
  send(msg: OutgoingEmail): Promise<'SENT' | 'LOGGED'>;
}

class LogProvider implements EmailProvider {
  name = 'log';
  async send(msg: OutgoingEmail) {
    logger.info({ to: msg.to, subject: msg.subject }, '✉️  [email:log] not sent — EMAIL_PROVIDER=log (stored in email_logs)');
    return 'LOGGED' as const;
  }
}

class SmtpProvider implements EmailProvider {
  name = 'smtp';
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  async send(msg: OutgoingEmail) {
    await this.transport.sendMail({ from: env.EMAIL_FROM, ...msg });
    return 'SENT' as const;
  }
}

class ResendProvider implements EmailProvider {
  name = 'resend';
  async send(msg: OutgoingEmail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return 'SENT' as const;
  }
}

export const emailProvider: EmailProvider =
  env.EMAIL_PROVIDER === 'smtp' ? new SmtpProvider() : env.EMAIL_PROVIDER === 'resend' ? new ResendProvider() : new LogProvider();
