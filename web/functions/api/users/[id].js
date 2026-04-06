import { ensureUsers, json, putJson, requireUser, sanitizeUser, sha256, USERS_KEY } from "../_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const users = await ensureUsers(context.env);
  const user = users.find((entry) => entry.id === context.params.id);
  if (!user) return json({ error: "المستخدم غير موجود" }, { status: 404 });
  return json({ user: sanitizeUser(user) });
}

export async function onRequestPatch(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const users = await ensureUsers(context.env);
  const index = users.findIndex((entry) => entry.id === context.params.id);
  if (index === -1) return json({ error: "المستخدم غير موجود" }, { status: 404 });

  const payload = await context.request.json();
  const current = users[index];
  const next = {
    ...current,
    full_name: String(payload?.full_name ?? current.full_name).trim() || current.full_name,
    is_admin: Boolean(payload?.is_admin),
    permissions: Array.isArray(payload?.permissions)
      ? [...new Set(payload.permissions.filter(Boolean))]
      : current.permissions,
  };

  if (String(payload?.username ?? "").trim()) {
    const username = String(payload.username).trim().toLowerCase();
    const duplicate = users.some(
      (entry) => entry.id !== context.params.id && String(entry.username).trim().toLowerCase() === username,
    );
    if (duplicate) return json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
    next.username = username;
  }

  if (String(payload?.password ?? "").trim()) {
    next.password_hash = await sha256(String(payload.password));
  }

  users[index] = next;
  await putJson(context.env, USERS_KEY, users);
  return json({ ok: true, user: sanitizeUser(next) });
}

export async function onRequestDelete(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const users = await ensureUsers(context.env);
  const user = users.find((entry) => entry.id === context.params.id);
  if (!user) return json({ error: "المستخدم غير موجود" }, { status: 404 });
  if (user.username === "admin") {
    return json({ error: "لا يمكن حذف المستخدم الافتراضي" }, { status: 400 });
  }

  const next = users.filter((entry) => entry.id !== context.params.id);
  await putJson(context.env, USERS_KEY, next);
  return json({ ok: true });
}
