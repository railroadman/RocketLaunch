import { atmosphere } from '../sim/physics';
import { clamp, mix, smooth } from '../sim/math';

// Artistic envelope driven by the computed ambient pressure, not a 100km switch.
// These dimensions describe the visible shader volume, not a CFD prediction.
export function plumeProfile(altitude:number,kind:'booster'|'upper',engines:number){
  const pressure=atmosphere(altitude).pressure;
  const expansion=smooth(clamp(Math.log10(101325/Math.max(pressure,.0001))/5.5));
  const single=engines===1;
  const length=kind==='upper'?mix(38,150,expansion):mix(single?28:48,single?100:165,expansion);
  const width=kind==='upper'?mix(8,125,expansion):mix(single?6:engines===3?12:20,single?75:engines===3?120:185,expansion);
  const nozzleRadius=kind==='upper'?.88:single?.45:1.6;
  return {pressure,expansion,length,width,nozzleRadius:nozzleRadius/width};
}
