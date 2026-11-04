import * as C from './config.js';
import { Game } from './game.js';
import { loadAssets } from './sprites.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), stage = $('stage'), overlay = $('overlay');
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
const portrait = k => `<img src="assets/${k}.png" alt="">`;

// ---------- состояние интерфейса ----------
let game, dirty = true, pick = null;

// ---------- размер ----------
function fit() {
  const top = $('top').offsetHeight, bottom = $('bottom').offsetHeight;
  const availW = document.body.clientWidth - 32;
  const availH = window.innerHeight - top - bottom - 34;
  const s = Math.max(0.3, Math.min(availW / cv.width, availH / cv.height));
  cv.style.width = Math.floor(cv.width * s) + 'px';
  cv.style.height = Math.floor(cv.height * s) + 'px';
  $('app').style.maxWidth = Math.max(Math.floor(cv.width * s), 680) + 'px';
}
window.addEventListener('resize', fit);

// ---------- панель постройки ----------
function buildUnitButtons() {
  const box = $('units');
  for (const k of C.UNIT_ORDER) {
    const u = C.UNITS[k];
    const b = document.createElement('button');
    b.className = 'unit'; b.id = 'u-' + k; b.title = u.desc;
    b.innerHTML = `<div class="pic">${portrait(k)}</div><span>${u.name}</span><span class="cost">${u.cost}</span>`;
    b.onclick = () => {
      const t = game.towers[game.selected];
      if (t && !t.unit) { game.build(t.i, k); pick = null; }
      else pick = pick === k ? null : k;
      dirty = true;
    };
    box.append(b);
  }
}

// ---------- HUD ----------
function refreshHud() {
  $('gold').textContent = Math.floor(game.gold);
  $('lives').textContent = `${Math.max(0, game.lives)}/${C.START_LIVES}`;
  const wi = game.waveIdx;
  if (wi < 0) $('wave').innerHTML = `Волна <b>0/${C.WAVES.length}</b>`;
  else $('wave').innerHTML = `Волна <b>${wi + 1}/${C.WAVES.length}</b> · ${C.ENEMIES[C.WAVES[wi].type].name}`;
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
  for (const k of C.UNIT_ORDER) {
    const b = $('u-' + k);
    b.disabled = game.gold < C.UNITS[k].cost || game.phase === 'over';
    b.classList.toggle('on', pick === k);
  }
  refreshTowerPanel();
}

