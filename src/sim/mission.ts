import { calculateDisposal } from './disposal';
import { add, sub, mul, dot, cross, norm, len, clamp, mix, smooth, type V3 } from './math';
import { R, MU, G0, PAD, LANDING, AXIS, atmosphereVelocity, atmosphere, forces, integrate, orbitOf, earthFixed, inertial, type Point, type Force } from './physics';
import type { MissionData, MissionEvent, MissionFrame, VehicleState, Phase, SatelliteState } from './types';
import { interpolateVehicle, interpolateVector } from './state';

export const CONFIG = {
  firstDry: 22_200, firstFuel: 410_900, secondDry: 4_000, secondFuel: 107_500,
  payload: 2_080, fairingMass: 1_900, targetAltitude: 300_000, satelliteCount: 8,
  separation: 135, fairing: 185, dt: 0.02, sample: 0.2,
};
// Approximate engineering inputs, not proprietary SpaceX performance data.
const heading: V3 = norm([0.654, 0, -0.7565]);
function tangent(p: V3): V3 { return norm(sub(heading, mul(norm(p), dot(heading,norm(p))))); }
function pitchDirection(p: V3, degrees: number): V3 {
  const angle=degrees*Math.PI/180;
  return add(mul(norm(p),Math.cos(angle)),mul(tangent(p),Math.sin(angle)));
}
function firstForce(t: number, s: Point, tilt: number): Force {
  const at=atmosphere(len(s.p)-R), throttle=(t>45&&t<80?0.73:0.96);
  const pitch=tilt*smooth((t-9)/(CONFIG.separation-9));
  return { direction:pitchDirection(s.p,pitch), thrust:t>=CONFIG.separation-0.5?0:throttle*(8_227_000-620_000*at.pressure/101325), isp:311-29*at.pressure/101325,
    dry:CONFIG.firstDry+CONFIG.secondDry+CONFIG.secondFuel+CONFIG.payload+CONFIG.fairingMass };
}
function upperForce(t: number, s: Point, params: number[]): Force {
  const angle=mix(params[0],params[1],clamp((t-CONFIG.separation)/(params[2])));
  return { direction:pitchDirection(s.p,angle), thrust:t<CONFIG.separation+1?0:981_000, isp:348, dry:CONFIG.secondDry+CONFIG.payload+(t<CONFIG.fairing?CONFIG.fairingMass:0) };
}
function initial(): Point { return { p:[...PAD],v:atmosphereVelocity(PAD),fuel:CONFIG.firstFuel }; }
function ascent(params: number[], dt: number, record?: (t: number,s:Point,f:Force,upper:boolean)=>void) {
  let s=initial();
  for(let t=0;t<CONFIG.separation-1e-6;t+=dt){const f=firstForce(t,s,params[0]);record?.(t,s,f,false);s=integrate(s,f,Math.min(dt,CONFIG.separation-t));}
  const separation:Point={p:[...s.p],v:[...s.v],fuel:s.fuel};
  s={p:[...s.p],v:[...s.v],fuel:CONFIG.secondFuel};
  const end=CONFIG.separation+params[2];
  for(let t=CONFIG.separation;t<end-1e-6;t+=dt){const f=upperForce(t,s,params);record?.(t,s,f,true);s=integrate(s,f,Math.min(dt,end-t));}
  return { upper:s,booster:separation,end };
}
function residual(params:number[]):number[]{
  const {upper:s}=ascent(params,0.25), up=norm(s.p), radial=dot(s.v,up), horizontal=len(sub(s.v,mul(up,radial)));
  return [(len(s.p)-R-CONFIG.targetAltitude)/1000,radial/10,(horizontal-Math.sqrt(MU/len(s.p)))/10];
}
function solve3(a:number[][], b:number[]) {
  const m=a.map((row,i)=>[...row,b[i]]);
  for(let k=0;k<3;k++){
    let best=k;for(let i=k+1;i<3;i++)if(Math.abs(m[i][k])>Math.abs(m[best][k]))best=i;
    [m[k],m[best]]=[m[best],m[k]];
    const d=m[k][k];if(Math.abs(d)<1e-10)return [0,0,0];
    for(let j=k;j<4;j++)m[k][j]/=d;
    for(let i=0;i<3;i++)if(i!==k){const q=m[i][k];for(let j=k;j<4;j++)m[i][j]-=q*m[k][j];}
  }
  return m.map(row=>row[3]);
}
export function solveAscent(){
  let p=[48,98,350];
  const error=(r:number[])=>Math.hypot(...r);
  for(let iteration=0;iteration<24;iteration++){
    const r=residual(p);if(error(r)<0.025)break;
    const steps=[0.12,0.12,0.2];
    const cols=steps.map((h,j)=>{const q=[...p];q[j]+=h;const d=residual(q);return d.map((n,i)=>(n-r[i])/h);});
    const delta=solve3([0,1,2].map(i=>cols.map(c=>c[i])),r.map(n=>-n));
    let improved=false;
    for(const scale of [1,0.5,0.25,0.1,0.025]){
      const q=p.map((n,i)=>n+clamp(delta[i],i===2?-60:-15,i===2?60:15)*scale);
      q[0]=clamp(q[0],25,85);q[1]=clamp(q[1],75,145);q[2]=clamp(q[2],220,370);
      if(error(residual(q))<error(r)){p=q;improved=true;break;}
    }
    if(!improved)break;
  }
  return {params:p,residual:residual(p)};
}
function snapshot(s:Point, f:Force, phase:Phase, burnTime:number, engines:number):VehicleState{
  const g=forces(s,f), up=norm(s.p), altitude=Math.max(0,len(s.p)-R);
  return { position:[...s.p],velocity:[...s.v],direction:[...f.direction],fuel:s.fuel,mass:g.mass,thrust:g.thrust,
    throttle:f.thrust/(engines===9?8_227_000:engines===3?2_742_333:engines===1&&phase==='insertion'?981_000:914_111),engines,
    altitude,speed:len(s.v),airspeed:len(g.relative),verticalSpeed:dot(s.v,up),q:g.q,drag:g.drag,mach:len(g.relative)/g.atmosphere.sound,
    density:g.atmosphere.density,properG:phase==='countdown'||phase==='landed'?1:g.properG,burnTime,phase };
}
const zero=(dry:number,direction:V3):Force=>({direction,thrust:0,isp:311,dry});

