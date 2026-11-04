import { image, drawAt } from './sprites.js';


// Координаты сняты с картинки фона (1774×887) и переведены в логические 480×240
const Z = 1774 / 480;
const fromArt = pts => pts.map(([x, y]) => [x / Z, y / Z]);

// Маршрут врагов по каменной дороге: от левого края к воротам замка
export const PATH = fromArt([
  [-40, 425], [290, 440], [350, 490], [395, 570], [430, 640], [490, 680], [590, 688], [660, 670],
  [690, 620], [670, 570], [610, 525], [540, 495], [495, 460], [490, 410], [520, 370], [580, 358],
  [650, 370], [710, 420], [745, 490], [790, 550], [850, 575], [920, 555], [970, 490], [1010, 420],
  [1060, 375], [1130, 370], [1200, 400], [1250, 460], [1310, 515], [1400, 530], [1500, 515], [1595, 478],
]);

// Места под башни: центры каменных фундаментов на фоне
export const SLOTS = fromArt([
  [293, 323], [618, 297], [880, 323], [1097, 290], [533, 560], [875, 670], [1122, 620],
]);
// все фундаменты уже нарисованы на фоне
const EXTRA_FOUNDATIONS = [];

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
  const bg = image('bg_hd'), f = image('foundation_hd');
  const c = document.createElement('canvas');
  c.width = bg.width; c.height = bg.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bg, 0, 0);
  const k = bg.width / 480; // пикселей фона на логическую единицу
  for (const i of EXTRA_FOUNDATIONS) {
    const [x, y] = SLOTS[i];
    ctx.drawImage(f, Math.round(x * k - f.width / 2), Math.round(y * k - f.height / 2));
  }
  return c;
}

// ---------- башня (все одинаковые, из арта) ----------
// высота от точки фундамента до площадки, где стоит защитник
export const TOWER_TOP = 35;

export function drawTower(ctx, x, y, level, highlight) {
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

// пустая башня: золотой «плюс» над площадкой подсказывает, что сюда можно посадить защитника
export function drawSlot(ctx, x, top, hover, t) {
  const a = hover ? 1 : 0.5 + 0.35 * Math.sin(t * 3);
  const y = top - 7 + Math.sin(t * 2.5) * 1.2;
  ctx.fillStyle = `rgba(40,24,6,${a})`;
  ctx.fillRect(x - 4.5, y - 1.5, 9, 3); ctx.fillRect(x - 1.5, y - 4.5, 3, 9);
  ctx.fillStyle = `rgba(255,214,90,${a})`;
  ctx.fillRect(x - 3.5, y - 0.75, 7, 1.5); ctx.fillRect(x - 0.75, y - 3.5, 1.5, 7);
}
