# QYPOS 开发任务：顾客外屏与抽奖轮盘

状态：基础版本已实现，待补充增强项
建议版本：v0.3.0
优先级：中
任务类型：前后端、实时通信、数据库、打印、权限与 Docker 联动

## 1. 任务目标

在 QYPOS 中增加一块长期打开的顾客外屏。无操作时展示餐厅 Logo、欢迎语等品牌内容；收银员进入结账流程时，外屏实时显示当前顾客的账单；订单付清且收银员开启抽奖后，外屏切换成有趣的轮盘。抽奖结果停留一段可配置时间后自动清除，并回到品牌待机页。

POS 后台新增“抽奖”条目，并包含“顾客屏”设置。管理员可以设置待机内容和自动返回时间，也可以新建、保存、预览、发布、暂停、结束和复制抽奖活动，配置奖项内容、概率、库存、参与条件、兑奖期限和页面文案。

抽奖结果必须由 API 服务端安全生成并在数据库事务中落库，前端动画只能展示已经确定的结果，不能在浏览器中计算或修改奖项。

## 2. 已确定的产品方案

### 2.1 顾客外屏访问地址

M1 不新增重复前端服务，复用现有 `apps/web`：

```text
http://<POS 主机局域网 IP>:3000/customer-display
```

- 固定使用现有 Web 端口 `3000`，Docker 映射仍为 `3000:3000`。
- POS 前台继续使用 `/`，后台继续使用 `/admin`，顾客外屏使用 `/customer-display`。
- `/lottery` 可保留为没有固定外屏时的抽奖码备用入口，但不是本任务的主流程。
- 部署文档可将 `http://192.168.1.20:3000/customer-display` 作为门店快捷方式保存；M1 不要求额外环境变量。
- 顾客外屏不显示 POS 导航、后台入口、员工信息、内部备注或管理控制。
- 如以后需要隔离到单独端口，再在 M2 增加反向代理；M1 不复制 Next.js 应用。

### 2.2 外屏显示规则

- 外屏是长期运行的独立浏览器页面，不需要配对码、设备注册或屏幕账号。
- 平板或显示器只需打开固定网页，加载后直接进入品牌待机状态。
- 收银员打开当前订单的付款弹窗或主动点击“显示账单”时，外屏显示该订单的顾客安全账单快照。
- 菜品、数量、选项、单价、小计、折扣、服务费、税额、总额、已付和待付金额发生变化时，顾客屏专用页面实时更新。
- 订单付清后，外屏先显示付款完成状态。若订单具有抽奖资格，POS 显示“在顾客屏开启抽奖”按钮。
- 默认由收银员手动开启抽奖，避免每次付款后外屏自动跳转；后台可以另行开启“符合条件时自动进入抽奖”。
- 支持两种模式：`customer_touch` 由顾客点击外屏开始旋转；`cashier_controlled` 由收银员在 POS 点击后开始旋转，适用于非触摸显示器。
- 抽奖结果默认停留 20 秒，管理员可配置 5–120 秒；到时必须清除账单和结果并回到 Logo 待机页。
- 收银员可以随时点击“清空顾客屏”，取消收款、退出登录或换单时也必须清除上一位顾客的内容。
- 页面刷新或 WebSocket 重连后从服务端读取当前显示状态；已超过 `visible_until` 的账单或结果不得重新出现。

### 2.3 抽奖核心业务规则

- 默认只有状态首次变为 `paid` 且满足活动条件的订单才产生一张抽奖票。
- 同一活动、同一订单组最多一次机会；重复支付回调、刷新或重试不能产生第二张票。
- 普通订单以 `orders.id` 为资格；拆单以根订单 `parent_order_id` 为同一订单组，所有子单结清后只生成一次资格。
- 免单、取消单、草稿单、未付清订单默认不参与。
- 抽奖票只能使用一次；同一请求重试必须返回原结果，不能再次开奖。
- M1 奖品只生成兑奖凭证，不自动改写已付款订单、付款记录、销售报表或会计导出。
- 员工在后台核销奖品；核销必须记录操作人和时间。
- 同一时间最多允许一个正在发票的活动，避免付款时无法判断应使用哪套规则。
- 活动到达结束时间或被手动结束后不再发新票，但此前已签发且未过期的票仍可开奖；活动暂停时暂时禁止发票和开奖。

## 3. 用户流程

### 3.1 管理员创建活动

1. 管理员进入 `/admin`，点击侧栏“抽奖 / Lottery”。
2. 点击“新建抽奖”。
3. 填写活动名称、顾客端标题、时间、参与条件和兑奖期限。
4. 添加 2–12 个轮盘区块，设置奖项文字、颜色、概率和库存。
5. 必须指定一个不限库存的“谢谢参与”兜底奖项。
6. 保存为草稿并在后台预览轮盘。
7. 系统通过发布校验后，管理员点击“发布”。

### 3.2 外屏打开与日常待机

