import * as THREE from 'three';
import { volumeVertex, plumeFragment } from './shaders';

const white=new THREE.MeshStandardMaterial({color:0xd8dadd,roughness:.49,metalness:.26});
const black=new THREE.MeshStandardMaterial({color:0x11151a,roughness:.65,metalness:.25});
const steel=new THREE.MeshStandardMaterial({color:0x858e96,roughness:.38,metalness:.85});
const darkSteel=new THREE.MeshStandardMaterial({color:0x333c44,roughness:.65,metalness:.65});
export function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0){
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
export function cylinder(parent:THREE.Object3D,radius:number,height:number,y:number,material:THREE.Material,top=radius){return mesh(new THREE.CylinderGeometry(top,radius,height,48),material,parent,0,y,0);}
export function beam(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,radius:number,material=steel){
  const m=mesh(new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),8),material,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;
}
function seeded(seed:number){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function bodyTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=2048;const g=c.getContext('2d')!,rng=seeded(321);
  g.fillStyle='#d6d8d9';g.fillRect(0,0,c.width,c.height);
  for(let i=0;i<28000;i++){const y=rng()*2048;g.fillStyle=`rgba(26,30,34,${(1-y/2048)**5*rng()*.22})`;g.fillRect(rng()*1024,y,rng()*4,12+rng()*95);}
  g.strokeStyle='rgba(55,62,68,.23)';g.lineWidth=2;
  for(const y of [70,370,960,1590,1900]){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
  for(let x=0;x<1024;x+=128){g.strokeStyle='rgba(80,88,96,.12)';g.beginPath();g.moveTo(x,0);g.lineTo(x,2048);g.stroke();}
  g.save();g.translate(510,1180);g.rotate(-Math.PI/2);g.fillStyle='#16212d';g.font='bold 67px Arial';g.textAlign='center';g.fillText('S P A C E X',0,0);g.restore();
  g.fillStyle='#2c3640';g.font='24px Arial';g.textAlign='center';g.fillText('FALCON 9',510,1820);
  g.fillStyle='#1f334d';g.fillRect(700,1450,90,55);g.fillStyle='#eee';for(let i=0;i<7;i++)g.fillRect(700,1450+i*8,90,4);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function label(parent:THREE.Object3D,text:string,x:number,y:number,z:number,width:number,height:number,color='#dad9c8'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d')!;g.fillStyle=color;g.font='bold 80px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  return mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}),parent,x,y,z);
}
export interface RocketModel {
  group:THREE.Group;
  legs:THREE.Group[];
  fins:THREE.Group[];
  plume:THREE.Mesh;
  smoke:THREE.Mesh;
  light:THREE.PointLight;
  engineGlows:THREE.Mesh[];
  fairing?:THREE.Group[];
  payload?:THREE.Group;
  satellites?:THREE.Group[];
}
export function volume(smoke=false){
  const material=new THREE.ShaderMaterial({vertexShader:volumeVertex,fragmentShader:plumeFragment,
    uniforms:{uTime:{value:0},uPower:{value:1},uVacuum:{value:0},uNozzleRadius:{value:.055},uSmoke:{value:smoke?1:0},uSteps:{value:28}},
    transparent:true,premultipliedAlpha:true,depthWrite:false,side:THREE.BackSide});
  const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);m.frustumCulled=false;return m;
}
function exhaust(group:THREE.Group,y:number){
  const plume=volume(),smoke=volume(true);group.add(plume,smoke);plume.position.y=y-23;plume.scale.set(19,48,19);smoke.position.y=y-70;smoke.scale.set(45,65,45);
  const light=new THREE.PointLight(0xffa14a,0,220,1.6);light.position.y=y;group.add(light);
  return {plume,smoke,light};
}
export function createBooster():RocketModel {
  const group=new THREE.Group();
  const body=new THREE.MeshStandardMaterial({map:bodyTexture(),roughness:.5,metalness:.22});
  cylinder(group,1.83,37.5,22.1,body);cylinder(group,1.84,4.8,43.25,black);
  cylinder(group,1.84,.30,40.7,steel);cylinder(group,1.84,.3,3.4,darkSteel);
  for(const y of [8,20,32,39]){const ring=mesh(new THREE.TorusGeometry(1.837,.032,6,64),steel,group,0,y,0);ring.rotation.x=Math.PI/2;}
  const engineGlows:THREE.Mesh[]=[];
  for(let i=0;i<9;i++){
    const angle=i*Math.PI/4,r=i===8?0:1.10,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const bell=mesh(new THREE.CylinderGeometry(.25,.47,1.45,20,1,true),darkSteel,group,x,2.3,z);
    bell.rotation.y=angle;
    const glow=mesh(new THREE.CircleGeometry(.40,24),new THREE.MeshBasicMaterial({color:new THREE.Color(9,5,2),side:THREE.DoubleSide}),group,x,1.57,z);glow.rotation.x=Math.PI/2;engineGlows.push(glow);
    beam(group,new THREE.Vector3(x,3,z),new THREE.Vector3(x*.85,4,z*.85),.07);
  }
  // External raceway and smaller plumbing.
  mesh(new THREE.BoxGeometry(.19,33,.13),white,group,1.83,23,0);
  for(let i=0;i<4;i++)beam(group,new THREE.Vector3(Math.cos(i*1.57)*1.85,4,Math.sin(i*1.57)*1.85),new THREE.Vector3(Math.cos(i*1.57)*1.85,13,Math.sin(i*1.57)*1.85),.06);
  const legs:THREE.Group[]=[],fins:THREE.Group[]=[];
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2+Math.PI/4,assembly=new THREE.Group();assembly.rotation.y=angle;group.add(assembly);
    const hinge=new THREE.Group();hinge.position.set(1.72,9,0);assembly.add(hinge);
    beam(hinge,new THREE.Vector3(0,0,0),new THREE.Vector3(.35,9.95,0),.13,black);
    const panel=mesh(new THREE.BoxGeometry(.42,9.3,.75),white,hinge,.35,4.8,0);panel.rotation.z=-.04;
    beam(hinge,new THREE.Vector3(0,-.3,0),new THREE.Vector3(0,6.2,0),.07,steel);
    mesh(new THREE.BoxGeometry(.9,.25,1.25),black,hinge,.35,9.95,0);legs.push(hinge);
    const f=new THREE.Group();f.position.set(Math.cos(angle)*1.83,39.2,Math.sin(angle)*1.83);f.rotation.y=-angle;group.add(f);
    const panelGroup=new THREE.Group();f.add(panelGroup);
    for(let j=0;j<7;j++){
      mesh(new THREE.BoxGeometry(1.8,.05,.035),darkSteel,panelGroup,.92,0,(j-3)*.22);
      mesh(new THREE.BoxGeometry(.035,.07,1.35),darkSteel,panelGroup,j*.28+.08,0,0);
    }
    for(const z of [-.7,.7])mesh(new THREE.BoxGeometry(1.9,.09,.08),steel,panelGroup,.95,0,z);
    fins.push(f);
  }
  const ex=exhaust(group,1.5);return {group,legs,fins,...ex,engineGlows};
}
export function createSatellite(){
  const group=new THREE.Group();
  const chassis=new THREE.MeshStandardMaterial({color:0xb0b3b6,metalness:.83,roughness:.32});
  const solar=new THREE.MeshStandardMaterial({color:0x111c3f,metalness:.48,roughness:.38,side:THREE.DoubleSide});
  mesh(new THREE.BoxGeometry(2.6,.18,1.4),chassis,group);
  const panel=mesh(new THREE.BoxGeometry(2.5,.025,5.2),solar,group,0,.08,3.3);
  for(let i=0;i<16;i++)mesh(new THREE.BoxGeometry(2.5,.032,.008),steel,panel,0,.03,-2.5+i*.32);
  for(let i=0;i<7;i++)mesh(new THREE.BoxGeometry(.01,.035,5.2),steel,panel,-1.2+i*.4,.03,0);
  mesh(new THREE.BoxGeometry(2.1,.04,.95),white,group,0,-.12,0);
  panel.name='solar';return group;
}
export function createUpper():RocketModel {
  const group=new THREE.Group();cylinder(group,1.83,8.6,6.5,white);cylinder(group,1.84,.6,2.2,black);
  cylinder(group,.95,2.2,.85,darkSteel,.38);
  const glow=mesh(new THREE.CircleGeometry(.84,32),new THREE.MeshBasicMaterial({color:new THREE.Color(7,4,2),side:THREE.DoubleSide}),group,0,-.26,0);glow.rotation.x=Math.PI/2;
  const fairing:THREE.Group[]=[];
  for(let i=0;i<2;i++){
    const half=new THREE.Group();group.add(half);
    const shape=new THREE.LatheGeometry([new THREE.Vector2(1.8,9.8),new THREE.Vector2(2.6,11.5),new THREE.Vector2(2.6,18.3),new THREE.Vector2(2.3,20.5),new THREE.Vector2(1.5,23.1),new THREE.Vector2(.05,25.2)],48,i*Math.PI,Math.PI);
    mesh(shape,new THREE.MeshStandardMaterial({color:0xdddeda,metalness:.15,roughness:.45,side:THREE.DoubleSide}),half);fairing.push(half);
  }
  const payload=new THREE.Group();payload.position.y=12.4;group.add(payload);
  const satellites:THREE.Group[]=[];
  for(let i=0;i<8;i++){
    const sat=createSatellite();sat.position.set(0,i*.30,0);sat.getObjectByName('solar')!.visible=false;
    // Folded array occupies the same small envelope as the spacecraft bus.
    const folded=mesh(new THREE.BoxGeometry(2.4,.06,1.3),new THREE.MeshStandardMaterial({color:0x1b2850,metalness:.5,roughness:.4}),sat,0,.13,0);folded.name='folded';
    payload.add(sat);satellites.push(sat);
  }
  const ex=exhaust(group,-.2);return {group,legs:[],fins:[],...ex,engineGlows:[glow],fairing,payload,satellites};
}

