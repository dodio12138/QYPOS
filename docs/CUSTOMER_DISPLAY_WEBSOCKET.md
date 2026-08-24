# Customer Display WebSocket Configuration

## Separate realtime channels

QYPOS uses two independent WebSocket channels:

| Purpose | Environment variable | Server path |
| --- | --- | --- |
| Existing POS and website-order events | `NEXT_PUBLIC_WS_URL` | `/ws` |
| Customer bill, screen mode, and lottery state | `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL` | `/ws/customer-display` |

Do not change `NEXT_PUBLIC_WS_URL` when configuring the customer display. The customer display only uses `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL` and `NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT`.

One-second HTTP polling remains active as a fallback, so the screen still updates if WebSocket upgrades are temporarily unavailable.

## Recommended LAN setup

For a POS host at `192.168.1.20`:

```text
POS: http://192.168.1.20:3000
Customer display: http://192.168.1.20:3000/customer-display
Customer WebSocket: ws://192.168.1.20:4000/ws/customer-display
```

Recommended `.env` values:

```dotenv
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT=4000
```

The display automatically uses the hostname in its browser URL and connects to port `4000`. Do not use `localhost` or `127.0.0.1` on the tablet, because those addresses refer to the tablet itself. Allow trusted LAN devices to reach TCP ports `3000` and `4000` on the POS host.

For a custom public API port, either set only the port:

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT=4400
```

or set an explicit endpoint:

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=ws://192.168.1.20:4400/ws/customer-display
```

## HTTPS and reverse proxies

An HTTPS page must use WSS:

```dotenv
NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL=wss://pos.example.com/ws/customer-display
```

The reverse proxy must forward `/ws/customer-display` to Fastify on port `4000` with WebSocket upgrade headers. Example Nginx configuration:

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

Use `http://api:4000` instead when Nginx shares the Compose network. Public deployments should use HTTPS/WSS and restrict access; the unpaired display endpoint is designed for a trusted store LAN.

## Rebuild after configuration changes

`NEXT_PUBLIC_*` values are compiled into the Next.js browser bundle. A restart alone is not enough:

```bash
docker compose up --build -d web
docker compose ps api web
```

Reload `http://<POS_LAN_IP>:3000/customer-display` on the tablet.

## Verification and troubleshooting

Run `docker compose logs --tail=100 api` after opening the display. A live connection logs `Customer display connected` with the current connection count. Switching between welcome, bill, and lottery modes in the POS should update the display immediately.

- About one second of delay usually means WebSocket is blocked and HTTP polling is providing fallback updates.
- Never use `localhost` in the tablet URL; use the POS host's LAN IP.
- An HTTPS display cannot connect to `ws://`; configure WSS and proxy upgrade headers.
- If `.env` changes appear ignored, rebuild the Web image.
- If website-order realtime behavior changes, confirm that `NEXT_PUBLIC_WS_URL` was not modified for the customer display.
