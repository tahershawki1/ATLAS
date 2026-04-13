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

function normalizeValue(value) {
  return String(value ?? "").trim();
}

function buildUserId() {
  return `user-${crypto.randomUUID()}`;
}

function normalizeUsername(value) {
  return normalizeValue(value).toLowerCase();
}

function hasWhitespace(value) {
  return /\s/.test(String(value ?? ""));
}

function normalizePermissions(permissions, isAdmin) {
  if (Boolean(isAdmin)) return ["*"];
  return Array.isArray(permissions) ? [...new Set(permissions.filter(Boolean))] : [];
}

async function normalizeStoredUsers(users, defaultAdmin) {
  const source = Array.isArray(users) ? users : [];
  const normalized = [];

  for (const user of source) {
    const fallbackPassword =
      normalizeValue(user?.username).toLowerCase() === normalizeValue(defaultAdmin.username).toLowerCase()
        ? defaultAdmin.password_hint
        : "";
    const next = { ...user };

    if (!next.id) next.id = `user-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    if (!normalizeValue(next.username) && normalizeValue(next.full_name)) {
      next.username = normalizeValue(next.full_name).toLowerCase().replace(/\s+/g, "");
    }
    if (!normalizeValue(next.full_name)) next.full_name = next.username || "user";
    next.username = normalizeValue(next.username).toLowerCase();
    next.permissions = Array.isArray(next.permissions) ? [...new Set(next.permissions.filter(Boolean))] : [];
    next.is_admin = Boolean(next.is_admin);
    if (!normalizeValue(next.created_at)) next.created_at = new Date().toISOString();

    if (!normalizeValue(next.password_hash)) {
      const rawPassword = normalizeValue(next.password_hint) || fallbackPassword;
      if (rawPassword) next.password_hash = await sha256(rawPassword);
    }

    if (next.username === defaultAdmin.username) {
      next.id = defaultAdmin.id;
      next.full_name = next.full_name || defaultAdmin.full_name;
      next.password_hint = next.password_hint || defaultAdmin.password_hint;
      next.password_hash = next.password_hash || defaultAdmin.password_hash;
      next.is_admin = true;
      next.permissions = ["*"];
    }

    if (next.username) normalized.push(next);
  }

  if (!normalized.some((entry) => entry.username === defaultAdmin.username)) {
    normalized.unshift(defaultAdmin);
  }

  return normalized.filter((entry, index, items) => {
    return items.findIndex((candidate) => candidate.username === entry.username) === index;
  });
}

async function ensureUsers(env) {
  let users = await getJson(env, USERS_KEY, []);
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
  users = await normalizeStoredUsers(users, defaultAdmin);
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

function setSessionCookie(token, request, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const isSecure = (() => {
    try {
      return new URL(request.url).protocol === "https:";
    } catch (error) {
      return true;
    }
  })();

  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${isSecure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie(request) {
  const isSecure = (() => {
    try {
      return new URL(request.url).protocol === "https:";
    } catch (error) {
      return true;
    }
  })();

  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${isSecure ? " Secure;" : ""} SameSite=Lax; Max-Age=0`;
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
  buildUserId,
  hasWhitespace,
  normalizePermissions,
  normalizeUsername,
  sanitizeUser,
  setSessionCookie,
  sha256,
  slugify,
};
