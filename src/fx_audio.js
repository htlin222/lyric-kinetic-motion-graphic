// Audio-reactive backgrounds + broadcast news package.
// Everything is driven by the real track: src/spectrum.bin (64 mel bands/frame) and src/scope.bin (oscilloscope).
const fs = require('fs');
const path = require('path');
const NB = 64, NS = 192, FPS = 30;
const SPEC = fs.readFileSync(path.join(__dirname, 'spectrum.bin'));
const SCOPE = new Int8Array(fs.readFileSync(path.join(__dirname, 'scope.bin')).buffer.slice(0));
const NF = SPEC.length / NB;
const fi = (t) => Math.max(0, Math.min(NF - 1, Math.floor(t * FPS)));
const band = (t, b) => SPEC[fi(t) * NB + b] / 255;
const scope = (t, k) => SCOPE[fi(t) * NS + k] / 127;

module.exports = function install(env) {
  const { W, H, CX, CY, C, clamp, lerp, beatPulse, envAt, rng, goldGrad, measure } = env;
  const FOC = 900;

  // 3D spectrum ridgeline: last N frames of the spectrum laid out in depth across the stage floor
  function ridgeline(ctx, t, color, accent, alpha = 1) {
    const N = 28, hor = CY + 30;
    ctx.save();
    for (let k = N - 1; k >= 0; k--) {
      const tt = t - k * 0.05; if (tt < 0) continue;
      const z = 620 + k * 95; const s = FOC / z;
      const yb = hor + 300 * s; const width = 2300 * s;
      ctx.beginPath(); ctx.moveTo(CX - width / 2, yb + 4);
      for (let b = 0; b < NB; b++) {
        const mb = Math.abs(b - (NB - 1) / 2) / ((NB - 1) / 2); // mirrored: bass in the centre
        const v = band(tt, Math.min(NB - 1, Math.floor(mb * 50))) ** 1.8;
        const edge = Math.sin((b / (NB - 1)) * Math.PI) ** 0.6;
        ctx.lineTo(CX - width / 2 + (b / (NB - 1)) * width, yb - v * 190 * s * edge);
      }
      ctx.lineTo(CX + width / 2, yb + 4); ctx.closePath();
      ctx.globalAlpha = alpha; ctx.fillStyle = '#030305'; ctx.fill();
      ctx.globalAlpha = alpha * clamp(1.1 - k / N); ctx.strokeStyle = k === 0 ? accent : color; ctx.lineWidth = k === 0 ? 3 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
  // radial spectrum ring (glam)
  function ring(ctx, t, cx, cy, r, alpha) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.15);
    const n = 128;
    for (let i = 0; i < n; i++) {
      const b = i < n / 2 ? i : n - 1 - i; const v = band(t, Math.floor(b / (n / 2) * 52)) ** 1.5;
      const a = (i / n) * Math.PI * 2; const l = 18 + v * 260;
      ctx.globalAlpha = alpha * (0.35 + v * 0.65); ctx.strokeStyle = i % 8 === 0 ? '#fff3c4' : C.gold; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * (r + l), Math.sin(a) * (r + l)); ctx.stroke();
    }
    ctx.restore();
  }
  // oscilloscope line across the frame
  function scopeLine(ctx, t, y, amp, color, alpha, glow = 18, lw = 3) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.beginPath();
    for (let k = 0; k < NS; k++) { const x = (k / (NS - 1)) * W; const taper = Math.sin((k / (NS - 1)) * Math.PI); const v = scope(t, k) * amp * taper; k ? ctx.lineTo(x, y + v) : ctx.moveTo(x, y + v); }
    ctx.stroke(); ctx.restore();
  }
  // mirrored waveform "audio monitor" built from the recent loudness history
  function envWave(ctx, t, y, h, color, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    const n = 160, bw = W / n;
    for (let i = 0; i < n; i++) {
      const tt = t - (n - 1 - Math.abs(i - n / 2) * 2) * (1 / 60);
      const v = envAt(Math.max(0, t - Math.abs(i - n / 2) * 0.012)) ** 1.3;
      const hh = 2 + v * h; ctx.fillRect(i * bw + 1, y - hh, bw - 2, hh * 2);
    }
    ctx.restore();
  }

  // ---------------- video wall ----------------
  const R = rng(99);
  const PANELS = [
    [-1500, -520, 1500], [-1180, 80, 1250], [-1650, 560, 1700], [-1250, -900, 2100],
    [1500, -520, 1500], [1180, 80, 1250], [1650, 560, 1700], [1250, -900, 2100],
  ].map((p, i) => ({ x: p[0], y: p[1], z: p[2], i, seed: R() * 1000 }));
  const KINDS = ['spectrum', 'scope', 'index', 'globe', 'onair', 'lang', 'map', 'level'];
  function panelContent(ctx, kind, w, h, t, seed, P) {
    const r = rng(Math.floor(seed));
    ctx.fillStyle = 'rgba(8,14,40,0.88)'; ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    if (kind === 'spectrum') {
      const n = 24; for (let i = 0; i < n; i++) { const v = band(t, Math.floor(i * 2.4)) ** 1.4; const bh = v * (h - 40); ctx.fillStyle = i % 6 === 0 ? C.red : C.gold; ctx.fillRect(10 + i * (w - 20) / n, h - 12 - bh, (w - 20) / n - 4, bh); }
      ctx.fillStyle = C.ivory; ctx.font = '22px Anton'; ctx.fillText('LIVE AUDIO ◉', 14, 22);
    } else if (kind === 'scope') {
      ctx.strokeStyle = '#7CFFB2'; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 0; k < 192; k++) { const x = (k / 191) * w, yy = h / 2 + scope(t, k) * h * 0.42; k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke();
      ctx.fillStyle = 'rgba(124,255,178,0.8)'; ctx.font = '20px Anton'; ctx.fillText('VOX FEED — CH.中/EN', 14, 22);
    } else if (kind === 'index') {
      ctx.strokeStyle = '#3fe08a'; ctx.lineWidth = 4; ctx.beginPath();
      for (let k = 0; k < 40; k++) { const tt = t - (39 - k) * 0.25; const v = 0.5 + 0.3 * Math.sin(tt * 0.7 + seed) + 0.2 * envAt(Math.max(0, tt)); const x = (k / 39) * w, yy = h - 20 - v * (h - 60); k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke();
      ctx.fillStyle = C.ivory; ctx.font = '22px Anton'; ctx.fillText('雙語指數 BILINGUAL IDX', 14, 22);
      ctx.fillStyle = '#3fe08a'; ctx.font = '40px Anton'; ctx.fillText('▲ ' + (98 + envAt(t) * 1.9).toFixed(1), w - 190, h / 2);
    } else if (kind === 'globe') {
      env.drawGlobe(ctx, t, w / 2, h / 2 + 6, h * 0.34, 0.9);
      ctx.fillStyle = C.ivory; ctx.font = '22px Anton'; ctx.fillText('GLOBAL IMAGE', 14, 22);
    } else if (kind === 'onair') {
      const on = Math.floor(t * 2) % 2; ctx.fillStyle = on ? C.red : '#4a0a14'; ctx.fillRect(18, 18, w - 36, h - 36);
      ctx.fillStyle = '#fff'; ctx.font = `${Math.round(h * 0.42)}px Anton`; ctx.textAlign = 'center'; ctx.fillText('ON AIR', w / 2, h / 2 + 4); ctx.textAlign = 'left';
    } else if (kind === 'lang') {
      const flip = Math.floor(t / 0.79) % 2; const sy = Math.abs(Math.cos(((t / 0.79) % 1) * Math.PI)) ** 0.3;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, sy); ctx.textAlign = 'center';
      ctx.font = flip ? `${Math.round(h * 0.5)}px NSB` : `italic ${Math.round(h * 0.42)}px PFI`; ctx.fillStyle = flip ? goldGrad(ctx, 0, h * 0.5) : C.ivory;
      ctx.fillText(flip ? '中文' : 'English', 0, 4); ctx.restore();
      ctx.fillStyle = C.gold; ctx.font = '20px Anton'; ctx.fillText('NOW SPEAKING', 14, 22);
    } else if (kind === 'map') {
      for (let k = 0; k < 140; k++) { const x = r() * w, y = 34 + r() * (h - 44); ctx.fillStyle = 'rgba(233,194,90,0.45)'; ctx.fillRect(x, y, 3, 3); }
      for (let k = 0; k < 3; k++) { const x = r() * w, y = 40 + r() * (h - 60); const ph = ((t * 0.9 + k * 0.33) % 1); ctx.strokeStyle = C.red; ctx.globalAlpha = 1 - ph; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, ph * 60, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = C.ivory; ctx.font = '22px Anton'; ctx.fillText('INTERNATIONAL REACH', 14, 22);
    } else if (kind === 'level') {
      const v = envAt(t); const n = 18;
      for (let i = 0; i < n; i++) { const on = i / n < v * 1.1; ctx.fillStyle = on ? (i > 14 ? C.red : i > 10 ? '#f2c230' : '#3fe08a') : 'rgba(255,255,255,0.08)'; ctx.fillRect(16 + i * (w - 32) / n, h / 2 - 30, (w - 32) / n - 5, 60); }
      ctx.fillStyle = C.ivory; ctx.font = '22px Anton'; ctx.fillText('CONFIDENCE LEVEL', 14, 22);
    }
  }
  function videoWall(ctx, t, alpha) {
    const bp = beatPulse(t, 9);
    const camX = Math.sin(t * 0.13) * 160, camY = Math.sin(t * 0.09) * 50;
    const sorted = PANELS.slice().sort((a, b) => b.z - a.z);
    for (const P of sorted) {
      const s = FOC / P.z; const pw = 560, ph = 330;
      const x = CX + (P.x - camX) * s, y = CY + (P.y - camY) * s;
      // rotate content each 8 beats (≈3.16 s) with a glitchy cut
      const slot = Math.floor((t + P.i * 0.39) / 3.16); const kind = KINDS[(slot + P.i * 3) % KINDS.length];
      const cut = ((t + P.i * 0.39) / 3.16) % 1;
      ctx.save(); ctx.translate(x, y);
      // faux perspective: panels on the left face right, right ones face left
      const yaw = P.x < 0 ? 0.35 : -0.35; ctx.transform(Math.cos(yaw), Math.sin(yaw) * 0.18, 0, 1, 0, 0);
      ctx.scale(s, s); ctx.translate(-pw / 2, -ph / 2);
      ctx.globalAlpha = alpha * (cut < 0.04 ? 0.3 : 1);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip(); panelContent(ctx, kind, pw, ph, t, P.seed + slot, P);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = 0; yy < ph; yy += 6) ctx.fillRect(0, yy, pw, 2);
      ctx.restore();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3 + bp * 4; ctx.globalAlpha = alpha * (0.55 + bp * 0.45); ctx.strokeRect(0, 0, pw, ph);
      ctx.restore();
    }
  }

  // ---------------- broadcast package ----------------
  const HEADLINES = [
    ['HARVARD WELCOMES BILINGUAL EXCELLENCE', '哈佛熱烈歡迎雙語卓越'],
    ['CODE-SWITCHING RECLASSIFIED AS DIPLOMACY', '語碼轉換正式列為外交手段'],
    ['專有名詞 SUPPLY REMAINS STABLE', '專有名詞供應穩定'],
    ['OXFORD "COULD NEVER", SOURCES SAY', '消息人士：牛津做不到'],
    ['GLOBAL IMAGE HITS ALL-TIME HIGH', '國際形象創歷史新高'],
    ['ENERGY STORAGE: SEE 儲能', '能源儲存：請見儲能'],
    ['HESITATION AT RECORD LOW', '猶豫指數創新低'],
  ];
  const MARKET = [['ENGLISH', -1.2], ['中文', 8.8], ['專有名詞', 12.4], ['INTL IMAGE', 3.3], ['HESITATION', -99.0], ['OXFORD', -0.4], ['CAMBRIDGE', -0.2], ['民生用電', 5.1], ['儲能', 6.6], ['節能', 4.2], ['SYNERGY', 7.7]];
  function headline(ctx, t, x, y, alpha) {
    const P = 3.16; const k = Math.floor(t / P); const ph = (t / P) % 1;
    const hl = HEADLINES[Math.floor(k / 2) % HEADLINES.length]; const zh = k % 2 === 1;
    const flip = ph > 0.9 ? Math.cos(((ph - 0.9) / 0.1) * Math.PI / 2) : ph < 0.08 ? Math.sin((ph / 0.08) * Math.PI / 2) : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = C.gold; ctx.fillRect(x, y, 150, 50); ctx.fillStyle = C.ink; ctx.font = zh ? '28px NKB' : '28px Anton'; ctx.textBaseline = 'middle'; ctx.fillText(zh ? '頭條新聞' : 'HEADLINE', x + 14, y + 26);
    ctx.save(); ctx.translate(x + 150, y + 25); ctx.scale(1, Math.max(0.02, flip));
    ctx.fillStyle = 'rgba(245,240,226,0.95)'; const txt = zh ? hl[1] : hl[0]; ctx.font = zh ? '30px NKB' : '30px Anton';
    const tw = measure(ctx, ctx.font, txt); ctx.fillRect(0, -25, tw + 36, 50); ctx.fillStyle = C.navy; ctx.fillText(txt, 18, 1);
    ctx.restore(); ctx.restore();
  }
  function clocks(ctx, t, alpha) {
    const base = 22 * 3600 + 27 * 60 + t; // 22:27 Taipei
    const z = [['TAIPEI', 0], ['LONDON', -7], ['BOSTON', -12]];
    ctx.save(); ctx.globalAlpha = alpha; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    z.forEach(([n, o], i) => {
      const s = ((base + o * 3600) % 86400 + 86400) % 86400; const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(Math.floor(s) % 60).padStart(2, '0');
      const x = W - 60 - (2 - i) * 210;
      ctx.font = '18px Anton'; ctx.fillStyle = C.gold; ctx.fillText(n, x, 128);
      ctx.font = '30px Anton'; ctx.fillStyle = C.ivory; ctx.fillText(`${hh}:${mm}:${ss}`, x, 158);
    });
    ctx.restore();
  }
  function marketStrip(ctx, t, y) {
    ctx.save(); ctx.fillStyle = 'rgba(4,6,16,0.92)'; ctx.fillRect(0, y, W, 34);
    ctx.font = '22px NKB'; ctx.textBaseline = 'middle';
    const items = MARKET.map(([n, v]) => ({ n, v: v + Math.sin(t * 0.8 + n.length) * 0.4 }));
    let total = 0; const ws = items.map((it) => { const w = measure(ctx, '22px NKB', it.n) + 150; total += w; return w; });
    let x = -((t * 90) % total);
    while (x < W) {
      items.forEach((it, i) => {
        if (x > -300 && x < W) {
          ctx.fillStyle = C.ivory; ctx.fillText(it.n, x, y + 18);
          ctx.fillStyle = it.v >= 0 ? '#3fe08a' : '#ff4d6a'; ctx.fillText(`${it.v >= 0 ? '▲' : '▼'} ${Math.abs(it.v).toFixed(1)}%`, x + ws[i] - 136, y + 18);
        }
        x += ws[i];
      });
    }
    ctx.restore();
  }
  return { ridgeline, ring, scopeLine, envWave, videoWall, headline, clocks, marketStrip, band };
};
