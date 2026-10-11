import { calculateMission } from './mission';
self.onmessage=()=>{
  try {
    const data=calculateMission();
    if(!Number.isFinite(data.landingError)||data.landingError>10||data.landingSpeed>2||data.orbit.perigee<280000||data.orbit.apogee>320000)
      throw new Error('Расчёт миссии не прошёл проверку орбиты или посадки.');
    self.postMessage({type:'ready',data});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
