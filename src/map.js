import { W, H } from './config.js';
import { PAL } from './sprites.js';

// Дорога: враги идут от левого края к воротам замка
export const PATH = [
  [-14, 200], [70, 200], [70, 90], [170, 90], [170, 215], [290, 215],
  [290, 105], [370, 105], [370, 228], [440, 228], [440, 182],
];

// Места под башни (центр основания)
export const SLOTS = [
  [35, 150], [120, 142], [120, 56], [230, 178],
  [230, 104], [330, 168], [330, 58], [235, 258],
];

export const CASTLE = { x: 398, y: 40, w: 82, h: 142, gateX: 440, gateY: 182 };

// ---------- геометрия пути ----------
const segs = [];
let total = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [x1, y1] = PATH[i], [x2, y2] = PATH[i + 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  segs.push({ x1, y1, x2, y2, len, start: total });
  total += len;
}
export const PATH_LEN = total;

export function posAt(d) {
  if (d <= 0) return { x: PATH[0][0], y: PATH[0][1], dx: 1, dy: 0 };
  for (const s of segs) {
    if (d <= s.start + s.len) {
      const t = (d - s.start) / s.len;
      return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t, dx: Math.sign(s.x2 - s.x1), dy: Math.sign(s.y2 - s.y1) };
    }
  }
  const last = PATH[PATH.length - 1];
  return { x: last[0], y: last[1], dx: 0, dy: -1 };
}

function distToPath(px, py) {
  let best = 1e9;
  for (const s of segs) {
    const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
    let t = ((px - s.x1) * vx + (py - s.y1) * vy) / (vx * vx + vy * vy);
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (s.x1 + vx * t), py - (s.y1 + vy * t));
    if (d < best) best = d;
  }
  return best;
}