function refreshTowerPanel() {
  const t = game.towers[game.selected];
  const up = $('upgrade'), sell = $('sell'), info = $('info');
  if (game.targeting === 'meteor') { info.innerHTML = 'Нажми на карту, куда упадёт <b>метеор</b>. Esc — отмена'; }
  if (!t || !t.unit) {
    up.disabled = sell.disabled = true; up.textContent = 'Улучшить'; sell.textContent = 'Продать';
    if (game.targeting !== 'meteor') {
      info.innerHTML = t ? 'Пустой фундамент. Выбери защитника в панели <b>Постройка</b>'
        : pick ? `Нажми на свободный фундамент, чтобы поставить: <b>${C.UNITS[pick].name}</b>`
        : 'Нажми на фундамент у дороги или на готовую башню';
    }
    return;
  }
  const u = C.UNITS[t.unit], s = game.stats(t), nl = u.levels[t.level];
  const d = (a, b) => (b !== undefined && b !== a ? ` <i>→ ${b}</i>` : '');
  if (game.targeting !== 'meteor') {
    info.innerHTML = `<b>${u.name}</b> · ур. ${t.level}<br>урон ${s.dmg}${nl ? d(s.dmg, nl.dmg) : ''} · дальн. ${s.range}${nl ? d(s.range, nl.range) : ''}`;
  }
  if (nl) { up.textContent = `Улучшить ${nl.cost}`; up.disabled = game.gold < nl.cost; }
  else { up.textContent = 'Макс. уровень'; up.disabled = true; }
  sell.textContent = `Продать +${game.sellValue(t)}`; sell.disabled = false;
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
  if (i < 0) { game.selected = -1; dirty = true; return; }
  const t = game.towers[i];
  if (!t.unit && pick && game.build(i, pick)) { pick = null; game.selected = i; }
  else game.selected = game.selected === i ? -1 : i;
  dirty = true;
});
$('upgrade').onclick = () => { if (game.selected >= 0) game.upgrade(game.selected); };
$('sell').onclick = () => { if (game.selected >= 0) { game.sell(game.selected); } };
document.querySelectorAll('.spell').forEach(b => b.onclick = () => {
  const k = b.dataset.spell;
  if (game.targeting === k) { game.targeting = null; dirty = true; return; }
  game.cast(k);
});
$('next').onclick = () => game.callWave();
$('speed').onclick = () => { game.speed = game.speed === 1 ? 2 : 1; dirty = true; };
$('pause').onclick = () => { game.paused = !game.paused; dirty = true; };
window.addEventListener('keydown', ev => {
  if (ev.key === ' ') { ev.preventDefault(); game.paused = !game.paused; dirty = true; }
  if (ev.key === 'Escape') { game.targeting = null; game.selected = -1; pick = null; dirty = true; }
  for (const [k, sp] of Object.entries(C.SPELLS)) if (ev.key === sp.key && !$('sp-' + k).disabled) game.cast(k);
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
  overlay.innerHTML = `<div class="card frame">
    <h1>Стражи Рубежа</h1>
    <p class="lead">Орда идёт к замку по лесной дороге. Ставь башни на каменные фундаменты и сажай на них защитников.</p>
    <div class="roster">${C.UNIT_ORDER.map(portrait).join('')}</div>
    <ul>
      <li>Нажми на фундамент, затем выбери защитника в панели «Постройка»</li>
      <li>Нажми на готовую башню, чтобы улучшить или продать её</li>
      <li>6 волн, в каждой один вид врагов. Последним идёт тролль-вождь</li>
      <li>Мана копится сама: Метеор, Мороз и Ускорение справа внизу</li>
    </ul>
    <button class="primary" id="go">В бой</button>
  </div>`;
  $('go').onclick = () => { overlay.hidden = true; game.phase = 'break'; game.breakT = 20; dirty = true; };
}
function showEnd(r) {
  game.selected = -1; pick = null;
  const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card frame">
    <h1 class="${r.win ? '' : 'lose'}">${r.win ? 'Замок выстоял!' : 'Замок пал'}</h1>
    <p class="lead">${r.win ? (r.bossLeaked ? 'Тролль проломил ворота, но стены устояли. Попробуй сразить его до ворот.' : 'Тролль-вождь повержен, орда отступает.') : 'Орда прорвалась через ворота. Попробуй другую расстановку.'}</p>
    <ul><li>Время боя: ${mm}:${ss}</li><li>Врагов повержено: ${r.kills}</li><li>Жизней замка осталось: ${r.lives}</li></ul>
    <button class="primary" id="again">Играть снова</button>
  </div>`;
  $('again').onclick = () => { game.reset(); showStart(); };
}

// ---------- автоигра для проверки: ?autoplay&speed=8 ----------
const autoplay = params.has('autoplay');
const PLAN = [[1, 'archer'], [5, 'archer'], [2, 'lich'], [4, 'cyclops'], [0, 'archer'], [3, 'dragon'], [6, 'cyclops']];
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

loadAssets().then(() => {
  game = new Game(cv, (ev, data) => {
    if (ev === 'change') dirty = true;
    if (ev === 'wave') showBanner(data);
    if (ev === 'end') showEnd(data);
  });
  window.__game = game;
  buildUnitButtons();
  fit();
  showStart();
  if (autoplay) game.speed = +(params.get('speed') || 4);
  fit();
  requestAnimationFrame(frame);
}).catch(err => {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card frame"><h1 class="lose">Ошибка загрузки</h1><p class="lead">${err.message}. Обнови страницу.</p></div>`;
});
