# Changelog

<p align="center">
  <a href="./CHANGELOG_zh.md"><img src="https://img.shields.io/badge/lang-中文-red.svg" alt="中文"></a>
  <a href="./CHANGELOG.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

All notable changes to QYPOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Daily Accounting Payment Split**: Accounting Excel/CSV daily summaries now show separate cash and card recorded-income totals.
- **Mixed Cash + Card Payments**: The standard checkout flow now accepts consecutive tenders of any amount; after the first tender it stays open with live paid/remaining totals, and the balance can be completed by manual card or Dojo.
- **Bilingual Accounting CSV and Excel**: Sales exports now include Chinese/English definitions and formulas, accounting totals, payment reconciliation, daily summaries, and a paid-order ledger. Excel export provides four formatted worksheets with frozen headers, while CSV retains UTF-8 BOM and numeric amount cells.
- **Optional Cumulative Time-Slot Trends**: The 30/60-minute chart now has separate default-off controls for cumulative orders and cumulative revenue, plus a Daily Trend-style hover guide and metric-aware tooltip.
- **Actual Attendance OFF and 120-Minute Breaks**: Staff schedule actual-attendance records can now explicitly be marked `OFF`, with actual hours calculated as zero while preserving notes; scheduled and actual break presets now include 120 minutes.
- **Complimentary Checkout**: The POS payment screen now supports admin-authorized zero-value checkout with a required reason and optional note; orders close as `paid` with a `complimentary` payment record, and reports expose a complimentary-order count.
- **Retained Cash Income**: Cash payments can mark excess tender as not requiring change; order settlement, retained cash, and recorded income are tracked separately, with a new recorded-income report metric.
- **Paid Order Amount Adjustment**: Admin order details now support permission-gated total reduction for paid orders, refund-due guidance, and appended adjustment notes; cashiers can use temporary admin account/PIN authorization.
- **PBKDF2 PIN Hashing**: Staff PINs now stored as PBKDF2 hashes (SHA-512, 100k iterations, random salt) using Node.js built-in crypto. Legacy plaintext PINs auto-upgrade on first login — zero user impact.
- **PIN Privacy**: `GET /users` API no longer returns the `pin` field; admin account page no longer displays PINs in plain text.
- **Account Page Redesign**: Card-based layout, color-coded role badges (Owner🔴/Cashier🔵/Kitchen🟢), inline expand/edit, inline delete confirmation, PIN show/hide toggle, and PIN confirmation field.
- **PIN Hashing Unit Tests**: 9 test cases covering hash/verify/upgrade/edge-case scenarios end-to-end.
- **Shared Test Helpers** (`tests/helpers.mjs`): Unified API request wrappers, login helpers, env management, and cleanup utilities.
- **AGENTS.md**: Project-level AI coding agent guidelines with tech stack, build commands, architecture decisions, and common pitfalls.
- **Staff Management**: Employee CRUD, schedules, attendance tracking, and hourly wage.
- **Staff Scheduling**: Weekly schedule planner with drag-and-drop time presets, actual attendance recording, and revenue-per-hour conversion metrics.
- **Role-Based Permissions**: Fine-grained cashier-specific permission sets; service charge adjustment/exemption, discount, and order cancellation all require explicit permissions.
- **POS Login Gate**: All front-desk operations (open table, add items, print, take payment, clear table) now require staff authentication.
- **Order Confirmation**: Confirmation step before opening a dine-in table or creating a takeaway order to prevent accidental taps.
- **Dojo Go Terminal Integration**: Pay-at-Counter support via Dojo Go payment terminals (Payment Intent + terminal session lifecycle).
- **Strict Printer Routing**: Kitchen/receipt printers now fail explicitly when the assigned printer is missing, disabled, or has no IP — no silent fallback.
- **New-Items-Only Kitchen Print Locking**: Only newly added items are locked and printed; already-printed items are never re-sent to the kitchen.
- **Top-Seller Drilldown**: Dashboard top sellers now support multi-select with merged trend charts, compatible with historical data missing `item_id`.
- **Report Enhancements**: Day-of-week multi-select filter; expanded date presets (today, yesterday, last 7/30 days, this month, this week, last week, last month).
- **Report Analytics Mix Charts**: Sales analytics now includes items sold, service charge, discount, VAT summaries, category mix charts for item count/revenue, linked highlighting, and a hideable trend line.
- **Daily Trend Hover Card**: Daily revenue/order/average-ticket trend charts now show a date + weekday hover card with point-over-previous-point percentage change.
- **Daily Trend Y-Axis Ticks**: Daily trend charts now include evenly spaced integer y-axis ticks and horizontal gridlines, with revenue axis maximums adapting closely to current data.
- **Metric Card Refresh**: Dashboard and report summary cards now show metric icons, top-right trend percentages, and actual value changes below the main number.
- **Admin Menu UX Improvements**: Menu management now includes overview stats, search, availability filters, previous/next item pagination, and a standalone note-preset area with category-scoped availability.
- **Full i18n**: Complete Chinese / English coverage across POS and Admin interfaces.
- **ESLint Configuration**: Root-level flat config with `no-undef` rule integrated into CI pipeline to catch prop-passing regressions.
- **Audit Log Filters**: Combined user, action, and exact time-range filters in Admin audit log view.
- **Sensitive Settings Re-authentication**: Tax rate changes now require current-account PIN confirmation.
- **Order Pagination**: Admin order list paginates at 20 items per page.

