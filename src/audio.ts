import type { MissionFrame, VehicleId } from './sim/types';
import { clamp } from './sim/math';

export class MissionAudio {
  enabled=true;
  private context:AudioContext|null=null;
  private gain:GainNode|null=null;
  private filter:BiquadFilterNode|null=null;
  private last=-31;
  private countdown=-1;
  async unlock(){
    if(!this.context){
      this.context=new AudioContext();
      const buffer=this.context.createBuffer(1,this.context.sampleRate*4,this.context.sampleRate),samples=buffer.getChannelData(0);
      let brown=0;for(let i=0;i<samples.length;i++){brown=(brown+(Math.random()*2-1)*.04)/1.025;samples[i]=brown*3;}
      const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;
      this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=220;
      this.gain=this.context.createGain();this.gain.gain.value=0;
      const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-15;compressor.ratio.value=5;
      source.connect(this.filter).connect(this.gain).connect(compressor).connect(this.context.destination);source.start();
    }
    await this.context.resume();
  }
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled){speechSynthesis.cancel();this.gain?.gain.setTargetAtTime(0,this.context!.currentTime,.08);}}
  private speak(text:string){
    if(!this.enabled||!('speechSynthesis' in window))return;
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='ru-RU';utterance.rate=1.02;utterance.volume=.65;
    const russian=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ru'));if(russian)utterance.voice=russian;
    speechSynthesis.speak(utterance);
  }
  private tone(frequency:number,duration:number){
    if(!this.context||!this.enabled)return;
    const osc=this.context.createOscillator(),gain=this.context.createGain(),now=this.context.currentTime;
    osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain).connect(this.context.destination);osc.start();osc.stop(now+duration);
  }
  update(frame:MissionFrame,vehicle:VehicleId,playing:boolean){
    const t=frame.time,s=frame[vehicle],scrub=Math.abs(t-this.last)>2;
    if(!playing||scrub)speechSynthesis.cancel();
    if(playing&&!scrub&&t<0&&t>=-10){
      const second=Math.ceil(-t);
      if(second!==this.countdown&&second>0){this.countdown=second;this.speak(['','Один','Два','Три','Четыре','Пять','Шесть','Семь','Восемь','Девять','Десять'][second]);this.tone(660,.07);}
    }
    if(playing&&!scrub&&this.last<0&&t>=0)this.speak('Старт');
    if(this.context&&this.gain&&this.filter){
      const maxThrust=vehicle==='upper'?981000:s.engines===1?914111:s.engines===3?2742333:8227000;
      let power=s.thrust>0?clamp(s.thrust/maxThrust):0;
      if(vehicle==='stack'&&t>=-3&&t<0)power=clamp((t+3)/3)*.7;
      const atmosphere=Math.exp(-s.altitude/26000);
      this.gain.gain.setTargetAtTime(this.enabled&&playing?power*atmosphere*.48:0,this.context.currentTime,.12);
      this.filter.frequency.setTargetAtTime(100+power*450,this.context.currentTime,.1);
    }
    if(t<-10)this.countdown=-1;
    this.last=t;
  }
  dispose(){speechSynthesis.cancel();void this.context?.close();}
}