interface BoosterResult { states:{time:number;state:VehicleState}[]; events:MissionEvent[]; touchdown:number; error:number; speed:number; }
// Zero-effort-miss predictor: drag and rotating atmosphere included in the coast forecast.
function impact(s:Point,t:number):V3 {
  let p:Point={p:[...s.p],v:[...s.v],fuel:s.fuel};
  const f=zero(CONFIG.firstDry,norm(p.p));f.booster=true;
  let future=t;
  for(let i=0;i<500;i++){
    if(len(p.p)<R+5)break;
    p=integrate(p,f,1.5);future+=1.5;
  }
  return earthFixed(p.p,future);
}
function simulateBooster(start:Point, dt:number, correction:V3=[0,0,0], record=true):BoosterResult {
  let s:Point={p:[...start.p],v:[...start.v],fuel:start.fuel};
  let phase:Phase='coast', burn=0, touchdown=0, landingSpeed=0, lastSample=-1, boostEnd=0, entryEnd=0, landingStart=0;
  let direction=norm(s.p), command:V3=[0,0,0], nextPrediction=0;
  const states:BoosterResult['states']=[],events:MissionEvent[]=[];
  const event=(id:string,t:number,label:string,detail:string)=>events.push({id,time:t,label,detail,vehicle:'booster'});
  const startBoost=CONFIG.separation+9;
  for(let t=CONFIG.separation;t<CONFIG.separation+800;t+=dt){
    const h=len(s.p)-R, up=norm(s.p), air=sub(s.v,atmosphereVelocity(s.p)), vr=dot(air,up), vh=sub(air,mul(up,vr));
    let thrust=0,engines=0;
    if(t>=startBoost&&!boostEnd){
      if(phase!=='boostback'){phase='boostback';event('boostback',t,'BOOSTBACK','Три двигателя: торможение и коррекция точки возвращения.');}
      if(t>=nextPrediction){
        const miss=sub(add(LANDING,correction),impact(s,t));
        const missInertial=inertial(miss,t), lateral=sub(missInertial,mul(up,dot(missInertial,up)));
        // Close the forecasted surface miss without forcing a synthetic trajectory.
        command=mul(lateral,0.00062);nextPrediction=t+1.0;
        if(len(lateral)<300&&t>startBoost+8 || t>startBoost+100 || s.fuel<26000){boostEnd=t;phase='coast';event('boostback-end',t,'BOOSTBACK COMPLETE','Баллическое возвращение к наземной площадке.');}
      }
      if(!boostEnd){direction=norm(command);thrust=Math.min(2_600_000,len(command)*(CONFIG.firstDry+s.fuel));engines=3;}
    }
    if(boostEnd&&h<42000&&vr<0&&!entryEnd){
      if(phase!=='entry'){phase='entry';event('entry',t,'ENTRY BURN','Тормозной импульс перед плотными слоями атмосферы.');}
      direction=norm(mul(air,-1));thrust=2_550_000;engines=3;
      if(len(air)<620||h<24000){entryEnd=t;phase='coast';thrust=0;engines=0;event('entry-end',t,'ENTRY COMPLETE','Двигатели выключены. Аэродинамическое торможение.');}
    }
    const amax=850000/(CONFIG.firstDry+s.fuel)-G0;
    const stopping=vr<0?vr*vr/(2*Math.max(amax,1)):0;
    if(boostEnd&&entryEnd&&(landingStart||h<stopping*1.15+80)&&vr<0){
      if(!landingStart){landingStart=t;phase='landing';event('landing',t,'LANDING BURN','Центральный двигатель. Управляемое снижение к площадке.');}
      const target=inertial(LANDING,t), delta=sub(target,s.p), lateral=sub(delta,mul(up,dot(delta,up)));
      const braking=Math.min(10,Math.max(2,amax*0.85));
      const desiredVr=-Math.min(Math.sqrt(Math.max(0,h)*braking),0.2*Math.max(0,h)+0.5);
      const feedForward=h<100?-desiredVr*0.2:braking/2;
      const az=G0+clamp(feedForward+(desiredVr-vr)*2.5,-G0,amax);
      const timeLeft=Math.max(1.2,2*h/Math.max(-vr,1));
      const axy=sub(mul(lateral,4/(timeLeft*timeLeft)),mul(vh,3/timeLeft));
      const lateralLimited=mul(norm(axy),Math.min(len(axy),Math.max(3,az*0.65)));
      const accel=add(mul(up,az),lateralLimited);
      direction=norm(accel);thrust=clamp(len(accel)*(CONFIG.firstDry+s.fuel),0,850000);engines=thrust>0?1:0;
    }
    if(!thrust){
      const desired=phase==='coast'&&t<startBoost?norm(mul(air,-1)):up;
      direction=norm(add(mul(direction,1-Math.min(dt*0.7,1)),mul(desired,Math.min(dt*0.7,1))));
    }
    const f:Force={direction,thrust,isp:305,dry:CONFIG.firstDry,booster:true};
    if(thrust>0)burn+=dt;
    if(record&&t-lastSample>=CONFIG.sample-1e-7){states.push({time:t,state:snapshot(s,f,phase,burn,engines)});lastSample=t;}
    const previous=s;s=integrate(s,f,dt);
    if(len(s.p)<=R+1&&t>startBoost+10){
      touchdown=t+dt;landingSpeed=Math.abs(dot(previous.v,norm(previous.p)));
      const fixed=earthFixed(s.p,touchdown);const error=len(sub(mul(norm(fixed),R),LANDING));
      event('touchdown',touchdown,'TOUCHDOWN','Первая ступень на наземной посадочной площадке.');
      // At contact, retain the calculated contact location, then ride Earth's rotation.
      const contact=mul(norm(fixed),R);
      for(let at=touchdown;record&&at<1500;at+=CONFIG.sample){const p=inertial(contact,at);states.push({time:at,state:snapshot({p,v:atmosphereVelocity(p),fuel:s.fuel},zero(CONFIG.firstDry,norm(p)),'landed',burn,0)});}
      return {states,events,touchdown,error,speed:landingSpeed};
    }
  }
  return {states,events,touchdown,error:Infinity,speed:Infinity};
}
export function calculateMission():MissionData {
  const solved=solveAscent(),params=solved.params;
  const upperSamples:{time:number;state:VehicleState}[]=[],stackSamples:{time:number;state:VehicleState}[]=[];
  let last=-100, upperBurn=0;
  const flown=ascent(params,CONFIG.dt,(t,s,f,upper)=>{
    if(upper&&f.thrust>0)upperBurn+=CONFIG.dt;
    if(t-last>=CONFIG.sample-1e-7){
      const state=snapshot(s,f,upper?'insertion':'ascent',upper?upperBurn:Math.min(t,CONFIG.separation-.5),f.thrust>0?(upper?1:9):0);
      (upper?upperSamples:stackSamples).push({time:t,state});last=t;
    }
  });
  const lookup=(samples:{time:number;state:VehicleState}[],t:number)=>{
    let lo=0,hi=samples.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid].time<=t)lo=mid;else hi=mid-1;}
    const a=samples[lo],b=samples[Math.min(lo+1,samples.length-1)];
    return interpolateVehicle(a.state,b.state,clamp((t-a.time)/Math.max(b.time-a.time,1e-6)));
  };
  const orbit=orbitOf(flown.upper.p,flown.upper.v);
  const booster=simulateBooster(flown.booster,CONFIG.dt);
  const deployment=flown.end+115,disposalStart=deployment+95;
  let end=disposalStart;
  const spacecraft:(Point|null)[]=Array.from({length:CONFIG.satelliteCount},()=>null);
  const satelliteSamples:{time:number;states:SatelliteState[]}[]=[];
  let upper=flown.upper;
  for(let t=flown.end;t<=end+1;t+=CONFIG.dt){
    const radial=norm(upper.p),along=norm(sub(upper.v,mul(radial,dot(upper.v,radial)))),normal=norm(cross(radial,along));
    for(let i=0;i<spacecraft.length;i++)if(!spacecraft[i]&&t>=deployment+i*.5){
      const eject=add(add(mul(radial,1.2+i*.18),mul(along,.6*Math.sin(i*1.4))),mul(normal,.9*Math.cos(i*1.2)));
      spacecraft[i]={p:add(upper.p,mul(radial,62.4+i*.3)),v:add(upper.v,eject),fuel:0};
    }
    const remaining=spacecraft.filter(s=>!s).length;
    const f=zero(CONFIG.secondDry+remaining*CONFIG.payload/CONFIG.satelliteCount,radial);
    if(t-last>=CONFIG.sample-1e-7){
      upperSamples.push({time:t,state:snapshot(upper,f,t>=deployment?'deployment':'orbit',upperBurn,0)});
      satelliteSamples.push({time:t,states:spacecraft.map(s=>s?{released:true,position:[...s.p],velocity:[...s.v]}:{released:false,position:[...upper.p],velocity:[...upper.v]})});last=t;
    }
    for(let i=0;i<spacecraft.length;i++)if(spacecraft[i])spacecraft[i]=integrate(spacecraft[i]!,zero(CONFIG.payload/8,norm(spacecraft[i]!.p)),CONFIG.dt);
    upper=integrate(upper,f,CONFIG.dt);
  }
  const disposalState=lookup(upperSamples,disposalStart);
  const disposal=calculateDisposal({p:disposalState.position,v:disposalState.velocity,fuel:disposalState.fuel},disposalStart,CONFIG.secondDry,upperBurn);
  end=disposal.info.end;
  while(upperSamples.at(-1)!.time>=disposalStart)upperSamples.pop();
  upperSamples.push(...disposal.samples);
  let tailIndex=0;
  while(tailIndex<satelliteSamples.length-1&&satelliteSamples[tailIndex+1].time<=disposalStart)tailIndex++;
  const tailA=satelliteSamples[tailIndex],tailB=satelliteSamples[Math.min(tailIndex+1,satelliteSamples.length-1)];
  const tailK=clamp((disposalStart-tailA.time)/Math.max(tailB.time-tailA.time,1e-6));
  tailA.states.forEach((state,i)=>spacecraft[i]={p:interpolateVector(state.position,tailB.states[i].position,tailK),v:interpolateVector(state.velocity,tailB.states[i].velocity,tailK),fuel:0});
  while(satelliteSamples.at(-1)!.time>=disposalStart)satelliteSamples.pop();
  let lastSatellite=-Infinity;
  for(let t=disposalStart;t<=end+1;t+=.2){
    if(t-lastSatellite>=1-1e-7){satelliteSamples.push({time:t,states:spacecraft.map(s=>({released:true,position:[...s!.p],velocity:[...s!.v]}))});lastSatellite=t;}
    for(let i=0;i<spacecraft.length;i++)spacecraft[i]=integrate(spacecraft[i]!,zero(CONFIG.payload/8,norm(spacecraft[i]!.p)),.2);
  }
  const contactSample=booster.states.at(-1)!;
  const contactFixed=earthFixed(contactSample.state.position,contactSample.time);
  const landed=(time:number):VehicleState=>{
    const position=inertial(contactFixed,time);
    return {...contactSample.state,position,velocity:atmosphereVelocity(position),direction:norm(position)};
  };
  const frames:MissionFrame[]=[];
  const pad=snapshot(initial(),zero(CONFIG.firstDry+CONFIG.secondDry+CONFIG.secondFuel+CONFIG.payload+CONFIG.fairingMass,[0,1,0]),'countdown',0,0);
  const attachedBooster=(state:VehicleState):VehicleState=>({...state,mass:CONFIG.firstDry+state.fuel});
  const attachedUpper=(state:VehicleState):VehicleState=>({...state,mass:CONFIG.secondDry+CONFIG.secondFuel+CONFIG.payload+CONFIG.fairingMass,fuel:CONFIG.secondFuel,thrust:0,throttle:0,engines:0,burnTime:0,drag:0});
  for(let t=-30;t<0;t+=CONFIG.sample){
    const position=inertial(PAD,t),state={...pad,position,velocity:atmosphereVelocity(position),direction:inertial([0,1,0],t)};
    frames.push({time:t,stack:state,upper:attachedUpper(state),booster:attachedBooster(state),satellites:[]});
  }
  let satelliteIndex=0;
  const frameTimes:number[]=[];
  for(let t=0;t<disposalStart;t+=CONFIG.sample)frameTimes.push(t);
  frameTimes.push(...disposal.samples.map(sample=>sample.time));
  for(const t of frameTimes){
    while(satelliteIndex<satelliteSamples.length-1&&satelliteSamples[satelliteIndex+1].time<=t)satelliteIndex++;
    const a=satelliteSamples[satelliteIndex],b=satelliteSamples[Math.min(satelliteIndex+1,satelliteSamples.length-1)];
    const k=clamp((t-a.time)/Math.max(b.time-a.time,1e-6));
    const satellites=t>=deployment?a.states.map((state,i)=>{
      const next=b.states[i];
      return state.released&&next.released?{released:true,position:interpolateVector(state.position,next.position,k),velocity:interpolateVector(state.velocity,next.velocity,k)}:state;
    }):[];
    const stack=lookup(stackSamples,t);
    frames.push({time:t,stack,booster:t<CONFIG.separation?attachedBooster(stack):(t>=booster.touchdown?landed(t):lookup(booster.states,t)),upper:t<CONFIG.separation?attachedUpper(stack):lookup(upperSamples,t),satellites});
  }
  const maxFrame=frames.reduce((a,b)=>b.stack.q>a.stack.q&&b.time<CONFIG.separation?b:a,frames[0]);
  const crossing=frames.findIndex(frame=>frame.time>=0&&frame.upper.altitude>=100000);
  const before=frames[crossing-1],after=frames[crossing];
  const karman=mix(before.time,after.time,(100000-before.upper.altitude)/(after.upper.altitude-before.upper.altitude));
  const events:MissionEvent[]=( [
    {id:'countdown',time:-30,label:'COUNTDOWN',detail:'Последние 30 секунд. Все системы готовы к запуску.',vehicle:'stack'},
    {id:'arms',time:-8,label:'STRONGBACK RETRACT',detail:'Отведение обслуживающих конструкций.',vehicle:'stack'},
    {id:'ignition',time:-3,label:'ENGINE IGNITION',detail:'Запуск девяти двигателей Merlin. Проверка тяги.',vehicle:'stack'},
    {id:'liftoff',time:0,label:'LIFTOFF',detail:'Старт. Начало программы набора высоты.',vehicle:'stack'},
    {id:'maxq',time:maxFrame.time,label:'MAX Q',detail:'Максимальный скоростной напор. Пиковая аэродинамическая нагрузка.',vehicle:'stack'},
    {id:'meco',time:CONFIG.separation-0.5,label:'MECO',detail:'Выключение двигателей первой ступени.',vehicle:'stack'},
    {id:'separation',time:CONFIG.separation,label:'STAGE SEPARATION',detail:'Пневматическое разделение. Начало независимого полёта ступеней.',vehicle:'upper'},
    {id:'ses',time:CONFIG.separation+1,label:'SECOND ENGINE START',detail:'Запуск Merlin Vacuum. Продолжение разгона к орбите.',vehicle:'upper'},
    {id:'fairing',time:CONFIG.fairing,label:'FAIRING SEPARATION',detail:'Сброс двух половин обтекателя вне плотной атмосферы.',vehicle:'upper'},
    {id:'karman',time:karman,label:'KÁRMÁN LINE / 100 KM',detail:'Условная граница космоса. Факел расширяется плавно из-за падения давления, начиная значительно ниже 100 км.',vehicle:'upper'},
    ...booster.events,
    {id:'seco',time:flown.end,label:'SECO / ORBIT INSERTION',detail:'Выключение второй ступени. Проверка параметров начальной орбиты.',vehicle:'upper'},
    {id:'deploy',time:deployment,label:'STARLINK DEPLOYMENT',detail:'Отделение пакета из восьми спутников. Начало расхождения.',vehicle:'upper'},
    {id:'payload-complete',time:disposalStart-12,label:'PAYLOAD MISSION COMPLETE',detail:'Спутники остаются на орбите. Дальше показана отдельная утилизация второй ступени.',vehicle:'upper'},
    ...(['deorbit','reentry','breakup','ocean'] as const).map((id,i)=>({id,time:[disposal.info.burnStart,disposal.info.entry,disposal.info.breakup,disposal.info.impact][i],label:id,detail:'Учебный сценарий утилизации второй ступени.',vehicle:'upper' as const})),
    {id:'complete',time:end-2,label:'MISSION COMPLETE',detail:'Спутники на орбите, первая ступень возвращена, утилизация второй ступени завершена.',vehicle:'upper'},
  ] satisfies MissionEvent[]).sort((a,b)=>a.time-b.time);
  return {frames,events,orbit,separation:CONFIG.separation,fairing:CONFIG.fairing,seco:flown.end,touchdown:booster.touchdown,deployment,end,
    disposal:disposal.info,maxQ:maxFrame.stack.q,landingError:booster.error,landingSpeed:booster.speed,
    parameters:{...CONFIG,firstTilt:params[0],upperEndPitch:params[1],upperBurn:params[2],solverError:Math.hypot(...solved.residual)}};
}
