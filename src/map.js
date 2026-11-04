import { image, drawAt } from './sprites.js';


// Координаты сняты с картинки фона (1456×720) и переведены в логические 480×237
const Z = 1456 / 480;
const fromArt = pts => pts.map(([x, y]) => [x / Z, y / Z]);

// Маршрут врагов по каменной дороге: от левого края к воротам замка
export const PATH = fromArt([
  [-40, 402], [170, 402], [220, 425], [240, 480], [275, 530], [330, 548], [480, 545], [525, 520],
  [540, 465], [570, 420], [640, 405], [710, 415], [745, 460], [770, 530], [830, 560], [1080, 560],
  [1140, 535], [1165, 480], [1190, 430], [1250, 412], [1315, 402],
]);

// Места под башни: центры каменных фундаментов на фоне
export const SLOTS = fromArt([
  [268, 333], [472, 340], [697, 318], [910, 333], [1122, 325], [1030, 470], [410, 488],
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
  ctx.beginPath(); ctx.ellipse(x, y, 17, 11, 0, 0, Math.PI * 2); ctx.stroke();
}