1. 在对外屏幕的浏览器打开 `http://<POS-IP>:3000/customer-display`。
2. 页面直接显示现有 QYPOS/餐厅 Logo、餐厅中英文名称和欢迎语。
3. 页面保持全屏运行；断网时继续显示本地缓存的待机品牌内容，并显示小型离线标识。
4. 同一局域网内如果打开多个顾客屏网页，它们显示同一份当前状态；M1 按单店单外屏场景设计。

### 3.3 结账显示

1. 收银员选择订单并进入收款，POS 将订单 ID 发送给顾客屏控制接口。
2. API 在服务端生成脱敏账单快照，并只发送到顾客屏专用连接集合。
3. 顾客看到菜品、数量、选项和金额汇总；部分付款后“已付/待付”实时变化。
4. 付款成功后显示“付款完成”，但不显示银行卡后四位、授权码、员工或顾客资料。
5. 没有抽奖资格时，付款完成提示停留数秒后自动回到 Logo 待机页。

### 3.4 顾客抽奖

1. 符合条件的订单付清后，POS 显示“在顾客屏开启抽奖”。
2. 收银员点击后，外屏从账单状态切换为该订单的轮盘节目，不需要顾客输入抽奖码。
3. 触摸模式由顾客点击“开始抽奖”；非触摸模式由收银员点击“开始旋转”。
4. API 先在事务中确定并保存结果，轮盘再转到服务端返回的目标区块。
5. 页面显示奖项、兑奖码和有效期；未中奖时显示管理员配置的提示语。
6. 结果显示达到配置时间后，外屏自动清除订单、抽奖和兑奖内容并回到 Logo 待机页。
7. 备用 `/lottery` 页面仍可使用一次性抽奖码恢复未完成流程，但不能产生第二次开奖。

### 3.5 员工核销

1. 员工在后台“抽奖 → 兑奖记录”输入兑奖码或搜索当日记录。
2. 页面显示奖项、中奖时间、有效期和当前状态，不显示不必要的顾客信息。
3. 有权限的员工点击“确认核销”。
4. API 原子更新核销状态并写入审计日志；重复核销返回原核销信息和明确提示。

## 4. POS 后台功能

后台新增一级条目：

```text
抽奖 Lottery
```

建议使用 Lucide `Gift` 或 `Dices` 图标，新增组件：

```text
apps/web/src/app/admin/_components/lottery-view.jsx
```

页面分为四个页签：顾客屏、活动管理、基础设置与奖项概率、兑奖记录与统计。

### 4.1 顾客屏设置

- 单屏状态：在线连接数、最后心跳、当前显示状态和当前订单号。
- 操作：打开顾客屏地址、预览待机页、测试账单、测试抽奖、立即清空。
- 待机内容：现有餐厅 Logo、餐厅中英文名称、欢迎语、纯色或渐变背景、可选时钟。
- M1 默认复用仓库现有 Logo；自定义图片上传作为后续增强，不能因此阻塞顾客屏上线。
- 交互模式：顾客触摸开始或收银员控制开始。
- 自动行为：进入付款时是否自动显示账单、付款完成提示秒数、抽奖结果停留秒数、空闲回待机秒数。
- 所有时长必须有合理上下限；结果停留默认 20 秒，允许 5–120 秒。
- 页面提供顾客屏预览，预览必须使用模拟数据，不能把真实订单广播给其他浏览器。

### 4.2 活动管理

- 活动列表：名称、状态、开始/结束时间、已发票数、已抽次数、中奖次数、待核销数。
- 操作：新建、编辑草稿、复制、预览、发布、暂停、恢复、结束。
- 状态：`draft`、`published`、`paused`、`ended`。
- `published` 只有处于开始/结束时间范围内时才签发新票。
- `paused` 暂停发票和开奖；`ended` 永久停止发新票，但已签发票可在自身有效期内继续开奖和兑奖。
- 已发布活动的概率、奖项和资格条件不可直接修改；需要暂停并“复制为新活动”，防止历史结果与当前配置不一致。
- 已发布或已有抽奖记录的活动不能硬删除；草稿可以删除。

### 4.3 抽奖基础设置

- 内部名称，必填，仅后台使用。
- 顾客端标题、副标题、按钮文字和未中奖提示，使用 `zh-CN` / `en-GB` JSONB。
- 开始时间、结束时间，保存为 `TIMESTAMPTZ`，后台按 `Europe/London` 展示。
- 最低订单金额，默认 `0.00`，使用订单最终 `total` 判断。
- 允许的服务类型：堂食、外带或全部。
- 允许的付款方式，默认排除 `complimentary`。
- 抽奖票有效分钟数和中奖后兑奖有效分钟数。
- 顾客页主色、轮盘背景色、是否启用音效。音效默认关闭，必须由顾客点击后播放。
- 中英文活动规则纯文本，不允许任意 HTML。

### 4.4 奖项与概率

每个轮盘区块包含：

