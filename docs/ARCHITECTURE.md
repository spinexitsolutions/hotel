# The Aurelle — Architecture

A luxury hotel website, booking engine and admin platform. Everything a hotel normally edits — theme, imagery,
navigation, page sections, rooms, rates, offers, policies — lives in MongoDB and is managed from `/admin`.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web | React 19 + Vite + TypeScript, Tailwind CSS, Motion, Lenis, React Three Fiber | Fast SPA with route-level code splitting; theme tokens become CSS variables so admin edits restyle the site live |
| Data fetching / forms | TanStack Query, react-hook-form + zod | Same zod schemas validate on client and server |
| API | Node 20+, Express 4, TypeScript | Thin route layer over services |
| Database | MongoDB (replica set, e.g. Atlas) + Prisma 6 | Free managed hosting (Atlas M0), multi-document transactions, unique indexes for overbooking safety; Prisma keeps the typed, relational-style API |
| Auth | Server-side sessions (opaque token, SHA-256 hashed in DB) in an httpOnly cookie + double-submit CSRF | Revocable instantly, no tokens in JS |
| Payments | Provider interface → Razorpay (live/test keys) or a clearly-labelled Sandbox provider | Swappable gateway; signature + webhook verification |
| Email | Provider interface → SMTP (nodemailer) / Resend API / Log (stored in `email_logs`) | Works with zero config in development |
| Media | Upload → validated & re-encoded with sharp to responsive WebP variants → local disk or Cloudinary | No raw user files are ever served |
| Charts | Recharts | Admin dashboard & reports |

## Folder structure

```
hotel/
├─ shared/                 @aurelle/shared — used by BOTH server and web
│  └─ src/  money.ts       integer paise helpers, proportional allocation
│           dates.ts       UTC calendar-date helpers for stays
│           pricing.ts     deterministic pricing engine (rates, seasons, weekends, holidays, extras,
│                          meal plans, add-ons, offers, coupons, slab taxes, deposits, cancellation)
│           sections.ts    CMS section registry (zod schema + admin field metadata + defaults)
│           theme.ts       theme tokens, presets, site config (brand, nav, footer, contact, SEO…)
│           settings.ts    operational booking/payment policy settings
│           permissions.ts roles → permissions matrix
│           schemas.ts     every API request schema
├─ server/
│  ├─ prisma/              schema.prisma (MongoDB; applied with `prisma db push`)
│  └─ src/
│     ├─ config/           env (zod-validated), prisma client, logger
│     ├─ middleware/       sessions/auth, permission guard, CSRF, rate limits, validation, uploads, errors
│     ├─ services/         availability, booking, pricing context, payments/*, email/*, media/storage,
│     │                    site config/CMS, settings, reports, audit, notifications
│     ├─ routes/           public/*, account, admin/*, payments (+ webhooks)
│     ├─ jobs/             hold expiry, scheduled publishing, session cleanup
│     └─ scripts/          seed (demo hotel), create-admin
│  └─ tests/               vitest + supertest against a real MongoDB test database
├─ web/
│  └─ src/
│     ├─ app/              router, providers (site config → CSS variables, auth, query client)
│     ├─ components/       UI kit + public chrome (header, footer, booking bar, image, cookie consent…)
│     ├─ sections/         one renderer per CMS section type + PageRenderer
│     ├─ pages/            rooms, room detail, booking flow, confirmation, account, journal, 404…
│     ├─ three/            lazy-loaded 3D suite layout viewer (static fallback)
│     └─ admin/            dashboard, bookings, calendar, rooms, pricing, offers, customers, inquiries,
│                          reviews, CMS pages builder, theme builder, media, blog, FAQ, gallery,
│                          newsletter, staff & roles, reports, audit log, settings
└─ docs/                   this file, API, setup, deployment, security, operations
```

## Data model (summary)

See `server/prisma/schema.prisma` for every column. Groups:

- **Identity:** `users`, `roles` (permission arrays), `sessions`, `password_reset_tokens`.
- **Configuration & CMS:** `settings` (operational policy JSON per group), `site_configs` (DRAFT / PUBLISHED / ARCHIVED
  snapshots of theme + brand + menus + footer + contact + SEO), `pages` (draft & published section JSON) with
  `page_revisions`, `media_assets`, `gallery_items`, `blog_posts`, `faqs`.