### Fixed
- **Cash Drawer Burst Protection**: Cash drawer requests now have a three-second per-user/terminal/printer cooldown, front-end button cooling, source audit metadata, and one delayed retry for transient network printer timeouts.
- **Accounting Excel Amount Format**: Daily summary order totals now use two-decimal currency formatting instead of integer formatting.
- **Schedule Metrics at Current Time**: Revenue-per-hour and labor-percentage metrics now use only elapsed shift time and prorated labor cost as of the current minute; weekly totals average the available daily rates so future scheduled shifts no longer distort current performance.
- **Zero-Total Checkout**: Orders already reduced to a genuine zero total can now complete checkout with an explicit zero-value payment record, while zero payments against outstanding balances remain blocked.
- **Schedule Auto-Hide State**: Fixed persistent per-employee expansion exceptions that made “Auto hide empty” appear broken after adding staff; re-enabling the option now restores consistent filtering.
- **Unpaid Orders in Sales Metrics**: Schedule revenue, dashboard totals, and sales reports now count only `paid` orders, excluding cancelled and still-open orders.
- **Order Detail Line Totals**: Admin order detail now receives per-item line totals from the API, so item amounts no longer display as zero.
- **Split Parent Details**: Split parent orders now show child order numbers with their item details in the Admin order detail modal.
- **Staff Schedule Revenue**: Staff schedule revenue totals now exclude split parent orders, preventing split orders from being counted twice.
- **Note Preset Category Scope Saving**: Legacy menu category UUIDs are now accepted, fixing single-category note scopes reverting to "All categories" after refresh.
- **Note Preset Scope Selection**: Category scope chips now use full-button clicks, fixing unclear or missed reactions when applying a note preset to a single category.
- **DST Timezone Bug**: Item trend chart date axis now aligns with main report dates — no longer off by one day during Daylight Saving Time.
- **`locale` Prop Crashes**: Multiple components (`PosLogin`, `DiscountAdminModal`, `SettingsView`, etc.) that crashed with `ReferenceError: locale is not defined` due to missing prop declarations/passing — all fixed and guarded by ESLint.
- **Discount Cap**: Discount amount is now capped to the order subtotal, preventing negative or anomalous totals.

### Changed
- **Payment Validation**: Payment amount must be > 0, change cannot be negative, and closed orders reject duplicate payments.
- **Backup Scheduling**: Manual backup, auto-backup scheduling, backup file list, and download now available from the Admin Operations panel.

---

## [0.1.0] - 2026-06-25

### Added — Initial MVP Release

#### �️ Admin UX
- Collapsible sidebar navigation: click logo to toggle 220px ↔ 72px, persisted in localStorage
- Smooth bidirectional width animation (200ms ease) on collapse/expand
- Identical icon sizes, button spacing, and padding in both states

#### �🛎️ POS Front Desk
- Visual table map & status management
- Dine-in & takeaway ordering
- Menu browsing, variants, modifiers & notes
- Add items, discounts, service charge adjustment
- Manual payment records (cash/card/QR/other)
- Real-time table status via WebSocket

#### 🖨️ Kitchen Printing
- ESC/POS network printer support
- Separate kitchen & receipt printing
- Multi-printer routing (kitchen/receipt/bar)
- Automatic print retry
- Item-level cooking status tracking
- Print job management UI

#### ⚙️ Back Office
- Full menu CRUD (categories, items, variants, modifier groups)
- Visual table layout editor (drag, zones, copy/delete)
- Grid snapping, undo/redo
- Settings: tax, service charge, currency, printer config
- Receipt preview

#### 📊 Dashboard & Reports
- Today's revenue, orders, avg. ticket, tax, service charge stats
- Top-selling items
- Historical sales with date filter + CSV export
- Audit log preview

#### 🔧 Operations
- Manual & auto DB backups
- Backup file download
- Health check panel
- Offline & disconnection banners

#### 🧪 Testing
- Money calculation unit tests (tax-inclusive/exclusive, discount, service charge)
- API integration tests (optional)

#### 🏗 Infrastructure
- One-click Docker Compose deployment
- PostgreSQL 16 + Redis 7
- Fastify API + WebSocket
- Next.js 14 frontend
- Node.js print worker
