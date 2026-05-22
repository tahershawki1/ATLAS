import {
  USERS_KEY,
  ensureUsers,
  hashPassword,
  json,
  passwordHashNeedsUpgrade,
  putJson,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
} from "./_utils";

export async function onRequestPost(context) {
  const body = await context.request.json();
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  let users = [];
  try {
    users = await ensureUsers(context.env);
  } catch (error) {
    return json(
      { error: error?.message || "Atlas setup is incomplete" },
      { status: 503 },
    );
  }

  let user = null;
  for (const entry of users) {
    if (String(entry.username ?? "").trim().toLowerCase() !== username) continue;
    if (await verifyPassword(password, entry.password_hash)) {
      user = entry;
      break;
    }
  }

  if (!user) {
    return json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (passwordHashNeedsUpgrade(user.password_hash)) {
    user.password_hash = await hashPassword(password);
    await putJson(context.env, USERS_KEY, users);
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
