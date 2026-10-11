import { mix, norm, type V3 } from './math';
import type { VehicleState } from './types';

export const interpolateVector=(a:V3,b:V3,t:number):V3=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];

// Positions and telemetry must refer to the same time before Earth-fixed conversion.
// Engine/phase transitions retain the preceding discrete state until the next sample.
export function interpolateVehicle(a:VehicleState,b:VehicleState,t:number):VehicleState {
  const result={...a};
  for(const key of ['fuel','mass','altitude','speed','airspeed','verticalSpeed','q','drag','mach','density','properG','burnTime'] as const)result[key]=mix(a[key],b[key],t);
  result.position=interpolateVector(a.position,b.position,t);
  result.velocity=interpolateVector(a.velocity,b.velocity,t);
  result.direction=norm(interpolateVector(a.direction,b.direction,t));
  return result;
}
