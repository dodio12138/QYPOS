# 🤝 贡献指南

<p align="center">
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
  <a href="./CONTRIBUTING_zh.md"><img src="https://img.shields.io/badge/lang-中文-red.svg" alt="中文"></a>
</p>

感谢你对 QYPOS 的关注！欢迎所有形式的贡献。

---

## 📋 行为准则

请保持友善和尊重。我们希望为所有参与者营造一个积极、包容的社区环境。

---

## 🚀 如何贡献

### 1. 报告 Bug

通过 GitHub Issues 提交，请包含：

- **描述**：Bug 的具体表现
- **复现步骤**：如何触发该 Bug
- **预期行为**：期望的正确行为
- **环境信息**：操作系统、Docker 版本、Node.js 版本
- **截图/日志**：如有请附上

### 2. 提出功能建议

请说明：

- 这个功能解决什么问题
- 期望的行为是什么样的
- 是否有替代方案

### 3. 贡献代码

#### 开发环境搭建

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/QYPOS.git
cd QYPOS

# 2. 安装依赖
npm install

# 3. 复制环境配置
cp .env.example .env

# 4. 启动基础设施
docker compose up -d postgres redis

# 5. 分别启动各服务
cd apps/api && npm run dev          # API :4000
cd apps/web && npm run dev          # Web :3000
cd apps/printer-service && npm run dev  # Printer Worker
```

#### 分支策略

```bash
git checkout -b feature/your-feature-name   # 新功能
git checkout -b fix/your-bug-fix            # Bug 修复
git checkout -b docs/your-doc-update        # 文档更新
```

#### 提交规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加菜品批量导入功能
fix: 修复税率计算精度问题
docs: 更新 API 文档
refactor: 重构打印队列处理逻辑
test: 添加服务费计算测试用例
chore: 升级依赖版本
```

#### 提交前检查清单

- [ ] 代码通过现有测试：`npm test`
- [ ] 新功能包含相应的测试用例
- [ ] 遵循项目现有的代码风格
- [ ] 提交信息清晰明确
- [ ] 如涉及 API 变更，更新了相关文档

#### 发起 Pull Request

1. 将你的分支推送到 GitHub
2. 创建 Pull Request 到 `main` 分支
3. 在 PR 描述中清晰说明：
   - 改了什么
   - 为什么这样改
   - 如何测试

---

## 🏗 项目结构

```
QYPOS/
├── apps/
│   ├── web/                   # Next.js 前端
│   ├── api/                   # Fastify 后端
│   └── printer-service/       # 打印服务
├── packages/
│   └── shared/                # 共享代码
├── db/
│   ├── init.sql               # 数据库 schema
│   └── migrations/            # 迁移脚本
├── scripts/                   # 运维脚本
├── tests/                     # 测试
└── docker-compose.yml         # Docker 编排
```

### 关键约定

- **API 服务** (`apps/api`)：Fastify，路由在 `server.js`，业务逻辑在 `services/`
- **前端** (`apps/web`)：Next.js App Router，组件在 `components/`，API 调用在 `lib/api.js`
- **共享代码** (`packages/shared`)：跨服务复用的金额计算和常量
- **数据库迁移**：通过 `db/migrations/` 管理，API 启动时自动执行

---

## 🧪 测试指南

```bash
# 运行所有测试
npm test

# 仅运行计算逻辑测试
node --test tests/calculations.test.mjs

# API 集成测试
API_BASE=http://localhost:4000 node --test tests/api.integration.test.mjs
```

### 测试规范

- 使用 Node.js 原生 `node:test` + `node:assert`
- 计算逻辑测试不依赖外部服务，可独立运行
- API 集成测试通过 `{ skip: !API_BASE }` 支持条件跳过
- 新功能应包含对应的测试用例

---

## ❓ 常见问题

### Q: 我没有 ESC/POS 打印机，能参与开发吗？

可以。打印服务在没有真实打印机时会降级为仅日志输出，不影响前后端开发。你也可以通过后台设置页的"打印测试"查看生成的打印预览。

### Q: 数据库 schema 如何变更？

请在 `db/migrations/` 下新增 SQL 文件（命名规则：`NNN_description.sql`），API 启动时会自动检测并执行未应用的迁移。

### Q: 如何添加新的 API 端点？

在 `apps/api/src/server.js` 中注册路由，遵循现有的权限校验模式。如需新增权限项，需要同时在 `db/init.sql` 的 roles 表和 `ensureSchema()` 中更新。

---

再次感谢你的贡献！🎉
