# API Reference

Base path: `/api`. JSON in and out. All money is in **integer paise** and all stay dates are `YYYY-MM-DD`.

**Authentication.** Session cookie `aur_sid` (httpOnly, SameSite=Lax, Secure in production).

**CSRF.** Every non-GET request must send the header `X-CSRF-Token` with the value of the `aur_csrf` cookie. `GET /api/csrf` sets that cookie. Provider webhooks are exempt.

**Errors.** Errors look like `{ "error": { "code", "message", "fields?", "details?" } }`. Validation errors return `422` with `fields` keyed by path.

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + DB check |
| GET | `/site` | Published site config (theme, menus, contact, SEO), public booking policy, payment mode. `?preview=1` returns the draft for staff |
| GET | `/pages/:slug` | Published CMS page (`?preview=1` draft for staff) |
| GET | `/rooms` | Published room types. With `checkIn, checkOut, adults, children, rooms` it adds live availability and a stay total. Filters: `category, maxPrice, guests, amenities, featured`. Sort: `sort=price_asc,price_desc,popularity,size` |
| GET | `/rooms/:slug` | Room detail + approved reviews + similar rooms |
| GET | `/amenities` | Amenity list (for filters) |
| GET | `/availability/calendar` | Nightly availability (and rates with `roomTypeId`) for date pickers |
| POST | `/quote` | Authoritative price quote `{roomTypeId, checkIn, checkOut, adults, children, rooms, extraBeds, mealPlanId, addOns[], offerId, couponCode}` |
| GET | `/booking-options` | Active meal plans and add-ons |
| GET | `/offers`, `/offers/:slug` | Offers & packages |
| GET | `/reviews` | Approved reviews + rating summary (`featured=1`, `limit`) |
| GET | `/gallery`, `/faqs`, `/blog`, `/blog/:slug` | Content libraries |
| POST | `/contact` | Inquiry (rate-limited, honeypot) |
| POST | `/newsletter`, `/newsletter/unsubscribe` | Subscribe / unsubscribe by token |
| POST | `/reviews` | Review a checked-out stay (booking token or owner session) |

## Bookings & payments

| Method | Path | Description |
|---|---|---|
| POST | `/bookings` | Create a booking (see `createBookingSchema`). Returns `{booking, manageToken, payment}`. Online bookings start `PENDING_PAYMENT` with a room hold. `409 SOLD_OUT`, `409 PRICE_CHANGED` (includes the new quote), `422 COUPON_*` |
| GET | `/bookings/:reference` | Guest view. Requires `?token=`, the owner's session, or a prior lookup |
| POST | `/bookings/lookup` | `{reference, email}` → booking |
| POST | `/bookings/:reference/pay` | Create or reuse a gateway order for the outstanding deposit |
| POST | `/bookings/:reference/cancel` | Guest cancellation per policy (returns penalty/refundable) |
| POST | `/payments/verify` | `{bookingReference, providerOrderId, providerPaymentId, signature}`. HMAC verified; idempotent |
| POST | `/payments/failure` | Records a failed attempt; the hold remains for retry |
| POST | `/payments/sandbox/simulate` | **Sandbox only.** Stands in for hosted checkout |
| POST | `/payments/webhooks/razorpay` | Raw-body, `X-Razorpay-Signature`-verified, deduplicated by event id |

## Accounts

| Method | Path | Description |
|---|---|---|
| GET | `/auth/me` | Current user (or `null`) |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Customer registration and login (staff use login too) |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Emailed reset link (60 min, single use, signs out other sessions) |
| POST | `/auth/change-password` | Requires the current password |
| PATCH | `/auth/profile` | Name, phone, country, marketing opt-in |
| GET | `/account/bookings`, `/account/profile` | Customer area |
| GET/POST/DELETE | `/account/wishlist[/:roomTypeId]` | Favourite rooms |

## Admin (`/admin/*`, staff session + permission per route)

| Area | Endpoints | Permission |
|---|---|---|
| Dashboard | `GET /dashboard?preset=today\|week\|month\|year` or `from&to` | dashboard.view (money hidden without reports.financial) |
| Reservations | `GET /bookings` (search, status, payment/refund status, room type, date filters, sort, paging) · `GET /bookings/export.csv` · `GET /bookings/:id` · `POST /bookings` (phone/walk-in) | bookings.view / .export / .manage |
| Booking actions | `POST /bookings/:id/status` (CONFIRMED, REJECTED, CHECKED_IN, CHECKED_OUT, NO_SHOW) · `/cancel` · `/modify` · `/assign-rooms` · `/notes` · `/payments` (desk payment) · `/refunds` · `/refund-status` | bookings.manage / .cancel / payments.view / refunds.manage |
| Rooms | `room-types` CRUD (archives when booked) · `rooms` CRUD · `PATCH rooms/:id/housekeeping` · `room-blocks` · `blackouts` · `GET inventory` · `GET tape-chart` | rooms.view / .manage / inventory.manage |
| Pricing | `rate-rules`, `holidays`, `meal-plans`, `add-ons`, `charges` (taxes & fees) | pricing.manage |
| Offers | `offers`, `coupons` | offers.manage |
| People | `customers` (+ export.csv), `inquiries`, `newsletter` (+ export.csv), `staff`, `roles` | customers.*, inquiries.manage, newsletter.manage, staff.manage |
| Content | `cms/pages` (draft, publish, schedule, unpublish, discard, reset, revisions, section-defaults) · `cms/site-config` (draft, publish, discard, reset/:group, restore/:id) · `cms/media` (upload, external, edit, delete) · `faqs`, `gallery`, `blog`, `reviews` (+ `PATCH reviews/:id/moderate`), `amenities` | content.manage, theme.manage, media.manage, reviews.manage |
| Reports | `GET reports/:name` for bookings, occupancy, cancellations, sources, revenue\*, rooms\*, promotions\* (`format=csv` supported) | reports.view (\* reports.financial) |
| System | `settings/booking` (GET, PUT), `integrations`, `audit`, `email-logs`, `notifications`, `notifications/read-all` | settings.manage, audit.view |

Standard CRUD resources accept `GET /?q&page&pageSize`, `GET /:id`, `POST /`, `PUT /:id` and `DELETE /:id`, and log every change to the audit log.
