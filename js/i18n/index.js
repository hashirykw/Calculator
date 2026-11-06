// Translation lookup. English strings live in en.js; Urdu in ur.js (loaded
// only when chosen). Missing Urdu keys fall back to English.

import EN from './en.js';

let dict = EN;
let lang = 'en';

export function t(key, params = {}) {
  let s = dict[key] ?? EN[key];
  if (s === undefined) return key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
export const has = (key) => key in EN;
export const currentLang = () => lang;

export async function setLang(l) {
  if (l === 'ur') {
    const mod = await import('./ur.js');
    dict = { ...EN, ...mod.default };
  } else {
    dict = EN;
  }
  lang = l;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'ur' ? 'rtl' : 'ltr';
  // Nastaliq is only fetched when Urdu is chosen (the @font-face is lazy by use)
}
