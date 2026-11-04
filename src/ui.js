import * as C from './config.js';
import { Game } from './game.js';
import { loadAssets, setPixelDensity, spriteURL } from './sprites.js';
import { initAudio, sfx, flame, setMuted, isMuted, setMusicMood } from './audio.js';

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
function paintIcon(c) {
  const x = c.getContext('2d');
  ICONS[c.dataset.icon].forEach((row, j) => [...row].forEach((ch, i) => { if (ICOL[ch]) { x.fillStyle = ICOL[ch]; x.fillRect(i, j, 1, 1); } }));
}
document.querySelectorAll('canvas[data-icon]').forEach(paintIcon);
const icon = name => `<canvas data-icon="${name}" width="9" height="9"></canvas>`;
const portrait = k => `<img src="${spriteURL(k)}" alt="">`;

// ---------- состояние интерфейса ----------
let game, dirty = true, pick = null, hoverUnit = null;

// ---------- размер ----------
function fit() {
  const top = $('top').offsetHeight, bottom = $('bottom').offsetHeight;
  const availW = document.body.clientWidth - 32;
  const availH = window.innerHeight - top - bottom - 34;
  // холст рисуется в реальном разрешении экрана — без размытия при растяжении
  const s = Math.max(0.3, Math.min(availW / C.W, availH / C.H));
  const cssW = Math.floor(C.W * s), cssH = Math.floor(C.H * s);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  if (game) { game.pxScale = cv.width / C.W; setPixelDensity(game.pxScale); }
  $('app').style.maxWidth = Math.max(cssW, 680) + 'px';
}
window.addEventListener('resize', fit);

// ---------- панель постройки ----------
function buildUnitButtons() {
  const box = $('units');
  for (const k of C.UNIT_ORDER) {
    const u = C.UNITS[k];
    const b = document.createElement('button');
    const l1 = u.levels[0], keyN = C.UNIT_ORDER.indexOf(k) + 1;
    b.className = 'unit'; b.id = 'u-' + k;
    b.title = `${u.name} (клавиша ${keyN}): ${u.desc}\nУрон ${l1.dmg} · дальность ${l1.range} · выстрел раз в ${l1.rate} с\n` +
      `${u.air ? 'Бьёт наземных и летающих' : 'Бьёт только наземных'}\nНа 3 уровне: ${u.perk}`;
    b.innerHTML = `<span class="key">${keyN}</span><div class="pic">${portrait(k)}</div><span class="name">${u.name}</span>` +
      `<span class="air ${u.air ? 'yes' : ''}">${u.air ? 'земля + воздух' : 'только земля'}</span><span class="cost">${icon('coin')}${u.cost}</span>`;
    b.querySelectorAll('canvas[data-icon]').forEach(paintIcon);
    b.onmouseenter = () => { hoverUnit = k; dirty = true; };
    b.onmouseleave = () => { hoverUnit = null; dirty = true; };
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
  refreshNextWave();
  if (game.phase === 'break') next.textContent = `Вызвать сейчас ▸ +${C.EARLY_BONUS}`;
  else if (game.phase === 'final') next.textContent = 'Последняя волна';
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
    b.style.setProperty('--charge', Math.min(1, game.mana / C.SPELLS[k].mana).toFixed(3));
    b.classList.toggle('ready', !b.disabled);
    b.classList.toggle('on', game.targeting === k || (k === 'slow' && game.slowT > 0) || (k === 'haste' && game.hasteT > 0));
  }
  for (const k of C.UNIT_ORDER) {
    const b = $('u-' + k);
    b.disabled = game.gold < C.UNITS[k].cost || game.phase === 'over';
    b.classList.toggle('on', pick === k);
  }
  refreshTowerPanel();
}

// анонс следующей волны: кто идёт, сколько, чем опасен и когда
const TRAITS = { // короткая метка, класс цвета, полное пояснение во всплывающей подсказке
  flying: ['✈ летают', 'air', 'Летают — циклоп их не достаёт'],
  armor: ['🛡 броня', 'armor', 'В броне — магия и огонь бьют сильнее стрел и камней'],
  fast: ['» быстрые', 'fast', 'Быстрые — успевают проскочить'],
  regen: ['✚ лечится', 'regen', 'Восстанавливает здоровье'],
  boss: ['☠ босс', 'boss', 'Босс: бьёт по башням и звереет при половине здоровья'],
};
function refreshNextWave() {
  const box = $('nextwave'), n = C.WAVES[game.waveIdx + 1];
  if (!n || game.phase === 'over') { box.hidden = true; return; }
  const e = C.ENEMIES[n.type], tags = [];
  if (e.flying) tags.push(TRAITS.flying);
  if (e.armor >= 0.3) tags.push(TRAITS.armor);
  if (e.speed >= 35) tags.push(TRAITS.fast);
  if (e.boss) tags.push(TRAITS.boss); else if (e.regen) tags.push(TRAITS.regen);
  const counting = game.phase === 'break' && game.enemies.length === 0;
  const when = game.phase === 'prep' ? '' : counting ? `<span class="nw-time">${Math.ceil(game.breakT)} с</span>` : '<span class="nw-wait">следом</span>';
  const html = `<span class="nw-pic">${portrait(n.type)}</span><span class="nw-text"><span class="nw-lbl">Далее</span>` +
    `<span class="nw-name">${e.name}${n.count > 1 ? ` <span class="nw-count">×${n.count}</span>` : ''}</span></span>` +
    tags.map(([t, c, tip]) => `<span class="nw-tag ${c}" title="${tip}">${t}</span>`).join('') + when;
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  box.hidden = false;
}

