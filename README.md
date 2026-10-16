# The Aurelle — Luxury Hotel Website, Booking Engine & Admin Platform

A complete, production-ready platform for a five-star hotel:

- **Cinematic public website**: hero slideshows, parallax, Lenis smooth scrolling, a lazy-loaded 3D suite viewer, editorial typography, and responsive images with graceful fallbacks.
- **Real booking engine**:
  - Live availability, with physical-room inventory and overbooking prevented at the database level.
  - Server-side pricing: seasonal, weekend and holiday rates, extra guests and beds, meal plans, add-ons, offers, coupons, Indian GST slabs and deposits.
  - Razorpay payments, or a clearly labelled test-mode sandbox.
  - Confirmation emails, guest self-service cancellation, and refunds.
- **Admin panel at `/admin`**: dashboard, reservations, front-desk calendar, rooms and inventory, pricing, offers, customers, inquiries, reviews, CMS page builder, theme builder, media library, journal, FAQ, gallery, newsletter, reports, staff and roles, audit log, and settings.
- **Edit nearly everything without code**: theme, brand, navigation, footer, page sections, imagery, rooms, rates, offers, policies and SEO. All of it is stored in PostgreSQL, previewed as a draft and published instantly.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design. The other docs:
- [docs/API.md](docs/API.md): endpoint reference
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production setup, Razorpay, email, storage, backups
- [docs/SECURITY.md](docs/SECURITY.md): security model
- [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md): guide for hotel staff

## Stack

| Part | Technologies |
|---|---|
| Web | React 19, Vite, TypeScript, Tailwind CSS, Motion, Lenis, React Three Fiber, TanStack Query, react-hook-form + zod, Recharts |
| API | Node 20+, Express, Prisma 6, PostgreSQL 16, zod, sharp, nodemailer/Resend |
| Shared | `@aurelle/shared`: pricing engine, validation schemas, CMS section registry, theme tokens and permissions, used by both sides |

## Quick start (local development)

Requirements: Node 20.11+ and PostgreSQL 14+ (or Docker).

```bash
# 1. Database (skip if you have PostgreSQL running)
docker run -d --name aurelle-db -e POSTGRES_USER=hotel -e POSTGRES_PASSWORD=hotel -e POSTGRES_DB=hotel -p 5432:5432 postgres:16

# 2. Install & configure
npm install
cp .env.example server/.env          # edit if your database URL differs

# 3. Create the schema and load the demo hotel (wipes the database!)
npm run db:deploy
npm run db:seed

# 4. Run API (http://localhost:4000) and website (http://localhost:5173)
npm run dev
```

Open http://localhost:5173 for the website and http://localhost:5173/admin for the admin panel.

### Demo accounts (created by the seed)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@theaurelle.example | `Aurelle-Demo-2026` (or `SEED_STAFF_PASSWORD`) |
| Hotel Manager | manager@theaurelle.example | same |
| Booking Manager | reservations@theaurelle.example | same |
| Receptionist | frontdesk@theaurelle.example | same |
| Content Editor | editor@theaurelle.example | same |
| Customer | ananya.sharma@example.com | `Guest-Demo-2026` |

> These exist only in demo data. In production, run `npm run create-admin -- --email you@hotel.com --name "Your Name"` and create other staff from **Admin → Staff & roles**. There is no public admin registration.

### Payments in development

`PAYMENT_PROVIDER=sandbox` (the default) runs a test gateway. Every screen says **TEST MODE — no real money will be charged**. You can simulate a successful or failed payment, and the result goes through the same signature-verification path as Razorpay. To use Razorpay test mode, set `PAYMENT_PROVIDER=razorpay` with `rzp_test_…` keys (see [DEPLOYMENT.md](docs/DEPLOYMENT.md#razorpay)).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + website with hot reload |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm test` | Shared pricing tests, API integration tests (needs PostgreSQL database `hotel_test`) and web tests |
| `npm run build` | Production build of API (`server/dist`) and website (`web/dist`) |
| `npm run db:migrate` | Create a new migration while developing (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations (safe for production) |
| `npm run db:seed` | **Wipe** and load demo data (refuses in production) |
| `npm run create-admin` | Create or promote a Super Admin |

### Running the tests

```bash
createdb -U hotel hotel_test          # once; or: CREATE DATABASE hotel_test OWNER hotel;
npm test
```

The API tests run against a real PostgreSQL database, so the overbooking constraint, transactions and concurrency are exercised for real. They cover:
- concurrent overbooking and hold expiry
- invalid dates and occupancy rules
- price-change detection and coupon races
- payment signature checks, duplicate webhooks and refunds
- RBAC and account lockout
- upload validation and CMS publishing

## Project layout

```
shared/   pricing engine, zod schemas, CMS section registry, theme, permissions (+ tests)
server/   Express API, Prisma schema & migrations, services, routes, jobs, seed (+ integration tests)
web/      public website (src/pages, src/sections, src/components) and admin panel (src/admin)
docs/     architecture, API, deployment, security, admin guide
```

## Image credits

Demo photography comes from [Unsplash](https://unsplash.com/license), which allows commercial use. Replace it with the hotel's own photography from the media library before launch.
