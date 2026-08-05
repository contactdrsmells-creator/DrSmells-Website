# Handover — Dr.Smells website & CRM

Written so a session on another device can pick up without the chat history.
Two repositories, two Supabase projects — they are separate and must not be
confused.

| | Website | CRM |
|---|---|---|
| Repo | `DrSmells-Website` | `DrSmells-CRM` |
| Supabase project | **Dr Smells website** | **drsmells-crm** |
| Framework | Next.js App Router | Next.js Pages Router |
| Live at | drsmells.com.my | drsmells-crm.vercel.app |

---

## Things that are easy to get wrong

**Two inventory locations, one product list.** `products.stock_qty` is the main
warehouse. `watsons_inventory` is stock sitting with Watsons. A Watsons *sales*
import deducts Watsons only — those units left the main warehouse when the
purchase order was imported, so deducting main again counts the same goods
leaving twice. Shopee and ordinary orders deduct main.

**Stock arithmetic belongs in the database.** Use the `adjust_product_stock` and
`watsons_adjust_stock` functions, never read-modify-write in JavaScript. Bulk
status changes fire one request per order in parallel; reading a quantity and
writing it back loses a unit per collision. This was observed live.

**DOKU's documentation is unreliable.** Everything below was established by
probing the live API, not from docs:
- The **API key** authenticates (`Basic base64(apiKey)`); the **secret key**
  only signs (HMAC-SHA256).
- Amounts are in **ringgit, not cents**.
- `line_items` must sum exactly to `order.amount`; negative prices are rejected.
- Checkout (`POST /v3/checkouts`) is signed **with** a Digest line.
- Status (`GET /orders/v1/status/{invoice}`) is signed **without** one —
  including it fails with "Invalid Header Signature".
- `order.status` reads `ORDER_GENERATED` whether paid or not; only
  `transaction.status` means anything.
- A failed FPX payment reports as `PENDING` here, so this API can confirm money
  arrived but must never be used to declare a payment dead.

**Shopee exports repeat order-level figures.** A two-item order occupies two
rows, with Total Amount, the three fees and Grand Total printed on both.
Summing row by row overstated one day's takings by RM153. Count those once per
Order ID; sum quantities across all rows.

**A DOKU checkout session is single-use.** Once a payment fails, that session is
finished and its link redirects to the return URL instead of showing a payment
page. Reminders link to `/pay/<order>`, which mints a fresh checkout.

---

## Website

- **Payments**: DOKU (primary) and Stripe (subscriptions). SenangPay removed.
- **`/pay/<order>`** resumes payment: reads the order, creates a fresh checkout
  with the gateway the customer originally chose, redirects. Link-preview
  crawlers get a static page — WhatsApp fetches every link it sends, and each
  fetch was registering a real pending transaction at DOKU. A link opened again
  within 10 minutes reuses the existing checkout.
- **Admin roles**: Super Admin, Designer (images and descriptions only), Viewer
  (orders, read-only). Enforced per API route; the sidebar only mirrors it.
- **Row Level Security is on for every table.** The anon key can read the
  storefront content and nothing else. Admin writes go through
  `/api/admin/content`. Verify at any time with `/api/admin/security-check`,
  which re-runs the attacks with the public key rather than reading config.
- **Scheduled jobs** (GitHub Actions, hourly — Vercel Hobby only fires daily):
  - `whatsapp-reminders` on the hour: unpaid orders after 3h, one message per
    customer per 24h, held 00:00–06:00 rather than skipped.
  - `payment-status-check` at half past: asks DOKU about recent unpaid orders
    at 1, 4, 10, 16, 22, 34 and 46 hours, then stops. Only `SUCCESS` marks an
    order paid, and only if the amount matches.

## CRM

- **Roles**: boss, sales, warehouse, accountant. Only boss and warehouse change
  order status. Orders export is boss-only; warehouse gets the last 30 days,
  enforced on the query so hand-picked order ids can't reach past it.
- **Imports**, all staged for verification before anything is created:
  - Watsons PO — moves stock main → Watsons.
  - Watsons sales — one order per store, deducts Watsons stock only.
  - Shopee sales — one order per file, deducts main stock.
- `.xlsx` is read by `lib/xlsx.js`, a small ZIP/XML reader on Node's zlib, so no
  spreadsheet dependency.

---

## Open items

1. **Negative inventory** — main stock is deeply negative. The counts are
   trustworthy now that adjustments are atomic, so a correction should hold.
2. **Resend / SMTP** — order confirmation emails, the contact form (currently
   shows a thank-you and sends nowhere) and password reset all wait on it.
   `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`,
   `MAIL_FROM=orders@drsmells.com.my`.
3. **Second Super Admin** — there is no password-reset flow, so a single admin
   account is the only way in. A second one is the recovery path.
4. **DOKU card notifications** — a card payment (120WWV) was approved and the
   callback never arrived. Worth asking DOKU why, since FPX callbacks work.
5. **Two Watsons orders** still carry net sales in the notes rather than the
   tracking code; only new imports use the new field.

## Migrations

SQL files sit in each repo root. Both projects have had every migration applied
as of this writing. New ones are safe to re-run.
