// Talks to the engine worker with a 5-second limit per job. If the worker is
// stuck it is replaced; if module workers aren't supported the engine is
// loaded on the main thread instead.

let worker = null;
let seq = 0;
const jobs = new Map();
let fallback = null;

function makeWorker() {
  try {
    const w = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const job = jobs.get(e.data.id);
      if (!job) return;
      clearTimeout(job.timer);
      jobs.delete(e.data.id);
      job.resolve(e.data.result);
    };
    w.onerror = () => { useFallback(); };
    return w;
  } catch {
    return null;
  }
}
function useFallback() {
  if (worker) { try { worker.terminate(); } catch { /* ignore */ } }
  worker = null;
  fallback = fallback || import('./engine.js');
  // re-run anything waiting
  for (const [id, job] of jobs) {
    clearTimeout(job.timer);
    jobs.delete(id);
    fallback.then((m) => job.resolve(job.kind === 'preview' ? m.preview(job.input) : m.run(job.input, job.settings)));
  }
}

export function ask(kind, input, settings = {}, timeoutMs = 5000) {
  if (!worker && !fallback) worker = makeWorker();
  if (!worker) {
    fallback = fallback || import('./engine.js');
    return fallback.then((m) => (kind === 'preview' ? m.preview(input) : m.run(input, settings)));
  }
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      jobs.delete(id);
      // stuck: restart the worker so the next question gets a clean one
      try { worker.terminate(); } catch { /* ignore */ }
      worker = makeWorker();
      for (const [, job] of jobs) { clearTimeout(job.timer); job.resolve({ ok: false, error: { code: 'timeout', info: {} } }); }
      jobs.clear();
      resolve({ ok: false, error: { code: 'timeout', info: {} } });
    }, timeoutMs);
    jobs.set(id, { resolve, timer, kind, input, settings });
    worker.postMessage({ id, kind, input, settings });
  });
}

export const solve = (input, settings) => ask('run', input, settings);
export const preview = (input) => ask('preview', input, {}, 1500);
