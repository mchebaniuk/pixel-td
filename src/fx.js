import { drawNumber } from './sprites.js';

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
    this.parts.push({ x, y, vx, vy, life: 0.45, max: 0.45, fire: true, cols, g: -10, s: 2 });
  }
  number(x, y, val, color = '#fff') {
    this.nums.push({ x, y, val: Math.round(val), life: 0.8, color });
  }
  beam(x1, y1, x2, y2) { this.beams.push({ x1, y1, x2, y2, life: 0.18 }); }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.fire) { p.vx *= 0.96; p.vy *= 0.96; }
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
      line(ctx, b.x1, b.y1, b.x2, b.y2, '#4a2270', 3);
      line(ctx, b.x1, b.y1, b.x2, b.y2, '#c58cff', 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ecd6ff'; ctx.fillRect(Math.round(b.x2) - 1, Math.round(b.y2) - 1, 3, 3);
    }
    for (const p of this.parts) {
      let c = p.c;
      if (p.fire) { const k = 1 - p.life / p.max; c = p.cols[Math.min(3, Math.floor(k * 4))]; }
      ctx.fillStyle = c;
      const s = p.fire ? (p.life / p.max > 0.5 ? 2 : 1) : p.s;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
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
