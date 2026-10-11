import { R, LAT, atmosphereVelocity, earthFixed, inertial, forces, integrate, orbitOf, type Point, type Force } from './physics';
import { mul, norm, len, dot, clamp, type V3 } from './math';
import type { DisposalInfo, VehicleState, Phase } from './types';

export interface DisposalResult { info:DisposalInfo; samples:{time:number;state:VehicleState}[]; }
// Educational disposal: a retrograde burn lowers perigee. Destruction and the
// surviving fragment cloud are approximations, not a thermal/debris prediction.
export function calculateDisposal(initial:Point,start:number,dry:number,burnTime:number,wait=120,record=true):DisposalResult {
  let s:Point={p:[...initial.p],v:[...initial.v],fuel:initial.fuel};
  let t=start,burnEnd=0,entry=0,breakup=0,impact=0,deltaV=0,perigee=Infinity,last=-Infinity;
  const burnStart=start+wait,samples:DisposalResult['samples']=[];
  let phase:Phase='disposal-coast',lastPhase:Phase|null=null,contact:V3|null=null;
  while(t<start+9000){
    const altitude=len(s.p)-R,radial=norm(s.p);
    if(!entry&&burnEnd&&altitude<=120000&&dot(s.v,radial)<0)entry=t;
    if(!breakup&&entry&&altitude<=70000){breakup=t;s={...s,fuel:0};}
    if(!impact&&breakup&&altitude<=0){
      impact=t;contact=mul(norm(earthFixed(s.p,t)),R);s={p:inertial(contact,t),v:atmosphereVelocity(inertial(contact,t)),fuel:0};
    }
    const burning=t>=burnStart&&!burnEnd;
    if(burning&&orbitOf(s.p,s.v).perigee<=-60000){burnEnd=t;perigee=orbitOf(s.p,s.v).perigee;}
    phase=impact?'disposed':breakup?'breakup':entry?'reentry':t>=burnStart&&!burnEnd?'deorbit':'disposal-coast';
    const direction=t>=burnStart-12&&!entry?norm(mul(s.v,-1)):radial;
    const f:Force={direction,thrust:phase==='deorbit'?147150:0,isp:348,dry,coefficient:entry?1.1:undefined,area:breakup?12:undefined};
    const g=forces(s,f);
    if(t-last>=(entry ? .2 : 1)-1e-7||t===start||phase!==lastPhase||phase==='disposed'){
      samples.push({time:t,state:{position:[...s.p],velocity:[...s.v],direction,fuel:s.fuel,mass:g.mass,thrust:g.thrust,throttle:g.thrust/981000,engines:g.thrust>0?1:0,
        altitude:Math.max(0,altitude),speed:len(s.v),airspeed:len(g.relative),verticalSpeed:dot(s.v,radial),q:g.q,drag:g.drag,mach:len(g.relative)/g.atmosphere.sound,density:g.atmosphere.density,properG:impact?0:g.properG,burnTime,phase}});
      last=t;lastPhase=phase;
    }
    if(impact){
      if(t>=impact+12)break;
      t+=.2;s={p:inertial(contact!,t),v:atmosphereVelocity(inertial(contact!,t)),fuel:0};continue;
    }
    // Coast/fragment samples are coarser, but burns and high-speed entry use 20ms RK4.
    let dt=phase==='deorbit'||entry ? .02 : .2;
    if(t<burnStart&&t+dt>burnStart)dt=burnStart-t;
    if(phase==='deorbit'){
      if(s.fuel<=0)throw new Error('Insufficient upper-stage fuel for disposal');
      deltaV+=g.thrust/g.mass*dt;burnTime+=dt;
    }
    s=integrate(s,f,dt);t+=dt;
  }
  if(!burnEnd||!entry||!breakup||!impact)throw new Error('Upper-stage disposal did not reach all terminal events');
  const unit=norm(contact!);
  const latitude=Math.asin(clamp(unit[1]*Math.sin(LAT)-unit[2]*Math.cos(LAT),-1,1))*180/Math.PI;
  const longitude=((Math.atan2(unit[0],unit[1]*Math.cos(LAT)+unit[2]*Math.sin(LAT))*180/Math.PI-80.6+540)%360)-180;
  return {info:{start,burnStart,burnEnd,entry,breakup,impact,end:t,perigee,deltaV,impactFixed:contact!,latitude,longitude},samples:record?samples:[]};
}
