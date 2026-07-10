// 运行时反向代理：读取 API_INTERNAL_URL 环境变量（不受构建时限制）
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL || "http://localhost:4000";

async function proxyRequest(request, { params }) {
  const { path } = params;
  const pathname = path.join("/");
  const { search } = new URL(request.url);
  const target = `${API_INTERNAL_URL}/${pathname}${search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  }
  // Forward the real client IP so rate-limiting works per-user.
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
  headers.set("x-real-ip", clientIp);

  const hasBody = !["GET", "HEAD"].includes(request.method);

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
export const HEAD = proxyRequest;
export const OPTIONS = proxyRequest;
