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

- fix: make Activity type the only initial field in a new campaign; hide internal name, dates, copy, prizes, and probability settings until a type is selected, then restore the matching settings for existing campaigns

- feat: Rename the POS draw control to Activity page, use Activity wording for the Admin entry, tests, and history, and add an Activity type as the first new-campaign field; Lucky Wheel is the first saved type and the model is ready for future activities

- fix: Use activity wording for generic invitation, customer-display status, and Admin invitation settings while keeping lottery-specific wheel, draw, and winner copy unchanged, leaving room for future games or other activities

- fix: Make customer-display controls white by default and mark the currently shown screen directly on its matching button with a red outline, soft red fill, and focus glow instead of a separate current-screen label

- feat: Add a configurable invitation timeout that returns the customer display to Welcome after 10 seconds by default (1–60 seconds); show the current customer-display screen in the POS controls so staff can confirm what guests see

- fix: Allow paid orders to reprint kitchen tickets without downgrading them to submitted; stale kitchen updates now preserve paid, with an explicit reprint confirmation in POS

- fix: Show the current order bill when checkout opens and reset the customer display to the welcome screen when checkout is exited or cancelled

- feat: Add one Start/Pause lottery toggle to the POS customer-display controls; after pausing, Start resumes the most recently paused campaign while preserving existing permissions and publish, resume, and pause endpoints

- fix: On tablet layouts, make user, realtime status and admin entry icon-first, use icon-only customer display controls, and reclaim vertical space for the table, menu and order workspace

- fix: compact the tablet customer-display controls into one row, keep the POS title horizontal, and make Cashier, live status, and header actions icon-first so the Tables and Menu areas remain visible

- feat: optimise tablet layouts for the POS front end and Admin, aligning QYPOS red navigation, touch targets, step navigation, panel spacing, and preventing order tables or lottery prize editors from overflowing

- fix: audit all lottery-admin numeric fields; minimum order, wheel duration, prize stock, paid feedback, and result duration now support continuous editing and commit-time range normalization

- fix: make exact probability fields continuously editable, selecting the current value on focus so leading zeros no longer turn edits into values such as 02 or 05

- feat: add a linked exact-percentage input beside each lottery slider; edits still rebalance unlocked prizes around locked values to total 100%

- feat: add a compact lottery campaign status indicator to the POS customer-display controls, automatically showing whether a draw is currently active

- feat: replace lottery probability inputs with lockable sliders; changes to one unlocked prize are shared evenly by the other unlocked prizes while keeping the total at 100%

- feat: Add a 3–30 second wheel spin duration setting; customer animation, tick audio, and result reveal now use the configured duration

- feat: add a Show invitation action after Show bill in the POS customer-display controls; staff can manually present the invitation for an eligible paid order, and customer confirmation opens the lottery-ready screen
- fix: make campaign start/end controls an explicit Campaign validity section, show the Europe/London window in the campaign list, and reject an end time before the start time
- feat: allow staff to confirm-void instant prizes as well as voucher prizes; keep wheel audio active across the full spinning state, and add an uploadable invitation image below the logo with the supplied Google-review QR as the default
- fix: remove the “Lucky draw” invitation kicker, make the gift icon background transparent, and render the editable Chinese and English invitation copy on separate lines
- fix: add a QYPOS-styled Cancel button that closes both new and edit lottery campaign forms; align the New campaign, Cancel, and future lottery controls to one shared size, radius, spacing, and colour system
- feat: hide the new-campaign form until staff clicks New campaign; add a confirmed Void action beside redemption for claimable draw records, paginate lottery history at 10 rows per page, and align the controls with QYPOS styling
- fix: remove the requirement for every published lottery campaign to contain an unlimited no-prize fallback; new campaigns now start with prize-only entries, no-prize remains optional, and exhausted finite-stock slices safely resolve to another available prize
- fix: enforce a single running lottery campaign across overlapping schedules when publishing or resuming using a transactional lock and database exclusion constraint; flag schedule conflicts in Admin and disable conflicting publish/resume actions
- feat: allow staff to issue multiple numbered lottery entries for the same eligible paid order by reopening it and using the POS Lottery screen button; keep every draw linked to that order, make the wheel note optional/editable, and highlight the currently running campaign in Admin
- feat: distinguish instant lottery prizes from next-use voucher prizes; instant prizes are handed out on site without a redemption code, while voucher prizes generate a claim code and retain the confirmed redemption workflow
- feat: add an editable bilingual lottery invitation on the customer display after eligible payments, with QYPOS-styled Yes/No actions, a gently animated red Yes button, secure customer response handling, and automatic restoration when the paid order is reopened; make optional welcome-screen titles and subtitles editable in Admin and render each configured language on its own line without separators
- docs: add bilingual customer-display WebSocket setup covering isolation from the website-order `NEXT_PUBLIC_WS_URL`, LAN discovery, custom ports, HTTPS/WSS proxying, build-time variables, verification, and troubleshooting
- fix: preserve non-conflicting Admin wheel colours while automatically replacing duplicate or visually similar adjacent colours, including the closing last-to-first edge, with a high-contrast fallback
- fix: draw a dedicated high-contrast separator between crowded or same-colour wheel slices, lay bilingual labels out radially, and adapt their font sizes to slice count and label length so text stays readable without overlapping or appearing upside down
- Added dedicated customer-display kiosk safeguards that prevent pinch/shortcut zoom, selection, long-press menus, asset dragging, and page overscroll while preserving receipt scrolling and wheel gestures.

