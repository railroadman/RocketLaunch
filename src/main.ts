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
const error=(message:string)=>{
  document.querySelector('#loading')!.classList.remove('loaded');document.querySelector('#loading>span')!.textContent='НЕ УДАЛОСЬ ПОДГОТОВИТЬ СЦЕНУ';
  document.querySelector('#loading-detail')!.textContent=message;document.querySelector('.loading-line')?.remove();
};
worker.onerror=()=>error('Ошибка расчётного потока. Обновите страницу, чтобы повторить запуск.');
worker.onmessage=(event:MessageEvent<{type:string;data:MissionData;message?:string}>)=>{
  if(event.data.type==='error'){error(event.data.message||'Ошибка расчёта миссии.');worker.terminate();return;}
  try{
    const data=event.data.data;
    player=new MissionPlayer(data);scene=new FlightScene(document.querySelector<HTMLCanvasElement>('#viewport')!,data);ui=new MissionUI(data,player);
    ui.ready();worker.terminate();
    const toggle=async()=>{
      if(!player)return;
      if(player.time>=data.end-.01)player.reset();
      if(!player.playing){try{await audio.unlock();}catch{audio.setEnabled(false);}player.playing=true;}else{player.playing=false;speechSynthesis.cancel();}
    };
    document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>void toggle();
    document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{player!.reset();scene!.override=null;scene!.setManual(false);audio.update(player!.frame,'stack',false);updateCameraButtons();};
    document.querySelector<HTMLInputElement>('#scrubber')!.oninput=e=>player!.seek(Number((e.target as HTMLInputElement).value));
    document.querySelector<HTMLSelectElement>('#speed-select')!.onchange=e=>{const value=(e.target as HTMLSelectElement).value;player!.mode=value==='auto'?'auto':Number(value);};
    document.querySelector<HTMLSelectElement>('#quality')!.onchange=e=>scene!.setQuality((e.target as HTMLSelectElement).value as Quality);
    const updateCameraButtons=()=>{
      document.querySelectorAll<HTMLElement>('[data-vehicle]').forEach(el=>el.classList.toggle('active',el.dataset.vehicle===(scene!.override||'auto')));
      const button=document.querySelector<HTMLButtonElement>('#camera')!;button.setAttribute('aria-pressed',String(scene!.manual));button.innerHTML=`${icon('camera')}<span>${scene!.manual?'СВОБОДНАЯ КАМЕРА':'АВТОКАМЕРА'}</span>`;
    };
    document.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach(b=>b.onclick=()=>{scene!.override=b.dataset.vehicle==='auto'?null:b.dataset.vehicle as VehicleId;scene!.setManual(false);updateCameraButtons();});
    document.querySelector<HTMLButtonElement>('#camera')!.onclick=()=>{scene!.setManual(!scene!.manual);updateCameraButtons();};
    document.querySelector<HTMLButtonElement>('#sound')!.onclick=()=>{audio.setEnabled(!audio.enabled);const b=document.querySelector<HTMLButtonElement>('#sound')!;b.innerHTML=icon(audio.enabled?'sound':'mute');b.setAttribute('aria-label',audio.enabled?'Выключить звук':'Включить звук');};
    document.querySelector<HTMLButtonElement>('#fullscreen')!.onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});};
    document.addEventListener('keydown',e=>{
      if(document.querySelector<HTMLDialogElement>('#science')!.open||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLButtonElement)return;
      if(e.code==='Space'){e.preventDefault();void toggle();}
      if(e.code==='ArrowRight'){e.preventDefault();player!.seek(player!.time+10);}
      if(e.code==='ArrowLeft'){e.preventDefault();player!.seek(player!.time-10);}
      if(e.code==='KeyR'){player!.reset();}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden){player!.playing=false;speechSynthesis.cancel();}});
    document.querySelector('#viewport')!.addEventListener('webglcontextlost',e=>{e.preventDefault();player!.playing=false;error('Графический контекст потерян. Обновите страницу и выберите более низкое качество.');});
    // Readable automation/debug surface; uses the same player and render path as the UI.
    Object.assign(window,{flight:{data,player,scene,seek:(time:number)=>player!.seek(time),get frame(){return player!.frame;}}});
    let previous=performance.now();
    function animate(now:number){
      try{
        const dt=Math.min((now-previous)/1000,.1);previous=now;player!.tick(dt);
        const frame=player!.frame;scene!.render(frame,dt);audio.update(frame,scene!.currentVehicle,player!.playing);ui!.update(frame,scene!,now);
        requestAnimationFrame(animate);
      }catch(caught){player!.playing=false;console.error(caught);error('Ошибка рендера. Обновите страницу; если ошибка повторится, проверьте поддержку WebGL 2 и аппаратное ускорение.');}
    }
    requestAnimationFrame(animate);
    window.addEventListener('pagehide',()=>{scene?.dispose();audio.dispose();},{once:true});
  }catch(caught){console.error(caught);error(caught instanceof Error?caught.message:'WebGL 2 недоступен. Используйте современный браузер с аппаратным ускорением.');}
};
worker.postMessage({type:'calculate'});