- 排序位置。
- 奖项类型：`prize` 或 `no_prize`。
- 中英文名称、简短说明和兑奖说明。
- 轮盘颜色和文字颜色，后台应检查基本对比度。
- 概率以百分比输入，数据库使用整数基点 `weight_bps`；`1% = 100`，总和必须为 `10000`。
- 库存：`NULL` 表示不限量，有限库存必须为非负整数。
- 启用状态。发布前不得保留概率大于 0 的停用区块。

发布校验：

- 必须有 2–12 个区块。
- 所有启用区块概率之和必须精确等于 `10000`。
- 必须且只能有一个 `no_prize` 兜底区块，并且必须不限库存。
- 每个启用区块的 `weight_bps` 必须大于 0。
- 有限库存不能小于已经中奖且未撤销的数量。
- 活动时间合法，不能与另一个已发布活动的有效时间重叠。
- 顾客端标题、按钮文字和所有区块名称不能为空。

库存耗尽规则：

- 有限库存奖项耗尽后，它原有的概率区间转移给“谢谢参与”兜底区块。
- 其他奖项概率不得因某一奖项耗尽而自动上升。
- 顾客端轮盘快照把耗尽区间显示为额外的“谢谢参与”区块，保证动画和实际结果一致。
- 后台同时显示“配置概率”和考虑库存后的“当前有效概率”。

### 4.5 记录与统计

- 按活动、日期、票状态、奖项、核销状态筛选。
- 指标：发票数、使用率、各奖项中奖数、剩余库存、待核销数、过期数。
- 明细：订单号、票码后四位、奖项、开奖时间、兑奖码后四位、核销状态和核销员工。
- 默认隐藏完整抽奖码和兑奖码；不得把完整码写进普通日志。
- 支持 CSV 导出，但导出不进入会计销售报表。

### 4.6 POS 前台顾客屏控制

POS 点餐前台增加轻量控制，不放进后台管理页才能操作：

- 顶部状态显示“顾客屏：在线 / 离线”，多个页面打开时可显示连接数。
- 当前订单存在时提供“显示账单”；进入付款弹窗时可按设置自动调用。
- 付款成功且有资格时提供“在顾客屏开启抽奖”。
- 非触摸模式提供“开始旋转”。
- 始终提供“清空顾客屏”，切换顾客或处理异常时可立即回到 Logo。
- 控件不得阻塞正常点餐、收款和打印；顾客屏离线时付款仍必须正常完成。

## 5. 顾客外屏页面

新增主路由与组件：

```text
apps/web/src/app/customer-display/page.jsx
apps/web/src/app/customer-display/customer-display.css
apps/web/src/app/_components/customer-display-control.jsx
apps/web/src/app/admin/_components/lottery-view.jsx
```

备用抽奖码入口可继续使用：

```text
apps/web/src/app/lottery/page.jsx
```

### 5.1 外屏状态机

```text
idle（Logo/欢迎语）
   ↓ 显示账单
bill（菜品与金额）
   ↓ 付款完成
paid（成功提示）
   ├─ 无资格/不抽奖 → idle
   └─ 收银员开启 → lottery_ready
                         ↓ 顾客或收银员开始
                    lottery_spinning
                         ↓
                    lottery_result
                         ↓ visible_until 到期
                        idle
```

- 每次状态变化都由 API 生成新的单调递增 `revision`，外屏忽略旧 revision，防止乱序消息覆盖新状态。
- `bill`、`paid`、`lottery_ready` 和 `lottery_result` 都必须包含服务端 `visible_until`。
- 进入 `idle` 时必须从 React state、DOM 和浏览器存储中清除订单与兑奖数据。
- 页面刷新、重连或浏览器从休眠恢复时先调用状态接口；过期状态直接归零，不重新显示。

### 5.2 待机页

- 居中显示现有餐厅 Logo、餐厅中英文名称和可配置欢迎语。
- 可选显示当前时间和“请在此查看账单 / Your order will appear here”。
- 画面适合长期静态展示，避免高亮元素永久固定在同一像素；Logo 可做幅度很小的缓慢位移以降低烧屏风险。
- 离线时保留待机品牌内容，只在角落显示低干扰的“连接中”。
- 不轮播未经审核的远程网页、广告脚本或视频。

### 5.3 顾客账单

服务端只返回以下顾客安全字段：

- 订单号、堂食/外带、可选桌号。
- 菜品中英文显示名、规格/加料显示名、数量、单价和行总额。
- 小计、折扣、服务费、税额、总额、已付金额、待付金额和付款完成状态。

明确禁止发送或显示：

- 顾客姓名、电话、邮箱和地址。
- 订单内部备注、作废原因、员工备注和审计信息。
- 员工姓名、权限、Token、管理员授权信息。
- Dojo Payment Intent、授权码、银行卡后四位、支付密钥或完整付款记录。
- 成本、利润和后台统计数据。

账单较长时必须在固定标题和总额区域内滚动菜品列表；总额不得被滚出屏幕。金额使用订单货币和当前 locale 格式化。

### 5.4 抽奖视觉与交互

