const app = {
  state: {
    currentPage: "workspace",
    history: ["workspace"],
    selectedSite: null,
    workspaceDraftSite: null,
    pendingAction: null,
    routeBackUrl: null,
    currentSelection: { companyId: null, area: null, plotId: null, plotIndex: null },
    pendingSites: [],
    customSiteDb: [],
    workspaces: [],
  },

  // Data will be loaded from SITES_DB (sites_data.js)
  data: {
    companies: [],
  },

  storageKeys: {
    selectedSite: "selectedSite",
    pendingSites: "pendingSites",
    customSitesDb: "atlasCustomSitesDb",
    workspaces: "atlasWorkspaces",
  },

  pages: {
    workspace: { id: "workspacePage", title: "ملفات العمل" },
    home: { id: "homePage", title: "الرئيسية" },
    action: { id: "actionPage", title: "العمل" },
  },

  deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  normalizeValue(value) {
    return String(value ?? "").trim();
  },

  isUsableValue(value) {
    const normalized = this.normalizeValue(value);
    return normalized && normalized !== "0" && normalized !== "-";
  },

  uniqueValues(values = []) {
    const seen = new Set();
    const result = [];

    values.forEach((value) => {
      const normalized = this.normalizeValue(value);
      const key = normalized.toLowerCase();
      if (!this.isUsableValue(normalized) || seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    });

    return result;
  },

  readJsonStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Failed to parse stored data", key, error);
      return fallback;
    }
  },

  writeJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  loadWorkspaces() {
    const stored = this.readJsonStorage(this.storageKeys.workspaces, []);
    this.state.workspaces = Array.isArray(stored) ? stored : [];
  },

  saveWorkspaces() {
    this.writeJsonStorage(this.storageKeys.workspaces, this.state.workspaces);
  },

  buildWorkspaceId(site) {
    if (site?.workspace_id) return site.workspace_id;
    const project = this.normalizeValue(site?.project_name || site?.workspace_title).toLowerCase();
    const company = this.normalizeValue(site?.company).toLowerCase();
    const plot = this.normalizeValue(site?.plot).toLowerCase();
    const report = this.normalizeValue(site?.source_report_id || site?.report_number_in_month).toLowerCase();
    const base = [project, company, plot, report].filter(Boolean).join("__");
    if (base) {
      return base
        .replace(/[^\w\u0600-\u06ff.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90);
    }
    return `workspace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  },

  formatWorkspaceTitle(site) {
    const explicitTitle = this.normalizeValue(site?.workspace_title || site?.project_name);
    if (explicitTitle) return explicitTitle;
    const plot = this.normalizeValue(site?.plot);
    const company = this.normalizeValue(site?.company);
    if (!plot && !company) return "ملف عمل بدون موقع";
    return company ? `${plot} - ${company}` : plot;
  },

  updateSelectedSiteHeader() {
    const siteName = document.getElementById("siteName");
    const siteCompany = document.getElementById("siteCompany");
    if (!siteName || !siteCompany) {
      this.renderWorkspaceTools();
      return;
    }

    siteName.textContent = this.state.selectedSite?.plot || "بدون رقم أرض";
    siteCompany.textContent =
      this.state.selectedSite?.company ||
      this.state.selectedSite?.project_name ||
      this.state.selectedSite?.workspace_title ||
      "ملف عمل";
    this.renderWorkspaceTools();
  },

  renderWorkspaceTools() {
    const toolsPanel = document.getElementById("toolsPanel");
    const activeTitle = document.getElementById("activeWorkspaceTitle");
    const activeMeta = document.getElementById("activeWorkspaceMeta");
    const hasWorkspace = Boolean(this.state.selectedSite);

    document.body?.classList.toggle("atlas-workspace-ready", hasWorkspace);
    document.body?.classList.toggle("atlas-workspace-landing", !hasWorkspace);

    if (toolsPanel) toolsPanel.hidden = !hasWorkspace;
    if (!hasWorkspace) {
      if (activeTitle) activeTitle.textContent = "لم يتم اختيار موقع";
      if (activeMeta) activeMeta.textContent = "اختر ملف عمل لعرض الأدوات.";
      return;
    }

    if (activeTitle) {
      activeTitle.textContent = this.formatWorkspaceTitle(this.state.selectedSite);
    }
    if (activeMeta) {
      activeMeta.textContent = [
        this.state.selectedSite.plot && `رقم الأرض: ${this.state.selectedSite.plot}`,
        this.state.selectedSite.company && `الشركة: ${this.state.selectedSite.company}`,
        this.state.selectedSite.area && `المنطقة: ${this.state.selectedSite.area}`,
        this.state.selectedSite.project && `مشروع الموقع: ${this.state.selectedSite.project}`,
        this.state.selectedSite.owner && `المالك: ${this.state.selectedSite.owner}`,
      ].filter(Boolean).join(" - ") || "ملف عمل جاهز";
    }
  },

  async renderUploadedPageCards() {
    const grid = document.querySelector("#toolsPanel .grid-menu");
    if (!grid || !window.AtlasAuth?.getDynamicPages) return;

    grid.querySelectorAll("[data-uploaded-page-card]").forEach((node) => node.remove());

    let pages = [];
    try {
      pages = await window.AtlasAuth.getDynamicPages();
    } catch (error) {
      console.warn("Failed to load uploaded page cards", error);
      return;
    }

    const refreshCard = grid.querySelector(".refresh-cache-card");
    pages
      .filter((page) => window.AtlasAuth.canAccess(page.id))
      .forEach((page) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "menu-card uploaded-page-card";
        button.dataset.uploadedPageCard = "true";
        button.setAttribute("data-permission", page.id);
        button.addEventListener("click", () => {
          window.location.href = page.url || `/published/${page.slug}/`;
        });

        const icon = document.createElement("div");
        icon.className = "icon-wrapper uploaded-icon";
        icon.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16v16H4z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        `;

        const label = document.createElement("span");
        label.className = "card-label";
        label.textContent = page.label || page.slug;

        button.append(icon, label);
        grid.insertBefore(button, refreshCard || null);
      });

    window.AtlasAuth.applyPagePermissions(grid);
  },

  upsertWorkspaceFromSelectedSite() {
    if (!this.state.selectedSite) return null;

    const now = new Date().toISOString();
    const workspaceId = this.state.selectedSite.workspace_id || this.buildWorkspaceId(this.state.selectedSite);
    const existing = this.state.workspaces.find((workspace) => workspace.id === workspaceId);
    const next = {
      id: workspaceId,
      title: this.formatWorkspaceTitle(this.state.selectedSite),
      site: {
        ...this.state.selectedSite,
        workspace_id: workspaceId,
      },
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    this.state.selectedSite = next.site;
    this.writeJsonStorage(this.storageKeys.selectedSite, this.state.selectedSite);
    this.state.workspaces = [
      next,
      ...this.state.workspaces.filter((workspace) => workspace.id !== workspaceId),
    ].slice(0, 30);
    this.saveWorkspaces();
    this.renderWorkspaces();
    return next;
  },

  renderWorkspaces() {
    const list = document.getElementById("workspaceList");
    const empty = document.getElementById("workspaceEmpty");
    if (!list || !empty) return;

    const query = this.normalizeValue(document.getElementById("workspaceArchiveSearch")?.value).toLowerCase();
    const workspaces = query
      ? this.state.workspaces.filter((workspace) => {
          const site = workspace.site || {};
          return [
            workspace.title,
            site.workspace_title,
            site.project_name,
            site.project,
            site.plot,
            site.company,
            site.area,
            site.details,
          ]
            .map((value) => this.normalizeValue(value).toLowerCase())
            .some((value) => value.includes(query));
        })
      : this.state.workspaces;

    list.replaceChildren();
    empty.hidden = workspaces.length > 0;

    workspaces.forEach((workspace) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "workspace-card";
      if (workspace.id === this.state.selectedSite?.workspace_id) {
        card.classList.add("active");
      }

      const title = document.createElement("strong");
      title.textContent = workspace.title || this.formatWorkspaceTitle(workspace.site);

      const details = document.createElement("span");
      details.textContent = [
        workspace.site?.plot && `أرض ${workspace.site.plot}`,
        workspace.site?.company,
        workspace.site?.area,
        workspace.site?.work_type && this.getWorkspaceWorkTypeLabel(workspace.site.work_type),
        workspace.updated_at ? new Date(workspace.updated_at).toLocaleDateString("ar") : "",
      ].filter(Boolean).join(" - ");

      card.append(title, details);
      card.addEventListener("click", () => this.openWorkspace(workspace.id));
      list.appendChild(card);
    });
    this.renderWorkspaceTools();
  },

  openWorkspace(workspaceId) {
    const workspace = this.state.workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace?.site) return;

    this.state.selectedSite = {
      ...workspace.site,
      workspace_id: workspace.id,
    };
    this.writeJsonStorage(this.storageKeys.selectedSite, this.state.selectedSite);
    this.updateSelectedSiteHeader();
    this.upsertWorkspaceFromSelectedSite();
    this.showToast("تم فتح ملف العمل");
    this.openWorkspaceTools();
  },

  startNewWorkspace() {
    this.resetWorkspaceForm({ keepDraft: false });
    this.state.currentPage = "workspace";
    this.state.history = ["workspace"];
    this.render();
    document.getElementById("workspaceProjectName")?.focus();
  },

  openWorkspaceTools() {
    this.state.currentPage = "home";
    this.state.history = ["workspace", "home"];
    this.render();
  },

  goToWorkspaceManager() {
    this.state.currentPage = "workspace";
    this.state.history = ["workspace"];
    this.render();
    this.renderWorkspaces();
  },

  getWorkspaceWorkTypeLabel(type) {
    const labels = {
      survey: "رفع مساحي",
      check: "تشييك",
      staking: "توقيع",
      level: "مناسيب / Level",
      general: "عام",
    };
    return labels[type] || "عام";
  },

  resetWorkspaceForm({ keepDraft = false } = {}) {
    const today = new Date().toISOString().split("T")[0];
    const fields = {
      workspaceProjectName: "",
      workspaceWorkType: "survey",
      workspaceStartDate: today,
      workspaceSiteSearch: "",
      workspaceDetails: "",
      workspaceArchiveSearch: "",
    };
    Object.entries(fields).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.value = value;
    });
    if (!keepDraft) this.state.workspaceDraftSite = null;
    this.renderWorkspaceDraftSite();
    this.searchWorkspaceSites();
    this.renderWorkspaces();
  },

  buildSiteRecordFromPlot(company, plot, plotIndex = null) {
    const meta = {
      area: plot?.area || "",
      owner: plot?.owner || "",
      consultant: plot?.consultant || "",
      project: plot?.project || "",
      contractor: plot?.contractor || "",
      report_year: plot?.report_year || "",
      report_month: plot?.report_month || "",
      report_number_in_month: plot?.report_number_in_month || "",
      source_report_id: plot?.source_report_id || "",
      survey_date: plot?.survey_date || "",
      subject: plot?.subject || "",
      surveyor: plot?.surveyor || "",
      levels: plot?.levels || [],
    };
    return {
      company: company?.name || "",
      company_id: String(company?.id || ""),
      plot: plot?.id || "",
      plot_index: plotIndex,
      ...meta,
    };
  },

  renderWorkspaceDraftSite() {
    const card = document.getElementById("workspaceSelectedSiteCard");
    if (!card) return;
    const site = this.state.workspaceDraftSite;
    card.classList.toggle("is-empty", !site);
    if (!site) {
      card.textContent = "لم يتم اختيار موقع. يمكنك إنشاء ملف العمل بدون رقم أرض.";
      return;
    }
    card.innerHTML = `
      <strong>${this.escapeHtml(site.plot || "بدون رقم أرض")}</strong>
      <span>${this.escapeHtml([site.company, site.area, site.project].filter(Boolean).join(" - ") || "موقع مختار")}</span>
    `;
  },

  clearWorkspaceDraftSite() {
    this.state.workspaceDraftSite = null;
    const input = document.getElementById("workspaceSiteSearch");
    if (input) input.value = "";
    this.renderWorkspaceDraftSite();
    this.searchWorkspaceSites();
    this.showToast("سيتم إنشاء ملف العمل بدون موقع");
  },

  openWorkspaceSitePicker() {
    this.showSiteSelector("__workspace_select__");
  },

  getWorkspaceSiteMatches(query) {
    const normalizedQuery = this.normalizeValue(query).toLowerCase();
    if (!normalizedQuery) return [];
    const matches = [];
    this.data.companies.forEach((company) => {
      (company.plots || []).forEach((plot, plotIndex) => {
        const haystack = [
          plot.id,
          plot.area,
          plot.owner,
          plot.project,
          plot.source_report_id,
          company.name,
        ]
          .map((value) => this.normalizeValue(value).toLowerCase())
          .join(" ");
        if (!haystack.includes(normalizedQuery)) return;
        matches.push({ company, plot, plotIndex });
      });
    });
    return matches.slice(0, 12);
  },

  searchWorkspaceSites() {
    const resultsHost = document.getElementById("workspaceSiteResults");
    if (!resultsHost) return;
    const query = document.getElementById("workspaceSiteSearch")?.value || "";
    const results = this.getWorkspaceSiteMatches(query);
    resultsHost.replaceChildren();

    if (!this.normalizeValue(query)) {
      resultsHost.innerHTML = '<div class="workspace-search-hint">ابدأ بكتابة رقم الأرض أو اسم المنطقة للبحث.</div>';
      return;
    }

    if (!results.length) {
      resultsHost.innerHTML = '<div class="workspace-search-hint">لم يتم العثور على رقم الأرض. يمكنك المتابعة بدون موقع.</div>';
      return;
    }

    results.forEach(({ company, plot, plotIndex }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "workspace-site-result";
      button.innerHTML = `
        <strong>${this.escapeHtml(this.formatPlotLabel(plot))}</strong>
        <span>${this.escapeHtml([company.name, plot.area, plot.project].filter(Boolean).join(" - "))}</span>
      `;
      button.addEventListener("click", () => {
        this.state.workspaceDraftSite = this.buildSiteRecordFromPlot(company, plot, plotIndex);
        this.renderWorkspaceDraftSite();
        resultsHost.replaceChildren();
        this.showToast("تم اختيار الموقع لملف العمل");
      });
      resultsHost.appendChild(button);
    });
  },

  createWorkspaceFromForm(options = {}) {
    const projectName = this.normalizeValue(document.getElementById("workspaceProjectName")?.value);
    const workType = this.normalizeValue(document.getElementById("workspaceWorkType")?.value) || "general";
    const startDate = this.normalizeValue(document.getElementById("workspaceStartDate")?.value);
    const details = this.normalizeValue(document.getElementById("workspaceDetails")?.value);
    const draftSite = options.withoutSite ? null : this.state.workspaceDraftSite;
    const fallbackTitle = draftSite ? this.formatWorkspaceTitle(draftSite) : "";
    const title = projectName || fallbackTitle;

    if (!title) {
      this.showToast("اكتب اسم المشروع أو اختر موقعًا قبل إنشاء ملف العمل");
      document.getElementById("workspaceProjectName")?.focus();
      return;
    }

    const workspaceId = `workspace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.state.selectedSite = {
      ...(draftSite || {}),
      workspace_id: workspaceId,
      workspace_title: title,
      project_name: projectName || title,
      work_type: workType,
      start_date: startDate,
      details,
      is_workspace_only: !draftSite,
    };
    this.writeJsonStorage(this.storageKeys.selectedSite, this.state.selectedSite);
    this.upsertWorkspaceFromSelectedSite();
    this.updateSelectedSiteHeader();
    this.showToast("تم إنشاء ملف العمل");
    this.openWorkspaceTools();
  },

  escapeHtml(value) {
    return this.normalizeValue(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  async loadCustomSiteDb() {
    if (window.AtlasStore?.loadCustomSites) {
      try {
        const remoteSites = await window.AtlasStore.loadCustomSites();
        return Array.isArray(remoteSites) ? remoteSites : [];
      } catch (error) {
        console.warn("Failed to load custom site DB from shared store", error);
      }
    }

    const raw = localStorage.getItem(this.storageKeys.customSitesDb);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Failed to parse custom site DB", error);
      return [];
    }
  },

  async saveCustomSiteDb({ silent = false } = {}) {
    localStorage.setItem(
      this.storageKeys.customSitesDb,
      JSON.stringify(this.state.customSiteDb),
    );

    if (window.AtlasStore?.saveCustomSites) {
      if (window.AtlasAuth && !window.AtlasAuth.canAccess("sites.write")) {
        if (!silent) this.showToast("لا توجد صلاحية لحفظ بيانات المواقع على الخادم");
        return false;
      }

      try {
        await window.AtlasStore.saveCustomSites(this.state.customSiteDb);
      } catch (error) {
        console.warn("Failed to sync custom site DB", error);
        if (!silent) this.showToast("تعذر حفظ بيانات المواقع على الخادم، وتم حفظها محلياً");
        return false;
      }
    }

    return true;
  },

  mergeReferences(baseRefs = {}, customRefs = {}) {
    const fields = [
      "area",
      "consultant",
      "contractor",
      "report_year",
      "report_month",
      "subject",
      "surveyor",
    ];
    const merged = {};

    fields.forEach((field) => {
      merged[field] = this.uniqueValues([
        ...(baseRefs[field] || []),
        ...(customRefs[field] || []),
      ]);
    });

    return merged;
  },

  mergePlots(basePlots = [], customPlots = []) {
    const map = new Map();
    const order = [];

    const getMergeKey = (plot, source, index) => {
      const id = this.normalizeValue(plot?.id);
      const reportKey =
        this.normalizeValue(plot?.source_report_id) ||
        this.normalizeValue(plot?.report_number_in_month) ||
        this.normalizeValue(plot?.survey_date) ||
        `${source}-${index}`;
      return id ? `${id}::${reportKey}` : "";
    };

    const addPlot = (plot, source, index) => {
      if (!plot) return;
      const key = getMergeKey(plot, source, index);
      if (!key) return;
      if (!map.has(key)) order.push(key);
      map.set(key, {
        ...this.deepClone(plot),
        _source: source,
      });
    };

    basePlots.forEach((plot, index) => addPlot(plot, "base", index));
    customPlots.forEach((plot, index) => addPlot(plot, "custom", index));

    return order.map((key) => map.get(key));
  },

  mergeCompanies(baseCompanies = [], customCompanies = []) {
    const merged = this.deepClone(baseCompanies);

    customCompanies.forEach((customCompany) => {
      const target =
        merged.find((company) => String(company.id) === String(customCompany.id)) ||
        merged.find(
          (company) =>
            this.normalizeValue(company.name).toLowerCase() ===
            this.normalizeValue(customCompany.name).toLowerCase(),
        );

      if (target) {
        target.plots = this.mergePlots(
          target.plots || [],
          customCompany.plots || [],
        );
        target.references = this.mergeReferences(
          target.references || {},
          customCompany.references || {},
        );
        if (customCompany.is_custom) target.is_custom = true;
        return;
      }

      merged.push({
        id: customCompany.id,
        name: customCompany.name,
        plots: this.deepClone(customCompany.plots || []),
        references: this.mergeReferences({}, customCompany.references || {}),
        is_custom: Boolean(customCompany.is_custom),
      });
    });

    return merged;
  },

  refreshCompaniesData() {
    const baseCompanies =
      typeof SITES_DB !== "undefined" && Array.isArray(SITES_DB) ? SITES_DB : [];
    this.data.companies = this.mergeCompanies(
      baseCompanies,
      this.state.customSiteDb,
    );
  },

  findCompanyById(companyId) {
    return this.data.companies.find(
      (company) => String(company.id) === String(companyId),
    );
  },

  formatPlotLabel(plot) {
    const reportId = this.normalizeValue(plot?.source_report_id);
    const reportDate = this.normalizeValue(plot?.survey_date);
    const suffix = [reportId && `#${reportId}`, reportDate].filter(Boolean).join(" - ");
    return suffix ? `${plot.id} (${suffix})` : String(plot?.id || "");
  },

  findPlotBySelection(companyId, plotId, plotIndex = null) {
    const company = this.findCompanyById(companyId);
    if (!company) return null;

    const numericIndex = Number.parseInt(plotIndex, 10);
    if (Number.isInteger(numericIndex) && company.plots?.[numericIndex]) {
      return company.plots[numericIndex];
    }

    return company.plots?.find((plot) => String(plot.id) === String(plotId)) || null;
  },

  findCustomCompanyEntry(companyId) {
    return this.state.customSiteDb.find(
      (company) => String(company.id) === String(companyId),
    );
  },

  getOrCreateCustomCompanyEntry({ companyId, companyName, isCustom = false }) {
    let entry = this.findCustomCompanyEntry(companyId);

    if (!entry) {
      entry = {
        id: String(companyId),
        name: companyName,
        plots: [],
        references: {},
        is_custom: Boolean(isCustom),
      };
      this.state.customSiteDb.push(entry);
    }

    entry.name = companyName;
    entry.references = entry.references || {};
    entry.plots = entry.plots || [];
    if (isCustom) entry.is_custom = true;
    return entry;
  },

  getNextCompanyId() {
    const maxId = this.data.companies.reduce((max, company) => {
      const numericId = parseInt(company.id, 10);
      return Number.isFinite(numericId) ? Math.max(max, numericId) : max;
    }, 0);
    return String(maxId + 1);
  },

  getNextSourceReportId() {
    const maxId = this.data.companies.reduce((max, company) => {
      return (company.plots || []).reduce((plotMax, plot) => {
        const numericId = parseInt(plot.source_report_id, 10);
        return Number.isFinite(numericId) ? Math.max(plotMax, numericId) : plotMax;
      }, max);
    }, 0);

    return String(maxId + 1 || 1);
  },

  setDatalistOptions(listId, values) {
    const list = document.getElementById(listId);
    if (!list) return;

    list.innerHTML = this.uniqueValues(values)
      .map((value) => `<option value="${this.escapeHtml(value)}"></option>`)
      .join("");
  },

  getCompanyValues(company, fieldName) {
    if (!company) return [];

    const plotValues = (company.plots || []).map((plot) => plot[fieldName]);
    const referenceValues = company.references?.[fieldName] || [];
    return this.uniqueValues([...plotValues, ...referenceValues]);
  },

  getAllFieldValues(fieldName) {
    const values = [];
    this.data.companies.forEach((company) => {
      values.push(...this.getCompanyValues(company, fieldName));
    });
    return this.uniqueValues(values);
  },

  ensureInlineField(inputId) {
    const field = document.getElementById(inputId);
    if (!field) return null;
    if (field.parentElement?.classList.contains("form-field-inline")) {
      return field.parentElement;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "form-field-inline";
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);
    return wrapper;
  },

  ensureDatalist(inputId, listId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.setAttribute("list", listId);

    let list = document.getElementById(listId);
    if (!list) {
      list = document.createElement("datalist");
      list.id = listId;
      input.closest(".form-group-light")?.appendChild(list);
    }
  },

  ensureFieldButton(inputId, fieldName, title) {
    const wrapper = this.ensureInlineField(inputId);
    if (!wrapper) return;
    if (wrapper.querySelector(`button[data-field="${fieldName}"]`)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-add-btn company-dependent-add-btn hidden";
    button.dataset.field = fieldName;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.textContent = "+";
    button.onclick = () => this.addCompanyReference(fieldName);
    wrapper.appendChild(button);
  },

  enhanceNewSiteForm() {
    const reportNumberLabel = document
      .getElementById("newSiteReportNumberInMonth")
      ?.closest(".form-group-light")
      ?.querySelector("label");
    if (reportNumberLabel) reportNumberLabel.textContent = "رقم التعريف";

    const reportNumberInput = document.getElementById("newSiteReportNumberInMonth");
    if (reportNumberInput) {
      reportNumberInput.inputMode = "numeric";
      reportNumberInput.placeholder = "أدخل رقم التعريف";
    }

    const sourceReportInput = document.getElementById("newSiteSourceReportId");
    if (sourceReportInput) {
      sourceReportInput.readOnly = true;
      sourceReportInput.placeholder = "يتم توليده تلقائياً";
    }

    const surveyDateInput = document.getElementById("newSiteSurveyDate");
    if (surveyDateInput) {
      surveyDateInput.type = "date";
      surveyDateInput.removeAttribute("placeholder");
    }

    this.ensureDatalist("newSiteReportYear", "newSiteReportYearOptions");
    this.ensureDatalist("newSiteReportMonth", "newSiteReportMonthOptions");
    this.ensureDatalist("newSiteSubject", "newSiteSubjectOptions");
    this.ensureDatalist("newSiteSurveyor", "newSiteSurveyorOptions");

    const reportYearInput = document.getElementById("newSiteReportYear");
    if (reportYearInput) {
      reportYearInput.inputMode = "numeric";
      reportYearInput.placeholder = "اختر أو اكتب سنة التقرير";
    }

    const reportMonthInput = document.getElementById("newSiteReportMonth");
    if (reportMonthInput) {
      reportMonthInput.placeholder = "اختر أو اكتب شهر التقرير";
    }

    const subjectInput = document.getElementById("newSiteSubject");
    if (subjectInput) {
      subjectInput.placeholder = "اختر أو اكتب موضوع التقرير";
    }

    const surveyorInput = document.getElementById("newSiteSurveyor");
    if (surveyorInput) {
      surveyorInput.placeholder = "MR. ";
      if (!this.normalizeValue(surveyorInput.value)) {
        surveyorInput.value = "MR. ";
      }
      surveyorInput.addEventListener("blur", () => {
        const current = this.normalizeValue(surveyorInput.value);
        if (!current) {
          surveyorInput.value = "MR. ";
          return;
        }
        if (!current.toUpperCase().startsWith("MR.")) {
          surveyorInput.value = `MR. ${current.replace(/^MR\.?\s*/i, "")}`.trim();
        }
      });
    }

    this.ensureFieldButton("newSiteReportYear", "report_year", "حفظ سنة التقرير للشركة");
    this.ensureFieldButton("newSiteReportMonth", "report_month", "حفظ شهر التقرير للشركة");
    this.renderNewSiteLevelsRows();
  },

  createEmptyLevelRow(index = 1) {
    return {
      id: String(Date.now() + index),
      row_no: String(index),
      design_level: "",
      asbuilt_level: "",
      difference_value: "",
      remarks: "",
      extracted_at: new Date().toISOString(),
    };
  },

  getNewSiteLevelsRows() {
    const body = document.getElementById("newSiteLevelsBody");
    if (!body) return [];

    return Array.from(body.querySelectorAll("tr")).map((row, index) => {
      const getValue = (selector) =>
        this.normalizeValue(row.querySelector(selector)?.value);
      return {
        id: row.dataset.levelId || String(Date.now() + index),
        row_no: getValue(".level-row-no") || String(index + 1),
        design_level: getValue(".level-design"),
        asbuilt_level: getValue(".level-asbuilt"),
        difference_value: getValue(".level-diff"),
        remarks: getValue(".level-remarks"),
        extracted_at: new Date().toISOString(),
      };
    });
  },

  renderNewSiteLevelsRows(rows = []) {
    const body = document.getElementById("newSiteLevelsBody");
    if (!body) return;

    const workingRows = rows.length ? rows : [this.createEmptyLevelRow(1)];
    body.innerHTML = workingRows
      .map(
        (row, index) => `
          <tr data-level-id="${this.escapeHtml(row.id || String(Date.now() + index))}">
            <td><input class="level-row-no" type="text" value="${this.escapeHtml(row.row_no || String(index + 1))}" /></td>
            <td><input class="level-design" type="text" value="${this.escapeHtml(row.design_level || "")}" /></td>
            <td><input class="level-asbuilt" type="text" value="${this.escapeHtml(row.asbuilt_level || "")}" /></td>
            <td><input class="level-diff" type="text" value="${this.escapeHtml(row.difference_value || "")}" /></td>
            <td><input class="level-remarks" type="text" value="${this.escapeHtml(row.remarks || "")}" /></td>
            <td><button type="button" class="delete-row-btn" onclick="app.removeNewSiteLevelRow(this)">حذف</button></td>
          </tr>
        `,
      )
      .join("");
  },

  addNewSiteLevelRow() {
    const currentRows = this.getNewSiteLevelsRows();
    currentRows.push(this.createEmptyLevelRow(currentRows.length + 1));
    this.renderNewSiteLevelsRows(currentRows);
  },

  removeNewSiteLevelRow(buttonEl) {
    const row = buttonEl?.closest("tr");
    if (!row) return;
    row.remove();
    const rows = this.getNewSiteLevelsRows();
    if (!rows.length) {
      this.renderNewSiteLevelsRows();
      return;
    }
    this.renderNewSiteLevelsRows(
      rows.map((item, index) => ({ ...item, row_no: String(index + 1) })),
    );
  },

  consumeRequestedAction() {
    const url = new URL(window.location.href);
    const actionId = this.normalizeValue(url.searchParams.get("action"));
    const returnTo = this.normalizeValue(url.searchParams.get("returnTo"));

    this.state.routeBackUrl = null;
    if (actionId && returnTo) {
      try {
        this.state.routeBackUrl = new URL(returnTo, window.location.origin).toString();
      } catch (error) {
        console.warn("Invalid returnTo route", error);
      }
    }

    if (!actionId) return null;

    url.searchParams.delete("action");
    url.searchParams.delete("returnTo");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    return actionId;
  },

  canReturnToSourcePage() {
    return (
      this.state.currentPage === "action" &&
      Boolean(this.state.routeBackUrl) &&
      this.state.history.length <= 2
    );
  },

  returnToSourcePage() {
    if (!this.canReturnToSourcePage()) return false;
    window.location.href = this.state.routeBackUrl;
    return true;
  },

  async init() {
    console.log("Atlas App Initialized");
    this.state.customSiteDb = await this.loadCustomSiteDb();
    this.loadWorkspaces();
    this.refreshCompaniesData();
    this.populateCompanies();
    this.enhanceNewSiteForm();
    const startDateInput = document.getElementById("workspaceStartDate");
    if (startDateInput && !startDateInput.value) {
      startDateInput.value = new Date().toISOString().split("T")[0];
    }
    this.renderWorkspaceDraftSite();
    this.searchWorkspaceSites();

    // Load persisted site
    const saved = this.readJsonStorage(this.storageKeys.selectedSite, null);
    if (saved) {
      this.state.selectedSite = saved;
      this.updateSelectedSiteHeader();
      this.upsertWorkspaceFromSelectedSite();
    }

    // Load pending sites
    const pending = this.readJsonStorage(this.storageKeys.pendingSites, []);
    if (Array.isArray(pending) && pending.length) {
      this.state.pendingSites = pending;
      this.updateSyncBadge();
    }
    this.renderWorkspaces();
    await this.renderUploadedPageCards();

    // Network listeners
    window.addEventListener("online", () => this.syncPendingSites());
    if (navigator.onLine) this.syncPendingSites();

    this.render();
    if (window.AtlasAuth) {
      window.AtlasAuth.decorateShell();
      window.AtlasAuth.applyPagePermissions();
    }

    const requestedAction = this.consumeRequestedAction();
    if (requestedAction) this.action(requestedAction);
  },

  populateCompanies() {
    const list = document.getElementById("companyList");
    if (!list) return;
    list.innerHTML = "";
    this.data.companies.forEach((company) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = company.name;
      item.onclick = (e) => this.selectCompany(company.id, e);
      list.appendChild(item);
    });
  },

  selectCompany(companyId, e = null) {
    this.state.currentSelection.companyId = companyId;
    this.state.currentSelection.area = null;
    this.state.currentSelection.plotId = null;
    this.state.currentSelection.plotIndex = null;

    // UI update
    const items = document.querySelectorAll("#companyList .list-select-item");
    items.forEach((el) => el.classList.remove("selected"));
    if (e && e.currentTarget) e.currentTarget.classList.add("selected");

    this.populateAreas(companyId);
    this.modalStep(2);
  },

  populateAreas(companyId) {
    const list = document.getElementById("areaList");
    const company = this.data.companies.find((c) => c.id == companyId);
    if (!list || !company) return;

    list.innerHTML = "";
    // Get unique areas for this company
    const areas = [
      ...new Set(
        company.plots
          .map((p) => (p.area || "").trim())
          .filter((area) => area && area !== "0" && area !== "غير محدد"),
      ),
    ].sort();

    areas.forEach((area) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = area;
      item.onclick = (e) => this.selectArea(area, e);
      list.appendChild(item);
    });
  },

  selectArea(area, e) {
    this.state.currentSelection.area = area;
    this.state.currentSelection.plotId = null;
    this.state.currentSelection.plotIndex = null;

    // UI update
    const items = document.querySelectorAll("#areaList .list-select-item");
    items.forEach((el) => el.classList.remove("selected"));
    if (e && e.currentTarget) e.currentTarget.classList.add("selected");

    this.populatePlots(this.state.currentSelection.companyId, area);
    this.modalStep(3);
  },

  populatePlots(companyId, area) {
    const list = document.getElementById("plotList");
    const company = this.data.companies.find((c) => c.id == companyId);
    if (!list || !company) return;

    list.innerHTML = "";
    // Filter plots by selected area
    const filteredPlots = company.plots
      .map((plot, index) => ({ plot, index }))
      .filter(({ plot }) => {
        const plotArea = (plot.area || "").trim();
        return plotArea === area;
      });

    filteredPlots.forEach(({ plot, index }) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = this.formatPlotLabel(plot);
      item.onclick = (e) => this.selectPlot(plot.id, e, index);
      list.appendChild(item);
    });
  },

  selectPlot(plotId, e, plotIndex = null) {
    this.state.currentSelection.plotId = plotId;
    this.state.currentSelection.plotIndex = plotIndex;
    const company = this.findCompanyById(this.state.currentSelection.companyId);
    const plot = this.findPlotBySelection(
      this.state.currentSelection.companyId,
      plotId,
      plotIndex,
    );
    if (!company || !plot) {
      this.showToast("تعذر العثور على بيانات الموقع المحدد");
      return;
    }

    // UI update
    const items = document.querySelectorAll("#plotList .list-select-item");
    items.forEach((el) => el.classList.remove("selected"));
    if (e && e.currentTarget) e.currentTarget.classList.add("selected");

    // Update Summary
    document.getElementById("summaryCompany").textContent = company.name;
    document.getElementById("summaryArea").textContent =
      plot.area || "غير محدد";
    document.getElementById("summaryPlot").textContent = plot.id;

    // Store metadata
    this.state.currentSelection.metadata = {
      owner: plot.owner,
      consultant: plot.consultant,
      area: plot.area,
      project: plot.project,
      contractor: plot.contractor,
      report_year: plot.report_year,
      report_month: plot.report_month,
      report_number_in_month: plot.report_number_in_month,
      source_report_id: plot.source_report_id,
      survey_date: plot.survey_date,
      subject: plot.subject,
      surveyor: plot.surveyor,
      levels: plot.levels || [],
    };

    this.modalStep(4);
  },

  modalStep(step) {
    document
      .querySelectorAll(".modal-step")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById(`step${step}`).classList.add("active");
  },

  showSiteSelector(actionId = null) {
    this.state.pendingAction = actionId;
    this.modalStep(1); // Reset to step 1
    document.getElementById("siteModal").classList.add("active");
  },

  closeSiteModal() {
    document.getElementById("siteModal").classList.remove("active");
    this.state.pendingAction = null;
    // Hide search when closing
    document.getElementById("modalSearchBox").classList.remove("active");
    document.getElementById("siteSearchInput").value = "";
  },

  toggleSearch() {
    const box = document.getElementById("modalSearchBox");
    box.classList.toggle("active");
    if (box.classList.contains("active")) {
      document.getElementById("siteSearchInput").focus();
    }
  },

  filterBySearch() {
    const query = document
      .getElementById("siteSearchInput")
      .value.toLowerCase();
    if (!query) {
      this.populateCompanies();
      this.modalStep(1);
      return;
    }

    const results = [];
    this.data.companies.forEach((company) => {
      company.plots.forEach((plot, plotIndex) => {
        if (String(plot.id ?? "").toLowerCase().includes(query)) {
          results.push({
            companyName: company.name,
            companyId: company.id,
            plotIndex,
            plot: plot,
          });
        }
      });
    });

    // Display search results in the current step (or switch to a results list)
    this.modalStep(3); // Go to plot selection step to show results
    const list = document.getElementById("plotList");
    list.innerHTML = "";

    results.slice(0, 20).forEach((res) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      const companyLabel = document.createElement("small");
      companyLabel.style.display = "block";
      companyLabel.style.fontSize = "0.7rem";
      companyLabel.style.color = "var(--text-dim)";
      companyLabel.textContent = res.companyName;
      item.appendChild(companyLabel);
      item.appendChild(document.createTextNode(this.formatPlotLabel(res.plot)));
      item.onclick = (e) => {
        this.state.currentSelection.companyId = res.companyId;
        this.selectPlot(res.plot.id, e, res.plotIndex);
      };
      list.appendChild(item);
    });
  },

  showAddSite() {
    if (window.AtlasAuth && !window.AtlasAuth.canAccess("sites.write")) {
      this.showToast("لا توجد صلاحية لإضافة أو تعديل بيانات المواقع");
      return;
    }

    this.populateNewSiteSelectors();
    this.resetNewSiteForm();
    this.modalStep("Add");
  },

  resetNewSiteForm({ preserveCompany = false } = {}) {
    const companySelect = document.getElementById("newSiteCompany");
    const fieldIds = [
      "newSiteArea",
      "newSitePlot",
      "newSiteOwner",
      "newSiteConsultant",
      "newSiteProject",
      "newSiteContractor",
      "newSiteReportYear",
      "newSiteReportMonth",
      "newSiteReportNumberInMonth",
      "newSiteSurveyDate",
      "newSiteSubject",
      "newSiteSurveyor",
    ];

    if (companySelect && !preserveCompany) {
      companySelect.value = "";
    }

    fieldIds.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) field.value = "";
    });

    const surveyorInput = document.getElementById("newSiteSurveyor");
    if (surveyorInput) surveyorInput.value = "MR. ";

    this.toggleCompanyDependentAddButtons();
    this.populateGlobalNewSiteSuggestions();
    this.populateCompanySpecificSuggestions(null);
    this.updateNewSiteSourceReportId();
    this.renderNewSiteLevelsRows();
  },

  getCompanyFieldInput(fieldName) {
    const fieldMap = {
      area: "newSiteArea",
      consultant: "newSiteConsultant",
      contractor: "newSiteContractor",
      report_year: "newSiteReportYear",
      report_month: "newSiteReportMonth",
    };
    return document.getElementById(fieldMap[fieldName]);
  },

  getCompanyFieldLabel(fieldName) {
    const fieldLabels = {
      area: "المنطقة",
      consultant: "الاستشاري",
      contractor: "المقاول",
      report_year: "سنة التقرير",
      report_month: "شهر التقرير",
    };
    return fieldLabels[fieldName] || "القيمة";
  },

  toggleCompanyDependentAddButtons(companyId = "") {
    const customEntry = companyId ? this.findCustomCompanyEntry(companyId) : null;
    const shouldShow = Boolean(customEntry?.is_custom);
    document
      .querySelectorAll(".company-dependent-add-btn")
      .forEach((button) => button.classList.toggle("hidden", !shouldShow));
  },

  populateGlobalNewSiteSuggestions() {
    this.setDatalistOptions("newSiteSubjectOptions", this.getAllFieldValues("subject"));
    this.setDatalistOptions("newSiteSurveyorOptions", this.getAllFieldValues("surveyor"));
  },

  populateCompanySpecificSuggestions(company) {
    this.setDatalistOptions("newSiteAreaOptions", this.getCompanyValues(company, "area"));
    this.setDatalistOptions(
      "newSiteConsultantOptions",
      this.getCompanyValues(company, "consultant"),
    );
    this.setDatalistOptions(
      "newSiteContractorOptions",
      this.getCompanyValues(company, "contractor"),
    );
    this.setDatalistOptions(
      "newSiteReportYearOptions",
      this.getCompanyValues(company, "report_year"),
    );
    this.setDatalistOptions(
      "newSiteReportMonthOptions",
      this.getCompanyValues(company, "report_month"),
    );
  },

  updateNewSiteSourceReportId() {
    const sourceReportInput = document.getElementById("newSiteSourceReportId");
    if (!sourceReportInput) return;
    sourceReportInput.value = this.getNextSourceReportId();
  },

  populateNewSiteSelectors(selectedCompanyId = "") {
    const companySelect = document.getElementById("newSiteCompany");
    if (!companySelect) return;
    const areaSelect = { innerHTML: "", onchange: null };
    const consultantSelect = { innerHTML: "", onchange: null };
    const contractorSelect = { innerHTML: "", onchange: null };

    const companies = this.data.companies || [];
    const currentValue = selectedCompanyId || companySelect.value;
    companySelect.innerHTML = '<option value="">اختر الشركة</option>' +
      companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    areaSelect.innerHTML = '<option value="">اختر المنطقة</option>';
    consultantSelect.innerHTML = '<option value="">اختر الاستشاري</option>';
    contractorSelect.innerHTML = '<option value="">اختر المقاول</option>';

    companySelect.onchange = () => this.onNewSiteCompanyChange();
    areaSelect.onchange = () => this.onNewSiteAreaChange();

    companySelect.innerHTML =
      '<option value="">اختر الشركة</option>' +
      companies
        .map((company) => {
          const suffix = company.is_custom ? " (جديدة)" : "";
          return `<option value="${company.id}">${this.escapeHtml(company.name)}${suffix}</option>`;
        })
        .join("");

    if (
      currentValue &&
      companies.some((company) => String(company.id) === String(currentValue))
    ) {
      companySelect.value = String(currentValue);
    }

    this.populateGlobalNewSiteSuggestions();
    this.populateCompanySpecificSuggestions(this.findCompanyById(companySelect.value));
    this.toggleCompanyDependentAddButtons(companySelect.value);
    this.updateNewSiteSourceReportId();
  },

  onNewSiteCompanyChange() {
    const companySelect = document.getElementById("newSiteCompany");
    const areaSelect = document.getElementById("newSiteArea");
    const consultantSelect = document.getElementById("newSiteConsultant");
    const contractorSelect = document.getElementById("newSiteContractor");
    const plotInput = document.getElementById("newSitePlot");
    const ownerInput = document.getElementById("newSiteOwner");
    const projectInput = document.getElementById("newSiteProject");
    const reportYearInput = document.getElementById("newSiteReportYear");
    const reportMonthInput = document.getElementById("newSiteReportMonth");
    const reportNumberInput = document.getElementById("newSiteReportNumberInMonth");
    const sourceReportInput = document.getElementById("newSiteSourceReportId");
    const surveyDateInput = document.getElementById("newSiteSurveyDate");
    const subjectInput = document.getElementById("newSiteSubject");
    const surveyorInput = document.getElementById("newSiteSurveyor");
    const selectedCompany = this.findCompanyById(companySelect.value);

    this.resetNewSiteForm({ preserveCompany: true });
    this.populateCompanySpecificSuggestions(selectedCompany);
    this.populateGlobalNewSiteSuggestions();
    this.toggleCompanyDependentAddButtons(selectedCompany?.id);
    this.updateNewSiteSourceReportId();

    if (plotInput) plotInput.value = "";
    if (ownerInput) ownerInput.value = "";
    if (projectInput) projectInput.value = "";
    if (reportYearInput) reportYearInput.value = "";
    if (reportMonthInput) reportMonthInput.value = "";
    if (reportNumberInput) reportNumberInput.value = "";
    if (sourceReportInput) sourceReportInput.value = this.getNextSourceReportId();
    if (surveyDateInput) surveyDateInput.value = "";
    if (subjectInput) subjectInput.value = "";
    if (surveyorInput) surveyorInput.value = "MR. ";
    if (areaSelect) areaSelect.value = "";
    if (consultantSelect) consultantSelect.value = "";
    if (contractorSelect) contractorSelect.value = "";
    return;

    const company = this.data.companies.find((c) => String(c.id) === String(companySelect.value));
    if (!company) return;

    const areas = [...new Set(company.plots.map((p) => (p.area || "").trim()).filter(Boolean))].sort();
    areaSelect.innerHTML = '<option value="">اختر المنطقة</option>' +
      areas.map((area) => `<option value="${area}">${area}</option>`).join("");

    const consultants = [...new Set(company.plots.map((p) => (p.consultant || "").trim()).filter(Boolean))].sort();
    consultantSelect.innerHTML = '<option value="">اختر الاستشاري</option>' +
      consultants.map((v) => `<option value="${v}">${v}</option>`).join("");

    const contractors = [...new Set(company.plots.map((p) => (p.contractor || "").trim()).filter(Boolean))].sort();
    contractorSelect.innerHTML = '<option value="">اختر المقاول</option>' +
      contractors.map((v) => `<option value="${v}">${v}</option>`).join("");

    const firstPlot = company.plots[0];
    if (firstPlot) {
      plotInput.value = firstPlot.id || "";
      ownerInput.value = firstPlot.owner || "";
      projectInput.value = firstPlot.project || "";
      reportYearInput.value = firstPlot.report_year || "";
      reportMonthInput.value = firstPlot.report_month || "";
      reportNumberInput.value = firstPlot.report_number_in_month || "";
      sourceReportInput.value = firstPlot.source_report_id || "";
      surveyDateInput.value = firstPlot.survey_date || "";
      subjectInput.value = firstPlot.subject || "";
      surveyorInput.value = firstPlot.surveyor || "";
    }

    if (areas.length === 1) {
      areaSelect.value = areas[0];
    }
  },

  onNewSiteAreaChange() {
    this.updateNewSiteSourceReportId();
    return;

    const companySelect = document.getElementById("newSiteCompany");
    const areaSelect = document.getElementById("newSiteArea");
    const plotInput = document.getElementById("newSitePlot");
    const ownerInput = document.getElementById("newSiteOwner");
    const projectInput = document.getElementById("newSiteProject");
    const reportYearInput = document.getElementById("newSiteReportYear");
    const reportMonthInput = document.getElementById("newSiteReportMonth");
    const reportNumberInput = document.getElementById("newSiteReportNumberInMonth");
    const sourceReportInput = document.getElementById("newSiteSourceReportId");
    const surveyDateInput = document.getElementById("newSiteSurveyDate");
    const subjectInput = document.getElementById("newSiteSubject");
    const surveyorInput = document.getElementById("newSiteSurveyor");
    const consultantSelect = document.getElementById("newSiteConsultant");
    const contractorSelect = document.getElementById("newSiteContractor");
    const company = this.data.companies.find((c) => String(c.id) === String(companySelect.value));
    if (!company || !areaSelect.value) return;

    const matched = company.plots.find((p) => (p.area || "").trim() === areaSelect.value);
    if (!matched) return;

    plotInput.value = matched.id || "";
    ownerInput.value = matched.owner || "";
    projectInput.value = matched.project || "";
    reportYearInput.value = matched.report_year || "";
    reportMonthInput.value = matched.report_month || "";
    reportNumberInput.value = matched.report_number_in_month || "";
    sourceReportInput.value = matched.source_report_id || "";
    surveyDateInput.value = matched.survey_date || "";
    subjectInput.value = matched.subject || "";
    surveyorInput.value = matched.surveyor || "";
    consultantSelect.value = matched.consultant || "";
    contractorSelect.value = matched.contractor || "";
  },

  async addNewSiteCompany() {
    const companyName = window.AtlasDialog
      ? await window.AtlasDialog.prompt("اكتب اسم الشركة الجديدة")
      : window.prompt("اكتب اسم الشركة الجديدة");
    const normalizedName = this.normalizeValue(companyName);
    if (!normalizedName) return;

    const existingCompany = this.data.companies.find(
      (company) =>
        this.normalizeValue(company.name).toLowerCase() ===
        normalizedName.toLowerCase(),
    );

    if (existingCompany) {
      this.populateNewSiteSelectors(String(existingCompany.id));
      const companySelect = document.getElementById("newSiteCompany");
      if (companySelect) companySelect.value = String(existingCompany.id);
      this.onNewSiteCompanyChange();
      this.showToast("الشركة موجودة بالفعل وتم اختيارها");
      return;
    }

    const newCompanyId = this.getNextCompanyId();
    this.state.customSiteDb.push({
      id: newCompanyId,
      name: normalizedName,
      plots: [],
      references: {},
      is_custom: true,
    });

    await this.saveCustomSiteDb();
    this.refreshCompaniesData();
    this.populateCompanies();
    this.populateNewSiteSelectors(newCompanyId);

    const companySelect = document.getElementById("newSiteCompany");
    if (companySelect) companySelect.value = newCompanyId;
    this.onNewSiteCompanyChange();
    this.showToast("تمت إضافة الشركة الجديدة وحفظها");
  },

  async addCompanyReference(fieldName) {
    const companySelect = document.getElementById("newSiteCompany");
    const company = this.findCompanyById(companySelect?.value);
    if (!company) {
      this.showToast("اختر الشركة أولاً");
      return;
    }

    const fieldInput = this.getCompanyFieldInput(fieldName);
    const label = this.getCompanyFieldLabel(fieldName);
    const currentValue = this.normalizeValue(fieldInput?.value);
    const referenceValue =
      currentValue ||
      this.normalizeValue(
        window.AtlasDialog
          ? await window.AtlasDialog.prompt(`أدخل ${label} الجديدة`)
          : window.prompt(`أدخل ${label} الجديدة`),
      );

    if (!this.isUsableValue(referenceValue)) return;

    const customEntry = this.getOrCreateCustomCompanyEntry({
      companyId: company.id,
      companyName: company.name,
      isCustom: Boolean(this.findCustomCompanyEntry(company.id)?.is_custom),
    });

    customEntry.references[fieldName] = this.uniqueValues([
      ...(customEntry.references[fieldName] || []),
      referenceValue,
    ]);

    await this.saveCustomSiteDb();
    this.refreshCompaniesData();
    this.populateCompanies();
    this.populateNewSiteSelectors(String(company.id));

    const refreshedCompanySelect = document.getElementById("newSiteCompany");
    if (refreshedCompanySelect) refreshedCompanySelect.value = String(company.id);

    this.populateCompanySpecificSuggestions(this.findCompanyById(company.id));
    this.toggleCompanyDependentAddButtons(company.id);

    const refreshedFieldInput = this.getCompanyFieldInput(fieldName);
    if (refreshedFieldInput) refreshedFieldInput.value = referenceValue;

    this.showToast(`تم حفظ ${label} الجديدة للشركة`);
  },

  async registerNewSite() {
    const companyId = document.getElementById("newSiteCompany").value;
    const area = document.getElementById("newSiteArea").value;
    const plot = document.getElementById("newSitePlot").value;
    const owner = document.getElementById("newSiteOwner").value;
    const consultant = document.getElementById("newSiteConsultant").value;
    const project = document.getElementById("newSiteProject").value;
    const contractor = document.getElementById("newSiteContractor").value;
    const reportYear = document.getElementById("newSiteReportYear").value;
    const reportMonth = document.getElementById("newSiteReportMonth").value;
    const reportNumberInMonth = document.getElementById("newSiteReportNumberInMonth").value;
    const sourceReportId = document.getElementById("newSiteSourceReportId").value;
    const surveyDate = document.getElementById("newSiteSurveyDate").value;
    const subject = document.getElementById("newSiteSubject").value;
    const surveyor = document.getElementById("newSiteSurveyor").value;
    const selectedCompany = this.findCompanyById(this.normalizeValue(companyId));
    const normalizedArea = this.normalizeValue(area);
    const normalizedPlot = this.normalizeValue(plot);
    const normalizedOwner = this.normalizeValue(owner);
    const normalizedConsultant = this.normalizeValue(consultant);
    const normalizedProject = this.normalizeValue(project);
    const normalizedContractor = this.normalizeValue(contractor);
    const normalizedReportYear = this.normalizeValue(reportYear);
    const normalizedReportMonth = this.normalizeValue(reportMonth);
    const normalizedReportNumber = this.normalizeValue(reportNumberInMonth);
    const normalizedSourceReportId = this.normalizeValue(sourceReportId);
    const normalizedSurveyDate = this.normalizeValue(surveyDate);
    const normalizedSubject = this.normalizeValue(subject);
    const normalizedSurveyorRaw = this.normalizeValue(surveyor);
    const normalizedSurveyor = normalizedSurveyorRaw
      ? normalizedSurveyorRaw.toUpperCase().startsWith("MR.")
        ? normalizedSurveyorRaw
        : `MR. ${normalizedSurveyorRaw.replace(/^MR\.?\s*/i, "")}`.trim()
      : "";
    const normalizedLevels = this.getNewSiteLevelsRows().filter(
      (level) =>
        this.isUsableValue(level.design_level) ||
        this.isUsableValue(level.asbuilt_level) ||
        this.isUsableValue(level.difference_value) ||
        this.isUsableValue(level.remarks),
    );

    if (
      !selectedCompany ||
      !normalizedArea ||
      !normalizedPlot ||
      !normalizedOwner ||
      !normalizedConsultant ||
      !normalizedProject ||
      !normalizedContractor ||
      !normalizedReportYear ||
      !normalizedReportMonth ||
      !normalizedReportNumber ||
      !normalizedSourceReportId ||
      !normalizedSurveyDate ||
      !normalizedSubject ||
      !normalizedSurveyor
    ) {
      this.showToast("يرجى تعبئة جميع الحقول قبل الحفظ");
      return;
    }

    const plotRecord = {
      id: normalizedPlot,
      owner: normalizedOwner,
      consultant: normalizedConsultant,
      area: normalizedArea,
      project: normalizedProject,
      contractor: normalizedContractor,
      report_year: normalizedReportYear,
      report_month: normalizedReportMonth,
      report_number_in_month: normalizedReportNumber,
      source_report_id: normalizedSourceReportId,
      survey_date: normalizedSurveyDate,
      subject: normalizedSubject,
      surveyor: normalizedSurveyor,
      levels: normalizedLevels,
    };

    const customEntry = this.getOrCreateCustomCompanyEntry({
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      isCustom: Boolean(this.findCustomCompanyEntry(selectedCompany.id)?.is_custom),
    });

    customEntry.plots.push(plotRecord);
    customEntry.references = this.mergeReferences(customEntry.references || {}, {
      area: [normalizedArea],
      consultant: [normalizedConsultant],
      contractor: [normalizedContractor],
      report_year: [normalizedReportYear],
      report_month: [normalizedReportMonth],
      subject: [normalizedSubject],
      surveyor: [normalizedSurveyor],
    });

    await this.saveCustomSiteDb();
    this.refreshCompaniesData();
    this.populateCompanies();

    const newSiteRecord = {
      company: selectedCompany.name,
      company_id: String(selectedCompany.id),
      area: normalizedArea,
      plot: normalizedPlot,
      owner: normalizedOwner,
      consultant: normalizedConsultant,
      project: normalizedProject,
      contractor: normalizedContractor,
      report_year: normalizedReportYear,
      report_month: normalizedReportMonth,
      report_number_in_month: normalizedReportNumber,
      source_report_id: normalizedSourceReportId,
      survey_date: normalizedSurveyDate,
      subject: normalizedSubject,
      surveyor: normalizedSurveyor,
      levels: normalizedLevels,
    };
    const pendingAction = this.state.pendingAction;

    if (pendingAction === "__workspace_select__") {
      this.state.workspaceDraftSite = newSiteRecord;
      this.renderWorkspaceDraftSite();
      this.closeSiteModal();
      this.populateNewSiteSelectors();
      this.resetNewSiteForm();
      this.showToast("تمت إضافة الموقع وربطه بملف العمل الجديد");
      if (navigator.onLine) this.syncPendingSites();
      return;
    }

    this.state.selectedSite = newSiteRecord;

    localStorage.setItem(
      this.storageKeys.selectedSite,
      JSON.stringify(this.state.selectedSite),
    );
    this.upsertWorkspaceFromSelectedSite();

    const pendingSiteRecord = {
      ...this.state.selectedSite,
      company_id: String(selectedCompany.id),
      timestamp: new Date().toISOString(),
      id: Date.now(),
    };

    this.state.pendingSites.push(pendingSiteRecord);
    localStorage.setItem(
      this.storageKeys.pendingSites,
      JSON.stringify(this.state.pendingSites),
    );
    this.updateSyncBadge();

    this.updateSelectedSiteHeader();
    this.closeSiteModal();
    this.populateNewSiteSelectors();
    this.resetNewSiteForm();
    this.showToast("تمت إضافة الموقع وحفظه في قاعدة البيانات المحلية");

    if (pendingAction && pendingAction !== "__workspace__") {
      this.action(pendingAction);
    }

    if (navigator.onLine) this.syncPendingSites();
    return;
  },

  async syncPendingSites() {
    if (this.state.pendingSites.length === 0) return;
    if (!navigator.onLine) return;

    try {
      if (!window.AtlasStore?.isApiMode?.()) return;

      if (window.AtlasAuth && !window.AtlasAuth.canAccess("sites.write")) {
        this.showToast("لا توجد صلاحية لمزامنة بيانات المواقع");
        return;
      }

      await window.AtlasStore.saveCustomSites(this.state.customSiteDb);
      this.showToast("تمت مزامنة بيانات المواقع بنجاح");
      this.state.pendingSites = [];
      localStorage.setItem(this.storageKeys.pendingSites, "[]");
      this.updateSyncBadge();
    } catch (e) {
      console.error("Sync failed:", e);
      this.showToast("فشلت مزامنة بيانات المواقع، ستبقى في قائمة الانتظار");
    }
  },

  updateSyncBadge() {
    // You can add a badge to the UI to show pending items
    const count = this.state.pendingSites.length;
    console.log(`Pending sites to sync: ${count}`);
    // Implementation of UI badge update could go here
  },

  saveSiteFinal() {
    const company = this.findCompanyById(this.state.currentSelection.companyId);
    const plotId = this.state.currentSelection.plotId;
    const plot = this.findPlotBySelection(
      this.state.currentSelection.companyId,
      plotId,
      this.state.currentSelection.plotIndex,
    ) || {};
    const meta = this.state.currentSelection.metadata;

    if (!company || !plotId || !meta) {
      this.showToast("اختر موقعاً صحيحاً قبل الحفظ");
      return;
    }

    const selectedSiteRecord = {
      company: company.name,
      company_id: String(company.id),
      plot: plotId,
      plot_index: this.state.currentSelection.plotIndex,
      area: meta.area,
      owner: meta.owner,
      consultant: meta.consultant,
      project: meta.project,
      contractor: meta.contractor,
      report_year: meta.report_year,
      report_month: meta.report_month,
      report_number_in_month: meta.report_number_in_month,
      source_report_id: meta.source_report_id,
      survey_date: meta.survey_date,
      subject: meta.subject,
      surveyor: meta.surveyor,
      levels: plot.levels || meta.levels || [],
    };
    const pendingAction = this.state.pendingAction;

    if (pendingAction === "__workspace_select__") {
      this.state.workspaceDraftSite = selectedSiteRecord;
      this.renderWorkspaceDraftSite();
      this.closeSiteModal();
      this.showToast("تم ربط الموقع بملف العمل الجديد");
      return;
    }

    this.state.selectedSite = selectedSiteRecord;

    // Persist to local storage
    localStorage.setItem(
      this.storageKeys.selectedSite,
      JSON.stringify(this.state.selectedSite),
    );
    this.upsertWorkspaceFromSelectedSite();

    // Update UI Header
    this.updateSelectedSiteHeader();
    this.closeSiteModal();
    this.showToast("تم تحديد الموقع بنجاح");

    // Resume pending action if any
    if (pendingAction && pendingAction !== "__workspace__") {
      this.action(pendingAction);
    }
  },

  navigateTo(pageKey) {
    if (this.pages[pageKey]) {
      this.state.currentPage = pageKey;
      this.state.history.push(pageKey);
      this.render();
    }
  },

  navigateBack() {
    if (this.state.history.length > 1) {
      this.state.history.pop();
      this.state.currentPage =
        this.state.history[this.state.history.length - 1];
      this.render();
    }
  },

  goBackGlobal() {
    if (this.returnToSourcePage()) return;

    if (this.state.history.length > 1) {
      this.navigateBack();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    this.state.currentPage = "home";
    this.state.history = ["home"];
    this.render();
  },

  render() {
    const current = this.pages[this.state.currentPage] || this.pages.home;
    if (!this.pages[this.state.currentPage]) {
      this.state.currentPage = "home";
      this.state.history = ["home"];
    }
    const isHomePage = this.state.currentPage === "home";
    const isTopLevelPage = this.state.currentPage === "home" || this.state.currentPage === "workspace";

    // Update Title
    document.getElementById("navTitle").textContent = current.title;

    // Update Visibility
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(current.id).classList.add("active");

    const topHeader = document.querySelector(".main-header");
    if (topHeader) {
      topHeader.hidden = !isTopLevelPage;
    }

    const authShellMount = document.querySelector("[data-auth-shell]");
    if (authShellMount) {
      authShellMount.hidden = !isTopLevelPage;
    }

    const globalBackBtn = document.querySelector(".global-back-btn");
    if (globalBackBtn) {
      globalBackBtn.classList.toggle(
        "is-visible",
        !isTopLevelPage,
      );
    }

    // Scroll to top
    document.getElementById("mainContent").scrollTop = 0;
  },

  action(id) {
    if (id === "point_staking") {
      window.location.href = "pages/point-staking/";
      return;
    }

    // Gatekeeper: Check for site selection
    if (!this.state.selectedSite) {
      this.showSiteSelector(id);
      return;
    }

    const labels = {
      new_level: "علام جيت لفل جديد",
      survey_consultant: "رفع أرض للاستشاري",
      excavation_bottom: "قاع حفر",
      tie_beam: "تايبيم",
      roofs: "أسقف",
      gps_survey: "رفع بال GPS",
      total_station_survey: "رفع Totalstation",
      point_staking: "توقيع نقاط",
      level_staking: "توقيع منسوب",
    };

    const label = labels[id] || "إجراء غير معروف";

    // Populate Action Page Header
    document.getElementById("actionPageTitle").textContent = label;
    document.getElementById("actionSitePlot").textContent =
      this.state.selectedSite.plot || this.state.selectedSite.project_name || "بدون رقم أرض";
    document.getElementById("actionSiteCompany").textContent =
      this.state.selectedSite.company || this.state.selectedSite.workspace_title || "ملف عمل";

    // Reset and Build Form
    document.getElementById("actionNotes").value = "";
    this.buildActionForm(id);

    this.navigateTo("action");
  },

  buildActionForm(id) {
    const container = document.getElementById("actionFormContainer");
    container.innerHTML = "";
    const form = document.createElement("div");
    form.className = "action-form-content";

    if (id === "new_level") {
      form.innerHTML = `
                <div class="form-field">
                    <label>مستوى العلام الحالي (Reduced Level)</label>
                    <input type="number" step="0.001" id="rl_value" placeholder="0.000">
                </div>
                <div class="form-field">
                    <label>نوع العلام</label>
                    <select id="mark_type">
                        <option>مسمار</option>
                        <option>رشة صبغ</option>
                        <option>حديد</option>
                    </select>
                </div>`;
    } else if (id === "excavation_bottom") {
      form.innerHTML = `
                <div class="form-field">
                    <label>رقم النقطة</label>
                    <input type="text" id="point_number" placeholder="مثال: P1">
                </div>
                <div class="form-field">
                    <label>المنسوب المطلوب</label>
                    <input type="number" step="0.001" id="required_level" placeholder="0.000">
                </div>`;
    } else {
      form.innerHTML = `
                <div class="form-field">
                    <label>رقم الطلب / المرجع</label>
                    <input type="text" id="ref_number" placeholder="Reference Number">
                </div>
                <div class="form-field">
                    <label>التاريخ</label>
                    <input type="date" id="action_date" value="${new Date().toISOString().split("T")[0]}">
                </div>`;
    }
    container.appendChild(form);
  },

  submitAction() {
    this.showToast("جاري حفظ التقرير...");
    setTimeout(() => {
      this.showToast("تم إرسال التقرير بنجاح ✅");
      if (this.returnToSourcePage()) return;
      if (this.state.history.length > 1) {
        this.navigateBack();
        return;
      }
      this.state.currentPage = "home";
      this.state.history = ["home"];
      this.render();
    }, 1200);
  },

  showToast(message) {
    // Remove existing toast if any
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 100);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

// Global Exposure
window.app = app;

// Initialize on load
document.addEventListener("DOMContentLoaded", async () => {
  if (window.AtlasAuth) {
    await window.AtlasAuth.initialize();
    const allowed = await window.AtlasAuth.requirePageAccess("pages.home");
    if (!allowed) return;
  }
  document.body.classList.remove("atlas-auth-pending");
  await app.init();
});
