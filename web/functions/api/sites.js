import { CUSTOM_SITES_KEY, getJson, json, putJson, requireUser } from "./_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const customSites = await getJson(context.env, CUSTOM_SITES_KEY, []);
  return json({ custom_sites: customSites });
}

export async function onRequestPut(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;

  const payload = await context.request.json();
  const customSites = Array.isArray(payload?.custom_sites) ? payload.custom_sites : [];
  await putJson(context.env, CUSTOM_SITES_KEY, customSites);
  return json({ ok: true, custom_sites: customSites });
}
