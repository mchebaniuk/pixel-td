// Картинки персонажей и карты (нарезаны из арта Gemini, лежат в assets/).
// Логика игры работает в координатах 480×289, холст — 1036×624 (SCALE раз больше).

export const SCALE = 1036 / 480;
// спрайты хранятся в 3 раза крупнее игрового размера — для чёткости на плотных экранах
const RES = 3;
const ZOOM = 0.9; // общий масштаб персонажей на карте
const UNIT = SCALE * RES / ZOOM; // пикселей картинки на логическую единицу
// Размер одного «пикселя» арта в логических единицах — такой же, как у нарисованного фона.
// Персонажи и башня при загрузке ужимаются до этой сетки, поэтому всё на экране одного «зерна».
export const PIX = 0.6;
const RAW = ['bg_hd', 'foundation_hd']; // фон уже нарисован в нужном зерне
const LIGHTEN = { gargoyle: 1.22 }; // тёмно-серую гаргулью чуть высветлить
const NO_NIGHT = ['tower', 'gargoyle']; // без ночной тонировки: башня подогнана под замок, гаргулья должна быть видна на дороге

const NAMES = ['bg_hd.jpg', 'foundation_hd', 'tower', 'archer', 'cyclops', 'cyclops_empty', 'lich', 'dragon',
  'skeleton', 'goblin', 'wolf', 'gargoyle', 'orc', 'troll'];

// в какую сторону смотрит персонаж на исходной картинке
const FACES_LEFT = {}; // все персонажи на исходных картинках смотрят вправо

const imgs = {};   // персонажи — уже ужатые до сетки PIX
const dims = {};   // их размер на карте в логических единицах
const cache = {};
let prescale = 1; // во сколько раз заранее увеличить спрайты (под плотность экрана)

export function loadAssets() {
  return Promise.all(NAMES.map(file => new Promise((resolve, reject) => {
    const n = file.replace(/\..*$/, '');
    const i = new Image();
    i.onload = () => {
      dims[n] = { w: i.width / UNIT, h: i.height / UNIT };
      imgs[n] = RAW.includes(n) ? i : pixelate(i, Math.round(dims[n].w / PIX), Math.round(dims[n].h / PIX));
      if (!RAW.includes(n) && !NO_NIGHT.includes(n)) nightGrade(imgs[n]);
      if (LIGHTEN[n]) lighten(imgs[n], LIGHTEN[n]);
      resolve();
    };
    i.onerror = () => reject(new Error(`Не загрузилась картинка assets/${file}`));
    i.src = `assets/${file.includes('.') ? file : file + '.png'}`;
  })));
}

// Уменьшает картинку до gw×gh пикселей усреднением по квадратикам (с учётом прозрачности),
// а край делает резким: пиксель либо целиком виден, либо пуст.
function pixelate(img, gw, gh) {
  const sc = document.createElement('canvas');
  sc.width = img.width; sc.height = img.height;
  const sx = sc.getContext('2d', { willReadFrequently: true });
  sx.drawImage(img, 0, 0);
  const src = sx.getImageData(0, 0, img.width, img.height).data;
  const out = document.createElement('canvas');
  out.width = gw; out.height = gh;
  const ox = out.getContext('2d', { willReadFrequently: true }); // пиксели потом читаются для тонировки и рассыпания
  const dst = ox.createImageData(gw, gh), d = dst.data;
  const kx = img.width / gw, ky = img.height / gh;
  for (let y = 0; y < gh; y++) {
    const y0 = Math.floor(y * ky), y1 = Math.max(y0 + 1, Math.floor((y + 1) * ky));
    for (let x = 0; x < gw; x++) {
      const x0 = Math.floor(x * kx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * kx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
        const o = (j * img.width + i) * 4, al = src[o + 3];
        r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al; n++;
      }
      const o = (y * gw + x) * 4;
      if (a / n < 110) continue; // почти пустой квадратик — прозрачный
      d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = 255;
    }
  }
  ox.putImageData(dst, 0, 0);
  return out;
}

// Ночная тонировка персонажей под освещение фона: слишком светлые (белый жрец) приглушаются сильнее,
// всем добавляется лёгкий холодный оттенок ночи. Контраст внутри картинки сохраняется.
const NIGHT_TARGET = 78;
function nightGrade(c) {
  const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  let sum = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { sum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; n++; }
  const k = Math.min(1, Math.max(0.62, Math.pow(NIGHT_TARGET / (sum / n), 0.6)));
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    p[i] = p[i] * k * 0.95; p[i + 1] = p[i + 1] * k * 0.97; p[i + 2] = Math.min(255, p[i + 2] * k * 1.04);
  }
  x.putImageData(d, 0, 0);
}

function lighten(c, k) {
  const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k * 1.04); }
  x.putImageData(d, 0, 0);
}

export function image(name) { return imgs[name]; }

// картинка спрайта для интерфейса (портреты в панели), в том же пиксельном зерне
const urls = {};
export function spriteURL(name) { return urls[name] || (urls[name] = imgs[name].toDataURL()); }

// размер спрайта в логических единицах
export function size(name) { return { ...dims[name] }; }

