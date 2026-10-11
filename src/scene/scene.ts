import { DisposalEffects } from './disposal';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBooster, createUpper, createPad, createLandingPad, volume, type RocketModel } from './models';
import { skyVertex, skyFragment, earthVertex, earthFragment, atmosphereVertex, atmosphereFragment, groundVertex, groundFragment, cinematicShader } from './shaders';
import { R, PAD, LANDING, earthFixed, localPosition, atmosphereVelocity } from '../sim/physics';
import { clamp, smooth, mix, mul, sub } from '../sim/math';
import type { MissionData, MissionFrame, VehicleId, VehicleState } from '../sim/types';
import { plumeProfile } from './plume';

export type Quality='high'|'medium'|'low';
type Shot={id:string;label:string;vehicle:VehicleId;offset:THREE.Vector3;focus:THREE.Vector3;fov:number;};
const vec=(p:readonly number[])=>new THREE.Vector3(p[0],p[1],p[2]);
const UP=new THREE.Vector3(0,1,0);
export class FlightScene {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(43,1,.4,25_000_000);
  readonly composer:EffectComposer;
  readonly controls:OrbitControls;
  readonly root=new THREE.Group();
  readonly booster=createBooster();
  readonly upper=createUpper();
  readonly pad=createPad();
  readonly landingPad=createLandingPad();
  readonly bloom:UnrealBloomPass;
  readonly grade:ShaderPass;
  private sky:THREE.Mesh;
  private planet:THREE.Mesh;
  private atmosphere:THREE.Mesh;
  private stars:THREE.Points;
  private ground:THREE.Mesh;
  private clouds:THREE.Group;
  private landingDust=volume(true);
  private trail:THREE.Line;
  readonly disposalEffects:DisposalEffects;
  private origin=new THREE.Vector3();
  private cameraFocus=new THREE.Vector3();
  private previousShot='';
  private previousVehicle:VehicleId='stack';
  private cameraFrom=new THREE.Vector3();
  private focusFrom=new THREE.Vector3();
  private transition=0;
  private lastTime=-30;
  private quality:Quality='high';
  manual=false;
  override:VehicleId|null=null;
  currentVehicle:VehicleId='stack';
  shotLabel='PAD / CAMERA 01';
  shotLabelKey='shot.pad';
  fps=60;

