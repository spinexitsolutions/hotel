import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().url().default('http://localhost:5173'),
    API_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default(''),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    SERVE_WEB: z.enum(['true', 'false']).default('false'),

    PAYMENT_PROVIDER: z.enum(['razorpay', 'sandbox']).default('sandbox'),
    RAZORPAY_KEY_ID: z.string().default(''),
    RAZORPAY_KEY_SECRET: z.string().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
    SANDBOX_PAYMENT_SECRET: z.string().default('sandbox-secret-change-me-please-0000'),

    EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend']).default('log'),
    EMAIL_FROM: z.string().default('The Aurelle <reservations@theaurelle.example>'),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    RESEND_API_KEY: z.string().default(''),

    STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(12),
    CLOUDINARY_CLOUD_NAME: z.string().default(''),
    CLOUDINARY_API_KEY: z.string().default(''),
    CLOUDINARY_API_SECRET: z.string().default(''),

    JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((e, ctx) => {
    if (e.PAYMENT_PROVIDER === 'razorpay' && (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Razorpay keys are required when PAYMENT_PROVIDER=razorpay' });
    }
    if (e.EMAIL_PROVIDER === 'smtp' && !e.SMTP_HOST) ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required for EMAIL_PROVIDER=smtp' });
    if (e.EMAIL_PROVIDER === 'resend' && !e.RESEND_API_KEY) ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required for EMAIL_PROVIDER=resend' });
    if (e.STORAGE_PROVIDER === 'cloudinary' && (!e.CLOUDINARY_CLOUD_NAME || !e.CLOUDINARY_API_KEY || !e.CLOUDINARY_API_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['CLOUDINARY_CLOUD_NAME'], message: 'Cloudinary credentials are required for STORAGE_PROVIDER=cloudinary' });
    }
    if (e.NODE_ENV === 'production') {
      if (/dev-only|change-me/.test(e.SESSION_SECRET)) ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Set a real SESSION_SECRET in production' });
      if (e.PAYMENT_PROVIDER === 'razorpay' && !e.RAZORPAY_WEBHOOK_SECRET) ctx.addIssue({ code: 'custom', path: ['RAZORPAY_WEBHOOK_SECRET'], message: 'Set RAZORPAY_WEBHOOK_SECRET in production' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
