const { chromium } = require('playwright');
(async()=>{
  const base='http://127.0.0.1:4173';
  const routes=['/','/pages/new/','/pages/check/','/pages/survey/','/pages/new-level-mark/','/pages/point-staking/','/pages/level-budget/','/pages/coordinates-extractor/','/pages/coordinates-proposal/','/pages/coordinates-export/','/pages/facade-profile/','/pages/shared-file/','/pages/site-management/','/pages/admin/'];
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:360,height:800},isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto(base+'/pages/login/?atlas_local_mode=1&atlas_local_password=atlas-local',{waitUntil:'networkidle'});
  await page.fill('#username','admin'); await page.fill('#password','atlas-local'); await page.click('#submitBtn'); await page.waitForTimeout(600);
  for(const route of routes){
    await page.goto(base+route,{waitUntil:'networkidle'}); await page.waitForTimeout(250);
    const issues=await page.evaluate(()=>{
      const controls=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});
      return controls.map(el=>{
        if(el.matches('input[type="checkbox"], input[type="radio"]')){const l=el.closest('label');if(l){const lr=l.getBoundingClientRect(); if(lr.width>=36&&lr.height>=36) return null;}}
        if(el.matches('.leaflet-control-attribution a')) return null;
        const r=el.getBoundingClientRect();
        if(r.width<36||r.height<36){return {tag:el.tagName.toLowerCase(),cls:(el.className||'').toString(),text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,50),w:Math.round(r.width),h:Math.round(r.height)}}
        return null;
      }).filter(Boolean);
    });
    if(issues.length){
      console.log('\n'+route);
      console.log(JSON.stringify(issues,null,2));
    }
  }
  await browser.close();
})();
