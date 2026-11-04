import * as C from './config.js';
import { Game } from './game.js';
import { sprite } from './sprites.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), stage = $('stage'), popup = $('popup'), overlay = $('overlay');
const params = new URLSearchParams(location.search);

// ---------- мелкие пиксельные иконки интерфейса ----------
const ICONS = {
  coin:   ['..yyyy...', '.yYyyyy..', 'yYyYYyyy.', 'yYyYyyyY.', 'yYyYYyyY.', 'yYyyyyyY.', '.yYYYYY..', '..YYYY...'],
  heart:  ['.rr..rr..', 'rwrrrrrR.', 'rrrrrrrR.', 'rrrrrrrR.', '.rrrrrR..', '..rrrR...', '...rR....'],
  meteor: ['......oy.', '.....oyy.', '...RRoo..', '..RooR...', '.RooyR...', '.RoyyR...', '.RRooR...', '..RRR....'],
  frost:  ['....c....', '.c..c..c.', '..c.c.c..', '...ccc...', 'ccccwcccc', '...ccc...', '..c.c.c..', '.c..c..c.', '....c....'],
  bolt:   ['.....yy..', '....yy...', '...yy....', '..yyyyy..', '....yy...', '...yy....', '..yy.....', '.y.......'],
};
const ICOL = { y: '#f3c843', Y: '#9a6b1c', r: '#e0443a', R: '#7a1f1a', w: '#ffffff', o: '#f08a2a', c: '#9ae4ff' };
document.querySelectorAll('canvas[data-icon]').forEach(c => {
  const x = c.getContext('2d');
  ICONS[c.dataset.icon].forEach((row, j) => [...row].forEach((ch, i) => { if (ICOL[ch]) { x.fillStyle = ICOL[ch]; x.fillRect(i, j, 1, 1); } }));
});
function unitIcon(key, size = 20) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const s = sprite(key), x = c.getContext('2d');
  x.drawImage(s, Math.floor((size - s.width) / 2), Math.floor((size - s.height) / 2));
  return c;
}

// ---------- игра ----------
let dirty = true;
const game = new Game(cv, (ev, data) => {
  if (ev === 'change') dirty = true;
  if (ev === 'wave') showBanner(data);
  if (ev === 'end') showEnd(data);
});
window.__game = game;

// ---------- размер ----------
function fit() {
  const top = $('top').offsetHeight, bottom = $('bottom').offsetHeight;
  const availW = $('app').clientWidth - 4;
  const availH = window.innerHeight - top - bottom - 30;
  let s = Math.min(availW / C.W, availH / C.H);
  if (s >= 2) s = Math.floor(s * 2) / 2;
  s = Math.max(0.6, s);
  cv.style.width = Math.floor(C.W * s) + 'px';
  cv.style.height = Math.floor(C.H * s) + 'px';
  $('app').style.maxWidth = Math.floor(C.W * s) + 4 + 'px';
}
window.addEventListener('resize', fit);

// ---------- HUD ----------
function refreshHud() {
  $('gold').textContent = Math.floor(game.gold);
  $('lives').textContent = Math.max(0, game.lives);
  const wi = game.waveIdx;
  const w = C.WAVES[Math.max(0, wi)];
  if (wi < 0) $('wave').innerHTML = `Подготовка · первая волна: <b>${C.ENEMIES[C.WAVES[0].type].name}</b>`;
  else $('wave').innerHTML = `Волна <b>${wi + 1}/${C.WAVES.length}</b> · ${C.ENEMIES[w.type].name}`;
  const next = $('next');
  next.disabled = !game.canCallWave() || game.phase === 'prep';
  if (game.phase === 'break') {
    const n = C.WAVES[wi + 1];
    next.textContent = `${C.ENEMIES[n.type].name} через ${Math.ceil(game.breakT)} с ▸ +${C.EARLY_BONUS}`;
  } else if (game.phase === 'final') next.textContent = 'Последняя волна';
  else next.textContent = 'Волна идёт';
  $('speed').textContent = '×' + game.speed;
  $('speed').classList.toggle('on', game.speed > 1);
  $('pause').textContent = game.paused ? 'Играть' : 'Пауза';
  $('pause').classList.toggle('on', game.paused);
  $('manaFill').style.width = (game.mana / C.MANA_MAX * 100) + '%';
  $('manaNum').textContent = Math.floor(game.mana);
  for (const k of Object.keys(C.SPELLS)) {
    const b = $('sp-' + k);
    b.disabled = game.mana < C.SPELLS[k].mana || game.phase === 'over' || game.phase === 'prep';
    b.classList.toggle('on', game.targeting === k || (k === 'slow' && game.slowT > 0) || (k === 'haste' && game.hasteT > 0));
  }
  if (game.targeting === 'meteor') $('hint').textContent = 'Выбери место удара метеора. Esc — отмена';
  else $('hint').textContent = 'Нажми на каменную площадку, чтобы поставить башню · 1 2 3 — заклинания';
  if (!popup.hidden) renderPopup(true);
}

