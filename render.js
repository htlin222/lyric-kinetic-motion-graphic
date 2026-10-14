#!/usr/bin/env node
// Reverse Jing-Jing — lyric kinetic typography engine
// Deterministic per-frame renderer: @napi-rs/canvas -> raw RGBA -> ffmpeg.
// usage:
//   node render.js --stills 13.5,45.2         (PNG previews into out/stills)
//   node render.js --from 0 --to 60 --out out/part0.mp4
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const W = 1920, H = 1080, FPS = 30, CX = W / 2, CY = H / 2;
const TL = require('./src/timeline.json');
const AU = require('./src/audio.json');
const SB = require('./src/storyboard.js');
const DURATION = 226.4;

// ---------- fonts ----------
const F = (f) => path.join(ROOT, 'fonts', f);
GlobalFonts.registerFromPath(F('PlayfairDisplay.ttf'), 'PF');
GlobalFonts.registerFromPath(F('PlayfairDisplay-Italic.ttf'), 'PFI');
GlobalFonts.registerFromPath(F('Anton-Regular.ttf'), 'Anton');
GlobalFonts.registerFromPath(F('Cormorant.ttf'), 'CG');
GlobalFonts.registerFromPath(F('Cormorant-Italic.ttf'), 'CGI');
GlobalFonts.registerFromPath(F('NotoSerifCJKtc-Black.otf'), 'NSB');
GlobalFonts.registerFromPath(F('NotoSansCJKtc-Black.otf'), 'NKB');

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, d) => clamp((t - a) / d);
const E = {
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outBack: (x) => { const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  inQuad: (x) => x * x,
};
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (n) => { const r = rng(n * 9973 + 17); return r(); };

// ---------- palette ----------
const C = {
  ivory: '#f6f0e2', gold: '#e9c25a', goldD: '#6b4708', goldDD: '#2a1a03', red: '#d61f3c', navy: '#0a1230', ink: '#05060c',
};
function goldGrad(ctx, y, s) {
  const g = ctx.createLinearGradient(0, y - s * 0.55, 0, y + s * 0.5);
  g.addColorStop(0, '#fffbe0'); g.addColorStop(0.28, '#f6d77a'); g.addColorStop(0.52, '#b98222');
  g.addColorStop(0.62, '#8a5a10'); g.addColorStop(0.8, '#f3cf6c'); g.addColorStop(1, '#fff3c4');
  return g;
}

// ---------- audio helpers ----------
const beats = AU.beats;
const envAt = (t) => AU.env[clamp(Math.floor(t * FPS), 0, AU.env.length - 1)] || 0;
const bassAt = (t) => AU.bass[clamp(Math.floor(t * FPS), 0, AU.bass.length - 1)] || 0;
function beatPulse(t, k = 7) {
  let lo = 0, hi = beats.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
  return idx < 0 ? 0 : Math.exp(-(t - beats[idx]) * k);
}
const nearestBeat = (t) => beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), beats[0]);

// ---------- structure ----------
const lines = TL;
const sections = SB.sections.map((s, i) => ({ ...s, t0: s.from < 0 ? 0 : lines[s.from].start - 0.15 }));
sections.forEach((s, i) => (s.t1 = i < sections.length - 1 ? sections[i + 1].t0 : DURATION + 1));
const sectionAt = (t) => sections.find((s) => t >= s.t0 && t < s.t1) || sections[sections.length - 1];

const scenes = [{ ids: [], layout: 'intro', t0: 0 }].concat(SB.scenes.map((s) => ({ ...s })));
scenes.forEach((s, i) => {
  if (s.ids.length) s.t0 = Math.min(...s.ids.map((id) => lines[id].tokens[0].s)) - 0.14;
  s.lastEnd = s.ids.length ? Math.max(...s.ids.map((id) => lines[id].end)) : 11.6;
});
scenes.forEach((s, i) => {
  const nxt = scenes[i + 1];
  s.t1 = nxt ? nxt.t0 : DURATION + 2;
  s.exitAt = Math.min(s.t1 - 0.06, s.lastEnd + 1.6);
  if (s.layout === 'intro') s.exitAt = s.t1 - 0.2;
  s.section = sectionAt(Math.max(0, s.t0 + 0.2));
  s.idx = i;
});

// impacts: shake + flash events
const impacts = [];
for (const sc of scenes) {
  for (const id of sc.ids) {
    const L = lines[id];
    if (sc.layout === 'climax') {
      const chars = [...'雙語國際競爭力'];
      chars.forEach((c, k) => impacts.push({ t: L.start + k * ((L.end - L.start - 0.5) / (chars.length - 1)) + 0.12, a: 34, f: 0.55 }));
      continue;
    }
    if (sc.layout === 'chorus') { impacts.push({ t: L.start + 0.18, a: 22, f: 0.35 }); continue; }
    if (sc.layout === 'hero') { impacts.push({ t: L.tokens[0].s + 0.12, a: 16, f: 0.25 }); continue; }
    for (const tk of L.tokens) if (tk.cjk) impacts.push({ t: tk.s + 0.12, a: 16, f: 0.22 });
  }
}
impacts.push({ t: nearestBeat(8.05) + 0.12, a: 26, f: 0.5 });
function shakeAt(t) {
  let x = 0, y = 0, r = 0;
  for (const im of impacts) {
    const d = t - im.t; if (d < 0 || d > 0.6) continue;
    const a = im.a * Math.exp(-d * 9);
    x += a * Math.sin(d * 83 + im.t * 7); y += a * Math.cos(d * 71 + im.t * 3); r += a * 0.0009 * Math.sin(d * 50);
  }
  return { x, y, r };
}
function flashAt(t) {
  let f = 0;
  for (const im of impacts) { const d = t - im.t; if (d >= 0 && d < 0.3) f = Math.max(f, im.f * Math.exp(-d * 16)); }
  return f;
}

// ---------- canvases ----------
const main = createCanvas(W, H), mctx = main.getContext('2d');
const out = createCanvas(W, H), octx = out.getContext('2d');
const layer = createCanvas(W, H), lctx = layer.getContext('2d');
const grains = [0, 1, 2, 3].map((k) => {
  const c = createCanvas(480, 270), x = c.getContext('2d'); const img = x.createImageData(480, 270); const r = rng(k + 5);
  for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0); return c;
});

