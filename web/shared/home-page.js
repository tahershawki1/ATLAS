(function () {
  const VERSION_URL = "/version.json";
  const CURRENT_VERSION_KEY = "atlasCurrentVersionKey";
  const REFRESH_PENDING_KEY = "atlasRefreshPending";
  const AUTO_RELOAD_VERSION_KEY = "atlasAutoReloadedVersionKey";
  const VERSION_CHECK_INTERVAL = 2 * 60 * 1000;

  function getBanner() {
    return document.getElementById("updateBanner");
  }

  function hideUpdateBanner() {
    getBanner()?.classList.remove("show");
  }

  function showUpdateBanner() {
    getBanner()?.classList.add("show");
  }

  function buildVersionKey(payload) {
    if (!payload) return "";
    return [
      payload.cache_version || "",
      payload.web_version || "",
      payload.mobile_version || "",
      payload.build_number || "",
      payload.last_updated || "",
    ].join("|");
  }

  async function fetchVersionKey() {
    const url = new URL(VERSION_URL, window.location.origin);
    url.searchParams.set("t", Date.now().toString());
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error("Version check failed");
    return buildVersionKey(await response.json());
  }

  async function rememberCurrentVersion() {
    try {
      const versionKey = await fetchVersionKey();
      if (versionKey) localStorage.setItem(CURRENT_VERSION_KEY, versionKey);
      return versionKey;
    } catch (error) {
      console.warn("[PWA] Version remember skipped:", error.message);
      return "";
    }
  }

  async function checkForAtlasUpdate({ silent = true } = {}) {
    try {
      const versionKey = await fetchVersionKey();
      if (!versionKey) return false;

      const currentKey = localStorage.getItem(CURRENT_VERSION_KEY);
      if (!currentKey) {
        localStorage.setItem(CURRENT_VERSION_KEY, versionKey);
        hideUpdateBanner();
        return false;
      }

      const hasUpdate = currentKey !== versionKey;
      if (hasUpdate) showUpdateBanner();
      else hideUpdateBanner();
      return hasUpdate;
    } catch (error) {
      if (!silent) console.warn("[PWA] Update check failed:", error.message);
      return false;
    }
  }

  async function deleteAtlasCaches() {
    if (!("caches" in window)) return;
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("atlas-"))
        .filter((name) => name !== "atlas-shared-files-v1")
        .map((name) => caches.delete(name)),
    );
  }

  async function unregisterServiceWorkers() {
    if (!("serviceWorker" in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  async function confirmRefresh() {
    const message = "سيتم مسح كاش ATLAS وإعادة تحميل أحدث نسخة من الموقع. هل تريد المتابعة؟";
    if (!window.AtlasDialog) return window.confirm(message);

    return window.AtlasDialog.confirm(message, {
      title: "تحديث الموقع",
      confirmText: "تحديث الآن",
      cancelText: "إلغاء",
    });
  }

  async function handleCacheUpdated(versionKey) {
    if (!versionKey) return;
    localStorage.setItem(CURRENT_VERSION_KEY, versionKey);
    hideUpdateBanner();

    if (sessionStorage.getItem(AUTO_RELOAD_VERSION_KEY) === versionKey) return;
    sessionStorage.setItem(AUTO_RELOAD_VERSION_KEY, versionKey);

    const freshUrl = new URL(window.location.href);
    freshUrl.searchParams.set("cache", Date.now().toString());
    window.location.replace(freshUrl.toString());
  }

  async function showRefreshError() {
    const message = "تعذر مسح الكاش تلقائيًا. جرّب إغلاق التطبيق وفتحه مرة أخرى.";
    if (window.AtlasDialog) {
      await window.AtlasDialog.alert(message, { title: "تعذر التحديث" });
      return;
    }
    window.alert(message);
  }

  async function forceRefreshAtlasApp(button) {
    const confirmed = await confirmRefresh();
    if (!confirmed) return;

    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "جاري التحديث...";
    }
    hideUpdateBanner();

    try {
      sessionStorage.setItem(REFRESH_PENDING_KEY, "1");
      await deleteAtlasCaches();
      await unregisterServiceWorkers();
      await rememberCurrentVersion();

      const freshUrl = new URL("/index.html", window.location.origin);
      freshUrl.searchParams.set("refresh", Date.now().toString());
      window.location.replace(freshUrl.toString());
    } catch (error) {
      console.error("[PWA] Force refresh failed:", error);
      sessionStorage.removeItem(REFRESH_PENDING_KEY);
      await showRefreshError();
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "تحديث الموقع ومسح الكاش";
      }
    }
  }

  window.forceRefreshAtlasApp = forceRefreshAtlasApp;

  document.addEventListener("DOMContentLoaded", async () => {
    if (sessionStorage.getItem(REFRESH_PENDING_KEY) === "1") {
      sessionStorage.removeItem(REFRESH_PENDING_KEY);
      hideUpdateBanner();
      await rememberCurrentVersion();
    } else {
      await checkForAtlasUpdate();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "ATLAS_CACHE_UPDATED") {
          handleCacheUpdated(event.data.versionKey).catch((error) => {
            console.warn("[PWA] Auto cache refresh failed:", error.message);
          });
        }
      });

      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          console.log("[PWA] Service Worker registered");
          registration.update().catch(() => {});
          setInterval(() => {
            registration.update().catch(() => {});
            checkForAtlasUpdate().catch(() => {});
          }, VERSION_CHECK_INTERVAL);
        })
        .catch((error) => {
          console.warn("[PWA] Service Worker registration skipped:", error.message);
        });
    } else {
      setInterval(() => checkForAtlasUpdate().catch(() => {}), VERSION_CHECK_INTERVAL);
    }
  });
})();
