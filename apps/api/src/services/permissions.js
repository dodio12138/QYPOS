export function normalizePermissions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function userFromToken(request, redis) {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : request.query?.token ?? null;
  if (!token) return null;
  const payload = await redis.get(`session:${token}`);
  if (!payload) return null;
  const user = JSON.parse(payload);
  user.permissions = normalizePermissions(user.permissions);
  return user;
}

export async function requirePermission(request, reply, redis, permission) {
  const user = await userFromToken(request, redis);
  if (!user) {
    reply.code(401);
    return null;
  }
  if (permission && !user.permissions.includes(permission)) {
    reply.code(403);
    return null;
  }
  return user;
}
