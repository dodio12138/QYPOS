# Changelog

<p align="center">
  <a href="./CHANGELOG_zh.md"><img src="https://img.shields.io/badge/lang-中文-red.svg" alt="中文"></a>
  <a href="./CHANGELOG.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

All notable changes to QYPOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-06-25

### Added — Initial MVP Release

#### 🛎️ POS Front Desk
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
