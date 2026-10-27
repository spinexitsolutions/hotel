# Deployment, Integrations & Operations

## Portfolio demo on Render (free)

This repository is a **portfolio concept** of Rambagh Palace. Host it under your own name and domain (for example
`rambagh-palace-concept.onrender.com`), never one that could pass for the real hotel. `render.yaml` keeps payments in
sandbox mode (`CONCEPT_DEMO=true`) and every page shows the "not affiliated" notice.

1. **Database:** create a free MongoDB Atlas M0 cluster. Add a database user, allow access from anywhere (`0.0.0.0/0`,
   since Render's free plan has no fixed IP), and copy the `mongodb+srv://…` URI. Add `/hotel` as the database name
   before the `?`.
2. **Web service:** in Render choose **New → Blueprint**, connect this GitHub repository and select the branch. Render
   reads `render.yaml` and asks for:
   - `DATABASE_URL`: the Atlas URI.
   - `APP_URL` and `API_URL`: the service URL Render shows, e.g. `https://rambagh-palace-concept.onrender.com`.
     If you don't know it yet, deploy once, then set both and redeploy.
   - `SEED_STAFF_PASSWORD`: the admin password you want for the demo staff accounts.
3. On the first start the database is empty, so the server loads the demo data (`SEED_DEMO_ON_EMPTY=true`). It does
   this only while the database has no users, and never touches existing data.
4. Open the site, then sign in at `/admin` with `admin@rambagh-concept.example` and your `SEED_STAFF_PASSWORD`.

The free plan sleeps after inactivity, so the first visit can take up to a minute. Uploaded images are lost on
redeploys; use Cloudinary (`STORAGE_PROVIDER=cloudinary`) if you upload your own.

## Production checklist

1. Provision **MongoDB 6+ as a replica set**. Prisma needs transactions, which standalone `mongod` doesn't support. MongoDB Atlas is the easiest; M0 is free, M10+ is for production. Other options are a self-hosted replica set or another provider. In Atlas, add a database user and allow your server's IP under Network Access. Then use the `mongodb+srv://…/hotel?retryWrites=true&w=majority` URI as `DATABASE_URL`.
2. Set environment variables from `.env.example` with real values:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (`openssl rand -base64 48`)
   - `DATABASE_URL`
   - `APP_URL` and `API_URL` (your https domain)
   - `TRUST_PROXY` (1 behind one load balancer)
   - Payment, email and storage settings as below.
3. Build and run (Docker): `docker build -t aurelle .`, then run with the env vars and a persistent volume at `/app/server/uploads` (unless you use Cloudinary). The container runs `prisma db push` on start (it only creates collections and indexes and never drops data). The API also ensures its partial unique indexes on boot. and serves both the API and the built website on port 4000.
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
npm run db:deploy
SERVE_WEB=true NODE_ENV=production node --env-file=.env dist/index.js
```

You can also host `web/dist` on a CDN (Netlify, Vercel, CloudFront). Configure it to proxy `/api/*` and `/uploads/*` to the API and to fall back to `index.html` for SPA routes. Keeping the site and the API on the **same origin** is recommended: the session cookie uses SameSite=Lax and CSRF uses a same-site cookie.

### Scaling

The API is stateless. Sessions live in MongoDB, so you can run several instances behind a load balancer. The scheduled jobs (expiring unpaid holds, scheduled publishing, cleanup) are idempotent and safe to run on every instance. To run them on one instance only, set `JOBS_ENABLED=false` on the others. With multiple instances, use Cloudinary or shared storage for uploads.

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

- **Database:** enable automated backups on your managed MongoDB. Atlas offers continuous backups and point-in-time restores on M10+; on M0, export regularly. For self-hosting or exports:
  `mongodump --uri="$DATABASE_URL" --archive=aurelle-$(date +%F).archive.gz --gzip`
  Run it nightly and keep at least 30 days off-site, for example in an S3 bucket with lifecycle rules.
  Restore with `mongorestore --uri="$DATABASE_URL" --archive=aurelle-YYYY-MM-DD.archive.gz --gzip --drop`, then run `npm run db:deploy` to recreate the indexes.
- **Uploads:** back up the uploads volume (`rsync`/`restic` to object storage), or use Cloudinary.
- **Test restores** quarterly into a staging database. Run `npm run db:deploy` against it and check that the API's `/api/health` responds.
- **Upgrades:** deploy new code. Index changes from `schema.prisma` apply automatically on start. MongoDB is schemaless, so new optional fields need no migration. Review `git diff server/prisma/schema.prisma` before each release.
- **Monitoring:** `GET /api/health` returns 200 when the database is reachable. Logs are structured JSON (pino) on stdout, with secrets redacted.
- **Data retention:** the cleanup job deletes expired sessions and reset tokens, plus notifications older than 90 days. Bookings and payments are retained for tax compliance.
- **Rotating secrets:** changing `SESSION_SECRET` is safe; sessions are database-backed and the secret is used only for signing helpers. To force everyone to sign in again, delete the documents in the `sessions` collection. Rotate Razorpay keys in the dashboard and update the env vars together.