// pxPerUnit — сколько экранных пикселей приходится на логическую единицу
export function setPixelDensity(pxPerUnit) {
  const k = Math.max(1, Math.ceil(pxPerUnit * PIX));
  if (k !== prescale) { prescale = k; for (const key in cache) delete cache[key]; }
}

// sprite('goblin', true) — смотрит влево; white — белый силуэт для вспышки при попадании.
// Спрайт заранее увеличивается «квадратиками» в prescale раз, поэтому при выводе остаётся чётким.
export function sprite(name, faceLeft = false, white = false) {
  const flip = faceLeft !== !!FACES_LEFT[name];
  const key = `${name}|${flip}|${white}`; // white: true — белый силуэт, строка — силуэт этого цвета
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
    x.fillStyle = typeof white === 'string' ? white : '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  }
  cache[key] = c;
  return c;
}

// рисует спрайт так, чтобы его нижний центр стоял в точке (x, y).
// opts: faceLeft, white, rot (поворот вокруг ног), sx/sy (растяжение), alpha, dx/dy (сдвиг)
export function drawAt(ctx, name, x, y, o = {}) {
  const c = sprite(name, o.faceLeft, o.white);
  const { w, h } = dims[name];
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

// светящаяся обводка: силуэт цвета color, сдвинутый на клетку во все стороны, под основным рисунком
export function drawRigOutline(ctx, name, x, y, o, parts, color, alpha = 1) {
  const oo = { ...o, tint: color, white: false, alpha: (o.alpha ?? 1) * alpha };
  for (const [ox, oy] of [[-PIX, 0], [PIX, 0], [0, -PIX], [0, PIX]]) drawRig(ctx, name, x + ox, y + oy, oo, parts);
}

// пиксели картинки персонажа (для рассыпания при гибели): u, v — номер клетки, c — цвет
const pixCache = {};
export function spritePixels(name) {
  if (pixCache[name]) return pixCache[name];
  const c = imgs[name], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, out = [];
  for (let v = 0; v < c.height; v++) for (let u = 0; u < c.width; u++) {
    const o = (v * c.width + u) * 4;
    if (d[o + 3] > 0) out.push({ u, v, c: `rgb(${d[o]},${d[o + 1]},${d[o + 2]})` });
  }
  return (pixCache[name] = { list: out, gw: c.width, gh: c.height, faceLeft: !!FACES_LEFT[name] });
}

// рисует спрайт по частям (см. anim.js): каждая часть со своим сдвигом и растяжением
export function drawRig(ctx, name, x, y, o, parts) {
  const flip = !!o.faceLeft !== !!FACES_LEFT[name];
  const c = sprite(name, o.faceLeft, o.tint || o.white);
  const { w, h } = dims[name];
  ctx.save();
  ctx.translate(x + (o.dx || 0) * (o.faceLeft ? -1 : 1), y + (o.dy || 0));
  if (o.rot) ctx.rotate(o.faceLeft ? -o.rot : o.rot);
  if (o.sx !== undefined && o.sx !== 1) ctx.scale(o.sx, 1); // сжатие по ширине — плавный разворот
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const p of parts) {
    let [x0, y0, x1, y1] = p.r;
    if (flip) [x0, x1] = [1 - x1, 1 - x0];
    const sy = p.sy ?? 1, ph = (y1 - y0) * h;
    const sx = p.sx ?? 1, pw = (x1 - x0) * w;
    const top = -h + y0 * h + (p.pivot === 'bottom' ? ph * (1 - sy) : 0);
    const dx = (p.dx || 0) * (o.faceLeft ? -1 : 1);
    // pivotX — край, за который часть «прикреплена» (для крыла — плечо); при отражении край меняется
    const anchor = flip ? { left: 'right', right: 'left' }[p.pivotX] : p.pivotX;
    const left = -w / 2 + x0 * w + (anchor === 'right' ? pw * (1 - sx) : 0);
    if (p.rot) { // часть поворачивается вокруг точки крепления p.at (доли картинки, как r), например рука — вокруг плеча
      const ax = -w / 2 + (flip ? 1 - p.at[0] : p.at[0]) * w + dx, ay = -h + p.at[1] * h + (p.dy || 0);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(o.faceLeft ? -p.rot : p.rot);
      ctx.drawImage(c, x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height,
        left + dx - ax, top + (p.dy || 0) - ay, pw * sx, ph * sy);
      ctx.restore();
      continue;
    }
    ctx.drawImage(c, x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height,
      left + dx, top + (p.dy || 0), pw * sx, ph * sy);
  }
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
  const s = String(str), P = PIX * 2; // пиксель шрифта — 2 клетки общей сетки
  const totalW = (s.length * 4 - 1) * P;
  let cx = Math.round((x - totalW / 2) / PIX) * PIX;
  y = Math.round(y / PIX) * PIX;
  for (const ch of s) {
    const bits = DIGITS[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] !== '1') continue;
        const px = cx + (i % 3) * P, py = y + Math.floor(i / 3) * P;
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(px + PIX, py + PIX, P, P);
        ctx.fillStyle = color;
        ctx.fillRect(px, py, P, P);
      }
    }
    cx += 4 * P;
  }
}