- **Rooms & inventory:** `room_types` → `room_images`, `room_type_amenities` ↔ `amenities`; physical `rooms`;
  `room_blocks` (maintenance), `blackout_dates` (stop-sell).
- **Pricing:** `rate_rules` (seasonal/weekday overrides & adjustments), `holidays`, `meal_plans`, `add_ons`,
  `charge_rules` (taxes & fees with nightly-rate slabs), `offers`, `coupons` → `coupon_redemptions`.
- **Bookings:** `bookings` (status, payment status, refund status tracked separately, price snapshot) →
  `booking_rooms` (physical room allocations), `room_nights` (one per sold room-night; the overbooking guard), `booking_guests`, `booking_line_items`, `booking_notes`, `booking_events`.
- **Payments:** `payments`, `refunds`, `webhook_events` (unique per provider event id → idempotent webhooks).
- **Engagement & ops:** `wishlist_items`, `reviews`, `contact_inquiries`, `newsletter_subscribers`, `notifications`,
  `email_logs`, `audit_logs`.

## How overbooking is prevented

1. Every booking allocates **specific physical rooms** (`booking_rooms`) at creation time — inventory is the set of
   rooms of that type that are in service, not blocked, and not already allocated.
2. Allocation runs inside a MongoDB transaction that first bumps a per-room-type `inventory_locks` document. Two
   concurrent allocations for the same type write the same document, so MongoDB aborts one with a write conflict and
   it is retried against the committed state (`runTransaction`). Expired payment holds are released inside the same
   transaction first.
3. Every active allocation is mirrored night by night in `room_nights`, which has a **unique index on
   `(roomId, date)`**. An overlapping allocation is therefore physically impossible, even from a buggy code path or a
   manual database edit.
4. Unpaid online bookings hold inventory for `holdMinutes` (default 20). A job expires them; a late payment for an
   expired hold tries to re-allocate and otherwise flags the booking for refund.

## Booking & payment lifecycle

```
            ┌─ ONLINE ──> PENDING_PAYMENT ──(verified payment)──> CONFIRMED (or PENDING if manual confirmation)
create ─────┤                     └──(hold expires)──> EXPIRED
            └─ PAY_AT_HOTEL ──> CONFIRMED (auto) or PENDING (staff confirms / rejects)
CONFIRMED ──> CHECKED_IN ──> CHECKED_OUT          CONFIRMED ──> CANCELLED / NO_SHOW
```

- Prices are **always recomputed on the server** from database records; the client total is only compared to warn
  about price changes.
- Razorpay: server creates the order for the server-computed amount → checkout → server verifies
  `HMAC_SHA256(order_id|payment_id, key_secret)` → webhook (`X-Razorpay-Signature` over the raw body) is the backup
  path. Both paths are idempotent (unique `providerPaymentId`, unique `(provider, eventId)`).
- Cancellation computes penalty/refundable amount from the policy; **refund status is tracked separately** from
  booking status and refunds are executed by staff with `refunds.manage`.

## Content & theme publishing

- Site config and pages have **draft → publish**. Drafts may be incomplete; publish validates with the shared zod
  registry so a broken draft can never take the live site down.
- Staff can open the public site with `?preview=1` (or the builder's preview pane) to see drafts before publishing.
- Every page/section can be reset to defaults; pages keep revision history; publishing can be scheduled.
- The published theme becomes CSS variables at runtime — colours, fonts, radius, button style and spacing change
  site-wide with no deploy.

## Security model (summary — see SECURITY.md)

Every admin API checks the session user's **role permissions from the database** on each request; the UI hiding a
button is cosmetic only. Passwords use bcrypt (cost 12), accounts lock after repeated failures, sessions are
revocable, CSRF tokens are required on all state-changing requests, sensitive endpoints are rate-limited, all input is
validated with zod, uploads are decoded & re-encoded server-side, and all admin mutations are audit-logged.
