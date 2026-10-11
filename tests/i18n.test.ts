import { afterEach, describe, expect, it, vi } from 'vitest';
import ru from '../src/i18n/locales/ru.json';
import en from '../src/i18n/locales/en.json';
import uk from '../src/i18n/locales/uk.json';
import de from '../src/i18n/locales/de.json';
import fr from '../src/i18n/locales/fr.json';
import es from '../src/i18n/locales/es.json';

const source:Record<string,string>=ru;
const locales:Record<string,Record<string,string>>={en,uk,de,fr,es};
const placeholders=(text:string)=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');

describe('i18n locales',()=>{
  for(const [code,dict] of Object.entries(locales)){
    it(`${code} has exactly the keys of ru`,()=>{
      expect(Object.keys(dict).sort()).toEqual(Object.keys(source).sort());
    });
    it(`${code} keeps the placeholders of ru`,()=>{
      for(const key of Object.keys(source)) expect(placeholders(dict[key]),key).toBe(placeholders(source[key]));
    });
    it(`${code} has no empty values`,()=>{
      for(const [key,value] of Object.entries(dict)) expect(value.trim(),key).not.toBe('');
    });
  }
});

describe('language preference and switching',()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.doUnmock('../src/i18n/locales/en.json');});
  async function setup(saved:string|null=null,languages=['en-US'],blocked=false){
    vi.resetModules();
    const storage={getItem:vi.fn(()=>{if(blocked)throw new Error('Blocked');return saved;}),setItem:vi.fn(()=>{if(blocked)throw new Error('Blocked');})};
    const doc={documentElement:{lang:''}};
    vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{languages,language:languages[0]||'ja-JP'});vi.stubGlobal('document',doc);
    return {api:await import('../src/i18n/index'),storage,doc};
  }
  it('saved choice wins over browser preferences',async()=>{
    const {api,doc}=await setup('fr',['de-DE']);expect(api.getLang()).toBe('fr');expect(doc.documentElement.lang).toBe('fr');
  });
  it('uses the first supported browser language, including regional variants',async()=>{
    const {api}=await setup('invalid',['ja-JP','UK-ua','en-US']);expect(api.getLang()).toBe('uk');expect(api.locale()).toBe('uk-UA');
  });
  it('falls back to Russian when no browser language is supported',async()=>{
    expect((await setup(null,['ja-JP','ar'])).api.getLang()).toBe('ru');
  });
  it('persists an explicit selection of the current language without notifying',async()=>{
    const {api,storage}=await setup();const listener=vi.fn();api.onLangChange(listener);api.setLang('en');
    expect(storage.setItem).toHaveBeenCalledWith('flight.lang','en');expect(listener).not.toHaveBeenCalled();
  });
  it('updates document language and notifies subscribers once; supports unsubscribe',async()=>{
    const {api,doc}=await setup();const listener=vi.fn(),unsubscribe=api.onLangChange(listener);api.setLang('de');
    expect(doc.documentElement.lang).toBe('de');expect(listener).toHaveBeenCalledTimes(1);unsubscribe();api.setLang('es');expect(listener).toHaveBeenCalledTimes(1);
  });
  it('works when browser storage is blocked',async()=>{
    const {api,doc}=await setup(null,['fr-CA'],true);expect(api.getLang()).toBe('fr');expect(()=>api.setLang('uk')).not.toThrow();expect(doc.documentElement.lang).toBe('uk');
  });
  it('interpolates values and preserves unknown keys',async()=>{
    const {api}=await setup();expect(api.t('engine.onMany',{n:9})).toBe(en['engine.onMany'].replace('{n}','9'));expect(api.t('unknown.key')).toBe('unknown.key');
  });
  it('falls back to the source dictionary for a missing translation',async()=>{
    vi.doMock('../src/i18n/locales/en.json',()=>({default:{...en,'hero.subtitle':undefined}}));
    const {api}=await setup();expect(api.t('hero.subtitle')).toBe(ru['hero.subtitle']);
  });
});
