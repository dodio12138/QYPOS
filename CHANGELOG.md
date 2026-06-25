# Changelog · 更新日志

All notable changes to QYPOS will be documented in this file.
本文件记录 QYPOS 的所有重要变更。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-06-25

### Added — MVP 初始版本 / Initial MVP Release

#### 🛎️ 点餐前台 / POS Front Desk
- 可视化餐桌地图展示与状态管理 / Visual table map & status management
- 堂食开台 + 外卖下单双模式 / Dine-in & takeaway ordering
- 菜品分类浏览、规格选择、加料组与备注 / Menu browsing, variants, modifiers & notes
- 订单加菜、折扣、服务费调整 / Add items, discounts, service charge adjustment
- 手动支付记录（现金/刷卡/扫码/其他） / Manual payment records (cash/card/QR/other)
- WebSocket 实时桌台状态更新 / Real-time table status via WebSocket

#### 🖨️ 后厨打印 / Kitchen Printing
- ESC/POS 网络打印机支持 / ESC/POS network printer support
- 厨房单与收银小票拆分打印 / Separate kitchen & receipt printing
- 多打印机路由（厨房/收银/吧台独立配置） / Multi-printer routing (kitchen/receipt/bar)
- 打印失败自动重试机制 / Automatic print retry
- 厨房菜品级制作状态追踪 / Item-level cooking status tracking
- 打印任务管理后台 / Print job management UI

#### ⚙️ 后台管理 / Back Office
- 菜单全量管理：分类、菜品、规格、加料组 CRUD / Full menu CRUD
- 可视化餐桌布局编辑器 / Visual table layout editor (drag, zones, copy/delete)
- 网格吸附、撤销/重做 / Grid snapping, undo/redo
- 系统设置：税率、服务费、币种、打印机配置 / Tax, service charge, currency, printer config
- 收银小票预览 / Receipt preview

#### 📊 数据看板 / Dashboard & Reports
- 今日营业额、订单数、客单价、Tax、服务费统计 / Today's revenue, orders, avg ticket
- 热销菜品排行 / Top-selling items
- 历史销售报表（日期筛选 + CSV 导出） / Historical sales with CSV export
- 审计日志预览 / Audit log preview

#### 🔧 运维 / Operations
- 数据库手动备份 / 自动备份计划 / Manual & auto DB backups
- 备份文件下载 / Backup file download
- 服务健康检查面板 / Health check panel
- 浏览器离线/断网状态提示 / Offline & disconnection banners

#### 🧪 测试 / Testing
- 金额计算单元测试（含税/未税、折扣、服务费） / Money calculation tests
- API 集成测试（可选执行） / API integration tests (optional)

#### 🏗 基础设施 / Infrastructure
- Docker Compose 一键部署 / One-click Docker deployment
- PostgreSQL 16 + Redis 7
- Fastify API + WebSocket
- Next.js 14 前端 / Next.js 14 frontend
- Node.js 打印 Worker / Node.js print worker
