import { image, drawAt, PIX } from './sprites.js';
import { cell } from './fx.js';


// Координаты сняты с картинки фона (1774×887) и переведены в логические 480×240
const Z = 1774 / 480;
const fromArt = pts => pts.map(([x, y]) => [x / Z, y / Z]);

// Локации. Координаты маршрута и фундаментов сняты с картинки фона (1774×887) и переводятся в логические 480×240;
// факелы (пламя) и ворота замка (створки — сюда бьют враги, тут трещины) — сразу в логических.
const LEVEL_DEFS = [
  {
    id: 'forest', name: 'Лесная дорога', bg: 'bg_hd', weather: 'flies',
    // маршрут врагов по каменной дороге: от левого края к воротам замка
    path: [
      [-40, 425], [290, 440], [350, 490], [395, 570], [430, 640], [490, 680], [590, 688], [660, 670],
      [690, 620], [670, 570], [610, 525], [540, 495], [495, 460], [490, 410], [520, 370], [580, 358],
      [650, 370], [710, 420], [745, 490], [790, 550], [850, 575], [920, 555], [970, 490], [1010, 420],
      [1060, 375], [1130, 370], [1200, 400], [1250, 460], [1310, 515], [1400, 530], [1500, 515], [1595, 478],
    ],
    // места под башни: центры каменных фундаментов на фоне
    slots: [[293, 323], [618, 297], [880, 323], [1097, 290], [533, 560], [875, 670], [1122, 620]],
    torches: [[20, 86], [390, 109], [438, 140]],
    gate: { x: 424, y: 97, w: 20, h: 20 },
  },
  {
    id: 'snow', name: 'Снежный перевал', bg: 'bg_snow', weather: 'snow',
    path: [
    [-40, 400], [8, 401], [56, 400], [104, 400], [152, 401], [200, 400], [248, 402], [296, 414],
    [344, 434], [392, 457], [440, 464], [488, 451], [536, 424], [584, 402], [632, 399], [680, 406],
    [728, 434], [776, 476], [824, 518], [872, 533], [920, 531], [968, 504], [1016, 457], [1064, 410],
    [1112, 395], [1160, 397], [1208, 412], [1256, 448], [1304, 486], [1352, 514], [1400, 507], [1460, 505],
    [1520, 500], [1565, 493], [1605, 484],
    ],
    slots: [[308, 312], [658, 317], [1092, 312], [288, 508], [655, 578], [926, 628], [1172, 594]],
    torches: [[23.8, 81], [391.5, 110], [440, 138.5]],
    gate: { x: 423, y: 101, w: 22, h: 30 },
  },
];
export const LEVELS = LEVEL_DEFS.map(l => ({ ...l, path: fromArt(l.path), slots: fromArt(l.slots) }));

// текущая локация: эти привязки живые — при setLevel все модули видят новые значения
export let LEVEL, PATH, SLOTS, PATH_LEN, TORCHES, GATE;
// все фундаменты уже нарисованы на фоне
const EXTRA_FOUNDATIONS = [];

// ---------- геометрия пути ----------
let segs = [];
export function setLevel(i) {
  LEVEL = LEVELS[i] || LEVELS[0];
  ({ path: PATH, slots: SLOTS, torches: TORCHES, gate: GATE } = LEVEL);
  segs = [];
  let total = 0;
  for (let k = 0; k < PATH.length - 1; k++) {
    const [x1, y1] = PATH[k], [x2, y2] = PATH[k + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, len, start: total });
    total += len;
  }
  PATH_LEN = total;
}
setLevel(0);

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
  return c;
}

function renderBackgroundFull() {
  const bg = image(LEVEL.bg), f = image('foundation_hd');
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