// ---------- меню башни ----------
function openPopup(i) {
  game.selected = i;
  popup.hidden = false;
  renderPopup();
}
function closePopup() { game.selected = -1; popup.hidden = true; }

function renderPopup(soft) {
  const t = game.towers[game.selected];
  if (!t) return closePopup();
  if (soft) { // обновить только доступность кнопок
    popup.querySelectorAll('[data-cost]').forEach(b => { b.disabled = game.gold < +b.dataset.cost; });
    return;
  }
  popup.innerHTML = '';
  if (!t.unit) {
    popup.insertAdjacentHTML('beforeend', '<h3>Построить башню</h3><p>Выбери защитника на вершину</p><div class="units"></div>');
    const grid = popup.querySelector('.units');
    for (const k of C.UNIT_ORDER) {
      const u = C.UNITS[k];
      const b = document.createElement('button');
      b.className = 'unit'; b.dataset.cost = u.cost; b.title = u.desc;
      b.append(unitIcon(k));
      b.insertAdjacentHTML('beforeend', `<span>${u.name}</span><span class="cost">${u.cost} з.</span>`);
      b.disabled = game.gold < u.cost;
      b.onclick = () => { if (game.build(t.i, k)) closePopup(); };
      grid.append(b);
    }
  } else {
    const u = C.UNITS[t.unit], s = game.stats(t);
    const nl = u.levels[t.level];
    const diff = (a, b) => (b !== undefined && b !== a) ? ` <i>→ ${b}</i>` : '';
    const rateTxt = r => (1 / r).toFixed(1);
    popup.insertAdjacentHTML('beforeend', `<h3>${u.name} · ур. ${t.level}</h3><p>${u.desc}</p>
      <dl class="stats">
        <dt>Урон</dt><dd>${s.dmg}${s.dps ? ' + ' + s.dps + '/с' : ''}${nl ? diff(s.dmg, nl.dmg) : ''}</dd>
        <dt>Дальность</dt><dd>${s.range}${nl ? diff(s.range, nl.range) : ''}</dd>
        <dt>Атак в сек.</dt><dd>${rateTxt(s.rate)}${nl ? diff(rateTxt(s.rate), rateTxt(nl.rate)) : ''}</dd>
      </dl><div class="row"></div>`);
    const row = popup.querySelector('.row');
    const up = document.createElement('button');
    up.className = 'primary';
    if (nl) { up.textContent = `Улучшить ${nl.cost}`; up.dataset.cost = nl.cost; up.disabled = game.gold < nl.cost; up.onclick = () => { game.upgrade(t.i); renderPopup(); }; }
    else { up.textContent = 'Макс. уровень'; up.disabled = true; }
    const sell = document.createElement('button');
    sell.className = 'danger'; sell.textContent = `Продать +${game.sellValue(t)}`;
    sell.onclick = () => { game.sell(t.i); closePopup(); };
    row.append(up, sell);
  }
  // позиция рядом с башней
  const sx = cv.clientWidth / C.W, sy = cv.clientHeight / C.H;
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  let x = t.x * sx + 16 * sx, y = (t.y - 40) * sy;
  if (x + pw > cv.clientWidth - 4) x = t.x * sx - 16 * sx - pw;
  x = Math.max(4, Math.min(cv.clientWidth - pw - 4, x));
  y = Math.max(4, Math.min(cv.clientHeight - ph - 4, y));
  popup.style.left = x + 'px'; popup.style.top = y + 'px';
}

