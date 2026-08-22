# QYPOS M1：接收网站在线订单（暂不做菜品映射）

状态：QYPOS 接收端已实现；QYLTPWeb 网站端接口按本文件契约待在网站仓库部署

目标：让本地 QYPOS 能够稳定、低负载地获取 Granny Noodles 网站已付款订单及完整订单内容，并保存到 QYPOS 的“在线订单收件箱”。本阶段不把网站菜品转换成 QYPOS 菜品，不创建正式厨房订单，不打印，不处理退款。

## 1. 本阶段范围

### 必须实现

- QYPOS Connector 主动连接网站的 SSE 通道。
- 网站在 Dojo 支付状态为 `Captured` 后推送一个轻量 `order.available` 事件。
- QYPOS 收到事件后，按 `orderId` 请求完整订单内容。
- 将完整原始订单和订单行保存到 QYPOS 本地 PostgreSQL。
- 使用网站订单 UUID 去重，重复事件不能产生重复收件箱记录。
- Connector 断线自动重连，并用游标补回断线期间的订单。
- QYPOS 管理端可以查询已接收订单和原始订单内容，方便后续做菜品映射。

### 明确不做

- 不调用 AI，不用模型判断订单、付款或菜品。
- 不按名称猜测菜品映射。
- 不创建 QYPOS `orders` 正式订单。
- 不写入 QYPOS `order_items`、`payments` 或 `print_jobs`。
- 不自动打印厨房单。
- 不处理退款和顾客状态回传。
- 不让网站调用需要员工登录的 `/orders` 接口。

## 2. 推荐连接方式

QYPOS 在餐厅本地运行，向服务器发起一条长期 HTTPS 连接：

```text
QYPOS Connector ───── SSE/HTTPS 长连接 ─────> QYLTPWeb 服务器
       │                                      │
       └─ 收到 orderId 后再 GET 订单详情 <─────┘
```

没有新订单时不查询数据库。只发送心跳，建议 20–30 秒一次。连接断开后自动重连，并带上上次成功处理的 `cursor`。

## 3. 网站必须提供的接口

### 3.1 事件流

```http
GET /api/pos/events?cursor=123
Authorization: Bearer <POS_SYNC_SECRET>
Accept: text/event-stream
```

事件示例：

```text
id: 124
event: order.available
data: {"orderId":"网站订单UUID","reference":"GN-260822-AB12CD34"}
```

事件只发送订单 ID 和订单号，不把完整顾客信息放进 SSE 消息。

### 3.2 获取完整订单

```http
GET /api/pos/orders/{orderId}
Authorization: Bearer <POS_SYNC_SECRET>
```

响应至少包含：

```json
{
  "externalOrderId": "网站订单UUID",
  "reference": "GN-260822-AB12CD34",
  "paymentStatus": "Captured",
  "paymentIntentId": "pi_live_xxx",
  "currency": "GBP",
  "totalMinor": 1480,
  "customer": {
    "name": "Customer",
    "phone": "+447000000000",
    "email": "customer@example.com",
    "note": ""
  },
  "items": [
    {
      "sourceItemId": "website-item-id",
      "nameEn": "Vegan Cold Xiao Mian",
      "nameZh": "素小面",
      "optionLabelEn": null,
      "optionLabelZh": null,
      "quantity": 1,
      "unitPriceMinor": 1080,
      "lineTotalMinor": 1080
    }
  ],
  "createdAt": "2026-08-22T12:00:00.000Z"
}
```

本阶段保存 `sourceItemId`、名称和价格快照，但不要求它已经对应到 QYPOS `menu_items.id`。

### 3.3 接收确认

```http
POST /api/pos/orders/{orderId}/ack
Authorization: Bearer <POS_SYNC_SECRET>
Content-Type: application/json

{"connectorId":"restaurant-pos-1","cursor":124}
```

ACK 只表示“QYPOS 已经完整保存到本地收件箱”，不表示已经创建厨房订单。

## 4. QYPOS 需要实现的模块

建议新增一个独立的轻量服务，而不是把循环逻辑塞进收银 API 请求：

```text
apps/online-order-connector/
```

它负责：

1. 打开 SSE 连接。
2. 读取 `Last-Event-ID` 或 `cursor`。
3. 收到 `order.available` 后请求订单详情。
4. 调用 QYPOS 本地导入服务保存收件箱记录。
5. 保存成功后调用网站 ACK。
6. 失败时重试并保留错误，不丢事件。

如果第一版不想增加 Docker 服务，也可以先放在 `apps/api/src/services/online-order-connector.js`，但必须独立 worker 化，不能阻塞 Fastify 请求。

## 5. QYPOS 数据表建议

### 5.1 在线订单收件箱

