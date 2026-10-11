import { describe, it, expect, beforeAll } from 'vitest';
import { atmosphere, R, MU, PAD, LANDING, orbitOf, forces, earthFixed, G0 } from '../src/sim/physics';
import { calculateMission, CONFIG } from '../src/sim/mission';
import { len, sub, dot, norm } from '../src/sim/math';
import { calculateDisposal } from '../src/sim/disposal';
import { frameAt, MissionPlayer } from '../src/sim/player';
import type { MissionData } from '../src/sim/types';
import { plumeProfile } from '../src/scene/plume';

let mission:MissionData;
beforeAll(()=>{mission=calculateMission();},120000);

describe('scientific flight model',()=>{
  it('computes sea-level density and the drag equation',()=>{
    expect(atmosphere(0).density).toBeCloseTo(1.225,2);
    const f=forces({p:PAD,v:[100,0,0],fuel:100},{direction:[0,1,0],thrust:0,isp:300,dry:1000});
    expect(f.q).toBeCloseTo(0.5*atmosphere(0).density*f.relative[0]**2,3);
    expect(atmosphere(200000).density).toBeLessThan(1e-9);
  });
  it('recovers a circular orbit from its state vector',()=>{
    const radius=R+300000,o=orbitOf([0,radius,0],[Math.sqrt(MU/radius),0,0]);
    expect(o.apogee).toBeCloseTo(300000,5);expect(o.perigee).toBeCloseTo(300000,5);
  });
  it('solves and flies the mission without synthetic landing or orbital teleportation',()=>{
    expect(mission.orbit.perigee).toBeGreaterThan(280000);
    expect(mission.orbit.apogee).toBeLessThan(320000);
    expect(mission.landingError).toBeLessThan(10);
    expect(mission.landingSpeed).toBeLessThan(2);
    expect(mission.frames.every(f=>f.booster.fuel>=0&&f.upper.fuel>=0)).toBe(true);
    expect(mission.frames.at(-1)!.booster.fuel).toBeGreaterThan(0);
  },120000);
  it('keeps the rocket on the Earth-fixed pad throughout countdown',()=>{
    for(const time of [-30,-20,-5,-.3])expect(len(sub(earthFixed(frameAt(mission,time).stack.position,time),PAD))).toBeLessThan(.02);
    expect(frameAt(mission,-30).upper.fuel).toBe(CONFIG.secondFuel);
  });
  it('keeps the landed booster at its calculated contact on every playback timestamp',()=>{
    for(const time of [mission.touchdown+1,mission.touchdown+2.137,mission.touchdown+6.49,600.073,mission.end-.1]){
      const frame=frameAt(mission,time),state=frame.booster;
      expect(state.phase).toBe('landed');
      const distance=len(sub(earthFixed(state.position,frame.time),LANDING));
      // A stale 0.2s sample previously displaced the rendered contact by ~50m.
      expect(Math.abs(distance-mission.landingError)).toBeLessThan(.002);
    }
  });
  it('preserves position and velocity at separation and schedules actual engine cutoffs',()=>{
    const separation=mission.frames.find(f=>f.time>=mission.separation)!;
    expect(len(sub(separation.booster.position,separation.upper.position))).toBeLessThan(1);
    expect(len(sub(separation.booster.velocity,separation.upper.velocity))).toBeLessThan(.1);
    expect(frameAt(mission,mission.separation-.3).stack.thrust).toBe(0);
    expect(frameAt(mission,mission.separation+.5).upper.thrust).toBe(0);
    expect(frameAt(mission,mission.separation+1.4).upper.thrust).toBeGreaterThan(0);
  });
  it('releases eight spacecraft onto independently propagated bound orbits',()=>{
    const end=mission.frames.at(-1)!;
    expect(end.satellites).toHaveLength(8);
    for(const satellite of end.satellites){expect(satellite.released).toBe(true);const orbit=orbitOf(satellite.position,satellite.velocity);expect(orbit.perigee).toBeGreaterThan(270000);expect(orbit.apogee).toBeLessThan(340000);}
    expect(end.upper.mass-end.upper.fuel).toBeCloseTo(CONFIG.secondDry,4);
  });
  it('synchronizes payload and upper-stage positions during deployment',()=>{
    const frame=frameAt(mission,mission.deployment+20.137);
    for(const satellite of frame.satellites){
      expect(satellite.released).toBe(true);
      expect(len(sub(satellite.position,frame.upper.position))).toBeLessThan(200);
    }
  });
  it('marks the actual 100km crossing while atmospheric pressure remains nonzero',()=>{
    const event=mission.events.find(e=>e.id==='karman')!;
    expect(event.vehicle).toBe('upper');
    expect(frameAt(mission,event.time).upper.altitude).toBeCloseTo(100000,4);
    expect(frameAt(mission,event.time-1).upper.altitude).toBeLessThan(100000);
    expect(atmosphere(100000).pressure).toBeGreaterThan(0);
  });
  it('widens the plume before 100km without a jump or an enlarged nozzle at the boundary',()=>{
    const ground=plumeProfile(0,'booster',9),high=plumeProfile(40000,'booster',9);
    expect(high.width).toBeGreaterThan(ground.width*3);
    expect(high.pressure).toBeLessThan(ground.pressure/100);
    expect(high.width*high.nozzleRadius).toBeCloseTo(ground.width*ground.nozzleRadius,8);
    const below=plumeProfile(99950,'upper',1),above=plumeProfile(100050,'upper',1);
    expect(Math.abs(above.width-below.width)).toBeLessThan(.1);
    expect(Math.abs(above.length-below.length)).toBeLessThan(.1);
  });
});

