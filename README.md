# QYPOS

Small restaurant POS for a single local restaurant deployment. It includes a Web POS, PostgreSQL database, Redis-backed print queue, dashboard, visual table layout, menu management, tax/service-charge settings, and a network ESC/POS printer worker.

## Run

```bash
cp .env.example .env
docker compose up --build
```

Open:

- POS ordering app: http://localhost:3000
- Admin back office: http://localhost:3000/admin
- API health: http://localhost:4000/health

Seed login:

- Name: `Owner`
- PIN: `0000`
- Cashier seed: `Cashier / 1111`
- Kitchen seed: `Kitchen / 2222`

## Services

- `apps/web`: Next.js restaurant operations UI.
- `apps/api`: Fastify API, WebSocket events, order calculation, print job creation.
- `apps/printer-service`: Redis print worker for network ESC/POS printers.
- `db/init.sql`: Schema and seed data.
- `packages/shared`: Shared money calculation and constants.

## Useful Commands

```bash
npm test
npm run backup
npm run restore -- backups/qypos-YYYYMMDD-HHMMSS.sql
```

## Current MVP Coverage

- POS-only ordering front desk.
- Separate admin back office for settings, menu, dashboard, kitchen, and layout editing.
- Visual table map and draggable layout editor.
- Dine-in and takeaway order creation.
- Menu categories, items, variants, modifier groups, and add-ons.
- Configurable tax, tax-inclusive pricing, receipt tax display, and service charge.
- Permission-controlled service charge adjustment, discounting, and cancellation.
- Manual payment records.
- Kitchen and receipt print jobs with retryable job records.
- Dashboard totals, historical sales report, CSV export, and audit log preview.
