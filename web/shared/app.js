const app = {
  state: {
    currentPage: "home",
    history: ["home"],
    selectedSite: null,
    pendingAction: null,
    currentSelection: { companyId: null, area: null, plotId: null },
    pendingSites: [],
    customSiteDb: [],
  },

  // Data will be loaded from SITES_DB (sites_data.js)
  data: {
    companies: [],
  },

  storageKeys: {
    selectedSite: "selectedSite",
    pendingSites: "pendingSites",
    customSitesDb: "atlasCustomSitesDb",
  },

  pages: {
    home: { id: "homePage", title: "الرئيسية" },
    new: { id: "newPage", title: "جديد" },
    check: { id: "checkPage", title: "تشييك" },
    survey: { id: "surveyPage", title: "رفع" },
    stakeout: { id: "stakePage", title: "توقيع" },
    action: { id: "actionPage", title: "العمل" },
    history: { id: "historyPage", title: "السجل" },
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

  saveCustomSiteDb() {
    localStorage.setItem(
      this.storageKeys.customSitesDb,
      JSON.stringify(this.state.customSiteDb),
    );
    if (window.AtlasStore?.saveCustomSites) {
      window.AtlasStore.saveCustomSites(this.state.customSiteDb).catch((error) => {
        console.warn("Failed to sync custom site DB", error);
      });
    }
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

    const addPlot = (plot, source) => {
      if (!plot) return;
      const id = this.normalizeValue(plot.id);
      if (!id) return;
      if (!map.has(id)) order.push(id);
      map.set(id, {
        ...this.deepClone(plot),
        _source: source,
      });
    };

    basePlots.forEach((plot) => addPlot(plot, "base"));
    customPlots.forEach((plot) => addPlot(plot, "custom"));

    return order.map((id) => map.get(id));
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

  async init() {
    console.log("Atlas App Initialized");
    this.state.customSiteDb = await this.loadCustomSiteDb();
    this.refreshCompaniesData();
    this.populateCompanies();
    this.enhanceNewSiteForm();

    // Load persisted site
    const saved = localStorage.getItem(this.storageKeys.selectedSite);
    if (saved) {
      this.state.selectedSite = JSON.parse(saved);
      document.getElementById("siteName").textContent =
        this.state.selectedSite.plot;
      document.getElementById("siteCompany").textContent =
        this.state.selectedSite.company;
    }

    // Load pending sites
    const pending = localStorage.getItem(this.storageKeys.pendingSites);
    if (pending) {
      this.state.pendingSites = JSON.parse(pending);
      this.updateSyncBadge();
    }

    // Network listeners
    window.addEventListener("online", () => this.syncPendingSites());
    if (navigator.onLine) this.syncPendingSites();

    this.render();
    if (window.AtlasAuth) {
      window.AtlasAuth.decorateShell();
      window.AtlasAuth.applyPagePermissions();
    }
  },

  populateCompanies() {
    const list = document.getElementById("companyList");
    if (!list) return;
    list.innerHTML = "";
    this.data.companies.forEach((company) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = company.name;
      item.onclick = () => this.selectCompany(company.id);
      list.appendChild(item);
    });
  },

  selectCompany(companyId) {
    this.state.currentSelection.companyId = companyId;
    this.state.currentSelection.area = null;
    this.state.currentSelection.plotId = null;

    // UI update
    const items = document.querySelectorAll("#companyList .list-select-item");
    items.forEach((el) => el.classList.remove("selected"));
    if (event && event.currentTarget)
      event.currentTarget.classList.add("selected");

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
    const filteredPlots = company.plots.filter(
      (p) => {
        const plotArea = (p.area || "").trim();
        return plotArea === area;
      },
    );

    filteredPlots.forEach((plot) => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = plot.id;
      item.onclick = (e) => this.selectPlot(plot.id, e);
      list.appendChild(item);
    });
  },

  selectPlot(plotId, e) {
    this.state.currentSelection.plotId = plotId;
    const company = this.data.companies.find(
      (c) => c.id == this.state.currentSelection.companyId,
    );
    const plot = company.plots.find((p) => p.id == plotId);

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
      company.plots.forEach((plot) => {
        if (plot.id.toLowerCase().includes(query)) {
          results.push({
            companyName: company.name,
            companyId: company.id,
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
      item.innerHTML = `<small style="display:block; font-size:0.7rem; color:var(--text-dim)">${res.companyName}</small> ${res.plot.id}`;
      item.onclick = (e) => {
        this.state.currentSelection.companyId = res.companyId;
        this.selectPlot(res.plot.id, e);
      };
      list.appendChild(item);
    });
  },

  showAddSite() {
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

    this.saveCustomSiteDb();
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

    this.saveCustomSiteDb();
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

  registerNewSite() {
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

    this.saveCustomSiteDb();
    this.refreshCompaniesData();
    this.populateCompanies();

    this.state.selectedSite = {
      company: selectedCompany.name,
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

    localStorage.setItem(
      this.storageKeys.selectedSite,
      JSON.stringify(this.state.selectedSite),
    );

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

    document.getElementById("siteName").textContent = normalizedPlot;
    document.getElementById("siteCompany").textContent = selectedCompany.name;
    this.closeSiteModal();
    this.populateNewSiteSelectors();
    this.resetNewSiteForm();
    this.showToast("تمت إضافة الموقع وحفظه في قاعدة البيانات المحلية");

    if (this.state.pendingAction) {
      const action = this.state.pendingAction;
      this.state.pendingAction = null;
      this.action(action);
    }

    if (navigator.onLine) this.syncPendingSites();
    return;

    const company = this.data.companies.find((c) => String(c.id) === String(companyId));

    if (
      !company ||
      !area ||
      !plot ||
      !owner ||
      !consultant ||
      !project ||
      !contractor ||
      !reportYear ||
      !reportMonth ||
      !reportNumberInMonth ||
      !sourceReportId ||
      !surveyDate ||
      !subject ||
      !surveyor
    ) {
      this.showToast("يرجى تعبئة جميع الحقول قبل الحفظ");
      return;
    }

    this.state.selectedSite = {
      company: company.name,
      area: area,
      plot: plot,
      owner: owner,
      consultant: consultant,
      project: project,
      contractor: contractor,
      report_year: reportYear,
      report_month: reportMonth,
      report_number_in_month: reportNumberInMonth,
      source_report_id: sourceReportId,
      survey_date: surveyDate,
      subject: subject,
      surveyor: surveyor,
      levels: [],
    };

    // Add to pending sync
    const newSite = {
      ...this.state.selectedSite,
      timestamp: new Date().toISOString(),
      id: Date.now(),
    };

    this.state.pendingSites.push(newSite);
    localStorage.setItem(
      "pendingSites",
      JSON.stringify(this.state.pendingSites),
    );
    this.updateSyncBadge();

    document.getElementById("siteName").textContent = plot;
    document.getElementById("siteCompany").textContent = company;
    this.closeSiteModal();
    this.showToast("تمت إضافة الموقع محلياً وسيتم مزامنته عند توفر الإنترنت");

    if (this.state.pendingAction) {
      const action = this.state.pendingAction;
      this.state.pendingAction = null;
      this.action(action);
    }

    // Try to sync immediately if online
    if (navigator.onLine) this.syncPendingSites();
  },

  async syncPendingSites() {
    if (this.state.pendingSites.length === 0) return;
    if (!navigator.onLine) return;

    console.log("Attempting to sync sites to GitHub...");

    // Note: This requires a backend worker or GitHub API token
    // We'll simulate a successful sync if no endpoint is defined
    // to demonstrate the UI flow.

    try {
      // In a real scenario, you'd call an API like:
      // const res = await fetch('https://YOUR_WORKER.workers.dev/api/sync', {
      //     method: 'POST',
      //     body: JSON.stringify(this.state.pendingSites),
      //     headers: { 'Content-Type': 'application/json' }
      // });

      // Reaching out to GitHub directly (Mock for now)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.showToast("تمت مزامنة البيانات مع جيت هب ✅");
      this.state.pendingSites = [];
      localStorage.setItem(this.storageKeys.pendingSites, "[]");
      this.updateSyncBadge();
    } catch (e) {
      console.error("Sync failed:", e);
    }
  },

  updateSyncBadge() {
    // You can add a badge to the UI to show pending items
    const count = this.state.pendingSites.length;
    console.log(`Pending sites to sync: ${count}`);
    // Implementation of UI badge update could go here
  },

  saveSiteFinal() {
    const company = this.data.companies.find(
      (c) => c.id == this.state.currentSelection.companyId,
    );
    const plotId = this.state.currentSelection.plotId;
    const plot = company?.plots?.find((p) => p.id == plotId) || {};
    const meta = this.state.currentSelection.metadata;

    this.state.selectedSite = {
      company: company.name,
      plot: plotId,
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

    // Persist to local storage
    localStorage.setItem(
      this.storageKeys.selectedSite,
      JSON.stringify(this.state.selectedSite),
    );

    // Update UI Header
    document.getElementById("siteName").textContent = plotId;
    document.getElementById("siteCompany").textContent = company.name;
    this.closeSiteModal();
    this.showToast("تم تحديد الموقع بنجاح");

    // Resume pending action if any
    if (this.state.pendingAction) {
      const action = this.state.pendingAction;
      this.state.pendingAction = null;
      this.action(action);
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
    if (this.state.history.length > 1) {
      this.navigateBack();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    this.navigateTo("home");
  },

  render() {
    const current = this.pages[this.state.currentPage];

    // Update Title
    document.getElementById("navTitle").textContent = current.title;

    // Update Visibility
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(current.id).classList.add("active");

    const globalBackBtn = document.querySelector(".global-back-btn");
    if (globalBackBtn) {
      globalBackBtn.classList.toggle(
        "is-visible",
        this.state.currentPage !== "home",
      );
    }

    // Scroll to top
    document.getElementById("mainContent").scrollTop = 0;
  },

  action(id) {
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
      this.state.selectedSite.plot;
    document.getElementById("actionSiteCompany").textContent =
      this.state.selectedSite.company;

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
      this.navigateBack();
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
  await app.init();
});

