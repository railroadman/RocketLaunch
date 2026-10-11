import { LANGS, getLang, setLang, onLangChange, t, type LangCode } from './index';

// Inline SVG flags: emoji flags do not render on Windows, so every flag is drawn here.
const flags:Record<LangCode,string>={
  ru:'<svg viewBox="0 0 30 20"><rect width="30" height="7" fill="#fff"/><rect y="7" width="30" height="6" fill="#0039a6"/><rect y="13" width="30" height="7" fill="#d52b1e"/></svg>',
  en:'<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.5"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.5"/></svg>',
  uk:'<svg viewBox="0 0 30 20"><rect width="30" height="10" fill="#005bbb"/><rect y="10" width="30" height="10" fill="#ffd500"/></svg>',
  de:'<svg viewBox="0 0 30 20"><rect width="30" height="7" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#d00"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>',
  fr:'<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ed2939"/></svg>',
  es:'<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/></svg>',
};

// Dropdown in the header: flag + code button, menu of languages with flag and native name.
export function mountLanguagePicker(host:HTMLElement){
  host.classList.add('lang-picker');
  host.innerHTML=`<button type="button" class="lang-button" aria-haspopup="menu" aria-expanded="false"></button><div class="lang-menu" role="menu" hidden>${LANGS.map(l=>`<button type="button" role="menuitemradio" data-lang="${l.code}"><span class="flag">${flags[l.code]}</span><span>${l.name}</span></button>`).join('')}</div>`;
  const button=host.querySelector<HTMLButtonElement>('.lang-button')!;
  const menu=host.querySelector<HTMLElement>('.lang-menu')!;
  const items=Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-lang]'));

  const render=()=>{
    const code=getLang();
    button.setAttribute('aria-label',t('header.lang'));
    button.innerHTML=`<span class="flag">${flags[code]}</span><span class="lang-code">${code.toUpperCase()}</span>`;
    items.forEach(item=>{item.setAttribute('aria-checked',String(item.dataset.lang===code));item.tabIndex=item.dataset.lang===code?0:-1;});
  };
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};

  const open=()=>{menu.hidden=false;button.setAttribute('aria-expanded','true');items.find(item=>item.dataset.lang===getLang())!.focus();};
  button.onclick=()=>{if(menu.hidden)open();else close();};
  button.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}};
  menu.onkeydown=e=>{
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    const target=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(index+1)%items.length:e.key==='ArrowUp'?(index-1+items.length)%items.length:-1;
    if(target>=0){e.preventDefault();items.forEach((item,i)=>item.tabIndex=i===target?0:-1);items[target].focus();}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();button.focus();}
    if(e.key==='Tab')close();
  };
  items.forEach(item=>item.onclick=()=>{setLang(item.dataset.lang as LangCode);close();button.focus();});
  document.addEventListener('click',e=>{if(!host.contains(e.target as Node))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();button.focus();}});
  onLangChange(render);
  host.closest('dialog')?.addEventListener('close',close);
  host.addEventListener('focusout',e=>{if(!host.contains(e.relatedTarget as Node|null))close();});
  render();
}
