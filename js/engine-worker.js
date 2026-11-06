// Runs the maths engine off the main thread so typing never freezes.
import { run, preview } from './engine.js';

self.onmessage = (e) => {
  const { id, kind, input, settings } = e.data;
  let result;
  try {
    result = kind === 'preview' ? preview(input) : run(input, settings);
  } catch (err) {
    result = { ok: false, error: { code: 'internal', info: { message: String(err && err.message) } } };
  }
  self.postMessage({ id, result });
};
