import {chromium} from '@playwright/test';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const name=(await readdir(root)).filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))[0];
const browser=await chromium.launch({executablePath:path.join(root,name,'chrome-win64','chrome.exe'),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('flight.lang','ru'));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5174/');
  await page.waitForFunction(()=>window.flight&&document.querySelector('#loading').classList.contains('loaded'));
  assert.equal(await page.locator('#speed-select option[value="auto"]').textContent(),'АВТО · 4:50');
  assert.equal(await page.locator('#speed-select option[value="1"]').count(),1);
  const d=await page.evaluate(()=>window.flight.data.disposal);
  for(const [name,t] of [['14-reentry',d.entry+(d.breakup-d.entry)*.7],['15-breakup',d.breakup+15],['16-ocean',d.impact+2]]){
    await page.evaluate(t=>window.flight.seek(t),t);await page.waitForTimeout(500);
    console.log(name,await page.evaluate(()=>({phase:window.flight.player.frame.upper.phase,heat:window.flight.scene.disposalEffects.heat})));
    await page.screenshot({path:`artifacts/${name}.png`});
  }
  assert.deepEqual(errors,[]);console.log('PASS: disposal rendering and 4:50 speed selector.');
}finally{await browser.close();}
