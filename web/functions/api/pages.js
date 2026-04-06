import { getPagesManifest, json, putPagesManifest, requireUser, slugify } from "./_utils";

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const manifest = await getPagesManifest(context.env);
  return json(manifest);
}

export async function onRequestPost(context) {
  const auth = await requireUser(context, "admin.panel");
  if (auth.error) return auth.error;
  if (!context.env.ATLAS_PAGES_BUCKET) {
    return json({ error: "ATLAS_PAGES_BUCKET binding is required" }, { status: 500 });
  }

  const form = await context.request.formData();
  const title = String(form.get("title") || "").trim();
  const requestedSlug = String(form.get("slug") || "").trim();
  const files = form.getAll("files");
  if (!files.length) return json({ error: "لم يتم اختيار ملفات" }, { status: 400 });

  const manifest = await getPagesManifest(context.env);
  const slug = slugify(requestedSlug || title || `page-${Date.now()}`);

  const uploadedFiles = [];
  for (const item of files) {
    if (!(item instanceof File)) continue;
    const relativePath = item.webkitRelativePath || item.name;
    const cleanPath = relativePath.replace(/^\/+/, "").replaceAll("\\", "/");
    const key = `pages/${slug}/${cleanPath}`;
    await context.env.ATLAS_PAGES_BUCKET.put(key, item.stream(), {
      httpMetadata: {
        contentType: item.type || "application/octet-stream",
      },
    });
    uploadedFiles.push({
      name: item.name,
      path: cleanPath,
      size: item.size,
      type: item.type || "application/octet-stream",
    });
  }

  const pageRecord = {
    slug,
    title: title || slug,
    files: uploadedFiles,
    created_at: new Date().toISOString(),
    created_by: auth.user.id,
    url: `/published/${slug}/`,
  };

  const pages = Array.isArray(manifest.pages) ? manifest.pages.filter((page) => page.slug !== slug) : [];
  pages.push(pageRecord);
  await putPagesManifest(context.env, { pages });

  return json({ ok: true, page: pageRecord }, { status: 201 });
}