const stars = n => [1, 2, 3].map(i => `<span class="${i <= n ? '' : 'off'}">★</span>`).join('');
// карточка юнита: портрет, имя, звёзды уровня, характеристики со значками и навык 3 уровня
function unitCard(k, lv, s, nl, extra = '') {
  const u = C.UNITS[k], d = (a, b) => (b !== undefined && b !== a ? ` <i>→ ${b}</i>` : '');
  const perk = lv >= 3 ? `<div class="perk">★ ${u.perk}</div>` : `<div class="perk next">на 3 ур.: ${u.perk}</div>`;
  return `<div class="tpic">${portrait(k)}</div><div>
    <div class="tname">${u.name} <span class="lvl">${lv ? stars(lv) : ''}</span>${extra}</div>
    <div class="stats"><span><em>⚔</em> ${s.dmg}${nl ? d(s.dmg, nl.dmg) : ''}</span><span><em>◎</em> ${s.range}${nl ? d(s.range, nl.range) : ''}</span>` +
    `<span><em>⏱</em> ${s.rate} с</span><span><em>${u.air ? '✈' : '⛰'}</em> ${u.air ? 'и воздух' : 'земля'}</span></div>${perk}</div>`;
}
function setInfo(html, empty) { const info = $('info'); if (info.dataset.html !== html) { info.innerHTML = html; info.dataset.html = html; } info.classList.toggle('empty', !!empty); }

