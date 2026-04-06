import { getPagesManifest, getSession, hasPermission, redirectToLogin } from "../api/_utils";

function contentTypeFromPath(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function onRequestGet(context) {
  const auth = await getSession(context.env, context.request);
  if (!auth?.user) {
    return redirectToLogin(context.request.url.replace(/^https?:\/\/[^/]+/, ""));
  }

  const rawPath = String(context.params.path || "");
  const segments = rawPath.split("/").filter(Boolean);
  const slug = segments[0];
  const filePath = segments.length > 1 ? segments.slice(1).join("/") : "index.html";

  if (!slug) return new Response("Not Found", { status: 404 });
  if (!hasPermission(auth.user, `uploaded.${slug}`) && !auth.user.is_admin) {
    return new Response("Forbidden", { status: 403 });
  }

  const manifest = await getPagesManifest(context.env);
  const page = (manifest.pages || []).find((entry) => entry.slug === slug);
  if (!page) return new Response("Not Found", { status: 404 });

  const object = await context.env.ATLAS_PAGES_BUCKET.get(`pages/${slug}/${filePath}`);
  if (!object) return new Response("Not Found", { status: 404 });

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": object.httpMetadata?.contentType || contentTypeFromPath(filePath),
      "cache-control": "no-store",
    },
  });
}