- 使用 SVG 或 Canvas 绘制比例真实的彩色轮盘，不引入重量过大的游戏引擎。
- 轮盘区块角度与 API 返回的概率区间一致；极小区块也必须被动画准确定位。
- 使用顶部指针、惯性旋转、减速回弹和适量纸屑效果。
- 适配 320px 手机、768px 平板和桌面屏幕。
- 支持中英文及项目现有 locale fallback。
- 遵守 `prefers-reduced-motion`；减少动画时直接使用短淡入结果。
- 键盘可操作，按钮有明确焦点，颜色不是区分结果的唯一方式。
- 页面刷新后再次提交已使用票，只显示原结果，不重新开奖。
- 请求失败、活动暂停或网络断开时不能播放“中奖”动画。
- 触摸模式的开始按钮必须足够大；非触摸模式不显示需要顾客点击的控件。
- 结果倒计时结束时自动淡出，不保留上一个顾客的兑奖码。

## 6. 数据库设计

新增迁移：

```text
db/migrations/022_customer_display_lottery.sql
```

迁移编号实施前需按当前最大编号顺延。`db/init.sql` 和 `apps/api/src/server.js` 的 `ensureSchema()` 兼容迁移必须同步更新。

### 6.1 顾客屏设置与运行状态

单店 M1 不建立屏幕注册表，也不保存设备身份。扩展现有 `settings`：

```sql
customer_display_enabled BOOLEAN NOT NULL DEFAULT true,
customer_display_interaction_mode TEXT NOT NULL DEFAULT 'customer_touch',
customer_display_show_bill_on_checkout BOOLEAN NOT NULL DEFAULT true,
customer_display_auto_show_lottery BOOLEAN NOT NULL DEFAULT false,
customer_display_payment_success_seconds INTEGER NOT NULL DEFAULT 5,
customer_display_lottery_result_seconds INTEGER NOT NULL DEFAULT 20,
customer_display_idle_content JSONB NOT NULL DEFAULT '{}'
```

- 当前显示状态保存在单一 Redis key，例如 `customer_display:state`，包含 `revision`、`mode`、`visible_until` 和最小化 payload。
- 在线连接数和最后心跳保存在 Redis/进程内，不作为设备注册数据持久化。
- Redis 重启或状态缺失时外屏安全回到 `idle`；订单和抽奖权威数据仍在 PostgreSQL。
- `interaction_mode`、时长和 JSONB 结构必须有服务端校验与数据库约束。

### 6.2 `lottery_campaigns`

建议字段：

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
internal_name TEXT NOT NULL,
title_i18n JSONB NOT NULL,
subtitle_i18n JSONB NOT NULL DEFAULT '{}',
button_i18n JSONB NOT NULL,
losing_message_i18n JSONB NOT NULL DEFAULT '{}',
rules_i18n JSONB NOT NULL DEFAULT '{}',
status TEXT NOT NULL DEFAULT 'draft',
starts_at TIMESTAMPTZ NOT NULL,
ends_at TIMESTAMPTZ NOT NULL,
minimum_order_total NUMERIC(10,2) NOT NULL DEFAULT 0,
service_types JSONB NOT NULL DEFAULT '["dine_in","takeaway"]',
excluded_payment_methods JSONB NOT NULL DEFAULT '["complimentary"]',
ticket_valid_minutes INTEGER NOT NULL DEFAULT 1440,
claim_valid_minutes INTEGER NOT NULL DEFAULT 1440,
theme JSONB NOT NULL DEFAULT '{}',
published_at TIMESTAMPTZ,
ended_at TIMESTAMPTZ,
created_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

状态、时间范围和数值字段必须增加 `CHECK` 约束。

### 6.3 `lottery_prizes`

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id),
kind TEXT NOT NULL,
name_i18n JSONB NOT NULL,
description_i18n JSONB NOT NULL DEFAULT '{}',
claim_instructions_i18n JSONB NOT NULL DEFAULT '{}',
weight_bps INTEGER NOT NULL,
stock_total INTEGER,
stock_awarded INTEGER NOT NULL DEFAULT 0,
position INTEGER NOT NULL,
background_color TEXT NOT NULL,
text_color TEXT NOT NULL,
enabled BOOLEAN NOT NULL DEFAULT true,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
UNIQUE (campaign_id, position)
```

`stock_awarded` 只能在开奖事务中原子增加，不接受管理端直接覆盖。

### 6.4 `lottery_tickets`

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id),
order_group_id UUID NOT NULL,
source_order_id UUID NOT NULL REFERENCES orders(id),
access_code_hash TEXT NOT NULL UNIQUE,
access_code_ciphertext TEXT NOT NULL,
access_code_iv TEXT NOT NULL,
access_code_tag TEXT NOT NULL,
access_code_suffix TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'issued',
expires_at TIMESTAMPTZ NOT NULL,
issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
used_at TIMESTAMPTZ,
revoked_at TIMESTAMPTZ,
UNIQUE (campaign_id, order_group_id)
```

