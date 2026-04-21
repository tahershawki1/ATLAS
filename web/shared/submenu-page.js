(function () {
  function getSelectedSiteSummary() {
    const raw = localStorage.getItem("selectedSite");
    if (!raw) return "لم يتم اختيار موقع بعد";

    try {
      const site = JSON.parse(raw);
      const company = String(site?.company || "").trim();
      const plot = String(site?.plot || "").trim();
      if (company && plot) return `${company} - ${plot}`;
      if (plot) return plot;
    } catch (error) {
      console.warn("Failed to read selected site", error);
    }

    return "لم يتم اختيار موقع بعد";
  }

  function updateSelectedSiteSummary() {
    const node = document.getElementById("selectedSiteSummary");
    if (!node) return;

    const summary = getSelectedSiteSummary();
    node.textContent = summary;
    node.classList.toggle("is-empty", summary === "لم يتم اختيار موقع بعد");
  }

  function goToAction(actionId) {
    if (!actionId) return;

    const targetUrl = new URL("../../index.html", window.location.href);
    targetUrl.searchParams.set("action", actionId);
    targetUrl.searchParams.set("returnTo", `${window.location.pathname}${window.location.search}`);
    window.location.href = targetUrl.toString();
  }

  window.AtlasSubmenuPage = {
    goToAction,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    updateSelectedSiteSummary();

    if (!window.AtlasAuth) return;

    await window.AtlasAuth.initialize();
    const permission = document.body.dataset.pagePermission || "pages.home";
    const allowed = await window.AtlasAuth.requirePageAccess(permission);
    if (!allowed) return;

    window.AtlasAuth.decorateShell({ homeOnly: false });
    window.AtlasAuth.applyPagePermissions();
  });
})();
