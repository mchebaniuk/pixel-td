import { drawNumber, PIX } from './sprites.js';
import { W, H } from './config.js';

// палитра огня как на концепт-арте: контур, красный, оранжевый, жёлтый, ядро
const FIRE = [['#6e160e', 1, 1], ['#d9401a', 1, 0], ['#ff8c1e', 0.74, 0], ['#ffd23f', 0.48, 0], ['#fff4c0', 0.24, 0]];

// пиксельный круг на сетке огня (клетка = PIX логических единиц, как «пиксель» фона и персонажей)
function disc(c, x, y, r) {
  x /= PIX; y /= PIX; r /= PIX;
  const R = Math.ceil(r), cx = Math.round(x), cy = Math.round(y);
  for (let j = -R; j <= R; j++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - j * j)) + 0.35);
    c.fillRect(cx - w, cy + j, w * 2 + 1, 1);
  }
}

export class FX {
  constructor() { this.parts = []; this.nums = []; this.beams = []; this.shake = 0; }

  burst(x, y, colors, n = 8, speed = 40, life = 0.5, gravity = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: life * (0.6 + Math.random() * 0.6), max: life, c: colors[i % colors.length], g: gravity, s: 1 });
    }
  }
  flame(x, y, vx, vy) {
    const cols = ['#fff3a0', '#f3c843', '#f08a2a', '#d0402e'];
    this.parts.push({ x, y, vx, vy, life: 0.4, max: 0.4, fire: true, cols, g: -14, s: 3 });
  }
  number(x, y, val, color = '#fff') {
    this.nums.push({ x, y, val: Math.round(val), life: 0.8, color });
  }
  // огонь рисуется на маленьком холсте (1 пиксель = PIX логических единиц) и растягивается без сглаживания,
  // поэтому выглядит как пиксель-арт: слои клубов от тёмного контура к светлому ядру
  drawFire(ctx) {
    const fires = this.parts.filter(p => p.fire);
    if (!fires.length) return;
    if (!this.fc) { this.fc = document.createElement('canvas'); this.fc.width = Math.ceil(W / PIX); this.fc.height = Math.ceil(H / PIX); this.fcx = this.fc.getContext('2d'); }
    const c = this.fcx;
    c.clearRect(0, 0, this.fc.width, this.fc.height);
    for (const [col, k, extra] of FIRE) {
      c.fillStyle = col;
      for (const p of fires) {
        if (p.spark) continue;
        const age = 1 - p.life / p.max;
        if (k < 0.5 && age > 0.55 + k) continue;      // яркое ядро только у свежих клубов
        if (k < 0.3 && age > 0.3) continue;
        disc(c, p.x, p.y, (1.4 + age * 2.3) * k + extra * 0.8);
      }
    }
    // искры
    for (const p of fires) if (p.spark) { c.fillStyle = p.life / p.max > 0.5 ? '#fff4c0' : '#ffd23f'; c.fillRect(Math.round(p.x / PIX), Math.round(p.y / PIX), 1, 1); }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85; // сквозь пламя видно врагов
    ctx.drawImage(this.fc, 0, 0, this.fc.width * PIX, this.fc.height * PIX);
    ctx.restore();
  }

  beam(x1, y1, x2, y2) { this.beams.push({ x1, y1, x2, y2, life: 0.18 }); }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.fire) { const d = Math.pow(0.08, dt); p.vx *= d; p.vy *= d; }
    }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const n of this.nums) { n.life -= dt; n.y -= 18 * dt; }
    this.nums = this.nums.filter(n => n.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);
    this.shake = Math.max(0, this.shake - dt * 8);
  }

  draw(ctx) {
    for (const b of this.beams) {
      const a = b.life / 0.18;
      ctx.globalAlpha = a;
      line(ctx, b.x1, b.y1, b.x2, b.y2, '#8a5a12', 3);
      line(ctx, b.x1, b.y1, b.x2, b.y2, '#ffe08a', 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6d0'; ctx.fillRect(Math.round(b.x2) - 1, Math.round(b.y2) - 1, 3, 3);
    }
    for (const p of this.parts) {
      if (p.fire) continue;
      ctx.fillStyle = p.c;
      if (p.fade) ctx.globalAlpha = Math.max(0, p.life / p.max) * p.fade;
      const sz = Math.max(1, Math.round(p.s * 1.7)) * PIX;
      ctx.fillRect(Math.round(p.x / PIX) * PIX, Math.round(p.y / PIX) * PIX, sz, sz);
      ctx.globalAlpha = 1;
    }
    this.drawFire(ctx);
    for (const n of this.nums) {
      ctx.globalAlpha = Math.min(1, n.life * 3);
      drawNumber(ctx, '-' + n.val, n.x, n.y, n.color);
      ctx.globalAlpha = 1;
    }
  }
}

