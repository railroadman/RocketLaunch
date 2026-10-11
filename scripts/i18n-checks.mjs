import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const codes=['ru','en','uk','de','fr','es'];
const dictionaries=Object.fromEntries(await Promise.all(codes.map(async code=>[code,JSON.parse(await readFile(new URL(`../src/i18n/locales/${code}.json`,import.meta.url),'utf8'))])));

export async function checkI18n(page){
  async function choose(code,host='#language-picker'){
    await page.locator(`${host} .lang-button`).click();
    // Compare within one event turn: animation must not disguise a reset or seek.
    const preserved=await page.evaluate(({code,host})=>{
      const {player,scene,data}=window.flight;
      const canvas=document.querySelector('#viewport'),timeline=document.querySelector('.timeline-event');
      const snapshot=()=>JSON.stringify({time:player.time,playing:player.playing,mode:player.mode,override:scene.override,manual:scene.manual,position:scene.camera.position.toArray(),target:scene.controls.target.toArray(),quality:document.querySelector('#quality').value,sound:document.querySelector('#sound').dataset.i18nAriaLabel,tab:document.querySelector('[data-tab].active').dataset.tab,scroll:document.querySelector('#science').scrollTop});
      const before=snapshot();document.querySelector(`${host} [data-lang="${code}"]`).click();
      return before===snapshot()&&window.flight.player===player&&window.flight.scene===scene&&window.flight.data===data&&canvas===document.querySelector('#viewport')&&timeline===document.querySelector('.timeline-event');
    },{code,host});
    assert.ok(preserved,`Selecting ${code} must preserve playback, scene, camera, controls and scroll`);
    assert.equal(await page.locator('html').getAttribute('lang'),code);
    assert.equal(await page.evaluate(()=>localStorage.getItem('flight.lang')),code);
    assert.equal(await page.locator(`${host} .lang-code`).textContent(),code.toUpperCase());
    assert.equal(await page.locator(`${host} .lang-button`).getAttribute('aria-expanded'),'false');
    const dict=dictionaries[code];
    const errors=await page.evaluate(dict=>{
      const errors=[];
      document.querySelectorAll('[data-i18n]').forEach(el=>{if(el.textContent!==dict[el.dataset.i18n])errors.push(el.dataset.i18n);});
      document.querySelectorAll('[data-i18n-html]').forEach(el=>{const expected=document.createElement('div');expected.innerHTML=dict[el.dataset.i18nHtml];if(el.textContent!==expected.textContent)errors.push(el.dataset.i18nHtml);});
      for(const attr of ['aria-label','title'])document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>{const key=el.getAttribute(`data-i18n-${attr}`);if(el.getAttribute(attr)!==dict[key])errors.push(key);});
      const f=window.flight,phase=f.player.frame[f.scene.currentVehicle].phase;
      if(document.querySelector('#phase-name').textContent!==dict[`phase.${phase}.title`])errors.push('current phase');
      const entries=f.data.events.filter(e=>e.time<=f.player.time).slice(-4).reverse();
      document.querySelectorAll('.log-entry p').forEach((el,i)=>{if(el.textContent!==dict[`event.${entries[i].id}.detail`])errors.push('accumulated log');});
      const next=f.data.events.find(e=>e.time>f.player.time);
      if(document.querySelector('#next-label').textContent!==dict[next?`event.${next.id}.label`:'next.done'])errors.push('next event');
      if(document.querySelector('#shot-label').textContent!==dict[f.scene.shotLabelKey])errors.push('camera shot');
      if(document.querySelector('meta[name="description"]').content!==dict['meta.description'])errors.push('description');
      return errors;
    },dict);
    assert.deepEqual(errors,[],`${code}: all interface translations must refresh`);
  }
  await page.locator('#quality').selectOption('low');
  await page.evaluate(()=>window.flight.seek(200));await page.waitForTimeout(250);
  await page.locator('[data-vehicle="booster"]').click();await page.locator('#camera').click();
  await page.locator('#speed-select').selectOption('2');
  for(const code of codes)await choose(code);
  await page.screenshot({path:'artifacts/i18n-es.png'});
  await page.locator('#play').click();
  const start=await page.evaluate(()=>window.flight.player.time);
  for(const code of codes)await choose(code);
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(start=>window.flight.player.playing&&window.flight.player.time>start,start),'Mission keeps running while switching');
  await page.locator('#play').click();
  await page.locator('#science-open').click();
  for(const code of codes){
    await choose(code,'#science-language-picker');
    assert.equal(await page.locator('#state-table th').first().textContent(),dictionaries[code]['row.altitude']);
    assert.equal(await page.locator('#event-table tr').first().locator('td').nth(2).textContent(),dictionaries[code]['event.countdown.detail']);
  }
  await page.locator('[data-tab="model"]').click();
  for(const code of codes)await choose(code,'#science-language-picker');
  await page.evaluate(()=>{document.querySelector('#science').scrollTop=100;});
  // An atomic selection tests scroll retention without Playwright scrolling the picker into view.
  assert.ok(await page.evaluate(()=>{const d=document.querySelector('#science');const scroll=d.scrollTop;document.querySelector('#science-language-picker [data-lang="de"]').click();return d.scrollTop===scroll&&document.querySelector('[data-tab="model"]').classList.contains('active');}));
  await page.locator('#science-close').click();
  await page.locator('#language-picker .lang-button').focus();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.lang),'es');
  await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.lang),'ru');
  await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.dataset.lang),'es');
  await page.keyboard.press('Enter');assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.locator('#language-picker .lang-button').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#language-picker .lang-button').getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'lang-button');
  await page.locator('#language-picker .lang-button').click();await page.locator('.brand').click();
  assert.equal(await page.locator('#language-picker .lang-button').getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>window.flight.seek(window.flight.data.end));await page.waitForTimeout(250);
  for(const code of codes)await choose(code);
  assert.equal(await page.locator('#play span').textContent(),dictionaries.es['play.replay']);
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:width===390?844:720});
    for(const code of codes){
      await choose(code);
      await page.locator('#language-picker .lang-button').click();
      const box=await page.locator('#language-picker .lang-menu').boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=width,`Language menu fits at ${width}px in ${code}`);
      await page.keyboard.press('Escape');
    }
    await page.screenshot({path:`artifacts/i18n-${width}.png`});
  }
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.flight&&document.querySelector('#loading').classList.contains('loaded'));
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  console.log('PASS: six languages, live/pause/end, analysis, state preservation, keyboard, resize and persisted preference.');
}

