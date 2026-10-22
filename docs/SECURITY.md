# Security

| Concern | Implementation |
|---|---|
| Authentication | Server-side sessions: a 256-bit random token in an httpOnly, SameSite=Lax cookie (Secure in production). The database stores only its SHA-256, so sessions can be revoked instantly. Sliding expiry. The previous session is dropped on login (no session fixation). |
| Passwords | bcrypt with cost 12. Policy: at least 10 characters with upper case, lower case and a digit. Accounts lock for 15 minutes after 5 failures. Login responses and timing are identical whether or not the account exists. Reset tokens are single-use, expire after 60 minutes, are stored hashed, and resetting signs the user out everywhere. Changing a password revokes other sessions. |
| Authorization | Roles and permissions are read from the database on **every** request. Every admin route declares the permissions it requires. The frontend only hides what the server already refuses. Super Admin is required for staff, roles and settings; refunds and financial reports need explicit permissions. Deactivating staff or changing their role kills their sessions. The last active Super Admin cannot be demoted. There is no public staff registration. |
| CSRF | Double-submit token (`aur_csrf` cookie echoed in the `X-CSRF-Token` header) on every state-changing request, plus SameSite=Lax session cookies. Webhooks are exempt and HMAC-verified instead. |
| Input validation | Every request body is parsed with zod schemas shared with the frontend. Unknown or invalid input gets a 422. CMS content is validated against the section registry before publishing. |
| Injection | All queries go through Prisma's typed API, so request input is never interpreted as MongoDB query operators. The only raw commands (health ping, index setup, test/seed wipe) contain no user input. CSV exports neutralise spreadsheet formulas. |
| XSS | React escapes output. CMS rich text is Markdown rendered with raw HTML disabled. The email outbox preview renders in a sandboxed iframe. A strict Content-Security-Policy is set via helmet. |
| File uploads | Only JPEG/PNG/WebP/AVIF MIME types. Size limits apply. Every file is decoded by sharp, so disguised scripts and SVGs are rejected, then re-encoded with metadata stripped. Files are stored under random names. |
| Rate limiting | Login/register, password reset, forms, booking, quote, payments, and a global API limit. |
| Payments | Amounts are computed only on the server; client totals are used only to detect a changed price. Signatures are verified with constant-time comparison. Webhooks are verified and deduplicated. No card data is stored. The sandbox provider is labelled as test everywhere. |
| Booking integrity | A per-room-type lock document written inside each allocation transaction (concurrent writers conflict and are retried), plus a unique `(roomId, date)` index on `room_nights`, prevent double-booking. Holds expire. Coupon usage is incremented conditionally, so limits can't be exceeded under concurrency. |
| Guest access | Guest booking pages require a manage token (hashed in the database), the owner's session, or reference + email. Unknown references and wrong proofs return the same 404. |
| Audit | Admin mutations are recorded in `audit_logs` (actor, action, before/after, IP), with secrets scrubbed. Viewable at Admin → Audit log. |
| Secrets | Secrets come only from environment variables. The server refuses to start in production with placeholder secrets or missing webhook secrets. No secrets are ever sent to the frontend; only the public Razorpay key ID is. Logs redact cookies, tokens and passwords. |
| Privacy | Cookie consent gates analytics and the embedded map. Marketing emails are opt-in with one-click unsubscribe. Customer exports require `customers.export` and are audit-logged. |

Report vulnerabilities to security@yourhotel.com.
