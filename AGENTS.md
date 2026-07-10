# QYPOS — AI Agent Guidelines

开源轻量级餐饮 POS 系统，单店本地部署的 Web 收银解决方案。

## 技术栈速览

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 (App Router), React, Lucide React |
| 后端 | Fastify 4, WebSocket |
| 数据库 | PostgreSQL 16 (`pg` 驱动) |
| 缓存/消息 | Redis 7 (`ioredis`) |
| 打印 | `@napi-rs/canvas` → ESC/POS bitmap |
| 部署 | Docker Compose (5 个服务) |
| 测试 | Node.js 原生 `node:test` |
| Lint | ESLint 9 flat config |
| 包管理 | npm workspaces (`apps/*`, `packages/*`) |

## 构建 / 测试 / Lint

```bash
npm run dev      # docker compose up --build（构建并启动全部服务）
npm test         # node --test tests/*.test.mjs
npm run lint     # eslint .（CI 中也会运行）
npm run backup   # 备份数据库
npm run restore  # 恢复数据库
```

集成测试需要运行中的 API：
```bash
API_BASE=http://localhost:4000 TEST_ADMIN_NAME=Owner TEST_ADMIN_PIN=<pin> node --test tests/*.test.mjs
```

> ⚠️ 注意：未设置 `API_BASE` 时集成测试会**静默跳过**（不报错），务必显式设置该变量以验证完整功能。

> ⚠️ 集成测试会创建真实的菜单分类和菜品（`name_i18n->>'en-GB' = 'Integration'`）并在测试结束时清理。如果测试中途失败，残留的 "Integration" 数据会出现在生产菜单中。可通过 API 删除或查询 `menu_categories` 表清理。

查询当前数据库用户凭据：
```bash
docker compose exec -T postgres psql -U qypos -d qypos -c "SELECT name, pin FROM users;"
```

## 架构关键决策

- **Monorepo**：`apps/api`（Fastify）、`apps/web`（Next.js）、`apps/printer-service`（打印 worker）、`packages/shared`（共享计算函数）
- **BFF 代理**：Web 不直接调 API，通过 `apps/web/src/app/api-proxy/[...path]/route.js` 反向代理到内部 `http://api:4000`
- **打印解耦**：API → Redis `print_events` channel → Printer Service 订阅消费
- **无全局认证中间件**：每条路由手动调用 `requirePermission()` / `requireAnyPermission()`。部分 GET 接口（如 `/orders`、`/menu`）无权限检查——这是为点餐前台在登录前也能工作的有意设计，修改需谨慎
- **数据库迁移**：API 启动时执行 `ensureSchema()` 自包含兼容迁移 + `runMigrations()` 增量迁移。迁移文件在 `db/migrations/`，按序号命名

详见 [PROJECT_STATUS.md](./PROJECT_STATUS.md) 和 [README_zh.md](./README_zh.md)。

## 项目特有约定

### 国际化
多语言字段使用 JSONB 格式：`{ "zh-CN": "牛肉面", "en-GB": "Beef Noodles" }`。通过 `@qypos/shared` 的 `labelOf(value, locale)` 取值，fallback 链：指定 locale → zh-CN → en-GB → 任意值。

### 命名
- 文件：kebab-case（如 `role-permissions.js`）
- React 组件：PascalCase，默认导出
- 数据库列：snake_case，主键 UUID + `gen_random_uuid()`
- 时间戳：统一 `TIMESTAMPTZ`

### 常见陷阱：locale/currency prop 传递

这是本项目最常出现的 bug 类型：组件内部使用了 `t(locale, ...)` / `text(locale, ...)` 或直接引用了 `locale` / `currency`，但函数签名中未声明该 prop，或调用方未传递。这会导致 `ReferenceError: locale is not defined`。

**添加任何新子组件时**，务必：
1. 确认 prop 已在函数签名中声明
2. 确认所有调用方都传递了该 prop
3. 运行 `npm run lint`（`no-undef` 规则会捕获此类问题）

### ESLint 设计原则
ESLint 配置有意保持精简：仅 `js.configs.recommended`（核心是 `no-undef`）+ `react-hooks/exhaustive-deps`（warn）。不启用风格规则或 `no-unused-vars`。Lint 仅在 CI 和本地开发中运行，不嵌入 Docker 镜像构建。

### Git 提交约定

提交信息格式：`<type>: <简短描述>`，type 可选值：
- `feat:` — 新功能
- `fix:` — Bug 修复
- `refactor:` — 重构（不改变功能）
- `docs:` — 文档更新
- `test:` — 测试相关
- `chore:` — 构建/工具链

**提交前必须做的同步工作**：
1. 如果改动涉及新功能/修复，更新 `CHANGELOG_zh.md` 和 `CHANGELOG.md`（在 `[Unreleased]` 下对应子标题）
2. 如果改动涉及 Roadmap 中的项（如 PIN 哈希），将 `README.md` 和 `README_zh.md` 中对应的 `- [ ]` 改为 `- [x]`
3. 如果新增/删除关键文件，更新 `AGENTS.md` 中的关键文件索引
4. 推荐在 Docker 环境中重建验证后再提交：`docker compose up --build -d && npm test && npm run lint`

## 关键文件索引

| 文件 | 内容 |
|---|---|
| `apps/api/src/server.js` | API 全部路由（约数千行） |
| `apps/api/src/services/permissions.js` | 认证与权限中间件、PIN 哈希/验证 (`hashPin`/`verifyPin`) |
| `apps/api/src/services/role-permissions.js` | 角色权限定义 |
| `apps/web/src/app/page.jsx` | 点餐前台主页面 |
| `apps/web/src/app/admin/page.jsx` | 后台管理主页面 |
| `apps/web/src/app/api-proxy/[...path]/route.js` | BFF 反向代理 |
| `apps/printer-service/src/worker.js` | 打印 worker |
| `packages/shared/src/index.js` | 共享工具函数 |
| `db/init.sql` | 数据库 schema + 种子数据 |
| `db/migrations/` | 增量迁移脚本 |
| `tests/helpers.mjs` | 共享测试辅助模块 |
| `tests/pin-hashing.test.mjs` | PIN 哈希单元测试 |
| `tests/calculations.test.mjs` | 订单计算单元测试 |
| `tests/api.integration.test.mjs` | API 集成测试（拆分 6 组） |
| `eslint.config.mjs` | ESLint flat config |

## 文档索引

- [README_zh.md](./README_zh.md) / [README.md](./README.md) — 项目介绍与截图
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) — 功能实现状态与已验证业务路径
- [CONTRIBUTING_zh.md](./CONTRIBUTING_zh.md) / [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [docs/UI_UX_BRIEF_zh.md](./docs/UI_UX_BRIEF_zh.md) — UI/UX 设计概要
- [CHANGELOG_zh.md](./CHANGELOG_zh.md) / [CHANGELOG.md](./CHANGELOG.md) — 变更日志

本地数据库默认凭据：`Owner/12138`、`Cashier/1111`、`Kitchen/2222`（以实际 `docker compose exec` 查询为准）。
