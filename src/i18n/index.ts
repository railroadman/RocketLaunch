import ru from './locales/ru.json';
import en from './locales/en.json';
import uk from './locales/uk.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

// `locale` formats UI numbers. Speech metadata is reserved; mission audio stays Russian.
export const LANGS=[
  {code:'ru',name:'Русский',locale:'ru-RU',speech:'ru-RU'},
  {code:'en',name:'English',locale:'en-US',speech:'en-US'},
  {code:'uk',name:'Українська',locale:'uk-UA',speech:'uk-UA'},
  {code:'de',name:'Deutsch',locale:'de-DE',speech:'de-DE'},
  {code:'fr',name:'Français',locale:'fr-FR',speech:'fr-FR'},
  {code:'es',name:'Español',locale:'es-ES',speech:'es-ES'},
] as const;
export type LangCode=typeof LANGS[number]['code'];

type Dict=Record<string,string>;
const dictionaries:Record<LangCode,Dict>={ru,en,uk,de,fr,es};
const STORAGE_KEY='flight.lang';
const listeners=new Set<()=>void>();

const isLang=(value:unknown):value is LangCode=>LANGS.some(l=>l.code===value);
function detect():LangCode{
  try{const saved=localStorage.getItem(STORAGE_KEY);if(isLang(saved))return saved;}catch{/* storage blocked: fall through */}
  for(const language of navigator.languages?.length?navigator.languages:[navigator.language]){
    const browser=language.toLowerCase().split(/[-_]/)[0];
    if(isLang(browser))return browser;
  }
  return 'ru';
}
let current:LangCode=detect();
document.documentElement.lang=current;

const meta=()=>LANGS.find(l=>l.code===current)!;
export const getLang=()=>current;
export const locale=()=>meta().locale;
export const speechLang=()=>meta().speech;
export const has=(key:string)=>key in dictionaries[current]||key in ru;

// Missing keys fall back to Russian (source dictionary), then to the key itself.
export function t(key:string,params?:Record<string,string|number>){
  let text=(dictionaries[current] as Dict)[key]??(ru as Dict)[key]??key;
  if(params)for(const [name,value] of Object.entries(params))text=text.replaceAll(`{${name}}`,String(value));
  return text;
}

export function setLang(code:LangCode){
  if(!isLang(code))return;
  try{localStorage.setItem(STORAGE_KEY,code);}catch{/* storage blocked: language is kept for this page only */}
  if(code===current)return;
  current=code;
  document.documentElement.lang=code;
  listeners.forEach(fn=>fn());
}
export function onLangChange(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}

// Translate only marked leaves, keeping controls, canvases and their state intact.
export function translateDOM(root:ParentNode=document){
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n!);});
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach(el=>{el.innerHTML=t(el.dataset.i18nHtml!);});
  for(const attribute of ['aria-label','title']){
    root.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`).forEach(el=>{
      el.setAttribute(attribute,t(el.getAttribute(`data-i18n-${attribute}`)!));
    });
  }
  document.title=t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content',t('meta.description'));
}
