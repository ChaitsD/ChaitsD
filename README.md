# MAYGREY — Phases 1 & 2

Editorial streetwear storefront with a protected admin, relational commerce database, customer accounts, variant inventory and **test-only checkout**. The Phase 1 look and routes are retained. No real payment credentials, default admin credentials or campaign videos ship with this project.

## Local setup

Node **24+** is required (built-in `node:sqlite`).

```sh
cd /workspace/ChaitsD
npm ci --cache /tmp/maygrey-npm
npm run setup:local
npm run dev
```

`setup:local` creates an ignored, permission-restricted `.env` with a random session secret only if no `.env` exists. It never overwrites existing settings. `npm run dev` starts the API on port 3001 and Vite on port 5173, with same-origin API/upload proxies. SQLite tables and initial data are created on the first API startup. The initial collection has exactly **S / M / L / XL**, 10 test units per size. XXL can be added explicitly in admin.

Use the existing isolated checkout. A separate Git worktree is not needed.

## Create your admin account

1. Set `ADMIN_EMAIL`, `ADMIN_NAME` and a unique `ADMIN_PASSWORD` (at least 12 characters) in the server's environment or ignored `.env`. Do not put real secrets in `.env.example`, browser code or Git.
2. Run `npm run admin:create`.
3. Remove `ADMIN_PASSWORD` from `.env` after provisioning. The database stores a salted scrypt hash, never the plaintext password.
4. Visit `/admin` and sign in with your account. No default or demonstration admin login is enabled.

To intentionally replace a lost admin password, set the same email and a new password server-side, then run `npm run admin:create -- --reset`. This revokes existing admin sessions. Admin account provisioning cannot be performed by a public API.

## Admin workflow

- **Dashboard:** total orders, test revenue, units sold, recent orders, low-stock variants. Cancelled/returned orders are excluded from revenue and units sold; revenue includes shipping.
- **Products:** create/edit/delete, SKU, name, description, fabric, GSM, fit, care, color and swatch, collection, homepage featured toggle, draft/active/sold-out status. Upload front/back/detail images. Products are soft-deleted to retain historical order records.
- **Pricing:** regular MRP, optional sale price, enabled toggle, optional sale window. Dates are entered in your browser's local time and stored in UTC. Sale start is inclusive and end exclusive. A zero sale price is permitted; negative prices and a sale price above MRP are rejected. Scheduled prices are evaluated server-side when catalog or quote/order requests arrive; no cron job is needed. Open storefronts receive immediate catalog invalidations over same-origin Server-Sent Events (SSE), with a 30-second refresh and window-focus fallback. The reverse proxy must permit streaming without buffering. Cart/checkout fetch a server quote; order placement always uses the then-current price.
- **Inventory:** size-specific stock and low-stock thresholds. Removed sizes are deactivated. New sizes, including XXL, must be added explicitly. One color is managed per product; each size is a distinct color/size variant. To offer another color, create another product. Concurrent stock changes cause a stale editor save to be rejected; reload before reapplying edits.
- **Collections:** add/edit drops, assign products, delete unused collections. Reassign products and coupon targets before deleting an in-use collection.
- **Coupons:** percentage or fixed INR discount, order minimum, optional cap, expiry, lifetime usage limit, enable/disable, all/selected products/selected collections. `MAYGREY10` is seeded for 10% off a subtotal of ₹1,499 or more. Minimum applies to the full merchandise subtotal; discounts apply only to eligible items and are capped by their value. Shipping is excluded. A coupon use is consumed on a successful test order; cancellation does not restore coupon usage. Disabling preserves order history.
- **Orders:** inspect addresses and item snapshots; move orders forward, add courier/tracking number/HTTPS tracking URL. Confirmed → Packed → Shipped → Delivered. Cancel before shipment or return shipped/delivered orders. Inventory is restored only once. No external shipment or refund is performed.
- **Settings:** flat shipping, free-shipping threshold (after discounts), COD toggle, campaign poster/MP4/WebM uploads, lookbook images, and plain-text copy for all six policy/help pages. Shipping defaults to ₹99 and free above a post-discount ₹2,999 threshold. All seeded policies and product specifications are provisional.

Images: PNG/JPEG/WebP up to 10 MB. Videos: MP4/WebM up to 80 MB. The server validates file signatures, fully decodes/re-encodes images with a 25-megapixel limit, strips image metadata, and uses random filenames; active SVG uploads are rejected. The web server/reverse proxy must permit an 80 MB request body. Existing placeholder SVG files are trusted local assets. Replacing an asset does not immediately delete the old file; retention cleanup should be part of production operations.

