(function () {
  if (window.AtlasAuth && window.AtlasStore) return;

  const STORAGE = {
    localUsers: "atlasAdminUsers",
    localSession: "atlasAdminSession",
    localSessionSnapshot: "atlasAuthSessionSnapshot",
    localCustomSites: "atlasCustomSitesDb",
    localPages: "atlasUploadedPagesManifest",
    localConfig: "atlasRuntimeConfig",
  };

  const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
  const PASSWORD_HASH_ITERATIONS = 120000;

  const DEFAULT_ADMIN = {
    id: "user-admin",
    username: "admin",
    full_name: "مدير النظام",
    password_hint: "",
    password_hash: "",
    is_admin: true,
    permissions: ["*"],
    created_at: new Date().toISOString(),
  };

  const STATIC_PAGES = [
    { id: "pages.login", label: "تسجيل الدخول", url: "/pages/login/" },
    { id: "pages.home", label: "الرئيسية", url: "/index.html" },
    { id: "pages.new", label: "قائمة الأعمال الجديدة", url: "/pages/new/" },
    { id: "pages.check", label: "قائمة أعمال التحقق", url: "/pages/check/" },
    { id: "pages.survey", label: "قائمة أعمال الرفع", url: "/pages/survey/" },
    { id: "pages.point-staking", label: "توقيع النقاط", url: "/pages/point-staking/" },
    { id: "pages.new-level-mark", label: "علام جيت لفل جديد", url: "/pages/new-level-mark/" },
    { id: "pages.level-budget", label: "جدول الميزانية والتحقق", url: "/pages/level-budget/" },
    { id: "pages.coordinates-extractor", label: "استخراج الاحداثيات", url: "/pages/coordinates-extractor/" },
    { id: "pages.coordinates-proposal", label: "اقتراح الإحداثيات", url: "/pages/coordinates-proposal/" },
    { id: "pages.coordinates-export", label: "تصدير الإحداثيات", url: "/pages/coordinates-export/" },
    { id: "pages.shared-file", label: "اختيار أداة الملف المشترك", url: "/pages/shared-file/" },
    { id: "pages.site-management", label: "إدارة الشركات والمناطق والمواقع", url: "/pages/site-management/" },
    { id: "sites.write", label: "إضافة وتعديل بيانات المواقع", url: "/index.html", is_permission: true },
    { id: "admin.panel", label: "لوحة الإدارة", url: "/pages/admin/" },
  ];

  const state = {
    initialized: false,
    apiAvailable: false,
    apiBindings: null,
    currentUser: null,
    mode: "unavailable",
    localModeAllowed: false,
    bootstrapError: "",
  };

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function isLocalHost() {
    const host = String(window.location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  }

  function getRuntimeFlags() {
    const params = new URLSearchParams(window.location.search || "");
    return {
      forceApiProbe: params.get("atlas_api") === "1" || localStorage.getItem("atlasForceApiProbe") === "1",
      allowLocalMode: params.get("atlas_local_mode") === "1" || localStorage.getItem("atlasAllowLocalMode") === "1",
    };
  }

  function getLocalAdminPassword() {
    const params = new URLSearchParams(window.location.search || "");
    return normalize(params.get("atlas_local_password")) || normalize(localStorage.getItem("atlasLocalAdminPassword"));
  }

  function jsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function toAbsolute(url) {
    return new URL(toAppPath(url), getAppBaseUrl()).toString();
  }

  function getAppBaseUrl() {
    const marker = "/pages/";
    const pathname = window.location.pathname || "/";
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return `${window.location.origin}${pathname.slice(0, markerIndex + 1)}`;
    }
    return new URL("./", window.location.href).toString();
  }

  function toAppPath(path) {
    const value = String(path ?? "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return value.replace(/^\/+/, "");
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

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").replace(/[^a-f0-9]/gi, "");
    const bytes = new Uint8Array(Math.floor(clean.length / 2));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  async function hashPassword(password) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(password ?? "")),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: PASSWORD_HASH_ITERATIONS,
      },
      keyMaterial,
      256,
    );
    return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
  }

  async function verifyPassword(password, storedHash) {
    const hash = normalize(storedHash);
    if (!hash) return false;

    if (!hash.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
      return (await sha256(password)) === hash;
    }

    const [, iterationsText, saltHex, expectedHex] = hash.split("$");
    const iterations = Number(iterationsText);
    if (!Number.isFinite(iterations) || !saltHex || !expectedHex) return false;

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(password ?? "")),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: hexToBytes(saltHex),
        iterations,
      },
      keyMaterial,
      256,
    );
    return bytesToHex(new Uint8Array(bits)) === expectedHex;
  }

  function passwordHashNeedsUpgrade(storedHash) {
    return !normalize(storedHash).startsWith(`${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$`);
  }

  async function buildDefaultAdmin() {
    const localAdminPassword = getLocalAdminPassword();
    if (!localAdminPassword) {
      throw new Error(
        "Local mode requires atlasLocalAdminPassword in localStorage or atlas_local_password=... in the URL.",
      );
    }
    return {
      ...DEFAULT_ADMIN,
      password_hash: await hashPassword(localAdminPassword),
    };
  }

  async function normalizeStoredUser(user, defaultAdmin) {
    const fallbackPassword =
      normalize(user?.username).toLowerCase() === normalize(DEFAULT_ADMIN.username).toLowerCase()
        ? getLocalAdminPassword()
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
      if (rawPassword) next.password_hash = await hashPassword(rawPassword);
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
      const requestError = new Error(message);
      requestError.status = response.status;
      requestError.payload = payload;
      throw requestError;
    }

    return payload;
  }

  function localModeError() {
    return new Error(
      "الوضع المحلي معطل. استخدم Cloudflare Functions أو شغّل localhost مع atlas_local_mode=1 عند الحاجة للتطوير المحلي فقط.",
    );
  }

  function requireLocalMode() {
    if (state.mode !== "local" || !state.localModeAllowed) {
      throw localModeError();
    }
  }

  async function probeApi() {
    const flags = getRuntimeFlags();
    state.localModeAllowed = isLocalHost() && flags.allowLocalMode;
    state.bootstrapError = "";

    if (state.localModeAllowed && !flags.forceApiProbe) {
      state.apiAvailable = false;
      state.apiBindings = null;
      state.mode = "local";
      return false;
    }

    try {
      const payload = await apiFetch("/api/bootstrap", { method: "GET" });
      state.apiBindings = payload?.bindings || null;
      const hasUserBindings = Boolean(payload?.bindings?.data) && Boolean(payload?.bindings?.sessions);
      state.apiAvailable = Boolean(payload?.ok && hasUserBindings);
      state.mode = state.apiAvailable ? "cloudflare" : (state.localModeAllowed ? "local" : "unavailable");
      if (!state.apiAvailable) {
        state.bootstrapError =
          payload?.setup_message ||
          "Cloudflare authentication is not ready. Configure the required bindings before using this deployment.";
      }
      return state.apiAvailable;
    } catch (error) {
      state.apiAvailable = false;
      state.apiBindings = null;
      state.mode = state.localModeAllowed ? "local" : "unavailable";
      state.bootstrapError =
        error?.message ||
        "تعذر الوصول إلى Cloudflare Functions. استخدم localhost مع atlas_local_mode=1 للتطوير المحلي فقط.";
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

  function saveSessionSnapshot(user, options = {}) {
    const safeUser = stripSensitiveUser(user);
    if (!safeUser) {
      localStorage.removeItem(STORAGE.localSessionSnapshot);
      return;
    }

    const maxAgeMs = Number(options.maxAgeMs) || 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      STORAGE.localSessionSnapshot,
      JSON.stringify({
        user: safeUser,
        mode: options.mode || state.mode || "local",
        saved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + maxAgeMs).toISOString(),
      }),
    );
  }

  function clearSessionSnapshot() {
    localStorage.removeItem(STORAGE.localSessionSnapshot);
  }

  function getSessionSnapshot() {
    const snapshot = jsonParse(localStorage.getItem(STORAGE.localSessionSnapshot), null);
    if (!snapshot?.user) return null;

    const expiresAt = snapshot.expires_at ? new Date(snapshot.expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now()) {
      clearSessionSnapshot();
      return null;
    }

    return stripSensitiveUser(snapshot.user);
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
        const serverUser = payload?.user || null;
        state.currentUser = serverUser || getSessionSnapshot();
        if (serverUser) saveSessionSnapshot(serverUser, { mode: "cloudflare" });
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          clearSessionSnapshot();
          state.currentUser = null;
        } else {
          state.currentUser = getSessionSnapshot();
        }
      }
    } else if (state.mode === "local") {
      try {
        const users = await ensureLocalUsers();
        const session = localGetSession();
        const matchedUser =
          users.find((user) => user.id === session?.user_id || user.username === session?.username) || null;
        state.currentUser = stripSensitiveUser(matchedUser) || getSessionSnapshot();
        if (state.currentUser) saveSessionSnapshot(state.currentUser, { mode: state.mode });
      } catch (error) {
        state.mode = "unavailable";
        state.bootstrapError = error?.message || "Local mode is not configured correctly.";
        state.currentUser = null;
      }
    } else {
      state.currentUser = null;
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
      saveSessionSnapshot(state.currentUser, { mode: "cloudflare" });
      return state.currentUser;
    }

    requireLocalMode();
    const users = await ensureLocalUsers();
    let user = null;
    for (const entry of users) {
      if (normalize(entry.username).toLowerCase() !== normalize(username).toLowerCase()) continue;
      if (await verifyPassword(password, entry.password_hash)) {
        user = entry;
        break;
      }
    }

    if (!user) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");

    if (passwordHashNeedsUpgrade(user.password_hash)) {
      user.password_hash = await hashPassword(password);
      localStorage.setItem(STORAGE.localUsers, JSON.stringify(users));
    }

    localSetSession({
      user_id: user.id,
      username: user.username,
      created_at: new Date().toISOString(),
    });
    state.currentUser = stripSensitiveUser(user);
    saveSessionSnapshot(state.currentUser, { mode: "local" });
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
    clearSessionSnapshot();
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
    if (matchesPermission(user.permissions, "admin.panel")) return true;
    return matchesPermission(user.permissions, permission);
  }

  function goToLogin(redirectPath = currentPath()) {
    const loginUrl = new URL("pages/login/", getAppBaseUrl());
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
      url: page.url || `/published/${page.slug}/`,
    }));
  }

  async function getAllPages() {
    const dynamicPages = await getDynamicPages();
    return [...getStaticPages(), ...dynamicPages];
  }

  async function getDefaultAuthorizedUrl(user = state.currentUser) {
    const pages = await getAllPages();
    const fallback = pages.find((page) => !page.is_permission && canAccess(page.id, user));
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
            <a href="${toAbsolute("/pages/login/")}" style="display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:10px;border:1px solid rgba(30,64,175,.14);background:#fff;color:#1e3a8a;text-decoration:none;font-weight:800;">صفحة الدخول</a>
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

    const headerHost = document.querySelector(".main-header .header-right");
    if (headerHost && mount.parentElement !== headerHost) {
      headerHost.appendChild(mount);
    }

    mount.innerHTML = `
      <div class="atlas-auth-shell atlas-auth-shell-inline">
        <div class="atlas-auth-user">
          <span class="atlas-auth-user-label">المستخدم الحالي</span><strong>${userLabel}</strong>
        </div>
        <div class="atlas-auth-actions">
          ${canSeeAdmin ? `<a class="atlas-auth-link" href="${toAbsolute("/pages/admin/")}">لوحة الإدارة</a>` : ""}
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
          justify-content: flex-end;
          gap: 12px;
          margin: 0;
          padding: 0;
          flex-wrap: nowrap;
          white-space: nowrap;
        }
        .atlas-auth-user {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #0f172a;
          font-size: 0.78rem;
          font-weight: 800;
        }
        .atlas-auth-user-label {
          color: #64748b;
          font-weight: 700;
        }
        .atlas-auth-actions {
          display: flex;
          gap: 8px;
          flex-wrap: nowrap;
        }
        .atlas-auth-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 10px;
          border-radius: 9px;
          border: 1px solid rgba(30, 64, 175, 0.18);
          background: #fff;
          color: var(--primary);
          text-decoration: none;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.75rem;
        }
        .main-header .atlas-auth-shell {
          margin-inline-start: auto;
        }
        .main-header .atlas-auth-user {
          color: #e2e8f0;
        }
        .main-header .atlas-auth-user-label {
          color: #cbd5e1;
        }
        @media (max-width: 720px) {
          .atlas-auth-user-label {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  async function localListUsers() {
    requireLocalMode();
    const users = await ensureLocalUsers();
    return users.map(stripSensitiveUser);
  }

  async function localCreateUser(data) {
    requireLocalMode();
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
      password_hash: await hashPassword(password),
      is_admin: Boolean(data.is_admin),
      permissions: normalizePermissions(data.permissions, data.is_admin),
      created_at: new Date().toISOString(),
    };

    users.push(next);
    localStorage.setItem(STORAGE.localUsers, JSON.stringify(users));
    return stripSensitiveUser(next);
  }

  async function localUpdateUser(userId, data) {
    requireLocalMode();
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
      next.password_hash = await hashPassword(data.password);
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
    requireLocalMode();
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
      requireLocalMode();
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
      requireLocalMode();
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
      requireLocalMode();
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
      requireLocalMode();
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
          console.warn("Failed to load custom sites", error);
        }
      }
      requireLocalMode();
      return jsonParse(localStorage.getItem(STORAGE.localCustomSites), []);
    },

    async saveCustomSites(customSites) {
      const next = Array.isArray(customSites) ? customSites : [];
      await initialize();
      if (state.apiAvailable && state.currentUser) {
        await apiFetch("/api/sites", {
          method: "PUT",
          body: JSON.stringify({ custom_sites: next }),
        });
        localStorage.setItem(STORAGE.localCustomSites, JSON.stringify(next));
      } else {
        requireLocalMode();
        localStorage.setItem(STORAGE.localCustomSites, JSON.stringify(next));
      }

      return next;
    },

    async getPagesManifest() {
      await initialize();
      if (state.apiAvailable && state.currentUser) {
        const payload = await apiFetch("/api/pages", { method: "GET" });
        return payload || { pages: [] };
      }
      requireLocalMode();
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