// ---------- детерминированный шум ----------
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// ---------- фон ----------
export function renderBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const grass = ['#3f7d3a', '#45863f', '#3a7435', '#4b8f44'].map(hex);
  const grassDark = hex('#2f6230');
  const dirt = ['#8a6a44', '#7d5f3c', '#94744c'].map(hex);
  const stones = ['#9a9488', '#8a8478', '#a8a296', '#7e786c'].map(hex);
  const mortar = hex('#5e584e');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = distToPath(x, y);
      let col;
      if (d < 6.5) {
        const row = Math.floor(y / 4), off = (row % 2) * 3;
        const cx = Math.floor((x + off) / 6);
        if (y % 4 === 0 || (x + off) % 6 === 0) col = mortar;
        else {
          col = stones[Math.floor(hash(cx, row, 3) * 4)];
          if ((x + off) % 6 === 1 && y % 4 === 1) col = col.map(v => Math.min(255, v + 22));
        }
      } else if (d < 9.5) {
        col = dirt[Math.floor(hash(x, y, 1) * 3)];
      } else if (d < 11) {
        col = grassDark;
      } else {
        const n = hash(x >> 3, y >> 3, 7) * 0.6 + hash(x, y, 2) * 0.4;
        col = grass[Math.min(3, Math.floor(n * 4))];
      }
      const i = (y * W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // декор: деревья, камни, кристаллы, цветы
  const r = rng(1337);
  const free = (x, y, pad) => distToPath(x, y) > pad && !SLOTS.some(([sx, sy]) => Math.hypot(sx - x, sy - 8 - y) < 20) &&
    !(x > CASTLE.x - 12 && y > CASTLE.y - 8 && y < CASTLE.y + CASTLE.h + 12);
  const items = [];
  for (let i = 0; i < 900 && items.length < 75; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (!free(x, y, 18)) continue;
    const edge = y < 40 || y > 250 || x < 20 || x > 455;
    const k = r();
    if (edge || k < 0.45) items.push({ t: 'pine', x, y, s: r() });
    else if (k < 0.62) items.push({ t: 'oak', x, y, s: r() });
    else if (k < 0.78) items.push({ t: 'rock', x, y, s: r() });
    else items.push({ t: 'crystal', x, y, s: r() });
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (!free(x, y, 12)) continue;
    ctx.fillStyle = ['#e8d84a', '#e05a8a', '#f2f2f2', '#9ad0ff'][Math.floor(r() * 4)];
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = '#2f6a2c'; ctx.fillRect(x, y + 1, 1, 1);
  }
  // факелы вдоль дороги
  [[95, 70], [150, 230], [270, 85], [310, 240], [355, 245]].forEach(([x, y]) => items.push({ t: 'torch', x, y }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) drawDecor(ctx, it);

  drawCastle(ctx);
  return c;
}

function drawDecor(ctx, it) {
  const { x, y } = it;
  if (it.t === 'pine') {
    const h = 14 + Math.floor(it.s * 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 5, y, 11, 2);
    ctx.fillStyle = PAL.N; ctx.fillRect(x, y - 3, 2, 3);
    for (let j = 0; j < h; j++) {
      const w = Math.floor((j / h) * 7) + 1 - (j % 4 === 0 ? 1 : 0);
      const yy = y - 3 - h + j;
      ctx.fillStyle = '#163d22'; ctx.fillRect(x - w, yy, w * 2 + 2, 1);
      ctx.fillStyle = '#245a30'; ctx.fillRect(x - w + 1, yy, w * 2, 1);
      ctx.fillStyle = '#2f7038'; ctx.fillRect(x - w + 1, yy, Math.max(1, w - 1), 1);
    }
  } else if (it.t === 'oak') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y, 13, 2);
    ctx.fillStyle = PAL.N; ctx.fillRect(x, y - 5, 2, 5);
    const cr = 6;
    for (let j = -cr; j <= cr; j++) for (let i = -cr - 1; i <= cr + 1; i++) {
      const dd = (i * i) / ((cr + 1) * (cr + 1)) + (j * j) / (cr * cr);
      if (dd > 1) continue;
      ctx.fillStyle = dd > 0.75 ? '#1d4a24' : (i + j < -2 ? '#4f9a45' : '#2f7a36');
      ctx.fillRect(x + i, y - 11 + j, 1, 1);
    }
  } else if (it.t === 'rock') {
    const w = 4 + Math.floor(it.s * 4);
    ctx.fillStyle = '#3e3c40'; ctx.fillRect(x - w, y - 3, w * 2 + 1, 4);
    ctx.fillStyle = '#7a7680'; ctx.fillRect(x - w + 1, y - 4, w * 2 - 1, 4);
    ctx.fillStyle = '#9a96a0'; ctx.fillRect(x - w + 2, y - 4, w - 1, 1);
  } else if (it.t === 'crystal') {
    const cols = it.s < 0.5 ? ['#2d7bd6', '#7fd6ff', '#c8f2ff'] : ['#7a3cc4', '#c58cff', '#ecd6ff'];
    const shards = [[0, 9], [-3, 6], [3, 5]];
    for (const [ox, h] of shards) {
      for (let j = 0; j < h; j++) {
        const w = j < 2 ? 1 : 2;
        ctx.fillStyle = cols[0]; ctx.fillRect(x + ox - 1, y - j, w + 1, 1);
        ctx.fillStyle = cols[1]; ctx.fillRect(x + ox, y - j, 1, 1);
      }
      ctx.fillStyle = cols[2]; ctx.fillRect(x + ox, y - h + 1, 1, 1);
    }
  } else if (it.t === 'torch') {
    ctx.fillStyle = PAL.N; ctx.fillRect(x, y - 6, 1, 7);
    ctx.fillStyle = PAL.o; ctx.fillRect(x - 1, y - 9, 3, 3);
    ctx.fillStyle = PAL.y; ctx.fillRect(x, y - 9, 1, 2);
  }
}

