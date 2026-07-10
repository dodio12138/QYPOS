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
- **Full i18n**: Complete Chinese / English coverage across POS and Admin interfaces.
- **ESLint Configuration**: Root-level flat config with `no-undef` rule integrated into CI pipeline to catch prop-passing regressions.
- **Audit Log Filters**: Combined user, action, and exact time-range filters in Admin audit log view.
- **Sensitive Settings Re-authentication**: Tax rate changes now require current-account PIN confirmation.
- **Order Pagination**: Admin order list paginates at 20 items per page.

### Fixed
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
