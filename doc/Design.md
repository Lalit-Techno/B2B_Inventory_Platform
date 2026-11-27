# Design (UI / UX) — Simple MVP

One Next.js app (`frontend/`) with three areas. Behaviour comes from [Prd.md](Prd.md); permission ids from the RBAC spec.

---

## 1. Areas

| Area | Route | Users | Layout | Branding |
|---|---|---|---|---|
| Platform Console | `/admin/*` | SUPER_ADMIN | Desktop sidebar | Platform default |
| Wholesaler Portal | `/portal/*` | ORG_ADMIN, INVENTORY_MANAGER, SALES_MANAGER, FINANCE_MANAGER | Desktop sidebar, tablet-friendly | Tenant colours + logo |
| Buyer Storefront | `/shop/[orgSlug]/*` | BUYER_USER | **Mobile-first**, bottom tab bar on phones, top nav on desktop | Tenant colours + logo |

Shared: `/login` (role decides where you land), `/set-password`, `/forgot-password`, `/shop/[orgSlug]/invite/[token]`, `/shop/[orgSlug]/register`.

> Later (U6): the storefront becomes an installable PWA, then a Capacitor white-label app per tenant using the same pages.

---

## 2. Principles

1. **Clarity for buyers, density for staff.**
2. **Money is exact**: right-aligned tabular numbers, `₹ 7,05,600.00` (Indian grouping), tax split always shown.
3. **Hidden vs disabled**: actions a role can never do are hidden; actions blocked by state are disabled with a short reason.
4. **Status always visible** with consistent badges (§5).
5. **Mobile works**: storefront fully usable at 360 px width; touch targets ≥ 44 px.
6. **Accessible**: labels, focus rings, contrast ≥ 4.5:1, no colour-only meaning.

---

## 3. Theming

Tenant sets `primary`, `secondary`, `accent` (hex) + logo. `lib/theme.ts` derives shades and sets CSS variables:

```css
:root {
  --primary-50:  #f0fdf4;  --primary-500: #22c55e;  --primary-700: #15803d;
  --secondary-500: #0f172a;
  --accent-500:  #f59e0b;
  --font-brand: 'Inter', sans-serif;
}
```
- Hex only; save rejected if text-on-primary contrast < 4.5:1.
- System colours are fixed (not tenant-editable): success green, warning amber, danger red, info blue, neutral slate.
- Spacing 4 px scale; radius 6 px (controls) / 12 px (cards); numbers use `tabular-nums`.

---

## 4. Components

From shadcn/ui: Button, Input, Select, Combobox, Dialog, Sheet, Tabs, Toast, Tooltip, Badge, Card, Skeleton, Table, DropdownMenu, DatePicker.

App components (`src/components/app`):

| Component | Purpose |
|---|---|
| `MoneyText` | INR formatting, tabular |
| `QuantityInput` | respects quantity scale, step, MOQ; shows unit |
| `StatusBadge` | enum → colour + label |
| `TaxBreakdown` | subtotal, CGST/SGST or IGST, round-off, total |
| `DataTable` | TanStack Table, cursor pagination, CSV export button |
| `PermissionGate` | hide / disable by permission id |
| `SubscriptionBanner` / `FreezeScreen` | grace countdown, frozen tenant |
| `GstinInput` | uppercase, checksum, shows derived state |
| `AddressPicker` | billing/shipping with state |
| `StockIndicator` | exact / banded / in-stock per setting |
| `MaskedPrice` | shows `***` for pending buyers |
| `EmptyState`, `ErrorState`, `PageHeader`, `Timeline` | |

---

## 5. Status Colours

| Entity | Mapping |
|---|---|
| Subscription | TRIAL info · ACTIVE success · GRACE_PERIOD warning · EXPIRED/SUSPENDED danger · CANCELLED neutral |
| Connection | PENDING warning · ACTIVE success · SUSPENDED danger · REJECTED/EXPIRED/REVOKED neutral |
| Order | PLACED/CONFIRMED/DISPATCHED info · DELIVERED/COMPLETED success · CANCELLED neutral |
| Invoice | ISSUED info · PARTIALLY_PAID warning · PAID success · OVERDUE danger · VOID neutral |
| Payment | RECORDED success · REVERSED neutral |
| Product | DRAFT neutral · PUBLISHED success · RETIRED neutral · low stock warning · out of stock danger |

---

## 6. Platform Console (`/admin`)

| Screen | Contents |
|---|---|
| Dashboard | MRR, ARR, active / grace / expired tenants, renewals in 30/60/90 days |
| Organizations | list (search, status), **Onboard** wizard: legal (GSTIN → state, PAN) → address → plan & cycle & amount & start → first admin → review; shows set-password link after create |
| Organization detail | profile, subscription card, suspend / reactivate |
| Plans | list + editor |
| Subscription ledger | filters, CSV; **Record payment** dialog (taxable, GST auto 18 %, total, TDS, mode, reference, date, periods → previews new end date); reverse with reason |

---

## 7. Wholesaler Portal (`/portal`)

Header: logo, org name, subscription banner, notification bell, user menu.