  constructor(canvas:HTMLCanvasElement,private data:MissionData){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false,logarithmicDepthBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset=false;
    this.scene.add(this.root);this.root.add(this.booster.group,this.upper.group,this.pad.group,this.landingPad);
    this.disposalEffects=new DisposalEffects(data);this.root.add(this.disposalEffects.group);
    this.root.add(...this.upper.satellites!);
    this.landingPad.position.copy(vec(LANDING)).sub(vec(PAD));
    const sun=new THREE.Vector3(-.85,.085,-.50).normalize();
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(8_000_000,32,20),new THREE.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,uniforms:{uAltitude:{value:0},uSun:{value:sun}},side:THREE.BackSide,depthWrite:false,depthTest:false}));this.sky.renderOrder=-100;this.sky.frustumCulled=false;this.scene.add(this.sky);
    const sunlight=new THREE.DirectionalLight(0xffc79b,3.4);sunlight.position.copy(sun).multiplyScalar(500);sunlight.castShadow=true;
    sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-100;sunlight.shadow.camera.right=100;sunlight.shadow.camera.top=100;sunlight.shadow.camera.bottom=-100;sunlight.shadow.camera.near=1;sunlight.shadow.camera.far=1000;sunlight.shadow.bias=-.00008;this.scene.add(sunlight,sunlight.target);
    this.scene.add(new THREE.HemisphereLight(0x94b5db,0x413221,1.35));
    const fill=new THREE.DirectionalLight(0x9bb5dc,.8);fill.position.set(100,100,150);this.scene.add(fill);
    const earthTexture=new THREE.TextureLoader().load('/textures/earth.jpg');earthTexture.colorSpace=THREE.SRGBColorSpace;earthTexture.anisotropy=8;
    this.planet=new THREE.Mesh(new THREE.SphereGeometry(R,160,96),new THREE.ShaderMaterial({vertexShader:earthVertex,fragmentShader:earthFragment,uniforms:{uSurface:{value:earthTexture},uSun:{value:sun}}}));this.planet.position.y=-R;this.root.add(this.planet);
    // Rotate the atlas so the Florida launch latitude/longitude is under the local pad.
    const lat=28.5*Math.PI/180,lon=-80.6*Math.PI/180;
    const up=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon));
    const east=new THREE.Vector3(-Math.sin(lon),0,-Math.cos(lon));const south=new THREE.Vector3().crossVectors(east,up);
    const basis=new THREE.Matrix4().makeBasis(east,up,south).transpose();this.planet.quaternion.setFromRotationMatrix(basis);
    this.atmosphere=new THREE.Mesh(new THREE.SphereGeometry(R+45000,128,64),new THREE.ShaderMaterial({vertexShader:atmosphereVertex,fragmentShader:atmosphereFragment,uniforms:{uSun:{value:sun},uOpacity:{value:.38}},transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending}));this.atmosphere.position.y=-R;this.root.add(this.atmosphere);
    const groundGeo=new THREE.PlaneGeometry(140000,140000,100,100);groundGeo.rotateX(-Math.PI/2);
    const pos=groundGeo.getAttribute('position');for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,-(x*x+z*z)/(2*R)-.3);}groundGeo.computeVertexNormals();
    this.ground=new THREE.Mesh(groundGeo,new THREE.ShaderMaterial({vertexShader:groundVertex,fragmentShader:groundFragment,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),uSun:{value:sun}},fog:true}));this.root.add(this.ground);
    this.clouds=new THREE.Group();this.root.add(this.clouds);
    for(let i=0;i<7;i++){const cloud=volume(true);cloud.position.set(-20000+i*16000,1100+i*80,-25000-Math.sin(i*1.9)*15000);cloud.scale.set(35000,700,9000);const mat=cloud.material as THREE.ShaderMaterial;mat.uniforms.uPower.value=.08;mat.uniforms.uSteps.value=12;this.clouds.add(cloud);}
    const starGeo=new THREE.BufferGeometry(),starPositions=new Float32Array(5000*3);let seed=321;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<5000;i++){const theta=random()*Math.PI*2,z=random()*2-1,r=Math.sqrt(1-z*z);starPositions.set([r*Math.cos(theta)*7e6,z*7e6,r*Math.sin(theta)*7e6],i*3);}
    starGeo.setAttribute('position',new THREE.BufferAttribute(starPositions,3));this.stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc4d5ed,size:1.2,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));this.stars.renderOrder=-90;this.scene.add(this.stars);
    const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(120*3),3));this.trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color:0xc5cad2,transparent:true,opacity:.12}));this.root.add(this.trail);
    this.landingDust.scale.set(95,14,95);this.landingDust.position.copy(this.landingPad.position).add(new THREE.Vector3(0,5,0));this.root.add(this.landingDust);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.55,.65,1.15);this.composer.addPass(this.bloom);
    this.grade=new ShaderPass(cinematicShader);this.composer.addPass(this.grade);this.composer.addPass(new OutputPass());
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enabled=false;this.controls.enableDamping=true;this.controls.minDistance=12;this.controls.maxDistance=2000000;
    window.addEventListener('resize',()=>this.resize());this.resize();
  }
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer.setSize(innerWidth,innerHeight);}
  setQuality(quality:Quality){
    this.quality=quality;const ratio=quality==='high'?Math.min(devicePixelRatio,1.5):quality==='medium'?1:.75;
    this.renderer.setPixelRatio(ratio);this.composer.setPixelRatio(ratio);this.bloom.enabled=quality!=='low';this.renderer.shadowMap.enabled=quality==='high';
    this.clouds.visible=quality==='high';
    for(const model of [this.booster,this.upper])for(const plume of [model.plume,model.smoke])(plume.material as THREE.ShaderMaterial).uniforms.uSteps.value=quality==='high'?32:quality==='medium'?22:14;
    this.resize();
  }
  setManual(manual:boolean){this.manual=manual;this.controls.enabled=manual;if(manual)this.controls.target.copy(this.cameraFocus);else this.previousShot='';}
  private shot(frame:MissionFrame):Shot{
    const t=frame.time, d=this.data;
    let vehicle:VehicleId='stack',id='pad',label='PAD / CAMERA 01',offset=new THREE.Vector3(110,0,145),focus=new THREE.Vector3(0,34,0),fov=43;
    if(t<0){const push=smooth((t+30)/30);offset.set(mix(145,112,push),mix(-17,-9,push),mix(185,145,push));}
    else if(t<18){id='liftoff';label='PAD / LIFTOFF';offset.set(120,Math.max(-frame.stack.altitude*.35,-70),160);focus.y=31;}
    else if(t<d.separation-7){
      id='ascent';label='TRACKING / ASCENT';
      const profile=plumeProfile(frame.stack.altitude,'booster',9),expansion=profile.expansion;
      offset.set(145+expansion*125,20+expansion*45,180+expansion*155);
      focus.y=mix(25,-48,expansion);fov=46;
    }
    else if(t<d.separation+16){id='separation';label='CHASE / STAGE SEPARATION';vehicle='upper';offset.set(95,-25,115);focus.y=32;fov=49;}
    else if(t<d.fairing-7){id='boostback';label='BOOSTER / RETURN MANEUVER';vehicle='booster';offset.set(125,35,135);focus.y=23;}
    else if(t<d.fairing+15){id='fairing';label='UPPER STAGE / FAIRING';vehicle='upper';offset.set(85,25,110);focus.y=50;}
    else if(t<d.events.find(e=>e.id==='entry')!.time-12){
      const segment=Math.floor((t-(d.fairing+15))/55);
      vehicle=segment%2===0?'upper':'booster';id=`cruise-${segment}`;label=vehicle==='upper'?'UPPER STAGE / ORBITAL ASCENT':'BOOSTER / BALLISTIC COAST';offset.set(140,45,145);focus.y=vehicle==='upper'?55:24;
    }else if(t<d.touchdown-65){vehicle='booster';id='entry';label='BOOSTER / ATMOSPHERIC ENTRY';offset.set(95,15,120);focus.y=23;}
    else if(t<d.touchdown-33){vehicle='upper';id='orbit';label='UPPER STAGE / ORBIT INSERTION';offset.set(100,0,130);focus.y=50;}
    else if(t<d.touchdown+12){
      vehicle='booster';id='landing';label='LANDING ZONE 01 / GROUND CAMERA';
      const p=vec(localPosition(frame.booster.position,t)),pad=this.landingPad.position;
      const height=frame.booster.altitude;
      if(height>200){offset.set(105,-35,120);focus.y=20;}
      else {offset.copy(pad).sub(p).add(new THREE.Vector3(100,10,135));focus.y=19;fov=43;}
    }else if(t<d.deployment+40){vehicle='upper';id='deployment';label='PAYLOAD / STARLINK DEPLOYMENT';offset.set(70,30,85);focus.y=64+Math.max(0,t-d.deployment)*1.4;fov=48;}
    else{vehicle='upper';id='final';label='ORBIT / MISSION OVERVIEW';const f=smooth((t-d.deployment-40)/55);offset.set(mix(90,2900,f),mix(38,900,f),mix(105,3500,f));focus.y=55;fov=46;}
    const karman=d.events.find(e=>e.id==='karman')!.time;
    if(t>=karman-8&&t<=Math.min(karman+10,d.fairing-2)){vehicle='upper';id='karman';label='100 KM / KÁRMÁN LINE · EXPANDING PLUME';offset.set(230,75,285);focus.y=-12;fov=50;}
    if(t>=d.disposal.start){
      vehicle='upper';id=frame.upper.phase==='deorbit'?'deorbit':frame.upper.phase==='reentry'?'reentry':frame.upper.phase==='breakup'?'breakup':frame.upper.phase==='disposed'?'ocean':'disposalCoast';
      label=`UPPER STAGE / ${id.toUpperCase()}`;
      const radial=vec(earthFixed(frame.upper.position,t)).normalize();
      const along=vec(earthFixed(sub(frame.upper.velocity,atmosphereVelocity(frame.upper.position)),t)).normalize();
      const side=new THREE.Vector3().crossVectors(along,radial).normalize();
      const distance=id==='breakup'?230:id==='ocean'?260:135;
      offset.copy(radial).multiplyScalar(id==='ocean'?140:45).addScaledVector(side,distance).addScaledVector(along,-distance*.5);
      focus.y=frame.upper.phase==='disposed'?0:57;fov=48;
    }
    if(this.override&&t>=d.separation){vehicle=this.override;id=`manual-${vehicle}`;label=vehicle==='booster'?'BOOSTER / TRACKING':'UPPER STAGE / TRACKING';offset.set(110,20,145);focus.y=vehicle==='booster'?23:55;}
    return {id,label,vehicle,offset,focus,fov};
  }
  private updateRocket(model:RocketModel,s:VehicleState,t:number,base:number,kind:'booster'|'upper'){
    model.group.position.copy(vec(localPosition(s.position,t)));
    const fixedDir=vec(earthFixed(s.direction,t));model.group.quaternion.setFromUnitVectors(UP,fixedDir.normalize());model.group.position.addScaledVector(fixedDir,base);
    const engineCount=t<0?9:Math.max(1,s.engines);
    const maxThrust=kind==='upper'?981000:engineCount>=9?8227000:engineCount===3?2742333:914111;
    let power=s.thrust>0?clamp(s.thrust/maxThrust,.08,1):0;
    if(t<0&&kind==='booster')power=smooth((t+3)/3)*.75;
    const profile=plumeProfile(s.altitude,kind,engineCount),{expansion:vacuum,length,width}=profile;
    model.plume.visible=power>.01;model.plume.position.y=(kind==='booster'?1.5:-.2)-length/2;model.plume.scale.set(width,length,width);
    const material=model.plume.material as THREE.ShaderMaterial;material.uniforms.uTime.value=t;material.uniforms.uPower.value=power;material.uniforms.uVacuum.value=vacuum;material.uniforms.uNozzleRadius.value=profile.nozzleRadius;
    model.smoke.visible=power>.01&&s.altitude<22000&&this.quality!=='low';model.smoke.position.y=-(length+30);model.smoke.scale.set(width*2,80,width*2);
    const smoke=model.smoke.material as THREE.ShaderMaterial;smoke.uniforms.uTime.value=t*.3;smoke.uniforms.uPower.value=power*(1-vacuum)*.85;
    model.light.intensity=power*2200;model.light.distance=160+power*200;
    model.engineGlows.forEach((glow,i)=>{glow.visible=power>.01&&(kind==='upper'||s.engines===9||t<0||s.engines===3&&(i===8||i===0||i===4)||s.engines===1&&i===8);});
    const legAmount=s.phase==='landed'?1:smooth((150-s.altitude)/115)*(s.verticalSpeed<0?1:0);
    model.legs.forEach(leg=>leg.rotation.z=-legAmount*2.56);
    const fins=t>this.data.separation+10?smooth((t-this.data.separation-10)/8):0;
    model.fins.forEach(fin=>fin.rotation.z=(1-fins)*Math.PI/2);
  }
  render(frame:MissionFrame,dt:number){
    const t=frame.time,shot=this.shot(frame),s=frame[shot.vehicle],target=vec(localPosition(s.position,t));
    this.currentVehicle=shot.vehicle;this.shotLabel=shot.label;
    this.shotLabelKey=this.manual?'shot.free':shot.id.startsWith('cruise-')?`shot.cruise${shot.vehicle==='upper'?'Upper':'Booster'}`:shot.id.startsWith('manual-')?`shot.manual${shot.vehicle==='upper'?'Upper':'Booster'}`:`shot.${shot.id}`;
    const oldOrigin=this.origin.clone();this.origin.copy(target);this.root.position.copy(target).negate();
    if(this.manual){const shift=oldOrigin.sub(this.origin);this.camera.position.add(shift);this.controls.target.add(shift);}
    const base=t<this.data.separation?6:6*(1-smooth((t-this.data.separation)/20));
    this.updateRocket(this.booster,t<this.data.separation?frame.stack:frame.booster,t,base,'booster');
    this.updateRocket(this.upper,frame.upper,t,50,'upper');
    this.upper.group.visible=frame.upper.phase!=='breakup'&&frame.upper.phase!=='disposed';
    const reentryAnchor=this.upper.group.position.clone().addScaledVector(vec(earthFixed(frame.upper.direction,t)),6.5);
    this.disposalEffects.update(t,frame.upper,reentryAnchor,shot.vehicle==='upper');
    if(t>=this.data.disposal.start&&shot.vehicle==='upper')this.camera.up.copy(vec(earthFixed(s.position,t)).normalize());else this.camera.up.copy(UP);
    this.upper.fairing!.forEach((half,i)=>{const elapsed=Math.max(0,t-this.data.fairing);half.visible=elapsed<45;half.position.set((i===0?1:-1)*elapsed*1.7,-elapsed*.15,0);half.rotation.z=(i===0?-1:1)*elapsed*.025;});
    const release=Math.max(0,t-this.data.deployment);
    this.upper.satellites!.forEach((sat,i)=>{
      const elapsed=Math.max(0,release-i*.5),spacecraft=frame.satellites[i];
      if(spacecraft?.released)sat.position.copy(vec(localPosition(spacecraft.position,t)));
      else sat.position.set(0,12.4+i*.3,0).applyQuaternion(this.upper.group.quaternion).add(this.upper.group.position);
      sat.rotation.set(.85+elapsed*.006*(i-3),elapsed*.015,.3+elapsed*.009*(i-2));
      if(!spacecraft?.released)sat.quaternion.premultiply(this.upper.group.quaternion);
      const panel=sat.getObjectByName('solar')!,folded=sat.getObjectByName('folded')!;
      panel.visible=elapsed>12;folded.visible=elapsed<=12;const extend=smooth((elapsed-12)/10);panel.scale.z=Math.max(.02,extend);panel.position.z=.6+2.7*extend;
    });
    this.pad.strongback.rotation.z=.22*smooth((t+8)/11);this.pad.arms.forEach(arm=>arm.rotation.y=-1.2*smooth((t+8)/8));
    const fog=this.pad.mist.material as THREE.ShaderMaterial;fog.uniforms.uTime.value=t*.2;fog.uniforms.uPower.value=t<0?.18:t<18?.6*(1-t/18):0;this.pad.mist.visible=t<18;
    const dust=this.pad.dust.geometry.getAttribute('position');
    for(let i=0;i<dust.count;i++){const angle=i*2.39996,r=(12+(i%47)*.8)*Math.max(0,t)*.18,y=(Math.sin(i)*.5+.5)*Math.max(0,t)*.45;dust.setXYZ(i,Math.cos(angle)*r,Math.max(0,y-t*t*.04),Math.sin(angle)*r);}
    dust.needsUpdate=true;this.pad.dust.visible=t>=0&&t<22;
    const landingPower=frame.booster.altitude<120&&t>this.data.separation?clamp(frame.booster.thrust/850000):0;
    this.landingDust.visible=landingPower>0||t>=this.data.touchdown&&t<this.data.touchdown+15;
    const lm=this.landingDust.material as THREE.ShaderMaterial;lm.uniforms.uTime.value=t*.2;lm.uniforms.uPower.value=landingPower*.5+(t>this.data.touchdown?Math.max(0,1-(t-this.data.touchdown)/15)*.3:0);
    this.ground.visible=s.altitude<100000&&(t<this.data.disposal.start||shot.vehicle==='booster');this.pad.group.visible=s.altitude<80000;this.landingPad.visible=s.altitude<80000;
    this.planet.visible=s.altitude>12000||t>=this.data.disposal.start&&shot.vehicle==='upper';this.atmosphere.visible=s.altitude>20000;
    this.sky.position.copy(this.camera.position);(this.sky.material as THREE.ShaderMaterial).uniforms.uAltitude.value=s.altitude;
    this.stars.position.copy(this.camera.position);(this.stars.material as THREE.PointsMaterial).opacity=smooth((s.altitude-35000)/85000)*.7;
    const atmosphereColor=new THREE.Color().setRGB(mix(.26,.001,clamp(s.altitude/100000)),mix(.16,.003,clamp(s.altitude/100000)),mix(.13,.008,clamp(s.altitude/100000)));
    this.scene.fog=s.altitude<60000?new THREE.FogExp2(atmosphereColor,.000055*Math.exp(-s.altitude/16000)):null;
    const trailPos=this.trail.geometry.getAttribute('position');let points=0;
    for(let i=0;i<120;i++){const at=t-25+i*25/119;if(at<0||at>this.data.separation)continue;const index=Math.floor((at+30)/.2),historical=this.data.frames[Math.min(index,this.data.frames.length-1)];if(!historical)continue;const p=vec(localPosition(historical.stack.position,t));trailPos.setXYZ(points++,p.x,p.y,p.z);}
    trailPos.needsUpdate=true;this.trail.geometry.setDrawRange(0,points);this.trail.visible=t>40&&t<this.data.separation;
    const focus=vec(earthFixed(s.direction,t)).normalize().multiplyScalar(shot.focus.y);
    const desired=shot.offset.clone().add(focus);
    if(!this.manual){
      const jump=Math.abs(t-this.lastTime)>Math.max(1,dt*30)||this.previousVehicle!==shot.vehicle;
      if(this.previousShot!==shot.id&&!jump){this.cameraFrom.copy(this.camera.position).add(oldOrigin).sub(this.origin);this.focusFrom.copy(this.cameraFocus).add(oldOrigin).sub(this.origin);this.transition=0;}
      if(this.previousShot===''||jump){this.cameraFrom.copy(desired);this.focusFrom.copy(focus);this.transition=1;}
      this.transition=clamp(this.transition+dt*.85);const ease=smooth(this.transition);
      this.camera.position.copy(this.cameraFrom).lerp(desired,ease);this.cameraFocus.copy(this.focusFrom).lerp(focus,ease);
      if(t>=0&&t<18&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const shake=.35*Math.exp(-t/6);this.camera.position.x+=Math.sin(t*43)*shake;this.camera.position.y+=Math.sin(t*61)*shake*.7;}
      this.camera.lookAt(this.cameraFocus);this.camera.fov=shot.fov;this.camera.updateProjectionMatrix();
    }else{this.controls.update();this.cameraFocus.copy(this.controls.target);}
    this.previousShot=shot.id;this.previousVehicle=shot.vehicle;this.lastTime=t;
    const flare=(shot.vehicle==='upper'?this.upper.group:this.booster.group).position.clone().add(this.root.position);flare.project(this.camera);
    this.grade.uniforms.uTime.value=t;this.grade.uniforms.uAberration.value=s.phase==='ascent'?.00065*clamp(s.airspeed/1700):0;
    this.grade.uniforms.uFlare.value=s.thrust>0&&flare.z<1&&Math.abs(flare.x)<1.1&&Math.abs(flare.y)<1.1?.6:0;this.grade.uniforms.uFlarePosition.value=new THREE.Vector2(flare.x*.5+.5,flare.y*.5+.5);
    this.fps=mix(this.fps,1/Math.max(dt,.001),.03);
    this.renderer.info.reset();this.composer.render(dt);
  }
  dispose(){this.controls.dispose();this.composer.dispose();this.scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose());}});this.renderer.dispose();}
}
