// Amy: Vercel Function that keeps the Anthropic API key on the server and
// streams Claude's reply straight back to the browser (section 12).
//
// Environment variables (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY          required
//   ALLOWED_ORIGINS            required, comma list, e.g.
//                              https://calculator.nexlyr.solutions,https://nexlyr-calculator.vercel.app
//   SUPABASE_URL               optional, enables shared rate limiting (recommended)
//   SUPABASE_SERVICE_ROLE_KEY  optional, with SUPABASE_URL
//   RATE_LIMIT_SALT            optional, any random string (used to hash IPs)
//
// Uses the web-standard fetch handler Vercel recommends for projects
// without a framework. Max duration is set in vercel.json.

const MODELS = { fast: 'claude-haiku-5-5', deep: 'claude-sonnet-5-5' };
const LIMITS = {
  messages: 12,              // history sent per request
  textChars: 4000,           // per text block
  imageBytes: 1_600_000,     // base64 length of the one allowed photo
  perDeviceHour: 30,         // spec: 30 messages per hour per device
  perIpHour: 150,            // looser backstop: many students share one mobile IP (CGNAT)
  photosPerDeviceDay: 8,     // photos cost far more than text
};
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SYSTEM = `You are Amy, the maths and science tutor inside Nexlyr Calculator, a free calculator made by Nexlyr Solutions.

How you help:
- Many users are O Level, IGCSE and A Level students in Pakistan. Explain the way a good teacher would: show the working step by step, name the rule or method you use, and finish with the final answer on its own line.
- Check your own answer before giving it (substitute back, or estimate). If you are not sure, say so instead of guessing.
- Write maths in LaTeX between $ … $ for inline and $$ … $$ for display, so the app can render it.
- Keep answers focused. Use short paragraphs and numbered steps. No filler.
- If the student sends a photo, first restate the question you see, then solve it. If part of the photo is unreadable, ask about that part.
- Reply in the language the student writes in: English, Urdu or Roman Urdu.
- When the app sends calculator context (an expression and its result), use it, and say if the result looks wrong.
- Help students understand. If someone asks you to just give answers for a test that is happening now, encourage them to learn the method instead.
- You can help with general study questions too, but you are mainly a maths and science tutor.

If asked who made you or the calculator: Nexlyr Calculator was built by Hashir at Nexlyr Solutions, a digital agency for websites, brand identity, video editing and digital marketing. Website: nexlyr.solutions.

Do not claim to be human. Do not invent facts, statistics or quotes.`;

export default {
  async fetch(req) {
    const origin = req.headers.get('origin') || '';
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};

    if (req.method === 'OPTIONS') {
      if (!cors['access-control-allow-origin']) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, x-nexlyr-device', 'access-control-max-age': '86400' } });
    }
    if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);
    if (!allowed.includes(origin)) return json({ error: 'forbidden' }, 403, cors);
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'unavailable' }, 503, cors);

    const len = Number(req.headers.get('content-length') || 0);
    if (len > 2_500_000) return json({ error: 'too_large' }, 413, cors);
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages)) return json({ error: 'bad_request' }, 400, cors);

    let messages;
    try { messages = clean(body.messages); } catch (e) { return json({ error: e.message || 'bad_request' }, 400, cors); }
    if (!messages.length) return json({ error: 'bad_request' }, 400, cors);
    const hasPhoto = messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));

    // rate limits: per device (header), per hashed IP (backstop), photos per day
    const device = String(req.headers.get('x-nexlyr-device') || '').slice(0, 64).replace(/[^\w-]/g, '') || 'none';
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const ipHash = await sha256(`${process.env.RATE_LIMIT_SALT || 'nexlyr'}:${ip}`);
    const hour = windowStart(3600), day = windowStart(86400);
    const checks = [
      hit(`d:${device}:${ipHash.slice(0, 8)}`, hour, LIMITS.perDeviceHour),
      hit(`ip:${ipHash}`, hour, LIMITS.perIpHour),
    ];
    if (hasPhoto) checks.push(hit(`p:${device}:${ipHash.slice(0, 8)}`, day, LIMITS.photosPerDeviceDay));
    const results = await Promise.all(checks);
    if (results.some((ok) => !ok)) return json({ error: 'rate_limited' }, 429, cors);

    const deep = body.mode === 'deep';
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: deep ? MODELS.deep : MODELS.fast,
        max_tokens: deep ? 2048 : 1024,
        system: SYSTEM + contextBlock(body.context),
        messages,
        stream: true,
      }),
    }).catch(() => null);

    if (!upstream || !upstream.ok || !upstream.body) {
      const status = upstream && (upstream.status === 429 || upstream.status === 529) ? 503 : 502;
      return json({ error: 'unavailable' }, status, cors);
    }
    // Pass the server-sent events straight through.
    return new Response(upstream.body, {
      status: 200,
      headers: { ...cors, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  },
};

function json(obj, status, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// Keep the last 12 messages, roles alternating and starting with the user,
// text trimmed to 4,000 characters and at most one photo (in the last turn).
function clean(list) {
  const out = [];
  for (const m of list.slice(-LIMITS.messages)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const blocks = [];
    if (typeof m.content === 'string') {
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content.slice(0, LIMITS.textChars) });
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) blocks.push({ type: 'text', text: b.text.slice(0, LIMITS.textChars) });
        if (b && b.type === 'image' && b.source && b.source.type === 'base64' && m.role === 'user') {
          const mt = String(b.source.media_type || '');
          const data = String(b.source.data || '');
          if (!IMAGE_TYPES.has(mt)) throw new Error('bad_image');
          if (data.length > LIMITS.imageBytes || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('bad_image');
          blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data } });
        }
      }
    }
    if (!blocks.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  // only the latest user turn may carry a photo
  let photos = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    out[i].content = out[i].content.filter((b) => {
      if (b.type !== 'image') return true;
      photos++;
      return i === out.length - 1 && photos === 1;
    });
  }
  return out.filter((m) => m.content.length);
}

function contextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const pick = (k) => (typeof ctx[k] === 'string' && ctx[k].trim() ? ctx[k].slice(0, 500) : '');
  const lines = [['Screen', pick('screen')], ['Expression', pick('expression')], ['Result shown by the app', pick('result')], ['Task', pick('task')]].filter(([, v]) => v);
  if (!lines.length) return '';
  return `\n\nCalculator context sent by the app:\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}`;
}

const windowStart = (seconds) => new Date(Math.floor(Date.now() / 1000 / seconds) * seconds * 1000).toISOString();

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Counts live in Supabase (table amy_usage, function amy_hit). Without
// Supabase configured, a per-instance memory map is used as a fallback.
const memory = new Map();
async function hit(key, window, limit) {
  const url = process.env.SUPABASE_URL, srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && srk) {
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/amy_hit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: srk, authorization: `Bearer ${srk}` },
        body: JSON.stringify({ p_key: key, p_window: window }),
      });
      if (r.ok) {
        const count = await r.json();
        return Number(count) <= limit;
      }
    } catch { /* fall back to memory */ }
  }
  const k = `${key}|${window}`;
  const n = (memory.get(k) || 0) + 1;
  memory.set(k, n);
  if (memory.size > 5000) memory.clear();
  return n <= limit;
}
