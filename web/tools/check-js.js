const { execFileSync } = require("node:child_process");
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
  if (!filePath.endsWith(".js")) return;
  try {
    execFileSync(process.execPath, ["--check", filePath], { stdio: "pipe" });
  } catch (error) {
    failures.push({
      file: path.relative(root, filePath),
      error: String(error.stderr || error.message).trim(),
    });
  }
});

walk(root, (filePath) => {
  if (!filePath.endsWith(".html")) return;
  const source = fs.readFileSync(filePath, "utf8");
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;

  while ((match = scriptRe.exec(source))) {
    index += 1;
    const attrs = match[1] || "";
    const code = match[2] || "";
    const isExternal = /\bsrc\s*=/.test(attrs);
    const isModule = /type\s*=\s*['"]module['"]/i.test(attrs);
    if (isExternal || isModule || !code.trim()) continue;

    try {
      new Function(code);
    } catch (error) {
      failures.push({
        file: path.relative(root, filePath),
        script: index,
        line: source.slice(0, match.index).split(/\r?\n/).length,
        error: error.message,
      });
    }
  }
});

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("JavaScript syntax checks passed.");
