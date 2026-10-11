import { calculateMission } from './mission';
self.onmessage=()=>{
  let code:'validation'|'calculation'='calculation';
  try {
    const data=calculateMission();
    if(!Number.isFinite(data.landingError)||data.landingError>10||data.landingSpeed>2||data.orbit.perigee<280000||data.orbit.apogee>320000)
      {code='validation';throw new Error('Mission orbit or landing validation failed.');}
    self.postMessage({type:'ready',data});
  }catch(error){self.postMessage({type:'error',code,message:error instanceof Error?error.message:String(error)});}
};
