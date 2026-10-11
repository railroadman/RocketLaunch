import { clamp, mix } from './math';
import { interpolateVector as vector, interpolateVehicle as interpolate } from './state';
import type { MissionData, MissionFrame } from './types';
export function frameAt(data:MissionData,time:number):MissionFrame {
  const frames=data.frames,timeClamped=clamp(time,frames[0].time,frames.at(-1)!.time);
  let lo=0,hi=frames.length-1;
  while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].time<=timeClamped)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],k=clamp((timeClamped-a.time)/Math.max(b.time-a.time,1e-6));
  const satellites=a.satellites.map((s,i)=>{
    const next=b.satellites[i];if(!next||!s.released||!next.released)return s;
    return {released:true,position:vector(s.position,next.position,k),velocity:vector(s.velocity,next.velocity,k)};
  });
  return {time:timeClamped,stack:interpolate(a.stack,b.stack,k),booster:interpolate(a.booster,b.booster,k),upper:interpolate(a.upper,b.upper,k),satellites};
}
export class MissionPlayer {
  time=-30;
  playing=false;
  mode: 'auto' | number='auto';
  rate=1;
  readonly duration=270;
  private clock=0;
  private marks:{mission:number;screen:number}[]=[];
  constructor(public readonly data:MissionData){
    // Preserve critical windows at 1x. Distribute the remaining footage to a 4:30 cut.
    const karman=data.events.find(e=>e.id==='karman')!.time;
    const windows=[[-30,15],[data.separation-3,data.separation+10],[karman-6,karman+7],[data.touchdown-27,data.touchdown+7],[data.deployment-3,data.deployment+17]];
    const knots=[-30,data.end,...windows.flat()].filter(t=>t>=-30&&t<=data.end).sort((a,b)=>a-b);
    const unique=[...new Set(knots)];
    const intervals=unique.slice(1).map((end,i)=>{const begin=unique[i],mid=(begin+end)/2;return{begin,end,critical:windows.some(([a,b])=>mid>=a&&mid<=b)};});
    const critical=intervals.filter(x=>x.critical).reduce((sum,x)=>sum+x.end-x.begin,0);
    const other=intervals.filter(x=>!x.critical).reduce((sum,x)=>sum+x.end-x.begin,0);
    let screen=0;this.marks=[{mission:-30,screen:0}];
    for(const interval of intervals){screen+=(interval.end-interval.begin)*(interval.critical?1:(this.duration-critical)/other);this.marks.push({mission:interval.end,screen});}
  }
  private convert(value:number,from:'mission'|'screen',to:'mission'|'screen'){
    for(let i=1;i<this.marks.length;i++){const a=this.marks[i-1],b=this.marks[i];if(value<=b[from])return mix(a[to],b[to],clamp((value-a[from])/(b[from]-a[from])));}
    return this.marks.at(-1)![to];
  }
  seek(time:number){this.time=clamp(time,-30,this.data.end);this.clock=this.convert(this.time,'mission','screen');}
  reset(){this.seek(-30);this.playing=false;}
  tick(dt:number){
    if(!this.playing)return;
    const previous=this.time;
    if(this.mode==='auto'){this.clock=Math.min(this.duration,this.clock+dt);this.time=this.convert(this.clock,'screen','mission');}
    else{this.time=clamp(this.time+dt*this.mode,-30,this.data.end);this.clock=this.convert(this.time,'mission','screen');}
    this.rate=dt>0?(this.time-previous)/dt:1;
    if(this.time>=this.data.end-0.01){this.time=this.data.end;this.playing=false;}
  }
  get frame(){return frameAt(this.data,this.time);}
  get progress(){return this.clock/this.duration;}
  get presentationTime(){return this.clock;}
}