### Sidebar by role
| Section | OA | IM | SM | FM |
|---|---|---|---|---|
| Dashboard | ✓ | stock tiles | sales tiles | finance tiles |
| Products & Categories | ✓ | ✓ (no prices) | read + prices | read + tax |
| Stock | ✓ | ✓ | – | – |
| Buyers | ✓ | – | ✓ | ✓ (credit) |
| Price tiers | ✓ | – | ✓ | read |
| Orders | ✓ | fulfilment view | ✓ | financial view |
| Invoices & Credit notes | ✓ | – | read | ✓ |
| Payments & Receivables | ✓ | – | ageing summary | ✓ |
| Reports | ✓ | stock | sales | finance |
| Settings, Branding | ✓ | – | – | credit & invoice sections |
| Staff, Audit log | ✓ | – | – | – |
| Subscription | ✓ | – | – | ✓ |

### Screens
| Screen | Contents |
|---|---|
| Dashboard | today's orders, orders to confirm, low-stock count, overdue amount, recent orders |
| Products | table (search, category, status, stock); editor tabs: Details · Tax · Pricing (OA) · Stock rules · Images; **Publish** (OA) |
| Categories | tree editor |
| Stock | stock-in & adjustment forms (reason required), stock log table (read-only), low-stock list |
| Buyers | tabs Active / Pending / Suspended / Closed; **Invite** dialog → shows copyable invite link; buyer detail: profile, tier, custom prices, credit (limit, outstanding, open orders, override), suspend/reinstate (category), timeline |
| Price tiers | list + editor (SM sees discount cap) |
| Orders | tabs by status; detail: items, TaxBreakdown, buyer, address, timeline, internal notes; actions by status & role: Confirm · Dispatch (vehicle, driver, e-way bill no.) · Mark delivered · Cancel (reason) · Force complete |
| Invoices | list (status, due, balance); detail with PDF download, void (OA), **Issue credit note** |
| Payments | register; **Record payment**: buyer → open invoices → allocations (manual or "Auto FIFO") → mode fields → TDS → save → receipt PDF; reverse (OA) |
| Receivables | ageing buckets, buyer statement |
| Reports | pick report + date range → CSV |
| Settings | Commercial · Credit · Invoice & bank · Alerts · Branding (live preview + contrast check) |
| Staff | list, invite (copyable set-password link), change role, deactivate |
| Audit log | filter by user, action, date |
| Freeze screen | tenant EXPIRED/SUSPENDED: message + subscription page only |

---

## 8. Buyer Storefront (`/shop/[orgSlug]`)

Phone: bottom tabs **Home · Catalog · Cart · Orders · Account**.

| Screen | Contents |
|---|---|
| Invite landing | wholesaler logo/name, offered terms → Register / Login |
| Register | e-mail, password, business name & type, GSTIN (state derived), PAN, billing + shipping address |
| Pending | "Awaiting approval" / invitation card with **Accept / Reject** (primary contact; others see "Waiting for your admin"); optional catalog preview with `***` |
| Home | quick re-order, outstanding & available credit, invoices due |
| Catalog | search, categories, product cards (image, title, unit, price, stock) |
| Product | images, description, price, GST rate, MOQ/step, QuantityInput, Add to cart |
| Cart | lines, MOQ warnings, min order bar, address picker, notes → **Review** (calls validate, shows TaxBreakdown) → **Place order** |
| Conflicts | insufficient stock → "Only 80 available — use 80?"; price changed → old vs new, confirm; credit exceeded → explanation |
| Orders | list + detail: timeline, items, totals, invoice link, cancel (before confirm), **I received this order** |
| Documents | invoices, credit notes, receipts, statement (PDF download) |
| Account | profile, addresses, team (primary contact), notification settings, password, delete account |
| Restricted | Suspended: banner, catalog/cart disabled, documents available · Tenant frozen: "Ordering is temporarily unavailable. Please contact your supplier." |

The cart is kept in `localStorage` per org (convenience only); the server re-validates everything.

---

## 9. Patterns

- Forms: react-hook-form + zod; server `details[]` mapped to fields; submit shows loading.
- Destructive actions (cancel, void, reverse, deactivate) → confirm dialog with reason.
- Checkout & payment buttons generate one Idempotency-Key per submission, reused on retry.
- Downloads open `GET /files/:id/download` (authorized), never stored public links.
- Error codes → friendly text (e.g. `PLAN_LIMIT_REACHED` → "Your plan allows 5 staff users. Contact the platform to upgrade.").

---

## 10. PDF Documents (PDFKit, A4)

| Document | Content |
|---|---|
| Tax invoice | supplier & buyer names, GSTINs, addresses; number & date; place of supply; lines (description, HSN, qty, unit, rate, taxable, GST rate, CGST/SGST or IGST); totals in figures and words; round-off; bank details; IRN / e-way bill no. if entered; "Authorised signatory" |
| Credit note | number, original invoice, reason, lines, tax reversal |
| Receipt | number, buyer, amount, mode & reference, TDS, allocations, advance |

Tenant logo on top; brand colour for headings only.
