const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.resolve(__dirname);
const WEB_ROOT = path.join(ROOT, "web");
const APP_ROOT = fs.existsSync(path.join(WEB_ROOT, "index.html")) ? WEB_ROOT : ROOT;
const ENABLE_LOCAL_MODE = process.env.ATLAS_ENABLE_LOCAL_MODE === "1";
const LOCAL_PASSWORD = process.env.ATLAS_LOCAL_ADMIN_PASSWORD || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
};

function normalizePathname(pathname) {
  return String(pathname || "/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function resolveWithinRoot(pathname) {
  const relative = pathname.replace(/^\/+/, "");
  const candidate = path.resolve(APP_ROOT, relative);
  if (candidate === APP_ROOT || candidate.startsWith(`${APP_ROOT}${path.sep}`)) return candidate;
  return null;
}

function injectLocalMode(html) {
  if (!ENABLE_LOCAL_MODE) return html;

  const script = `<script>
(function(){
  localStorage.setItem("atlasAllowLocalMode","1");
  const password = ${JSON.stringify(LOCAL_PASSWORD)};
  if (password) localStorage.setItem("atlasLocalAdminPassword", password);
})();
</script>`;
  return html.includes("</head>") ? html.replace("</head>", `${script}</head>`) : `${script}${html}`;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, { "Content-Type": contentType });
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 - File not found");
  });
}

function serveHtml(res, filePath) {
  fs.readFile(filePath, "utf-8", (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 - Internal Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectLocalMode(data));
  });
}

function resolveIndex() {
  const indexPath = path.join(APP_ROOT, "index.html");
  return [indexPath].find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

const server = http.createServer((req, res) => {
  let pathname = "/";
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    pathname = normalizePathname(requestUrl.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("400 - Bad Request");
    return;
  }

  if (pathname === "/api/bootstrap" || pathname.startsWith("/api/") || pathname.startsWith("/published/")) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found in local static server" }));
    return;
  }

  if (pathname === "/") {
    const indexPath = resolveIndex();
    if (!indexPath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - index.html not found");
      return;
    }
    serveHtml(res, indexPath);
    return;
  }

  const filePath = resolveWithinRoot(pathname);
  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("400 - Invalid path");
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 - File not found");
    return;
  }

  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, "index.html");
    try {
      if (fs.statSync(indexPath).isFile()) {
        serveHtml(res, indexPath);
        return;
      }
    } catch {
      // Fall through to 404 below.
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 - Directory index not found");
    return;
  }

  if (path.extname(filePath).toLowerCase() === ".html") {
    serveHtml(res, filePath);
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Local server running at: http://${HOST}:${PORT}`);
  console.log(`Static root: ${APP_ROOT}`);
  if (ENABLE_LOCAL_MODE) {
    console.log("Local mode is enabled via ATLAS_ENABLE_LOCAL_MODE=1");
  }
});
