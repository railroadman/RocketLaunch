export const volumeVertex=/*glsl*/`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vCamera;
void main(){
  vLocal=position;
  vCamera=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  #include <logdepthbuf_vertex>
}`;
export const plumeFragment=/*glsl*/`
precision highp float;
#include <logdepthbuf_pars_fragment>
varying vec3 vLocal;
varying vec3 vCamera;
uniform float uTime;
uniform float uPower;
uniform float uVacuum;
uniform float uNozzleRadius;
uniform float uSmoke;
uniform int uSteps;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .55*noise(p)+.28*noise(p*2.03)+.12*noise(p*4.07);}
void main(){
  #include <logdepthbuf_fragment>
  vec3 ray=normalize(vLocal-vCamera);
  vec3 inv=1./ray;
  vec3 t0=(-vec3(.5)-vCamera)*inv,t1=(vec3(.5)-vCamera)*inv;
  vec3 mn=min(t0,t1),mx=max(t0,t1);
  float enter=max(max(mn.x,mn.y),mn.z),leave=min(min(mx.x,mx.y),mx.z);
  enter=max(enter,0.);if(leave<=enter)discard;
  float stepLength=(leave-enter)/float(uSteps);
  vec4 color=vec4(0.);
  for(int i=0;i<48;i++){
    if(i>=uSteps)break;
    vec3 p=vCamera+ray*(enter+(float(i)+.45)*stepLength);
    float y=.5-p.y;
    float n=fbm(p*vec3(12.,16.,12.)+vec3(0.,uTime*4.,0.));
    float vacuum=uVacuum*(1.-uSmoke);
    float nozzle=mix(uNozzleRadius,.055,uSmoke);
    float radius=mix(nozzle,mix(.34,.47,vacuum),pow(y,mix(.85,.62,vacuum)));
    float turbulence=(n-.45)*.11*y;
    float radial=length(p.xz+vec2(sin(y*18.+uTime*4.),cos(y*14.+uTime*3.))*y*.012);
    float envelope=1.-smoothstep(radius*.48+turbulence,radius+turbulence,radial);
    float density=envelope*(1.-smoothstep(.58,1.,y))*(.6+n*.8);
    density*=mix(1.,.27,vacuum)/(1.+y*vacuum*2.);
    float coreRadius=mix(.035+y*.06,nozzle*(1.+y*5.),vacuum);
    float core=exp(-radial*radial/(coreRadius*coreRadius))*exp(-y*mix(3.,8.,vacuum));
    float diamonds=.5+.5*cos(y*100.-pow(y,2.)*40.);
    vec3 diffuse=mix(vec3(1.8,.16,.015),vec3(1.25,.45,.62),vacuum);
    vec3 fire=mix(diffuse,vec3(4.,2.4,1.2),core);
    fire=mix(fire,vec3(5.,5.,4.),exp(-y*mix(12.,28.,vacuum))*core);
    fire*=.8+.2*diamonds*exp(-y*4.)*(1.-vacuum);
    vec3 smoke=mix(vec3(.13,.15,.19),vec3(.48,.43,.4),n);
    vec3 sampleColor=mix(fire,smoke,uSmoke);
    float alpha=1.-exp(-density*stepLength*mix(9.,15.,uSmoke)*uPower);
    color.rgb+=(1.-color.a)*sampleColor*alpha;
    color.a+=(1.-color.a)*alpha;
    if(color.a>.98)break;
  }
  if(color.a<.005)discard;
  gl_FragColor=vec4(color.rgb,color.a);
}`;