// ---------- ввод ----------
function toGame(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * C.W, y: (ev.clientY - r.top) / r.height * C.H };
}
cv.addEventListener('pointermove', ev => { const p = toGame(ev); game.mouse = p; game.hover = game.slotAt(p.x, p.y); });
cv.addEventListener('pointerleave', () => { game.hover = -1; game.mouse = null; });
cv.addEventListener('click', ev => {
  const p = toGame(ev);
  if (game.phase === 'over') return;
  if (game.targeting === 'meteor') { game.cast('meteor', p.x, p.y); return; }
  const i = game.slotAt(p.x, p.y);
  if (i >= 0 && i !== game.selected) openPopup(i); else closePopup();
});
document.querySelectorAll('.spell').forEach(b => b.onclick = () => {
  const k = b.dataset.spell;
  if (game.targeting === k) { game.targeting = null; dirty = true; return; }
  closePopup(); game.cast(k);
});
$('next').onclick = () => game.callWave();
$('speed').onclick = () => { game.speed = game.speed === 1 ? 2 : 1; dirty = true; };
$('pause').onclick = () => { game.paused = !game.paused; dirty = true; };
window.addEventListener('keydown', ev => {
  if (ev.key === ' ') { ev.preventDefault(); game.paused = !game.paused; dirty = true; }
  if (ev.key === 'Escape') { game.targeting = null; closePopup(); dirty = true; }
  for (const [k, sp] of Object.entries(C.SPELLS)) if (ev.key === sp.key && !$('sp-' + k).disabled) { closePopup(); game.cast(k); }
});

// ---------- баннер волны ----------
function showBanner(d) {
  const old = stage.querySelector('#banner'); if (old) old.remove();
  const b = document.createElement('div');
  b.id = 'banner'; if (d.boss) b.className = 'boss';
  b.innerHTML = `Волна ${d.idx + 1}: ${d.name}<small>${d.boss ? 'Босс идёт к замку!' : 'Отряд ×' + d.count + ' идёт колонной'}</small>`;
  stage.append(b);
  setTimeout(() => b.remove(), 2500);
}

// ---------- экраны ----------
function showStart() {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card">
    <h1>Стражи Рубежа</h1>
    <p class="lead">Орда идёт к замку по лесной дороге. Строй каменные башни и сажай на них защитников.</p>
    <div class="roster"></div>
    <ul>
      <li>Нажми на каменную площадку у дороги и выбери защитника</li>
      <li>Нажми на готовую башню, чтобы улучшить или продать её</li>
      <li>6 волн, в каждой один вид врагов. Последним идёт тролль-вождь</li>
      <li>Мана копится сама: Метеор, Мороз и Ускорение внизу экрана</li>
    </ul>
    <button class="primary" id="go">В бой</button>
  </div>`;
  const roster = overlay.querySelector('.roster');
  for (const k of C.UNIT_ORDER) roster.append(unitIcon(k));
  $('go').onclick = () => {
    overlay.hidden = true;
    game.phase = 'break'; game.breakT = 20;
    dirty = true;
  };
}
function showEnd(r) {
  closePopup();
  const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card">
    <h1 class="${r.win ? '' : 'lose'}">${r.win ? 'Замок выстоял!' : 'Замок пал'}</h1>
    <p class="lead">${r.win ? (r.bossLeaked ? 'Тролль проломил ворота, но стены устояли. Попробуй сразить его до ворот.' : 'Тролль-вождь повержен, орда отступает.') : 'Орда прорвалась через ворота. Попробуй другую расстановку.'}</p>
    <ul><li>Время боя: ${mm}:${ss}</li><li>Врагов повержено: ${r.kills}</li><li>Жизней замка осталось: ${r.lives}</li></ul>
    <button class="primary" id="again">Играть снова</button>
  </div>`;
  $('again').onclick = () => { game.reset(); showStart(); };
}

// ---------- цикл ----------
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (autoplay) autoStep();
  game.update(dt);
  game.draw();
  hudT += dt;
  if (dirty || hudT > 0.2) { refreshHud(); dirty = false; hudT = 0; }
  requestAnimationFrame(frame);
}

// ---------- автоигра для проверки: ?autoplay&speed=8 ----------
const autoplay = params.has('autoplay');
const PLAN = [[1, 'archer'], [4, 'lich'], [3, 'cyclops'], [5, 'dragon'], [6, 'archer'], [0, 'archer'], [2, 'lich'], [7, 'cyclops']];
function autoStep() {
  if (game.phase === 'prep') { overlay.hidden = true; game.phase = 'break'; game.breakT = 2; }
  if (params.has('nobuild')) return;
  const nextBuild = PLAN.find(([i]) => !game.towers[i].unit);
  if (nextBuild) game.build(nextBuild[0], nextBuild[1]);
  else for (const t of game.towers) if (t.unit && game.upgrade(t.i)) break;
  if (game.mana >= 80 && game.enemies.length) {
    const e = game.enemies.reduce((a, b) => (a.d > b.d ? a : b));
    game.cast('meteor', e.x, e.y);
  }
}

fit();
showStart();
if (autoplay) { game.speed = +(params.get('speed') || 4); }
fit();
requestAnimationFrame(frame);
