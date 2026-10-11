import { add, sub, mul, dot, cross, norm, len, clamp, rotate, type V3 } from './math';
import type { Orbit } from './types';

export const R = 6_371_000;
export const MU = 3.986004418e14;
export const G0 = 9.80665;
export const LAT = 28.5 * Math.PI / 180;
export const AXIS: V3 = [0, Math.sin(LAT), -Math.cos(LAT)];
export const OMEGA = 7.2921159e-5;
export const PAD: V3 = [0, R, 0];
export const LANDING: V3 = [6500, Math.sqrt(R * R - 6500 * 6500 - 3500 * 3500), 3500];
export const atmosphereVelocity = (p: V3) => mul(cross(AXIS, p), OMEGA);
export const earthFixed = (p: V3, t: number): V3 => rotate(p, AXIS, -OMEGA * t);
export const inertial = (p: V3, t: number): V3 => rotate(p, AXIS, OMEGA * t);
export const localPosition = (p: V3, t: number): V3 => sub(earthFixed(p, t), PAD);

// NASA's three-zone metric atmosphere, extended with an exponential exosphere.
export function atmosphere(h: number) {
  h = Math.max(0, h);
  let temperature: number, pressure: number;
  if (h < 11000) {
    temperature = 288.15 - 0.00649 * h;
    pressure = 101325 * Math.pow(temperature / 288.15, 5.256);
  } else if (h < 25000) {
    temperature = 216.65;
    pressure = 22632 * Math.exp(-(h - 11000) / 6341.6);
  } else {
    temperature = 216.65 + 0.00299 * (Math.min(h, 86000) - 25000);
    pressure = 2488 * Math.pow(temperature / 216.65, -11.388);
    if (h > 86000) pressure *= Math.exp(-(h - 86000) / 7000);
  }
  return { density: pressure / (287.05 * temperature), sound: Math.sqrt(1.4 * 287.05 * temperature), pressure, temperature };
}
export function dragCoefficient(mach: number, booster = false) {
  return (booster ? 1.10 : 0.24) + 0.32 * Math.exp(-Math.pow((mach-1.1)/0.45,2));
}
export interface Point { p: V3; v: V3; fuel: number; }
export interface Force { direction: V3; thrust: number; isp: number; dry: number; booster?: boolean; area?: number; coefficient?: number; }
export function forces(s: Point, f: Force) {
  const h = Math.max(0, len(s.p) - R), a = atmosphere(h);
  const relative = sub(s.v, atmosphereVelocity(s.p)), speed = len(relative);
  const q = 0.5 * a.density * speed * speed;
  const drag = q * (f.coefficient??dragCoefficient(speed / a.sound, f.booster)) * (f.area??Math.PI * 1.83 ** 2);
  const mass = f.dry + Math.max(0, s.fuel);
  const thrust = s.fuel > 0 ? f.thrust : 0;
  const applied = sub(mul(f.direction, thrust), mul(norm(relative), drag));
  const acceleration = add(mul(s.p, -MU / len(s.p) ** 3), mul(applied, 1 / mass));
  return { acceleration, fuel: -thrust / (f.isp * G0), q, drag, mass, thrust, atmosphere: a, relative, properG: len(applied) / mass / G0 };
}
// Four force evaluations; fixed guidance over each 20ms step, variable gravity/mass/drag.
export function integrate(s: Point, f: Force, dt: number): Point {
  const evalAt = (p: Point) => ({ p: p.v, v: forces(p, f).acceleration, fuel: forces(p, f).fuel });
  const advance = (p: Point, d: Point, amount: number): Point => ({ p: add(p.p, mul(d.p, amount)), v: add(p.v, mul(d.v, amount)), fuel: Math.max(0, p.fuel + d.fuel * amount) });
  const k1=evalAt(s), k2=evalAt(advance(s,k1,dt/2)), k3=evalAt(advance(s,k2,dt/2)), k4=evalAt(advance(s,k3,dt));
  const weighted = (a: V3,b: V3,c: V3,d: V3) => mul(add(add(a,mul(b,2)),add(mul(c,2),d)),dt/6);
  return { p:add(s.p,weighted(k1.p,k2.p,k3.p,k4.p)),v:add(s.v,weighted(k1.v,k2.v,k3.v,k4.v)),fuel:Math.max(0,s.fuel+dt*(k1.fuel+2*k2.fuel+2*k3.fuel+k4.fuel)/6) };
}
export function orbitOf(p: V3, v: V3): Orbit {
  const r=len(p), energy=dot(v,v)/2-MU/r, h=cross(p,v);
  const evec=sub(mul(cross(v,h),1/MU),mul(p,1/r)), e=len(evec);
  const semi=-MU/(2*energy);
  return { apogee: semi*(1+e)-R, perigee:semi*(1-e)-R, inclination:Math.acos(clamp(dot(norm(h),AXIS),-1,1))*180/Math.PI, eccentricity:e, period: energy<0 ? 2*Math.PI*Math.sqrt(semi**3/MU) : Infinity };
}
