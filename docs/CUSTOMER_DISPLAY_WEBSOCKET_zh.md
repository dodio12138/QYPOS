# 顾客屏 WebSocket 配置指南

## 1. 两套 WebSocket 必须分开

QYPOS 现在有两条互不影响的实时通道：

| 用途 | 环境变量 | 服务端路径 |
| --- | --- | --- |
| POS / 网站订单等现有实时事件 | `NEXT_PUBLIC_WS_URL` | `/ws` |
| 顾客屏账单、节目和抽奖状态 | `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL` | `/ws/customer-display` |

不要为了配置顾客屏修改 `NEXT_PUBLIC_WS_URL`。顾客屏只使用自己的 `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL` 和 `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT`。

顾客屏即使暂时无法建立 WebSocket，也会每秒通过 HTTP 读取一次状态，所以不会完全停止更新；WebSocket 正常时切屏和金额变化会更及时。

## 2. 推荐配置：同一局域网直接访问

假设运行 QYPOS 的主机局域网地址是 `192.168.1.20`：

```text
POS 前台：http://192.168.1.20:3000
顾客屏：http://192.168.1.20:3000/customer-display
顾客屏 WebSocket：ws://192.168.1.20:4000/ws/customer-display
```

`.env` 推荐保持：

```dotenv
# 保留现有 NEXT_PUBLIC_WS_URL；不要为顾客屏修改它
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT=4000
```

顾客屏页面会自动读取浏览器当前访问的主机名，并连接同一主机的 `4000` 端口。平板不需要配对，也不要在平板地址中使用 `localhost` 或 `127.0.0.1`，因为它们表示平板自身。

局域网设备必须能够访问 POS 主机的：

- TCP `3000`：顾客屏网页和 HTTP 轮询。
- TCP `4000`：顾客屏专用 WebSocket 和 API。

如果系统防火墙询问是否允许 Docker 接收入站连接，应允许受信任的本地网络访问。

## 3. API 使用自定义端口

如果主机把 API 映射到其他端口，例如 `4400`，可配置：

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT=4400
```

页面会连接：

```text
ws://<当前浏览器主机>:4400/ws/customer-display
```

也可以显式指定完整地址：

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=ws://192.168.1.20:4400/ws/customer-display
```

## 4. HTTPS、域名或反向代理

如果顾客屏使用 `https://` 打开，浏览器会阻止不安全的 `ws://` 混合内容。此时必须提供 TLS WebSocket：

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=wss://pos.example.com/ws/customer-display
```

反向代理必须把 `/ws/customer-display` 转发到 Fastify API `4000` 端口，并保留 WebSocket Upgrade。Nginx 示例：

```nginx
location = /ws/customer-display {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}
```

如果 Nginx 与 API 位于同一个 Docker 网络，可把 `proxy_pass` 改为 `http://api:4000`。公开互联网部署时应使用 HTTPS/WSS，并限制顾客屏入口的网络访问；顾客屏通道按门店受信任局域网、无需设备配对的场景设计。

## 5. 修改配置后必须重建

`NEXT_PUBLIC_*` 变量会在 Next.js 构建时写入浏览器代码。修改 `.env` 后，仅执行 `docker compose restart` 不会更新地址，必须重建 Web 镜像：

```bash
docker compose up --build -d web
docker compose ps api web
```

然后在顾客平板上重新加载：

```text
http://<POS主机局域网IP>:3000/customer-display
```

## 6. 验证实时连接

1. 确认 `api` 和 `web` 均为 `healthy`：

   ```bash
   docker compose ps api web
   ```

2. 打开顾客屏后检查 API 日志：

   ```bash
   docker compose logs --tail=100 api
   ```

   正常连接会出现 `Customer display connected`，并带有当前顾客屏连接数。

3. 在 POS 前台选择订单，点击显示账单、欢迎界面或抽奖节目。顾客屏应立即切换，不需要刷新。
4. 修改同一订单的折扣或服务费，顾客屏金额应自动更新。

## 7. 常见问题

### 页面能打开，但切换有约一秒延迟

通常表示 WebSocket 未连通，页面正在使用一秒 HTTP 轮询兜底。检查主机 `4000` 端口、防火墙和显式 WebSocket 地址。

### 平板使用 `localhost` 后打不开

`localhost` 指向平板本身。应使用运行 QYPOS 的电脑局域网 IP，例如 `192.168.1.20`。

### HTTPS 页面没有实时连接

不能从 `https://` 页面连接 `ws://`。配置 `wss://` 地址，并确认反向代理发送 `Upgrade` 和 `Connection: upgrade` 请求头。

### 修改 `.env` 后地址没有变化

顾客屏变量是构建期变量。重新执行 `docker compose up --build -d web`，然后刷新平板页面。

### 网站订单 WebSocket 出现问题

检查是否误改了 `NEXT_PUBLIC_WS_URL`。顾客屏配置不需要、也不应该更改该变量。