- fix: await browser audio-context activation inside the customer tap, swipe, or unmute gesture, play an immediate first tick, and strengthen the wheel ticks and finish bell so tablet browsers no longer leave the draw silent
- fix: derive a stable randomized in-segment wheel stop for every draw instead of always landing at the center, reserving a 20% safe zone beside each slice boundary so the pointer never appears to straddle a dividing line or shift after refresh
- fix: move the valid-receipt message below the customer wheel, remove the duplicate tap/swipe hint and pink wheel backdrop, replace the pointer with a long red wedge, and show each new POS lottery result for 15 seconds without restoring it after a page refresh
- feat: make Admin test draw show a customer-controlled ready screen before drawing without stock or history side effects; accept arbitrary prize weight values, normalize their displayed and saved probabilities to exactly 100%, and align the test action with QYPOS controls
- fix: require a second confirmation before lottery redemption, and refresh the customer bill in real time after POS discount or service-charge adjustments only when that same order is currently displayed
- feat: support safe lottery campaign deletion that revokes unused tickets while preserving order and draw history, and simplify the result modal into the QYPOS white-and-red panel style without duplicate headings or prompts
- feat: show bilingual lottery results in a centered customer-display modal after the wheel stops, standardize the no-prize English label as “Thank you”, and add a side-effect-free Admin test draw with optional full customer-display preview
- feat: give the customer wheel a roughly ten-second wind-up and long deceleration, synchronized ticks, a finish bell, subtle pointer movement, and a mute control using locally synthesized browser audio
- feat: show bilingual prize names on the wheel and winning result, add separate Chinese/English prize fields, and render equal-size wheel slices while keeping backend probability weights unchanged
- fix: simplify the customer lottery ready screen to one tap-or-swipe hint, remove duplicate headings and the Customer touch badge, and normalize legacy cashier-controlled settings back to customer touch
- fix: remove the Start draw button from POS customer-display controls so draws are initiated only by customer touch or wheel dragging on the customer screen
- feat: link Admin draw history to the original order and show the campaign, lottery result, draw time, claim-code suffix, and redemption state in order details
- fix: prevent result polling from restarting or rewinding the lottery wheel and reveal the prize only after the wheel has fully stopped
- feat: remove the lottery notice sidebar, show order-linked lottery eligibility and results in POS, and reject cashier draw requests for a different order
- fix: include ticket_id in customer-display draw requests and restore the ready screen when a draw fails instead of leaving it stuck on Drawing
- feat: add campaign editing in Admin lottery management for draft or paused campaign copy, dates, conditions, prizes, weights, and stock
- fix: align the customer display with the POS front desk using the same light workspace, white cards, red actions, borders, shadows, and spacing
- fix: align the POS customer-display controls and Admin lottery management with the existing panel, button, form, and status-card styles
- feat: make the customer-display lottery bilingual as “Lucky Wheel” and support touch-dragging the wheel as well as the Start draw button
- fix: reset the customer display to the welcome screen when POS switches from order A to order B, preventing stale order content
- fix: fix lottery campaign creation failing with HTTP 400 because JSONB arrays were not serialized explicitly
- feat: add POS customer-display buttons for manual switching between the welcome, bill, and lottery screens
- feat: add a dedicated LAN customer-display WebSocket with 1-second HTTP polling fallback, isolated from the website-order WebSocket
- fix: fix false offline status behind the default HTTP proxy, the broken logo path, inherited POS grid squeezing, mobile overflow, and skipped wheel animation; align the display with the QYPOS red card skin
- fix: prevent lottery tickets before all split orders are paid, enforce campaign service types, show claim codes, and resolve exhausted-prize wheel segments correctly
- feat: add an unpaired fixed `/customer-display` page with logo idle mode, checkout bills, realtime lottery wheel, automatic result clearing, and POS controls
- feat: add admin lottery campaigns with prize weights/stock, publish/pause actions, redemption history, customer-display settings, and idempotent ticket issuance after eligible payment
- feat: add a captured online-order inbox with idempotent import, cursor-based SSE reconnecting connector, and read-only admin inspection; M1 creates no POS orders or payment records
- feat: add prominent POS/admin alerts, alert sound, inbox auto-refresh, an Ops test button, and JSON-snapshot simple kitchen printing after confirmation
- feat: limit the online-order Connector to the Europe/London 11:00–22:05 opening window, with no SSE or reconnect activity outside business hours
- fix: make frontend WebSocket URLs follow `/api-proxy` or `NEXT_PUBLIC_WS_URL`, add API connection/broadcast logs and frontend realtime status, and rename the Admin tabs to Website and Delivery

