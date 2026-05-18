const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const preferredOutDir = path.resolve(root, "..", "dist", "cloudflare-pages");
const fallbackOutDir = path.resolve(root, "dist", "cloudflare-pages");
let outDir = preferredOutDir;

const excludedNames = new Set([
  ".git",
  ".qodo",
  "node_modules",
  "dist",
  ".wrangler",
  "tools",
]);

const excludedRootFiles = new Set([
  ".gitignore",
  "CLOUDFLARE_SETUP.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "wrangler.example.toml",
  "local-server-router.php",
  ".env.cloudflare.example",
  "download_libraries.bat",
]);

const excludedExtensions = new Set([
  ".xlsx",
  ".xls",
  ".ods",
]);

function removeDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function canUseDir(target) {
  try {
    ensureDir(target);
    return true;
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES")) {
      return false;
    }
    throw error;
  }
}

function shouldSkip(sourcePath, dirent) {
  if (excludedNames.has(dirent.name)) return true;
  if (sourcePath === root && excludedRootFiles.has(dirent.name)) return true;
  if (sourcePath === root && excludedExtensions.has(path.extname(dirent.name).toLowerCase())) return true;
  return false;
}

function copyTree(source, target) {
  ensureDir(target);
  for (const dirent of fs.readdirSync(source, { withFileTypes: true })) {
    if (shouldSkip(source, dirent)) continue;

    const sourcePath = path.join(source, dirent.name);
    const targetPath = path.join(target, dirent.name);

    if (dirent.isDirectory()) {
      copyTree(sourcePath, targetPath);
      continue;
    }

    if (dirent.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!canUseDir(preferredOutDir)) {
  outDir = fallbackOutDir;
}

removeDir(outDir);
copyTree(root, outDir);
console.log(`Cloudflare Pages build ready: ${path.relative(path.resolve(root, ".."), outDir)}`);