export const skyVertex=/*glsl*/`
varying vec3 vDirection;
void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const skyFragment=/*glsl*/`
varying vec3 vDirection;
uniform float uAltitude;
uniform vec3 uSun;
void main(){
  vec3 dir=normalize(vDirection);
  float h=max(0.,dir.y),fade=exp(-uAltitude/38000.);
  vec3 horizon=vec3(.25,.085,.038),zenith=vec3(.009,.021,.047);
  vec3 dusk=mix(horizon,zenith,pow(h,.42));
  float sun=max(0.,dot(dir,uSun));
  dusk+=vec3(.70,.29,.08)*pow(sun,12.)*.55;
  dusk+=vec3(2.5,1.7,.85)*smoothstep(.99978,.99990,sun);
  vec3 space=vec3(.0005,.001,.003);
  gl_FragColor=vec4(mix(space,dusk,fade),1.);
}`;
export const atmosphereVertex=/*glsl*/`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormal;varying vec3 vWorld;
void main(){vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
#include <logdepthbuf_vertex>
}`;
export const earthVertex=/*glsl*/`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
void main(){
  vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);
  vWorld=(modelMatrix*vec4(position,1.)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  #include <logdepthbuf_vertex>
}`;
export const earthFragment=/*glsl*/`
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
uniform sampler2D uSurface;uniform vec3 uSun;
void main(){
  #include <logdepthbuf_fragment>
  vec3 normal=normalize(vNormal);
  vec3 surface=texture2D(uSurface,vUv).rgb;
  float ocean=smoothstep(.008,.045,surface.b-surface.r)*(1.-smoothstep(.07,.20,surface.r));
  // Neutral sunlight in orbit; the warm pad lights must not tint the whole globe.
  surface=mix(surface,surface*vec3(.72,1.45,2.05),ocean*.85);
  float day=smoothstep(-.18,.32,dot(normal,uSun));
  float grazing=pow(1.-max(0.,dot(normal,normalize(cameraPosition-vWorld))),3.);
  vec3 color=surface*(.22+.78*day);
  color+=vec3(.012,.043,.105)*(.10+grazing*.75)*(.35+.65*day);
  gl_FragColor=vec4(color,1.);
}`;
export const atmosphereFragment=/*glsl*/`
#include <logdepthbuf_pars_fragment>
varying vec3 vNormal;varying vec3 vWorld;uniform vec3 uSun;uniform float uOpacity;
void main(){
#include <logdepthbuf_fragment>
vec3 normal=normalize(vNormal);
float rim=pow(1.-abs(dot(normalize(cameraPosition-vWorld),normal)),4.);
float sun=dot(normal,uSun);
float twilight=exp(-abs(sun)*28.);
vec3 c=mix(vec3(.065,.30,.92),vec3(.64,.32,.18),twilight*.07);
gl_FragColor=vec4(c*(.38+.62*smoothstep(-.25,.18,sun)),rim*uOpacity);}`;
export const groundVertex=/*glsl*/`
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
varying vec3 vWorld;varying vec3 vNormal;
void main(){vWorld=position;vNormal=normal;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`;
export const groundFragment=/*glsl*/`
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
varying vec3 vWorld;varying vec3 vNormal;
uniform vec3 uSun;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  #include <logdepthbuf_fragment>
  vec2 p=vWorld.xz;
  float n=hash(floor(p*.2)),fine=hash(floor(p*1.8));
  float shoreline=11000.+sin(p.y*.00015)*2100.;
  float water=smoothstep(shoreline-60.,shoreline+60.,p.x);
  vec3 ground=mix(vec3(.13,.16,.105),vec3(.09,.11,.075),n);
  ground*=.86+fine*.18;
  float roads=1.-smoothstep(8.,12.,abs(p.y-250.));
  roads=max(roads,(1.-smoothstep(8.,12.,abs(p.x-900.)))*step(-2000.,p.y)*step(p.y,6000.));
  ground=mix(ground,vec3(.15,.16,.165),roads*.75);
  vec3 ocean=mix(vec3(.018,.04,.065),vec3(.055,.085,.11),sin(p.y*.002)*.5+.5);
  float spec=pow(max(0.,dot(normalize(vec3(-.6,.1,-.4)),uSun)),6.);
  ocean+=vec3(.23,.13,.065)*spec;
  vec3 c=mix(ground,ocean,water)*(.30+.55*max(dot(normalize(vNormal),uSun),0.));
  gl_FragColor=vec4(c,1.);
  #include <fog_fragment>
}`;
export const cinematicShader={
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uAberration:{value:0},uFlare:{value:0},uFlarePosition:{value:{x:.5,y:.5}}},
  vertexShader:/*glsl*/`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:/*glsl*/`
  uniform sampler2D tDiffuse;uniform float uTime;uniform float uAberration;uniform float uFlare;uniform vec2 uFlarePosition;varying vec2 vUv;
  void main(){
    vec2 delta=(vUv-.5)*uAberration;
    vec3 c=vec3(texture2D(tDiffuse,vUv+delta).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-delta).b);
    vec2 f=vUv-uFlarePosition;float streak=exp(-abs(f.y)*250.)*exp(-abs(f.x)*6.);
    c+=vec3(.18,.12,.06)*streak*uFlare;
    float vignette=1.-smoothstep(.30,.80,length((vUv-.5)*vec2(1.,.8)));
    c*=mix(.73,1.,vignette);
    float grain=fract(sin(dot(vUv+fract(uTime*.03),vec2(12.9898,78.233)))*43758.5453);
    c+=(grain-.5)*.006;
    gl_FragColor=vec4(c,1.);
  }`
};