- fix: reorganize delivery reconciliation into a single-column workflow with isolated Deliveroo/Uber Eats states; expired sessions are explicit and can be cleared without blocking the other platform
- fix: merge Deliveroo and Uber Eats sync controls into one shared Sales sync section with one date/time range instead of a separate Uber Eats sync card
- fix: fix historical report rendering by filling the full date range, correcting full-month MoM ranges, and ignoring stale report responses
- fix: attribute delivery sales to each order's placed_at in UK local time instead of the business_date of a cross-month sync batch
- refactor: remove server-side provider credential login and the headless browser service; delivery tokens/Cookies are now entered manually in admin
- feat: add a twice-daily 14:00/23:00 automatic-sync switch for delivery reconciliation, disabled by default

- feat: add read-only Uber Eats historic-order sync with encrypted browser-cookie storage, cursor pagination, manual and optional 14:00/23:00 automatic sync, order deduplication, and cancelled-order exclusion from sales

### Added
- **Deliveroo sales reconciliation**: Admin-only read-only Deliveroo browser-session sync stores deduplicated time-window snapshots and gross delivered-order totals without importing external orders into the POS payment flow.
- **Deliveroo analytics integration**: The dashboard and sales reports now show delivery gross sales, delivered orders, and delivery cash; overlapping automatic/manual windows are deduplicated by delivery order ID.
- **Sync to current time**: Today’s manual sync now pulls from 00:00 through the moment the button is clicked, while historical dates retain custom time windows.
- **Deliveroo token expiry validation**: Session storage now respects the JWT’s real expiry time instead of showing a misleading fixed 12-hour connection window.
- **Deliveroo token persistence**: Tokens are now AES-GCM encrypted in PostgreSQL, with Redis used only as a cache; API restarts can restore the session without re-entry.
- **Delivery sync time ranges**: Manual sync now supports independent start/end dates and times, while retaining a one-click “Sync to now” action.
- **Deliveroo pagination compatibility**: Sync now requests a larger first page and recognizes additional cursor fields, avoiding false “no pagination cursor” failures above 20 orders.
- **Cross-day pagination fix**: Deliveroo requests are now split by calendar day and filtered by the exact selected time range, bypassing the upstream 20-order cap when no cursor is returned.
- **Delivery cancellations and trends**: Cancelled orders remain in synced detail but are excluded from sales; reports now show cancellation counts and real MoM/YoY delivery trends.
- **Delivery analytics panel alignment**: Removed the delivery-specific background and forced white styling, restoring the original analytics card structure and visual hierarchy.
- **Dashboard delivery metric cards**: Dashboard delivery metrics now reuse the native metric cards and support real day-over-day comparisons.
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
