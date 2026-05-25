const { chromium } = require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:360,height:800},isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/pages/login/?atlas_local_mode=1&atlas_local_password=atlas-local',{waitUntil:'networkidle'});
  await page.fill('#username','admin'); await page.fill('#password','atlas-local'); await page.click('#submitBtn'); await page.waitForTimeout(800);
  await page.goto('http://127.0.0.1:4173/pages/level-budget/?atlas_local_mode=1',{waitUntil:'networkidle'});
  const issues=await page.evaluate(()=>{
    const els=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')];
    return els.map(el=>{const r=el.getBoundingClientRect(); if(r.width>0&&r.height>0&&(r.width<36||r.height<36)) return {tag:el.tagName.toLowerCase(), cls:el.className||'', text:(el.textContent||el.getAttribute('aria-label')||'').trim(), w:Math.round(r.width), h:Math.round(r.height)}; return null;}).filter(Boolean);
  });
  console.log(JSON.stringify(issues,null,2));
  await browser.close();
})();