## Checkout and accounts

- Guest checkout accepts name, Indian mobile phone, email, address, city, state and 6-digit PIN.
- Mock success creates a unique order and reduces stock in a single SQLite transaction. Mock failure creates no order and changes no inventory or coupon usage. COD is an explicitly marked test order and can be disabled in admin.
- All amounts are integer **paise** in the database/API. The UI edits/displays INR. Server totals ignore browser-supplied prices and totals, prevent negative totals, validate coupon limits and reject insufficient stock.
- Coupons can be applied in the cart and retained through checkout/refresh. Both screens use authoritative server quotes.
- Every order has a database-enforced `payment_mode=mock` marker. New IDs begin `TEST-MG-`; test labels appear in admin and customer views. A real `paid` status cannot be written under the current schema.
- Checkout uses idempotency keys. Retrying the same request does not create a second order. The browser retains a request key and payload fingerprint in session storage for retry after an interrupted request.
- Orders snapshot item names, SKUs, sizes, colors and unit prices. Later edits do not change existing orders.
- Guest confirmation access requires a private token stored on the ordering device, sent in a request header. Public order IDs do not grant access. Authenticated customers can read their own orders; admins can read all.
- Customer signup/login/logout, saved addresses, server-backed wishlist and order history are implemented. Anonymous wishlist and cart remain local; signing in merges and consumes the anonymous wishlist. Customer wishes are then server-authoritative, scoped per account, and serialized to avoid lost rapid updates. Login rotates the previous browser session and logout propagates across tabs. Guest orders are not automatically claimed by an account with a matching email.
- Forgot-password requests enqueue a reset email in `mail_outbox`. Reset links expire after 30 minutes, are single-use, and revoke sessions after use. API responses never expose reset tokens. **No email is delivered until a mail worker/provider is connected.** This is an explicit architecture boundary. Administrators with database access can inspect the local outbox for controlled development tests; do not expose it publicly.

## Routes

Storefront retained: `/`, `/shop`, `/shop?saved=1`, `/product/:id`, `/about`, `/lookbook`, `/cart`, custom 404.

Added:

- `/checkout`
- `/orders/:id`
- `/account`
- `/forgot-password`
- `/reset-password?token=…`
- `/admin`, `/admin/products`, `/admin/collections`, `/admin/coupons`, `/admin/orders`, `/admin/settings`
- `/shipping-policy`, `/returns-exchange`, `/privacy-policy`, `/terms-conditions`, `/faq`, `/size-guide`

API groups: `/api/catalog`, `/api/auth/*`, `/api/account/*`, `/api/checkout/quote`, `/api/checkout`, `/api/orders/:id`, `/api/admin/*`, `/api/health`. `/uploads/*` serves published media.

## Database/schema

`server/schema.sql` defines the base schema. `server/db.js` applies additive migration 2 for the immutable mock-payment marker and payment-status guards. Existing orders and stock are preserved; seeding runs only once. Do not delete the database to apply future schema changes; add explicit versioned migrations and preserve existing data.

- `products`
- `product_variants`
- `inventory`
- `collections`
- `customers`
- `orders`
- `order_items`
- `coupons`
- `admin_users`
- Supporting `addresses`, `wishlist`, `sessions`, `password_resets`, `mail_outbox`, `settings`, `policies`, `audit_log`, `schema_migrations`

SQLite uses foreign keys, check constraints, WAL and `BEGIN IMMEDIATE` transactions. The database is suitable for this single-server deployment with a durable local disk. **Do not deploy this setup to ephemeral/serverless disks or run independent replicas with separate copies.** A horizontally scaled service should migrate to managed PostgreSQL. There are no database network credentials for the local SQLite file.

## Environment variables

See `.env.example`. All secrets are server-only; never use a `VITE_` prefix for them.