// ---------- text primitives ----------
const mcache = new Map();
function measure(ctx, font, s) {
  const k = font + '|' + s; if (mcache.has(k)) return mcache.get(k);
  ctx.font = font; const w = ctx.measureText(s).width; mcache.set(k, w); return w;
}
// draws text centred vertically at (x,y), left aligned. opts: fill, size, extrude, ca, glow, alpha
function drawText(ctx, s, x, y, font, size, o = {}) {
  ctx.save();
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = o.align || 'left';
  const a = o.alpha == null ? 1 : o.alpha;
  if (o.extrude) {
    const w = o.w || measure(ctx, font, s);
    const cx = x + (o.align === 'center' ? 0 : w / 2);
    let dx = CX - cx, dy = CY + 120 - y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const n = Math.round(o.extrude);
    const step = size * 0.012;
    for (let k = n; k >= 1; k--) {
      const m = k / n;
      ctx.globalAlpha = a;
      ctx.fillStyle = m > 0.6 ? C.goldDD : (m > 0.25 ? '#4a3006' : C.goldD);
      ctx.fillText(s, x + (dx * 0.6 + 0.35) * step * k, y + (dy * 0.6 + 0.55) * step * k);
    }
  }
  if (o.ca) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = '#ff1744'; ctx.fillText(s, x - o.ca, y);
    ctx.fillStyle = '#00e5ff'; ctx.fillText(s, x + o.ca, y + o.ca * 0.3);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = a;
  if (o.glow) { ctx.shadowColor = o.glowColor || 'rgba(255,205,90,0.85)'; ctx.shadowBlur = o.glow; }
  ctx.fillStyle = o.fill === 'gold' ? goldGrad(ctx, y, size) : (o.fill || C.ivory);
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
  if (o.stroke) { ctx.lineWidth = o.stroke; ctx.strokeStyle = o.strokeColor || 'rgba(255,248,220,0.9)'; ctx.strokeText(s, x, y); }
  ctx.restore();
}

// ---------- layout ----------
function tokFont(tk, size, kind) {
  if (tk.cjk) return { font: `${Math.round(size * 1.08)}px NSB`, size: size * 1.08, kind: 'cjk' };
  if (kind === 'hero') return { font: `900 ${Math.round(size)}px PF`, size, kind: 'hero' };
  if (kind === 'anton') return { font: `${Math.round(size)}px Anton`, size, kind: 'anton' };
  if (kind === 'type') return { font: `400 ${Math.round(size)}px PF`, size, kind: 'type' };
  return { font: `italic ${Math.round(size)}px PFI`, size, kind: 'en' };
}
function lineWidth(ctx, L, size, kind) {
  let w = 0; L.tokens.forEach((tk, i) => { const f = tokFont(tk, size, kind); w += measure(ctx, f.font, tk.t) + (i ? size * 0.26 : 0); });
  return w;
}
// returns rows of placed tokens for a line, fit into maxW at <= maxSize
function fitLine(ctx, L, maxW, maxSize, kind, minSize = 70) {
  let size = maxSize;
  let w = lineWidth(ctx, L, size, kind);
  if (w > maxW) size = Math.max(minSize, size * maxW / w);
  let rows = [L.tokens];
  w = lineWidth(ctx, L, size, kind);
  if (w > maxW && L.tokens.length > 1) {
    // balanced two-row split
    let best = 1, bd = 1e9;
    for (let k = 1; k < L.tokens.length; k++) {
      const a = lineWidth(ctx, { tokens: L.tokens.slice(0, k) }, size, kind), b = lineWidth(ctx, { tokens: L.tokens.slice(k) }, size, kind);
      if (Math.abs(a - b) < bd) { bd = Math.abs(a - b); best = k; }
    }
    rows = [L.tokens.slice(0, best), L.tokens.slice(best)];
    const mw = Math.max(...rows.map((r) => lineWidth(ctx, { tokens: r }, size, kind)));
    if (mw > maxW) size *= maxW / mw;
  }
  return { size, rows };
}
function placeRows(ctx, fit, kind, cx, cy, lineId, align = 'center', leftX = 0) {
  const lh = fit.size * 1.32; const out = [];
  const y0 = cy - (fit.rows.length - 1) * lh / 2;
  fit.rows.forEach((row, ri) => {
    const rw = lineWidth(ctx, { tokens: row }, fit.size, kind);
    let x = align === 'center' ? cx - rw / 2 : leftX;
    row.forEach((tk) => {
      const f = tokFont(tk, fit.size, kind);
      const w = measure(ctx, f.font, tk.t);
      out.push({ tk, x, y: y0 + ri * lh, w, ...f, line: lineId });
      x += w + fit.size * 0.26;
    });
  });
  return { items: out, h: fit.rows.length * lh, size: fit.size };
}
function layoutScene(sc) {
  if (sc.items) return sc.items;
  const ctx = lctx; let items = [];
  const L = sc.ids.map((id) => lines[id]);
  const kindFor = sc.layout === 'hero' ? 'hero' : sc.layout === 'chorus' ? 'anton' : sc.layout === 'type' ? 'type' : 'en';
  if (sc.layout === 'center' || sc.layout === 'hero' || sc.layout === 'type') {
    const short = L[0].sung.length < 14;
    const maxS = sc.layout === 'hero' ? (short ? 230 : 170) : (short ? 170 : 120);
    const fit = fitLine(ctx, L[0], 1600, maxS, kindFor, 70);
    items = placeRows(ctx, fit, kindFor, CX, CY - 30, sc.ids[0]).items;
  } else if (sc.layout === 'chorus') {
    const up = { ...L[0], tokens: L[0].tokens.map((t) => ({ ...t, t: t.t.toUpperCase() })) };
    const fit = fitLine(ctx, up, 1700, 300, 'anton', 120);
    items = placeRows(ctx, fit, 'anton', CX, CY - 40, sc.ids[0]).items;
  } else if (sc.layout === 'stack' || sc.layout === 'ladder') {
    const fits = L.map((l, i) => {
      let ms = sc.layout === 'ladder' ? (sc.even ? 104 : 84 + i * 26) : 112;
      if (sc.scaleGag) ms = i === 0 ? 150 : 56;
      return fitLine(ctx, l, 1600, ms, 'en', 50);
    });
    const gap = 26;
    const total = fits.reduce((a, f) => a + f.rows.length * f.size * 1.32, 0) + gap * (fits.length - 1);
    let y = CY - 30 - total / 2;
    fits.forEach((f, i) => {
      const h = f.rows.length * f.size * 1.32;
      items = items.concat(placeRows(ctx, f, 'en', CX, y + h / 2, sc.ids[i]).items);
      y += h + gap;
    });
  } else if (sc.layout === 'split') {
    L.forEach((l, i) => {
      const fit = fitLine(ctx, l, 760, 140, 'en', 60);
      items = items.concat(placeRows(ctx, fit, 'en', i ? W * 0.74 : W * 0.26, CY - 30, sc.ids[i]).items);
    });
  } else if (sc.layout === 'list') {
    L.forEach((l, i) => {
      const fit = fitLine(ctx, l, 1100, 92, 'en', 50);
      items = items.concat(placeRows(ctx, fit, 'en', 0, 300 + i * 140, sc.ids[i], 'left', 620).items);
    });
  }
  sc.items = items;
  return items;
}

