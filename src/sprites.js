// Картинки персонажей и карты (нарезаны из арта Gemini, лежат в assets/).
// Логика игры работает в координатах 480×289, холст — 1036×624 (SCALE раз больше).

export const SCALE = 1036 / 480;

const NAMES = ['bg', 'foundation', 'tower', 'archer', 'cyclops', 'lich', 'dragon',
  'skeleton', 'goblin', 'wolf', 'gargoyle', 'orc', 'troll'];

// в какую сторону смотрит персонаж на исходной картинке
const FACES_LEFT = { troll: true };

const imgs = {};
const cache = {};

export function loadAssets() {
  return Promise.all(NAMES.map(n => new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => { imgs[n] = i; resolve(); };
    i.onerror = () => reject(new Error(`Не загрузилась картинка assets/${n}.png`));
    i.src = `assets/${n}.png`;
  })));
}

export function image(name) { return imgs[name]; }

// размер спрайта в логических единицах
export function size(name) { return { w: imgs[name].width / SCALE, h: imgs[name].height / SCALE }; }

// sprite('goblin', true) — смотрит влево; white — белый силуэт для вспышки при попадании
export function sprite(name, faceLeft = false, white = false) {
  const flip = faceLeft !== !!FACES_LEFT[name];
  const key = `${name}|${flip}|${white}`;
  if (cache[key]) return cache[key];
  const src = imgs[name];
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  if (flip) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(src, 0, 0);
  if (white) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  }
  cache[key] = c;
  return c;
}

// рисует спрайт так, чтобы его нижний центр стоял в точке (x, y)
export function drawAt(ctx, name, x, y, opts = {}) {
  const c = sprite(name, opts.faceLeft, opts.white);
  const w = c.width / SCALE, h = c.height / SCALE;
  ctx.drawImage(c, Math.round((x - w / 2) * SCALE) / SCALE, Math.round((y - h) * SCALE) / SCALE, w, h);
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
