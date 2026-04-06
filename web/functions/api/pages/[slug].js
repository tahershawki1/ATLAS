import { getPagesManifest, json, putPagesManifest, requireUser } from "../_utils";

export async function onRequestDelete(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;
  if (!context.env.ATLAS_PAGES_BUCKET) {
    return json({ error: "ATLAS_PAGES_BUCKET binding is required" }, { status: 500 });
  }

  const manifest = await getPagesManifest(context.env);
  const page = (manifest.pages || []).find((entry) => entry.slug === context.params.slug);
  if (!page) return json({ error: "الصفحة غير موجودة" }, { status: 404 });

  for (const file of page.files || []) {
    await context.env.ATLAS_PAGES_BUCKET.delete(`pages/${page.slug}/${file.path}`);
  }

  const pages = (manifest.pages || []).filter((entry) => entry.slug !== context.params.slug);
  await putPagesManifest(context.env, { pages });
  return json({ ok: true });
}