// ---------- 3D background ----------
const R = rng(42);
const dust = Array.from({ length: 380 }, () => ({ x: (R() - 0.5) * 4000, y: (R() - 0.5) * 2400, z: R() * 3000, s: 0.5 + R() * 2.2, tw: R() * 6.28 }));
const confetti = Array.from({ length: 260 }, () => ({ x: (R() - 0.5) * 2600, y: -R() * 2600, z: 300 + R() * 2200, r: R() * 6.28, vr: (R() - 0.5) * 8, c: R(), w: 10 + R() * 18 }));
const FOC = 900;
function camZ(t) {
  // camera dolly speed per section
  let z = 0; const step = 1 / 10;
  for (let tt = 0; tt < t; tt += step) { const th = sectionAt(tt).theme; z += step * (th === 'chorus' || th === 'finale' ? 900 : th === 'alert' ? 500 : 260); }
  return z;
}
const camZcache = []; for (let i = 0; i <= Math.ceil(DURATION * 10) + 20; i++) camZcache[i] = camZ(i / 10);
const camZat = (t) => { const i = Math.floor(t * 10); const f = t * 10 - i; return lerp(camZcache[i] || 0, camZcache[i + 1] || 0, f); };

function drawDust(ctx, t, color, amt = 1) {
  const cz = camZat(t);
  ctx.save();
  for (const p of dust) {
    let z = ((p.z - cz) % 3000 + 3000) % 3000 + 40;
    const k = FOC / z; const x = CX + p.x * k + Math.sin(t * 0.3 + p.tw) * 20; const y = CY + p.y * k;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const a = clamp((3000 - z) / 2000) * clamp(z / 300) * amt * (0.5 + 0.5 * Math.sin(t * 3 + p.tw));
    ctx.globalAlpha = a; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, p.s * k * 1.4 + 0.3, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}
function drawFloor(ctx, t, color, alpha) {
  const hor = CY + 140; const cz = camZat(t);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const z = 200 + (((i * 160 - cz * 0.6) % 4160) + 4160) % 4160; const y = hor + (FOC * 260) / z;
    if (y > H) continue; ctx.globalAlpha = alpha * clamp(1 - z / 4160) ;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = -22; i <= 22; i++) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath(); ctx.moveTo(CX + i * 18, hor); ctx.lineTo(CX + i * 420, H + 400); ctx.stroke();
  }
  ctx.restore();
}
function drawGlobe(ctx, t, cx, cy, r, alpha) {
  const ry = t * 0.35, rx = 0.38;
  const P = (lat, lon) => {
    let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
    const x2 = x * Math.cos(ry) + z * Math.sin(ry), z2 = -x * Math.sin(ry) + z * Math.cos(ry);
    const y3 = y * Math.cos(rx) - z2 * Math.sin(rx), z3 = y * Math.sin(rx) + z2 * Math.cos(rx);
    const k = 3 / (3 + z3); return [cx + x2 * r * k, cy - y3 * r * k, z3];
  };
  ctx.save(); ctx.lineWidth = 1.5;
  const seg = (pts) => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.globalAlpha = alpha * (b[2] < 0 ? 0.2 : 0.9); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } };
  ctx.strokeStyle = C.gold;
  for (let la = -75; la <= 75; la += 15) { const p = []; for (let lo = 0; lo <= 360; lo += 8) p.push(P(la * Math.PI / 180, lo * Math.PI / 180)); seg(p); }
  for (let lo = 0; lo < 180; lo += 15) { const p = []; for (let la = 0; la <= 360; la += 8) p.push(P(la * Math.PI / 180, lo * Math.PI / 180)); seg(p); }
  // orbit ring
  ctx.strokeStyle = '#fff3c4'; const p = []; for (let a = 0; a <= 360; a += 4) { const A = a * Math.PI / 180; p.push([cx + Math.cos(A) * r * 1.45, cy + Math.sin(A) * r * 0.28 + Math.cos(A) * r * 0.25, Math.sin(A)]); } seg(p);
  const A = t * 1.6; ctx.globalAlpha = alpha; ctx.fillStyle = '#fff6d0';
  ctx.beginPath(); ctx.arc(cx + Math.cos(A) * r * 1.45, cy + Math.sin(A) * r * 0.28 + Math.cos(A) * r * 0.25, 5, 0, 6.28); ctx.fill();
  ctx.restore();
}
function drawTunnel(ctx, t, bp) {
  const cz = camZat(t);
  ctx.save(); ctx.translate(CX, CY);
  for (let i = 0; i < 18; i++) {
    const z = ((i * 220 - cz) % 3960 + 3960) % 3960 + 60; const k = FOC / z;
    const s = 900 * k; const a = clamp(1 - z / 3960) * clamp(z / 250);
    ctx.save(); ctx.rotate(i * 0.12 + t * 0.15);
    ctx.globalAlpha = a * (0.35 + bp * 0.5); ctx.strokeStyle = i % 4 === 0 ? C.red : C.gold; ctx.lineWidth = Math.max(1, 5 * k);
    ctx.strokeRect(-s * 1.6, -s, s * 3.2, s * 2);
    ctx.restore();
  }
  ctx.restore();
}
function drawRays(ctx, t, color, alpha, n = 24, cx = CX, cy = CY) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.12); ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = alpha * (i % 2 ? 0.5 : 1); ctx.beginPath(); ctx.moveTo(0, 0); const a = (i / n) * 6.283, b = a + 3.1416 / n; ctx.lineTo(Math.cos(a) * 2400, Math.sin(a) * 2400); ctx.lineTo(Math.cos(b) * 2400, Math.sin(b) * 2400); ctx.fill(); }
  ctx.restore();
}
function drawBokeh(ctx, t) {
  const r = rng(7); ctx.save();
  for (let i = 0; i < 40; i++) {
    const x = (r() * W + t * (20 + r() * 40)) % (W + 200) - 100, y = r() * H, s = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, 'rgba(255,215,120,0.22)'); g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t + i); ctx.beginPath(); ctx.arc(x, y, s, 0, 6.28); ctx.fill();
  }
  ctx.restore();
}
function drawReverseWall(ctx, t) {
  ctx.save(); ctx.font = '170px Anton'; ctx.textBaseline = 'middle';
  for (let r = 0; r < 6; r++) {
    const y = 90 + r * 180; const dir = r % 2 ? 1 : -1; const off = ((t * 160 * dir) % 1500 + 1500) % 1500;
    ctx.save(); if (r % 2) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.globalAlpha = 0.06; ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
    for (let x = -1500; x < W + 1500; x += 1500) ctx.strokeText('REVERSE JING-JING ', x + off - 750, y);
    ctx.restore();
  }
  ctx.restore();
}
function drawLaurel(ctx, t, cx, cy, r) {
  ctx.save(); ctx.translate(cx, cy);
  const tilt = Math.sin(t * 0.5) * 0.5;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI / 2 + side * (0.25 + i * 0.17); const x = Math.cos(a) * r * Math.cos(tilt), y = Math.sin(a) * r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + side * 0.9); ctx.globalAlpha = 0.28; ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.ellipse(0, 0, 34, 12, 0, 0, 6.28); ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
}

