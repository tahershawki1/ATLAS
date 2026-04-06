import { json, requireUser, sanitizeUser } from "./_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return json({ user: null }, { status: 200 });
  return json({ user: sanitizeUser(auth.user) });
}
