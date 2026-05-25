const state = {
  original: [],
  current: [],
  leftNames: [],
  rightNames: [],
  scale: 1,
  offsetX: 40,
  offsetY: 40,
  isPanning: false,
  panStart: null,
  sourceFileName: "",
};

const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const canvas = $("mapCanvas");
const ctx = canvas.getContext("2d");

function setStatus(msg) {
  $("status").textContent = msg;
}

function parseNumber(v) {
  if (v === undefined || v === null) return NaN;
  return Number(String(v).trim().replace(/٬/g, "").replace(/٫/g, "."));
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      out.push(cur.trim().replace(/^"|"$/g, ""));
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim().replace(/^"|"$/g, ""));
  return out;
}

function detectDelimiter(line) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  candidates.forEach((candidate) => {
    const score = String(line || "").split(candidate).length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

function detectCSVColumns(lines, delimiter) {
  if (!lines.length) return null;
  
  const firstLineCols = splitCsvLine(lines[0]);
  const headers = firstLineCols.map(h => String(h || "").trim().toLowerCase());
  
  // Search by common header names
  const nameIdx = headers.findIndex(h => /^(name|point|id|pt|pointname|no|#|الاسم|اسم|رقم|النقطة)$/i.test(h));
  const eIdx = headers.findIndex(h => /^(e|x|east|easting|شرق|شرقيات)$/i.test(h));
  const nIdx = headers.findIndex(h => /^(n|y|north|northing|شمال|شماليات)$/i.test(h));
  const zIdx = headers.findIndex(h => /^(z|level|elev|elevation|rl|منسوب|المناسيب|الارتفاع)$/i.test(h));
  const codeIdx = headers.findIndex(h => /^(code|desc|description|remarks|الكود|كود|ملاحظات)$/i.test(h));
  
  // If we found both E and N via headers, we are happy!
  if (eIdx >= 0 && nIdx >= 0) {
      return {
          name: nameIdx >= 0 ? nameIdx : 0,
          e: eIdx,
          n: nIdx,
          z: zIdx >= 0 ? zIdx : (headers.length > 3 ? 3 : -1),
          code: codeIdx >= 0 ? codeIdx : -1,
          hasHeader: true
      };
  }
  
  // Try to analyze the actual values of rows to guess columns
  const sampleRows = [];
  let startRow = 0;
  
  // Check if first row is a header (contains non-numeric in expected coordinate slots)
  const firstRowIsHeader = firstLineCols.slice(1, 4).some(val => isNaN(parseNumber(val)));
  if (firstRowIsHeader) {
      startRow = 1;
  }
  
  for (let i = startRow; i < Math.min(lines.length, startRow + 10); i++) {
      sampleRows.push(splitCsvLine(lines[i]).map(val => parseNumber(val)));
  }
  
  if (!sampleRows.length) return null;
  
  const colCount = splitCsvLine(lines[startRow]).length;
  
  // Find which columns are numeric
  const numericCols = [];
  for (let col = 0; col < colCount; col++) {
      let numericCount = 0;
      let sum = 0;
      sampleRows.forEach(row => {
          if (row[col] !== undefined && !isNaN(row[col])) {
              numericCount++;
              sum += row[col];
          }
      });
      if (numericCount >= sampleRows.length * 0.8) {
          numericCols.push({ index: col, avg: sum / numericCount });
      }
  }
  
  let guessedE = -1;
  let guessedN = -1;
  let guessedZ = -1;
  let guessedName = 0;
  
  // Typically coordinates are large projected values (e.g. UTM or DLTM > 1000)
  const coordsCols = numericCols.filter(c => Math.abs(c.avg) > 1000);
  if (coordsCols.length >= 2) {
      guessedE = coordsCols[0].index;
      guessedN = coordsCols[1].index;
      
      const remainingNumerics = numericCols.filter(c => c.index !== guessedE && c.index !== guessedN);
      if (remainingNumerics.length > 0) {
          guessedZ = remainingNumerics[0].index;
      }
  } else {
      // Fallback
      guessedE = colCount > 1 ? 1 : -1;
      guessedN = colCount > 2 ? 2 : -1;
      guessedZ = colCount > 3 ? 3 : -1;
  }
  
  return {
      name: guessedName,
      e: guessedE,
      n: guessedN,
      z: guessedZ,
      code: colCount > 4 ? 4 : -1,
      hasHeader: firstRowIsHeader
  };
}

function parseSDR(text) {
  const pts = [];
  text.split(/\r?\n/).forEach((line) => {
    if (!line.startsWith("08TP") && !line.startsWith("08KI")) return;
    const name = line.slice(4, 20).trim();
    const e = parseNumber(line.slice(20, 36));
    const n = parseNumber(line.slice(36, 52));
    const z = parseNumber(line.slice(52, 68));
    const code = line.slice(68, 84).trim();
    if (Number.isFinite(e) && Number.isFinite(n) && Number.isFinite(z)) {
      pts.push({ name, e, n, z, code, x: e, y: n, profileX: 0, profileY: z });
    }
  });
  return pts;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return [];
  
  const delimiter = detectDelimiter(lines[0]);
  const config = detectCSVColumns(lines, delimiter);
  if (!config || config.e === -1 || config.n === -1) {
      return [];
  }
  
  const pts = [];
  const startRow = config.hasHeader ? 1 : 0;
  
  for (let i = startRow; i < lines.length; i++) {
      const p = splitCsvLine(lines[i]);
      if (p.length <= Math.max(config.e, config.n)) continue;
      
      const name = config.name >= 0 && p[config.name] !== undefined ? p[config.name] : `P${i + 1 - startRow}`;
      const e = parseNumber(p[config.e]);
      const n = parseNumber(p[config.n]);
      const z = config.z >= 0 && p[config.z] !== undefined ? parseNumber(p[config.z]) : 0;
      const code = config.code >= 0 && p[config.code] !== undefined ? p[config.code] : "";
      
      if (Number.isFinite(e) && Number.isFinite(n)) {
          pts.push({
              name,
              e,
              n,
              z: Number.isFinite(z) ? z : 0,
              code,
              x: e,
              y: n,
              profileX: 0,
              profileY: Number.isFinite(z) ? z : 0,
          });
      }
  }
  return pts;
}

function naturalSortNames(points) {
  return [...points].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" })
  );
}

function autoDetectReference() {
  if (!state.original.length) return;

  const sorted = naturalSortNames(state.original);
  const left = sorted.slice(0, 2).map(p => p.name);
  const right = sorted.slice(-2).map(p => p.name);

  $("leftPoints").value = left.join(",");
  $("rightPoints").value = right.join(",");
  setStatus(`تم التخمين: البداية ${left.join(", ")} / النهاية ${right.join(", ")}`);
}

function getNames(input) {
  return input.split(",").map(x => x.trim()).filter(Boolean);
}

function findByNames(names) {
  const set = new Set(names.map(x => x.toLowerCase()));
  return state.original.filter(p => set.has(String(p.name).toLowerCase()));
}

function averageXY(points) {
  if (!points.length) throw new Error("لم يتم العثور على النقاط المحددة.");
  const sum = points.reduce((a, p) => ({ e: a.e + p.e, n: a.n + p.n }), { e: 0, n: 0 });
  return { e: sum.e / points.length, n: sum.n / points.length };
}

function convertProfile() {
  if (!state.original.length) {
    setStatus("ارفع ملف أولًا.");
    return;
  }

  state.leftNames = getNames($("leftPoints").value);
  state.rightNames = getNames($("rightPoints").value);

  if (!state.leftNames.length || !state.rightNames.length) {
    setStatus("حدد نقاط البداية والنهاية أولًا، أو اضغط تخمين تلقائي.");
    return;
  }

  const leftPts = findByNames(state.leftNames);
  const rightPts = findByNames(state.rightNames);

  if (!leftPts.length || !rightPts.length) {
    setStatus("لم أجد نقاط البداية أو النهاية داخل الملف. راجع الأسماء.");
    return;
  }

  const start = averageXY(leftPts);
  const end = averageXY(rightPts);

  const dx = end.e - start.e;
  const dy = end.n - start.n;
  const len = Math.hypot(dx, dy);

  if (len === 0) {
    setStatus("خط الاتجاه طوله صفر. اختار نقاط مختلفة.");
    return;
  }

  const ux = dx / len;
  const uy = dy / len;

  let converted = state.original.map((p, idx) => {
    const vx = p.e - start.e;
    const vy = p.n - start.n;
    const profileX = vx * ux + vy * uy;
    return {
      ...p,
      id: idx + 1,
      profileX,
      profileY: p.z,
      profileZ: 0,
    };
  });

  const minX = Math.min(...converted.map(p => p.profileX));
  converted = converted.map(p => ({ ...p, profileX: p.profileX - minX }));

  state.current = converted;
  fitView();
  updateAll();
  setStatus("تم التحويل بطريقة Projection على خط الواجهة.");
}

function mirrorX() {
  if (!state.current.length) return;
  const maxX = Math.max(...state.current.map(p => p.profileX));
  const minX = Math.min(...state.current.map(p => p.profileX));
  state.current = state.current.map(p => ({ ...p, profileX: maxX - (p.profileX - minX) }));
  normalizeX();
  setStatus("تم عمل Mirror X.");
}

function reverseOrder() {
  state.current.reverse();
  updateAll();
  setStatus("تم عكس ترتيب النقاط.");
}

function swapXY() {
  state.current = state.current.map(p => ({
    ...p,
    profileX: p.profileY,
    profileY: p.profileX,
  }));
  updateAll();
  setStatus("تم تبديل X/Y.");
}

function normalizeX() {
  if (!state.current.length) return;
  const minX = Math.min(...state.current.map(p => p.profileX));
  state.current = state.current.map(p => ({ ...p, profileX: p.profileX - minX }));
  updateAll();
  setStatus("تم ضبط بداية X عند صفر.");
}

function resetCurrent() {
  state.current = state.original.map((p, i) => ({ ...p, id: i + 1, profileX: p.e, profileY: p.n, profileZ: 0 }));
  fitView();
  updateAll();
  setStatus("تم الرجوع للعرض الأصلي.");
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, Math.floor(rect.width * window.devicePixelRatio));
  canvas.height = Math.max(360, Math.floor(rect.height * window.devicePixelRatio));
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  draw();
}

function getBounds() {
  if (!state.current.length) return null;
  const xs = state.current.map(p => p.profileX);
  const ys = state.current.map(p => p.profileY);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function fitView() {
  const b = getBounds();
  if (!b) return;

  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 1000;
  const h = rect.height || 460;
  const pad = 50;
  const dataW = Math.max(0.001, b.maxX - b.minX);
  const dataH = Math.max(0.001, b.maxY - b.minY);

  state.scale = Math.min((w - pad * 2) / dataW, (h - pad * 2) / dataH);
  if (!Number.isFinite(state.scale) || state.scale <= 0) state.scale = 1;

  state.offsetX = pad - b.minX * state.scale;
  state.offsetY = h - pad + b.minY * state.scale;
}

function worldToScreen(x, y) {
  return {
    x: x * state.scale + state.offsetX,
    y: -y * state.scale + state.offsetY,
  };
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!state.current.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px Cairo";
    ctx.textAlign = "center";
    ctx.fillText("ارفع ملف نقاط للمعاينة", rect.width / 2, rect.height / 2);
    return;
  }

  drawGrid(rect);

  // Polyline preview
  ctx.beginPath();
  state.current.forEach((p, i) => {
    const s = worldToScreen(p.profileX, p.profileY);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const leftSet = new Set(state.leftNames.map(x => x.toLowerCase()));
  const rightSet = new Set(state.rightNames.map(x => x.toLowerCase()));

  state.current.forEach((p) => {
    const s = worldToScreen(p.profileX, p.profileY);
    const lower = String(p.name).toLowerCase();

    let color = "#3b82f6";
    if (leftSet.has(lower)) color = "#22c55e";
    if (rightSet.has(lower)) color = "#ef4444";

    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 10px Cairo, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(p.name), s.x - 8, s.y + 4);
  });
}

function drawGrid(rect) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  const step = 50;
  for (let x = state.offsetX % step; x < rect.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }
  for (let y = state.offsetY % step; y < rect.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }
}

function updateTable() {
  const tbody = $("pointsTable");
  tbody.innerHTML = "";
  state.current.slice(0, 400).forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${fmt(p.profileX)}</td>
      <td>${fmt(p.profileY)}</td>
      <td>${fmt(p.e)}</td>
      <td>${fmt(p.n)}</td>
      <td>${fmt(p.z)}</td>
      <td>${escapeHtml(p.code || "")}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSummary() {
  if (!state.current.length) {
    $("summary").textContent = "لم يتم رفع ملف بعد.";
    return;
  }
  const b = getBounds();
  $("summary").textContent = `عدد النقاط: ${state.current.length} | عرض البروفايل: ${fmt(b.maxX - b.minX)}م | فرق المناسيب: ${fmt(b.maxY - b.minY)}م`;
}

function updateAll() {
  updateTable();
  updateSummary();
  draw();
  window.AtlasCoordinatesExport?.updateButtonState?.();
}

function fmt(v) {
  return Number(v).toFixed(3);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function makeCSV(rows) {
  return rows.map(row => row.map(cell => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function exportCivilCSV() {
  if (!state.current.length) return;
  const format = $("civilFormat").value;

  const rows = state.current.map((p, i) => {
    const desc = `${p.name}${p.code ? " " + p.code : ""}`.trim();
    if (format === "PNEZD") {
      return [i + 1, fmt(p.profileY), fmt(p.profileX), "0.000", desc];
    }
    return [i + 1, fmt(p.profileX), fmt(p.profileY), "0.000", desc];
  });

  download(`facade_profile_${format}.csv`, makeCSV(rows));
}

function exportReviewCSV() {
  if (!state.current.length) return;
  const rows = [[
    "PointName", "X_Profile", "Y_Level", "Z", "Original_E", "Original_N", "Original_Level", "Code"
  ]];

  state.current.forEach(p => {
    rows.push([p.name, fmt(p.profileX), fmt(p.profileY), "0.000", fmt(p.e), fmt(p.n), fmt(p.z), p.code || ""]);
  });

  download("facade_profile_review.csv", makeCSV(rows));
}

function exportDXF() {
  if (!state.current.length) return;

  let dxf = "";
  dxf += "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";

  state.current.forEach(p => {
    const x = fmt(p.profileX);
    const y = fmt(p.profileY);
    const label = `${p.name}${p.code ? "-" + p.code : ""}`;

    dxf += `0\nPOINT\n8\nFACADE_PROFILE_POINTS\n10\n${x}\n20\n${y}\n30\n0.000\n`;
    dxf += `0\nTEXT\n8\nFACADE_PROFILE_LABELS\n10\n${x}\n20\n${fmt(p.profileY + 0.08)}\n30\n0.000\n40\n0.120\n1\n${label}\n`;
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  download("facade_profile_points.dxf", dxf);
}

// App events initialization
function initApp() {
  $("uploadBtn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    const text = await file.text();
    const ext = file.name.split(".").pop().toLowerCase();
    state.sourceFileName = file.name;
    $("fileHint").textContent = `تم اختيار: ${file.name}`;

    let pts = ext === "sdr" ? parseSDR(text) : parseCSV(text);

    if (!pts.length) {
      setStatus("لم أستطع قراءة نقاط من الملف. راجع ترتيب الأعمدة.");
      return;
    }

    state.original = pts;
    state.current = pts.map((p, i) => ({ ...p, id: i + 1, profileX: p.e, profileY: p.n, profileZ: 0 }));

    autoDetectReference();
    fitView();
    updateAll();
    setStatus(`تم تحميل ${pts.length} نقطة من الملف: ${file.name}`);
  });

  $("autoDetectBtn").addEventListener("click", autoDetectReference);
  $("convertBtn").addEventListener("click", convertProfile);
  $("mirrorBtn").addEventListener("click", mirrorX);
  $("reverseBtn").addEventListener("click", reverseOrder);
  $("swapXYBtn").addEventListener("click", swapXY);
  $("normalizeBtn").addEventListener("click", normalizeX);
  $("fitBtn").addEventListener("click", () => { fitView(); draw(); });
  $("resetBtn").addEventListener("click", resetCurrent);
  $("exportCivilCsvBtn").addEventListener("click", exportCivilCSV);
  $("exportDxfBtn").addEventListener("click", exportDXF);
  $("exportReviewBtn").addEventListener("click", exportReviewCSV);

  canvas.addEventListener("mousedown", (e) => {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
  });

  window.addEventListener("mouseup", () => {
    state.isPanning = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!state.isPanning || !state.panStart) return;
    state.offsetX = state.panStart.ox + (e.clientX - state.panStart.x);
    state.offsetY = state.panStart.oy + (e.clientY - state.panStart.y);
    draw();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const beforeX = (mx - state.offsetX) / state.scale;
    const beforeY = -(my - state.offsetY) / state.scale;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    state.scale *= factor;

    state.offsetX = mx - beforeX * state.scale;
    state.offsetY = my + beforeY * state.scale;

    draw();
  }, { passive: false });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  
  // Register unified coordinate exporter provider
  if (window.AtlasCoordinatesExport?.registerProvider) {
    window.AtlasCoordinatesExport.registerProvider(
      () => {
        // If current points have been computed, export them
        const rows = state.current.map((p) => ({
          name: p.name,
          easting: p.profileX,
          northing: p.profileY,
          elevation: 0,
          code: p.code || ""
        }));
        return {
          rows,
          meta: {
            sourceTitle: "بروفايل الواجهة",
            sourcePage: "facade-profile",
            sourceCrs: "DLTM",
            suggestedBaseName: `facade_profile_${state.sourceFileName ? state.sourceFileName.split(".")[0] : "export"}`
          }
        };
      },
      { id: "facade-profile" }
    );
  }
}

// Authentication Check & App Start
document.addEventListener("DOMContentLoaded", async () => {
  if (window.AtlasAuth) {
    try {
      await window.AtlasAuth.initialize();
      const allowed = await window.AtlasAuth.requirePageAccess("pages.facade-profile");
      if (!allowed) return;
      window.AtlasAuth.decorateShell();
    } catch (e) {
      console.warn("Auth initialization failed, starting offline:", e);
    }
  }
  initApp();
});
