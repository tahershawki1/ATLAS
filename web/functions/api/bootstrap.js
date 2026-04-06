import { ensureUsers, json } from "./_utils";

export async function onRequestGet(context) {
  await ensureUsers(context.env);
  return json({
    ok: true,
    mode: "cloudflare",
    bindings: {
      data: Boolean(context.env.ATLAS_DATA),
      sessions: Boolean(context.env.ATLAS_SESSIONS),
      pages_bucket: Boolean(context.env.ATLAS_PAGES_BUCKET),
    },
  });
}