describe('mission playback',()=>{
  it('covers launch in 270 seconds plus a short 20-second disposal finale',()=>{
    const player=new MissionPlayer(mission);player.playing=true;for(let i=0;i<2700;i++)player.tick(.1);
    expect(player.time).toBeCloseTo(mission.disposal.start,3);
    for(let i=0;i<201;i++)player.tick(.1);
    expect(player.time).toBeCloseTo(mission.end,3);expect(player.playing).toBe(false);expect(player.presentationTime).toBeCloseTo(290,4);
  });
  it('preserves critical windows at real-time speed and pauses deterministically',()=>{
    const player=new MissionPlayer(mission);player.playing=true;player.seek(-15);player.tick(1);expect(player.time).toBeCloseTo(-14,5);
    player.seek(mission.touchdown-10);player.tick(1);expect(player.time).toBeCloseTo(mission.touchdown-9,5);
    const karman=mission.events.find(e=>e.id==='karman')!.time;
    player.seek(karman-2);player.tick(1);expect(player.time).toBeCloseTo(karman-1,5);
    player.playing=false;const frame=player.frame;player.tick(5);expect(player.frame).toEqual(frame);
  });
  it('seeks both directions and resets without retaining deployment state',()=>{
    const player=new MissionPlayer(mission);player.seek(mission.deployment+20);expect(player.frame.satellites.filter(s=>s.released)).toHaveLength(8);
    player.seek(10);const earlier=player.frame;player.seek(300);player.seek(10);expect(player.frame).toEqual(earlier);
    player.reset();expect(player.time).toBe(-30);expect(player.frame.satellites).toHaveLength(0);expect(player.playing).toBe(false);
  });
  it('manual 5x speed advances a common simulation time',()=>{
    const player=new MissionPlayer(mission);player.mode=5;player.playing=true;player.seek(200);player.tick(2);expect(player.time).toBe(210);
  });
});

describe('upper-stage disposal',()=>{
  it('uses a retrograde, fuel-consuming burn to lower perigee',()=>{
    const d=mission.disposal,before=frameAt(mission,d.burnStart).upper,after=frameAt(mission,d.burnEnd).upper;
    expect(dot(before.direction,norm(before.velocity))).toBeLessThan(-.99);
    expect(after.fuel).toBeLessThan(before.fuel);expect(after.fuel).toBeGreaterThan(0);
    expect(d.deltaV).toBeGreaterThan(100);expect(d.deltaV).toBeLessThan(125);
    expect(348*G0*Math.log(before.mass/after.mass)).toBeCloseTo(d.deltaV,0);
    expect(d.perigee).toBeLessThan(-60000);
  });
  it('orders disposal events and marks each phase at its actual event time',()=>{
    const d=mission.disposal;
    expect(d.start).toBeGreaterThan(mission.deployment+90);
    expect(d.burnStart).toBeLessThan(d.burnEnd);expect(d.burnEnd).toBeLessThan(d.entry);
    expect(d.entry).toBeLessThan(d.breakup);expect(d.breakup).toBeLessThan(d.impact);
    for(const [time,phase] of [[d.burnStart,'deorbit'],[d.entry,'reentry'],[d.breakup,'breakup'],[d.impact,'disposed']] as const)expect(frameAt(mission,time).upper.phase).toBe(phase);
    expect(frameAt(mission,d.entry).upper.altitude).toBeCloseTo(120000,-2);
    expect(frameAt(mission,d.breakup).upper.altitude).toBeCloseTo(70000,-2);
  });
  it('keeps the satellites in orbit while the stage descends and is destroyed',()=>{
    const final=frameAt(mission,mission.end);
    for(const satellite of final.satellites){expect(satellite.released).toBe(true);expect(orbitOf(satellite.position,satellite.velocity).perigee).toBeGreaterThan(270000);}
    expect(final.upper.phase).toBe('disposed');expect(final.upper.altitude).toBe(0);
    expect(mission.disposal.longitude).toBeGreaterThan(60);expect(mission.disposal.longitude).toBeLessThan(75);
    expect(Math.abs(mission.disposal.latitude)).toBeLessThan(10);
  });
  it('keeps the recovered booster fixed for the extended mission',()=>{
    for(const time of [1600.137,2200.49,mission.end-.13]){
      const frame=frameAt(mission,time);
      expect(Math.abs(len(sub(earthFixed(frame.booster.position,time),LANDING))-mission.landingError)).toBeLessThan(.003);
    }
  });
  it('seeks the finale on the shared presentation timeline in both directions',()=>{
    const player=new MissionPlayer(mission);
    for(const time of [mission.disposal.burnStart,mission.disposal.breakup,mission.disposal.impact]){
      player.seekPresentation(player.presentationAt(time));expect(player.time).toBeCloseTo(time,6);
    }
    player.seek(mission.disposal.impact);player.seek(mission.disposal.entry);const frame=player.frame;
    player.seek(0);player.seek(mission.disposal.entry);expect(player.frame).toEqual(frame);
    expect(player.presentationAt(mission.end)-player.presentationAt(mission.disposal.start)).toBeCloseTo(20,5);
  });
  it('rejects a disposal burn with no propellant',()=>{
    const state=frameAt(mission,mission.disposal.start).upper;
    expect(()=>calculateDisposal({p:state.position,v:state.velocity,fuel:0},mission.disposal.start,CONFIG.secondDry,state.burnTime)).toThrow('Insufficient');
  });
});