export async function checkStartup(browser,url){
  for(const state of ['loading','validation','calculation','blocked-storage']){
    const context=await browser.newContext({locale:'fr-FR',viewport:{width:390,height:844}});
    const page=await context.newPage();
    try{
      if(state==='blocked-storage')await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
      await page.route(/\/(?:assets\/worker-|src\/sim\/worker\.ts)/,route=>route.fulfill({contentType:'application/javascript',body:state==='validation'||state==='calculation'?`self.onmessage=()=>self.postMessage({type:'error',code:'${state}',message:'Test error'});`:'self.onmessage=()=>{};'}));
      await page.goto(url,{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('lang'),'fr','Uses the browser language on a fresh visit');
      if(state==='validation'||state==='calculation')await page.waitForFunction(()=>document.querySelector('#loading-detail').dataset.i18n.startsWith('error.'));
      for(const code of codes){
        await page.locator('#language-picker .lang-button').click();await page.locator(`#language-picker [data-lang="${code}"]`).click();
        assert.equal(await page.locator('html').getAttribute('lang'),code);
        const key=state==='validation'||state==='calculation'?`error.${state}`:'loading.detail';
        assert.equal(await page.locator('#loading-detail').textContent(),dictionaries[code][key]);
      }
      const expected=state==='validation'||state==='calculation'?'loading.failed':'loading.title';
      assert.equal(await page.locator('#loading>span').textContent(),dictionaries.es[expected]);
    }finally{await context.close();}
  }
  console.log('PASS: browser language detection, loading/error screens and blocked storage.');
}
