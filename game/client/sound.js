const KEY='truyen-net.sound.v1';
const ACTIVE=['writing','drawing','guessing'];
export function transitionSounds(previous,next) {
  if(!previous||previous.roomCode!==next.roomCode)return [];
  const effects=[];
  if(next.phase==='lobby'&&previous.phase==='lobby'&&next.players.some(p=>!previous.players.some(old=>old.id===p.id)))effects.push('join');
  if(ACTIVE.includes(next.phase)&&(next.gameId!==previous.gameId||next.turnId!==previous.turnId))effects.push('round');
  if(next.phase==='reveal'&&previous.phase==='reveal'&&next.gameId===previous.gameId&&next.result.revealCount>previous.result.revealCount)
    effects.push(next.result.finished?'finish':'reveal');
  return effects;
}
export class SoundEffects {
  constructor({storage,createContext,visible=()=>true}={}) {
    this.storage=storage;this.createContext=createContext;this.visible=visible;
    this.enabled=true;this.volume=.35;this.context=null;this.master=null;this.nextAt=0;this.lastTick='';
    try {const saved=JSON.parse(storage?.getItem(KEY)??'null');
      if(typeof saved?.enabled==='boolean')this.enabled=saved.enabled;
      if(typeof saved?.volume==='number'&&Number.isFinite(saved.volume))this.volume=Math.max(0,Math.min(1,saved.volume));
    }catch{}
  }
  save(){try{this.storage?.setItem(KEY,JSON.stringify({enabled:this.enabled,volume:this.volume}));}catch{}}
  setEnabled(value){this.enabled=Boolean(value);this.applyVolume();this.save();}
  setVolume(value){if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));this.applyVolume();this.save();}
  applyVolume(){if(this.master)this.master.gain.setValueAtTime(this.enabled?this.volume:0,this.context.currentTime);}
  async unlock(){
    if(!this.enabled||!this.volume)return;
    try {
      if(!this.context){this.context=this.createContext?.();if(!this.context)return;this.master=this.context.createGain();this.master.connect(this.context.destination);this.applyVolume();}
      if(this.context.state==='suspended')await this.context.resume();
    }catch{this.context=null;this.master=null;}
  }
  play(kind){
    const ctx=this.context;
    if(!this.enabled||!this.volume||!this.visible()||!ctx||ctx.state!=='running'||!this.master)return false;
    const melodies={join:[[660,0,.07],[880,.07,.10]],round:[[523,0,.12],[659,.12,.12],[784,.24,.18]],submit:[[880,0,.08],[1175,.08,.13]],tick:[[680,0,.045]],finish:[[523,0,.11],[659,.12,.11],[784,.24,.11],[1047,.36,.28]],reveal:[[900,0,.08],[420,.05,.12]]};
    const notes=melodies[kind];if(!notes)return false;
    const start=Math.max(ctx.currentTime+.015,this.nextAt);
    // Short sounds only: never build up a backlog after reconnecting.
    if(start>ctx.currentTime+.6)return false;
    for(const [hz,offset,duration] of notes){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=start+offset;
      oscillator.type=kind==='reveal'?'triangle':'sine';oscillator.frequency.setValueAtTime(hz,at);
      if(kind==='reveal')oscillator.frequency.exponentialRampToValueAtTime(hz*.4,at+duration);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.15,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(at);oscillator.stop(at+duration+.02);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
    this.nextAt=start+Math.max(...notes.map(([,offset,duration])=>offset+duration))+.03;
    return true;
  }
  countdown(snapshot,remaining){
    if(!snapshot?.task||snapshot.submitted||!ACTIVE.includes(snapshot.phase)||remaining<1||remaining>5)return;
    const key=`${snapshot.gameId}:${snapshot.turnId}:${remaining}`;
    if(this.lastTick===key)return;this.lastTick=key;this.play('tick');
  }
}
export function mountSoundControls(sound,root){
  const toggle=root.querySelector('#sound-toggle'),slider=root.querySelector('#sound-volume'),output=root.querySelector('#sound-value');
  function refresh(){toggle.textContent=sound.enabled?'♫ Âm thanh bật':'♫ Âm thanh tắt';toggle.setAttribute('aria-pressed',String(sound.enabled));slider.value=String(Math.round(sound.volume*100));output.value=slider.value+'%';}
  toggle.addEventListener('click',async()=>{sound.setEnabled(!sound.enabled);refresh();if(sound.enabled){await sound.unlock();sound.play('join');}});
  slider.addEventListener('input',()=>{sound.setVolume(Number(slider.value)/100);refresh();});
  slider.addEventListener('change',async()=>{await sound.unlock();sound.play('submit');});
  const activate=()=>{sound.unlock();};
  root.addEventListener('pointerdown',activate,{capture:true});root.addEventListener('keydown',activate,{capture:true});
  refresh();
}
