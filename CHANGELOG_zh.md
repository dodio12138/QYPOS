# 更新日志

<p align="center">
  <a href="./CHANGELOG.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
  <a href="./CHANGELOG_zh.md"><img src="https://img.shields.io/badge/lang-中文-red.svg" alt="中文"></a>
</p>

本文件记录 QYPOS 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

---

## [0.1.0] - 2026-06-25

### Added — MVP 初始版本

#### 🛎️ 点餐前台
- 可视化餐桌地图展示与状态管理
- 堂食开台 + 外卖下单双模式
- 菜品分类浏览、规格选择、加料组与备注
- 订单加菜、折扣、服务费调整
- 手动支付记录（现金/刷卡/扫码/其他）
- WebSocket 实时桌台状态更新

#### 🖨️ 后厨打印
- ESC/POS 网络打印机支持
- 厨房单与收银小票拆分打印
- 多打印机路由（厨房/收银/吧台独立配置）
- 打印失败自动重试机制
- 厨房菜品级制作状态追踪
- 打印任务管理后台

#### ⚙️ 后台管理
- 菜单全量管理：分类、菜品、规格、加料组 CRUD
- 可视化餐桌布局编辑器（拖拽、区域管理、复制/删除桌台）
- 网格吸附、撤销/重做
- 系统设置：税率、服务费、币种、打印机配置
- 收银小票预览

#### 📊 数据看板
- 今日营业额、订单数、客单价、Tax、服务费统计
- 热销菜品排行
- 历史销售报表（日期筛选 + CSV 导出）
- 审计日志预览

#### 🔧 运维
- 数据库手动备份 / 自动备份计划
- 备份文件下载
- 服务健康检查面板
- 浏览器离线/断网状态提示

#### 🧪 测试
- 金额计算单元测试（含税/未税、折扣、服务费）
- API 集成测试（可选执行）

#### 🏗 基础设施
- Docker Compose 一键部署
- PostgreSQL 16 + Redis 7
- Fastify API + WebSocket
- Next.js 14 前端
- Node.js 打印 Worker
