import { chromium } from '@playwright/test';
import { mkdir, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const cache=path.join(process.env.LOCALAPPDATA||'', 'ms-playwright');
const cached=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]));
let executablePath;
for(const name of cached){
  for(const folder of ['chrome-win64','chrome-win']){
    const candidate=path.join(cache,name,folder,'chrome.exe');
    try{await access(candidate);executablePath=candidate;break;}catch{}
  }
  if(executablePath)break;
}
const browser=await chromium.launch({headless:true,executablePath,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:60000});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await mkdir('artifacts',{recursive:true});
try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.flight&&document.querySelector('#loading')?.classList.contains('loaded'),{timeout:60000});
  const data=await page.evaluate(()=>({touchdown:window.flight.data.touchdown,error:window.flight.data.landingError,deploy:window.flight.data.deployment,end:window.flight.data.end}));
  const measurements=[];
  for(const time of [510,data.touchdown+1,data.touchdown+2.137,data.touchdown+6.49]){
    await page.evaluate(t=>window.flight.seek(t),time);
    await page.waitForTimeout(500);
    measurements.push(await page.evaluate(()=>{
      const {scene,frame}=window.flight;
      // Both rendered objects share the floating origin. Compare their own positions.
      const delta=scene.booster.group.position.clone().sub(scene.landingPad.position);
      return {time:frame.time,phase:frame.booster.phase,offset:delta.length(),horizontal:Math.hypot(delta.x,delta.z)};
    }));
  }
  console.log('Rendered landing offsets',measurements);
  await page.screenshot({path:'artifacts/fix-landing.png'});
  const karman=await page.evaluate(()=>window.flight.data.events.find(e=>e.id==='karman').time);
  await page.evaluate(t=>window.flight.seek(t),karman+1);
  await page.waitForTimeout(1500);
  console.log('Karman camera',await page.evaluate(()=>{
    const {scene}=window.flight;
    const point=scene.upper.group.getWorldPosition(scene.upper.group.position.clone()).project(scene.camera);
    return {camera:scene.camera.position.toArray(),point:point.toArray(),visible:scene.upper.plume.visible,width:scene.upper.plume.scale.x};
  }));
  await page.screenshot({path:'artifacts/fix-karman.png'});
  await page.evaluate(t=>window.flight.seek(t),data.deploy+24);
  await page.waitForTimeout(1000);
  console.log('Earth material',await page.evaluate(()=>{
    const planet=window.flight.scene.planet,mat=planet.material;
    const texture=mat.map||mat.uniforms?.uSurface?.value;
    return {type:mat.type,textureWidth:texture?.image?.width,textureHeight:texture?.image?.height};
  }));
  await page.screenshot({path:'artifacts/fix-earth.png'});
  const ocean=await page.evaluate(()=>{
    const {scene,frame}=window.flight;
    scene.render(frame,0);
    const canvas=document.createElement('canvas');canvas.width=scene.renderer.domElement.width;canvas.height=scene.renderer.domElement.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(scene.renderer.domElement,0,0);
    const pixels=ctx.getImageData(Math.round(canvas.width*.33),Math.round(canvas.height*.70),Math.round(canvas.width*.24),Math.round(canvas.height*.09)).data;
    const sum=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)sum[c]+=pixels[i+c];
    return sum.map(value=>value/(pixels.length/4));
  });
  console.log('Orbital ocean mean RGB',ocean);
  if(process.env.DIAGNOSE){
    await page.evaluate(()=>{const s=window.flight.scene;s.atmosphere.material.uniforms.uOpacity.value=0;});
    await page.waitForTimeout(500);await page.screenshot({path:'artifacts/earth-no-atmosphere.png'});
  }
  if(!process.env.DIAGNOSE){
    for(const m of measurements.filter(m=>m.phase==='landed'))assert.ok(Math.abs(m.offset-data.error)<.03,`Rendered landing at ${m.time} must match the calculated contact; got ${m.offset} m, expected ${data.error} m`);
    assert.ok(ocean[2]>ocean[0]*1.5&&ocean[2]>ocean[1]*1.15,'Orbital ocean must remain blue under sunset lighting');
    assert.deepEqual(errors,[],'No browser or shader errors');
    console.log('PASS: rendered contact matches numerical landing at fractional mission times.');
  }
}finally{await browser.close();}