- 抽奖码使用至少 60 bit 随机强度的无歧义字符集生成。
- 使用独立的 `LOTTERY_CODE_ENCRYPTION_KEY` 以 AES-256-GCM 加密完整码；哈希用于查询，密文只允许 API 在小票打印/重打路径解密。
- `LOTTERY_CODE_ENCRYPTION_KEY` 必须显式配置，不能回退使用 `DATABASE_URL`、默认字符串或代码内常量。
- 后台列表和普通查询只返回后四位；抽奖码丢失时，管理员也可以撤销未使用票并重新签发。

### 6.5 `lottery_draws`

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
ticket_id UUID NOT NULL UNIQUE REFERENCES lottery_tickets(id),
campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id),
prize_id UUID NOT NULL REFERENCES lottery_prizes(id),
idempotency_key TEXT NOT NULL,
prize_snapshot JSONB NOT NULL,
wheel_snapshot JSONB NOT NULL,
claim_code_hash TEXT,
claim_code_ciphertext TEXT,
claim_code_iv TEXT,
claim_code_tag TEXT,
claim_code_suffix TEXT,
claim_expires_at TIMESTAMPTZ,
redeemed_at TIMESTAMPTZ,
redeemed_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
UNIQUE (ticket_id, idempotency_key)
```

历史结果必须读取 `prize_snapshot`，不能因为管理员后来复制活动而改变。

## 7. API 契约

新增模块：

```text
apps/api/src/routes/customer-display.js
apps/api/src/routes/lottery.js
apps/api/src/services/customer-display.js
apps/api/src/services/lottery.js
```

### 7.1 顾客屏状态与控制接口

顾客屏只读/触摸接口：

```http
GET  /customer-display/state
POST /customer-display/lottery/draw
```

POS 与后台控制接口：

```http
GET  /customer-display/status
POST /customer-display/show-order
POST /customer-display/show-lottery
POST /customer-display/start-lottery
POST /customer-display/reset
POST /customer-display/test
```

要求：

- POS 只提交 `order_id` 和必要的幂等键，不能提交自行拼接的金额或菜品快照。
- API 必须重新读取订单并生成顾客安全账单，防止前端伪造总额或意外发送敏感字段。
- `show-lottery` 只能绑定该订单已签发且未使用的票；不能由前端传入任意奖项。
- `start-lottery` 仅用于 `cashier_controlled` 模式，并调用同一个服务端开奖函数。
- `reset` 必须立即增加 revision、清除 Redis payload 并向所有顾客屏页面发送 `idle`。
- 测试接口只能使用固定模拟账单和模拟轮盘，不得关联真实订单或生成真实抽奖结果。
- 触摸抽奖请求必须携带服务端在 `lottery_ready` 状态中生成的短时、单次 action token；该令牌只绑定票和 revision，不能指定奖项。

### 7.2 备用抽奖码公开接口

```http
GET  /lottery/public/active
POST /lottery/public/tickets/validate
POST /lottery/public/draw
GET  /lottery/public/results/:resultToken
```

- 公开活动接口只返回顾客渲染所需字段和轮盘快照，不返回库存、内部名称或后台统计。
- `validate` 接收抽奖码，只返回有效性、活动标题和到期时间，不返回订单金额或付款信息。
- `draw` 接收抽奖码和客户端生成的 `idempotencyKey`。
- `draw` 返回已落库的奖项、目标区块、动画角度范围、只读结果令牌和有效期。
- `resultToken` 必须短时、只读、不可猜测，结果查询不得暴露完整抽奖码。
- 验证和开奖按 IP 与抽奖码哈希双重限流；连续失败使用递增冷却时间。

### 7.3 抽奖后台接口

```http
GET    /lottery/campaigns
POST   /lottery/campaigns
GET    /lottery/campaigns/:id
PATCH  /lottery/campaigns/:id
DELETE /lottery/campaigns/:id
POST   /lottery/campaigns/:id/publish
POST   /lottery/campaigns/:id/pause
POST   /lottery/campaigns/:id/resume
POST   /lottery/campaigns/:id/end
POST   /lottery/campaigns/:id/clone
GET    /lottery/draws
POST   /lottery/draws/:id/redeem
POST   /lottery/tickets/:id/reissue
GET    /lottery/reports.csv
```

活动配置、状态、重发票和导出接口必须使用 `manage_lottery`；核销接口使用 `redeem_lottery`。所有写接口都必须写入 `audit_logs`。

## 8. 顾客屏专用实时通信

顾客账单不能通过现有普通前端 `emit()` 广播。新增只服务顾客屏页面的连接集合和发送函数，例如：

```text
customerDisplaySockets: Set<WebSocket>
emitToCustomerDisplay(event, data)
```

新增专用连接：

```text
GET /ws/customer-display
```

- 该连接不需要配对或员工登录，但只发送经过服务端白名单脱敏的单店顾客屏状态。
- 同一局域网内所有打开 `/customer-display` 的页面接收相同内容；M1 不区分设备。
- 普通 `/ws` 客户端绝不能收到 `customer_display.order` payload，避免普通 POS/Admin 连接无意消费账单流。
- 前端使用顾客屏专用 WebSocket 配置或当前主机的 API 端口自动发现，不复用网站订单 WebSocket，也不在页面中硬编码固定局域网 IP。
- 部署必须验证实际 WebSocket upgrade 路径；Next `/api-proxy` 的普通 HTTP 代理不能被视为已经支持 WebSocket。
- 局域网部署可使用独立的 `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=ws://POS_IP:4000/ws/customer-display`；该变量只供顾客屏使用，不修改网站订单的 `NEXT_PUBLIC_WS_URL`。
- 连接包含心跳、指数退避重连和 `last_seen_at` 更新；重连后用 `GET /customer-display/state` 补状态。

