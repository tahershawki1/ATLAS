import { ensureUsers, json } from "./_utils";

export async function onRequestGet(context) {
  const bindings = {
    data: Boolean(context.env.ATLAS_DATA),
    sessions: Boolean(context.env.ATLAS_SESSIONS),
    pages_bucket: Boolean(context.env.ATLAS_PAGES_BUCKET),
  };

  let setupRequired = false;
  let setupMessage = "";
  if (bindings.data) {
    try {
      await ensureUsers(context.env);
    } catch (error) {
      setupRequired = true;
      setupMessage = error?.message || "Atlas setup is incomplete";
    }
  }

  return json({
    ok: !setupRequired,
    mode: "cloudflare",
    bindings,
    setup_required: setupRequired,
    setup_message: setupMessage,
  });
}
