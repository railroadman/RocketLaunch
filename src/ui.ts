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
const number=(n:number,digits=0)=>Number.isFinite(n)?n.toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const phases:Record<string,[string,string,string]>={
  countdown:['01','Обратный отсчёт','Готовность систем. Отведение конструкций. Запуск двигателей.'],
  ascent:['02','К орбите','Набор высоты и скорости. Программа гравитационного разворота.'],
  coast:['04','Возвращение','Баллический участок. Ступень направляется к наземной площадке.'],
  boostback:['04','Импульс возврата','Торможение и коррекция прогнозируемой точки приземления.'],
  entry:['05','Вход в атмосферу','Двигатели снижают скорость перед плотными слоями атмосферы.'],
  landing:['06','Посадочный манёвр','Управляемое торможение. Выпуск опор. Точное касание.'],
  landed:['06','Ступень возвращена','Двигатели выключены. Первая ступень на посадочной площадке.'],
  insertion:['03','Орбитальный разгон','Merlin Vacuum выводит полезную нагрузку на начальную орбиту.'],
  orbit:['07','Орбита достигнута','Проверка орбитальных параметров. Подготовка к отделению спутников.'],
  deployment:['08','Спутники на орбите','Отделение восьми аппаратов. Расхождение и раскрытие солнечных батарей.'],
};