function refreshTowerPanel() {
  const t = game.towers[game.selected];
  const up = $('upgrade'), sell = $('sell');
  if (game.targeting === 'meteor') setInfo('Нажми на карту, куда упадёт <b>метеор</b>. Esc — отмена', true);
  else if (hoverUnit) { const u = C.UNITS[hoverUnit]; setInfo(unitCard(hoverUnit, 0, u.levels[0], null)); }
  if (!t || !t.unit) {
    up.disabled = sell.disabled = true; up.textContent = 'Улучшить'; sell.textContent = 'Продать';
    if (game.targeting !== 'meteor' && !hoverUnit) {
      setInfo(t ? 'Башня пустая. Выбери защитника в панели <b>Постройка</b>'
        : pick ? `Нажми на пустую башню, чтобы поставить: <b>${C.UNITS[pick].name}</b>`
        : 'Нажми на башню, чтобы посадить защитника или улучшить его', true);
    }
    return;
  }
  const u = C.UNITS[t.unit], s = game.stats(t), nl = u.levels[t.level];
  if (game.targeting !== 'meteor' && !hoverUnit) setInfo(unitCard(t.unit, t.level, s, nl, t.stunT > 0 ? ' <span class="stun">оглушён!</span>' : ''));
  if (nl) { up.textContent = `Улучшить · ${nl.cost}`; up.disabled = game.gold < nl.cost; }
  else { up.textContent = 'Макс. уровень'; up.disabled = true; }
  sell.textContent = `Продать · +${game.sellValue(t)}`; sell.disabled = false;
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
// звук: включается после первого действия игрока, выбор «выкл» запоминается
try { setMuted(localStorage.getItem('td-muted') === '1'); } catch (e) { /* хранилище недоступно */ }
function refreshSound() { $('sound').textContent = isMuted() ? 'Звук: выкл' : 'Звук: вкл'; $('sound').classList.toggle('on', !isMuted()); }
function toggleSound() {
  initAudio(); setMuted(!isMuted()); refreshSound();
  try { localStorage.setItem('td-muted', isMuted() ? '1' : '0'); } catch (e) { /* хранилище недоступно */ }
}
$('sound').onclick = toggleSound;
document.addEventListener('pointerdown', () => initAudio());
document.addEventListener('click', ev => { if (ev.target.closest('button') && ev.target.id !== 'sound') sfx('click'); });
refreshSound();
$('speed').onclick = () => { game.speed = game.speed === 1 ? 2 : 1; dirty = true; };
$('pause').onclick = () => { game.paused = !game.paused; dirty = true; };
window.addEventListener('keydown', ev => {
  if (ev.key === ' ') { ev.preventDefault(); game.paused = !game.paused; dirty = true; }
  if (ev.key === 'm' || ev.key === 'M' || ev.key === 'ь' || ev.key === 'Ь') toggleSound();
  if (ev.key === 'Escape') { game.targeting = null; game.selected = -1; pick = null; dirty = true; }
  // клавиши по физическому месту (работают и в русской раскладке): Q/W/E — заклинания, 1–4 — защитники
  for (const [k, sp] of Object.entries(C.SPELLS)) if (ev.code === 'Key' + sp.key.toUpperCase() && !$('sp-' + k).disabled) $('sp-' + k).click();
  const n = /^Digit([1-9])$/.exec(ev.code);
  if (n && C.UNIT_ORDER[n[1] - 1]) { const b = $('u-' + C.UNIT_ORDER[n[1] - 1]); if (!b.disabled) b.click(); }
});

// ---------- баннер волны ----------
function showBanner(d) {
  const old = stage.querySelector('#banner'); if (old) old.remove();
  const b = document.createElement('div');
  b.id = 'banner'; if (d.boss) b.className = 'boss'; if (d.cleared) b.className = 'ok';
  b.innerHTML = d.cleared ? `Волна ${d.idx + 1} отбита!<small>Дальше: ${d.next} — через ${d.wait} с</small>`
    : d.rage ? 'Тролль в ярости!<small>Он ускорился — добивай его</small>'
    : `Волна ${d.idx + 1}: ${d.name}<small>${d.boss ? 'Босс идёт к замку!' : 'Отряд ×' + d.count + ' идёт колонной'}</small>`;
  stage.append(b);
  setTimeout(() => b.remove(), 2500);
}

// ---------- экраны ----------
function showStart() {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card frame">
    <h1>Стражи Рубежа</h1>
    <p class="lead">Орда идёт к замку по лесной дороге. Вдоль неё стоят каменные башни — посади на них защитников.</p>
    <div class="roster">${C.UNIT_ORDER.map(portrait).join('')}</div>
    <ul>
      <li>Нажми на пустую башню с золотым плюсом, затем выбери защитника в панели «Постройка»</li>
      <li>Нажми на башню с защитником, чтобы улучшить или отпустить его за золото</li>
      <li>6 волн, в каждой один вид врагов. Последним идёт тролль-вождь</li>
      <li>Мана копится сама: Метеор, Мороз и Ускорение справа внизу</li>
      <li>На 3 уровне каждый защитник получает особый навык</li>
      <li>Клавиши: 1–4 — защитники, Q/W/E — заклинания, пробел — пауза, M — звук</li>
    </ul>
    <button class="primary" id="go">В бой</button>
  </div>`;
  $('go').onclick = () => { overlay.hidden = true; game.phase = 'break'; game.breakT = 20; dirty = true; };
}
function showEnd(r) {
  game.selected = -1; pick = null;
  const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
  const stars = !r.win ? 0 : r.lives >= C.START_LIVES - 3 ? 3 : r.lives >= C.START_LIVES / 2 ? 2 : 1;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="card frame">
    <h1 class="${r.win ? '' : 'lose'}">${r.win ? 'Замок выстоял!' : 'Замок пал'}</h1>
    <p class="lead">${r.win ? (r.bossLeaked ? 'Тролль проломил ворота, но стены устояли. Попробуй сразить его до ворот.' : 'Тролль-вождь повержен, орда отступает.') : 'Орда прорвалась через ворота. Попробуй другую расстановку.'}</p>
    <div class="stars" aria-label="Оценка: ${stars} из 3">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>
    <ul><li>Время боя: ${mm}:${ss}</li><li>Врагов повержено: ${r.kills}</li><li>Жизней замка осталось: ${r.lives}</li>
      <li>${stars === 3 ? 'Идеальная оборона!' : r.win ? 'Сохрани больше жизней замка, чтобы получить все звёзды' : 'Звёзды дают только за победу'}</li></ul>
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

// музыка: спокойная между волнами, боевая во время волны, тяжёлая на боссе, тишина на финальном экране
function musicMood() {
  if (game.phase === 'over') return 'off';
  if (game.phase !== 'spawning' && game.phase !== 'final') return 'calm';
  const w = C.WAVES[game.waveIdx];
  return w && C.ENEMIES[w.type].boss ? 'boss' : 'battle';
}

// ---------- цикл ----------
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (autoplay) autoStep();
  game.update(dt);
  game.draw();
  setMusicMood(musicMood());
  hudT += dt;
  if (dirty || hudT > 0.2) { refreshHud(); dirty = false; hudT = 0; }
  requestAnimationFrame(frame);
}

loadAssets().then(() => {
  game = new Game(cv, (ev, data) => {
    if (ev === 'change') dirty = true;
    if (ev === 'wave') showBanner(data);
    if (ev === 'end') showEnd(data);
    if (ev === 'rage') showBanner({ idx: -1, rage: true, boss: true });
    if (ev === 'cleared') showBanner({ ...data, cleared: true });
  });
  window.__game = game;
  game.sfx = sfx;
  game.flame = flame;
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
