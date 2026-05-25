import { getPagesManifest, json, putPagesManifest, requireUser, slugify } from "./_utils";

function isUploadFile(item) {
  return item && typeof item === "object" && typeof item.stream === "function" && typeof item.name === "string";
}

function cleanUploadPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function splitUploadPath(value) {
  return cleanUploadPath(value)
    .split("/")
    .filter(Boolean);
}

function inferSharedRootName(paths = []) {
  const parts = paths.map((entry) => splitUploadPath(entry));
  if (!parts.length) return "";

  const root = parts[0][0];
  if (!root) return "";
  if (!parts.every((entry) => entry[0] === root)) return "";
  if (!parts.some((entry) => entry.length > 1)) return "";
  return root;
}

function basenameWithoutExtension(pathname) {
  const fileName = splitUploadPath(pathname).pop() || "";
  return fileName.replace(/\.[^./]+$/, "");
}

function normalizeDisplayTitle(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferPageNameFromPaths(normalizedUploads = [], entryPath = "") {
  const rootName = inferSharedRootName(normalizedUploads.map((entry) => entry.originalPath));
  if (rootName) return normalizeDisplayTitle(rootName);

  const entryRecord =
    normalizedUploads.find((entry) => cleanUploadPath(entry.path).toLowerCase() === cleanUploadPath(entryPath).toLowerCase()) ||
    normalizedUploads.find((entry) => isHtmlPath(entry.path)) ||
    normalizedUploads[0];
  if (!entryRecord) return "";

  const baseName = basenameWithoutExtension(entryRecord.originalPath || entryRecord.path);
  if (!baseName || baseName.toLowerCase() === "index") return "";
  return normalizeDisplayTitle(baseName);
}

async function inferHtmlTitle(normalizedUploads = [], entryPath = "") {
  const entryRecord =
    normalizedUploads.find((entry) => cleanUploadPath(entry.path).toLowerCase() === cleanUploadPath(entryPath).toLowerCase()) ||
    normalizedUploads.find((entry) => isHtmlPath(entry.path)) ||
    null;
  if (!entryRecord || !isHtmlPath(entryRecord.path) || typeof entryRecord.item?.text !== "function") return "";

  try {
    const html = await entryRecord.item.text();
    const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match?.[1]) return "";
    return match[1].replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function stripSharedRoot(paths) {
  if (!paths.length) return paths;

  const parts = paths.map((entry) => entry.split("/"));
  if (parts.some((entry) => entry.length < 2)) return paths;

  const root = parts[0][0];
  if (!root || !parts.every((entry) => entry[0] === root)) return paths;

  return parts.map((entry, index) => entry.slice(1).join("/") || paths[index]);
}

function isHtmlPath(path) {
  return /\.html?$/i.test(path);
}

function chooseEntryPath(paths) {
  const rootIndex = paths.find((entry) => entry.toLowerCase() === "index.html");
  if (rootIndex) return rootIndex;

  const nestedIndex = paths
    .filter((entry) => entry.toLowerCase().endsWith("/index.html"))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (nestedIndex) return nestedIndex;

  return paths.find(isHtmlPath) || "index.html";
}

function contentTypeFromPath(path, fallback = "") {
  const normalizedFallback = String(fallback || "").trim();
  if (normalizedFallback && normalizedFallback !== "application/octet-stream") return normalizedFallback;

  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  return normalizedFallback || "application/octet-stream";
}

async function deletePagePrefix(bucket, slug, keepPaths = []) {
  const prefix = `pages/${slug}/`;
  const keepKeys = new Set(keepPaths.map((filePath) => `${prefix}${filePath}`));
  let cursor;

  do {
    const listed = await bucket.list({ prefix, cursor });
    const staleObjects = (listed.objects || [])
      .filter((object) => !keepKeys.has(object.key))
      .map((object) => bucket.delete(object.key));
    if (staleObjects.length) {
      await Promise.all(staleObjects);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

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
  const uploadItems = files
    .filter(isUploadFile)
    .map((item) => ({
      item,
      originalPath: cleanUploadPath(item.webkitRelativePath || item.name),
    }))
    .filter((entry) => entry.originalPath);

  if (!uploadItems.length) return json({ error: "لم يتم اختيار ملفات صالحة" }, { status: 400 });

  const publishedPaths = stripSharedRoot(uploadItems.map((entry) => entry.originalPath));
  const normalizedUploads = uploadItems.map((entry, index) => ({
    ...entry,
    path: cleanUploadPath(publishedPaths[index]) || entry.originalPath,
  }));

  if (
    normalizedUploads.length === 1 &&
    isHtmlPath(normalizedUploads[0].path) &&
    normalizedUploads[0].path.toLowerCase() !== "index.html"
  ) {
    normalizedUploads[0].path = "index.html";
  }

  const entryPath = chooseEntryPath(normalizedUploads.map((entry) => entry.path));
  const inferredNameFromPaths = inferPageNameFromPaths(normalizedUploads, entryPath);
  const inferredHtmlTitle = await inferHtmlTitle(normalizedUploads, entryPath);
  const slug = slugify(requestedSlug || title || inferredNameFromPaths || inferredHtmlTitle || `page-${Date.now()}`);
  const existingPage = (manifest.pages || []).find((page) => page.slug === slug);
  const pageTitle = title || inferredHtmlTitle || inferredNameFromPaths || slug;

  const uploadedFiles = [];
  for (const upload of normalizedUploads) {
    const { item, path: cleanPath, originalPath } = upload;
    const key = `pages/${slug}/${cleanPath}`;
    await context.env.ATLAS_PAGES_BUCKET.put(key, item.stream(), {
      httpMetadata: {
        contentType: contentTypeFromPath(cleanPath, item.type),
      },
    });
    uploadedFiles.push({
      name: item.name,
      path: cleanPath,
      original_path: originalPath,
      size: item.size,
      type: contentTypeFromPath(cleanPath, item.type),
    });
  }
  await deletePagePrefix(
    context.env.ATLAS_PAGES_BUCKET,
    slug,
    uploadedFiles.map((file) => file.path),
  );

  const now = new Date().toISOString();
  const pageRecord = {
    slug,
    title: pageTitle,
    entry_path: entryPath,
    files: uploadedFiles,
    created_at: existingPage?.created_at || now,
    updated_at: now,
    created_by: auth.user.id,
    url: `/published/${slug}/`,
  };

  const pages = Array.isArray(manifest.pages) ? manifest.pages.filter((page) => page.slug !== slug) : [];
  pages.push(pageRecord);
  await putPagesManifest(context.env, { pages });

  return json({ ok: true, page: pageRecord }, { status: 201 });
}