事件最小集合：

```text
customer_display.idle
customer_display.order
customer_display.paid
customer_display.lottery_ready
customer_display.lottery_spinning
customer_display.lottery_result
customer_display.disconnected
```

所有事件包含 `revision`、`mode`、`visible_until` 和该状态的最小 payload。外屏不得仅依赖事件流保存权威状态。

## 9. 服务端开奖算法

开奖必须在单个 PostgreSQL 事务中完成：

1. 使用抽奖码哈希查询票，并 `SELECT ... FOR UPDATE` 锁定。
2. 如果已存在 `lottery_draws`，直接返回原结果。
3. 验证票状态和到期时间；`paused` 暂时拒绝开奖，`ended` 仍允许结束前已签发且未过期的票开奖。
4. 锁定全部奖项行，按 `position` 生成固定 `0..9999` 概率区间。
5. 将库存耗尽奖项的区间映射到不限库存的 `no_prize` 兜底项，不重新分配给其他奖项。
6. 使用 Node.js `crypto.randomInt(0, 10000)`；禁止使用 `Math.random()`。
7. 找到覆盖随机整数的区块；有限库存奖项以带条件的原子更新增加 `stock_awarded`。
8. 如并发导致库存更新失败，保持同一随机区间并落到兜底项，不重新随机。
9. 写入 `lottery_draws`、奖项与轮盘快照，把票状态更新为 `used`。
10. 事务提交后才向前端返回结果。

任何一步失败都必须回滚；前端不得先播放结果再等待 API 确认。

## 10. 订单、付款、顾客屏与小票集成

- 打开付款弹窗或点击“显示账单”时调用 `show-order`；API 根据 `order_id` 生成脱敏快照并更新单店唯一的顾客屏状态。
- 菜品、折扣、服务费或部分付款变化后，向顾客屏专用连接发送新 revision。
- 收银员切换订单、取消付款、退出登录或点击清空时，必须按配置清除顾客屏，避免上一位顾客账单残留。
- 将签发抽奖票封装为独立服务，并由订单首次完成付款的事务调用。
- `recordPayment()` 的重复支付幂等返回不能重复签发票。
- 免单路径默认不签发；如以后允许，必须作为活动显式选项实现。
- 拆单按根订单聚合：全部非取消子单结清后，按合计金额签发一张票。
- 付款完成后响应包含顾客屏是否可进入抽奖；POS 再由人工按钮或后台自动设置触发 `show-lottery`。
- 顾客屏离线、显示失败或抽奖节目未开启，不能回滚、阻塞或重复执行已经成功的付款。
- 付款响应增加可选字段：

```json
{
  "lottery_ticket": {
    "id": "ticket-uuid",
    "code": "7KM4-P9TX-2QWF",
    "expires_at": "2026-08-25T20:00:00.000Z",
    "eligible": true,
    "fallback_url": "http://192.168.1.20:3000/lottery"
  }
}
```

- 顾客小票在存在未使用抽奖票时增加活动标题、访问地址、抽奖码和到期时间。
- M1 先打印文字地址和抽奖码；二维码是增强项，不阻塞基础上线。
- 厨房单不得打印抽奖信息。
- 重打小票不得生成新资格；完整码不可恢复时，提示管理员撤销并重新签发。

## 11. 权限与审计

新增权限：

```text
manage_lottery
redeem_lottery
control_customer_display
```

- Owner 默认拥有全部三个权限；Cashier 默认拥有 `redeem_lottery` 和 `control_customer_display`，可操作前台外屏和日常核销，但不能编辑概率、库存或活动状态。
- 后台条目对拥有任一权限的用户可见；活动配置区域按 `manage_lottery` 权限锁定。
- 无 `manage_lottery` 的用户可以通过现有管理员临时授权流程进入配置区域。
- `ADMIN_GRANT_SCOPES` 增加 `lottery: ["manage_lottery"]`。
- 修改外屏设置和发送测试节目需要 `manage_lottery`；显示当前账单、开启本单抽奖和清空屏幕需要 `control_customer_display`。
- 发布、暂停、恢复、结束、重发票、核销和 CSV 导出记录审计日志。
- 日志 metadata 只记录 ID、状态和码后四位，不保存完整码或随机秘密。

建议审计动作：

