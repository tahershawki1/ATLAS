(function () {
  const state = {
    users: [],
    customSites: [],
    companies: [],
    selectedUserId: "",
    selectedCompanyId: "",
    selectedArea: "",
    selectedPlotId: "",
    selectedFiles: [],
    runtimeMode: "local",
  };

  const $ = (selector) => document.querySelector(selector);

  function norm(value) {
    return String(value ?? "").trim();
  }

  function esc(value) {
    return norm(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setStatus(message) {
    $("#statusBox").textContent = message;
  }

  async function ask(message, defaultValue = "") {
    return window.AtlasDialog
      ? window.AtlasDialog.prompt(message, { defaultValue })
      : window.prompt(message, defaultValue);
  }

  async function confirmMessage(message) {
    return window.AtlasDialog ? window.AtlasDialog.confirm(message) : window.confirm(message);
  }

  function unique(values = []) {
    const seen = new Set();
    const list = [];
    values.forEach((value) => {
      const normalized = norm(value);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) return;
      seen.add(key);
      list.push(normalized);
    });
    return list;
  }

  function getCustomCompany(companyId) {
    return state.customSites.find((company) => String(company.id) === String(companyId));
  }

  function upsertCustomCompany(companyId, companyName) {
    let company = getCustomCompany(companyId);
    if (!company) {
      company = {
        id: String(companyId),
        name: companyName,
        plots: [],
        references: {},
        deleted_plots: [],
        is_custom: true,
        is_deleted: false,
      };
      state.customSites.push(company);
    }

    company.name = companyName;
    company.plots = company.plots || [];
    company.references = company.references || {};
    company.deleted_plots = company.deleted_plots || [];
    company.is_custom = true;
    company.is_deleted = false;
    return company;
  }

  function mergeCompanies(base = [], custom = []) {
    const deletedCompanies = new Set(custom.filter((entry) => entry?.is_deleted).map((entry) => String(entry.id)));
    const merged = clone(base).filter((company) => !deletedCompanies.has(String(company.id)));

    custom.forEach((customCompany) => {
      if (customCompany?.is_deleted) return;

      const target =
        merged.find((company) => String(company.id) === String(customCompany.id)) ||
        merged.find((company) => norm(company.name).toLowerCase() === norm(customCompany.name).toLowerCase());

      const deletedPlots = new Set((customCompany.deleted_plots || []).map((plotId) => String(plotId)));
      const customPlots = (customCompany.plots || []).filter((plot) => !deletedPlots.has(String(plot.id)));

      if (!target) {
        merged.push({
          id: String(customCompany.id),
          name: customCompany.name,
          plots: customPlots.map((plot) => ({ ...plot, _source: "custom" })),
          references: clone(customCompany.references || {}),
          is_custom: true,
        });
        return;
      }

      target.name = customCompany.name || target.name;
      const basePlots = (target.plots || []).filter((plot) => !deletedPlots.has(String(plot.id)));
      const byId = new Map(basePlots.map((plot) => [String(plot.id), { ...plot, _source: plot._source || "base" }]));
      customPlots.forEach((plot) => byId.set(String(plot.id), { ...plot, _source: "custom" }));
      target.plots = Array.from(byId.values());
    });

    return merged;
  }

  function getCompanies() {
    const base = Array.isArray(window.SITES_DB) ? window.SITES_DB : [];
    return mergeCompanies(base, state.customSites);
  }

  function getCompany(companyId) {
    return state.companies.find((company) => String(company.id) === String(companyId));
  }

  function getSelectedPlot() {
    const company = getCompany(state.selectedCompanyId);
    if (!company) return null;
    return (company.plots || []).find((plot) => String(plot.id) === String(state.selectedPlotId)) || null;
  }

  function countStats(uploadedPagesCount = null) {
    const siteCount = state.companies.reduce((sum, company) => sum + (company.plots || []).length, 0);
    $("#statUsers").textContent = state.users.length;
    $("#statCompanies").textContent = state.companies.length;
    $("#statSites").textContent = siteCount;
    if (uploadedPagesCount !== null) $("#statPages").textContent = uploadedPagesCount;
  }

  function renderUserCardSummary() {
    const selected = state.users.find((user) => user.id === state.selectedUserId);
    $("#selectedUserCard").innerHTML = selected
      ? `
        <div class="detail-row"><label>الاسم</label><span>${esc(selected.full_name || selected.username)}</span></div>
        <div class="detail-row"><label>اسم المستخدم</label><span>${esc(selected.username)}</span></div>
        <div class="detail-row"><label>النوع</label><span>${selected.is_admin ? "مدير" : "مستخدم"}</span></div>
        <div class="detail-row"><label>الصلاحيات</label><span>${(selected.permissions || []).length}</span></div>
      `
      : `<div class="empty">لا يوجد مستخدم محدد.</div>`;
  }

  function renderUsersMarkup() {
    return state.users.map((user) => `
      <div class="row-item ${user.id === state.selectedUserId ? "active" : ""}">
        <div>
          <strong>${esc(user.full_name || user.username)}</strong>
          <span>${esc(user.username)} ${user.is_admin ? "- مدير" : ""}</span>
        </div>
        <div class="row-actions">
          <button class="mini-btn" type="button" data-action="select-user" data-id="${esc(user.id)}">اختيار</button>
          <button class="mini-btn" type="button" data-action="edit-user" data-id="${esc(user.id)}">تعديل</button>
          ${user.username === "admin" ? "" : `<button class="danger-btn" type="button" data-action="delete-user" data-id="${esc(user.id)}">حذف</button>`}
        </div>
      </div>
    `).join("");
  }

  function renderUsers() {
    const markup = renderUsersMarkup();
    $("#usersList").innerHTML = markup || `<div class="empty">لا يوجد مستخدمون.</div>`;
    $("#permissionsUsersList").innerHTML = markup || `<div class="empty">لا يوجد مستخدمون.</div>`;
    renderUserCardSummary();
  }

  async function renderPermissions() {
    const selected = state.users.find((user) => user.id === state.selectedUserId);
    $("#permissionUserTitle").textContent = selected
      ? `صلاحيات ${selected.full_name || selected.username}`
      : "تفاصيل الصلاحيات";
    $("#permissionsHint").textContent = selected
      ? "حدد الصفحات المسموح للمستخدم بالدخول إليها ثم احفظ."
      : "اختر مستخدمًا أولًا.";

    if (!selected) {
      $("#permissionsGrid").innerHTML = `<div class="empty">لا يوجد مستخدم محدد.</div>`;
      return;
    }

    if (selected.is_admin) {
      $("#permissionsGrid").innerHTML = `<div class="empty">هذا المستخدم مدير ويملك كامل الصلاحيات.</div>`;
      return;
    }

    const pages = await window.AtlasAuth.getAllPages();
    const granted = new Set(selected.permissions || []);
    $("#permissionsGrid").innerHTML = pages.map((page) => `
      <div class="perm-item">
        <input id="perm-${esc(page.id)}" type="checkbox" value="${esc(page.id)}" ${granted.has(page.id) ? "checked" : ""} />
        <label for="perm-${esc(page.id)}">${esc(page.label)}</label>
      </div>
    `).join("") || `<div class="empty">لا توجد صفحات معرفة.</div>`;
  }

  function renderCompanySelect() {
    const options = state.companies.map((company) => `<option value="${esc(company.id)}">${esc(company.name)}</option>`).join("");
    $("#siteCompanySelect").innerHTML = `<option value="">اختر الشركة</option>${options}`;
    if (state.selectedCompanyId) $("#siteCompanySelect").value = String(state.selectedCompanyId);
  }

  function renderCompanies() {
    $("#companiesBrowser").innerHTML = state.companies.map((company) => `
      <div class="row-item ${String(company.id) === String(state.selectedCompanyId) ? "active" : ""}">
        <div>
          <strong>${esc(company.name)}</strong>
          <span>${(company.plots || []).length} موقع</span>
        </div>
        <div class="row-actions">
          <button class="mini-btn" type="button" data-action="select-company" data-id="${esc(company.id)}">اختيار</button>
          <button class="mini-btn" type="button" data-action="rename-company" data-id="${esc(company.id)}">تعديل</button>
          <button class="danger-btn" type="button" data-action="delete-company" data-id="${esc(company.id)}">حذف</button>
        </div>
      </div>
    `).join("") || `<div class="empty">لا توجد شركات.</div>`;
  }

  function renderAreas() {
    const company = getCompany(state.selectedCompanyId);
    if (!company) {
      $("#areasBrowser").innerHTML = `<div class="empty">اختر شركة لعرض المناطق.</div>`;
      return;
    }
    const areas = unique((company.plots || []).map((plot) => plot.area)).sort();
    $("#areasBrowser").innerHTML = areas.map((area) => `
      <div class="row-item ${area === state.selectedArea ? "active" : ""}">
        <div>
          <strong>${esc(area)}</strong>
          <span>${(company.plots || []).filter((plot) => norm(plot.area) === area).length} موقع</span>
        </div>
        <div class="row-actions">
          <button class="mini-btn" type="button" data-action="select-area" data-area="${esc(area)}">اختيار</button>
          <button class="danger-btn" type="button" data-action="delete-area" data-area="${esc(area)}">حذف</button>
        </div>
      </div>
    `).join("") || `<div class="empty">لا توجد مناطق.</div>`;
  }

  function renderSelectedSiteCard() {
    const plot = getSelectedPlot();
    $("#selectedSiteCard").innerHTML = plot
      ? `
        <div class="detail-row"><label>رقم الأرض</label><span>${esc(plot.id)}</span></div>
        <div class="detail-row"><label>المنطقة</label><span>${esc(plot.area)}</span></div>
        <div class="detail-row"><label>المشروع</label><span>${esc(plot.project)}</span></div>
        <div class="detail-row"><label>المقاول</label><span>${esc(plot.contractor)}</span></div>
      `
      : `<div class="empty">لا يوجد موقع محدد.</div>`;
  }

  function renderSiteDetail() {
    const company = getCompany(state.selectedCompanyId);
    const areaPlots = company
      ? (company.plots || []).filter((entry) => !state.selectedArea || norm(entry.area) === state.selectedArea)
      : [];
    const plot = getSelectedPlot();

    if (!company) {
      $("#siteDetail").innerHTML = `<div class="empty">اختر موقعًا لعرض التفاصيل.</div>`;
      renderSelectedSiteCard();
      return;
    }

    const plotsMarkup = areaPlots.length
      ? `
        <div style="margin-bottom:10px;">
          <div class="inline-head"><strong>مواقع المنطقة</strong><span>${areaPlots.length} موقع</span></div>
          <div class="inline-files">
            ${areaPlots.map((entry) => `
              <button class="mini-btn" type="button" data-action="select-plot" data-plot="${esc(entry.id)}">${esc(entry.id)}</button>
            `).join("")}
          </div>
        </div>
      `
      : "";

    if (!plot) {
      $("#siteDetail").innerHTML = plotsMarkup || `<div class="empty">لا توجد مواقع داخل النطاق المحدد.</div>`;
      renderSelectedSiteCard();
      return;
    }

    const rows = [
      ["الشركة", company.name],
      ["المنطقة", plot.area],
      ["رقم الأرض", plot.id],
      ["اسم المالك", plot.owner],
      ["الاستشاري", plot.consultant],
      ["المشروع", plot.project],
      ["المقاول", plot.contractor],
      ["سنة التقرير", plot.report_year],
      ["شهر التقرير", plot.report_month],
      ["رقم التقرير", plot.report_number_in_month],
      ["رقم التقرير المصدر", plot.source_report_id],
      ["تاريخ المسح", plot.survey_date],
      ["الموضوع", plot.subject],
      ["المساح", plot.surveyor],
    ];

    $("#siteDetail").innerHTML = `${plotsMarkup}${rows
      .map(([label, value]) => `<div class="detail-row"><label>${esc(label)}</label><span>${esc(value)}</span></div>`)
      .join("")}`;

    $("#siteCompanySelect").value = String(company.id);
    $("#siteAreaInput").value = norm(plot.area);
    $("#sitePlotInput").value = norm(plot.id);
    $("#siteOwnerInput").value = norm(plot.owner);
    $("#siteConsultantInput").value = norm(plot.consultant);
    $("#siteProjectInput").value = norm(plot.project);
    $("#siteContractorInput").value = norm(plot.contractor);
    $("#siteReportYearInput").value = norm(plot.report_year);
    $("#siteReportMonthInput").value = norm(plot.report_month);
    $("#siteReportNoInput").value = norm(plot.report_number_in_month);
    $("#siteSourceIdInput").value = norm(plot.source_report_id);
    $("#siteSurveyDateInput").value = norm(plot.survey_date);
    $("#siteSubjectInput").value = norm(plot.subject);
    $("#siteSurveyorInput").value = norm(plot.surveyor) || "MR. ";
    renderSelectedSiteCard();
  }

  function resetSiteForm() {
    [
      "#siteAreaInput",
      "#sitePlotInput",
      "#siteOwnerInput",
      "#siteConsultantInput",
      "#siteProjectInput",
      "#siteContractorInput",
      "#siteReportYearInput",
      "#siteReportMonthInput",
      "#siteReportNoInput",
      "#siteSourceIdInput",
      "#siteSurveyDateInput",
      "#siteSubjectInput",
    ].forEach((selector) => { $(selector).value = ""; });
    $("#siteSurveyorInput").value = "MR. ";
    if (state.selectedCompanyId) $("#siteCompanySelect").value = String(state.selectedCompanyId);
  }

  async function persistSites(message) {
    await window.AtlasStore.saveCustomSites(state.customSites);
    state.companies = getCompanies();
    renderCompanySelect();
    renderCompanies();
    renderAreas();
    renderSiteDetail();
    countStats();
    setStatus(message || "تم الحفظ");
  }

  async function refreshUsers() {
    state.users = await window.AtlasStore.getUsers();
    if (!state.selectedUserId && state.users.length) state.selectedUserId = state.users[0].id;
    renderUsers();
    await renderPermissions();
    countStats();
  }

  async function refreshSites() {
    state.customSites = await window.AtlasStore.loadCustomSites();
    state.companies = getCompanies();
    renderCompanySelect();
    renderCompanies();
    renderAreas();
    renderSiteDetail();
    countStats();
  }

  async function createUser() {
    const username = $("#userUsername").value;
    const fullName = $("#userFullName").value;
    const password = $("#userPassword").value;
    const isAdmin = $("#userRole").value === "admin";
    if (!norm(username) || !norm(password)) {
      setStatus("اسم المستخدم وكلمة المرور مطلوبان");
      return;
    }
    await window.AtlasStore.createUser({
      username,
      full_name: fullName,
      password,
      is_admin: isAdmin,
      permissions: isAdmin ? ["*"] : [],
    });
    $("#userUsername").value = "";
    $("#userFullName").value = "";
    $("#userPassword").value = "";
    $("#userRole").value = "member";
    setStatus("تم إنشاء المستخدم");
    await refreshUsers();
  }

  async function editUser(userId) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return;
    const fullName = await ask("الاسم الكامل", user.full_name || user.username);
    if (fullName === null) return;
    const password = await ask("كلمة مرور جديدة - اتركها فارغة إن لم ترغب بالتغيير", "");
    if (password === null) return;
    await window.AtlasStore.updateUser(userId, {
      full_name: fullName,
      password,
      is_admin: user.is_admin,
      permissions: user.permissions || [],
    });
    setStatus("تم تحديث المستخدم");
    await refreshUsers();
  }

  async function deleteUser(userId) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) return;
    if (!(await confirmMessage(`حذف المستخدم ${user.full_name || user.username}؟`))) return;
    await window.AtlasStore.deleteUser(userId);
    if (state.selectedUserId === userId) state.selectedUserId = "";
    setStatus("تم حذف المستخدم");
    await refreshUsers();
  }

  async function savePermissions() {
    const user = state.users.find((entry) => entry.id === state.selectedUserId);
    if (!user) return;
    if (user.is_admin) {
      setStatus("المستخدم المدير لديه كامل الصلاحيات");
      return;
    }
    const permissions = Array.from(document.querySelectorAll("#permissionsGrid input:checked")).map((input) => input.value);
    await window.AtlasStore.updateUser(user.id, {
      full_name: user.full_name,
      username: user.username,
      is_admin: false,
      permissions,
    });
    setStatus("تم حفظ الصلاحيات");
    await refreshUsers();
  }

  async function addCompany() {
    const name = await ask("اكتب اسم الشركة الجديدة");
    if (!norm(name)) return;
    const exists = state.companies.find((company) => norm(company.name).toLowerCase() === norm(name).toLowerCase());
    if (exists) {
      state.selectedCompanyId = String(exists.id);
      renderCompanies();
      renderAreas();
      setStatus("الشركة موجودة بالفعل وتم اختيارها");
      return;
    }
    const maxId = state.companies.reduce((max, company) => {
      const numeric = parseInt(company.id, 10);
      return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
    }, 0);
    state.customSites.push({
      id: String(maxId + 1 || 1),
      name: norm(name),
      plots: [],
      references: {},
      deleted_plots: [],
      is_custom: true,
    });
    await persistSites("تمت إضافة الشركة");
  }

  async function renameCompany(companyId) {
    const company = getCompany(companyId);
    if (!company) return;
    const name = await ask("اسم الشركة الجديد", company.name);
    if (!norm(name)) return;
    upsertCustomCompany(company.id, norm(name));
    await persistSites("تم تعديل اسم الشركة");
  }

  async function deleteCompany(companyId) {
    const company = getCompany(companyId);
    if (!company) return;
    if (!(await confirmMessage(`حذف الشركة ${company.name}؟`))) return;
    const custom = upsertCustomCompany(company.id, company.name);
    custom.is_deleted = true;
    custom.plots = [];
    custom.deleted_plots = [];
    if (String(state.selectedCompanyId) === String(company.id)) {
      state.selectedCompanyId = "";
      state.selectedArea = "";
      state.selectedPlotId = "";
    }
    await persistSites("تم حذف الشركة");
  }

  async function renameArea() {
    if (!state.selectedCompanyId || !state.selectedArea) {
      setStatus("اختر شركة ومنطقة أولًا");
      return;
    }
    const nextArea = await ask("اسم المنطقة الجديد", state.selectedArea);
    if (!norm(nextArea) || norm(nextArea) === state.selectedArea) return;
    const company = getCompany(state.selectedCompanyId);
    const custom = upsertCustomCompany(company.id, company.name);
    (company.plots || []).forEach((plot) => {
      if (norm(plot.area) !== state.selectedArea) return;
      const updated = clone(plot);
      delete updated._source;
      updated.area = norm(nextArea);
      const index = custom.plots.findIndex((entry) => String(entry.id) === String(plot.id));
      if (index === -1) custom.plots.push(updated); else custom.plots[index] = updated;
    });
    state.selectedArea = norm(nextArea);
    await persistSites("تم تعديل المنطقة");
  }

  async function deleteArea(area) {
    const company = getCompany(state.selectedCompanyId);
    if (!company) return;
    const replacement = await ask("اكتب اسم منطقة بديلة لنقل المواقع إليها قبل الحذف");
    if (!norm(replacement) || norm(replacement) === norm(area)) {
      setStatus("يرجى كتابة منطقة بديلة مختلفة");
      return;
    }
    const custom = upsertCustomCompany(company.id, company.name);
    (company.plots || []).forEach((plot) => {
      if (norm(plot.area) !== norm(area)) return;
      const updated = clone(plot);
      delete updated._source;
      updated.area = norm(replacement);
      const index = custom.plots.findIndex((entry) => String(entry.id) === String(plot.id));
      if (index === -1) custom.plots.push(updated); else custom.plots[index] = updated;
    });
    state.selectedArea = norm(replacement);
    state.selectedPlotId = "";
    await persistSites("تم نقل المواقع وحذف المنطقة القديمة");
  }

  function readSiteForm() {
    const companyId = $("#siteCompanySelect").value;
    const company = getCompany(companyId);
    if (!company) throw new Error("اختر الشركة أولًا");

    const payload = {
      id: norm($("#sitePlotInput").value),
      area: norm($("#siteAreaInput").value),
      owner: norm($("#siteOwnerInput").value),
      consultant: norm($("#siteConsultantInput").value),
      project: norm($("#siteProjectInput").value),
      contractor: norm($("#siteContractorInput").value),
      report_year: norm($("#siteReportYearInput").value),
      report_month: norm($("#siteReportMonthInput").value),
      report_number_in_month: norm($("#siteReportNoInput").value),
      source_report_id: norm($("#siteSourceIdInput").value),
      survey_date: norm($("#siteSurveyDateInput").value),
      subject: norm($("#siteSubjectInput").value),
      surveyor: norm($("#siteSurveyorInput").value) || "MR. ",
      levels: getSelectedPlot()?.levels || [],
    };

    if (Object.values(payload).slice(0, 13).some((value) => !norm(value))) {
      throw new Error("يرجى تعبئة كل الحقول قبل الحفظ");
    }

    if (!payload.surveyor.toUpperCase().startsWith("MR.")) {
      payload.surveyor = `MR. ${payload.surveyor.replace(/^MR\.?\s*/i, "")}`.trim();
    }

    return { company, payload };
  }

  async function saveSite() {
    try {
      const { company, payload } = readSiteForm();
      const custom = upsertCustomCompany(company.id, company.name);
      const index = custom.plots.findIndex((entry) => String(entry.id) === String(payload.id));
      if (index === -1) custom.plots.push(payload); else custom.plots[index] = payload;
      custom.deleted_plots = (custom.deleted_plots || []).filter((plotId) => String(plotId) !== String(payload.id));
      state.selectedCompanyId = String(company.id);
      state.selectedArea = payload.area;
      state.selectedPlotId = payload.id;
      await persistSites("تم حفظ الموقع");
    } catch (error) {
      setStatus(error.message || "تعذر حفظ الموقع");
    }
  }

  async function deleteCurrentSite() {
    const company = getCompany(state.selectedCompanyId);
    const plot = getSelectedPlot();
    if (!company || !plot) {
      setStatus("اختر موقعًا أولًا");
      return;
    }
    if (!(await confirmMessage(`حذف الموقع ${plot.id}؟`))) return;
    const custom = upsertCustomCompany(company.id, company.name);
    custom.plots = (custom.plots || []).filter((entry) => String(entry.id) !== String(plot.id));
    if (!custom.deleted_plots.includes(String(plot.id))) custom.deleted_plots.push(String(plot.id));
    state.selectedPlotId = "";
    await persistSites("تم حذف الموقع");
    resetSiteForm();
  }

  function renderStaticPages() {
    $("#staticPagesList").innerHTML = window.AtlasAuth.getStaticPages().map((page) => `
      <div class="row-item">
        <div>
          <strong>${esc(page.label)}</strong>
          <span>${esc(page.id)}</span>
        </div>
        <div class="row-actions"><a class="mini-btn" href="${esc(page.url)}">فتح</a></div>
      </div>
    `).join("") || `<div class="empty">لا توجد صفحات ثابتة.</div>`;
  }

  function renderSelectedFiles() {
    $("#selectedFiles").innerHTML = state.selectedFiles
      .slice(0, 12)
      .map((file) => `<span class="file-chip">${esc(file.webkitRelativePath || file.name)}</span>`)
      .join("");
    if (state.selectedFiles.length > 12) {
      $("#selectedFiles").insertAdjacentHTML("beforeend", `<span class="file-chip">+${state.selectedFiles.length - 12}</span>`);
    }
  }

  async function renderUploadedPages() {
    const manifest = await window.AtlasStore.getPagesManifest();
    const pages = manifest?.pages || [];
    countStats(pages.length);
    $("#uploadedPagesList").innerHTML = pages.map((page) => `
      <div class="row-item">
        <div>
          <strong>${esc(page.title || page.slug)}</strong>
          <span>${esc(page.slug)} - ${(page.files || []).length} ملف</span>
        </div>
        <div class="row-actions">
          <a class="mini-btn" href="${esc(page.url || `/published/${page.slug}/`)}" target="_blank" rel="noreferrer">فتح</a>
          <button class="danger-btn" type="button" data-action="delete-uploaded-page" data-slug="${esc(page.slug)}">حذف</button>
        </div>
      </div>
    `).join("") || `<div class="empty">لا توجد صفحات مرفوعة بعد.</div>`;
  }

  async function uploadPages() {
    if (!state.selectedFiles.length) {
      setStatus("اختر ملفًا أو مجلدًا قبل الرفع");
      return;
    }
    try {
      await window.AtlasStore.uploadPages({
        files: state.selectedFiles,
        title: $("#pageTitleInput").value,
        slug: $("#pageSlugInput").value,
      });
      state.selectedFiles = [];
      $("#pageFileInput").value = "";
      $("#pageFolderInput").value = "";
      $("#pageTitleInput").value = "";
      $("#pageSlugInput").value = "";
      renderSelectedFiles();
      setStatus("تم رفع الملفات");
      await renderUploadedPages();
      await renderPermissions();
    } catch (error) {
      setStatus(error.message || "تعذر رفع الملفات");
    }
  }

  async function deleteUploadedPage(slug) {
    if (!(await confirmMessage(`حذف الصفحة المرفوعة ${slug}؟`))) return;
    try {
      await window.AtlasStore.deleteUploadedPage(slug);
      setStatus("تم حذف الصفحة المرفوعة");
      await renderUploadedPages();
      await renderPermissions();
    } catch (error) {
      setStatus(error.message || "تعذر حذف الصفحة");
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab);
      });
    });
  }

  function activateTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === tab);
    });
    ["users", "sites", "permissions", "pages"].forEach((key) => {
      $(`#panel-${key}`).classList.toggle("active", key === tab);
    });
  }

  function bindActions() {
    document.body.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;

      if (action === "select-user") {
        state.selectedUserId = target.dataset.id;
        renderUsers();
        await renderPermissions();
      }
      if (action === "edit-user") await editUser(target.dataset.id);
      if (action === "delete-user") await deleteUser(target.dataset.id);

      if (action === "select-company") {
        state.selectedCompanyId = target.dataset.id;
        state.selectedArea = "";
        state.selectedPlotId = "";
        renderCompanySelect();
        renderCompanies();
        renderAreas();
        renderSiteDetail();
      }
      if (action === "rename-company") await renameCompany(target.dataset.id);
      if (action === "delete-company") await deleteCompany(target.dataset.id);

      if (action === "select-area") {
        state.selectedArea = target.dataset.area;
        state.selectedPlotId = "";
        renderAreas();
        renderSiteDetail();
      }
      if (action === "select-plot") {
        state.selectedPlotId = target.dataset.plot;
        renderSiteDetail();
      }
      if (action === "delete-area") await deleteArea(target.dataset.area);
      if (action === "delete-uploaded-page") await deleteUploadedPage(target.dataset.slug);
    });
  }

  async function init() {
    const allowed = await window.AtlasAuth.requirePageAccess("admin.panel");
    if (!allowed) return;

    await window.AtlasAuth.initialize();
    window.AtlasAuth.decorateShell();
    state.runtimeMode = await window.AtlasStore.getMode();
    $("#runtimeMode").textContent =
      state.runtimeMode === "cloudflare"
        ? "Cloudflare mode مفعل. المستخدمون والصفحات والمواقع تُدار عبر KV / R2."
        : "Local mode مفعل. البيانات محفوظة محليًا داخل هذا المتصفح.";

    bindTabs();
    bindActions();
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (["users", "sites", "permissions", "pages"].includes(initialTab)) {
      activateTab(initialTab);
    }
    renderStaticPages();
    await refreshUsers();
    await refreshSites();
    await renderUploadedPages();

    $("#createUserBtn").addEventListener("click", createUser);
    $("#savePermissionsBtn").addEventListener("click", savePermissions);
    $("#addCompanyBtn").addEventListener("click", addCompany);
    $("#renameAreaBtn").addEventListener("click", renameArea);
    $("#saveSiteBtn").addEventListener("click", saveSite);
    $("#deleteSiteBtn").addEventListener("click", deleteCurrentSite);
    $("#resetSiteFormBtn").addEventListener("click", resetSiteForm);
    $("#uploadPagesBtn").addEventListener("click", uploadPages);
    $("#logoutBtn").addEventListener("click", async () => {
      await window.AtlasAuth.logout();
      window.location.href = "../login/";
    });
    $("#pageFileInput").addEventListener("change", (event) => {
      state.selectedFiles = Array.from(event.target.files || []);
      renderSelectedFiles();
    });
    $("#pageFolderInput").addEventListener("change", (event) => {
      state.selectedFiles = Array.from(event.target.files || []);
      renderSelectedFiles();
    });
    $("#siteCompanySelect").addEventListener("change", (event) => {
      state.selectedCompanyId = event.target.value;
    });

    setStatus("جاهز.");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
