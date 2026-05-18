(function () {
  if (window.AtlasWorkspaceMemory) return;

  const LOCAL_PREFIX = "atlasWorkspaceMemory:v1";
  const SAVE_DELAY = 700;
  const runtime = {
    pageKey: "",
    workspaceId: "",
    pageState: null,
    restoring: false,
    saveTimer: null,
    bound: false,
  };

  function safeJson(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function cleanKey(value, fallback = "page") {
    return normalize(value)
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9\u0600-\u06ff._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || fallback;
  }

  function getWorkspaceInfo() {
    const site = safeJson(localStorage.getItem("selectedSite"), null);
    if (!site) return null;
    const workspaceId = cleanKey(
      site.workspace_id ||
        site.id ||
        [site.project_name, site.workspace_title, site.company, site.plot, site.source_report_id]
          .map(normalize)
          .filter(Boolean)
          .join("__"),
      "",
    );
    if (!workspaceId) return null;
    return {
      id: workspaceId,
      title: site.workspace_title || site.project_name || [site.company, site.plot].filter(Boolean).join(" - ") || workspaceId,
      site,
    };
  }

  function getPageKey() {
    const path = window.location.pathname.replace(/\/+$/, "");
    const match = path.match(/\/pages\/([^/]+)/i);
    return cleanKey(match?.[1] || "home");
  }

  function getUserKey() {
    const user = window.AtlasAuth?.getCurrentUser?.();
    return cleanKey(user?.id || user?.username || "local-user", "local-user");
  }

  function localKey(pageKey = getPageKey(), workspaceId = getWorkspaceInfo()?.id || "no-workspace") {
    return `${LOCAL_PREFIX}:${getUserKey()}:${workspaceId}:${pageKey}`;
  }

  function readLocal(pageKey, workspaceId) {
    return safeJson(localStorage.getItem(localKey(pageKey, workspaceId)), null);
  }

  function writeLocal(pageKey, workspaceId, state) {
    try {
      localStorage.setItem(localKey(pageKey, workspaceId), JSON.stringify(state));
    } catch (error) {
      console.warn("[WorkspaceMemory] Local save skipped:", error.message);
    }
  }

  function isCloudReady() {
    return Boolean(window.AtlasStore?.isApiMode?.() && window.AtlasAuth?.getCurrentUser?.());
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

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(typeof payload === "string" ? payload : payload?.error || "Workspace memory request failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
    const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
    Object.entries(patch).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  async function loadWorkspace(workspaceId = getWorkspaceInfo()?.id) {
    if (!workspaceId || !isCloudReady()) return null;
    const payload = await apiFetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
    return payload?.workspace || null;
  }

  async function loadWorkspaceManifest() {
    if (!isCloudReady()) return null;
    return apiFetch("/api/workspaces");
  }

  async function saveWorkspaceMeta(workspace) {
    const info = workspace?.id ? { id: workspace.id, title: workspace.title } : getWorkspaceInfo();
    if (!info?.id || !isCloudReady()) return false;
    await apiFetch(`/api/workspaces/${encodeURIComponent(info.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: workspace?.title || info.title,
        meta: {
          title: workspace?.title || info.title,
          site: workspace?.site || info.site || {},
        },
      }),
    });
    return true;
  }

  async function loadPageState(pageKey = getPageKey()) {
    const info = getWorkspaceInfo();
    if (!info?.id) return null;

    const local = readLocal(pageKey, info.id);
    if (!isCloudReady()) return local;

    try {
      const workspace = await loadWorkspace(info.id);
      const remote = workspace?.pages?.[pageKey] || null;
      if (remote) {
        writeLocal(pageKey, info.id, remote);
        return remote;
      }
    } catch (error) {
      console.warn("[WorkspaceMemory] Remote load failed:", error.message);
    }

    return local;
  }

  async function savePageState(pageKey = getPageKey(), patch = {}, options = {}) {
    const info = getWorkspaceInfo();
    if (!info?.id) return null;

    const current = options.replace ? {} : (runtime.pageState || readLocal(pageKey, info.id) || {});
    const next = options.replace ? patch : deepMerge(current, patch);
    next.updated_at = new Date().toISOString();
    runtime.pageState = next;
    writeLocal(pageKey, info.id, next);

    if (isCloudReady()) {
      try {
        await apiFetch(`/api/workspaces/${encodeURIComponent(info.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            pageKey,
            state: next,
            title: info.title,
            meta: { title: info.title, site: info.site },
          }),
        });
      } catch (error) {
        console.warn("[WorkspaceMemory] Remote save failed:", error.message);
      }
    }

    return next;
  }

  function controlKey(control) {
    return control.id || control.name || "";
  }

  function shouldPersistControl(control) {
    if (!control || control.disabled || control.dataset.noWorkspaceMemory === "true") return false;
    const key = controlKey(control);
    if (!key) return false;
    const type = String(control.type || "").toLowerCase();
    return type !== "password" && type !== "hidden";
  }

  function collectControls(root = document) {
    return Array.from(root.querySelectorAll("input, select, textarea")).filter(shouldPersistControl);
  }

  function escapeAttributeValue(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function findControl(root, key) {
    const value = String(key || "");
    if (!value) return null;
    if (window.CSS?.escape) {
      return root.querySelector(`#${CSS.escape(value)}`) ||
        root.querySelector(`[name="${escapeAttributeValue(value)}"]`);
    }
    return root.querySelector(`[id="${escapeAttributeValue(value)}"]`) ||
      root.querySelector(`[name="${escapeAttributeValue(value)}"]`);
  }

  function collectFieldState(root = document) {
    const fields = {};
    collectControls(root).forEach((control) => {
      const key = controlKey(control);
      const type = String(control.type || control.tagName || "").toLowerCase();
      if (type === "file") return;
      fields[key] = {
        tag: control.tagName.toLowerCase(),
        type,
        value: type === "checkbox" || type === "radio" ? undefined : control.value,
        checked: type === "checkbox" || type === "radio" ? control.checked : undefined,
      };
    });
    return fields;
  }

  function dispatchRestoredEvents(control) {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restoreFieldState(fields = {}, root = document) {
    Object.entries(fields || {}).forEach(([key, saved]) => {
      const control = findControl(root, key);
      if (!control || !shouldPersistControl(control)) return;
      const type = String(control.type || "").toLowerCase();
      if (type === "file") return;
      if (type === "checkbox" || type === "radio") control.checked = Boolean(saved.checked);
      else control.value = saved.value ?? "";
      dispatchRestoredEvents(control);
    });
  }

  async function uploadFile(file, options = {}) {
    const info = getWorkspaceInfo();
    if (!info?.id || !file || !isCloudReady()) return null;
    const pageKey = options.pageKey || runtime.pageKey || getPageKey();
    const form = new FormData();
    form.append("file", file, file.name || "file");
    form.append("pageKey", pageKey);
    form.append("fieldKey", options.fieldKey || "");
    const payload = await apiFetch(`/api/workspaces/${encodeURIComponent(info.id)}/files`, {
      method: "POST",
      body: form,
      headers: {},
    });
    return payload?.file || null;
  }

  async function fileFromRecord(fileRecord) {
    if (!fileRecord?.url) return null;
    const response = await fetch(fileRecord.url, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load saved file");
    const blob = await response.blob();
    return new File([blob], fileRecord.name || "saved-file", {
      type: fileRecord.type || blob.type || "application/octet-stream",
      lastModified: Date.now(),
    });
  }

  function setInputFile(input, file) {
    if (!input || !file || typeof DataTransfer === "undefined") return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return true;
  }

  async function restoreFileInputs(files = {}, root = document) {
    const entries = Object.entries(files || {});
    for (const [key, fileRecord] of entries) {
      const input = findControl(root, key);
      if (!input || String(input.type || "").toLowerCase() !== "file") continue;
      try {
        const file = await fileFromRecord(fileRecord);
        if (setInputFile(input, file)) {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (error) {
        console.warn("[WorkspaceMemory] File restore failed:", key, error.message);
      }
    }
  }

  function scheduleSave(root = document, pageKey = runtime.pageKey || getPageKey()) {
    if (runtime.restoring) return;
    clearTimeout(runtime.saveTimer);
    runtime.saveTimer = setTimeout(() => {
      savePageState(pageKey, { fields: collectFieldState(root) }).catch((error) => {
        console.warn("[WorkspaceMemory] Auto save failed:", error.message);
      });
    }, SAVE_DELAY);
  }

  async function handleFileChange(event, root, pageKey) {
    if (runtime.restoring) return;
    const input = event.target;
    if (!input || String(input.type || "").toLowerCase() !== "file" || !input.files?.[0]) return;
    try {
      const fileRecord = await uploadFile(input.files[0], { pageKey, fieldKey: controlKey(input) });
      if (!fileRecord) return;
      await savePageState(pageKey, {
        fields: collectFieldState(root),
        files: {
          [controlKey(input)]: fileRecord,
        },
      });
    } catch (error) {
      console.warn("[WorkspaceMemory] File upload failed:", error.message);
    }
  }

  function shouldAutoBindPage() {
    const path = window.location.pathname.toLowerCase();
    return !path.includes("/pages/login/") && !path.includes("/pages/admin/");
  }

  async function autoBindPage(options = {}) {
    if (runtime.bound || !shouldAutoBindPage()) return null;
    runtime.bound = true;
    runtime.pageKey = options.pageKey || getPageKey();
    runtime.workspaceId = getWorkspaceInfo()?.id || "";
    if (!runtime.workspaceId) return null;

    if (window.AtlasAuth?.initialize) {
      await window.AtlasAuth.initialize().catch(() => {});
    }

    const root = options.root || document;
    const pageState = await loadPageState(runtime.pageKey);
    runtime.pageState = pageState || {};

    runtime.restoring = true;
    restoreFieldState(runtime.pageState.fields, root);
    await restoreFileInputs(runtime.pageState.files, root);
    runtime.restoring = false;

    root.addEventListener("input", (event) => {
      if (!shouldPersistControl(event.target)) return;
      scheduleSave(root, runtime.pageKey);
    }, true);

    root.addEventListener("change", (event) => {
      if (!shouldPersistControl(event.target)) return;
      if (String(event.target.type || "").toLowerCase() === "file") {
        handleFileChange(event, root, runtime.pageKey);
        return;
      }
      scheduleSave(root, runtime.pageKey);
    }, true);

    window.dispatchEvent(new CustomEvent("atlas-workspace-memory-ready", {
      detail: {
        pageKey: runtime.pageKey,
        workspaceId: runtime.workspaceId,
        state: runtime.pageState,
      },
    }));

    return runtime.pageState;
  }

  window.AtlasWorkspaceMemory = {
    autoBindPage,
    collectFieldState,
    getPageKey,
    getWorkspaceInfo,
    loadPageState,
    loadWorkspace,
    loadWorkspaceManifest,
    localKey,
    savePageState,
    saveWorkspaceMeta,
    uploadFile,
  };

  document.addEventListener("DOMContentLoaded", () => {
    autoBindPage().catch((error) => {
      console.warn("[WorkspaceMemory] Auto bind skipped:", error.message);
    });
  });
})();
