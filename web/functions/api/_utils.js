const SESSION_COOKIE = "ATLAS_SESSION";
const USERS_KEY = "users";
const CUSTOM_SITES_KEY = "custom_sites";
const PAGES_MANIFEST_KEY = "pages_manifest";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

async function sha256(input) {
  const text = new TextEncoder().encode(String(input ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", text);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function cookieValue(request, name) {
  const raw = request.headers.get("cookie") || "";
  const parts = raw.split(";").map((part) => part.trim());
  const entry = parts.find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
}

function sanitizeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password_hash;
  delete copy.password_hint;
  return copy;
}

async function getJson(env, key, fallback) {
  const raw = await env.ATLAS_DATA.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

async function putJson(env, key, value) {
  await env.ATLAS_DATA.put(key, JSON.stringify(value));
  return value;
}

async function ensureUsers(env) {
  let users = await getJson(env, USERS_KEY, []);
  if (Array.isArray(users) && users.length) return users;

  const defaultAdmin = {
    id: "user-admin",
    username: "admin",
    full_name: "مدير النظام",
    password_hint: "admin123",
    password_hash: await sha256("admin123"),
    is_admin: true,
    permissions: ["*"],
    created_at: new Date().toISOString(),
  };
  users = [defaultAdmin];
  await putJson(env, USERS_KEY, users);
  return users;
}

async function getSession(env, request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const raw = await env.ATLAS_SESSIONS.get(token);
  if (!raw) return null;

  let session = null;
  try {
    session = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (!session?.user_id) return null;

  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    await env.ATLAS_SESSIONS.delete(token);
    return null;
  }

  const users = await ensureUsers(env);
  const user = users.find((entry) => entry.id === session.user_id);
  if (!user) return null;

  return {
    token,
    session,
    user,
  };
}

function hasPermission(user, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (user.is_admin) return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes("*") || permissions.includes(permission)) return true;

  return permissions.some((entry) => entry.endsWith(".*") && permission.startsWith(entry.slice(0, -1)));
}

async function requireUser(context, permission) {
  const auth = await getSession(context.env, context.request);
  if (!auth?.user) return { error: json({ error: "Unauthorized" }, { status: 401 }) };
  if (permission && !hasPermission(auth.user, permission)) {
    return { error: json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

async function getPagesManifest(env) {
  return getJson(env, PAGES_MANIFEST_KEY, { pages: [] });
}

async function putPagesManifest(env, manifest) {
  return putJson(env, PAGES_MANIFEST_KEY, manifest);
}

function setSessionCookie(token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function slugify(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `page-${Date.now()}`;
}

function redirectToLogin(pathname) {
  const url = new URL("/pages/login/", "https://atlas.local");
  url.searchParams.set("redirect", pathname || "/");
  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.pathname}${url.search}`,
      "cache-control": "no-store",
    },
  });
}

export {
  CUSTOM_SITES_KEY,
  PAGES_MANIFEST_KEY,
  SESSION_COOKIE,
  USERS_KEY,
  clearSessionCookie,
  ensureUsers,
  getJson,
  getPagesManifest,
  getSession,
  hasPermission,
  json,
  putJson,
  putPagesManifest,
  redirectToLogin,
  requireUser,
  sanitizeUser,
  setSessionCookie,
  sha256,
  slugify,
};
