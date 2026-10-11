import type { V3 } from './math';

export type VehicleId = 'stack' | 'booster' | 'upper';
export type Phase = 'countdown' | 'ascent' | 'coast' | 'boostback' | 'entry' | 'landing' | 'landed' | 'insertion' | 'orbit' | 'deployment' | 'disposal-coast' | 'deorbit' | 'reentry' | 'breakup' | 'disposed';
export interface VehicleState {
  position: V3;
  velocity: V3;
  direction: V3;
  fuel: number;
  mass: number;
  thrust: number;
  throttle: number;
  engines: number;
  altitude: number;
  speed: number;
  airspeed: number;
  verticalSpeed: number;
  q: number;
  drag: number;
  mach: number;
  density: number;
  properG: number;
  burnTime: number;
  phase: Phase;
}
export interface MissionEvent {
  id: string;
  time: number;
  label: string;
  detail: string;
  vehicle: VehicleId;
}
export interface MissionFrame {
  time: number;
  stack: VehicleState;
  booster: VehicleState;
  upper: VehicleState;
  satellites: SatelliteState[];
}
export interface SatelliteState { released: boolean; position: V3; velocity: V3; }
export interface Orbit { apogee: number; perigee: number; inclination: number; eccentricity: number; period: number; }
export interface MissionData {
  frames: MissionFrame[];
  events: MissionEvent[];
  orbit: Orbit;
  separation: number;
  fairing: number;
  seco: number;
  touchdown: number;
  deployment: number;
  end: number;
  maxQ: number;
  landingError: number;
  landingSpeed: number;
  parameters: Record<string, number>;
  disposal: DisposalInfo;
}
export interface DisposalInfo {
  start: number;
  burnStart: number;
  burnEnd: number;
  entry: number;
  breakup: number;
  impact: number;
  end: number;
  perigee: number;
  deltaV: number;
  impactFixed: V3;
  latitude: number;
  longitude: number;
}
