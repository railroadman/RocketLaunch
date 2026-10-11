import { chromium } from '@playwright/test';
import { mkdir, readdir, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkI18n, checkStartup } from './i18n-checks.mjs';
const ru=JSON.parse(await readFile(new URL('../src/i18n/locales/ru.json',import.meta.url),'utf8'));

const root=path.join(process.env.LOCALAPPDATA||'', 'ms-playwright');
const cached=(await readdir(root).catch(()=>[])).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]));
let executablePath;
for(const name of cached)for(const folder of ['chrome-win64','chrome-win']){
  const candidate=path.join(root,name,folder,'chrome.exe');try{await access(candidate);executablePath=candidate;break;}catch{}
  if(executablePath)break;
}
const browser=await chromium.launch({headless:true,executablePath,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:60000});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
await page.addInitScript(()=>{if(!sessionStorage.getItem('smoke.initialized')){localStorage.setItem('flight.lang','ru');sessionStorage.setItem('smoke.initialized','1');}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await mkdir('artifacts',{recursive:true});
try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.flight&&document.querySelector('#loading')?.classList.contains('loaded'),{timeout:60000});
  await page.waitForTimeout(2500);
  await page.screenshot({path:'artifacts/01-pad.png'});
  const data=await page.evaluate(()=>({separation:window.flight.data.separation,touchdown:window.flight.data.touchdown,deploy:window.flight.data.deployment,seco:window.flight.data.seco,highPlume:window.flight.data.frames.find(f=>f.upper.altitude>=40000).time,events:window.flight.data.events.map(e=>({id:e.id,time:e.time})),error:window.flight.data.landingError,speed:window.flight.data.landingSpeed,orbit:window.flight.data.orbit}));
  console.log('Flight solution',data);
  await page.locator('#sound').click();
  await page.locator('#play').click();await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.flight.player.playing),true);
  await page.locator('#play').click();assert.equal(await page.evaluate(()=>window.flight.player.playing),false);
  const karman=data.events.find(e=>e.id==='karman').time;
  const captures=[['02-liftoff',8],['03-ascent',75],['03b-expanded-plume',data.highPlume],['04-separation',data.separation+4],['05-fairing',190],['05b-karman-line',karman+1],['06-entry',data.events.find(e=>e.id==='entry').time+3],['07-landing',data.touchdown-6],['08-touchdown',data.touchdown+2],['09-deployment',data.deploy+24]];
  for(const [name,time] of captures){
    await page.evaluate(t=>window.flight.seek(t),time);await page.waitForTimeout(800);
    await page.screenshot({path:`artifacts/${name}.png`});
    assert.ok(await page.locator('#altitude').textContent());
    if(name==='03b-expanded-plume')assert.equal(await page.evaluate(()=>window.flight.scene.upper.plume.visible),false,'Second-stage engine must stay off before separation');
    if(name==='05b-karman-line'){
      assert.equal(await page.evaluate(()=>window.flight.scene.currentVehicle),'upper');
      assert.equal(await page.locator('#shot-label').textContent(),ru['shot.karman']);
      assert.equal(await page.locator('#plume-state').textContent(),ru['plume.wide']);
      assert.ok(await page.locator('#plume-explanation').isVisible());
      assert.ok((await page.locator('#log-entries').textContent()).includes(ru['event.karman.label']));
      const shape=await page.evaluate(()=>{
        const model=window.flight.scene.upper;
        return {visible:model.plume.visible,width:model.plume.scale.x,nozzle:model.plume.material.uniforms.uNozzleRadius.value*model.plume.scale.x};
      });
      assert.ok(shape.visible&&shape.width>100&&shape.nozzle<1,'Wide plume still starts at the engine nozzle');
    }
  }
  const disposal=await page.evaluate(()=>window.flight.data.disposal);
  for(const [name,time,expected] of [
    ['13-deorbit',(disposal.burnStart+disposal.burnEnd)/2,'deorbit'],
    ['14-reentry',disposal.entry+(disposal.breakup-disposal.entry)*.7,'reentry'],
    ['15-breakup',disposal.breakup+15,'breakup'],
    ['16-ocean',disposal.impact+2,'disposed'],
  ]){
    await page.evaluate(t=>window.flight.seek(t),time);await page.waitForTimeout(800);
    const state=await page.evaluate(()=>{
      const {scene,player}=window.flight,effect=scene.disposalEffects;
      return {phase:player.frame.upper.phase,vehicle:scene.currentVehicle,visible:effect.group.visible,
        sheath:effect.sheath.visible,heat:effect.heat,fragments:effect.fragments.filter(f=>f.visible).length,
        splashes:effect.splashes.filter(f=>f.visible).length,upper:scene.upper.group.visible};
    });
    assert.equal(state.phase,expected);assert.equal(state.vehicle,'upper');assert.equal(state.visible,true);
    if(expected==='reentry')assert.ok(state.sheath&&state.heat>0);
    if(expected==='breakup')assert.ok(!state.upper&&state.fragments>0);
    if(expected==='disposed')assert.ok(!state.upper&&state.splashes>0);
    await page.screenshot({path:`artifacts/${name}.png`});
  }
  await page.evaluate(()=>window.flight.seek(8));await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.flight.scene.disposalEffects.group.visible),false,'Disposal effects disappear on backwards seek');
  await page.evaluate(t=>window.flight.seek(t),disposal.breakup+15);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.flight.scene.disposalEffects.fragments.filter(f=>f.visible).length),7,'Fragments restore on repeated seek');
  await page.locator('#science-open').click();await page.waitForTimeout(400);await page.screenshot({path:'artifacts/10-analysis.png'});
  const download=page.waitForEvent('download');await page.locator('#export').click();const csv=await download;await csv.saveAs('artifacts/telemetry.csv');
  assert.match(csv.suggestedFilename(),/telemetry\.csv$/);
  await page.locator('[data-tab="model"]').click();assert.ok(await page.locator('#model-tab').isVisible());
  await page.locator('#science-close').click();
  await page.locator('[data-vehicle="booster"]').click();assert.equal(await page.evaluate(()=>window.flight.scene.override),'booster');
  await page.locator('#camera').click();assert.equal(await page.evaluate(()=>window.flight.scene.manual),true);
  await page.locator('#camera').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#reset').click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.flight.player.time),-30);
  await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(500);await page.screenshot({path:'artifacts/11-1280.png'});
  const panel=await page.locator('.telemetry').boundingBox(),transport=await page.locator('.transport').boundingBox();
  assert.ok(panel.y+panel.height<=transport.y,'Telemetry must remain above transport controls at 1280×720');
  await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(500);await page.screenshot({path:'artifacts/12-1920.png'});
  await checkI18n(page);
  await checkStartup(browser,process.env.BASE_URL||'http://127.0.0.1:5173/');
  assert.deepEqual(errors,[],'No browser or shader errors');
  console.log('PASS: rendering, keyframes, transport, cameras, analysis, CSV, resize; no browser errors.');
}finally{await browser.close();}
