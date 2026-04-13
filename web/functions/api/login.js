import { ensureUsers, json, sanitizeUser, setSessionCookie, sha256 } from "./_utils";

export async function onRequestPost(context) {
  const body = await context.request.json();
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const users = await ensureUsers(context.env);
  const passwordHash = await sha256(password);
  const user = users.find(
    (entry) => String(entry.username ?? "").trim().toLowerCase() === username && entry.password_hash === passwordHash,
  );

  if (!user) {
    return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await context.env.ATLAS_SESSIONS.put(
    token,
    JSON.stringify({
      user_id: user.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    }),
    {
      expirationTtl: 7 * 24 * 60 * 60,
    },
  );

  return json(
    {
      ok: true,
      user: sanitizeUser(user),
    },
    {
      headers: {
        "set-cookie": setSessionCookie(token, context.request),
      },
    },
  );
}
