const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  console.error('Playwright dependency is missing. Run: npm install playwright --no-save');
  process.exit(1);
}

const routes = [
  '/',
  '/pages/login/',
  '/pages/new/',
  '/pages/check/',
  '/pages/survey/',
  '/pages/new-level-mark/',
  '/pages/point-staking/',
  '/pages/level-budget/',
  '/pages/coordinates-extractor/',
  '/pages/coordinates-proposal/',
  '/pages/coordinates-export/',
  '/pages/facade-profile/',
  '/pages/shared-file/',
  '/pages/site-management/',
  '/pages/admin/',
];

const viewports = [
  { name: 'mobile360', width: 360, height: 800, isMobile: true },
  { name: 'mobile390', width: 390, height: 844, isMobile: true },
  { name: 'tablet', width: 768, height: 1024, isMobile: false },
  { name: 'desktop', width: 1366, height: 768, isMobile: false },
];

const localBase = process.env.ATLAS_QA_LOCAL_BASE || 'http://127.0.0.1:4173';
const prodBase = process.env.ATLAS_QA_PROD_BASE || 'https://atlas-e73.pages.dev';
const localPassword = process.env.ATLAS_QA_LOCAL_PASSWORD || 'atlas-local';
const prodUser = process.env.ATLAS_QA_PROD_USER || '';
const prodPassword = process.env.ATLAS_QA_PROD_PASSWORD || '';
const outDir = path.resolve(process.cwd(), '..', 'audit-artifacts');

function hasProdCreds() {
  return Boolean(prodUser && prodPassword);
}

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const target = argValue('--target', 'both');
const includeLocal = target === 'both' || target === 'local';
const includeProd = target === 'both' || target === 'production';

function recordRedirectExpectation(entry, suiteName) {
  const protectedRoute = entry.route.startsWith('/pages/') && entry.route !== '/pages/login/';
  if (!protectedRoute) return;
  const redirectedToLogin = /\/pages\/login\//.test(entry.finalUrl || '');
  const guestSuite = suiteName.includes('guest');
  entry.redirectIntent = guestSuite ? redirectedToLogin : !redirectedToLogin;
}

async function loginLocal(page) {
  await page.goto(`${localBase}/pages/login/?atlas_local_mode=1&atlas_local_password=${encodeURIComponent(localPassword)}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', localPassword);
  await page.click('#submitBtn');
  await page.waitForTimeout(700);
}

async function loginProd(page) {
  if (!hasProdCreds()) return false;
  await page.goto(`${prodBase}/pages/login/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('#username', prodUser);
  await page.fill('#password', prodPassword);
  await page.click('#submitBtn');
  await page.waitForTimeout(800);
  return true;
}

async function runSuite(base, suiteName, { authMode }) {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const suiteRoutes = authMode === 'none' ? routes : routes.filter((route) => route !== '/pages/login/');

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });

    const authPage = await context.newPage();
    if (authMode === 'local') await loginLocal(authPage);
    if (authMode === 'production') await loginProd(authPage);
    await authPage.close();

    for (const route of suiteRoutes) {
      const page = await context.newPage();
      const entry = {
        suite: suiteName,
        base,
        route,
        viewport: vp.name,
        status: null,
        finalUrl: null,
        title: null,
        consoleErrors: [],
        consoleWarns: [],
        jsErrors: [],
        horizontalOverflow: false,
        touchTargetViolations: 0,
        redirectIntent: null,
        screenshot: null,
        navError: null,
      };

      page.on('console', (msg) => {
        if (msg.type() === 'error') entry.consoleErrors.push(msg.text());
        if (msg.type() === 'warning') entry.consoleWarns.push(msg.text());
      });
      page.on('pageerror', (error) => entry.jsErrors.push(String(error)));

      try {
        const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
        entry.status = response ? response.status() : null;
        await page.waitForTimeout(500);
        entry.finalUrl = page.url();
        entry.title = await page.title();

        const metrics = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          const overflow = Math.max(body?.scrollWidth || 0, html?.scrollWidth || 0) > (html?.clientWidth || 0) + 1;
          const controls = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
          const touchTargetViolations = controls.filter((el) => {
            if (el.matches('input[type="checkbox"], input[type="radio"]')) {
              const label = el.closest('label');
              if (label) {
                const lr = label.getBoundingClientRect();
                if (lr.width >= 36 && lr.height >= 36) return false;
              }
            }
            if (el.matches('.leaflet-control-attribution a')) return false;
            const r = el.getBoundingClientRect();
            return (r.width < 36 || r.height < 36);
          }).length;
          return { horizontalOverflow: overflow, touchTargetViolations };
        });

        entry.horizontalOverflow = metrics.horizontalOverflow && vp.isMobile;
        entry.touchTargetViolations = metrics.touchTargetViolations;
        recordRedirectExpectation(entry, suiteName);

        const safeRoute = route.replace(/[\/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'home';
        const shotName = `${suiteName}-${vp.name}-${safeRoute}.png`;
        const shotPath = path.join(outDir, shotName);
        await page.screenshot({ path: shotPath, fullPage: false });
        entry.screenshot = shotPath;
      } catch (error) {
        entry.navError = String(error && error.message ? error.message : error);
      }

      results.push(entry);
      await page.close();
    }

    await context.close();
  }

  await browser.close();
  return results;
}

function summarize(results) {
  const summary = {
    total: results.length,
    statusFailures: results.filter((r) => (r.status || 0) >= 400 || r.navError).length,
    consoleFailures: results.filter((r) => r.consoleErrors.length > 0 || r.jsErrors.length > 0).length,
    responsiveFailures: results.filter((r) => r.horizontalOverflow).length,
    redirectIntentFailures: results.filter((r) => r.redirectIntent === false).length,
    touchViolations: results.filter((r) => r.touchTargetViolations > 0).length,
  };
  return summary;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const all = [];

  if (includeLocal) {
    const localResults = await runSuite(localBase, 'local-auth', { authMode: 'local' });
    all.push(...localResults);
  }

  if (includeProd) {
    const mode = hasProdCreds() ? 'production' : 'none';
    const prodResults = await runSuite(prodBase, hasProdCreds() ? 'production-auth' : 'production-guest', { authMode: mode });
    all.push(...prodResults);
  }

  const jsonPath = path.join(outDir, 'atlas-qa-audit-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2), 'utf8');

  const summary = summarize(all);
  const summaryPath = path.join(outDir, 'atlas-qa-audit-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('Audit artifacts:');
  console.log(`- ${jsonPath}`);
  console.log(`- ${summaryPath}`);
  console.log(JSON.stringify(summary, null, 2));

  const hasFailures = summary.statusFailures > 0 || summary.consoleFailures > 0 || summary.responsiveFailures > 0 || summary.redirectIntentFailures > 0;
  process.exit(hasFailures ? 2 : 0);
})();
