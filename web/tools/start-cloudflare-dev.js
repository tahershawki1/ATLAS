const { spawn } = require("child_process");

const env = { ...process.env };
const hasAdminPassword = typeof env.ATLAS_ADMIN_PASSWORD === "string" && env.ATLAS_ADMIN_PASSWORD.trim().length > 0;
const allowsDefaultAdmin = env.ATLAS_ALLOW_DEFAULT_ADMIN === "1";
const needsLocalAdminFallback = !hasAdminPassword && !allowsDefaultAdmin;

if (needsLocalAdminFallback) {
  console.log("[dev:cloudflare] ATLAS_ADMIN_PASSWORD was not set. Using local default for preview only.");
}

const childEnv = {};
for (const [key, value] of Object.entries(env)) {
  // Windows can expose pseudo keys like "=C:" that break spawn when passed through.
  if (key && !key.startsWith("=")) childEnv[key] = value;
}

const command =
  process.platform === "win32"
    ? [
        "npx.cmd",
        "wrangler",
        "pages",
        "dev",
        "../dist/cloudflare-pages",
        ...(needsLocalAdminFallback ? ["-b", "ATLAS_ADMIN_PASSWORD=atlas-local"] : []),
      ].join(" ")
    : [
        "npx",
        "wrangler",
        "pages",
        "dev",
        "../dist/cloudflare-pages",
        ...(needsLocalAdminFallback ? ["-b", "ATLAS_ADMIN_PASSWORD=atlas-local"] : []),
      ].join(" ");

const child = spawn(command, {
  stdio: "inherit",
  env: childEnv,
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