export function shell(){
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
    <canvas id="viewport" aria-label="Трёхмерная визуализация полёта ракеты Falcon 9"></canvas>
    <div class="screen-shade"></div>
    <header class="topbar">
      <a class="brand" href="#" aria-label="FLIGHT Mission Control"><span class="brand-mark">╱╱</span><span>FLIGHT<span class="brand-sub">MISSION CONTROL</span></span></a>
      <div class="mission-meta"><span class="status-dot"></span>FALCON 9 <span class="divider">/</span> STARLINK <span class="tag">УЧЕБНАЯ МИССИЯ</span></div>
      <div class="header-actions"><button class="icon-button" id="sound" aria-label="Выключить звук" title="Звук">${icon('sound')}</button><button class="icon-button" id="fullscreen" aria-label="Полноэкранный режим" title="Полный экран">${icon('expand')}</button><span class="utc-label">FLORIDA · SUNSET</span></div>
    </header>
    <main class="hud">
      <section class="left-column">
        <div class="mission-heading"><span class="eyebrow">EARTH → ORBIT → EARTH</span><h1>FALCON <span>9</span><sup>↗</sup></h1><p>Восемь спутников.<br>Одна точная посадка.</p></div>
        <div class="phase-card"><span class="phase-index" id="phase-index">01</span><div><span class="eyebrow">ТЕКУЩИЙ ЭТАП</span><h2 id="phase-name">Обратный отсчёт</h2></div></div>
        <p class="phase-description" id="phase-description"></p>
        <section class="event-log" aria-label="Журнал миссии"><div class="section-title"><span>ЖУРНАЛ ПОЛЁТА</span><span class="log-count" id="log-count">01</span></div><div id="log-entries"></div></section>
      </section>
      <div class="shot-caption"><span class="rec-dot"></span><span id="shot-label">PAD / CAMERA 01</span><span class="shot-line"></span><span id="camera-range">35 MM</span></div>
      <div class="mission-clock"><span class="eyebrow">ВРЕМЯ МИССИИ</span><strong id="mission-time">T−00:30</strong><span class="clock-rate" id="clock-rate">АВТО · 4:30</span></div>
      <aside class="telemetry" aria-label="Основная телеметрия">
        <div class="section-title"><span><span class="status-dot"></span> ТЕЛЕМЕТРИЯ</span><span class="calculated">РАСЧЁТ</span></div>
        <div class="vehicle-label"><span id="vehicle-label">FALCON 9 / ОБЕ СТУПЕНИ</span><span id="engine-status">STANDBY</span></div>
        <div class="primary-metric"><span class="metric-label">ВЫСОТА</span><div><strong id="altitude">0.00</strong><span>км</span></div><span class="metric-note">НАД ПОВЕРХНОСТЬЮ ЗЕМЛИ</span></div>
        <div class="primary-metric speed"><span class="metric-label">СКОРОСТЬ</span><div><strong id="speed">0</strong><span>км/ч</span></div><span class="metric-note">ОТНОСИТЕЛЬНО АТМОСФЕРЫ</span></div>
        <div class="metric-grid">
          <div><span>ВЕРТ. СКОРОСТЬ</span><strong id="vertical">0 <small>м/с</small></strong></div>
          <div><span>ПЕРЕГРУЗКА</span><strong id="gforce">1.00 <small>g</small></strong></div>
          <div><span>СКОРОСТНОЙ НАПОР</span><strong id="pressure">0.0 <small>кПа</small></strong></div>
          <div><span>СОПРОТИВЛЕНИЕ</span><strong id="drag">0.0 <small>кН</small></strong></div>
          <div><span>ТЯГА ДВИГАТЕЛЕЙ</span><strong id="thrust">0 <small>кН</small></strong></div>
          <div><span>ВРЕМЯ РАБОТЫ</span><strong id="burn">00:00</strong></div>
        </div>
        <div class="fuel-title"><span>ТОПЛИВО <span id="fuel-stage">S1</span></span><strong id="fuel">100%</strong></div><div class="fuel-track"><div id="fuel-bar"></div></div>
        <div class="plume-readout"><div><span>ДАВЛЕНИЕ СРЕДЫ · pₐ</span><strong id="ambient-pressure"></strong></div><div><span>ФАКЕЛ ДВИГАТЕЛЯ</span><strong id="plume-state"></strong></div></div>
        <div class="sparkline-head"><span>ПРОФИЛЬ ВЫСОТЫ</span><span id="altitude-trend">ASCENT</span></div><canvas id="sparkline" width="540" height="110" aria-label="График высоты"></canvas>
        <button id="science-open" class="science-button">${icon('chart')}<span>ДАННЫЕ И МОДЕЛЬ</span>${icon('arrow')}</button>
      </aside>
      <div class="next-event"><span class="eyebrow">СЛЕДУЮЩЕЕ СОБЫТИЕ</span><span id="next-label">STRONGBACK RETRACT</span><strong id="next-countdown">00:22</strong></div>
      <div class="orbital-badge" id="orbital-badge" hidden><span class="eyebrow">НАЧАЛЬНАЯ ОРБИТА</span><strong id="orbit-label">300 × 300 <small>км</small></strong><span>СПУТНИКИ · <b id="satellite-count">0 / 8</b></span></div>
      <div class="plume-explanation" id="plume-explanation" hidden><span class="eyebrow">ДАВЛЕНИЕ → ФОРМА СТРУИ</span><strong id="plume-title">Расширение факела</strong><p id="plume-description"></p></div>
    </main>
    <footer class="transport">
      <div class="timeline-top"><span>ПРОФИЛЬ МИССИИ</span><div class="timeline-legend"><span class="amber-dot"></span>РАКЕТА / СПУТНИКИ <span class="blue-dot"></span>ВОЗВРАТ СТУПЕНИ</div><span id="presentation-time">00:00 <i>/ 04:30</i></span></div>
      <div class="timeline"><div class="timeline-fill" id="timeline-fill"></div><div class="timeline-ticks" id="timeline-ticks"></div><input id="scrubber" type="range" min="-30" max="700" step="0.1" value="-30" aria-label="Время миссии" /></div>
      <div class="transport-row"><div class="play-group"><button id="play" class="play-button" disabled>${icon('play')}<span>РАСЧЁТ МИССИИ…</span></button><button id="reset" class="icon-button" aria-label="Начать заново" title="Начать заново">${icon('reset')}</button><span class="transport-divider"></span><label class="speed-control">ТЕМП<select id="speed-select" aria-label="Скорость воспроизведения"><option value="auto">АВТО · 4:30</option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option><option value="25">25×</option></select></label></div>
      <div class="view-group"><div class="vehicle-switch" role="group" aria-label="Выбор аппарата"><button data-vehicle="auto" class="active">РЕЖИССУРА</button><button data-vehicle="booster">СТУПЕНЬ 1</button><button data-vehicle="upper">СТУПЕНЬ 2</button></div><button id="camera" class="camera-button" aria-pressed="false">${icon('camera')}<span>АВТОКАМЕРА</span></button><label class="quality-control"><span class="sr-only">Качество графики</span><select id="quality"><option value="high">HIGH</option><option value="medium">MEDIUM</option><option value="low">LOW</option></select></label></div></div>
      <div class="bottom-note"><span>3D FLIGHT SIMULATION <span class="divider">/</span> THREE.JS</span><span>ПРОБЕЛ — ПАУЗА <span class="divider">/</span> ← → ПЕРЕМОТКА</span><span id="fps">WEBGL 2 · LIVE RENDER</span></div>
    </footer>
    <div id="loading" role="status"><div class="loading-mark">╱╱</div><span>ПОДГОТОВКА МИССИИ</span><p id="loading-detail">Расчёт траекторий, топлива и орбиты…</p><div class="loading-line"></div></div>
    <dialog id="science"><div class="drawer-header"><div><span class="eyebrow">FLIGHT ANALYSIS / РАСЧЁТНАЯ МИССИЯ</span><h2>За кадром — физика.</h2></div><button id="science-close" class="icon-button" aria-label="Закрыть панель">${icon('close')}</button></div><div class="analysis-tabs" role="group" aria-label="Раздел анализа"><button data-tab="flight" class="active">ПОЛЁТ И ТЕЛЕМЕТРИЯ</button><button data-tab="model">МОДЕЛЬ И ДОПУЩЕНИЯ</button><button id="export">${icon('download')} CSV</button></div>
    <div id="flight-tab"><div class="analysis-summary" id="analysis-summary"></div><div class="chart-grid"><div><span>ВЫСОТА <i>км</i></span><canvas data-chart="altitude" width="900" height="240"></canvas></div><div><span>СКОРОСТЬ ОТНОСИТЕЛЬНО АТМОСФЕРЫ <i>км/с</i></span><canvas data-chart="airspeed" width="900" height="240"></canvas></div><div><span>СКОРОСТНОЙ НАПОР <i>кПа</i></span><canvas data-chart="q" width="900" height="240"></canvas></div><div><span>ОСТАТОК ТОПЛИВА <i>т</i></span><canvas data-chart="fuel" width="900" height="240"></canvas></div></div><div class="table-wrap"><table><caption>Состояние аппаратов на выбранный момент</caption><thead><tr><th>ПАРАМЕТР</th><th>ПЕРВАЯ СТУПЕНЬ</th><th>ВТОРАЯ СТУПЕНЬ</th></tr></thead><tbody id="state-table"></tbody></table></div><div class="table-wrap"><table><caption>События миссии · полное расчётное время</caption><thead><tr><th>ВРЕМЯ</th><th>СОБЫТИЕ</th><th>ПРОЦЕСС</th></tr></thead><tbody id="event-table"></tbody></table></div></div>
    <div id="model-tab" hidden><div class="model-copy"><h3>Учебная миссия Falcon 9 / Starlink</h3><p>Это численная демонстрация с облегчённой полезной нагрузкой и возвращением на землю. Показания рассчитываются из одного состояния полёта. Они не являются телеметрией реального запуска SpaceX.</p><div class="formula">q = ½ρv² <span>СКОРОСТНОЙ НАПОР</span><br>D = C<sub>d</sub>qA <span>СИЛА СОПРОТИВЛЕНИЯ</span><br>a = (T + D) / m − μr / |r|³ <span>ВЕКТОРНОЕ УРАВНЕНИЕ ДВИЖЕНИЯ</span></div><h3>Что учитывается</h3><p>Сферическая вращающаяся Земля, гравитация, изменение плотности атмосферы, сопротивление с зависимостью от числа Маха, тяга и расход топлива. Скорость воздуха включает вращение атмосферы вместе с Землёй. Орбита определяется по положению и инерциальной скорости, а не только по высоте.</p><h3>Границы модели</h3><p>Рассчитывается поступательное движение в 3D. Ориентация задаётся приближённой программой управления; вращательная динамика, ветер, реальная аэродинамика рулей и CFD не моделируются. Характеристики двигателей, массы и C<sub>d</sub> — открытые данные и обозначенные инженерные приближения. Возврат допускает глубокое дросселирование; посадочное торможение продолжительнее, чем у типичной реальной миссии. Объёмные эффекты выхлопа — визуальные шейдеры, а не расчёт газодинамики.</p><p>Начальная орбита отделения отличается от рабочей орбиты группировки. Подъём орбиты электрическими двигателями спутников и последующие месяцы эксплуатации не входят в этот показ.</p><div id="parameter-table"></div><h3>Источники</h3><p><a href="https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf" target="_blank" rel="noreferrer">SpaceX · Falcon User’s Guide ↗</a><br><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/" target="_blank" rel="noreferrer">NASA · сопротивление и скоростной напор ↗</a><br><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/" target="_blank" rel="noreferrer">NASA · модель атмосферы ↗</a></p><p class="model-footnote">Камеры, визуальные эффекты и раскрытие солнечных батарей художественно интерпретированы. Автоматический показ сокращает длительные участки; коэффициент ускорения виден рядом с временем миссии.</p></div></div></dialog>
  `;
}
export class MissionUI {
  private refs=new Map<string,HTMLElement>();
  private lastLog='';
  private lastUpdate=0;
  constructor(private data:MissionData,private player:MissionPlayer){
    document.querySelectorAll<HTMLElement>('[id]').forEach(el=>this.refs.set(el.id,el));
    this.el<HTMLInputElement>('scrubber').max=String(data.end);
    const marks=[['liftoff','СТАРТ'],['separation','РАЗДЕЛЕНИЕ'],['karman','100 КМ'],['entry','ВХОД'],['touchdown','ПОСАДКА'],['deploy','СПУТНИКИ']] as const;
    this.el('timeline-ticks').innerHTML=marks.map(([id,label])=>{const event=data.events.find(e=>e.id===id)!;return `<button class="timeline-event ${event.vehicle==='booster'?'booster-event':''}" style="left:${(event.time+30)/(data.end+30)*100}%" data-time="${event.time}" aria-label="Перейти к событию ${label}" title="${label} · ${clock(event.time)}"><i></i><span>${label}</span></button>`;}).join('');
    this.el('event-table').innerHTML=data.events.map(e=>`<tr data-event-time="${e.time}"><td>${clock(e.time)}</td><td>${e.label}</td><td>${e.detail}</td></tr>`).join('');
    this.el('parameter-table').innerHTML=`<table><caption>Принятые параметры модели</caption><tbody>${[
      ['Сухая масса первой ступени','22,2 т'],['Топливо первой ступени','410,9 т'],['Сухая масса второй ступени','4,0 т'],['Топливо второй ступени','107,5 т'],['Полезная нагрузка','2,08 т · 8 условных аппаратов'],['Масса обтекателя','1,90 т'],['Cᵈ / ракета · возврат','0,24 · 1,10 + трансзвуковая поправка'],['Удельный импульс S1','282–311 с · возврат 305 с'],['Удельный импульс S2','348 с'],['Интегратор','RK4 · шаг 0,02 с'],['Радиус Земли','6 371 км'],['Высота целевой орбиты','300 км'],['Целевое наклонение','53° · приближённый азимут'],['Геометрия','Около 70 м · диаметр 3,66 м'],
    ].map(([a,b])=>`<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>`;
    this.el('analysis-summary').innerHTML=`<div><span>НАЧАЛЬНАЯ ОРБИТА</span><strong>${number(data.orbit.perigee/1000,1)} × ${number(data.orbit.apogee/1000,1)} <small>км</small></strong></div><div><span>НАКЛОНЕНИЕ</span><strong>${number(data.orbit.inclination,2)}<small>°</small></strong></div><div><span>ТОЧНОСТЬ ПОСАДКИ</span><strong>${number(data.landingError,2)} <small>м</small></strong></div><div><span>СКОРОСТЬ КАСАНИЯ</span><strong>${number(data.landingSpeed,2)} <small>м/с</small></strong></div>`;
    document.querySelectorAll<HTMLButtonElement>('.timeline-event').forEach(b=>b.onclick=()=>player.seek(Number(b.dataset.time)));
    this.el('science-open').onclick=()=>this.el<HTMLDialogElement>('science').showModal();this.el('science-close').onclick=()=>this.el<HTMLDialogElement>('science').close();
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el===b));this.el('flight-tab').hidden=b.dataset.tab!=='flight';this.el('model-tab').hidden=b.dataset.tab!=='model';
    });
    this.el('export').onclick=()=>this.exportCSV();
    const model=document.querySelector('#model-tab .model-copy')!;
    const explanation=document.createElement('section');
    explanation.innerHTML='<h3>Расширение факела и линия Кармана</h3><p>При снижении давления окружающей среды газы за соплом расширяются сильнее: узкая струя постепенно превращается в широкий разреженный факел. Размеры и цвет шейдера — визуальное приближение, зависящее от расчётного атмосферного давления, а не CFD. Переход плавный и начинается задолго до 100 км. Линия Кармана на высоте 100 км — условная граница космоса; атмосфера на этой высоте ещё существует.</p><p><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust/" target="_blank" rel="noreferrer">NASA · давление и ракетная тяга ↗</a><br><a href="https://www.fai.org/news/statement-about-karman-line" target="_blank" rel="noreferrer">FAI · линия Кармана ↗</a></p>';
    model.insertBefore(explanation,document.querySelector('#parameter-table'));
  }
  el<T extends HTMLElement=HTMLElement>(id:string){return this.refs.get(id)! as T;}
  ready(){this.el('loading').classList.add('loaded');this.el<HTMLButtonElement>('play').disabled=false;this.el('play').innerHTML=`${icon('play')}<span>НАЧАТЬ МИССИЮ</span>`;}
  update(frame:MissionFrame,scene:FlightScene,now:number){
    if(now-this.lastUpdate<85)return;this.lastUpdate=now;
    const t=frame.time,s=frame[scene.currentVehicle],phase=phases[s.phase];
    this.el('phase-index').textContent=phase[0];this.el('phase-name').textContent=phase[1];this.el('phase-description').textContent=phase[2];
    this.el('mission-time').textContent=clock(t);this.el('clock-rate').textContent=this.player.mode==='auto'?`АВТО · ${number(this.player.rate,1)}×`:`РЕАЛЬНОЕ ВРЕМЯ · ${this.player.mode}×`;
    this.el('shot-label').textContent=scene.shotLabel;this.el('camera-range').textContent=scene.manual?'FREE CAMERA':`${Math.round(scene.camera.fov)}° FOV`;
    this.el('altitude').textContent=number(s.altitude/1000,2);this.el('speed').textContent=number(s.airspeed*3.6);
    this.el('vertical').innerHTML=`${number(s.verticalSpeed)} <small>м/с</small>`;this.el('gforce').innerHTML=`${number(s.phase==='countdown'||s.phase==='landed'?1:s.properG,2)} <small>g</small>`;
    this.el('pressure').innerHTML=`${number(s.q/1000,1)} <small>кПа</small>`;this.el('drag').innerHTML=`${number(s.drag/1000,1)} <small>кН</small>`;
    this.el('thrust').innerHTML=`${number(s.thrust/1000)} <small>кН</small>`;this.el('burn').textContent=clock(s.burnTime).slice(2);
    const first=scene.currentVehicle!=='upper'||t<this.data.separation,percent=clamp(s.fuel/(first?CONFIG.firstFuel:CONFIG.secondFuel))*100;
    const plume=plumeProfile(s.altitude,first?'booster':'upper',Math.max(1,s.engines));
    const p=plume.pressure;
    this.el('ambient-pressure').innerHTML=p>=1000?`${number(p/1000,1)} <small>кПа</small>`:`${p<.1?p.toExponential(1):number(p,2)} <small>Па</small>`;
    this.el('plume-state').textContent=s.thrust<=0?'ВЫКЛЮЧЕН':plume.expansion>.65?'ШИРОКИЙ':plume.expansion>.15?'РАСШИРЯЕТСЯ':'УЗКАЯ СТРУЯ';
    const karman=this.data.events.find(e=>e.id==='karman')!.time,nearKarman=Math.abs(t-karman)<10;
    this.el('plume-explanation').hidden=!(s.thrust>0&&s.altitude>18000&&t<karman+12);
    this.el('plume-title').textContent=nearKarman?'Линия Кармана · 100 км':'Расширение факела';
    this.el('plume-description').textContent=nearKarman?'Условная граница космоса. Атмосфера ещё существует; форма факела меняется плавно.':'Давление среды падает. Газы за соплом свободнее расширяются в стороны — ещё до границы космоса.';
    this.el('fuel').textContent=`${number(percent,1)}%`;this.el('fuel-stage').textContent=first?'S1':'S2';this.el('fuel-bar').style.width=`${percent}%`;
    this.el('vehicle-label').textContent=t<this.data.separation?'FALCON 9 / ОБЕ СТУПЕНИ':scene.currentVehicle==='booster'?'BOOSTER / ПЕРВАЯ СТУПЕНЬ':'UPPER STAGE / ВТОРАЯ СТУПЕНЬ';
    this.el('engine-status').textContent=s.engines>0?`${s.engines} ENGINE${s.engines>1?'S':''} · ON`:s.phase==='landed'?'LANDED':'ENGINE OFF';this.el('engine-status').classList.toggle('on',s.thrust>0);
    this.el('altitude-trend').textContent=s.verticalSpeed>0?'ASCENT':s.phase==='landed'?'LANDED':'DESCENT';
    this.el('timeline-fill').style.width=`${(t+30)/(this.data.end+30)*100}%`;this.el<HTMLInputElement>('scrubber').value=String(t);
    this.el('presentation-time').innerHTML=`${clock(this.player.presentationTime).slice(2)} <i>/ 04:30</i>`;
    this.el('play').innerHTML=`${icon(this.player.playing?'pause':'play')}<span>${this.player.playing?'ПАУЗА':t>=this.data.end?'ПОВТОРИТЬ МИССИЮ':t<=-29.9?'НАЧАТЬ МИССИЮ':'ПРОДОЛЖИТЬ'}</span>`;
    this.el('play').setAttribute('aria-label',this.player.playing?'Пауза':'Запустить миссию');
    const entries=this.data.events.filter(e=>e.time<=t),logKey=entries.map(e=>e.id).join(',');
    if(logKey!==this.lastLog){this.lastLog=logKey;this.el('log-count').textContent=String(entries.length).padStart(2,'0');
      this.el('log-entries').innerHTML=entries.slice(-4).reverse().map((e,i)=>`<div class="log-entry ${i===0?'newest':''}"><time>${clock(e.time)}</time><div><strong>${e.label}</strong><p>${e.detail}</p></div></div>`).join('');}
    const next=this.data.events.find(e=>e.time>t);
    this.el('next-label').textContent=next?.label||'МИССИЯ ЗАВЕРШЕНА';this.el('next-countdown').textContent=next?clock(next.time-t).slice(2):'✓';
    this.el('orbital-badge').hidden=t<this.data.seco;this.el('orbit-label').innerHTML=`${number(this.data.orbit.perigee/1000)} × ${number(this.data.orbit.apogee/1000)} <small>км</small>`;
    this.el('satellite-count').textContent=`${t<this.data.deployment?0:Math.min(8,Math.floor((t-this.data.deployment)/.5)+1)} / 8`;
    this.el('fps').textContent=`${number(scene.fps)} FPS · ${scene.renderer.info.render.triangles.toLocaleString('en-US')} TRIANGLES`;
    this.drawChart(this.el<HTMLCanvasElement>('sparkline'),'altitude',scene.currentVehicle,t,true);
    document.body.classList.toggle('in-flight',t>=0);
    if(this.el<HTMLDialogElement>('science').open){
      document.querySelectorAll<HTMLCanvasElement>('[data-chart]').forEach(c=>this.drawChart(c,c.dataset.chart as keyof VehicleState,'upper',t));
      this.el('state-table').innerHTML=[
        ['Высота, км', 'altitude',1000,2],['Инерциальная скорость, км/с','speed',1000,3],['Скорость относительно воздуха, км/с','airspeed',1000,3],['Вертикальная скорость, м/с','verticalSpeed',1,1],['Масса, т','mass',1000,2],['Топливо, т','fuel',1000,2],['Тяга, кН','thrust',1000,1],['Скоростной напор, кПа','q',1000,2],['Сопротивление, кН','drag',1000,2],['Плотность атмосферы, кг/м³','density',1,6],['Число Маха','mach',1,2],['Перегрузка (без гравитации), g','properG',1,2],
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
