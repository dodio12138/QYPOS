# 🤝 贡献指南 / Contributing Guide

感谢你对 QYPOS 的关注！我们欢迎所有形式的贡献。

> Thank you for your interest in QYPOS! All forms of contribution are welcome.

---

## 📋 行为准则 / Code of Conduct

请保持友善和尊重。我们希望为所有参与者营造一个积极、包容的社区环境。

> Please be kind and respectful. We strive to foster a positive and inclusive community.

---

## 🚀 如何贡献 / How to Contribute

### 1. 报告 Bug / Report a Bug

通过 GitHub Issues 提交，请包含 / Please include:

- **描述 / Description**：Bug 的具体表现 / What happened
- **复现步骤 / Steps to Reproduce**：如何触发该 Bug / How to trigger it
- **预期行为 / Expected Behavior**：期望的正确行为 / What should have happened
- **环境信息 / Environment**：操作系统、Docker 版本、Node.js 版本 / OS, Docker, Node versions
- **截图/日志 / Screenshots & Logs**：如有请附上 / If available

### 2. 提出功能建议 / Feature Request

请说明 / Please describe:

- 这个功能解决什么问题 / What problem it solves
- 期望的行为是什么样的 / What the expected behavior looks like
- 是否有替代方案 / Any alternative approaches

### 3. 贡献代码 / Contribute Code

#### 开发环境搭建 / Dev Environment Setup

```bash
# 1. Fork 并克隆仓库 / Fork & clone
git clone https://github.com/YOUR_USERNAME/QYPOS.git
cd QYPOS

# 2. 安装依赖 / Install dependencies
npm install

# 3. 复制环境配置 / Copy env config
cp .env.example .env

# 4. 启动基础设施 / Start infrastructure
docker compose up -d postgres redis

# 5. 分别启动各服务 / Start services in dev mode
cd apps/api && npm run dev          # API :4000
cd apps/web && npm run dev          # Web :3000
cd apps/printer-service && npm run dev  # Printer Worker
```

#### 分支策略 / Branch Strategy

```bash
git checkout -b feature/your-feature-name   # 新功能 / New feature
git checkout -b fix/your-bug-fix            # Bug 修复 / Bug fix
git checkout -b docs/your-doc-update        # 文档更新 / Doc update
```

#### 提交规范 / Commit Convention

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加菜品批量导入功能 / add bulk menu import
fix: 修复税率计算精度问题 / fix tax rounding precision
docs: 更新 API 文档 / update API docs
refactor: 重构打印队列处理逻辑 / refactor print queue handler
test: 添加服务费计算测试用例 / add service charge test
chore: 升级依赖版本 / upgrade dependencies
```

#### 提交前检查清单 / Pre-submit Checklist

- [ ] 代码通过现有测试 / Code passes existing tests: `npm test`
- [ ] 新功能包含相应的测试用例 / New features include tests
- [ ] 遵循项目现有的代码风格 / Follow existing code style
- [ ] 提交信息清晰明确 / Clear commit messages
- [ ] 如涉及 API 变更，更新了相关文档 / API changes are documented

#### 发起 Pull Request

1. 将你的分支推送到 GitHub / Push your branch
2. 创建 Pull Request 到 `main` 分支 / Create PR to `main`
3. 在 PR 描述中清晰说明 / Clearly describe:
   - 改了什么 / What changed
   - 为什么这样改 / Why
   - 如何测试 / How to test

---

## 🏗 项目结构 / Project Structure

```
QYPOS/
├── apps/
│   ├── web/                   # Next.js 前端 / Frontend
│   ├── api/                   # Fastify 后端 / Backend API
│   └── printer-service/       # 打印服务 / Print worker
├── packages/
│   └── shared/                # 共享代码 / Shared code
├── db/
│   ├── init.sql               # 数据库 schema
│   └── migrations/            # 迁移脚本 / Migrations
├── scripts/                   # 运维脚本 / Ops scripts
├── tests/                     # 测试 / Tests
└── docker-compose.yml         # Docker 编排
```

### 关键约定 / Key Conventions

- **API 服务 / API Service** (`apps/api`)：Fastify，路由在 `server.js`，业务逻辑在 `services/`
- **前端 / Frontend** (`apps/web`)：Next.js App Router，组件在 `components/`，API 调用在 `lib/api.js`
- **共享代码 / Shared** (`packages/shared`)：跨服务复用的金额计算和常量
- **数据库迁移 / DB Migrations**：通过 `db/migrations/` 管理，API 启动时自动执行

---

## 🧪 测试指南 / Testing Guide

```bash
# 运行所有测试 / Run all tests
npm test

# 仅运行计算逻辑测试 / Calculation tests only
node --test tests/calculations.test.mjs

# API 集成测试 / API integration tests
API_BASE=http://localhost:4000 node --test tests/api.integration.test.mjs
```

### 测试规范 / Test Conventions

- 使用 Node.js 原生 `node:test` + `node:assert`
- 计算逻辑测试不依赖外部服务，可独立运行
- API 集成测试通过 `{ skip: !API_BASE }` 支持条件跳过
- 新功能应包含对应的测试用例 / New features should include tests

---

## ❓ 常见问题 / FAQ

### Q: 我没有 ESC/POS 打印机，能参与开发吗？
### Q: I don't have an ESC/POS printer, can I still contribute?

可以。打印服务在没有真实打印机时会降级为仅日志输出，不影响前后端开发。你也可以通过后台设置页的"打印测试"查看生成的打印预览。

> Yes. The print worker falls back to log output when no real printer is available. You can also use the "Print Test" button in Admin Settings to preview print output.

### Q: 数据库 schema 如何变更？
### Q: How do I change the database schema?

请在 `db/migrations/` 下新增 SQL 文件（命名规则：`NNN_description.sql`），API 启动时会自动检测并执行未应用的迁移。

> Add a new SQL file under `db/migrations/` (naming: `NNN_description.sql`). Pending migrations run automatically on API startup.

### Q: 如何添加新的 API 端点？
### Q: How do I add a new API endpoint?

在 `apps/api/src/server.js` 中注册路由，遵循现有的权限校验模式。如需新增权限项，需要同时在 `db/init.sql` 的 roles 表和 `ensureSchema()` 中更新。

> Register the route in `apps/api/src/server.js`, following the existing permission check pattern. New permissions must be added to both `db/init.sql` roles and `ensureSchema()`.

---

再次感谢你的贡献！🎉 / Thank you for contributing! 🎉
