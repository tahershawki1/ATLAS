(function () {
  if (window.AtlasCoordinatesExport) return;

  const STORAGE_KEY = "atlasCoordinatesExportPayload";
  const EXPORT_PAGE_PATH = "/pages/coordinates-export/";
  const PROVIDERS = new Map();

  const CRS_OPTIONS = {
    DLTM: {
      label: "DLTM",
      proj4:
        "+proj=tmerc +lat_0=0 +lon_0=55.3333333333333 +k=1 +x_0=500000 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
    },
    UTM40N: {
      label: "UTM Z40N",
      proj4: "+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs +type=crs",
    },
    UTM39N: {
      label: "UTM Z39N",
      proj4: "+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs +type=crs",
    },
  };

  const UI = {
    launchButtonText: "تصدير الإحداثيات",
    noRowsMessage: "لا توجد إحداثيات جاهزة للتصدير في هذه الصفحة.",
    missingBridgeMessage: "تعذر فتح صفحة التصدير الآن.",
  };

  let launchBtn = null;

  function normalizeText(value) {
    return String(value ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeNumberString(value) {
    return String(value ?? "").replace(/,/g, ".").trim();
  }

  function parseNumeric(value) {
    const num = Number(normalizeNumberString(value));
    return Number.isFinite(num) ? num : null;
  }

  function sanitizeExportBaseName(baseName, fallback = "extracted-coordinates") {
    const cleaned = String(baseName ?? "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return cleaned || fallback;
  }

  function deriveSuggestedFileBaseName(fileName, fallback = "extracted-coordinates") {
    const rawName = String(fileName ?? "").split(/[\\/]/).pop() || "";
    const withoutExt = rawName.replace(/\.[^.]+$/, "");
    return sanitizeExportBaseName(withoutExt, fallback);
  }

  function ensureFileExtension(fileName, extension) {
    const ext = String(extension ?? "").replace(/^\./, "").toLowerCase();
    if (!ext) return sanitizeExportBaseName(fileName);
    const safeName = sanitizeExportBaseName(fileName, "extracted-coordinates");
    return safeName.toLowerCase().endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`;
  }

  function promptExportFileName(extension, suggestedBaseName) {
    const safeExt = String(extension ?? "").replace(/^\./, "").toLowerCase();
    const safeBase = sanitizeExportBaseName(suggestedBaseName, "extracted-coordinates");
    const answer = window.prompt(`اكتب اسم الملف للتصدير (${safeExt.toUpperCase()})`, safeBase);
    if (answer === null) return null;
    return ensureFileExtension(answer, safeExt);
  }

  function downloadText(text, fileName, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function normalizeKind(value) {
    const kind = normalizeText(value).toUpperCase();
    if (!kind) return "";
    if (kind === "LATLON" || kind === "WGS84" || kind === "GEO") return "LATLON";
    return "PROJECTED";
  }

  function detectRowKind(northingValue, eastingValue, sourceKind) {
    const knownKind = normalizeKind(sourceKind);
    if (knownKind) return knownKind;

    const northing = parseNumeric(northingValue);
    const easting = parseNumeric(eastingValue);
    if (northing === null || easting === null) return "PROJECTED";

    const isLatLon =
      (Math.abs(northing) <= 90 && Math.abs(easting) <= 180) ||
      (Math.abs(easting) <= 90 && Math.abs(northing) <= 180);
    return isLatLon ? "LATLON" : "PROJECTED";
  }

  function toRowShape(rawRow, index) {
    const row = rawRow || {};
    const name = normalizeText(row.name || row.point || row.point_name || row.id || `P${index + 1}`);
    const northing = normalizeNumberString(
      row.northing ?? row.north ?? row.y ?? row.latitude ?? row.lat ?? row.Latitude,
    );
    const easting = normalizeNumberString(
      row.easting ?? row.east ?? row.x ?? row.longitude ?? row.lon ?? row.lng ?? row.Longitude,
    );
    const elevation = normalizeNumberString(row.elevation ?? row.z ?? row.level ?? row.rl ?? "");
    const code = normalizeText(row.code ?? row.description ?? row.desc ?? "");
    const page = normalizeText(row.page ?? row.pageNumber ?? "");
    const source = normalizeText(row.source ?? row.origin ?? "");
    const kind = detectRowKind(northing, easting, row.kind);

    return {
      id: normalizeText(row.id || `${index + 1}`),
      name: name || `P${index + 1}`,
      northing,
      easting,
      elevation,
      code,
      page,
      source,
      kind,
    };
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    const out = [];
    const signatures = new Set();

    rows.forEach((rawRow, index) => {
      const row = toRowShape(rawRow, index);
      if (parseNumeric(row.northing) === null || parseNumeric(row.easting) === null) return;

      const signature = [
        row.name.toLowerCase(),
        row.northing,
        row.easting,
        row.elevation,
        row.code.toLowerCase(),
        row.kind,
      ].join("|");
      if (signatures.has(signature)) return;
      signatures.add(signature);
      out.push(row);
    });

    return out.map((row, index) => ({
      ...row,
      id: row.id || String(index + 1),
    }));
  }

  function escapeCsvCell(value) {
    const raw = String(value ?? "");
    if (raw.includes('"') || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  function buildCsv(rows) {
    const normalized = normalizeRows(rows);
    const headers = ["name", "northing", "easting", "elevation", "code", "page", "source", "kind"];
    const lines = [headers.join(",")];
    normalized.forEach((row) => {
      const cells = headers.map((key) => escapeCsvCell(row[key]));
      lines.push(cells.join(","));
    });
    return lines.join("\r\n");
  }

  function buildSdr(rows) {
    const normalized = normalizeRows(rows);

    const fitNumber = (value, width, decimals = 8, padChar = " ") => {
      const num = parseNumeric(value) ?? 0;
      let text = num.toFixed(decimals);

      if (text.length > width) {
        for (let d = decimals - 1; d >= 0; d -= 1) {
          const candidate = num.toFixed(d);
          if (candidate.length <= width) {
            text = candidate;
            break;
          }
        }
      }
      if (text.length > width) {
        text = text.slice(0, width);
      }

      return text.padEnd(width, padChar);
    };

    const fitText = (value, width) => {
      const raw = normalizeText(value);
      if (raw.length >= width) return raw.slice(0, width);
      return raw.padEnd(width, " ");
    };

    const fitTextRight = (value, width) => {
      const raw = normalizeText(value);
      if (raw.length >= width) return raw.slice(raw.length - width);
      return raw.padStart(width, " ");
    };

    const lines = [
      "00NMSDR33                               111111",
      "10NM>RED EXPORT 33  121111",
      "13NMAngle Unit: Degrees",
      "13DU1:Meters:",
      "13NMPressure Unit: MmHg",
      "13NMTempurature Unit: Celsius",
      "13NMCoordinate Format: N-E",
      "13CCPlane Curvature Correction: Yes",
    ];

    normalized.forEach((row) => {
      const nameField = fitTextRight(row.name, 16);
      const northField = fitNumber(row.northing, 16, 8, "0");
      const eastField = `${fitNumber(row.easting, 15, 8, "0")} `;
      const elevationField = fitNumber(row.elevation, 10, 8, " ").padEnd(16, " ");
      const codeField = fitText(row.code, 16);
      lines.push(`08KI${nameField}${northField}${eastField}${elevationField}${codeField}`);
    });

    return lines.join("\r\n");
  }

  function buildDxf(rows) {
    const normalized = normalizeRows(rows);
    const lines = ["0", "SECTION", "2", "ENTITIES"];
    normalized.forEach((row) => {
      const easting = parseNumeric(row.easting);
      const northing = parseNumeric(row.northing);
      const elevation = parseNumeric(row.elevation) ?? 0;
      if (northing === null || easting === null) return;
      lines.push(
        "0",
        "POINT",
        "8",
        "COORDS",
        "10",
        String(easting),
        "20",
        String(northing),
        "30",
        String(elevation),
      );
    });
    lines.push("0", "ENDSEC", "0", "EOF");
    return lines.join("\n");
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function toWgs84FromRow(row, sourceCrsKey = "DLTM") {
    const northing = parseNumeric(row?.northing);
    const easting = parseNumeric(row?.easting);
    if (northing === null || easting === null) return null;

    const kind = detectRowKind(northing, easting, row?.kind);
    if (kind === "LATLON") {
      if (Math.abs(northing) <= 90 && Math.abs(easting) <= 180) {
        return { lat: northing, lon: easting };
      }
      if (Math.abs(easting) <= 90 && Math.abs(northing) <= 180) {
        return { lat: easting, lon: northing };
      }
      return null;
    }

    const sourceKey = CRS_OPTIONS[sourceCrsKey] ? sourceCrsKey : "DLTM";
    const source = CRS_OPTIONS[sourceKey];
    if (!source || typeof window.proj4 !== "function") return null;

    try {
      const projected = window.proj4(source.proj4, "EPSG:4326", [easting, northing]);
      const lon = Number(projected?.[0]);
      const lat = Number(projected?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch (_) {
      return null;
    }
  }

  function buildKml(rows, sourceCrsKey = "DLTM") {
    const normalized = normalizeRows(rows);
    const placemarks = [];
    normalized.forEach((row, index) => {
      const wgs = toWgs84FromRow(row, sourceCrsKey);
      if (!wgs) return;
      const z = parseNumeric(row.elevation) ?? 0;
      placemarks.push(`
    <Placemark>
      <name>${escapeXml(row.name || `Point ${index + 1}`)}</name>
      <description>${escapeXml(row.code || "")}</description>
      <Point><coordinates>${wgs.lon},${wgs.lat},${z}</coordinates></Point>
    </Placemark>`);
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Extracted Coordinates</name>${placemarks.join("")}
  </Document>
</kml>`;
  }

  function readPayload() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        rows: normalizeRows(parsed?.rows || []),
        meta: parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {},
      };
    } catch (_) {
      return null;
    }
  }

  function savePayload(payload) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearPayload() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function resolveProviderResult(value) {
    if (Array.isArray(value)) return { rows: value, meta: {} };
    if (value && typeof value === "object") {
      return {
        rows: Array.isArray(value.rows) ? value.rows : [],
        meta: value.meta && typeof value.meta === "object" ? value.meta : {},
      };
    }
    return { rows: [], meta: {} };
  }

  function collectFromProviders() {
    let mergedRows = [];
    const meta = {};
    const contributors = [];

    PROVIDERS.forEach((entry, id) => {
      if (!entry || typeof entry.provider !== "function") return;
      try {
        const resolved = resolveProviderResult(entry.provider());
        const rows = normalizeRows(resolved.rows);
        if (!rows.length) return;
        mergedRows = mergedRows.concat(rows);
        contributors.push(id);

        if (!meta.sourceTitle && resolved.meta.sourceTitle) meta.sourceTitle = resolved.meta.sourceTitle;
        if (!meta.sourcePage && resolved.meta.sourcePage) meta.sourcePage = resolved.meta.sourcePage;
        if (!meta.suggestedBaseName && resolved.meta.suggestedBaseName) {
          meta.suggestedBaseName = resolved.meta.suggestedBaseName;
        }
        if (!meta.sourceCrs && resolved.meta.sourceCrs) meta.sourceCrs = resolved.meta.sourceCrs;
      } catch (error) {
        console.warn("Coordinates provider failed:", id, error);
      }
    });

    meta.contributors = contributors;
    return {
      rows: normalizeRows(mergedRows),
      meta,
    };
  }

  function resolveExportPageUrl() {
    return new URL(EXPORT_PAGE_PATH, window.location.origin).toString();
  }

  function open(rows, meta = {}) {
    const normalizedRows = normalizeRows(rows);
    if (!normalizedRows.length) {
      alert(UI.noRowsMessage);
      return false;
    }

    const payload = {
      rows: normalizedRows,
      meta: {
        ...meta,
        sourcePath: window.location.pathname,
        createdAt: new Date().toISOString(),
      },
    };

    const saved = savePayload(payload);
    if (!saved) {
      alert(UI.missingBridgeMessage);
      return false;
    }

    window.location.href = resolveExportPageUrl();
    return true;
  }

  function launch(meta = {}) {
    const collected = collectFromProviders();
    return open(collected.rows, { ...meta, ...collected.meta });
  }

  function registerProvider(provider, options = {}) {
    if (typeof provider !== "function") {
      throw new Error("Coordinates provider must be a function.");
    }
    const id = String(
      options.id || `coords-provider-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    );
    PROVIDERS.set(id, { provider, options });
    injectButton();
    updateButtonState();
    return id;
  }

  function unregisterProvider(id) {
    PROVIDERS.delete(String(id));
    updateButtonState();
  }

  function shouldShowLaunchButton() {
    if (!document?.body) return false;
    if (document.body.dataset.disableCoordinatesExportButton === "true") return false;
    if (!PROVIDERS.size) return false;
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("/pages/login")) return false;
    if (path.includes("/pages/coordinates-export")) return false;
    return true;
  }

  function removeLaunchButton() {
    if (launchBtn && document.body.contains(launchBtn)) {
      launchBtn.remove();
    }
    launchBtn = null;
  }

  function ensureButtonStyles() {
    if (document.getElementById("atlas-coords-export-style")) return;
    const style = document.createElement("style");
    style.id = "atlas-coords-export-style";
    style.textContent = `
      .atlas-coords-export-btn {
        position: fixed;
        left: 16px;
        bottom: 16px;
        min-height: 46px;
        padding: 0 16px;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #0a7f8a 0%, #1e3a8a 100%);
        color: #ffffff;
        font-family: "Cairo", sans-serif;
        font-size: 0.84rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.22);
        z-index: 2600;
      }
      .atlas-coords-export-btn.is-empty {
        background: #64748b;
      }
    `;
    document.head.appendChild(style);
  }

  function updateButtonState(precomputedRows = null) {
    if (!shouldShowLaunchButton()) {
      removeLaunchButton();
      return;
    }

    const rows = precomputedRows || collectFromProviders().rows;
    const hasRows = rows.length > 0;
    if (!hasRows) {
      removeLaunchButton();
      return;
    }

    if (!launchBtn || !document.body.contains(launchBtn)) {
      injectButton(rows);
      return;
    }

    launchBtn.classList.remove("is-empty");
    launchBtn.title = "فتح فورم تصدير الإحداثيات";
  }

  function injectButton(precomputedRows = null) {
    if (!shouldShowLaunchButton()) {
      removeLaunchButton();
      return;
    }

    const rows = precomputedRows || collectFromProviders().rows;
    if (!rows.length) {
      removeLaunchButton();
      return;
    }

    if (launchBtn && document.body.contains(launchBtn)) {
      updateButtonState(rows);
      return;
    }
    ensureButtonStyles();
    launchBtn = document.createElement("button");
    launchBtn.type = "button";
    launchBtn.className = "atlas-coords-export-btn";
    launchBtn.textContent = UI.launchButtonText;
    launchBtn.addEventListener("click", () => {
      const opened = launch();
      if (!opened) updateButtonState();
    });
    document.body.appendChild(launchBtn);
    updateButtonState(rows);
  }

  function initialize() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectButton, { once: true });
    } else {
      injectButton();
    }
  }

  window.AtlasCoordinatesExport = {
    STORAGE_KEY,
    CRS_OPTIONS,
    parseNumeric,
    normalizeRows,
    sanitizeExportBaseName,
    deriveSuggestedFileBaseName,
    ensureFileExtension,
    promptExportFileName,
    downloadText,
    buildCsv,
    buildSdr,
    buildDxf,
    buildKml,
    toWgs84FromRow,
    readPayload,
    savePayload,
    clearPayload,
    collectFromProviders,
    registerProvider,
    unregisterProvider,
    open,
    launch,
    injectButton,
    updateButtonState,
  };

  initialize();
})();