function drawBackground(ctx, t, sec, sc) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const th = sec.theme, bp = beatPulse(t), bass = bassAt(t);
  let g;
  if (th === 'press' || th === 'outro') {
    g = ctx.createRadialGradient(CX, CY - 100, 100, CX, CY, 1300); g.addColorStop(0, th === 'outro' ? '#17130a' : '#16204a'); g.addColorStop(1, '#03040a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // spotlight cone
    ctx.save(); const sp = ctx.createLinearGradient(0, 0, 0, H); sp.addColorStop(0, 'rgba(255,230,170,0.16)'); sp.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = sp; ctx.beginPath(); const sw = Math.sin(t * 0.4) * 200; ctx.moveTo(CX - 60 + sw, -10); ctx.lineTo(CX + 60 + sw, -10); ctx.lineTo(CX + 700 + sw * 2, H); ctx.lineTo(CX - 700 + sw * 2, H); ctx.fill(); ctx.restore();
    drawFloor(ctx, t, C.gold, 0.22);
    drawGlobe(ctx, t, W - 260, 300, 190, th === 'outro' ? 0.18 : 0.32);
    drawDust(ctx, t, '#ffe1a0', 0.8);
  } else if (th === 'glam') {
    g = ctx.createRadialGradient(CX, CY, 50, CX, CY, 1300); g.addColorStop(0, '#3a1d4a'); g.addColorStop(0.5, '#160a22'); g.addColorStop(1, '#040208');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawRays(ctx, t, '#f2c45a', 0.05 + bp * 0.05);
    drawBokeh(ctx, t);
    drawDust(ctx, t, '#ffd27a', 1);
  } else if (th === 'chorus' || th === 'finale') {
    ctx.fillStyle = th === 'finale' ? '#0d0802' : '#020203'; ctx.fillRect(0, 0, W, H);
    if (th === 'finale') drawRays(ctx, t, '#f6cf63', 0.06 + bp * 0.08, 32);
    drawReverseWall(ctx, t);
    drawTunnel(ctx, t, bp);
    g = ctx.createRadialGradient(CX, CY, 0, CX, CY, 700); g.addColorStop(0, `rgba(255,200,90,${0.12 + bass * 0.18})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawDust(ctx, t, '#fff0c0', 1.2);
    if (th === 'finale') drawConfetti(ctx, t, sec.t0);
  } else if (th === 'academy') {
    g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1a1a'); g.addColorStop(1, '#020606');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // classical columns in perspective
    const cz = camZat(t);
    for (let i = 0; i < 12; i++) {
      const z = ((i * 380 - cz * 0.8) % 4560 + 4560) % 4560 + 150; const k = FOC / z;
      for (const side of [-1, 1]) {
        const x = CX + side * 900 * k, w = 90 * k, h = 1400 * k;
        ctx.globalAlpha = clamp(1 - z / 4560) * 0.5; ctx.fillStyle = '#1d3a36'; ctx.fillRect(x - w / 2, CY - h / 2, w, h);
        ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(1, 2 * k); ctx.strokeRect(x - w / 2, CY - h / 2, w, h);
      }
    }
    ctx.globalAlpha = 1;
    drawLaurel(ctx, t, CX, CY - 30, 430);
    drawDust(ctx, t, '#e8d9a8', 0.7);
  } else if (th === 'alert') {
    const flick = 0.85 + 0.15 * Math.sin(t * 40);
    g = ctx.createRadialGradient(CX, CY, 50, CX, CY, 1200); g.addColorStop(0, `rgba(120,8,20,${flick})`); g.addColorStop(1, '#0a0003');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // hazard stripes
    for (const y0 of [0, H - 70]) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, 70); ctx.clip(); ctx.fillStyle = '#111'; ctx.fillRect(0, y0, W, 70);
      ctx.fillStyle = '#f2c230'; const off = (t * 220) % 120;
      for (let x = -200; x < W + 200; x += 120) { ctx.beginPath(); ctx.moveTo(x + off, y0); ctx.lineTo(x + 60 + off, y0); ctx.lineTo(x + off, y0 + 70); ctx.lineTo(x - 60 + off, y0 + 70); ctx.fill(); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#000'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2); ctx.restore();
    drawTunnel(ctx, t, bp * 0.6);
  }
}
function drawConfetti(ctx, t, t0) {
  const el = t - t0; const cz = camZat(t) * 0.2;
  ctx.save();
  for (const p of confetti) {
    const y = ((p.y + el * 420) % 2600 + 2600) % 2600 - 1300; const z = ((p.z - cz) % 2200 + 2200) % 2200 + 200; const k = FOC / z;
    const x = CX + (p.x + Math.sin(el * 2 + p.r) * 60) * k, yy = CY + y * k;
    ctx.save(); ctx.translate(x, yy); ctx.rotate(p.r + el * p.vr); ctx.scale(1, Math.cos(el * p.vr * 0.7));
    ctx.globalAlpha = clamp(1.5 - z / 1500); ctx.fillStyle = p.c < 0.75 ? '#f3cd62' : p.c < 0.9 ? '#fff4d0' : C.red;
    ctx.fillRect(-p.w * k / 2, -p.w * k / 4, p.w * k, p.w * k / 2); ctx.restore();
  }
  ctx.restore();
}

// ---------- token animation ----------
function drawItem(ctx, it, t, sc, ex) {
  const tk = it.tk; const kind = it.kind;
  const s = tk.s - 0.06;
  if (t < s - 0.02) return;
  const sh = ex.shatter ? ex.shatter : 0;
  ctx.save();
  if (sh) {
    const r = rng(Math.floor(it.x * 13 + it.y * 7));
    ctx.translate((r() - 0.5) * 2400 * sh, (r() - 0.5) * 1600 * sh - 300 * sh);
    ctx.globalAlpha *= 1 - sh;
  }
  if (kind === 'en' || kind === 'type') {
    if (kind === 'type') {
      // typewriter
      const p = prog(t, s, Math.max(0.25, tk.e - tk.s));
      const n = Math.floor(tk.t.length * p + (p > 0 ? 1 : 0));
      const str = tk.t.slice(0, n);
      drawText(ctx, str, it.x, it.y, it.font, it.size, { fill: '#d9d4c7' });
      ctx.restore(); return;
    }
    const p = E.outExpo(prog(t, s, 0.42));
    const yaw = (1 - p) * 1.2; // radians
    const sx = Math.max(0.05, Math.cos(yaw));
    const cx = it.x + it.w / 2;
    for (let g = 2; g >= 0; g--) {
      const pg = E.outExpo(prog(t - g * 0.035, s, 0.42));
      if (g && pg > 0.98) continue;
      ctx.save();
      ctx.translate(cx + (1 - pg) * 120, it.y + (1 - pg) * 46);
      ctx.scale(g ? Math.max(0.05, Math.cos((1 - pg) * 1.2)) : sx, 1);
      ctx.rotate((1 - pg) * -0.08);
      const glow = 18 * Math.exp(-(t - s) * 4);
      drawText(ctx, tk.t, -it.w / 2, 0, it.font, it.size, { alpha: (g ? 0.22 : 1) * pg, fill: ex.dim ? 'rgba(246,240,226,0.45)' : C.ivory, glow: g ? 0 : glow + 2, glowColor: 'rgba(255,220,150,0.6)' });
      ctx.restore();
    }
  } else if (kind === 'cjk') {
    // stamp slam
    const d = t - s; const p = clamp(d / 0.18);
    const sc0 = p < 1 ? lerp(2.6, 1, E.inQuad(p)) : 1 + 0.06 * Math.exp(-(d - 0.18) * 10) * Math.sin((d - 0.18) * 40);
    const a = clamp(d / 0.08);
    const cx = it.x + it.w / 2;
    ctx.save(); ctx.translate(cx, it.y); ctx.scale(sc0, sc0); ctx.rotate((1 - p) * 0.12);
    // red seal frame
    if (p >= 1) {
      const q = E.outBack(clamp((d - 0.18) / 0.22));
      ctx.save(); ctx.rotate(-0.045); ctx.scale(lerp(1.25, 1, q), lerp(1.25, 1, q)); ctx.globalAlpha = 0.9 * q * (ex.dim ? 0.5 : 1);
      ctx.strokeStyle = C.red; ctx.lineWidth = 7; const pw = it.w / 2 + it.size * 0.22, ph = it.size * 0.68;
      ctx.strokeRect(-pw, -ph, pw * 2, ph * 2); ctx.lineWidth = 2.5; ctx.strokeRect(-pw + 12, -ph + 12, pw * 2 - 24, ph * 2 - 24);
      ctx.restore();
    }
    const ca = p < 1 ? 14 : 10 * Math.exp(-(d - 0.18) * 6);
    drawText(ctx, tk.t, -it.w / 2, 0, it.font, it.size, { alpha: a * (ex.dim ? 0.55 : 1), fill: 'gold', extrude: 12, ca, glow: 26 * Math.exp(-d * 3) + 6, w: it.w });
    ctx.restore();
    // ink spatter on impact
    if (d > 0.18 && d < 0.6) {
      const r = rng(Math.floor(tk.s * 1000)); const q = (d - 0.18) / 0.42;
      ctx.save(); ctx.fillStyle = C.gold;
      for (let i = 0; i < 26; i++) {
        const ang = r() * 6.283, sp = 200 + r() * 520; ctx.globalAlpha = 1 - q;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * sp * E.outCubic(q), it.y + Math.sin(ang) * sp * E.outCubic(q), 2 + r() * 5, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
  } else if (kind === 'hero') {
    const chars = [...tk.t]; let x = it.x;
    chars.forEach((ch, i) => {
      const cw = measure(ctx, it.font, ch);
      const d = t - (s + i * 0.035); const p = E.outBack(clamp(d / 0.4));
      if (d < 0) { x += cw; return; }
      ctx.save(); ctx.translate(x + cw / 2, it.y + (1 - clamp(d / 0.4)) * -160);
      ctx.scale(Math.max(0.04, Math.abs(Math.cos((1 - clamp(p)) * 1.5708))), 1);
      drawText(ctx, ch, -cw / 2, 0, it.font, it.size, { fill: 'gold', extrude: 14, glow: 20, alpha: clamp(d / 0.12), w: cw });
      ctx.restore(); x += cw;
    });
  } else if (kind === 'anton') {
    const chars = [...tk.t]; let x = it.x; const L = lines[it.line];
    // letters arrive right->left, flipping from mirrored
    const allChars = L.tokens.map((x) => x.t.toUpperCase()).join(' ').length;
    const tokOffset = L.tokens.slice(0, L.tokens.indexOf(tk)).reduce((a, x) => a + x.t.length + 1, 0);
    chars.forEach((ch, i) => {
      const cw = measure(ctx, it.font, ch);
      const order = allChars - 1 - (tokOffset + i);
      const d = t - (L.start - 0.04 + order * 0.028); const p = E.outCubic(clamp(d / 0.34));
      if (d < 0) { x += cw; return; }
      const sxv = -Math.cos(Math.PI * p);
      ctx.save(); ctx.translate(x + cw / 2, it.y);
      ctx.scale(Math.sign(sxv || 1) * Math.max(0.05, Math.abs(sxv)) * (1 + (1 - p) * 0.4), 1 + (1 - p) * 0.4);
      const mirrored = sxv < 0;
      drawText(ctx, ch, -cw / 2, 0, it.font, it.size, { fill: mirrored ? C.red : 'gold', extrude: 16, glow: 30 * beatPulse(t) + 8, ca: 6 + 10 * beatPulse(t), w: cw });
      ctx.restore();
      // floor reflection
      ctx.save(); ctx.translate(x + cw / 2, it.y + it.size * 1.02); ctx.scale(Math.max(0.05, Math.abs(sxv)), -0.55);
      drawText(ctx, ch, -cw / 2, -it.size * 0.5, it.font, it.size, { fill: 'gold', alpha: 0.16 * p });
      ctx.restore();
      x += cw;
    });
  }
  ctx.restore();
}

function drawCrown(ctx, x, y, s, p) {
  ctx.save(); ctx.translate(x, y - (1 - p) * 200); ctx.scale(s, s); ctx.globalAlpha = p;
  ctx.fillStyle = goldGrad(ctx, 0, 120); ctx.shadowColor = 'rgba(255,210,100,0.8)'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(-90, 40); ctx.lineTo(-100, -40); ctx.lineTo(-50, 0); ctx.lineTo(0, -60); ctx.lineTo(50, 0); ctx.lineTo(100, -40); ctx.lineTo(90, 40); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = C.red; for (const cx of [-50, 0, 50]) { ctx.beginPath(); ctx.arc(cx, 22, 8, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = '#fff6d0'; for (const [cx, cy] of [[-100, -40], [0, -60], [100, -40]]) { ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.28); ctx.fill(); }
  ctx.restore();
}

function drawSceneContent(ctx, sc, t, ex) {
  if (sc.layout === 'intro') return drawIntro(ctx, t);
  if (sc.layout === 'climax') return drawClimax(ctx, sc, t);
  const items = layoutScene(sc);
  // decorations
  if (sc.layout === 'split') {
    const p = E.outExpo(prog(t, sc.t0, 0.5));
    ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(CX, CY - 30 - 260 * p); ctx.lineTo(CX, CY - 30 + 260 * p); ctx.stroke();
    ctx.font = '40px Anton'; ctx.fillStyle = C.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = p; ctx.fillText('VS', CX, CY - 30 - 300 * p); ctx.restore();
  }
  if (sc.crown) { const L = lines[sc.ids[0]]; const p = E.outBack(prog(t, L.start, 0.5)); const top = Math.min(...items.map((i) => i.y - i.size * 0.6)); drawCrown(ctx, CX, top - 110, 1.1, clamp(p)); }
  if (sc.layout === 'list') {
    sc.ids.forEach((id, i) => {
      const L = lines[id]; const y = 300 + i * 140; const p = prog(t, L.start - 0.05, 0.25);
      if (p <= 0) return;
      ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 5; ctx.globalAlpha = p; ctx.strokeRect(500, y - 40, 80, 80);
      const q = E.outCubic(prog(t, L.start + 0.1, 0.25));
      ctx.strokeStyle = C.red; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(510, y);
      if (q > 0) { ctx.lineTo(510 + 25 * clamp(q * 2), y + 28 * clamp(q * 2)); if (q > 0.5) ctx.lineTo(535 + 70 * (q - 0.5) * 2, y + 28 - 90 * (q - 0.5) * 2); ctx.stroke(); }
      ctx.restore();
    });
  }
  const strikeLine = sc.strike && sc.ids.length > 1 ? lines[sc.ids[1]].start : 1e9;
  for (const it of items) {
    const dim = sc.strike && it.line === sc.ids[0] && t > strikeLine;
    let extra = { ...ex, dim };
    ctx.save();
    if (sc.heavy) { // words sag under weight
      const L = lines[it.line]; const q = clamp((t - it.tk.s - 0.3) / 1.2); ctx.translate(0, E.inQuad(q) * 60 * (it.x / W)); ctx.rotate(E.inQuad(q) * 0.03);
    }
    if (sc.glitch && Math.sin(t * 37 + it.x) > 0.75) { ctx.translate((hash(Math.floor(t * 30) + it.x) - 0.5) * 60, 0); extra.ca = 18; }
    drawItem(ctx, it, t, sc, extra);
    ctx.restore();
  }
  // strike-through / X marks
  if (sc.strike && t > strikeLine) {
    const q = E.outExpo(prog(t, strikeLine, 0.3));
    const l0 = items.filter((i) => i.line === sc.ids[0]);
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineCap = 'round';
    if (sc.strike === 'line') {
      const rows = [...new Set(l0.map((i) => i.y))];
      rows.forEach((y) => { const r = l0.filter((i) => i.y === y); const x0 = r[0].x - 20, x1 = r[r.length - 1].x + r[r.length - 1].w + 20; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x0, y + 6); ctx.lineTo(lerp(x0, x1, q), y + 6 - 14 * q); ctx.stroke(); });
    } else if (sc.strike === 'x') {
      l0.filter((i) => i.kind === 'cjk').forEach((i) => {
        const cx = i.x + i.w / 2, s = i.size * 0.75; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(cx - s, i.y - s); ctx.lineTo(cx - s + 2 * s * clamp(q * 2), i.y - s + 2 * s * clamp(q * 2)); ctx.stroke();
        if (q > 0.5) { const r = (q - 0.5) * 2; ctx.beginPath(); ctx.moveTo(cx + s, i.y - s); ctx.lineTo(cx + s - 2 * s * r, i.y - s + 2 * s * r); ctx.stroke(); }
      });
    }
    ctx.restore();
  }
  if (sc.layout === 'type') { // blinking cursor
    const it = items[items.length - 1]; if (t > it.tk.s && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = C.gold; ctx.fillRect(it.x + it.w + 14, it.y - it.size * 0.45, 8, it.size * 0.9); }
  }
  if (sc.endcard) drawEndcard(ctx, t);
}

function drawIntro(ctx, t) {
  // 0-12s: globe assembles, "LIVE FROM HARVARD", title flips in reversed, 逆晶晶體 stamp
  const hit = nearestBeat(8.05);
  const p1 = E.outExpo(prog(t, 1.2, 1.2));
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const spacing = lerp(60, 18, p1);
  ctx.font = '600 34px CG'; ctx.fillStyle = C.gold; ctx.globalAlpha = p1 * (1 - prog(t, 10.6, 0.4));
  const s1 = 'L I V E   F R O M   T H E   P O D I U M';
  ctx.fillText(s1.split('').join(' '.repeat(spacing > 40 ? 1 : 0)), CX, 300);
  ctx.globalAlpha = E.outExpo(prog(t, 2.6, 1)) * (1 - prog(t, 10.6, 0.4));
  ctx.font = 'italic 64px PFI'; ctx.fillStyle = C.ivory; ctx.fillText('An International Press Conference', CX, 380);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2; const lw = 420 * E.outExpo(prog(t, 3.2, 1));
  ctx.beginPath(); ctx.moveTo(CX - lw, 440); ctx.lineTo(CX + lw, 440); ctx.stroke();
  ctx.restore();
  // title
  const fake = { start: 6.2, tokens: [{ t: 'REVERSE', s: 6.2 }, { t: 'JING-JING', s: 6.2 }] };
  const title = 'REVERSE JING-JING';
  ctx.save(); const size = 230; const font = `${size}px Anton`; const tw = measure(ctx, font, title);
  let x = CX - tw / 2; const y = 600;
  [...title].forEach((ch, i) => {
    const cw = measure(ctx, font, ch); const order = title.length - 1 - i;
    const d = t - (6.0 + order * 0.07); const p = E.outCubic(clamp(d / 0.5));
    if (d >= 0) {
      const sxv = -Math.cos(Math.PI * p);
      ctx.save(); ctx.translate(x + cw / 2, y); ctx.scale(Math.sign(sxv || 1) * Math.max(0.05, Math.abs(sxv)), 1);
      const out = prog(t, 10.9, 0.8); ctx.globalAlpha = 1 - out;
      drawText(ctx, ch, -cw / 2, 0, font, size, { fill: sxv < 0 ? C.red : 'gold', extrude: 18, glow: 18, w: cw });
      ctx.restore();
    }
    x += cw;
  });
  ctx.restore();
  // stamp
  const d = t - (hit - 0.12);
  if (d > 0) {
    const p = clamp(d / 0.16); const s = p < 1 ? lerp(3, 1, E.inQuad(p)) : 1;
    ctx.save(); ctx.translate(CX + 560, 780); ctx.rotate(-0.08); ctx.scale(s, s); ctx.globalAlpha = 1 - prog(t, 10.9, 0.6);
    ctx.fillStyle = C.red; ctx.fillRect(-170, -62, 340, 124); ctx.strokeStyle = '#fff1e0'; ctx.lineWidth = 3; ctx.strokeRect(-158, -50, 316, 100);
    ctx.font = '86px NSB'; ctx.fillStyle = '#fff1e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('逆晶晶體', 0, 4);
    ctx.restore();
  }
}

function drawClimax(ctx, sc, t) {
  const L = lines[sc.ids[0]]; const chars = [...'雙語國際競爭力'];
  const step = (L.end - L.start - 0.5) / (chars.length - 1);
  const size = 210; const font = `${size}px NSB`;
  const tw = chars.reduce((a, c) => a + measure(ctx, font, c), 0) + 20 * (chars.length - 1);
  // rays behind
  const p0 = prog(t, L.start, 0.4); drawRays(ctx, t * 3, '#ffd46b', 0.12 * p0, 36, CX, CY - 40);
  let x = CX - tw / 2;
  chars.forEach((ch, i) => {
    const cw = measure(ctx, font, ch); const d = t - (L.start + i * step);
    if (d > 0) {
      const p = clamp(d / 0.14); const s = p < 1 ? lerp(4, 1, E.inQuad(p)) : 1 + 0.08 * Math.exp(-(d - 0.14) * 8) * Math.sin(d * 50) + 0.04 * beatPulse(t);
      ctx.save(); ctx.translate(x + cw / 2, CY - 40); ctx.scale(s, s); ctx.rotate((1 - p) * (i % 2 ? 0.3 : -0.3));
      drawText(ctx, ch, -cw / 2, 0, font, size, { fill: 'gold', extrude: 18, glow: 40, ca: 8 + 20 * Math.exp(-d * 5), w: cw, alpha: clamp(d / 0.05) });
      ctx.restore();
    }
    x += cw + 20;
  });
  const q = E.outExpo(prog(t, L.end - 0.3, 0.6));
  ctx.save(); ctx.font = '54px Anton'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ivory; ctx.globalAlpha = q;
  const label = 'BILINGUAL  GLOBAL  COMPETITIVENESS'; ctx.fillText(label, CX, CY + 170 + (1 - q) * 40);
  ctx.restore();
  // confetti burst
  if (t > L.start + step * 6) { drawConfetti(ctx, t, L.start); }
}

function drawEndcard(ctx, t) {
  const t0 = 224.4; const p = E.outExpo(prog(t, t0, 0.8));
  if (p <= 0) return;
  ctx.save(); ctx.globalAlpha = p; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '78px Anton'; ctx.fillStyle = C.ivory; ctx.fillText('REVERSE  JING-JING', CX, CY + 210);
  ctx.font = '48px NSB'; ctx.fillStyle = C.gold; ctx.fillText('逆 晶 晶 體', CX, CY + 290);
  ctx.font = 'italic 28px CGI'; ctx.fillStyle = 'rgba(246,240,226,0.7)'; ctx.fillText('Bilingual Global Competitiveness™  —  a kinetic lyric film', CX, CY + 350);
  ctx.restore();
}

// ---------- overlays ----------
function drawSubtitle(ctx, t, sec) {
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], nx = lines[i + 1];
    const end = Math.min(nx ? nx.start : DURATION, L.end + 1.2);
    if (t >= L.start - 0.1 && t < end) cur = L;
  }
  if (!cur || !cur.sub) return;
  const a = E.outCubic(prog(t, cur.start - 0.1, 0.25));
  const hasTicker = sec.theme === 'press' && sec.name !== 'intro';
  const y = hasTicker ? H - 132 : H - 92;
  const cjk = /[一-鿿]/.test(cur.sub);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = cjk ? '36px NKB' : 'italic 600 40px CGI';
  const w = ctx.measureText(cur.sub).width;
  ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#000'; ctx.fillRect(CX - w / 2 - 28, y - 30, w + 56, 60);
  ctx.globalAlpha = a; ctx.fillStyle = C.gold; ctx.fillRect(CX - w / 2 - 28, y - 30, 4, 60);
  ctx.fillStyle = 'rgba(246,240,226,0.92)'; ctx.fillText(cur.sub, CX, y + (1 - a) * 12 + (cjk ? 0 : -2));
  ctx.restore();
}
function drawLowerThird(ctx, t, sec) {
  if (sec.theme !== 'press' || sec.name === 'intro') return;
  const p = E.outExpo(prog(t, sec.t0, 0.6));
  ctx.save();
  // ticker
  ctx.translate(0, (1 - p) * 80);
  ctx.fillStyle = C.gold; ctx.fillRect(0, H - 54, W, 54);
  ctx.fillStyle = C.red; ctx.fillRect(0, H - 54, 210, 54);
  ctx.font = '30px Anton'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.beginPath(); ctx.rect(210, H - 54, W - 210, 54); ctx.clip();
  ctx.fillStyle = C.ink; ctx.font = '28px NKB';
  const tw = measure(ctx, '28px NKB', SB.ticker); const off = (t * 170) % tw;
  for (let x = 230 - off; x < W; x += tw) ctx.fillText(SB.ticker, x, H - 26);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = '30px Anton'; ctx.fillText('BREAKING', 38, H - 26);
  ctx.restore();
  // LIVE bug
  ctx.save(); ctx.globalAlpha = p;
  ctx.fillStyle = C.red; ctx.fillRect(60, 56, 96, 44); ctx.fillStyle = '#fff'; ctx.font = '30px Anton'; ctx.textBaseline = 'middle'; ctx.fillText('LIVE', 80, 79);
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#fff' : C.red; ctx.beginPath(); ctx.arc(176, 78, 8, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(10,18,48,0.85)'; ctx.fillRect(196, 56, 560, 44); ctx.fillStyle = C.ivory; ctx.font = '24px NKB'; ctx.fillText('INTERNATIONAL PRESS CONFERENCE ｜ 國際記者會', 212, 79);
  ctx.restore();
}
function drawSectionLabel(ctx, t, sec) {
  const d = t - sec.t0; if (d > 3.2 || sec.name === 'intro') return;
  const p = E.outExpo(clamp(d / 0.5)), q = clamp((3.2 - d) / 0.4);
  ctx.save(); ctx.globalAlpha = p * q; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.font = '26px Anton'; ctx.fillStyle = C.gold;
  ctx.fillText(sec.label, W - 60 + (1 - p) * 60, 78);
  ctx.fillRect(W - 60 - 340 * p, 100, 340 * p, 2);
  ctx.restore();
}
function drawRewind(ctx, t, sec) {
  if (sec.fx !== 'mirror') return; const d = t - sec.t0; if (d < 0 || d > 1.4) return;
  ctx.save(); ctx.globalAlpha = Math.floor(d * 6) % 2 ? 1 : 0.5;
  ctx.font = '44px Anton'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText('◀◀  REWIND', 70, H - 120);
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 5; i++) { const y = (hash(Math.floor(t * 30) + i) * H); ctx.fillStyle = '#fff'; ctx.fillRect(0, y, W, 2 + hash(i + Math.floor(t * 30)) * 10); }
  ctx.restore();
}
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(CX, CY, H * 0.45, CX, CY, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- scene exit transforms ----------
function exitParams(sc, t) {
  const q = clamp((t - sc.exitAt) / 0.26);
  const type = sc.layout === 'chorus' ? 'flip' : sc.section.exit;
  return { q, type, dir: sc.idx % 2 ? 1 : -1 };
}
function renderScene(ctx, sc, t) {
  if (t < sc.t0 - 0.05 || t > sc.exitAt + 0.3) return;
  const { q, type, dir } = exitParams(sc, t);
  const life = t - sc.t0;
  // slow 3D dolly-in + drift for the shot
  const dolly = 1 + Math.min(life, 4) * 0.018;
  const drift = Math.sin(sc.idx * 1.7 + life * 0.6) * 0.012;
  const draw = (ox, oy, s, sx, alpha, rot = 0, extra = {}) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(CX + ox, CY + oy); ctx.rotate(drift + rot); ctx.scale(s * sx, s); ctx.translate(-CX, -CY);
    drawSceneContent(ctx, sc, t, extra); ctx.restore();
  };
  if (q <= 0) return draw(0, 0, dolly, 1, 1);
  const e = E.inCubic(q);
  if (type === 'whip') {
    for (let g = 4; g >= 0; g--) draw(dir * 2600 * E.inCubic(clamp(q - g * 0.05)), 0, dolly, 1, g ? 0.18 : 1);
  } else if (type === 'zoom') {
    draw(0, 0, dolly * (1 + e * 5), 1, 1 - e);
  } else if (type === 'flip') {
    draw(0, 0, dolly * (1 - e * 0.3), Math.cos(e * Math.PI / 2), 1 - e * 0.5, 0);
  } else if (type === 'wipe') {
    ctx.save(); ctx.beginPath(); ctx.rect(W * e, 0, W, H); ctx.clip(); draw(0, 0, dolly, 1, 1); ctx.restore();
    ctx.save(); ctx.fillStyle = C.gold; ctx.globalAlpha = 1 - q * 0.2; ctx.fillRect(W * e - 14, 0, 14, H); ctx.restore();
  } else if (type === 'glitch') {
    draw(0, 0, dolly, 1, 1, 0, { shatter: E.inQuad(q) });
  } else draw(0, 0, dolly, 1, 1 - e);
}

// ---------- frame ----------
function renderFrame(t) {
  const sec = sectionAt(t);
  const ctx = mctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // background with subtle bass zoom
  ctx.save(); const bz = 1 + bassAt(t) * 0.025; ctx.translate(CX, CY); ctx.scale(bz, bz); ctx.translate(-CX, -CY);
  drawBackground(ctx, t, sec);
  ctx.restore();
  // text layer with camera shake
  const sh = shakeAt(t);
  ctx.save(); ctx.translate(CX + sh.x, CY + sh.y); ctx.rotate(sh.r); ctx.translate(-CX, -CY);
  for (const sc of scenes) renderScene(ctx, sc, t);
  ctx.restore();
  drawVignette(ctx);
  drawLowerThird(ctx, t, sec);
  drawSubtitle(ctx, t, sec);
  drawSectionLabel(ctx, t, sec);
  drawRewind(ctx, t, sec);
  // flash
  const fl = flashAt(t);
  // section boundary FX
  let flipX = 1, glitch = 0, bflash = 0;
  for (const s of sections) {
    const d = t - s.t0; if (s.name === 'intro') continue;
    if (s.fx === 'mirror' && d > -0.12 && d < 0.3) flipX = Math.cos(Math.PI * clamp((d + 0.12) / 0.42) * 2) ;
    if (s.fx === 'glitch' && d > -0.1 && d < 0.35) glitch = 1 - clamp((d + 0.1) / 0.45);
    if (d > -0.02 && d < 0.3) bflash = Math.max(bflash, 0.45 * Math.exp(-Math.max(0, d) * 12));
  }
  if (fl + bflash > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(fl + bflash); ctx.fillStyle = '#fff3d6'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // grain
  ctx.save(); ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(grains[Math.floor(t * FPS) % 4], 0, 0, W, H); ctx.restore();
  // fade in / out
  const fade = Math.min(clamp(t / 0.8), clamp((DURATION - t) / 1.2));
  // composite to out with post
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = 1;
  octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H);
  octx.globalAlpha = fade;
  if (Math.abs(flipX - 1) > 0.001) {
    octx.save(); octx.translate(CX, CY); octx.scale(Math.sign(flipX || 1) * Math.max(0.02, Math.abs(flipX)), 1 + (1 - Math.abs(flipX)) * 0.08); octx.translate(-CX, -CY); octx.drawImage(main, 0, 0); octx.restore();
  } else octx.drawImage(main, 0, 0);
  if (glitch > 0) {
    const r = rng(Math.floor(t * 60));
    for (let i = 0; i < 16; i++) { const y = r() * H, h = 8 + r() * 70, dx = (r() - 0.5) * 260 * glitch; octx.drawImage(main, 0, y, W, h, dx, y, W, h); }
    octx.globalCompositeOperation = 'lighter'; octx.globalAlpha = 0.25 * glitch; octx.drawImage(main, 14 * glitch, 0); octx.globalCompositeOperation = 'source-over';
  }
  // letterbox bars
  octx.globalAlpha = 1; octx.fillStyle = '#000'; const lb = sec.theme === 'chorus' || sec.theme === 'finale' ? 44 : 0; if (lb) { octx.fillRect(0, 0, W, lb); octx.fillRect(0, H - lb, W, lb); }
  return out;
}

// ---------- CLI ----------
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--stills')) {
  const ts = arg('--stills').split(',').map(Number); const dir = path.join(ROOT, 'out', 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const t of ts) { const c = renderFrame(t); const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`); fs.writeFileSync(f, c.toBuffer('image/jpeg', 85)); console.log(f); }
} else {
  const from = Number(arg('--from', 0)), to = Number(arg('--to', DURATION)); const outFile = arg('--out', path.join(ROOT, 'out', 'video.mp4'));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS); let fi = f0; const t0 = Date.now();
  const pump = () => {
    while (fi < f1) {
      const c = renderFrame(fi / FPS); const ok = ff.stdin.write(c.data()); fi++;
      if (fi % 150 === 0) process.stderr.write(`[${from}-${to}] frame ${fi}/${f1}  ${((Date.now() - t0) / (fi - f0)).toFixed(0)}ms/f\n`);
      if (!ok) { ff.stdin.once('drain', pump); return; }
    }
    ff.stdin.end();
  };
  ff.on('close', (c) => { console.log('done', outFile, c); });
  pump();
}
