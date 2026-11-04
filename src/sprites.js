// Картинки персонажей и карты (нарезаны из арта Gemini, лежат в assets/).
// Логика игры работает в координатах 480×289, холст — 1036×624 (SCALE раз больше).

export const SCALE = 1036 / 480;
// спрайты хранятся в 3 раза крупнее игрового размера — для чёткости на плотных экранах
const RES = 3;
const UNIT = SCALE * RES; // пикселей картинки на логическую единицу

const NAMES = ['bg_hd.jpg', 'foundation_hd', 'tower', 'archer', 'cyclops', 'lich', 'dragon',
  'skeleton', 'goblin', 'wolf', 'gargoyle', 'orc', 'troll'];

// в какую сторону смотрит персонаж на исходной картинке
const FACES_LEFT = { troll: true };

const imgs = {};
const cache = {};
let prescale = 1; // во сколько раз заранее увеличить спрайты (под плотность экрана)

export function loadAssets() {
  return Promise.all(NAMES.map(file => new Promise((resolve, reject) => {
    const n = file.replace(/\..*$/, '');
    const i = new Image();
    i.onload = () => { imgs[n] = i; resolve(); };
    i.onerror = () => reject(new Error(`Не загрузилась картинка assets/${file}`));
    i.src = `assets/${file.includes('.') ? file : file + '.png'}`;
  })));
}

export function image(name) { return imgs[name]; }

// размер спрайта в логических единицах
export function size(name) { return { w: imgs[name].width / UNIT, h: imgs[name].height / UNIT }; }

// pxPerUnit — сколько экранных пикселей приходится на логическую единицу
export function setPixelDensity(pxPerUnit) {
  const k = Math.max(1, Math.ceil(pxPerUnit / UNIT));
  if (k !== prescale) { prescale = k; for (const key in cache) delete cache[key]; }
}

// sprite('goblin', true) — смотрит влево; white — белый силуэт для вспышки при попадании.
// Спрайт заранее увеличивается «квадратиками» в prescale раз, поэтому при выводе остаётся чётким.
export function sprite(name, faceLeft = false, white = false) {
  const flip = faceLeft !== !!FACES_LEFT[name];
  const key = `${name}|${flip}|${white}`;
  if (cache[key]) return cache[key];
  const src = imgs[name], k = prescale;
  const c = document.createElement('canvas');
  c.width = src.width * k; c.height = src.height * k;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (flip) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(src, 0, 0, c.width, c.height);
  if (white) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  }
  cache[key] = c;
  return c;
}

// рисует спрайт так, чтобы его нижний центр стоял в точке (x, y).
// opts: faceLeft, white, rot (поворот вокруг ног), sx/sy (растяжение), alpha, dx/dy (сдвиг)
export function drawAt(ctx, name, x, y, o = {}) {
  const c = sprite(name, o.faceLeft, o.white);
  const w = imgs[name].width / UNIT, h = imgs[name].height / UNIT;
  ctx.save();
  ctx.translate(x + (o.dx || 0), y + (o.dy || 0));
  if (o.rot) ctx.rotate(o.rot);
  if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, -w / 2, -h, w, h);
  ctx.restore();
  return { w, h };
}

// Крошечный шрифт 3x5 для цифр урона
const DIGITS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001111', '-': '000000111000000', '+': '000010111010000',
};
export function drawNumber(ctx, str, x, y, color) {
  const s = String(str);
  const totalW = s.length * 4 - 1;
  let cx = Math.round(x - totalW / 2);
  y = Math.round(y);
  for (const ch of s) {
    const bits = DIGITS[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] !== '1') continue;
        const px = cx + (i % 3), py = y + Math.floor(i / 3);
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(px + 0.5, py + 0.5, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    cx += 4;
  }
}
