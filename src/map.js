import { image, drawAt, SCALE } from './sprites.js';

// Координаты сняты с картинки фона (1036×624) и переведены в логические 480×289
const Z = SCALE;
const fromArt = pts => pts.map(([x, y]) => [x / Z, y / Z]);

// Маршрут врагов по каменной дороге: от левого края к воротам замка
export const PATH = fromArt([
  [-30, 340], [175, 340], [198, 370], [205, 445], [235, 468], [380, 462], [400, 415],
  [418, 368], [470, 350], [525, 362], [548, 415], [568, 462], [620, 476], [815, 472],
  [845, 435], [868, 392], [915, 372], [972, 348],
]);

// Места под башни: центры каменных фундаментов на фоне
export const SLOTS = fromArt([
  [195, 292], [347, 299], [513, 284], [668, 292], [820, 289], [735, 414], [92, 460],
]);
// у этих мест фундамента на картинке нет, дорисовываем копию
const EXTRA_FOUNDATIONS = [5, 6];

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
  return { x: last[0], y: last[1], dx: 1, dy: 0 };
}

// ---------- фон ----------
export function renderBackground() {
  const bg = image('bg'), f = image('foundation');
  const c = document.createElement('canvas');
  c.width = bg.width * 2; c.height = bg.height * 2;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0, c.width, c.height);
  for (const i of EXTRA_FOUNDATIONS) {
    const [x, y] = SLOTS[i];
    ctx.drawImage(f, Math.round(x * Z - f.width), Math.round(y * Z - f.height), f.width * 2, f.height * 2);
  }
  return c;
}

// ---------- башня (все одинаковые, из арта) ----------
// высота от точки фундамента до площадки, где стоит защитник
export const TOWER_TOP = 39;

export function drawTower(ctx, x, y, level, highlight) {
  if (highlight) ring(ctx, x, y, 'rgba(255,214,90,0.95)');
  drawAt(ctx, 'tower', x, y + 5);
  // уровень — золотые щитки на кладке
  for (let l = 0; l < level - 1; l++) {
    const bx = x - 5 + l * 7, by = y - 20;
    ctx.fillStyle = '#2a1a0a'; ctx.fillRect(bx - 0.5, by - 0.5, 5, 6);
    ctx.fillStyle = '#f3c843'; ctx.fillRect(bx, by, 4, 4);
    ctx.fillStyle = '#b8862a'; ctx.fillRect(bx, by + 4, 4, 1);
    ctx.fillStyle = '#fff3a0'; ctx.fillRect(bx, by, 2, 1);
  }
}

// пустой фундамент: мерцающее кольцо-подсказка
export function drawSlot(ctx, x, y, hover, t) {
  const a = hover ? 1 : (Math.sin(t * 3) * 0.5 + 0.5) * 0.5 + 0.25;
  ring(ctx, x, y, `rgba(255,214,90,${a})`);
  ctx.fillStyle = `rgba(255,236,160,${a})`;
  ctx.fillRect(x - 3, y - 1, 7, 2); ctx.fillRect(x - 1, y - 3, 2, 7);
}

function ring(ctx, x, y, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(x, y, 18, 13, 0, 0, Math.PI * 2); ctx.stroke();
}
