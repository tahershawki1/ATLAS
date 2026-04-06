import { ensureUsers, json, putJson, requireUser, sanitizeUser, sha256, USERS_KEY } from "./_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const users = await ensureUsers(context.env);
  return json({ users: users.map(sanitizeUser) });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const payload = await context.request.json();
  const users = await ensureUsers(context.env);
  const username = String(payload?.username ?? "").trim().toLowerCase();

  if (!username) return json({ error: "اسم المستخدم مطلوب" }, { status: 400 });
  if (users.some((entry) => String(entry.username).trim().toLowerCase() === username)) {
    return json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
  }

  const user = {
    id: `user-${Date.now()}`,
    username,
    full_name: String(payload?.full_name ?? "").trim() || username,
    password_hash: await sha256(String(payload?.password ?? "123456")),
    is_admin: Boolean(payload?.is_admin),
    permissions: Array.isArray(payload?.permissions) ? [...new Set(payload.permissions)] : [],
    created_at: new Date().toISOString(),
  };

  users.push(user);
  await putJson(context.env, USERS_KEY, users);
  return json({ ok: true, user: sanitizeUser(user) }, { status: 201 });
}
