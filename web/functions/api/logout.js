import { clearSessionCookie, json, getSession } from "./_utils";

export async function onRequestPost(context) {
  const auth = await getSession(context.env, context.request);
  if (auth?.token) {
    await context.env.ATLAS_SESSIONS.delete(auth.token);
  }

  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearSessionCookie(),
      },
    },
  );
}
