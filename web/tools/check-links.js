const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

function shouldSkip(filePath) {
  const normalized = filePath.replaceAll(path.sep, "/");
  return normalized.includes("/LIP/") || normalized.includes("/_web_zip_restore/");
}

function walk(dir, visitor) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (shouldSkip(filePath)) continue;
    if (entry.isDirectory()) walk(filePath, visitor);
    else visitor(filePath);
  }
}

walk(root, (filePath) => {
  if (!filePath.endsWith(".html")) return;
  const source = fs.readFileSync(filePath, "utf8");
  const attrRe = /(?:src|href)=['"]([^'"]+)['"]/gi;
  let match;

  while ((match = attrRe.exec(source))) {
    const url = match[1];
    if (/^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(url)) continue;

    const cleanUrl = url.split(/[?#]/)[0];
    if (!cleanUrl || cleanUrl.startsWith("#")) continue;

    const resolved = path.resolve(path.dirname(filePath), cleanUrl);
    const exists = fs.existsSync(resolved) || fs.existsSync(path.join(resolved, "index.html"));
    if (!exists) {
      failures.push({
        file: path.relative(root, filePath),
        line: source.slice(0, match.index).split(/\r?\n/).length,
        url,
      });
    }
  }
});

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("HTML asset links passed.");
