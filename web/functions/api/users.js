import {
  USERS_KEY,
  buildUserId,
  ensureUsers,
  hasWhitespace,
  json,
  normalizePermissions,
  normalizeUsername,
  putJson,
  requireUser,
  sanitizeUser,
  sha256,
} from "./_utils";

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
  const username = normalizeUsername(payload?.username);
  const password = String(payload?.password ?? "").trim();
  if (hasWhitespace(username)) return json({ error: "Username cannot contain spaces" }, { status: 400 });
  if (!password) return json({ error: "Password is required" }, { status: 400 });

  if (!username) return json({ error: "اسم المستخدم مطلوب" }, { status: 400 });
  if (users.some((entry) => String(entry.username).trim().toLowerCase() === username)) {
    return json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
  }

  const user = {
    id: buildUserId(),
    username,
    full_name: String(payload?.full_name ?? "").trim() || username,
    password_hash: await sha256(password),
    is_admin: Boolean(payload?.is_admin),
    permissions: normalizePermissions(payload?.permissions, payload?.is_admin),
    created_at: new Date().toISOString(),
  };

  users.push(user);
  await putJson(context.env, USERS_KEY, users);
  return json({ ok: true, user: sanitizeUser(user) }, { status: 201 });
}
