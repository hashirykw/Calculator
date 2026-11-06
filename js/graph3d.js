// 3D surfaces z = f(x, y) in plain WebGL (loaded only when 3D is opened).
// Height-coloured mesh with lighting, optional wireframe, axes and base grid,
// orbit/zoom/pan, trace, adaptive resolution, render-on-demand, PNG export,
// and the full-screen Universe view with auto-rotate that stops on touch.

import { h, icon, iconButton, toast, shareOrCopy } from './ui.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';
import { scheduler, fitCanvas, cssVar } from './scheduler.js';
import { reducedMotion } from './prefs.js';
import { fmtNum } from './core/format.js';

const ID = 'graph3d';
const R = 5;   // half-width of the x/y domain

// ---------- tiny matrix helpers (column-major, like WebGL) ----------
const M4 = {
  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  lookAt(eye, at, up) {
    const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  },
  mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  },
  invert(m) {
    const inv = new Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    return inv.map((v) => v / (det || 1e-30));
  },
  apply(m, v) {
    const [x, y, z, w = 1] = v;
    return [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r] * w);
  },
};
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function hexRgb(s) {
  s = (s || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return [0, 0.76, 0.95];
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const VS = `attribute vec3 p; attribute vec3 n; attribute float k; uniform mat4 mvp; varying vec3 vn; varying float vk; varying vec3 vp;
void main(){ vn = n; vk = k; vp = p; gl_Position = mvp * vec4(p.x, p.z, -p.y, 1.0); }`;
const FS = `precision mediump float; varying vec3 vn; varying float vk; varying vec3 vp; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 light; uniform float alpha;
void main(){ vec3 base = vk < 0.5 ? mix(c0, c1, vk * 2.0) : mix(c1, c2, (vk - 0.5) * 2.0);
  vec3 nn = normalize(vn); float d = abs(dot(nn, normalize(light)));
  gl_FragColor = vec4(base * (0.35 + 0.75 * d), alpha); }`;
const LVS = `attribute vec3 p; uniform mat4 mvp; void main(){ gl_Position = mvp * vec4(p.x, p.z, -p.y, 1.0); }`;
const LFS = `precision mediump float; uniform vec4 col; void main(){ gl_FragColor = col; }`;

export function create(host, getSurfaces) {
  const canvas = h('canvas', { class: 'graph3d', tabindex: '0', role: 'img', 'aria-label': t('graph.kind.surface'), style: { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' } });
  const labels = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', font: '500 11px "Geist Mono", monospace', color: 'var(--text-2)' } });
  const tip = h('div', { class: 'trace-tip', hidden: true });
  let wire = false;
  const tools = h('div', { class: 'graph-tools' });
  const layer = h('div', { style: { position: 'absolute', inset: '0' }, hidden: true }, canvas, labels, tip, tools);
  host.append(layer);

  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false }) || canvas.getContext('experimental-webgl');
  if (!gl) {
    layer.append(h('div', { class: 'empty', text: t('graph.webgl') }));
    return { show() { layer.hidden = false; }, hide() { layer.hidden = true; }, pause() {}, update() {} };
  }
  const prog = program(VS, FS), lprog = program(LVS, LFS);
  const bufs = { mesh: gl.createBuffer(), idx: gl.createBuffer(), wire: gl.createBuffer(), axes: gl.createBuffer() };
  let mesh = null;        // {count, wireCount, zmin, zmax, surfaces}
  const cam = { theta: -0.8, phi: 0.95, dist: 22, target: [0, 0, 0] };
  let autoRotate = false, universe = null;
  const ext = gl.getExtension('OES_element_index_uint');

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    return p;
  }

  function build() {
    const surfaces = getSurfaces();
    const small = canvas.clientWidth < 700;
    const N = small ? 80 : 160;
    const verts = [], index = [], wireV = [];
    let zmin = Infinity, zmax = -Infinity;
    const grids = surfaces.map((s) => {
      const z = new Float64Array((N + 1) * (N + 1));
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const x = -R + (2 * R * i) / N, y = -R + (2 * R * j) / N;
        let v;
        try { v = s.fn(x, y); } catch { v = NaN; }
        z[j * (N + 1) + i] = Number.isFinite(v) ? v : NaN;
        if (Number.isFinite(v) && Math.abs(v) < 1e6) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
      }
      return z;
    });
    if (!Number.isFinite(zmin)) { zmin = -1; zmax = 1; }
    if (zmax - zmin < 1e-9) { zmin -= 1; zmax += 1; }
    // keep the box readable: clamp very tall surfaces to 2R
    const zClamp = Math.max(Math.abs(zmin), Math.abs(zmax));
    const zs = zClamp > 2 * R ? (2 * R) / zClamp : 1;
    let base = 0;
    grids.forEach((z) => {
      const at = (i, j) => z[j * (N + 1) + i];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const x = -R + (2 * R * i) / N, y = -R + (2 * R * j) / N, v = at(i, j);
        const zz = Number.isFinite(v) ? v * zs : 0;
        const dzx = (at(Math.min(N, i + 1), j) - at(Math.max(0, i - 1), j)) * zs / ((2 * R) / N * 2);
        const dzy = (at(i, Math.min(N, j + 1)) - at(i, Math.max(0, j - 1))) * zs / ((2 * R) / N * 2);
        const n = norm([-(Number.isFinite(dzx) ? dzx : 0), -(Number.isFinite(dzy) ? dzy : 0), 1]);
        const k = Number.isFinite(v) ? (v - zmin) / (zmax - zmin) : 0;
        verts.push(x, y, zz, n[0], n[2], -n[1], k);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        if ([at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)].every(Number.isFinite)) index.push(a, b, d, a, d, c);
      }
      const stepW = N / 20;
      for (let j = 0; j <= N; j += stepW) for (let i = 0; i < N; i++) {
        const v1 = at(i, j), v2 = at(i + 1, j);
        if (Number.isFinite(v1) && Number.isFinite(v2)) wireV.push(-R + (2 * R * i) / N, -R + (2 * R * j) / N, v1 * zs + 0.01, -R + (2 * R * (i + 1)) / N, -R + (2 * R * j) / N, v2 * zs + 0.01);
      }
      for (let i = 0; i <= N; i += stepW) for (let j = 0; j < N; j++) {
        const v1 = at(i, j), v2 = at(i, j + 1);
        if (Number.isFinite(v1) && Number.isFinite(v2)) wireV.push(-R + (2 * R * i) / N, -R + (2 * R * j) / N, v1 * zs + 0.01, -R + (2 * R * i) / N, -R + (2 * R * (j + 1)) / N, v2 * zs + 0.01);
      }
      base += (N + 1) * (N + 1);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.mesh);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ext ? new Uint32Array(index) : new Uint16Array(index), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.wire);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wireV), gl.STATIC_DRAW);
    // axes and base grid
    const ax = [-R, 0, 0, R, 0, 0, 0, -R, 0, 0, R, 0, 0, 0, -R, 0, 0, R];
    for (let i = -R; i <= R; i++) ax.push(i, -R, zmin * zs, i, R, zmin * zs, -R, i, zmin * zs, R, i, zmin * zs);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.axes);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ax), gl.STATIC_DRAW);
    mesh = { count: index.length, wireCount: wireV.length / 3, axesCount: ax.length / 3, zmin, zmax, zs, surfaces };
  }

  function matrices() {
    const { w, h: hh } = { w: canvas.clientWidth, h: canvas.clientHeight };
    const eye = [
      cam.target[0] + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta),
      cam.target[2] + cam.dist * Math.cos(cam.phi),
      -(cam.target[1] + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta)),
    ];
    const view = M4.lookAt(eye, [cam.target[0], cam.target[2], -cam.target[1]], [0, 1, 0]);
    const proj = M4.perspective(Math.PI / 4, w / Math.max(1, hh), 0.1, 400);
    return { mvp: M4.mul(proj, view), eye };
  }

  function draw(dt) {
    if (layer.hidden) return;
    if (autoRotate) cam.theta += dt * 0.15;
    const { dpr } = fitCanvas(canvas);
    void dpr;
    if (!mesh) build();
    gl.viewport(0, 0, canvas.width, canvas.height);
    const bg = hexRgb(cssVar('--bg'));
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const { mvp } = matrices();
    // surface
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.mesh);
    const stride = 7 * 4;
    const lp = gl.getAttribLocation(prog, 'p'), ln = gl.getAttribLocation(prog, 'n'), lk = gl.getAttribLocation(prog, 'k');
    gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ln); gl.vertexAttribPointer(ln, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(lk); gl.vertexAttribPointer(lk, 1, gl.FLOAT, false, stride, 24);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mvp'), false, new Float32Array(mvp));
    gl.uniform3fv(gl.getUniformLocation(prog, 'c0'), hexRgb(cssVar('--accent-deep')));
    gl.uniform3fv(gl.getUniformLocation(prog, 'c1'), hexRgb(cssVar('--accent-hi')));
    gl.uniform3fv(gl.getUniformLocation(prog, 'c2'), hexRgb(cssVar('--amber')));
    gl.uniform3fv(gl.getUniformLocation(prog, 'light'), [0.4, 1.0, 0.3]);
    gl.uniform1f(gl.getUniformLocation(prog, 'alpha'), 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
    if (mesh.count) gl.drawElements(gl.TRIANGLES, mesh.count, ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(ln); gl.disableVertexAttribArray(lk);
    // lines
    gl.useProgram(lprog);
    const lpl = gl.getAttribLocation(lprog, 'p');
    gl.uniformMatrix4fv(gl.getUniformLocation(lprog, 'mvp'), false, new Float32Array(mvp));
    const lineCol = hexRgb(cssVar('--text-2'));
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.axes);
    gl.enableVertexAttribArray(lpl); gl.vertexAttribPointer(lpl, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(gl.getUniformLocation(lprog, 'col'), [...lineCol, 0.9]);
    gl.drawArrays(gl.LINES, 0, 6);
    gl.uniform4fv(gl.getUniformLocation(lprog, 'col'), [...lineCol, 0.25]);
    gl.drawArrays(gl.LINES, 6, mesh.axesCount - 6);
    if (wire && mesh.wireCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.wire);
      gl.vertexAttribPointer(lpl, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(gl.getUniformLocation(lprog, 'col'), [0, 0, 0, 0.35]);
      gl.drawArrays(gl.LINES, 0, mesh.wireCount);
    }
    placeLabels(mvp);
  }

  function project(mvp, p) {
    const v = M4.apply(mvp, [p[0], p[2], -p[1], 1]);
    if (v[3] <= 0) return null;
    return [(v[0] / v[3] * 0.5 + 0.5) * canvas.clientWidth, (1 - (v[1] / v[3] * 0.5 + 0.5)) * canvas.clientHeight];
  }
  function placeLabels(mvp) {
    labels.textContent = '';
    const zTop = mesh ? Math.max(mesh.zmax * mesh.zs, 1) : R;
    const items = [['x', [R + 0.6, 0, 0]], ['y', [0, R + 0.6, 0]], ['z', [0, 0, zTop + 0.8]], [String(R), [R, 0, 0]], [String(-R), [-R, 0, 0]], [String(R), [0, R, 0]], [String(-R), [0, -R, 0]]];
    for (const [text, p] of items) {
      const s = project(mvp, p);
      if (!s) continue;
      labels.append(h('span', { style: { position: 'absolute', left: `${s[0]}px`, top: `${s[1]}px`, transform: 'translate(-50%, -50%)', fontWeight: text.length === 1 ? '700' : '400' }, text }));
    }
  }

  // Ray-march the surface under the pointer for trace.
  function traceAt(mx, my) {
    if (!mesh || !mesh.surfaces.length) return;
    const { mvp } = matrices();
    const inv = M4.invert(mvp);
    const nx = (mx / canvas.clientWidth) * 2 - 1, ny = 1 - (my / canvas.clientHeight) * 2;
    const p0 = M4.apply(inv, [nx, ny, -1, 1]), p1 = M4.apply(inv, [nx, ny, 1, 1]);
    const a = [p0[0] / p0[3], -p0[2] / p0[3], p0[1] / p0[3]], b = [p1[0] / p1[3], -p1[2] / p1[3], p1[1] / p1[3]];
    const f = mesh.surfaces[0].fn, zs = mesh.zs;
    let prev = null;
    for (let i = 0; i <= 600; i++) {
      const s = i / 600;
      const p = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
      if (Math.abs(p[0]) > R || Math.abs(p[1]) > R) { prev = null; continue; }
      let z;
      try { z = f(p[0], p[1]) * zs; } catch { z = NaN; }
      const d = p[2] - z;
      if (prev !== null && Number.isFinite(d) && Math.sign(d) !== Math.sign(prev.d)) {
        const x = p[0], y = p[1], zz = f(x, y);
        tip.hidden = false;
        tip.textContent = `(${fmtNum(x, 4)}, ${fmtNum(y, 4)}, ${fmtNum(zz, 4)})`;
        tip.style.left = `${mx}px`; tip.style.top = `${my}px`;
        return;
      }
      if (Number.isFinite(d)) prev = { d };
    }
    tip.hidden = true;
  }

  // ---------- interaction ----------
  const ptrs = new Map();
  let pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    stopAuto();
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), dist: cam.dist, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) { if (e.pointerType === 'mouse') traceAt(e.offsetX, e.offsetY); return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [p, q] = [...ptrs.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      cam.dist = Math.max(4, Math.min(120, pinch.dist * (pinch.d / Math.max(10, d))));
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      pan(cx - pinch.cx, cy - pinch.cy);
      pinch.cx = cx; pinch.cy = cy;
    } else if (prev.button === 2 || e.shiftKey) {
      pan(dx, dy);
    } else {
      cam.theta -= dx * 0.008;
      cam.phi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.phi - dy * 0.008));
    }
    scheduler.invalidate(ID);
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); stopAuto(); cam.dist = Math.max(4, Math.min(120, cam.dist * Math.exp(e.deltaY * 0.0012))); scheduler.invalidate(ID); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: [0.1, 0], ArrowRight: [-0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
    if (map[e.key]) { e.preventDefault(); cam.theta += map[e.key][0]; cam.phi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.phi + map[e.key][1])); scheduler.invalidate(ID); }
    if (e.key === '+' || e.key === '=') { cam.dist *= 0.85; scheduler.invalidate(ID); }
    if (e.key === '-') { cam.dist /= 0.85; scheduler.invalidate(ID); }
  });
  function pan(dx, dy) {
    const k = cam.dist * 0.0018;
    cam.target[0] -= (Math.cos(cam.theta + Math.PI / 2) * dx) * k;
    cam.target[1] -= (Math.sin(cam.theta + Math.PI / 2) * dx) * k;
    cam.target[2] += dy * k;
  }
  function stopAuto() { if (autoRotate) { autoRotate = false; scheduler.setLoop(ID, false); } }

  function resetView() { Object.assign(cam, { theta: -0.8, phi: 0.95, dist: 22, target: [0, 0, 0] }); scheduler.invalidate(ID); }

  function exportPng() {
    draw(0);
    const off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    const c = off.getContext('2d');
    c.drawImage(canvas, 0, 0);
    if (app.settings.watermark) {
      const k = canvas.width / canvas.clientWidth;
      c.globalAlpha = 0.55;
      c.fillStyle = cssVar('--text-2');
      c.font = `600 ${12 * k}px "Geist", system-ui, sans-serif`;
      c.textAlign = 'right';
      c.fillText(t('graph.watermark'), off.width - 12 * k, off.height - 12 * k);
    }
    off.toBlob((blob) => blob && shareOrCopy({ title: t('app.name'), files: [new File([blob], 'nexlyr-3d.png', { type: 'image/png' })] }), 'image/png');
  }

  function openUniverse() {
    if (universe) return;
    const close = iconButton('shrink', t('common.close'), () => closeUniverse());
    universe = h('div', { style: { position: 'fixed', inset: '0', zIndex: '80', background: 'var(--bg)' } });
    const bar = h('div', { style: { position: 'absolute', right: '12px', top: '12px', zIndex: '3', display: 'flex', gap: '6px' } }, close);
    document.body.append(universe);
    universe.append(layer, bar);
    layer.hidden = false;
    if (!reducedMotion()) { autoRotate = true; scheduler.setLoop(ID, true); }
    if (universe.requestFullscreen) universe.requestFullscreen().catch(() => {});
    document.addEventListener('keydown', escClose);
    scheduler.invalidate(ID);
  }
  function escClose(e) { if (e.key === 'Escape') closeUniverse(); }
  function closeUniverse() {
    if (!universe) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    host.append(layer);
    universe.remove();
    universe = null;
    stopAuto();
    document.removeEventListener('keydown', escClose);
    scheduler.invalidate(ID);
  }

  function renderTools() {
    tools.textContent = '';
    const wb = iconButton('grid', t('graph.style'), () => { wire = !wire; wb.setAttribute('aria-pressed', String(wire)); scheduler.invalidate(ID); });
    wb.setAttribute('aria-pressed', String(wire));
    tools.append(
      iconButton('zoomin', t('graph.zoomIn'), () => { cam.dist *= 0.8; scheduler.invalidate(ID); }),
      iconButton('zoomout', t('graph.zoomOut'), () => { cam.dist /= 0.8; scheduler.invalidate(ID); }),
      iconButton('home', t('graph.reset'), resetView),
      wb,
      iconButton('orbit', t('graph.universe'), openUniverse),
      iconButton('imagedown', t('graph.export'), exportPng),
    );
  }
  renderTools();
  scheduler.register(ID, draw, canvas);
  new ResizeObserver(() => scheduler.invalidate(ID)).observe(canvas);

  return {
    show() { layer.hidden = false; scheduler.setVisible(ID, true); mesh = null; scheduler.invalidate(ID); },
    hide() { layer.hidden = true; scheduler.setVisible(ID, false); stopAuto(); },
    pause() { stopAuto(); },
    update() { mesh = null; scheduler.invalidate(ID); },
    get visible() { return !layer.hidden; },
  };
}
