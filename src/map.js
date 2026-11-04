import { image, drawAt, PIX } from './sprites.js';
import { cell } from './fx.js';


// Координаты сняты с картинки фона (1774×887) и переведены в логические 480×240
const Z = 1774 / 480;
const fromArt = pts => pts.map(([x, y]) => [x / Z, y / Z]);

// Маршрут врагов по каменной дороге: от левого края к воротам замка
export const PATH = fromArt([
  [-40, 425], [290, 440], [350, 490], [395, 570], [430, 640], [490, 680], [590, 688], [660, 670],
  [690, 620], [670, 570], [610, 525], [540, 495], [495, 460], [490, 410], [520, 370], [580, 358],
  [650, 370], [710, 420], [745, 490], [790, 550], [850, 575], [920, 555], [970, 490], [1010, 420],
  [1060, 375], [1130, 370], [1200, 400], [1250, 460], [1310, 515], [1400, 530], [1500, 515], [1595, 478],
  [1606, 446], [1614, 418], // в открытые ворота замка
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
// Фон ужимается до той же пиксельной сетки PIX, что персонажи и башни (800×400 клеток),
// чтобы зерно у всего на экране было одинаковым. Сами персонажи и башни не меняются.
export function renderBackground() {
  const full = renderBackgroundFull();
  const c = document.createElement('canvas');
  c.width = Math.round(480 / PIX); c.height = Math.round(full.height / full.width * 480 / PIX);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  paintOpenGate(ctx);
  return c;
}

// Открытые ворота замка, нарисованные по клеткам сетки прямо на фоне (1 пиксель = 1 клетка PIX).
// Форма проёма снята с арки на фоне: полукруглый свод, низ скошен по перспективе стены.
// Внутри: проход вглубь, освещённый откос слева, распахнутая створка справа, поднятая решётка под сводом.
function paintOpenGate(ctx) {
  const U = 1 / PIX; // клеток на логическую единицу
  const cx = 435.8 * U, top = 95 * U, r = 10.6 * U, x0 = cx - r, x1 = cx + r;
  const floorY = x => (124 + (x * PIX - (435.8 - 10.6)) * 0.33) * U;
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const inside = (x, y) => {
    if (x < x0 + 1 || x > x1 - 1 || y > floorY(x)) return false;
    if (y < top + r) return Math.hypot(x - cx, y - (top + r)) < r - 0.6;
    return y >= top;
  };
  const DARK = [9, 8, 13], LIT = [46, 36, 30];
  for (let y = Math.floor(top); y <= Math.ceil(floorY(x1)); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const fy = floorY(x + 0.5), depth = Math.min(1, Math.max(0, (y - top) / (fy - top)));
      let col = mix(DARK, LIT, Math.pow(depth, 2.2) * 0.8);          // в глубине темно, у порога отсвет факелов
      const lx = x - x0, rx = x1 - x;
      if (fy - y < 7) {                                               // брусчатка уходит внутрь и темнеет
        const k = 1 - (fy - y) / 7, st = hash(Math.floor(x / 3), Math.floor((y + (Math.floor(x / 3) % 2)) / 2));
        col = (y % 2 === 0 && hash(x, y) > 0.55) ? mix(DARK, [40, 40, 48], k) : mix(DARK, st > 0.5 ? [70, 70, 80] : [58, 58, 68], k * 0.85);
      } else if (lx < 4) {                                            // каменный откос слева, освещён снаружи
        const mortar = (y % 5 === 0) || (lx === 3);
        col = mortar ? [34, 33, 40] : mix([58, 58, 68], [92, 92, 104], depth * 0.8 + (lx === 0 ? 0.15 : 0));
      } else if (rx < 6) {                                            // распахнутая внутрь створка
        const plank = rx % 2 === 0, band = Math.abs(y - (top + (fy - top) * 0.3)) < 1 || Math.abs(y - (top + (fy - top) * 0.72)) < 1;
        col = band ? [38, 38, 44] : mix(plank ? [62, 40, 24] : [78, 52, 30], [22, 15, 10], (1 - depth) * 0.55);
        if (rx === 5) col = [20, 13, 9];                              // тень от кромки створки
        if (band && rx === 1) col = [110, 110, 120];                  // заклёпка
      }
      ctx.fillStyle = rgb(col); ctx.fillRect(x, y, 1, 1);
    }
  }
  // поднятая решётка: железная перекладина под сводом и зубья вниз
  const barY = Math.round(top + 3);
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    if (!inside(x + 0.5, barY + 0.5)) continue;
    ctx.fillStyle = 'rgb(28,29,34)'; ctx.fillRect(x, barY, 1, 2);
    ctx.fillStyle = 'rgb(96,98,110)'; ctx.fillRect(x, barY, 1, 1);
  }
  for (let x = Math.round(x0) + 3; x < x1 - 2; x += 4) {
    if (!inside(x + 0.5, barY + 4)) continue;
    ctx.fillStyle = 'rgb(28,29,34)'; ctx.fillRect(x, barY + 2, 1, 4);
    ctx.fillStyle = 'rgb(120,122,134)'; ctx.fillRect(x, barY + 5, 1, 1);  // острый кончик
  }
}

function renderBackgroundFull() {
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
    ctx.fillStyle = '#2a1a0a'; cell(ctx, bx - PIX, by - PIX, 4.8 + 2 * PIX, 6);
    ctx.fillStyle = '#f3c843'; cell(ctx, bx, by, 4.8, 3.6);
    ctx.fillStyle = '#b8862a'; cell(ctx, bx, by + 3.6, 4.8, 1.2);
    ctx.fillStyle = '#fff3a0'; cell(ctx, bx, by, 2.4, PIX);
  }
}

// пустая башня: золотой «плюс» над площадкой подсказывает, что сюда можно посадить защитника
export function drawSlot(ctx, x, top, hover, t) {
  // плюс стоит на месте и плавно «дышит» яркостью — без рывков по пиксельной сетке
  const a = hover ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2));
  const y = top - 7;
  ctx.fillStyle = `rgba(40,24,6,${a})`;
  cell(ctx, x - 4.8, y - 1.8, 9.6, 3.6); cell(ctx, x - 1.8, y - 4.8, 3.6, 9.6);
  ctx.fillStyle = `rgba(255,214,90,${a})`;
  cell(ctx, x - 3.6, y - 0.6, 7.2, 1.2); cell(ctx, x - 0.6, y - 3.6, 1.2, 7.2);
}
