(function () {
  if (window.AtlasAuth && window.AtlasStore) return;

  const STORAGE = {
    localUsers: "atlasAdminUsers",
    localSession: "atlasAdminSession",
    localCustomSites: "atlasCustomSitesDb",
    localPages: "atlasUploadedPagesManifest",
    localConfig: "atlasRuntimeConfig",
  };

  const DEFAULT_ADMIN = {
    id: "user-admin",
    username: "admin",
    full_name: "مدير النظام",
    password_hint: "admin123",
    password_hash: "",
    is_admin: true,
    permissions: ["*"],
    created_at: new Date().toISOString(),
  };

  const STATIC_PAGES = [
    { id: "pages.home", label: "الرئيسية", url: "/index.html" },
    { id: "pages.new-level-mark", label: "علام جيت لفل جديد", url: "/pages/new-level-mark/" },
    { id: "pages.level-budget", label: "جدول الميزانية والتحقق", url: "/pages/level-budget/" },
    { id: "pages.coordinates-extractor", label: "استخراج الاحداثيات", url: "/pages/coordinates-extractor/" },
    { id: "pages.site-management", label: "إدارة الشركات والمناطق والمواقع", url: "/pages/site-management/" },
    { id: "admin.panel", label: "لوحة الإدارة", url: "/pages/admin/" },
  ];

  const state = {
    initialized: false,
    apiAvailable: false,
    apiBindings: null,
    currentUser: null,
    mode: "local",
  };

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function jsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function toAbsolute(url) {
    return new URL(url, window.location.origin).toString();
  }

  function currentPath() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function isHomePageRoute(pathname = window.location.pathname) {
    const normalized = String(pathname || "")
      .replace(/\\/g, "/")
      .toLowerCase()
      .replace(/\/+$/, "");

    if (!normalized || normalized === "/") return true;
    if (normalized.includes("/pages/")) return false;
    return normalized.endsWith("/index.html");
  }

  function normalizeComparablePath(urlLike) {
    try {
      const url = new URL(urlLike, window.location.origin);
      return url.pathname.replace(/\/+$/, "") || "/";
    } catch (error) {
      return "/";
    }
  }

  function buildUserId() {
    if (typeof crypto?.randomUUID === "function") {
      return `user-${crypto.randomUUID()}`;
    }
    return `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeUsername(value) {
    return normalize(value).toLowerCase();
  }

  function hasWhitespace(value) {
    return /\s/.test(String(value ?? ""));
  }

  function normalizePermissions(permissions, isAdmin) {
    if (Boolean(isAdmin)) return ["*"];
    return Array.isArray(permissions) ? [...new Set(permissions.filter(Boolean))] : [];
  }

  async function sha256(input) {
    const text = new TextEncoder().encode(String(input ?? ""));
    const digest = await crypto.subtle.digest("SHA-256", text);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function buildDefaultAdmin() {
    return {
      ...DEFAULT_ADMIN,
      password_hash: await sha256(DEFAULT_ADMIN.password_hint),
    };
  }

  async function normalizeStoredUser(user, defaultAdmin) {
    const fallbackPassword =
      normalize(user?.username).toLowerCase() === normalize(DEFAULT_ADMIN.username).toLowerCase()
        ? DEFAULT_ADMIN.password_hint
        : "";
    const next = {
      ...user,
    };

    if (!next.id) next.id = `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    if (!normalize(next.username) && normalize(next.full_name)) {
      next.username = normalize(next.full_name).toLowerCase().replace(/\s+/g, "");
    }
    if (!normalize(next.full_name)) next.full_name = next.username || "user";
    next.username = normalize(next.username).toLowerCase();
    next.permissions = Array.isArray(next.permissions) ? [...new Set(next.permissions.filter(Boolean))] : [];
    next.is_admin = Boolean(next.is_admin);
    if (!normalize(next.created_at)) next.created_at = new Date().toISOString();

    if (!normalize(next.password_hash)) {
      const rawPassword = normalize(next.password_hint) || fallbackPassword;
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

    return next;
  }

  async function ensureLocalUsers() {
    const existing = jsonParse(localStorage.getItem(STORAGE.localUsers), []);
    const admin = await buildDefaultAdmin();
    const source = Array.isArray(existing) ? existing : [];

    if (!source.length) {
      localStorage.setItem(STORAGE.localUsers, JSON.stringify([admin]));
      return [admin];
    }

    const normalizedUsers = [];
    for (const entry of source) {
      normalizedUsers.push(await normalizeStoredUser(entry, admin));
    }

    const hasAdmin = normalizedUsers.some(
      (entry) => normalize(entry.username).toLowerCase() === normalize(admin.username).toLowerCase(),
    );

    if (!hasAdmin) normalizedUsers.unshift(admin);

    const deduplicatedUsers = normalizedUsers.filter((entry, index, items) => {
      return (
        items.findIndex(
          (candidate) => normalize(candidate.username).toLowerCase() === normalize(entry.username).toLowerCase(),
        ) === index
      );
    });

    localStorage.setItem(STORAGE.localUsers, JSON.stringify(deduplicatedUsers));
    return deduplicatedUsers;
  }

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
      ...options,
    });

    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? payload
          : payload?.error || payload?.message || "Request failed";
      throw new Error(message);
    }

    return payload;
  }

  async function probeApi() {
    try {
      const payload = await apiFetch("/api/bootstrap", { method: "GET" });
      state.apiBindings = payload?.bindings || null;
      const hasUserBindings = Boolean(payload?.bindings?.data) && Boolean(payload?.bindings?.sessions);
      state.apiAvailable = Boolean(payload?.ok && hasUserBindings);
      state.mode = state.apiAvailable ? "cloudflare" : "local";
      return state.apiAvailable;
    } catch (error) {
      state.apiAvailable = false;
      state.apiBindings = null;
      state.mode = "local";
      return false;
    }
  }

  function stripSensitiveUser(user) {
    if (!user) return null;
    const clone = { ...user };
    delete clone.password_hash;
    delete clone.password_hint;
    return clone;
  }

  function localGetSession() {
    return jsonParse(localStorage.getItem(STORAGE.localSession), null);
  }

  function localSetSession(session) {
    if (!session) {
      localStorage.removeItem(STORAGE.localSession);
      return;
    }
    localStorage.setItem(STORAGE.localSession, JSON.stringify(session));
  }

  function matchesPermission(permissionList, permission) {
    if (!permission) return true;
    if (!Array.isArray(permissionList)) return false;
    if (permissionList.includes("*")) return true;
    if (permissionList.includes(permission)) return true;

    return permissionList.some((entry) => {
      if (!entry.endsWith(".*")) return false;
      const prefix = entry.slice(0, -1);
      return permission.startsWith(prefix);
    });
  }

  async function initialize() {
    if (state.initialized) return state;

    await probeApi();

    if (state.apiAvailable) {
      try {
        const payload = await apiFetch("/api/me", { method: "GET" });
        state.currentUser = payload?.user || null;
      } catch (error) {
        state.currentUser = null;
      }
    } else {
      const users = await ensureLocalUsers();
      const session = localGetSession();
      const matchedUser =
        users.find((user) => user.id === session?.user_id || user.username === session?.username) || null;
      state.currentUser = stripSensitiveUser(matchedUser);
    }

    state.initialized = true;

    if (document?.body) {
      const isHomeRoute = isHomePageRoute();
      document.body.classList.toggle("atlas-home-page", isHomeRoute);
      document.body.classList.toggle("atlas-non-home-page", !isHomeRoute);

      const topHeader = document.querySelector(".main-header");
      if (topHeader) {
        topHeader.hidden = !isHomeRoute;
      }
    }

    return state;
  }

  async function login(username, password) {
    await initialize();

    if (state.apiAvailable) {
      const payload = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      state.currentUser = payload?.user || null;
      return state.currentUser;
    }

    const users = await ensureLocalUsers();
    const passwordHash = await sha256(password);
    const user = users.find(
      (entry) =>
        normalize(entry.username).toLowerCase() === normalize(username).toLowerCase() &&
        entry.password_hash === passwordHash,
    );

    if (!user) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");

    localSetSession({
      user_id: user.id,
      username: user.username,
      created_at: new Date().toISOString(),
    });
    state.currentUser = stripSensitiveUser(user);
    return state.currentUser;
  }

  async function logout() {
    await initialize();

    if (state.apiAvailable) {
      try {
        await apiFetch("/api/logout", { method: "POST", body: JSON.stringify({}) });
      } catch (error) {
        console.warn("Logout API failed", error);
      }
    }

    localSetSession(null);
    state.currentUser = null;
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  function isAdmin(user = state.currentUser) {
    return Boolean(user?.is_admin || matchesPermission(user?.permissions, "admin.panel"));
  }

  function canAccess(permission, user = state.currentUser) {
    if (!permission) return true;
    if (!user) return false;
    if (Boolean(user.is_admin)) return true;
    return matchesPermission(user.permissions, permission);
  }

  function goToLogin(redirectPath = currentPath()) {
    const loginUrl = new URL("/pages/login/", window.location.origin);
    if (redirectPath) loginUrl.searchParams.set("redirect", redirectPath);
    window.location.href = loginUrl.toString();
  }

  async function requirePageAccess(permission, options = {}) {
    await initialize();

    const settings = {
      redirectToLogin: true,
      redirectUnauthorized: true,
      ...options,
    };

    if (!state.currentUser) {
      if (settings.redirectToLogin) goToLogin(currentPath());
      return false;
    }

    if (!canAccess(permission)) {
      if (settings.redirectUnauthorized) {
        const fallbackUrl = await getDefaultAuthorizedUrl();
        if (normalizeComparablePath(fallbackUrl) !== normalizeComparablePath(window.location.href)) {
          window.location.href = fallbackUrl;
        } else {
          renderAccessDenied(permission);
        }
      }
      return false;
    }

    return true;
  }

  function getStaticPages() {
    return STATIC_PAGES.map((entry) => ({ ...entry }));
  }

  async function getDynamicPages() {
    const manifest = await AtlasStore.getPagesManifest();
    return (manifest?.pages || []).map((page) => ({
      id: `uploaded.${page.slug}`,
      label: page.title || page.slug,
      slug: page.slug,
      is_uploaded: true,
      url: `/published/${page.slug}/`,
    }));
  }

  async function getAllPages() {
    const dynamicPages = await getDynamicPages();
    return [...getStaticPages(), ...dynamicPages];
  }

  async function getDefaultAuthorizedUrl(user = state.currentUser) {
    const pages = await getAllPages();
    const fallback = pages.find((page) => canAccess(page.id, user));
    return toAbsolute(fallback?.url || "/index.html");
  }

  function renderAccessDenied(permission) {
    if (!document?.body) return;

    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;font-family:Cairo,system-ui,sans-serif;">
        <div style="width:min(100%,420px);background:#fff;border:1px solid rgba(30,64,175,.1);border-radius:16px;padding:24px;box-shadow:0 18px 40px rgba(15,23,42,.12);text-align:center;">
          <h1 style="margin:0 0 10px;color:#1e3a8a;font-size:1.2rem;font-weight:900;">لا توجد صلاحية</h1>
          <p style="margin:0 0 18px;color:#475569;font-size:.92rem;line-height:1.8;">هذا المستخدم لا يملك صلاحية فتح هذه الصفحة${permission ? ` (${permission})` : ""}.</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button id="atlasDeniedLogoutBtn" type="button" style="min-height:42px;padding:0 16px;border:none;border-radius:10px;background:#1e3a8a;color:#fff;font-family:inherit;font-weight:800;cursor:pointer;">تسجيل الخروج</button>
            <a href="/pages/login/" style="display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:10px;border:1px solid rgba(30,64,175,.14);background:#fff;color:#1e3a8a;text-decoration:none;font-weight:800;">صفحة الدخول</a>
          </div>
        </div>
      </div>
    `;

    const logoutBtn = document.getElementById("atlasDeniedLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await logout();
        goToLogin("/index.html");
      });
    }
  }

  function applyPagePermissions(root = document) {
    root.querySelectorAll("[data-permission]").forEach((node) => {
      const permission = node.getAttribute("data-permission");
      const allowed = canAccess(permission);
      node.hidden = !allowed;
      node.setAttribute("aria-hidden", allowed ? "false" : "true");
    });
  }

  function decorateShell(options = {}) {
    const mount = document.querySelector(options.mountSelector || "[data-auth-shell]");
    if (!mount || mount.dataset.authRendered === "true") return;

    const homeOnly = options.homeOnly !== false;
    if (homeOnly && !isHomePageRoute()) {
      mount.hidden = true;
      return;
    }
    mount.hidden = false;

    const user = getCurrentUser();
    const userLabel = user?.full_name || user?.username || "مستخدم";
    const canSeeAdmin = canAccess("admin.panel");

    mount.innerHTML = `
      <div class="atlas-auth-shell">
        <div class="atlas-auth-user">
          <span class="atlas-auth-user-label">المستخدم الحالي</span>
          <strong>${userLabel}</strong>
        </div>
        <div class="atlas-auth-actions">
          ${canSeeAdmin ? '<a class="atlas-auth-link" href="/pages/admin/">لوحة الإدارة</a>' : ""}
          <button type="button" class="atlas-auth-link atlas-auth-logout">تسجيل الخروج</button>
        </div>
      </div>
    `;
    mount.dataset.authRendered = "true";

    const logoutBtn = mount.querySelector(".atlas-auth-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await logout();
        goToLogin("/index.html");
      });
    }

    if (!document.getElementById("atlas-auth-shell-style")) {
      const style = document.createElement("style");
      style.id = "atlas-auth-shell-style";
      style.textContent = `
        .atlas-auth-shell {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(30, 64, 175, 0.1);
          box-shadow: 0 10px 24px rgba(30, 64, 175, 0.06);
        }
        .atlas-auth-user {
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: var(--text-main);
        }
        .atlas-auth-user-label {
          font-size: 0.72rem;
          color: var(--text-dim);
          font-weight: 700;
        }
        .atlas-auth-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .atlas-auth-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(30, 64, 175, 0.14);
          background: #fff;
          color: var(--primary);
          text-decoration: none;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.84rem;
        }
      `;
      document.head.appendChild(style);
    }
  }

  async function localListUsers() {
    const users = await ensureLocalUsers();
    return users.map(stripSensitiveUser);
  }

  async function localCreateUser(data) {
    const users = await ensureLocalUsers();
    const username = normalizeUsername(data.username);
    if (hasWhitespace(username)) throw new Error("Username cannot contain spaces");
    const password = normalize(data.password);
    if (!password) throw new Error("Password is required");
    if (!username) throw new Error("اسم المستخدم مطلوب");
    if (users.some((user) => normalize(user.username).toLowerCase() === username)) {
      throw new Error("اسم المستخدم مستخدم بالفعل");
    }

    const next = {
      id: buildUserId(),
      username,
      full_name: normalize(data.full_name) || username,
      password_hash: await sha256(password),
      is_admin: Boolean(data.is_admin),
      permissions: normalizePermissions(data.permissions, data.is_admin),
      created_at: new Date().toISOString(),
    };

    users.push(next);
    localStorage.setItem(STORAGE.localUsers, JSON.stringify(users));
    return stripSensitiveUser(next);
  }

  async function localUpdateUser(userId, data) {
    const users = await ensureLocalUsers();
    const index = users.findIndex((user) => user.id === userId);
    if (index === -1) throw new Error("المستخدم غير موجود");

    const current = users[index];
    const nextIsAdmin = current.username === DEFAULT_ADMIN.username
      ? true
      : Object.prototype.hasOwnProperty.call(data || {}, "is_admin")
        ? Boolean(data.is_admin)
        : current.is_admin;
    const next = {
      ...current,
      full_name: normalize(data.full_name) || current.full_name,
      is_admin: nextIsAdmin,
      permissions: Array.isArray(data.permissions)
        ? normalizePermissions(data.permissions, nextIsAdmin)
        : normalizePermissions(current.permissions, nextIsAdmin),
    };

    if (normalize(data.username)) {
      const username = normalizeUsername(data.username);
      if (hasWhitespace(username)) throw new Error("Username cannot contain spaces");
      const duplicate = users.some(
        (user) => user.id !== userId && normalize(user.username).toLowerCase() === username,
      );
      if (duplicate) throw new Error("اسم المستخدم مستخدم بالفعل");
      next.username = username;
    }

    if (normalize(data.password)) {
      next.password_hash = await sha256(data.password);
    }

    if (current.username === DEFAULT_ADMIN.username) {
      next.username = DEFAULT_ADMIN.username;
      next.is_admin = true;
      next.permissions = ["*"];
    }

    users[index] = next;
    localStorage.setItem(STORAGE.localUsers, JSON.stringify(users));

    const session = localGetSession();
    if (session?.user_id === userId) {
      localSetSession({ ...session, username: next.username });
      state.currentUser = stripSensitiveUser(next);
    }

    return stripSensitiveUser(next);
  }

  async function localDeleteUser(userId) {
    const users = await ensureLocalUsers();
    const user = users.find((entry) => entry.id === userId);
    if (!user) throw new Error("المستخدم غير موجود");
    if (user.username === "admin") throw new Error("لا يمكن حذف المستخدم الافتراضي");

    const filtered = users.filter((entry) => entry.id !== userId);
    localStorage.setItem(STORAGE.localUsers, JSON.stringify(filtered));

    const session = localGetSession();
    if (session?.user_id === userId) localSetSession(null);

    return { ok: true };
  }

  const AtlasStore = {
    async getMode() {
      await initialize();
      return state.mode;
    },

    isApiMode() {
      return state.apiAvailable;
    },

    async getUsers() {
      await initialize();
      if (state.apiAvailable) {
        const payload = await apiFetch("/api/users", { method: "GET" });
        return payload?.users || [];
      }
      return localListUsers();
    },

    async createUser(data) {
      await initialize();
      if (state.apiAvailable) {
        const payload = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(data),
        });
        return payload?.user || null;
      }
      return localCreateUser(data);
    },

    async updateUser(userId, data) {
      await initialize();
      if (state.apiAvailable) {
        const payload = await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        return payload?.user || null;
      }
      return localUpdateUser(userId, data);
    },

    async deleteUser(userId) {
      await initialize();
      if (state.apiAvailable) {
        return apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: "DELETE",
          body: JSON.stringify({}),
        });
      }
      return localDeleteUser(userId);
    },

    async loadCustomSites() {
      await initialize();
      if (state.apiAvailable && state.currentUser) {
        try {
          const payload = await apiFetch("/api/sites", { method: "GET" });
          const sites = Array.isArray(payload?.custom_sites) ? payload.custom_sites : [];
          localStorage.setItem(STORAGE.localCustomSites, JSON.stringify(sites));
          return sites;
        } catch (error) {
          console.warn("Falling back to local custom sites", error);
        }
      }
      return jsonParse(localStorage.getItem(STORAGE.localCustomSites), []);
    },

    async saveCustomSites(customSites) {
      const next = Array.isArray(customSites) ? customSites : [];
      localStorage.setItem(STORAGE.localCustomSites, JSON.stringify(next));

      await initialize();
      if (state.apiAvailable && state.currentUser) {
        try {
          await apiFetch("/api/sites", {
            method: "PUT",
            body: JSON.stringify({ custom_sites: next }),
          });
        } catch (error) {
          console.warn("Remote custom sites save failed", error);
        }
      }

      return next;
    },

    async getPagesManifest() {
      await initialize();
      if (state.apiAvailable && state.currentUser) {
        const payload = await apiFetch("/api/pages", { method: "GET" });
        return payload || { pages: [] };
      }
      return jsonParse(localStorage.getItem(STORAGE.localPages), { pages: [] });
    },

    async uploadPages({ files, title, slug }) {
      await initialize();
      if (!state.apiAvailable) {
        throw new Error("رفع الصفحات متاح بعد تفعيل Cloudflare Pages Functions مع R2");
      }

      const form = new FormData();
      if (title) form.append("title", title);
      if (slug) form.append("slug", slug);
      Array.from(files || []).forEach((file) => form.append("files", file, file.webkitRelativePath || file.name));

      return apiFetch("/api/pages", {
        method: "POST",
        body: form,
        headers: {},
      });
    },

    async deleteUploadedPage(slug) {
      await initialize();
      if (!state.apiAvailable) {
        throw new Error("حذف الصفحات المرفوعة متاح بعد تفعيل Cloudflare");
      }
      return apiFetch(`/api/pages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
    },
  };

  window.AtlasStore = AtlasStore;
  window.AtlasAuth = {
    initialize,
    login,
    logout,
    getCurrentUser,
    isAdmin,
    canAccess,
    requirePageAccess,
    goToLogin,
    getStaticPages,
    getDynamicPages,
    getAllPages,
    getDefaultAuthorizedUrl,
    applyPagePermissions,
    decorateShell,
    state,
  };
})();
