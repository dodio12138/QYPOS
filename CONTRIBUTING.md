# 🤝 Contributing Guide

<p align="center">
  <a href="./CONTRIBUTING_zh.md"><img src="https://img.shields.io/badge/lang-中文-red.svg" alt="中文"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

Thank you for your interest in QYPOS! All forms of contribution are welcome.

---

## 📋 Code of Conduct

Please be kind and respectful. We strive to foster a positive and inclusive community.

---

## 🚀 How to Contribute

### 1. Report a Bug

Open a GitHub Issue and include:

- **Description**: What happened
- **Steps to Reproduce**: How to trigger it
- **Expected Behavior**: What should have happened
- **Environment**: OS, Docker version, Node.js version
- **Screenshots & Logs**: If available

### 2. Feature Request

Please describe:

- What problem it solves
- What the expected behavior looks like
- Any alternative approaches

### 3. Contribute Code

#### Dev Environment Setup

```bash
# 1. Fork & clone
git clone https://github.com/YOUR_USERNAME/QYPOS.git
cd QYPOS

# 2. Install dependencies
npm install

# 3. Copy env config
cp .env.example .env

# 4. Start infrastructure
docker compose up -d postgres redis

# 5. Start services in dev mode
cd apps/api && npm run dev          # API :4000
cd apps/web && npm run dev          # Web :3000
cd apps/printer-service && npm run dev  # Printer Worker
```

#### Branch Strategy

```bash
git checkout -b feature/your-feature-name   # New feature
git checkout -b fix/your-bug-fix            # Bug fix
git checkout -b docs/your-doc-update        # Doc update
```

#### Commit Convention

Please follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add bulk menu import
fix: fix tax rounding precision
docs: update API docs
refactor: refactor print queue handler
test: add service charge test
chore: upgrade dependencies
```

#### Pre-submit Checklist

- [ ] Code passes existing tests: `npm test`
- [ ] New features include tests
- [ ] Follow existing code style
- [ ] Clear commit messages
- [ ] API changes are documented

#### Open a Pull Request

1. Push your branch to GitHub
2. Create PR to `main`
3. Clearly describe:
   - What changed
   - Why
   - How to test

---

## 🏗 Project Structure

```
QYPOS/
├── apps/
│   ├── web/                   # Next.js Frontend
│   ├── api/                   # Fastify Backend API
│   └── printer-service/       # Print worker
├── packages/
│   └── shared/                # Shared code
├── db/
│   ├── init.sql               # DB schema
│   └── migrations/            # Migrations
├── scripts/                   # Ops scripts
├── tests/                     # Tests
└── docker-compose.yml         # Docker orchestration
```

### Key Conventions

- **API Service** (`apps/api`): Fastify, routes in `server.js`, business logic in `services/`
- **Frontend** (`apps/web`): Next.js App Router, components in `components/`, API calls in `lib/api.js`
- **Shared** (`packages/shared`): Cross-service money calculation and constants
- **DB Migrations**: Managed via `db/migrations/`, auto-applied on API startup

---

## 🧪 Testing Guide

```bash
# Run all tests
npm test

# Calculation tests only
node --test tests/calculations.test.mjs

# API integration tests
API_BASE=http://localhost:4000 node --test tests/api.integration.test.mjs

# Preset binding and sensitive-settings integration tests
API_BASE=http://localhost:4000 node --test tests/option-presets.integration.test.mjs
```

### Test Conventions

- Uses Node.js native `node:test` + `node:assert`
- Calculation tests run independently without external services
- API integration tests support conditional skip via `{ skip: !API_BASE }`
- Integration tests that create records must clean them in a `finally` block; never leave test users, menu items, presets, or settings changes in the live development database
- New features should include tests

---

## ❓ FAQ

### Q: I don't have an ESC/POS printer, can I still contribute?

Yes. The print worker falls back to log output when no real printer is available. You can also use the "Print Test" button in Admin Settings to preview print output.

### Q: How do I change the database schema?

Add a new SQL file under `db/migrations/` (naming: `NNN_description.sql`). Pending migrations run automatically on API startup. Keep `db/init.sql` and the API `ensureSchema()` compatibility bootstrap in sync with every schema addition, then rebuild the API container to verify the migration is applied.

### Q: How do I add a new API endpoint?

Register the route in `apps/api/src/server.js`, following the existing permission check pattern. New permissions must be added to both `db/init.sql` roles and `ensureSchema()`.

---

Thank you for contributing! 🎉
