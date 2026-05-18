import { getPagesManifest, getSession, hasPermission, redirectToLogin } from "../api/_utils";

function contentTypeFromPath(pathname) {
  const lower = String(pathname || "").toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function cleanObjectPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function listPageFilePaths(page) {
  return (page.files || [])
    .map((file) => cleanObjectPath(file?.path))
    .filter(Boolean);
}

function isHtmlPath(pathname) {
  return /\.html?$/i.test(pathname);
}

function dirname(pathname) {
  const cleanPath = cleanObjectPath(pathname);
  const parts = cleanPath.split("/");
  parts.pop();
  return parts.join("/");
}

function getEntryPath(page) {
  const declared = cleanObjectPath(page.entry_path || page.entryPath || page.default_path);
  const filePaths = listPageFilePaths(page);

  if (declared && (!filePaths.length || filePaths.includes(declared))) return declared;

  const rootIndex = filePaths.find((entry) => entry.toLowerCase() === "index.html");
  if (rootIndex) return rootIndex;

  const nestedIndex = filePaths
    .filter((entry) => entry.toLowerCase().endsWith("/index.html"))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (nestedIndex) return nestedIndex;

  return filePaths.find(isHtmlPath) || declared || "index.html";
}

function buildCandidatePaths(filePath, page) {
  const normalizedPath = cleanObjectPath(filePath) || "index.html";
  const entryPath = getEntryPath(page);
  const entryDir = dirname(entryPath);
  const candidates = [];
  const add = (path) => {
    const cleanPath = cleanObjectPath(path);
    if (cleanPath && !candidates.includes(cleanPath)) candidates.push(cleanPath);
  };

  add(normalizedPath);
  if (normalizedPath === "index.html") add(entryPath);
  if (entryDir && !normalizedPath.startsWith(`${entryDir}/`)) add(`${entryDir}/${normalizedPath}`);

  return candidates;
}

function readRoutePath(pathParam) {
  if (Array.isArray(pathParam)) return pathParam.join("/");
  return String(pathParam || "");
}

export async function onRequestGet(context) {
  const auth = await getSession(context.env, context.request);
  if (!auth?.user) {
    return redirectToLogin(context.request.url.replace(/^https?:\/\/[^/]+/, ""));
  }

  if (!context.env.ATLAS_PAGES_BUCKET) {
    return new Response("ATLAS_PAGES_BUCKET binding is required", { status: 500 });
  }

  const rawPath = readRoutePath(context.params.path);
  const segments = rawPath.split("/").filter(Boolean);
  const slug = segments[0];
  const requestPathname = new URL(context.request.url).pathname;
  const nestedPath = segments.slice(1).join("/");
  const filePath = !nestedPath
    ? "index.html"
    : requestPathname.endsWith("/")
      ? `${nestedPath}/index.html`
      : nestedPath;

  if (!slug) return new Response("Not Found", { status: 404 });
  if (!hasPermission(auth.user, `uploaded.${slug}`) && !auth.user.is_admin) {
    return new Response("Forbidden", { status: 403 });
  }

  const manifest = await getPagesManifest(context.env);
  const page = (manifest.pages || []).find((entry) => entry.slug === slug);
  if (!page) return new Response("Not Found", { status: 404 });

  let object = null;
  let resolvedPath = cleanObjectPath(filePath) || "index.html";
  for (const candidatePath of buildCandidatePaths(filePath, page)) {
    object = await context.env.ATLAS_PAGES_BUCKET.get(`pages/${slug}/${candidatePath}`);
    if (object) {
      resolvedPath = candidatePath;
      break;
    }
  }

  if (!object) return new Response("Not Found", { status: 404 });

  const storedContentType = object.httpMetadata?.contentType || "";
  const contentType =
    storedContentType && storedContentType !== "application/octet-stream"
      ? storedContentType
      : contentTypeFromPath(resolvedPath);

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}
