import { t, onLangChange } from './i18n';
import './style.css';
import { shell, MissionUI, icon } from './ui';
import { MissionPlayer } from './sim/player';
import { FlightScene, type Quality } from './scene/scene';
import { MissionAudio } from './audio';
import type { MissionData, VehicleId } from './sim/types';

shell();
const worker=new Worker(new URL('./sim/worker.ts',import.meta.url),{type:'module'});
const audio=new MissionAudio();
let player:MissionPlayer|null=null,scene:FlightScene|null=null,ui:MissionUI|null=null;
const error=(key:string)=>{
  document.querySelector('#loading')!.classList.remove('loaded');
  const title=document.querySelector<HTMLElement>('#loading>span')!;
  const detail=document.querySelector<HTMLElement>('#loading-detail')!;
  title.dataset.i18n='loading.failed';title.textContent=t('loading.failed');
  detail.dataset.i18n=key;detail.textContent=t(key);document.querySelector('.loading-line')?.remove();
};
worker.onerror=event=>{console.error(event.message);error('error.worker');};
worker.onmessage=(event:MessageEvent<{type:string;data:MissionData;message?:string;code?:'validation'|'calculation'}>)=>{
  if(event.data.type==='error'){console.error(event.data.message);error(event.data.code==='validation'?'error.validation':'error.calculation');worker.terminate();return;}
  try{
    const data=event.data.data;
    player=new MissionPlayer(data);scene=new FlightScene(document.querySelector<HTMLCanvasElement>('#viewport')!,data);ui=new MissionUI(data,player);
    ui.ready();worker.terminate();
    const toggle=async()=>{
      if(!player)return;
      if(player.time>=data.end-.01)player.reset();
      if(!player.playing){try{await audio.unlock();}catch{audio.setEnabled(false);updateSoundButton();}player.playing=true;}else{player.playing=false;speechSynthesis.cancel();}
    };
    document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>void toggle();
    document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{player!.reset();scene!.override=null;scene!.setManual(false);audio.update(player!.frame,'stack',false);updateCameraButtons();};
    document.querySelector<HTMLInputElement>('#scrubber')!.oninput=e=>player!.seekPresentation(Number((e.target as HTMLInputElement).value));
    document.querySelector<HTMLSelectElement>('#speed-select')!.onchange=e=>{const value=(e.target as HTMLSelectElement).value;player!.mode=value==='auto'?'auto':Number(value);};
    document.querySelector<HTMLSelectElement>('#quality')!.onchange=e=>scene!.setQuality((e.target as HTMLSelectElement).value as Quality);
    const updateCameraButtons=()=>{
      document.querySelectorAll<HTMLElement>('[data-vehicle]').forEach(el=>el.classList.toggle('active',el.dataset.vehicle===(scene!.override||'auto')));
      const button=document.querySelector<HTMLButtonElement>('#camera')!;button.setAttribute('aria-pressed',String(scene!.manual));button.innerHTML=`${icon('camera')}<span>${t(scene!.manual?'camera.free':'camera.auto')}</span>`;
    };
    document.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach(b=>b.onclick=()=>{scene!.override=b.dataset.vehicle==='auto'?null:b.dataset.vehicle as VehicleId;scene!.setManual(false);updateCameraButtons();});
    document.querySelector<HTMLButtonElement>('#camera')!.onclick=()=>{scene!.setManual(!scene!.manual);updateCameraButtons();};
    const updateSoundButton=()=>{
      const b=document.querySelector<HTMLButtonElement>('#sound')!;
      b.innerHTML=icon(audio.enabled?'sound':'mute');
      b.dataset.i18nAriaLabel=audio.enabled?'header.sound.on':'header.sound.off';
      b.setAttribute('aria-label',t(b.dataset.i18nAriaLabel));
    };
    document.querySelector<HTMLButtonElement>('#sound')!.onclick=()=>{audio.setEnabled(!audio.enabled);updateSoundButton();};
    onLangChange(()=>{updateCameraButtons();updateSoundButton();});
    document.querySelector<HTMLButtonElement>('#fullscreen')!.onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});};
    document.addEventListener('keydown',e=>{
      if(document.querySelector<HTMLDialogElement>('#science')!.open||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLButtonElement)return;
      if(e.code==='Space'){e.preventDefault();void toggle();}
      if(e.code==='ArrowRight'){e.preventDefault();player!.seek(player!.time+10);}
      if(e.code==='ArrowLeft'){e.preventDefault();player!.seek(player!.time-10);}
      if(e.code==='KeyR'){player!.reset();}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden){player!.playing=false;speechSynthesis.cancel();}});
    document.querySelector('#viewport')!.addEventListener('webglcontextlost',e=>{e.preventDefault();player!.playing=false;error('error.webgl.lost');});
    // Readable automation/debug surface; uses the same player and render path as the UI.
    Object.assign(window,{flight:{data,player,scene,seek:(time:number)=>player!.seek(time),get frame(){return player!.frame;}}});
    let previous=performance.now();
    function animate(now:number){
      try{
        const dt=Math.min((now-previous)/1000,.1);previous=now;player!.tick(dt);
        const frame=player!.frame;scene!.render(frame,dt);audio.update(frame,scene!.currentVehicle,player!.playing);ui!.update(frame,scene!,now);
        requestAnimationFrame(animate);
      }catch(caught){player!.playing=false;console.error(caught);error('error.render');}
    }
    requestAnimationFrame(animate);
    window.addEventListener('pagehide',()=>{scene?.dispose();audio.dispose();},{once:true});
  }catch(caught){console.error(caught);error('error.webgl');}
};
worker.postMessage({type:'calculate'});