| Variable                                                            | Purpose                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                                                    | Required, random secret of at least 32 characters. HMACs session/reset/guest tokens. Rotation invalidates access tokens. |
| `DATABASE_PATH`                                                     | SQLite file, default `.data/maygrey.sqlite`. Use a durable volume in production.                                         |
| `UPLOAD_DIR`                                                        | Media directory, default `.data/uploads`. Must also be durable.                                                          |
| `APP_ORIGIN`                                                        | Canonical browser origin. Local default `http://localhost:5173`; required as the actual HTTPS origin in production.      |
| `API_PORT`                                                          | Default 3001.                                                                                                            |
| `NODE_ENV`                                                          | Set `production` behind HTTPS; enables Secure session cookies and production CSP.                                        |
| `TRUST_PROXY`                                                       | Default 0. Set 1 only behind exactly one trusted reverse proxy that overwrites forwarded headers.                        |
| `PAYMENT_MODE`                                                      | `mock` only. Any other mode refuses checkout until live capture/fulfillment is implemented.                              |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`                       | Used only by the admin provisioning/reset CLI. Remove the password after use.                                            |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Reserved server configuration for a future live Razorpay adapter. Not required or used for mock orders.                  |
| `BACKUP_DIR`                                                        | Optional backup output directory, defaults to `.data/backups`.                                                           |

The payment-provider boundary and Razorpay signature helpers live in `server/payments.js`. Adding credentials alone **does not enable live payments**. A real adapter must create provider orders, verify captured currency/amount and signed webhooks, handle duplicate events, and fulfill orders transactionally. No card/UPI fields or keys are exposed in the frontend.

## Production and backups

```sh
npm run build
# Configure server environment, actual HTTPS APP_ORIGIN, durable storage and NODE_ENV first.
npm start
```

Express serves the built SPA and API on the same origin, including route fallbacks. Use a single instance behind a correctly configured HTTPS reverse proxy. Restrict direct API-port exposure, provision an admin, review policies, define tax/business requirements, and connect operational monitoring before public commerce. Secure cookies require HTTPS in production.

```sh
npm run db:backup
```

This creates a consistent SQLite backup via the online backup API. Back up uploads and server environment secrets separately with restricted access and test restoration. Database backups contain PII and password hashes; protect them. Do not copy a live SQLite file without its WAL or a proper online backup. Sessions and reset tokens are sensitive operational data. Establish cleanup/retention policies for outbox, expired tokens and unused uploads before launch.

## Validation

```sh
npm test
npm run build
# Install a supported Playwright Chromium build, or provide an existing Chromium:
# npx playwright install chromium
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Both test suites create isolated temporary databases and test admins and remove them afterward. No known admin credentials or test orders are inserted into your live development database.

Backend integration checks cover pricing/sale windows, invalid prices, coupon eligibility/caps/expiry/limits, authorization/CSRF guards, stale edits, unavailable sizes, failed payments, idempotency, guest order access, stock races, restocking, customer accounts, addresses/wishlist/history, uploads, password reset and analytics. Browser checks cover Phase 1 regression, publishing/hiding/deleting products, live cross-tab price updates, cart and checkout coupons, cancellation, session/account isolation, 26 internal link targets and mobile layouts across 18 route views. Automated browser test cohorts reset only their fixture-local API burst counter; real default rate limits are tested separately without bypass in the security suite. See [ACCEPTANCE_REPORT.md](ACCEPTANCE_REPORT.md) for the acceptance results and production blockers.

## Source map

- `src/main.jsx`: existing storefront and shared navigation/cart
- `src/store.jsx`, `src/api.js`: API-backed catalog, auth, cart and wishlist state
- `src/Admin.jsx`: protected admin interface
- `src/Commerce.jsx`: checkout, confirmation, accounts and policies
- `src/Price.jsx`: shared sale/MRP presentation
- `src/styles.css`, `src/commerce.css`: existing visual system and responsive commerce/admin additions
- `server/app.js`: API, protected admin operations, uploads, checkout and order updates
- `server/db.js`, `server/schema.sql`: schema, persistence and initial collection
- `server/commerce.js`: authoritative pricing and totals
- `server/security.js`: password hashing, sessions, validation and access control
- `server/events.js`: bounded, payload-free public catalog invalidation streams
- `server/payments.js`: mock adapter and future Razorpay verification boundary
- `server/admin.js`, `server/setup-local.js`, `server/backup.js`: operational CLIs
- `tests/commerce.test.js`, `tests/acceptance.test.js`, `tests/production.test.js`, `tests/browser.mjs`: backend and browser integration checks

## Phase 3 / external work

- Live Razorpay order/capture/webhook integration, reconciliation, real refunds and credentials
- Email delivery worker/provider, verified sender and customer notifications
- Real courier integration/credentials, label creation and tracking sync
- Reviewed final product artwork/media, production sizing, legal policies and business/tax terms
- HTTPS deployment, durable storage/backups/restore drill, monitoring and data-retention operations
- Production security/accessibility review, admin MFA and cross-device testing
- Optional managed PostgreSQL/object storage migration for multiple instances; advanced filtering, search, pagination and richer analytics as the catalog grows