```sql
CREATE TABLE online_order_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id TEXT NOT NULL UNIQUE,
  external_reference TEXT NOT NULL,
  payment_intent_id TEXT,
  payment_status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  customer_payload JSONB NOT NULL DEFAULT '{}',
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`external_order_id` 是第一道幂等保护。收到相同订单时使用 `UPSERT`，不能插入第二行。

### 5.2 在线订单内容

```sql
CREATE TABLE online_order_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_order_id UUID NOT NULL REFERENCES online_order_inbox(id) ON DELETE CASCADE,
  source_item_id TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  option_label_en TEXT,
  option_label_zh TEXT,
  quantity INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  line_total_minor INTEGER NOT NULL
);
```

这张表保存网站发送的内容快照，后续菜品映射时再增加 `qypos_menu_item_id`，不要在 M1 猜测映射。

### 5.3 同步游标

可以放在 `settings`，或单独建立：

```sql
CREATE TABLE online_order_sync_state (
  connector_id TEXT PRIMARY KEY,
  last_cursor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. 安全要求

QYPOS Connector 使用专用密钥，不使用收银员登录 Token：

```text
ONLINE_ORDER_BASE_URL=https://grannynoodles.co.uk
ONLINE_ORDER_SYNC_SECRET=replace_with_long_random_secret
ONLINE_ORDER_CONNECTOR_ID=restaurant-pos-1
ONLINE_ORDER_CURSOR=0
ONLINE_ORDER_OPEN_TIME=11:00
ONLINE_ORDER_CLOSE_TIME=22:05
ONLINE_ORDER_TIME_ZONE=Europe/London
```

要求：

- 只允许 HTTPS。
- 密钥只放在 QYPOS 的环境变量或 Docker Secret。
- 请求带时间戳和 HMAC，拒绝过期请求和重放请求。
- 网站接口不公开订单详情。
- 日志中不能打印顾客邮箱、电话、支付密钥或完整订单 payload。

## 7. M1 流程伪代码

```text
connectSse(cursor)

when order.available(orderId, eventCursor):
    if inbox.exists(external_order_id = orderId):
        saveCursor(eventCursor)
        ack(orderId, eventCursor)
        return

    payload = GET /api/pos/orders/{orderId}
    validate payload.paymentStatus == Captured
    transaction:
        upsert online_order_inbox
        replace online_order_inbox_items
        save raw_payload
        save status = received
        save cursor
    ack(orderId, eventCursor)
```

如果获取详情或数据库事务失败，不发送 ACK，等待重试。

## 8. 管理端最低功能

M1 只需要一个只读页面或接口：

- 订单号
- 网站订单 UUID
- 接收时间
- 付款状态
- 总额
- 顾客姓名、电话、邮箱
- 备注
- 原始订单内容
- 每一行的 `sourceItemId`、中英文名称、选项、数量、价格
- 同步状态和最后错误

暂时不要显示“已打印”或“已进入厨房”，因为 M1 还没有创建 QYPOS 正式订单。

## 9. 测试验收标准

- Sandbox 中完成一笔网站付款后，QYPOS 收件箱出现一条记录。
- 订单内容、顾客联系方式、备注、选项和价格快照完整保存。
- 同一事件重复发送，收件箱仍只有一条订单。
- Connector 断线后重新连接，断线期间的订单可以补回。
- 未 `Captured` 的订单不会进入收件箱。
- 关闭网站连接时，QYPOS 不会每秒查询数据库。
- M1 不创建 `orders`、`order_items`、`payments` 或 `print_jobs`。

## 10. 后续 M2：菜品映射

M2 再增加：

- `sourceItemId -> menu_items.id` 映射界面。
- 映射缺失时阻止转正式订单，不自动猜测。
- 根据收件箱内容创建 QYPOS `takeaway` 订单。
- 写入 `dojo_online` 付款记录。
- 设置已付款状态。
- 创建一次厨房打印任务。

## 11. 本地验证命令

按照 QYPOS 项目约定，M1 实现后至少运行：

```bash
npm test
npm run lint
docker compose up --build -d
docker compose ps
curl -I http://127.0.0.1:4000/health
```

## 12. QYPOS 本次实现落点

- `db/migrations/021_online_order_inbox.sql`、`db/init.sql` 和 API 启动兼容迁移创建收件箱、订单行快照和 Connector 游标表。
- `apps/api/src/services/online-order-inbox.js` 对 `Captured` 订单做结构校验，并在同一事务内按 `external_order_id` UPSERT、替换订单行、保存原始 JSON 和游标。
- `apps/api/src/routes/online-orders.js` 提供 `manage_ops` 只读管理接口，以及带时间戳 HMAC、防重放的内部导入/游标接口。
- `apps/online-order-connector/` 是独立 Docker worker：SSE 长连接、`Last-Event-ID`/cursor、断线指数退避、详情拉取、本地导入和 ACK。
- 后台新增“在线收件箱”只读页面，显示顾客字段、订单行快照和原始 JSON；不会触碰正式订单、付款或打印表。
- Connector 未配置 `ONLINE_ORDER_BASE_URL` 或密钥时保持禁用，不会发起轮询；配置后远端 URL 默认强制 HTTPS，开发测试可显式设置 `ONLINE_ORDER_ALLOW_INSECURE=true`。
- Connector 默认只在 `Europe/London` 的 `11:00`（含）至 `22:05`（不含）营业时段建立 SSE 连接；非营业时间不轮询、不重连，营业时间结束时会主动中断当前连接。可通过 `ONLINE_ORDER_OPEN_TIME`、`ONLINE_ORDER_CLOSE_TIME`、`ONLINE_ORDER_TIME_ZONE` 配置。

在真实部署前，必须使用 Sandbox 订单完成一次“接收、保存、重复事件、断线恢复”测试。