```text
lottery.campaign.create
lottery.campaign.update
lottery.campaign.publish
lottery.campaign.pause
lottery.campaign.end
lottery.ticket.issue
lottery.ticket.reissue
lottery.draw.complete
lottery.prize.redeem
customer_display.show_order
customer_display.show_lottery
customer_display.reset
```

## 12. 安全、隐私与公平性要求

- 开奖权威只在 API；浏览器修改 JavaScript、角度或动画不能改变数据库结果。
- 使用密码学安全随机数，并保存开奖时的奖项/区间快照供审计。
- 概率计算使用整数，不使用浮点累计。
- 开奖和库存扣减在同一事务中完成，防止最后一份奖品被并发超发。
- 所有公开输入做 schema 校验、长度限制、速率限制和统一错误响应。
- 抽奖码和兑奖码使用独立密钥进行 AES-256-GCM 加密；完整码不能写入审计或应用日志。
- 不在页面、本地存储、URL、日志或 WebSocket 中暴露顾客姓名、电话、支付详情或员工 Token。
- 账单快照必须在 API 使用字段白名单构造，不能把完整 `order` 对象发送给外屏后再靠 React 隐藏字段。
- 顾客账单只能发送到专用顾客屏连接集合；不得复用现有普通前端 WebSocket 广播。
- `/customer-display` 和其状态接口仅允许部署在餐厅受控局域网，不得直接暴露到公网；因为按用户要求不做设备配对，任何能访问该局域网页面的设备都能看到当前脱敏账单。
- 顾客屏缓存使用最短生命周期，状态到期或 reset 后必须删除 Redis payload 和浏览器内存中的账单/兑奖内容。
- 顾客端只使用一次性票；不能用订单号直接抽奖。
- 后台不能手动指定某一张票中奖；重发票只替换访问凭证，不改变已有结果。
- 页面清楚展示“每张有效小票仅限一次”和兑奖期限。

## 13. 建议实施顺序

### M0：规则、状态机与迁移

- 确认顾客屏、活动、奖项、票和开奖结果 schema。
- 添加迁移、`db/init.sql` 与 `ensureSchema()` 兼容逻辑。
- 添加数据库约束和索引。

### M1：顾客屏状态与专用实时通道

- 实现单店唯一 Redis 状态、无需登录的顾客屏读取页和专用 WebSocket。
- 实现 revision、visible_until、心跳、重连状态恢复和强制 reset。
- 证明外屏账单不会进入普通 `/ws` 广播。

### M2：账单快照与 POS 控制

- 实现服务端字段白名单账单快照。
- 在 POS 增加在线状态、显示账单、清空屏幕和前台显示控制。
- 验证菜品修改、折扣、服务费、部分付款、换单和付款完成状态。

### M3：抽奖服务端核心

- 实现活动 CRUD、发布校验、票签发和安全开奖服务。
- 完成库存并发控制、幂等和审计。
- 用单元测试固定概率区间、耗尽回退和状态机行为。

### M4：后台管理（本次已实现基础版本）

- 新增侧栏、权限、管理员提权和 `lottery-view.jsx`。
- 完成顾客屏设置、活动新建、概率总计校验、发布/暂停、记录和核销。

### M5：顾客外屏界面（本次已实现基础版本）

- 实现 `/customer-display` 的 Logo 待机、账单、付款成功、抽奖和结果状态。
- 完成响应式、账单白名单、动画、中英文和结果自动清屏。
- 保留 `/lottery` 抽奖码备用流程。

### M6：付款、抽奖触发与小票

- 在首次付清事务中签发票。
- 在支付完成 UI 增加顾客屏抽奖控制，并在顾客小票显示备用抽奖信息。
- 验证普通支付、部分支付、Dojo、拆单、免单和重复请求。

### M7：报表与硬化

- 完成活动统计、CSV、速率限制、错误日志脱敏和运行手册。
- Docker 重建后使用 POS 设备和独立顾客屏完成局域网真实流程验证。

## 14. 测试要求

### 14.1 单元测试

- 顾客账单字段白名单，不包含顾客资料、内部备注、员工或支付机密。
- 顾客屏状态 revision、过期判断、自动回 idle 和旧事件丢弃。
- 概率总和、边界值 `0` 和 `9999`、区块定位。
- 库存耗尽时区间转移给兜底项，其他奖项概率不增加。
- `crypto.randomInt` 可注入测试实现，生产代码不得回退到 `Math.random()`。
- 活动状态机、时间边界、票码与兑奖码哈希脱敏、中英文 fallback。

### 14.2 API 集成测试

