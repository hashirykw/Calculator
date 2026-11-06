// Amy chat client (section 12). One component, shown in the desktop side
// panel or as its own screen on phones. Streams replies from /api/amy,
// renders Markdown -> DOMPurify -> KaTeX, never inserts raw model text as HTML.

import { h, icon, iconButton, clear, copyText, toast, seg } from './ui.js';
import { t } from './i18n/index.js';
import { bus, app } from './bus.js';
import { store } from './store.js';
import { updateSettings } from './prefs.js';
import { loadKatex } from './mathrender.js';
import { CONFIG } from './config.js';

// When the AI server can't answer (no API key, outage, offline) Amy switches
// to her built-in tutor for a while instead of showing an error.
const LOCAL_KEY = 'nxc:amyLocalUntil';
const localUntil = () => { try { return Number(sessionStorage.getItem(LOCAL_KEY)) || 0; } catch { return 0; } };
const goLocal = (ms = 10 * 60 * 1000) => { try { sessionStorage.setItem(LOCAL_KEY, String(Date.now() + ms)); } catch { /* ignore */ } };
const useLocal = () => !navigator.onLine || Date.now() < localUntil();

let libs = null;
async function loadLibs() {
  if (!libs) {
    libs = Promise.all([import('../vendor/marked.min.mjs'), import('../vendor/purify.min.mjs'), loadKatex()])
      .then(([m, p, k]) => ({ marked: m.marked || m.default || m, purify: p.default || p, katex: k }));
  }
  return libs;
}

function deviceId() {
  let id = store.get('device');
  if (!id || typeof id !== 'string') {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '');
    store.set('device', id);
  }
  return id;
}

