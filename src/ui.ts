import { t as tr, locale, has, translateDOM, onLangChange } from './i18n';
import { mountLanguagePicker } from './i18n/picker';
import type { MissionData, MissionFrame, VehicleId, VehicleState } from './sim/types';
import type { MissionPlayer } from './sim/player';
import type { FlightScene } from './scene/scene';
import { CONFIG } from './sim/mission';
import { clamp } from './sim/math';
import { plumeProfile } from './scene/plume';

export const icon=(name:string)=>{
  const shapes:Record<string,string>={play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',sound:'<path d="M4 9h4l5-4v14l-5-4H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',mute:'<path d="M4 9h4l5-4v14l-5-4H4ZM17 9l5 6M22 9l-5 6"/>',chart:'<path d="M3 3v18h18M7 15l4-6 4 3 6-8"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4Z"/><circle cx="12" cy="13" r="4"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',expand:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.play}</svg>`;
};
export const clock=(time:number)=>{
  const abs=Math.abs(Math.floor(time));return `${time<0?'T−':'T+'}${Math.floor(abs/60).toString().padStart(2,'0')}:${(abs%60).toString().padStart(2,'0')}`;
};
const number=(n:number,digits=0)=>Number.isFinite(n)?n.toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const phases:Record<string,string>={countdown:'01',ascent:'02',coast:'04',boostback:'04',entry:'05',landing:'06',landed:'06',insertion:'03',orbit:'07',deployment:'08','disposal-coast':'09',deorbit:'10',reentry:'11',breakup:'12',disposed:'13'};
const eventText=(event:MissionData['events'][number],field:'label'|'detail')=>has(`event.${event.id}.${field}`)?tr(`event.${event.id}.${field}`):event[field];

export function shell(){
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
    <canvas id="viewport" aria-label="Трёхмерная визуализация полёта ракеты Falcon 9" data-i18n-aria-label="viewport.aria"></canvas>
    <div class="screen-shade"></div>
    <header class="topbar">
      <a class="brand" href="#" aria-label="FLIGHT Mission Control" data-i18n-aria-label="brand.label"><span class="brand-mark">╱╱</span><span>FLIGHT<span class="brand-sub">MISSION CONTROL</span></span></a>
      <div class="mission-meta"><span class="status-dot"></span>FALCON 9 <span class="divider">/</span> STARLINK <span class="tag" data-i18n="header.tag"></span></div>
      <div class="header-actions"><div id="language-picker"></div><button class="icon-button" id="sound" aria-label="Выключить звук" data-i18n-aria-label="header.sound.on" title="Звук" data-i18n-title="header.sound.title">${icon('sound')}</button><button class="icon-button" id="fullscreen" aria-label="Полноэкранный режим" data-i18n-aria-label="header.fullscreen" title="Полный экран" data-i18n-title="header.fullscreen.title">${icon('expand')}</button><span class="utc-label" data-i18n="header.place"></span></div>
    </header>
    <main class="hud">
      <section class="left-column">
        <div class="mission-heading"><span class="eyebrow" data-i18n="hero.eyebrow"></span><h1>FALCON <span>9</span><sup>↗</sup></h1><p data-i18n-html="hero.subtitle"></p></div>
        <div class="phase-card"><span class="phase-index" id="phase-index">01</span><div><span class="eyebrow" data-i18n="phase.label"></span><h2 id="phase-name"></h2></div></div>
        <p class="phase-description" id="phase-description"></p><p class="disposal-note" id="disposal-note" hidden></p>
        <section class="event-log" aria-label="Журнал миссии" data-i18n-aria-label="log.aria"><div class="section-title"><span data-i18n="log.title"></span><span class="log-count" id="log-count">01</span></div><div id="log-entries"></div></section>
      </section>
      <div class="shot-caption"><span class="rec-dot"></span><span id="shot-label"></span><span class="shot-line"></span><span id="camera-range">35 MM</span></div>
      <div class="mission-clock"><span class="eyebrow" data-i18n="clock.label"></span><strong id="mission-time">T−00:30</strong><span class="clock-rate" id="clock-rate"></span></div>
      <aside class="telemetry" aria-label="Основная телеметрия" data-i18n-aria-label="telemetry.aria">
        <div class="section-title"><span><span class="status-dot"></span> <span data-i18n="telemetry.title"></span></span><span class="calculated" data-i18n="telemetry.calc"></span></div>
        <div class="vehicle-label"><span id="vehicle-label"></span><span id="engine-status"></span></div>
        <div class="primary-metric"><span class="metric-label" data-i18n="chart.altitude"></span><div><strong id="altitude">0.00</strong><span data-i18n="unit.km"></span></div><span class="metric-note" data-i18n="metric.altitude.note"></span></div>
        <div class="primary-metric speed"><span class="metric-label" data-i18n="metric.speed"></span><div><strong id="speed">0</strong><span data-i18n="unit.kmh"></span></div><span class="metric-note" data-i18n="metric.speed.note"></span></div>
        <div class="metric-grid">
          <div><span data-i18n="metric.vertical"></span><strong id="vertical">0 <small data-i18n="unit.ms"></small></strong></div>
          <div><span data-i18n="metric.g"></span><strong id="gforce">1.00 <small>g</small></strong></div>
          <div><span data-i18n="chart.q"></span><strong id="pressure">0.0 <small data-i18n="unit.kpa"></small></strong></div>
          <div><span data-i18n="metric.drag"></span><strong id="drag">0.0 <small data-i18n="unit.kn"></small></strong></div>
          <div><span data-i18n="metric.thrust"></span><strong id="thrust">0 <small data-i18n="unit.kn"></small></strong></div>
          <div><span data-i18n="metric.burn"></span><strong id="burn">00:00</strong></div>
        </div>
        <div class="fuel-title"><span><span data-i18n="fuel.title"></span> <span id="fuel-stage">S1</span></span><strong id="fuel">100%</strong></div><div class="fuel-track"><div id="fuel-bar"></div></div>
        <div class="plume-readout"><div><span data-i18n="plume.ambient"></span><strong id="ambient-pressure"></strong></div><div><span data-i18n="plume.engine"></span><strong id="plume-state"></strong></div></div>
        <div class="sparkline-head"><span data-i18n="chart.sparkline.title"></span><span id="altitude-trend"></span></div><canvas id="sparkline" width="540" height="110" aria-label="График высоты" data-i18n-aria-label="chart.sparkline.aria"></canvas>
        <button id="science-open" class="science-button">${icon('chart')}<span data-i18n="science.open"></span>${icon('arrow')}</button>
      </aside>
      <div class="next-event"><span class="eyebrow" data-i18n="next.label"></span><span id="next-label"></span><strong id="next-countdown">00:22</strong></div>
      <div class="orbital-badge" id="orbital-badge" hidden><span class="eyebrow" data-i18n="science.summary.orbit"></span><strong id="orbit-label">300 × 300 <small data-i18n="unit.km"></small></strong><span><span data-i18n="orbit.sats"></span> · <b id="satellite-count">0 / 8</b></span></div>
      <div class="plume-explanation" id="plume-explanation" hidden><span class="eyebrow" data-i18n="plume.explain.label"></span><strong id="plume-title"></strong><p id="plume-description"></p></div>
    </main>
    <footer class="transport">
      <div class="timeline-top"><span data-i18n="timeline.profile"></span><div class="timeline-legend"><span class="amber-dot"></span><span data-i18n="timeline.legend.rocket"></span> <span class="blue-dot"></span><span data-i18n="timeline.legend.return"></span></div><span id="presentation-time">00:00 <i>/ 04:50</i></span></div>
      <div class="timeline"><div class="timeline-fill" id="timeline-fill"></div><div class="timeline-ticks" id="timeline-ticks"></div><input id="scrubber" type="range" min="-30" max="700" step="0.1" value="-30" aria-label="Время миссии" data-i18n-aria-label="timeline.scrub" /></div>
      <div class="transport-row"><div class="play-group"><button id="play" class="play-button" disabled>${icon('play')}<span data-i18n="play.calc"></span></button><button id="reset" class="icon-button" aria-label="Начать заново" data-i18n-aria-label="reset.aria" title="Начать заново" data-i18n-title="reset.aria">${icon('reset')}</button><span class="transport-divider"></span><label class="speed-control"><span data-i18n="speed.label"></span><select id="speed-select" aria-label="Скорость воспроизведения" data-i18n-aria-label="speed.aria"><option value="auto" data-i18n="speed.auto">АВТО · 4:50</option><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option><option value="25">25×</option></select></label></div>
      <div class="view-group"><div class="vehicle-switch" role="group" aria-label="Выбор аппарата" data-i18n-aria-label="vehicle.aria"><button data-vehicle="auto" class="active" data-i18n="vehicle.auto"></button><button data-vehicle="booster" data-i18n="vehicle.boosterBtn"></button><button data-vehicle="upper" data-i18n="vehicle.upperBtn"></button></div><button id="camera" class="camera-button" aria-pressed="false">${icon('camera')}<span data-i18n="camera.auto"></span></button><label class="quality-control"><span class="sr-only" data-i18n="quality.aria"></span><select id="quality"><option value="high" data-i18n="quality.high"></option><option value="medium" data-i18n="quality.medium"></option><option value="low" data-i18n="quality.low"></option></select></label></div></div>
      <div class="bottom-note"><span><span data-i18n="hint.simulation"></span> <span class="divider">/</span> THREE.JS</span><span data-i18n="hint.keys"></span><span id="fps"></span></div>
    </footer>
    <div id="loading" role="status"><div class="loading-mark">╱╱</div><span data-i18n="loading.title"></span><p id="loading-detail" data-i18n="loading.detail"></p><div class="loading-line"></div></div>
    <dialog id="science"><div class="drawer-header"><div><span class="eyebrow" data-i18n="science.eyebrow"></span><h2 data-i18n="science.title"></h2></div><div class="drawer-actions"><div id="science-language-picker"></div><button id="science-close" class="icon-button" aria-label="Закрыть панель" data-i18n-aria-label="science.close">${icon('close')}</button></div></div><div class="analysis-tabs" role="group" aria-label="Раздел анализа" data-i18n-aria-label="science.tabs.aria"><button data-tab="flight" class="active" data-i18n="science.tab.flight"></button><button data-tab="model" data-i18n="science.tab.model"></button><button id="export">${icon('download')} CSV</button></div>
    <div id="flight-tab"><div class="analysis-summary" id="analysis-summary"></div><div class="chart-grid"><div><span><span data-i18n="chart.altitude"></span><i data-i18n="unit.km"></i></span><canvas data-chart="altitude" width="900" height="240"></canvas></div><div><span><span data-i18n="chart.airspeed"></span><i data-i18n="unit.kms"></i></span><canvas data-chart="airspeed" width="900" height="240"></canvas></div><div><span><span data-i18n="chart.q"></span><i data-i18n="unit.kpa"></i></span><canvas data-chart="q" width="900" height="240"></canvas></div><div><span><span data-i18n="chart.fuel"></span><i data-i18n="unit.t"></i></span><canvas data-chart="fuel" width="900" height="240"></canvas></div></div><div class="table-wrap"><table><caption data-i18n="table.state.caption"></caption><thead><tr><th data-i18n="table.col.param"></th><th data-i18n="table.col.booster"></th><th data-i18n="table.col.upper"></th></tr></thead><tbody id="state-table"></tbody></table></div><div class="table-wrap"><table><caption data-i18n="table.events.caption"></caption><thead><tr><th data-i18n="table.col.time"></th><th data-i18n="table.col.event"></th><th data-i18n="table.col.process"></th></tr></thead><tbody id="event-table"></tbody></table></div></div>
    <div id="model-tab" hidden><div class="model-copy"><h3 data-i18n="model.title"></h3><p data-i18n="model.intro"></p><div class="formula" data-i18n-html="model.formulas"></div><h3 data-i18n="model.included.title"></h3><p data-i18n="model.included.text"></p><h3 data-i18n="model.limits.title"></h3><p data-i18n-html="model.limits.text"></p><p data-i18n="model.limits.orbit"></p><div id="parameter-table"></div><h3 data-i18n="model.sources.title"></h3><p data-i18n-html="model.sources.html"></p><h3 data-i18n="model.disposal.title"></h3><p data-i18n="model.disposal.text"></p><p class="model-footnote" data-i18n="model.footnote"></p></div></div></dialog>
  `;
  mountLanguagePicker(document.querySelector<HTMLElement>('#language-picker')!);
  mountLanguagePicker(document.querySelector<HTMLElement>('#science-language-picker')!);
  translateDOM();
  onLangChange(()=>translateDOM());
}
export class MissionUI {
  private refs=new Map<string,HTMLElement>();
  private lastLog='';
  private lastUpdate=0;
  private lastScene:FlightScene|null=null;
  constructor(private data:MissionData,private player:MissionPlayer){
    document.querySelectorAll<HTMLElement>('[id]').forEach(el=>this.refs.set(el.id,el));
    this.el<HTMLInputElement>('scrubber').min='0';this.el<HTMLInputElement>('scrubber').max=String(player.duration);
    this.renderLocalizedData();
    onLangChange(()=>{
      const dialog=this.el<HTMLDialogElement>('science'),scroll=dialog.scrollTop;
      this.renderLocalizedData();this.lastLog='';this.lastUpdate=-Infinity;
      if(this.lastScene)this.update(this.player.frame,this.lastScene,performance.now());
      dialog.scrollTop=scroll;
    });
    this.el('science-open').onclick=()=>this.el<HTMLDialogElement>('science').showModal();this.el('science-close').onclick=()=>this.el<HTMLDialogElement>('science').close();
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el===b));this.el('flight-tab').hidden=b.dataset.tab!=='flight';this.el('model-tab').hidden=b.dataset.tab!=='model';
    });
    this.el('export').onclick=()=>this.exportCSV();
    const explanation=document.createElement('section');
    explanation.innerHTML='<h3 data-i18n="model.plume.title"></h3><p data-i18n-html="model.plume.text"></p>';
    document.querySelector('#model-tab .model-copy')!.insertBefore(explanation,document.querySelector('#parameter-table'));
    translateDOM();
  }
  private renderLocalizedData(){
    const data=this.data,player=this.player;
    const marks=[['liftoff',tr('mark.liftoff')],['separation',tr('mark.separation')],['karman',tr('mark.karman')],['entry',tr('mark.entry')],['touchdown',tr('mark.touchdown')],['deploy',tr('mark.deploy')],['deorbit',tr('mark.deorbit')],['breakup',tr('mark.breakup')],['ocean',tr('mark.ocean')]] as const;
    if(!this.el('timeline-ticks').hasChildNodes())this.el('timeline-ticks').innerHTML=marks.map(([id,label])=>{const event=data.events.find(e=>e.id===id)!;return `<button class="timeline-event ${event.vehicle==='booster'?'booster-event':''}" style="left:${player.presentationAt(event.time)/player.duration*100}%" data-mark="${id}" data-time="${event.time}" aria-label="${tr('timeline.goto',{label})}" title="${label} · ${clock(event.time)}"><i></i><span>${label}</span></button>`;}).join('');
    marks.forEach(([id,label])=>{
      const button=this.el('timeline-ticks').querySelector<HTMLButtonElement>(`[data-mark="${id}"]`)!;
      button.querySelector('span')!.textContent=label;
      button.setAttribute('aria-label',tr('timeline.goto',{label}));
      button.title=`${label} · ${clock(Number(button.dataset.time))}`;
    });
    if(!this.el('event-table').hasChildNodes())this.el('event-table').innerHTML=data.events.map(e=>`<tr data-event-time="${e.time}"><td>${clock(e.time)}</td><td></td><td></td></tr>`).join('');
    this.el('event-table').querySelectorAll('tr').forEach((row,i)=>{
      row.cells[1].textContent=eventText(data.events[i],'label');row.cells[2].textContent=eventText(data.events[i],'detail');
    });
    this.el('parameter-table').innerHTML=`<table><caption>${tr('model.params.caption')}</caption><tbody>${[
      [tr('param.dryBooster'),tr('param.dryBooster.value')],[tr('param.fuelBooster'),tr('param.fuelBooster.value')],[tr('param.dryUpper'),tr('param.dryUpper.value')],[tr('param.fuelUpper'),tr('param.fuelUpper.value')],[tr('param.payload'),tr('param.payload.value')],[tr('param.fairing'),tr('param.fairing.value')],[tr('param.drag'),tr('param.drag.value')],[tr('param.isp1'),tr('param.isp1.value')],[tr('param.isp2'),tr('param.isp2.value')],[tr('param.integrator'),tr('param.integrator.value')],[tr('param.earthRadius'),tr('param.earthRadius.value')],[tr('param.targetOrbit'),tr('param.targetOrbit.value')],[tr('param.inclination'),tr('param.inclination.value')],[tr('param.geometry'),tr('param.geometry.value')],
    ].map(([a,b])=>`<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>`;
    this.el('analysis-summary').innerHTML=`<div><span>${tr('science.summary.orbit')}</span><strong>${number(data.orbit.perigee/1000,1)} × ${number(data.orbit.apogee/1000,1)} <small>${tr('unit.km')}</small></strong></div><div><span>${tr('science.summary.incl')}</span><strong>${number(data.orbit.inclination,2)}<small>°</small></strong></div><div><span>${tr('science.summary.landing')}</span><strong>${number(data.landingError,2)} <small>${tr('unit.m')}</small></strong></div><div><span>${tr('science.summary.speed')}</span><strong>${number(data.landingSpeed,2)} <small>${tr('unit.ms')}</small></strong></div>`;
    document.querySelectorAll<HTMLButtonElement>('.timeline-event').forEach(b=>b.onclick=()=>player.seek(Number(b.dataset.time)));
  }
  el<T extends HTMLElement=HTMLElement>(id:string){return this.refs.get(id)! as T;}
  ready(){this.el('loading').classList.add('loaded');this.el<HTMLButtonElement>('play').disabled=false;this.el('play').innerHTML=`${icon('play')}<span>${tr('play.start')}</span>`;}
  update(frame:MissionFrame,scene:FlightScene,now:number){
    this.lastScene=scene;
    if(now-this.lastUpdate<85)return;this.lastUpdate=now;
    const t=frame.time,s=frame[scene.currentVehicle],phase=phases[s.phase];
    this.el('phase-index').textContent=phase;this.el('phase-name').textContent=tr(`phase.${s.phase}.title`);this.el('phase-description').textContent=tr(`phase.${s.phase}.desc`);
    this.el('disposal-note').hidden=t<this.data.disposal.start||scene.currentVehicle!=='upper';
    this.el('disposal-note').textContent=tr(t>=this.data.disposal.breakup?'disposal.note.fragments':'disposal.note.orbit');
    this.el('mission-time').textContent=clock(t);this.el('clock-rate').textContent=this.player.mode==='auto'?tr('clock.auto',{rate:number(this.player.rate,1)}):tr('clock.realtime',{mode:number(this.player.mode)});
    this.el('shot-label').textContent=tr(scene.shotLabelKey);this.el('camera-range').textContent=scene.manual?tr('shot.free'):`${Math.round(scene.camera.fov)}° FOV`;
    this.el('altitude').textContent=number(s.altitude/1000,2);this.el('speed').textContent=number(s.airspeed*3.6);
    this.el('vertical').innerHTML=`${number(s.verticalSpeed)} <small>${tr('unit.ms')}</small>`;this.el('gforce').innerHTML=`${number(s.phase==='countdown'||s.phase==='landed'?1:s.properG,2)} <small>g</small>`;
    this.el('pressure').innerHTML=`${number(s.q/1000,1)} <small>${tr('unit.kpa')}</small>`;this.el('drag').innerHTML=`${number(s.drag/1000,1)} <small>${tr('unit.kn')}</small>`;
    this.el('thrust').innerHTML=`${number(s.thrust/1000)} <small>${tr('unit.kn')}</small>`;this.el('burn').textContent=clock(s.burnTime).slice(2);
    const first=scene.currentVehicle!=='upper'||t<this.data.separation,percent=clamp(s.fuel/(first?CONFIG.firstFuel:CONFIG.secondFuel))*100;
    const plume=plumeProfile(s.altitude,first?'booster':'upper',Math.max(1,s.engines));
    const p=plume.pressure;
    this.el('ambient-pressure').innerHTML=p>=1000?`${number(p/1000,1)} <small>${tr('unit.kpa')}</small>`:`${p<.1?p.toLocaleString(locale(),{notation:'scientific',maximumFractionDigits:1}):number(p,2)} <small>${tr('unit.pa')}</small>`;
    this.el('plume-state').textContent=s.thrust<=0?tr('plume.off'):plume.expansion>.65?tr('plume.wide'):plume.expansion>.15?tr('plume.expanding'):tr('plume.narrow');
    const karman=this.data.events.find(e=>e.id==='karman')!.time,nearKarman=Math.abs(t-karman)<10;
    this.el('plume-explanation').hidden=!(s.thrust>0&&s.altitude>18000&&t<karman+12);
    this.el('plume-title').textContent=nearKarman?tr('plume.karman.title'):tr('plume.expand.title');
    this.el('plume-description').textContent=nearKarman?tr('plume.karman.desc'):tr('plume.expand.desc');
    this.el('fuel').textContent=`${number(percent,1)}%`;this.el('fuel-stage').textContent=first?'S1':'S2';this.el('fuel-bar').style.width=`${percent}%`;
    this.el('vehicle-label').textContent=t<this.data.separation?tr('vehicle.both'):scene.currentVehicle==='booster'?tr('vehicle.booster'):tr('vehicle.upper');
    this.el('engine-status').textContent=s.phase==='breakup'||s.phase==='disposed'?tr('disposal.remnants'):s.engines>0?tr(s.engines>1?'engine.onMany':'engine.on',{n:s.engines}):s.phase==='landed'?tr('status.landed'):tr('engine.off');this.el('engine-status').classList.toggle('on',s.thrust>0);
    this.el('altitude-trend').textContent=s.verticalSpeed>0?tr('trend.ascent'):s.phase==='landed'?tr('status.landed'):tr('trend.descent');
    this.el('timeline-fill').style.width=`${this.player.presentationTime/this.player.duration*100}%`;this.el<HTMLInputElement>('scrubber').value=String(this.player.presentationTime);
    this.el('presentation-time').innerHTML=`${clock(this.player.presentationTime).slice(2)} <i>/ ${clock(this.player.duration).slice(2)}</i>`;
    this.el('play').innerHTML=`${icon(this.player.playing?'pause':'play')}<span>${this.player.playing?tr('play.pause'):this.player.time>=this.data.end?tr('play.replay'):t<=-29.9?tr('play.start'):tr('play.continue')}</span>`;
    this.el('play').setAttribute('aria-label',this.player.playing?tr('play.aria.pause'):tr('play.aria.start'));
    const entries=this.data.events.filter(e=>e.time<=t),logKey=entries.map(e=>e.id).join(',');
    if(logKey!==this.lastLog){this.lastLog=logKey;this.el('log-count').textContent=String(entries.length).padStart(2,'0');
      this.el('log-entries').innerHTML=entries.slice(-4).reverse().map((e,i)=>`<div class="log-entry ${i===0?'newest':''}"><time>${clock(e.time)}</time><div><strong>${eventText(e,'label')}</strong><p>${eventText(e,'detail')}</p></div></div>`).join('');}
    const next=this.data.events.find(e=>e.time>t);
    this.el('next-label').textContent=next?eventText(next,'label'):tr('next.done');this.el('next-countdown').textContent=next?clock(next.time-t).slice(2):'✓';
    this.el('orbital-badge').hidden=t<this.data.seco;this.el('orbit-label').innerHTML=`${number(this.data.orbit.perigee/1000)} × ${number(this.data.orbit.apogee/1000)} <small>${tr('unit.km')}</small>`;
    this.el('satellite-count').textContent=`${t<this.data.deployment?0:Math.min(8,Math.floor((t-this.data.deployment)/.5)+1)} / 8`;
    this.el('fps').textContent=tr('fps',{fps:number(scene.fps),triangles:number(scene.renderer.info.render.triangles)});
    this.drawChart(this.el<HTMLCanvasElement>('sparkline'),'altitude',scene.currentVehicle,t,true);
    document.body.classList.toggle('in-flight',t>=0);
    if(this.el<HTMLDialogElement>('science').open){
      document.querySelectorAll<HTMLCanvasElement>('[data-chart]').forEach(c=>this.drawChart(c,c.dataset.chart as keyof VehicleState,'upper',t));
      this.el('state-table').innerHTML=[
        [tr('row.altitude'), 'altitude',1000,2],[tr('row.speed'),'speed',1000,3],[tr('row.airspeed'),'airspeed',1000,3],[tr('row.verticalSpeed'),'verticalSpeed',1,1],[tr('row.mass'),'mass',1000,2],[tr('row.fuel'),'fuel',1000,2],[tr('row.thrust'),'thrust',1000,1],[tr('row.q'),'q',1000,2],[tr('row.drag'),'drag',1000,2],[tr('row.density'),'density',1,6],[tr('row.mach'),'mach',1,2],[tr('row.properG'),'properG',1,2],
      ].map(([label,key,div,digits])=>`<tr><th>${label}</th>${[frame.booster,frame.upper].map(state=>`<td>${number((state[key as keyof VehicleState] as number)/(div as number),digits as number)}</td>`).join('')}</tr>`).join('');
      document.querySelectorAll<HTMLElement>('[data-event-time]').forEach(row=>row.classList.toggle('event-future',Number(row.dataset.eventTime)>t));
    }
  }
  private drawChart(canvas:HTMLCanvasElement,key:keyof VehicleState,vehicle:VehicleId,time:number,spark=false){
    const g=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,pad=spark?4:34;g.clearRect(0,0,w,h);
    const frames=this.data.frames.filter((_,i)=>i%5===0),ids:VehicleId[]=spark?[vehicle]:['upper','booster'];
    const max=Math.max(1,...frames.flatMap(f=>ids.map(id=>f[id][key] as number)))*1.10;
    const x=(t:number)=>pad+(t+30)/(this.data.end+30)*(w-pad*2),y=(v:number)=>h-pad-v/max*(h-pad*2);
    g.strokeStyle='#27313c';g.lineWidth=1;
    for(let i=0;i<4;i++){const yy=pad+i*(h-pad*2)/3;g.beginPath();g.moveTo(pad,yy);g.lineTo(w-pad,yy);g.stroke();if(!spark){g.fillStyle='#78818c';g.font='17px monospace';const div=key==='altitude'||key==='q'||key==='fuel'||key==='airspeed'?1000:1;g.fillText(number(max*(1-i/3)/div,1),2,yy-5);}}
    ids.forEach((id,j)=>{g.strokeStyle=j===0?'#edb66c':'#7caacf';g.lineWidth=spark?2:2.5;g.beginPath();frames.forEach((f,i)=>{const xx=x(f.time),yy=y(f[id][key] as number);i?g.lineTo(xx,yy):g.moveTo(xx,yy);});g.stroke();});
    g.strokeStyle='#e9e4da';g.globalAlpha=.65;g.beginPath();g.moveTo(x(time),pad);g.lineTo(x(time),h-pad);g.stroke();g.globalAlpha=1;
    if(!spark){g.fillStyle='#8993a0';g.font='17px monospace';g.fillText('T+00:00',x(0),h-5);g.fillText(clock(this.data.end),w-120,h-5);}
  }
  exportCSV(){
    const headers=['mission_time_s','vehicle','phase','altitude_m','inertial_speed_m_s','airspeed_m_s','vertical_speed_m_s','mass_kg','fuel_kg','thrust_N','q_Pa','drag_N','proper_g','engine_burn_s'];
    const rows=[headers.join(',')];
    for(const f of this.data.frames.filter((_,i)=>i%5===0))for(const id of ['booster','upper'] as const){const s=f[id];rows.push([f.time.toFixed(2),id,s.phase,...[s.altitude,s.speed,s.airspeed,s.verticalSpeed,s.mass,s.fuel,s.thrust,s.q,s.drag,s.properG,s.burnTime].map(n=>n.toFixed(5))].join(','));}
    const url=URL.createObjectURL(new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='falcon9-calculated-telemetry.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