- 顾客屏无需登录即可读取唯一当前状态，但响应只能包含白名单脱敏字段。
- 多个顾客屏页面看到同一 revision 和状态，不产生彼此独立的订单副本。
- 普通 `/ws` 客户端收不到顾客账单，顾客屏专用连接只收到脱敏后的 display 事件。
- `show-order` 忽略客户端伪造金额，返回 API 从数据库生成的快照。
- 切换订单或 reset 后旧订单 payload 被清除，过期状态在重连后不会恢复。
- 创建草稿、保存、编辑、复制和发布。
- 概率不等于 100%、缺少兜底项、时间重叠时拒绝发布。
- 无权限用户不能修改活动或核销。
- 首次付清只产生一张票；部分付款不签发，最后结清时签发。
- 同一票并发提交两次只产生一个结果。
- 有限库存并发开奖不超发。
- 已使用票重复请求返回同一结果。
- 过期、撤销和暂停状态正确拒绝开奖；已结束活动不发新票，但结束前签发的有效票仍可开奖。
- 核销幂等，过期奖品不可核销。
- 公开接口不返回订单、用户和库存敏感字段。
- 顾客屏离线时，订单付款、打印和抽奖票签发仍能独立成功。

### 14.3 前端与浏览器测试

- 320px、390px、768px、1440px 无横向溢出。
- 待机页显示 Logo；打开收款后显示正确账单和固定总额区域。
- 部分付款实时更新已付/待付，付清后显示成功状态。
- 收银员开启抽奖后外屏切换轮盘，完成旋转、结果和自动回 Logo。
- 顾客触摸与收银员控制两种模式都可完成流程。
- 结果过期、POS 换单、员工退出和手动清空后不残留上一位顾客内容。
- WebSocket 断线重连后按服务端状态恢复，已过期内容不闪现。
- `prefers-reduced-motion` 下不执行长旋转。
- API 失败时不显示伪中奖结果。
- 后台概率合计、发布错误、锁定状态和管理员提权可见且可操作。

### 14.4 回归验证

```bash
npm test
npm run lint
git diff --check
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:3000/customer-display
curl -fsS http://127.0.0.1:3000/lottery
```

集成测试必须显式设置 `API_BASE=http://127.0.0.1:4000`，不能把静默跳过当成通过。

## 15. 完成定义（Definition of Done）

- 顾客屏可在局域网固定地址 `:3000/customer-display` 无需配对或登录长期运行。
- 空闲时稳定显示现有 Logo、餐厅名称和欢迎语。
- 收银员进入结账或点击显示账单后，外屏只显示该顾客的脱敏账单并实时更新金额。
- 付款完成后，收银员可以从 POS 开启抽奖节目；触摸屏和非触摸屏模式均可用。
- 抽奖结果在配置时间后自动消失并回到 Logo，刷新或重连不会重新泄露旧账单。
- 管理员可在 POS 后台新建并保存草稿，配置中英文内容、概率、库存和资格规则。
- 发布前校验完整，且同一时间不会出现两个有效活动。
- 抽奖由服务端安全、原子、幂等地决定，前端只能展示结果。
- 每个订单组在一个活动中最多获得一次资格。
- 库存并发测试证明不会超发，耗尽奖项不会提高其他奖项概率。
- 结果可核销、不可重复核销，并有完整审计记录。
- 抽奖不会修改既有支付、销售、退款和会计口径。
- 小票或支付完成页面能提供访问地址、抽奖码和有效期。
- 中文与英文、手机与平板、普通动画与减少动态效果均可用。
- 所有顾客屏页面只看到同一份脱敏状态，普通 WebSocket 不能收到顾客账单 payload。
- 顾客屏离线或异常不会阻塞 POS 点餐、收款、打印或会计记录。
- 单元测试、集成测试、Lint、Docker 健康检查和局域网实测全部通过。

## 16. M1 明确不做

- 不接会员账户、手机号或营销短信。
- 不让 AI 决定中奖、兑奖或概率。
- 不根据中奖结果自动退款或修改已付款订单。
- 不自动向订单添加免费菜品；M1 由员工核销后人工发放。
- 不做跨门店共享活动或公网暴露。
- 不支持上传任意脚本、HTML 或远程音频作为活动素材。
- 不在 M1 做广告素材管理、远程视频轮播或云端屏幕管理平台。

## 17. 预计涉及的关键文件

```text
apps/api/src/server.js
apps/api/src/routes/customer-display.js
apps/api/src/routes/lottery.js
apps/api/src/routes/orders.js
apps/api/src/services/customer-display.js
apps/api/src/services/lottery.js
apps/api/src/services/role-permissions.js
apps/web/src/app/page.jsx
apps/web/src/app/_components/customer-display-control.jsx
apps/web/src/app/customer-display/page.jsx
apps/web/src/app/customer-display/customer-display.css
apps/web/src/app/lottery/page.jsx
apps/web/src/app/lottery/lottery.css
apps/web/src/lib/api.js
apps/web/src/app/admin/page.jsx
apps/web/src/app/admin/_components/lottery-view.jsx
apps/printer-service/src/worker.js
db/init.sql
db/migrations/022_customer_display_lottery.sql
docker-compose.yml
tests/lottery.unit.test.mjs
tests/api.integration.test.mjs
CHANGELOG_zh.md
CHANGELOG.md
README_zh.md
README.md
PROJECT_STATUS.md
```

迁移编号、最终文件拆分和测试文件名以实施时仓库现状为准。