// ---------- замок ----------
function bricks(ctx, x, y, w, h, light, base, dark) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = dark;
  for (let j = 0; j < h; j += 4) {
    ctx.fillRect(x, y + j, w, 1);
    const off = (j / 4) % 2 ? 3 : 0;
    for (let i = off; i < w; i += 6) ctx.fillRect(x + i, y + j, 1, 4);
  }
  ctx.fillStyle = light; ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = dark; ctx.fillRect(x + w - 2, y, 2, h);
}
function merlons(ctx, x, y, w, base, dark) {
  for (let i = 0; i < w; i += 5) {
    ctx.fillStyle = dark; ctx.fillRect(x + i, y - 4, 4, 4);
    ctx.fillStyle = base; ctx.fillRect(x + i, y - 4, 3, 3);
  }
}
function roof(ctx, cx, baseY, half, h) {
  for (let j = 0; j < h; j++) {
    const w = Math.round(half * (j / h));
    const y = baseY - h + j;
    ctx.fillStyle = '#5a1414'; ctx.fillRect(cx - w - 1, y, w * 2 + 3, 1);
    ctx.fillStyle = '#b8302a'; ctx.fillRect(cx - w, y, w * 2 + 1, 1);
    ctx.fillStyle = '#e0503e'; ctx.fillRect(cx - w, y, Math.max(1, w - 1), 1);
    if (j % 3 === 2) { ctx.fillStyle = '#8a2020'; ctx.fillRect(cx - w, y, w * 2 + 1, 1); }
  }
}
function flag(ctx, x, y, color) {
  ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 1, 9);
  ctx.fillStyle = color; ctx.fillRect(x + 1, y, 6, 3);
  ctx.fillStyle = PAL.y; ctx.fillRect(x + 1, y + 3, 4, 1);
}
function round(ctx, cx, top, bottom, half) {
  // круглая башня замка с тенью справа
  const base = '#a39d92', light = '#c8c2b6', dark = '#6e685e';
  bricks(ctx, cx - half, top, half * 2, bottom - top, light, base, dark);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(cx + 2, top, half - 2, bottom - top);
  merlons(ctx, cx - half - 1, top, half * 2 + 2, base, dark);
}
function windowSlit(ctx, x, y, lit) {
  ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 3, 6);
  ctx.fillStyle = lit ? '#f3c843' : '#2a2430'; ctx.fillRect(x + 1, y + 1, 1, 4);
}

function drawCastle(ctx) {
  const X = CASTLE.x;
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X - 2, 178, 86, 6);
  // донжон позади
  bricks(ctx, X + 26, 26, 30, 70, '#bdb7ab', '#958f84', '#625c52');
  merlons(ctx, X + 25, 26, 32, '#958f84', '#625c52');
  roof(ctx, X + 41, 22, 17, 18);
  flag(ctx, X + 41, 0, '#c0392b');
  windowSlit(ctx, X + 34, 44, true); windowSlit(ctx, X + 45, 44, true);
  windowSlit(ctx, X + 39, 62, false);
  // задняя стена
  bricks(ctx, X + 8, 92, 66, 40, '#bdb7ab', '#958f84', '#625c52');
  merlons(ctx, X + 7, 92, 68, '#958f84', '#625c52');
  // боковые башни
  round(ctx, X + 9, 64, 180, 9);
  roof(ctx, X + 9, 62, 11, 20);
  flag(ctx, X + 9, 34, '#c0392b');
  windowSlit(ctx, X + 7, 90, true); windowSlit(ctx, X + 7, 120, false);
  round(ctx, X + 73, 64, 180, 9);
  roof(ctx, X + 73, 62, 11, 20);
  flag(ctx, X + 73, 34, '#2d5fb8');
  windowSlit(ctx, X + 71, 90, true); windowSlit(ctx, X + 71, 120, false);
  // передняя стена с воротами
  bricks(ctx, X + 18, 132, 46, 48, '#c8c2b6', '#a39d92', '#6e685e');
  merlons(ctx, X + 18, 132, 46, '#a39d92', '#6e685e');
  // надвратная арка
  const gx = CASTLE.gateX, gy = CASTLE.gateY;
  ctx.fillStyle = '#4a443c'; ctx.fillRect(gx - 9, gy - 26, 18, 26);
  ctx.fillRect(gx - 7, gy - 28, 14, 2);
  ctx.fillStyle = '#1a1420'; ctx.fillRect(gx - 7, gy - 24, 14, 24);
  ctx.fillRect(gx - 5, gy - 26, 10, 2);
  // деревянные створки и решётка
  ctx.fillStyle = '#6a4024'; ctx.fillRect(gx - 6, gy - 14, 12, 14);
  ctx.fillStyle = '#4d2d17'; for (let i = -6; i < 6; i += 3) ctx.fillRect(gx + i, gy - 14, 1, 14);
  ctx.fillStyle = '#3a3a44';
  for (let i = -6; i <= 5; i += 3) ctx.fillRect(gx + i, gy - 24, 1, 10);
  for (let j = gy - 24; j < gy - 14; j += 3) ctx.fillRect(gx - 6, j, 12, 1);
  // гербовые знамёна по бокам ворот
  for (const bx of [gx - 19, gx + 13]) {
    ctx.fillStyle = PAL.k; ctx.fillRect(bx - 1, 139, 8, 15);
    ctx.fillStyle = '#b8302a'; ctx.fillRect(bx, 140, 6, 12);
    ctx.fillStyle = '#b8302a'; ctx.fillRect(bx + 1, 152, 4, 1); ctx.fillRect(bx + 2, 153, 2, 1);
    ctx.fillStyle = PAL.y; ctx.fillRect(bx + 2, 143, 2, 5); ctx.fillRect(bx + 1, 144, 4, 2);
  }
  // факелы у ворот
  for (const tx of [gx - 11, gx + 10]) {
    ctx.fillStyle = PAL.o; ctx.fillRect(tx, 160, 2, 2);
    ctx.fillStyle = PAL.y; ctx.fillRect(tx, 159, 1, 1);
  }
}

