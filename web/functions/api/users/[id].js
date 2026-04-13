import {
  USERS_KEY,
  ensureUsers,
  hasWhitespace,
  json,
  normalizePermissions,
  normalizeUsername,
  putJson,
  requireUser,
  sanitizeUser,
  sha256,
} from "../_utils";

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
  const nextIsAdmin = current.username === "admin"
    ? true
    : Object.prototype.hasOwnProperty.call(payload || {}, "is_admin")
      ? Boolean(payload?.is_admin)
      : current.is_admin;
  const next = {
    ...current,
    full_name: String(payload?.full_name ?? current.full_name).trim() || current.full_name,
    is_admin: nextIsAdmin,
    permissions: Array.isArray(payload?.permissions)
      ? normalizePermissions(payload.permissions, nextIsAdmin)
      : normalizePermissions(current.permissions, nextIsAdmin),
  };

  if (String(payload?.username ?? "").trim()) {
    const username = normalizeUsername(payload.username);
    if (hasWhitespace(username)) return json({ error: "Username cannot contain spaces" }, { status: 400 });
    const duplicate = users.some(
      (entry) => entry.id !== context.params.id && String(entry.username).trim().toLowerCase() === username,
    );
    if (duplicate) return json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
    next.username = username;
  }

  if (String(payload?.password ?? "").trim()) {
    next.password_hash = await sha256(String(payload.password));
  }

  if (current.username === "admin") {
    next.username = "admin";
    next.is_admin = true;
    next.permissions = ["*"];
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
