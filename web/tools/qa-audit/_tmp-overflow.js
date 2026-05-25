const { chromium } = require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/pages/login/?atlas_local_mode=1&atlas_local_password=atlas-local',{waitUntil:'networkidle'});
  await page.fill('#username','admin'); await page.fill('#password','atlas-local'); await page.click('#submitBtn'); await page.waitForTimeout(700);
  await page.goto('http://127.0.0.1:4173/pages/new-level-mark/?atlas_local_mode=1',{waitUntil:'networkidle'});
  const data=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const offenders=[];
    document.querySelectorAll('*').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width>0 && r.right-vw>1){
        offenders.push({tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,120), right:Math.round(r.right), vw, diff:Math.round(r.right-vw), width:Math.round(r.width)});
      }
    });
    return offenders.slice(0,20);
  });
  console.log(JSON.stringify(data,null,2));
  await browser.close();
})();
