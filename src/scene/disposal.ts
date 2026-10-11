import * as THREE from 'three';
import { earthFixed, atmosphereVelocity, PAD, R } from '../sim/physics';
import { sub, clamp } from '../sim/math';
import type { MissionData, VehicleState } from '../sim/types';

const vec=(p:readonly number[])=>new THREE.Vector3(p[0],p[1],p[2]);
const UP=new THREE.Vector3(0,1,0);

// Every effect is a function of mission time, so pause and backwards seeks are safe.
export class DisposalEffects {
  readonly group=new THREE.Group();
  readonly ocean:THREE.Mesh;
  readonly sheath:THREE.Mesh;
  readonly fragments:THREE.Mesh[]=[];
  readonly trails:THREE.Mesh[]=[];
  readonly splashes:THREE.Mesh[]=[];
  heat=0;
  constructor(private data:MissionData){
    const surface=new THREE.PlaneGeometry(80000,80000,80,80);surface.rotateX(-Math.PI/2);
    const points=surface.getAttribute('position');
    for(let i=0;i<points.count;i++){const x=points.getX(i),z=points.getZ(i);points.setY(i,-(x*x+z*z)/(2*R));}surface.computeVertexNormals();
    const water=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,fragmentShader:`
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; varying vec3 vPosition;
      void main(){
      #include <logdepthbuf_fragment>
      float waves=sin(vPosition.x*.006+uTime*.8)*sin(vPosition.z*.004-uTime*.5);
      float detail=sin(vPosition.x*.035+vPosition.z*.018+uTime)*.5+.5;
      vec3 sea=mix(vec3(.015,.075,.13),vec3(.04,.23,.31),waves*.5+.5);
      sea+=vec3(.12,.2,.22)*pow(detail,14.)*.3;gl_FragColor=vec4(sea,1.);}`});
    this.ocean=new THREE.Mesh(surface,water);
    const fixed=vec(data.disposal.impactFixed);this.ocean.position.copy(fixed).sub(vec(PAD));
    this.ocean.quaternion.setFromUnitVectors(UP,fixed.normalize());this.group.add(this.ocean);
    const plasma=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uHeat:{value:0}},vertexShader:`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal);vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,fragmentShader:`
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform float uHeat; varying vec3 vNormal; varying vec3 vPosition;
      void main(){
      #include <logdepthbuf_fragment>
      float rim=pow(1.-abs(vNormal.z),1.5);float flicker=.72+.28*sin(vPosition.y*13.+vPosition.x*9.-uTime*31.);
      vec3 color=mix(vec3(3.5,.22,.025),vec3(4.,1.7,.3),rim);
      gl_FragColor=vec4(color,uHeat*(.13+rim*.6)*flicker);}`,
      transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    this.sheath=new THREE.Mesh(new THREE.SphereGeometry(1,28,20),plasma);this.group.add(this.sheath);
    for(let i=0;i<7;i++){
      const material=new THREE.MeshStandardMaterial({color:0x9b9b91,roughness:.5,metalness:.5,emissive:0xff4708,emissiveIntensity:0});
      const fragment=new THREE.Mesh(i%2?new THREE.BoxGeometry(1.3,2.4,.35):new THREE.CylinderGeometry(.4,.6,2.1,6,1,true),material);
      this.fragments.push(fragment);this.group.add(fragment);
      const trail=new THREE.Mesh(new THREE.ConeGeometry(1,1,12,1,true),new THREE.MeshBasicMaterial({color:new THREE.Color(.95,.3,.04),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
      this.trails.push(trail);this.group.add(trail);
    }
    for(let i=0;i<2;i++){
      const splash=new THREE.Mesh(new THREE.RingGeometry(.65,1,48),new THREE.MeshBasicMaterial({color:0xd9f7ff,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      splash.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),vec(data.disposal.impactFixed).normalize());
      this.splashes.push(splash);this.group.add(splash);
    }
  }
  update(time:number,state:VehicleState,anchor:THREE.Vector3,viewUpper:boolean){
    const d=this.data.disposal,active=time>=d.start;
    this.group.visible=active&&viewUpper;
    this.ocean.visible=time>=d.entry;
    (this.ocean.material as THREE.ShaderMaterial).uniforms.uTime.value=time;
    const up=vec(earthFixed(state.position,time)).normalize();
    const velocity=vec(earthFixed(sub(state.velocity,atmosphereVelocity(state.position)),time));
    const along=velocity.lengthSq()>1?velocity.normalize():new THREE.Vector3(1,0,0).cross(up).normalize();
    const side=new THREE.Vector3().crossVectors(along,up).normalize();
    this.heat=state.phase==='reentry'||state.phase==='breakup'?clamp(Math.sqrt(state.density)*state.airspeed**3/1.2e9):0;
    this.sheath.visible=time>=d.entry&&time<d.breakup;
    this.sheath.position.copy(anchor);this.sheath.scale.set(4+this.heat*3,12+this.heat*12,4+this.heat*3);
    this.sheath.quaternion.setFromUnitVectors(UP,along);
    const plasma=this.sheath.material as THREE.ShaderMaterial;plasma.uniforms.uTime.value=time;plasma.uniforms.uHeat.value=this.heat;
    const elapsed=Math.max(0,time-d.breakup),spread=clamp(elapsed/40)*32;
    this.fragments.forEach((fragment,i)=>{
      const surviving=i<2,visible=time>=d.breakup&&time<d.impact&&(surviving||elapsed<30+i*4);
      fragment.visible=visible;
      fragment.position.copy(anchor).addScaledVector(side,(i-3)*spread).addScaledVector(up,Math.sin(i*2.3)*spread*.4).addScaledVector(along,Math.cos(i)*spread);
      fragment.rotation.set(elapsed*(.3+i*.035),elapsed*(.15+i*.07),i+elapsed*.22);
      (fragment.material as THREE.MeshStandardMaterial).emissiveIntensity=this.heat*4;
      const trail=this.trails[i],length=15+this.heat*65;
      trail.visible=visible&&this.heat>.015;trail.position.copy(fragment.position).addScaledVector(along,-length/2);trail.quaternion.setFromUnitVectors(UP,along.clone().negate());trail.scale.set(1+this.heat*2,length,1+this.heat*2);
      (trail.material as THREE.MeshBasicMaterial).opacity=this.heat*.3;
    });
    const splashTime=time-d.impact,fixed=vec(d.impactFixed).sub(vec(PAD));
    this.splashes.forEach((splash,i)=>{
      const age=splashTime-i*.6;splash.visible=age>=0&&age<9;
      const radius=8+Math.sqrt(Math.max(0,age))*30;splash.scale.setScalar(radius);
      splash.position.copy(fixed).addScaledVector(side,(i-.5)*60).addScaledVector(vec(d.impactFixed).normalize(),1.5);
      (splash.material as THREE.MeshBasicMaterial).opacity=clamp(1-age/9)*.8;
    });
  }
}
