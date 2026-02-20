const app = {
  state: {
    currentPage: "home",
    history: ["home"],
    selectedSite: null,
    pendingAction: null,
    currentSelection: { companyId: null, area: null, plotId: null }
  },

  // Data will be loaded from SITES_DB (sites_data.js)
  data: {
    companies: typeof SITES_DB !== "undefined" ? SITES_DB : []
  },

  pages: {
    home: { id: "homePage", title: "الرئيسية" },
    new: { id: "newPage", title: "جديد" },
    check: { id: "checkPage", title: "تشييك" },
    survey: { id: "surveyPage", title: "رفع" },
    stakeout: { id: "stakePage", title: "توقيع" },
    action: { id: "actionPage", title: "العمل" },
  },

  init() {
    console.log("Atlas App Initialized");
    this.populateCompanies();
    
    // Load persisted site
    const saved = localStorage.getItem("selectedSite");
    if (saved) {
        this.state.selectedSite = JSON.parse(saved);
        document.getElementById("siteName").textContent = this.state.selectedSite.plot;
    }

    this.render();
  },

  populateCompanies() {
    const list = document.getElementById("companyList");
    if (!list) return;
    list.innerHTML = "";
    this.data.companies.forEach(company => {
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
    items.forEach(el => el.classList.remove("selected"));
    if (event && event.currentTarget) event.currentTarget.classList.add("selected");

    this.populateAreas(companyId);
    this.modalStep(2);
  },

  populateAreas(companyId) {
    const list = document.getElementById("areaList");
    const company = this.data.companies.find(c => c.id == companyId);
    if (!list || !company) return;

    list.innerHTML = "";
    // Get unique areas for this company
    const areas = [...new Set(company.plots.map(p => p.area || "غير محدد"))].sort();
    
    areas.forEach(area => {
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
    items.forEach(el => el.classList.remove("selected"));
    if (e && e.currentTarget) e.currentTarget.classList.add("selected");

    this.populatePlots(this.state.currentSelection.companyId, area);
    this.modalStep(3);
  },

  populatePlots(companyId, area) {
    const list = document.getElementById("plotList");
    const company = this.data.companies.find(c => c.id == companyId);
    if (!list || !company) return;

    list.innerHTML = "";
    // Filter plots by selected area
    const filteredPlots = company.plots.filter(p => (p.area || "غير محدد") === area);
    
    filteredPlots.forEach(plot => {
      const item = document.createElement("div");
      item.className = "list-select-item";
      item.textContent = plot.id;
      item.onclick = (e) => this.selectPlot(plot.id, e);
      list.appendChild(item);
    });
  },

  selectPlot(plotId, e) {
    this.state.currentSelection.plotId = plotId;
    const company = this.data.companies.find(c => c.id == this.state.currentSelection.companyId);
    const plot = company.plots.find(p => p.id == plotId);

    // UI update
    const items = document.querySelectorAll("#plotList .list-select-item");
    items.forEach(el => el.classList.remove("selected"));
    if (e && e.currentTarget) e.currentTarget.classList.add("selected");

    // Update Summary
    document.getElementById("summaryCompany").textContent = company.name;
    document.getElementById("summaryArea").textContent = plot.area || "غير محدد";
    document.getElementById("summaryPlot").textContent = plot.id;
    
    // Store metadata
    this.state.currentSelection.metadata = {
        owner: plot.owner,
        consultant: plot.consultant,
        area: plot.area
    };

    this.modalStep(4);
  },


  modalStep(step) {
    document.querySelectorAll(".modal-step").forEach(s => s.classList.remove("active"));
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
    const query = document.getElementById("siteSearchInput").value.toLowerCase();
    if (!query) {
        this.populateCompanies();
        this.modalStep(1);
        return;
    }

    const results = [];
    this.data.companies.forEach(company => {
        company.plots.forEach(plot => {
            if (plot.id.toLowerCase().includes(query)) {
                results.push({
                    companyName: company.name,
                    companyId: company.id,
                    plot: plot
                });
            }
        });
    });

    // Display search results in the current step (or switch to a results list)
    this.modalStep(3); // Go to plot selection step to show results
    const list = document.getElementById("plotList");
    list.innerHTML = "";
    
    results.slice(0, 20).forEach(res => {
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
      this.modalStep('Add');
  },

  registerNewSite() {
      const company = document.getElementById("newSiteCompany").value;
      const area = document.getElementById("newSiteArea").value;
      const plot = document.getElementById("newSitePlot").value;

      if (!company || !plot) {
          this.showToast("يرجى إدخال اسم الشركة ورقم الأرض");
          return;
      }

      this.state.selectedSite = {
          company: company,
          area: area || "غير محدد",
          plot: plot,
          owner: "يدوي",
          consultant: "يدوي"
      };

      document.getElementById("siteName").textContent = `${plot}`;
      this.closeSiteModal();
      this.showToast("تمت إضافة الموقع وتحديده");

      if (this.state.pendingAction) {
          const action = this.state.pendingAction;
          this.state.pendingAction = null;
          this.action(action);
      }
  },


  saveSiteFinal() {
    const company = this.data.companies.find(c => c.id == this.state.currentSelection.companyId);
    const plotId = this.state.currentSelection.plotId;
    const meta = this.state.currentSelection.metadata;

    this.state.selectedSite = {
      company: company.name,
      plot: plotId,
      area: meta.area,
      owner: meta.owner,
      consultant: meta.consultant
    };

    // Persist to local storage
    localStorage.setItem("selectedSite", JSON.stringify(this.state.selectedSite));

    // Update UI Header
    document.getElementById("siteName").textContent = `${plotId}`;
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

  render() {
    const current = this.pages[this.state.currentPage];

    // Update Title
    document.getElementById("navTitle").textContent = current.title;

    // Update Visibility
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(current.id).classList.add("active");

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
            new_level: 'علام جيت لفل جديد',
            survey_consultant: 'رفع أرض للاستشاري',
            excavation_bottom: 'قاع حفر',
            tie_beam: 'تايبيم',
            roofs: 'أسقف',
            gps_survey: 'رفع بال GPS',
            total_station_survey: 'رفع Totalstation',
            point_staking: 'توقيع نقاط',
            level_staking: 'توقيع منسوب'
        };

        const label = labels[id] || 'إجراء غير معروف';
        
        // Populate Action Page Header
        document.getElementById("actionPageTitle").textContent = label;
        document.getElementById("actionSitePlot").textContent = this.state.selectedSite.plot;
        document.getElementById("actionSiteCompany").textContent = this.state.selectedSite.company;

        // Reset and Build Form
        document.getElementById("actionNotes").value = "";
        this.buildActionForm(id);

        this.navigateTo('action');
    },

    buildActionForm(id) {
        const container = document.getElementById("actionFormContainer");
        container.innerHTML = "";
        const form = document.createElement("div");
        form.className = "action-form-content";

        if (id === 'new_level') {
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
        } else if (id === 'excavation_bottom') {
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
                    <input type="date" id="action_date" value="${new Date().toISOString().split('T')[0]}">
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
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Global Exposure
window.app = app;

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