// ---------- башня (все одинаковые) ----------
export function drawTower(ctx, x, y, level, highlight) {
  x = Math.round(x); y = Math.round(y);
  const base = '#a39d92', light = '#d0cabe', dark = '#6e685e', outline = '#2a2430';
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 10, y - 1, 21, 3);
  // ствол
  ctx.fillStyle = outline; ctx.fillRect(x - 8, y - 24, 17, 25);
  bricks(ctx, x - 7, y - 23, 15, 23, light, base, dark);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x + 3, y - 23, 3, 23);
  // дверь
  ctx.fillStyle = outline; ctx.fillRect(x - 2, y - 7, 5, 7);
  ctx.fillStyle = '#6a4024'; ctx.fillRect(x - 1, y - 6, 3, 6);
  // площадка с зубцами
  ctx.fillStyle = outline; ctx.fillRect(x - 10, y - 28, 21, 5);
  ctx.fillStyle = base; ctx.fillRect(x - 9, y - 27, 19, 3);
  ctx.fillStyle = light; ctx.fillRect(x - 9, y - 27, 19, 1);
  for (let i = -10; i <= 8; i += 4) {
    ctx.fillStyle = outline; ctx.fillRect(x + i, y - 31, 3, 4);
    ctx.fillStyle = base; ctx.fillRect(x + i + 1, y - 30, 1, 2);
  }
  // уровень — золотые звёзды-зарубки на площадке
  for (let l = 0; l < level - 1; l++) {
    ctx.fillStyle = PAL.y; ctx.fillRect(x - 5 + l * 4, y - 20, 3, 2);
    ctx.fillStyle = PAL.Y; ctx.fillRect(x - 5 + l * 4, y - 18, 3, 1);
  }
  if (highlight) {
    ctx.strokeStyle = 'rgba(255,230,140,0.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 10.5, y - 31.5, 22, 34);
  }
}

// пустое место под башню
export function drawSlot(ctx, x, y, hover, t) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 9, y - 4, 19, 6);
  ctx.fillStyle = '#7a7266'; ctx.fillRect(x - 8, y - 5, 17, 5);
  ctx.fillStyle = '#9c9486'; ctx.fillRect(x - 7, y - 5, 15, 2);
  ctx.fillStyle = '#5e584e'; for (let i = -6; i < 8; i += 4) ctx.fillRect(x + i, y - 3, 1, 3);
  const pulse = hover ? 1 : (Math.sin(t * 3) * 0.5 + 0.5) * 0.6 + 0.2;
  ctx.fillStyle = `rgba(255,220,120,${pulse})`;
  ctx.fillRect(x - 1, y - 12, 3, 1); ctx.fillRect(x, y - 13, 1, 3);
}