export function createAmy() {
  let messages = [];        // {role, text, image?:{data, type, url}, error?, stopped?}
  let attachment = null;    // {data, type, url}
  let controller = null;
  let pendingContext = null;

  if (app.settings.amyHistory) {
    const saved = store.get('amy', []);
    if (Array.isArray(saved)) messages = saved.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').map((m) => ({ role: m.role, text: m.text }));
  }

  // ---------- layout ----------
  const modeSeg = seg([['fast', t('amy.fast')], ['deep', t('amy.deep')]], app.settings.amyMode, (v) => updateSettings({ amyMode: v }), t('amy.mode'));
  const head = h('div', { class: 'amy-head' },
    h('h2', {}, h('span', { class: 'amy-avatar', 'aria-hidden': 'true', text: 'A' }), h('span', {}, t('amy.name'), h('div', { class: 'tiny muted', text: t('amy.subtitle') }))),
    modeSeg,
    iconButton('edit', t('amy.newChat'), newChat),
    iconButton('panelclose', t('amy.hide'), () => bus.emit('amy:close')));
  const banner = h('div', { class: 'amy-banner', hidden: true });
  const log = h('div', { class: 'amy-log', role: 'log', 'aria-live': 'polite', 'aria-label': t('amy.name') });
  const ta = h('textarea', { rows: '1', placeholder: t('amy.placeholder'), 'aria-label': t('amy.placeholder'), enterkeyhint: 'send' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const attachRow = h('div', { class: 'attach', hidden: true });
  const sendBtn = h('button', { class: 'btn primary', type: 'button', 'aria-label': t('amy.send') }, icon('send', 'sm'));
  const micBtn = iconButton('mic', t('amy.mic'), voice);
  const photoBtn = iconButton('camera', t('amy.photo'), () => fileIn.click());
  const privacy = h('div', { class: 'privacy' }, t('amy.privacy'), ' ',
    h('button', { class: 'btn ghost sm', type: 'button', style: { height: 'auto', padding: '0 2px', textDecoration: 'underline' }, on: { click: () => import('./about.js').then((m) => m.openAbout('privacy')) } }, t('amy.privacyLink')));
  const compose = h('div', { class: 'amy-compose' }, attachRow, h('div', { class: 'row' }, photoBtn, ta, micBtn, sendBtn), privacy, fileIn);
  const root = h('div', { class: 'amy' }, head, banner, log, compose);

  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', () => (controller ? stop() : send()));
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) attachPhoto(fileIn.files[0]); fileIn.value = ''; });
  bus.on('online', renderBanner);
  bus.on('settings', () => { renderBanner(); modeSeg.setValue(app.settings.amyMode); });
  bus.on('route', () => { if (!messages.length) renderLog(); });

  function autosize() { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; }

  function renderBanner() {
    banner.hidden = true;
    clear(banner);
    if (!navigator.onLine) { banner.hidden = false; banner.append(icon('offline', 'sm'), t('amy.offlineLocal')); }
    else if (!app.settings.amy) { banner.hidden = false; banner.append(t('amy.disabled')); }
    sendBtn.disabled = false;
  }

  // ---------- messages ----------
  function suggestions() {
    const screen = (app.route && app.route.screen) || 'calc';
    const key = ['calc', 'solve', 'graph', 'tools'].includes(screen) ? screen : 'calc';
    return [1, 2, 3].map((i) => t(`amy.s.${key}${i}`));
  }

  function renderLog() {
    clear(log);
    if (!messages.length) {
      log.append(h('div', { class: 'amy-empty' },
        h('p', { text: t('amy.greeting') }),
        h('div', { class: 'amy-suggest' }, suggestions().map((s) => h('button', { class: 'chip', type: 'button', on: { click: () => { ta.value = s; send(); } } }, s)))));
      return;
    }
    messages.forEach((m, i) => log.append(bubble(m, i)));
    log.scrollTop = log.scrollHeight;
  }

  function bubble(m, i) {
    if (m.role === 'user') {
      return h('div', { class: 'msg user' }, m.image ? h('img', { class: 'thumb', src: m.image.url, alt: t('amy.photoAdded') }) : null, h('div', { text: m.text }));
    }
    const body = h('div', { class: 'md' });
    const el = h('div', { class: 'msg amy' }, h('div', { class: 'ai-label', text: m.local ? t('amy.localLabel') : t('amy.aiLabel') }), body);
    if (m.pending && !m.text) body.append(h('span', { class: 'typing', role: 'status', 'aria-label': t('amy.typing') }, h('i'), h('i'), h('i')));
    else renderMarkdown(body, m.text);
    if (m.error) el.append(h('p', { class: 'help err', text: m.error }));
    if (m.stopped) el.append(h('p', { class: 'help', text: t('amy.stopped') }));
    if (!m.pending) {
      const actions = h('div', { class: 'msg-actions' },
        iconButton('copy', t('amy.copy'), () => copyText(m.text)),
        iconButton('brackets', t('amy.copyLatex'), () => copyText((m.text.match(/\$\$?([^$]+)\$\$?/g) || [m.text]).join('\n'))));
      const expr = firstExpression(m.text);
      if (expr) actions.append(iconButton('solve', t('amy.openSolve'), () => { app.pending = { ...(app.pending || {}), solve: expr }; location.hash = '#/solve'; }));
      if (i === messages.length - 1) actions.append(iconButton('retry', t('amy.retry'), retry));
      el.append(actions);
    }
    return el;
  }

  // Markdown with maths: pull out $...$ first so Markdown can't mangle it,
  // sanitise the HTML, then render the maths into placeholders.
  let mdQueue = Promise.resolve();
  function renderMarkdown(target, text) {
    const parts = [];
    const masked = text
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => { parts.push({ tex: m, display: true }); return `@@MATH${parts.length - 1}@@`; })
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => { parts.push({ tex: m, display: true }); return `@@MATH${parts.length - 1}@@`; })
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => { parts.push({ tex: m, display: false }); return `@@MATH${parts.length - 1}@@`; })
      .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre, m) => { parts.push({ tex: m, display: false }); return `${pre}@@MATH${parts.length - 1}@@`; });
    if (!libs || typeof libs.then === 'function') {
      target.textContent = text;
    }
    mdQueue = mdQueue.then(() => loadLibs()).then(({ marked, purify, katex }) => {
      const html = marked.parse(masked, { breaks: true, gfm: true, async: false });
      const clean = purify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'img', 'iframe', 'form', 'input'], FORBID_ATTR: ['style', 'onerror', 'onclick'] });
      const tmp = document.createElement('div');
      tmp.innerHTML = clean.replace(/@@MATH(\d+)@@/g, (_, n) => `<span data-math="${n}"></span>`);
      tmp.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
      tmp.querySelectorAll('[data-math]').forEach((span) => {
        const p = parts[Number(span.dataset.math)];
        if (!p) return;
        try { katex.render(p.tex, span, { displayMode: p.display, throwOnError: false, strict: 'ignore', trust: false }); }
        catch { span.textContent = p.tex; }
      });
      target.replaceChildren(...tmp.childNodes);
    }).catch(() => { target.textContent = text; });
  }

  // An expression Amy wrote that Solve could take (first inline maths).
  function firstExpression(text) {
    const m = /\$([^$\n]{3,80})\$/.exec(text);
    if (!m) return null;
    let s = m[1].replace(/\\left|\\right/g, '').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)').replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
      .replace(/\\(sin|cos|tan|ln|log|pi)/g, '$1').replace(/[{}]/g, '').replace(/\\,|\\;|\\!/g, '').trim();
    if (/\\/.test(s) || !/[0-9a-z]/i.test(s)) return null;
    return s;
  }

  // ---------- sending ----------
  async function send() {
    const text = ta.value.trim();
    if ((!text && !attachment) || controller) return;
    messages.push({ role: 'user', text: text || t('amy.photoAdded'), image: attachment });
    ta.value = '';
    autosize();
    clearAttachment();
    await stream();
  }

  async function stream() {
    const reply = { role: 'assistant', text: '', pending: true };
    messages.push(reply);
    renderLog();
    controller = new AbortController();
    sendBtn.replaceChildren(icon('stop', 'sm'));
    sendBtn.setAttribute('aria-label', t('amy.stop'));
    const ctx = pendingContext || { screen: app.route && app.route.screen };
    pendingContext = null;
    const payload = {
      mode: app.settings.amyMode,
      context: ctx,
      messages: messages.filter((m) => !m.error && m !== reply && m.text).slice(-12).map((m) => {
        if (m.role === 'user' && m.image) {
          return { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m.image.type, data: m.image.data } }, { type: 'text', text: m.text }] };
        }
        return { role: m.role, content: m.text };
      }),
    };
    // only the newest photo is sent
    let seen = false;
    for (let i = payload.messages.length - 1; i >= 0; i--) {
      const c = payload.messages[i].content;
      if (Array.isArray(c)) { if (seen) payload.messages[i].content = c.filter((b) => b.type !== 'image'); seen = true; }
    }
    loadLibs();
    if (useLocal()) { await localReply(reply, ctx); return; }
    let frame = 0;
    const paint = () => {
      frame = 0;
      const last = log.lastElementChild;
      if (last) last.replaceWith(bubble(reply, messages.length - 1));
      log.scrollTop = log.scrollHeight;
    };
    try {
      const res = await fetch(CONFIG.amyEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nexlyr-device': deviceId() },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.status === 429) throw Object.assign(new Error(), { kind: 'rate' });
      if (!res.ok || !res.body) throw Object.assign(new Error(), { kind: 'unavailable' });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          let evt;
          try { evt = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
            reply.text += evt.delta.text;
            reply.pending = true;
            if (!frame) frame = requestAnimationFrame(paint);
          } else if (evt.type === 'error') {
            throw Object.assign(new Error(), { kind: 'unavailable' });
          }
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') reply.stopped = true;
      else if (e && e.kind === 'rate') reply.error = t('amy.rateLimit');
      else if (!reply.text) {
        // server has no key / is down / we're offline: answer on the device
        if (frame) cancelAnimationFrame(frame);
        goLocal(navigator.onLine ? 10 * 60 * 1000 : 60 * 1000);
        await localReply(reply, ctx);
        return;
      } else reply.error = t('amy.unavailable');
    }
    if (frame) cancelAnimationFrame(frame);
    reply.pending = false;
    controller = null;
    sendBtn.replaceChildren(icon('send', 'sm'));
    sendBtn.setAttribute('aria-label', t('amy.send'));
    if (!reply.text && reply.error) messages.splice(messages.indexOf(reply), 1, { ...reply, text: '' });
    renderLog();
    persist();
  }

  // Built-in tutor reply, revealed a few words at a time like a live answer.
  async function localReply(reply, ctx) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    let full = '';
    try {
      const mod = await import('./amy-local.js');
      full = await mod.answer({ text: lastUser && lastUser.image && lastUser.text === t('amy.photoAdded') ? '' : (lastUser ? lastUser.text : ''), context: ctx, hasPhoto: !!(lastUser && lastUser.image) });
    } catch { full = t('amy.error'); }
    reply.local = true;
    const words = full.split(/(\s+)/);
    let i = 0;
    const step = Math.max(2, Math.ceil(words.length / 60));
    await new Promise((resolve) => {
      const tick = () => {
        if (!controller) { reply.text = full; resolve(); return; }
        i = Math.min(words.length, i + step);
        reply.text = words.slice(0, i).join('');
        const last = log.lastElementChild;
        if (last) last.replaceWith(bubble(reply, messages.length - 1));
        log.scrollTop = log.scrollHeight;
        if (i >= words.length) resolve(); else setTimeout(tick, 28);
      };
      tick();
    });
    reply.text = full;
    reply.pending = false;
    controller = null;
    sendBtn.replaceChildren(icon('send', 'sm'));
    sendBtn.setAttribute('aria-label', t('amy.send'));
    renderLog();
    persist();
  }

  function stop() { if (controller) controller.abort(); }
  function retry() {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    messages.pop();
    stream();
  }
  function newChat() {
    stop();
    messages = [];
    persist();
    renderLog();
    ta.focus();
  }
  function persist() {
    if (!app.settings.amyHistory) { store.remove('amy'); return; }
    store.set('amy', messages.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, text: m.image ? `${m.text}` : m.text })).slice(-30));
  }

  // ---------- photos: resize on the device before sending ----------
  async function attachPhoto(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.85);
      attachment = { data: url.split(',')[1], type: 'image/jpeg', url };
      clear(attachRow);
      attachRow.append(h('img', { src: url, alt: t('amy.photoAdded') }), h('span', { text: t('amy.photoAdded') }), iconButton('close', t('amy.removePhoto'), clearAttachment));
      attachRow.hidden = false;
    } catch {
      toast(t('amy.error'));
    }
  }
  function clearAttachment() { attachment = null; attachRow.hidden = true; clear(attachRow); }

  // ---------- voice ----------
  let recog = null;
  function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast(t('solve.noSpeech')); return; }
    if (recog) { recog.stop(); return; }
    recog = new SR();
    recog.lang = app.settings.lang === 'ur' ? 'ur-PK' : 'en-GB';
    recog.interimResults = true;
    micBtn.setAttribute('aria-pressed', 'true');
    recog.onresult = (e) => { ta.value = [...e.results].map((r) => r[0].transcript).join(' '); autosize(); };
    recog.onend = () => { recog = null; micBtn.setAttribute('aria-pressed', 'false'); };
    recog.onerror = () => recog && recog.stop();
    recog.start();
  }

  renderBanner();
  renderLog();

  return {
    root,
    focus() { setTimeout(() => ta.focus({ preventScroll: true }), 80); },
    // ask({text, context}) or ask('text'): opens Amy with calculator context
    ask(p) {
      const req = typeof p === 'string' ? { text: p } : p || {};
      pendingContext = req.context ? { screen: app.route && app.route.screen, ...req.context } : null;
      if (req.context && req.context.expression) {
        ta.value = `${req.text || ''}\n${req.context.expression}${req.context.result ? ` = ${req.context.result}` : ''}`.trim();
      } else ta.value = req.text || '';
      autosize();
      send();
    },
  };
}