export interface PadModel{group:THREE.Group;arms:THREE.Group[];strongback:THREE.Group;mist:THREE.Mesh;dust:THREE.Points;lights:THREE.Light[];}
export function createPad():PadModel{
  const group=new THREE.Group(),arms:THREE.Group[]=[],lights:THREE.Light[]=[];
  const concrete=new THREE.MeshStandardMaterial({color:0x54585a,roughness:.98});
  const platform=mesh(new THREE.CylinderGeometry(45,45,.5,96),concrete,group,0,-.2,0);
  platform.receiveShadow=true;
  mesh(new THREE.BoxGeometry(22,3,17),concrete,group,0,1.3,0);
  mesh(new THREE.BoxGeometry(6,1,85),darkSteel,group,0,.5,38);
  for(const x of [-5,5])for(const z of [-5,5])mesh(new THREE.BoxGeometry(1.8,5,1.8),steel,group,x,3,z);
  const mount=mesh(new THREE.TorusGeometry(3.5,.8,8,48),darkSteel,group,0,5.6,0);mount.rotation.x=Math.PI/2;
  const strongback=new THREE.Group();strongback.position.set(-9,0,-3);group.add(strongback);
  for(const x of [-2.3,2.3])for(const z of [-1.7,1.7])beam(strongback,new THREE.Vector3(x,0,z),new THREE.Vector3(x,67,z),.21,steel);
  for(let y=0;y<67;y+=4.2){
    for(const z of [-1.7,1.7]){
      beam(strongback,new THREE.Vector3(-2.3,y,z),new THREE.Vector3(2.3,y,z),.09);
      beam(strongback,new THREE.Vector3(-2.3,y,z),new THREE.Vector3(2.3,y+4.2,z),.09);
      beam(strongback,new THREE.Vector3(2.3,y,z),new THREE.Vector3(-2.3,y+4.2,z),.09);
    }
    mesh(new THREE.BoxGeometry(4.8,.12,3.7),darkSteel,strongback,0,y,0);
  }
  for(const y of [25,44,60]){
    const arm=new THREE.Group();arm.position.set(2.3,y,0);strongback.add(arm);
    beam(arm,new THREE.Vector3(0,0,0),new THREE.Vector3(5,0,2),.16);
    beam(arm,new THREE.Vector3(0,-1.2,0),new THREE.Vector3(5,0,2),.10);arms.push(arm);
  }
  for(const [x,z] of [[-70,-45],[70,-40],[-60,75],[65,75]]){
    beam(group,new THREE.Vector3(x,0,z),new THREE.Vector3(x,35,z),.23,darkSteel);
    mesh(new THREE.BoxGeometry(5,.6,1.4),steel,group,x,35,z);
    const light=new THREE.SpotLight(0xb9d5ff,1800,250,Math.PI/7,.75,1.6);light.position.set(x,35,z);light.target.position.set(0,25,0);group.add(light,light.target);lights.push(light);
    mesh(new THREE.BoxGeometry(4,.15,.6),new THREE.MeshBasicMaterial({color:new THREE.Color(2,2.3,3)}),group,x,34.6,z);
    const cone=mesh(new THREE.ConeGeometry(15,45,24,1,true),new THREE.MeshBasicMaterial({color:0xacc5f5,transparent:true,opacity:.004,depthWrite:false,side:THREE.DoubleSide}),group,x,18,z);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(-x,-13,-z).normalize());
  }
  for(let i=0;i<6;i++){
    const x=-95-i*13;mesh(new THREE.CylinderGeometry(4,4,11,24),white,group,x,5.5,-25);
    mesh(new THREE.SphereGeometry(4,24,12,0,Math.PI*2,0,Math.PI/2),white,group,x,11,-25);
    beam(group,new THREE.Vector3(x,2,-25),new THREE.Vector3(-12,2,-12),.13,steel);
  }
  mesh(new THREE.BoxGeometry(38,7,24),concrete,group,-125,3.5,40);
  for(let i=0;i<5;i++)mesh(new THREE.BoxGeometry(4,1.5,.1),new THREE.MeshBasicMaterial({color:0xffc788}),group,-139+i*7,4,52.1);
  label(group,'SLC / 40',0,2.83,8.55,11,2);
  const mist=volume(true);mist.position.set(0,2,-1);mist.scale.set(75,8,55);(mist.material as THREE.ShaderMaterial).uniforms.uPower.value=.18;group.add(mist);
  const positions=new Float32Array(800*3),rng=seeded(976);for(let i=0;i<800;i++){positions[i*3]=rng();positions[i*3+1]=rng();positions[i*3+2]=rng();}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(geo,new THREE.PointsMaterial({color:0xbfb4a4,size:1.2,transparent:true,opacity:.4,depthWrite:false}));dust.frustumCulled=false;group.add(dust);
  return {group,arms,strongback,mist,dust,lights};
}
export function createLandingPad(){
  const group=new THREE.Group();cylinder(group,38,.8,0,new THREE.MeshStandardMaterial({color:0x4d5157,roughness:.96}));
  const ring=mesh(new THREE.TorusGeometry(25,.3,6,128),new THREE.MeshStandardMaterial({color:0xe9e5d6,roughness:.9}),group,0,.45,0);ring.rotation.x=Math.PI/2;
  for(const x of [-5,5])mesh(new THREE.BoxGeometry(1,.1,14),white,group,x,.45,0);mesh(new THREE.BoxGeometry(11,.1,1),white,group,0,.45,0);
  const word=label(group,'LANDING ZONE 01',0,.46,31,30,4);word.rotation.x=-Math.PI/2;
  for(let i=0;i<24;i++){const a=i*Math.PI/12;mesh(new THREE.SphereGeometry(.3,8,8),new THREE.MeshBasicMaterial({color:new THREE.Color(4,2,.6)}),group,Math.cos(a)*36,.5,Math.sin(a)*36);}
  return group;
}
