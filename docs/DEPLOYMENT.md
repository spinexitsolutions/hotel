# Deployment, Integrations & Operations

## Production checklist

1. Provision **PostgreSQL 14+** (managed: Neon, Supabase, RDS, Cloud SQL). The first migration creates the `btree_gist` extension. On managed services it is usually allow-listed; otherwise ask your provider to enable it.
2. Set environment variables from `.env.example` with real values:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (`openssl rand -base64 48`)
   - `DATABASE_URL`
   - `APP_URL` and `API_URL` (your https domain)
   - `TRUST_PROXY` (1 behind one load balancer)
   - Payment, email and storage settings as below.
3. Build and run (Docker): `docker build -t aurelle .`, then run with the env vars and a persistent volume at `/app/server/uploads` (unless you use Cloudinary). The container runs `prisma migrate deploy` on start and serves both the API and the built website on port 4000.
4. Create the first admin: `docker exec -it <container> npx tsx src/scripts/createAdmin.ts --email you@hotel.com --name "Your Name"`. Outside Docker, run `npm run create-admin -- --email …`.
5. Put HTTPS in front (load balancer, Caddy, nginx or Cloudflare). Cookies are `Secure` in production, so HTTPS is required.
6. Sign in at `/admin`. Then:
   - **Theme & site:** set the brand, logo, colours, contact details, social links, SEO and GA4 ID.
   - **Rooms:** upload your own photography.
   - **Pricing:** check taxes and seasonal rates.
   - **Settings:** check the booking policy, deposit and cancellation rules, and the staff notification emails.
7. Run a test booking with Razorpay test keys, then switch to live keys.

### Without Docker

```bash
npm ci && npm run build
cd server && npx prisma migrate deploy
SERVE_WEB=true NODE_ENV=production node --env-file=.env dist/index.js
```

You can also host `web/dist` on a CDN (Netlify, Vercel, CloudFront). Configure it to proxy `/api/*` and `/uploads/*` to the API and to fall back to `index.html` for SPA routes. Keeping the site and the API on the **same origin** is recommended: the session cookie uses SameSite=Lax and CSRF uses a same-site cookie.

### Scaling

The API is stateless. Sessions live in PostgreSQL, so you can run several instances behind a load balancer. The scheduled jobs (expiring unpaid holds, scheduled publishing, cleanup) are idempotent and safe to run on every instance. To run them on one instance only, set `JOBS_ENABLED=false` on the others. With multiple instances, use Cloudinary or shared storage for uploads.

## Razorpay

1. Create a Razorpay account and open **Account & Settings → API Keys**. Generate **Test Mode** keys first.
2. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID=rzp_test_…` and `RAZORPAY_KEY_SECRET=…`.
3. **Webhooks → Add new webhook:**
   - URL: `https://YOUR_DOMAIN/api/payments/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`
   - Set a secret and put it in `RAZORPAY_WEBHOOK_SECRET`.
4. Enable **automatic capture** in Razorpay payment settings so authorised payments are captured.
5. Test with Razorpay test cards and UPI IDs. Bookings are marked **TEST** wherever test payments appear.
6. To go live, swap in the `rzp_live_…` keys and the live webhook secret. Admin → Settings → Integrations shows the current mode.

How it works:
- The server creates the order for the amount it computed itself.
- The browser opens Razorpay Checkout.
- The server verifies `HMAC_SHA256(order_id|payment_id, key_secret)`, and only then confirms the booking.
- The webhook is a backup path for closed browsers. Both paths are idempotent: unique payment IDs, and webhook events deduplicated by `x-razorpay-event-id`.
- Refunds are issued from the booking page (`refunds.manage`) through the Razorpay Refunds API. Refund status is tracked separately from booking status.
- No card data ever reaches this application.

To add another gateway, implement `PaymentProvider` (`server/src/services/payments/provider.ts`) and select it in `payments/index.ts`.

## Email

| `EMAIL_PROVIDER` | Configuration |
|---|---|
| `log` (default) | Nothing is sent. Every message is stored and viewable in **Admin → Settings → Email outbox**. |
| `smtp` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (works with SES SMTP, SendGrid SMTP, Postmark, Gmail Workspace, …) |
| `resend` | `RESEND_API_KEY` |

Set `EMAIL_FROM` to an address on a domain with SPF and DKIM configured. Emails sent:
- guest: booking received or confirmed, status updates, cancellation, refund issued, payment failed, contact acknowledgement, welcome, newsletter welcome, password reset
- staff: new booking, new inquiry, refund required (sent to `notificationEmails` in booking settings, alongside in-app notifications)

Email failures are logged and never roll back a booking.

## Media storage

- **`local`** (default): uploads are decoded with sharp, stripped of EXIF/GPS, and saved as WebP at 480/960/1600/2400px under `UPLOAD_DIR`. They are served at `/uploads` with year-long immutable caching. Use a persistent volume.
- **`cloudinary`**: set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Images are served through Cloudinary with automatic format, quality and width.

Admins can also register external image URLs, such as Unsplash, in the library.

## Analytics, maps and WhatsApp

- **Google Analytics 4:** set the measurement ID in Admin → Theme & site → Integrations. It loads only after a visitor accepts analytics cookies.
- **Google Maps:** uses the keyless embed of the address in Contact & map. It loads on click, or automatically once consent is given.
- **WhatsApp:** set the number (country code, digits only) and the greeting in Contact & map. The floating button can be switched off.

## Backups & maintenance

- **Database:** enable automated daily backups with point-in-time recovery on your managed PostgreSQL. For self-hosting:
  `pg_dump --format=custom --file=aurelle-$(date +%F).dump "$DATABASE_URL"`
  Run it nightly and keep at least 30 days off-site, for example in an S3 bucket with lifecycle rules.
  Restore with `pg_restore --clean --if-exists -d "$DATABASE_URL" aurelle-YYYY-MM-DD.dump`.
- **Uploads:** back up the uploads volume (`rsync`/`restic` to object storage), or use Cloudinary.
- **Test restores** quarterly into a staging database. Run `npx prisma migrate status` against it.
- **Upgrades:** deploy new code. Migrations apply automatically on start and are forward-only; review the SQL in `server/prisma/migrations` before each release.
- **Monitoring:** `GET /api/health` returns 200 when the database is reachable. Logs are structured JSON (pino) on stdout, with secrets redacted.
- **Data retention:** the cleanup job deletes expired sessions and reset tokens, plus notifications older than 90 days. Bookings and payments are retained for tax compliance.
- **Rotating secrets:** changing `SESSION_SECRET` is safe; sessions are database-backed and the secret is used only for signing helpers. To force everyone to sign in again, delete the rows in `sessions`. Rotate Razorpay keys in the dashboard and update the env vars together.