// пиксельная линия (Брезенхем), толщина t
export function line(ctx, x1, y1, x2, y2, color, t = 1) {
  x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
  const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  const o = Math.floor(t / 2);
  for (let guard = 0; guard < 1000; guard++) {
    ctx.fillRect(x1 - o, y1 - o, t, t);
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x1 += sx; }
    if (e2 <= dx) { err += dx; y1 += sy; }
  }
}

// ---------- валун циклопа ----------
// Пиксельный валун 15×13 на общей сетке PIX: бугристый край, тёмный контур, свет сверху-слева,
// трещины и пятна мха. 8 кадров поворота: форма и детали вращаются, а свет остаётся на месте.
const ROCK_W = 15, ROCK_H = 13, ROCK_FRAMES = 8;
const ROCK_PAL = ['#2c2729', '#4f4947', '#736c63', '#9a9284', '#c2baa9'];
const MOSS = ['#4f6a32', '#6f8f43'];
let rockFrames = null;

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

function makeRockFrame(theta) {
  const c = document.createElement('canvas');
  c.width = ROCK_W; c.height = ROCK_H;
  const x = c.getContext('2d');
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const inside = (i, j) => {
    const nx = (i + 0.5 - ROCK_W / 2) / 7.1, ny = (j + 0.5 - ROCK_H / 2) / 6.2;
    const a = Math.atan2(ny, nx) - theta;
    const r = 1 + 0.09 * Math.sin(3 * a + 1.3) + 0.05 * Math.cos(5 * a);
    return nx * nx + ny * ny < r * r * 0.97;
  };
  const L = [-0.52, -0.62, 0.59];
  for (let j = 0; j < ROCK_H; j++) for (let i = 0; i < ROCK_W; i++) {
    if (!inside(i, j)) continue;
    const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
    const nx = (i + 0.5 - ROCK_W / 2) / 7.1, ny = (j + 0.5 - ROCK_H / 2) / 6.2;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    // локальные координаты камня (вращаются вместе с ним) — для трещин и мха
    const u = nx * cs + ny * sn, v = -nx * sn + ny * cs;
    // свет: грани камня — по бугристой нормали, чтобы поверхность была неровной
    const bump = (hash(Math.round(u * 4), Math.round(v * 4)) - 0.5) * 0.35;
    const lvl = nx * L[0] + ny * L[1] + nz * L[2] + bump;
    let col = ROCK_PAL[lvl < 0.05 ? 1 : lvl < 0.38 ? 2 : lvl < 0.72 ? 3 : 4];
    if (Math.abs(v - 0.45 * u + 0.05) < 0.1 && u > -0.55 && u < 0.25) col = ROCK_PAL[1];      // трещина
    if (Math.abs(u + 0.3 * v - 0.42) < 0.08 && v > 0.05 && v < 0.55) col = ROCK_PAL[1];
    if (v < -0.25 && hash(Math.round(u * 7), Math.round(v * 7)) > 0.35) col = MOSS[lvl > 0.55 ? 1 : 0]; // мох
    if (edge) col = ROCK_PAL[0];
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  return c;
}

// frame — любое число (дробная часть отбрасывается), кадры идут по кругу
export function drawBoulder(ctx, cx, cy, frame = 0) {
  if (!rockFrames) rockFrames = Array.from({ length: ROCK_FRAMES }, (_, i) => makeRockFrame(i * Math.PI * 2 / ROCK_FRAMES));
  const f = rockFrames[((Math.floor(frame) % ROCK_FRAMES) + ROCK_FRAMES) % ROCK_FRAMES];
  const w = ROCK_W * PIX, h = ROCK_H * PIX;
  const x = Math.round((cx - w / 2) / PIX) * PIX, y = Math.round((cy - h / 2) / PIX) * PIX;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f, x, y, w, h);
  ctx.restore();
}
