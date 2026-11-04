import * as C from './config.js';
import { drawAt, drawRig, drawRigOutline, spritePixels, size, SCALE, PIX } from './sprites.js';
import { unitRig, enemyRig } from './anim.js';
import { PATH_LEN, posAt, SLOTS, renderBackground, drawTower, drawSlot, TOWER_TOP } from './map.js';

const LIFT = 18; // высота полёта гаргулий
// места на фоне (логические координаты): пламя факелов и ворота замка
const TORCHES = [[20, 86], [390, 109], [438, 140]];
const GATE = { x: 424, y: 97, w: 20, h: 20 };
const GATE_FADE = 16; // за сколько единиц пути до конца враг начинает растворяться в проходе ворот
// обводка улучшенных защитников: 2 уровень — серебро, 3 — золото
const LEVEL_GLOW = { 2: ['#a8d4ff', 0.45], 3: ['#ffd34a', 0.75] };
import { FX, line, drawBoulder, cell, pxEllipse } from './fx.js';

export class Game {
  constructor(canvas, emit) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emit = emit || (() => {});
    this.sfx = () => {}; // звуки подключает интерфейс
    this.flame = () => {}; // непрерывный звук пламени дракона
    this.bg = renderBackground();
    this.pxScale = SCALE; // экранных пикселей на логическую единицу, задаёт интерфейс
    this.reset();
  }

  reset() {
    this.gold = C.START_GOLD;
    this.lives = C.START_LIVES;
    this.mana = C.MANA_START;
    this.waveIdx = -1;
    this.phase = 'prep';          // prep | spawning | break | final | over
    this.spawnLeft = 0; this.spawnT = 0; this.breakT = 0;
    this.enemies = []; this.projectiles = []; this.meteors = []; this.corpses = [];
    this.burns = []; this.shocks = []; this.gateHit = 0;
    // светлячки над травой: медленно кружат и мерцают
    this.flies = Array.from({ length: 18 }, () => ({ x: 20 + Math.random() * 380, y: 95 + Math.random() * 135, ph: Math.random() * 7, sp: 0.4 + Math.random() * 0.6 }));
    this.towers = SLOTS.map(([x, y], i) => ({ i, x, y, unit: null, level: 0, cd: 0, invested: 0, face: -1, anim: 0 })); // защитники смотрят влево — навстречу врагам
    this.fx = new FX();
    this.time = 0; this.playTime = 0; this.kills = 0;
    this.speed = 1; this.paused = false;
    this.slowT = 0; this.hasteT = 0;
    this.hover = -1; this.selected = -1; this.targeting = null; this.mouse = null;
    this.result = null; this.bossLeaked = false;
    this.emit('change');
  }

  // ---------- действия игрока ----------
  stats(t) { return { ...C.UNITS[t.unit], ...C.UNITS[t.unit].levels[t.level - 1] }; }

  build(i, unit) {
    const t = this.towers[i], def = C.UNITS[unit];
    if (t.unit || this.gold < def.cost) return false;
    this.gold -= def.cost;
    Object.assign(t, { unit, level: 1, cd: 0.3, invested: def.cost, face: -1 }); // новый защитник смотрит навстречу врагам
    this.sfx('build');
    this.fx.burst(t.x, t.y - 20, ['#d0cabe', '#a39d92', '#f3c843'], 14, 40, 0.6);
    this.emit('change');
    return true;
  }
  upgradeCost(t) { const lv = C.UNITS[t.unit].levels[t.level]; return lv ? lv.cost : null; }
  upgrade(i) {
    const t = this.towers[i], cost = t.unit && this.upgradeCost(t);
    if (!cost || this.gold < cost) return false;
    this.gold -= cost; t.level++; t.invested += cost;
    this.sfx('upgrade');
    this.fx.burst(t.x, t.y - TOWER_TOP - 10, ['#f3c843', '#fff3a0', '#ffffff'], 16, 50, 0.7);
    this.emit('change');
    return true;
  }
  sellValue(t) { return Math.floor(t.invested * C.SELL_RATE); }
  sell(i) {
    const t = this.towers[i];
    if (!t.unit) return false;
    this.gold += this.sellValue(t);
    this.sfx('sell');
    this.fx.burst(t.x, t.y - 20, ['#f3c843', '#b8862a'], 10, 40, 0.5);
    Object.assign(t, { unit: null, level: 0, invested: 0 });
    this.emit('change');
    return true;
  }

  canCallWave() { return (this.phase === 'prep' || this.phase === 'break') && this.waveIdx < C.WAVES.length - 1; }
  callWave() {
    if (!this.canCallWave()) return;
    if (this.phase === 'break') { this.gold += C.EARLY_BONUS; }
    this.startWave();
  }
  startWave() {
    this.waveIdx++;
    const w = C.WAVES[this.waveIdx];
    this.spawnLeft = w.count; this.spawnT = 0; this.phase = 'spawning';
    this.sfx(C.ENEMIES[w.type].boss ? 'boss' : 'wave');
    this.emit('wave', { idx: this.waveIdx, name: C.ENEMIES[w.type].name, count: w.count, boss: C.ENEMIES[w.type].boss });
    this.emit('change');
  }

  cast(key, x, y) {
    const sp = C.SPELLS[key];
    if (this.mana < sp.mana || this.phase === 'over') return false;
    if (key === 'meteor') {
      if (x === undefined) { this.targeting = 'meteor'; this.emit('change'); return true; }
      this.meteors.push({ x, y, t: 0, dur: 0.55 });
      this.sfx('meteor');
      this.targeting = null;
    } else if (key === 'slow') {
      this.slowT = sp.time;
      this.sfx('frost');
      for (const e of this.enemies) this.fx.burst(e.x, e.y - 6, ['#bfe9ff', '#7fd6ff'], 4, 20, 0.5, 0);
    } else if (key === 'haste') {
      this.hasteT = sp.time;
      this.sfx('haste');
      for (const t of this.towers) if (t.unit) this.fx.burst(t.x, t.y - TOWER_TOP - 14, ['#7af4ff', '#ffffff'], 6, 25, 0.5, -20);
    }
    this.mana -= sp.mana;
    this.emit('change');
    return true;
  }

  slotAt(x, y) {
    for (const t of this.towers) {
      if (Math.abs(x - t.x) <= 17 && y <= t.y + 14 && y >= t.y - TOWER_TOP - 26) return t.i;
    }
    return -1;
  }

  // ---------- обновление ----------
  update(rawDt) {
    if (this.paused || this.phase === 'over') { for (const t of this.towers) this.flame(t.i, false); this.fx.update(rawDt * 0.0); return; }
    const dt = Math.min(rawDt, 0.05) * this.speed;
    this.time += dt;
    if (this.phase !== 'prep') this.playTime += dt;
    this.mana = Math.min(C.MANA_MAX, this.mana + C.MANA_REGEN * dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hasteT = Math.max(0, this.hasteT - dt);

    this.updateWaves(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const t of this.towers) if (t.unit) this.updateTower(t, dt);
    for (const p of this.projectiles) this.updateProjectile(p, dt);
    for (const m of this.meteors) this.updateMeteor(m, dt);
    this.enemies = this.enemies.filter(e => e.alive);
    this.projectiles = this.projectiles.filter(p => p.alive !== false);
    this.meteors = this.meteors.filter(m => m.t < m.dur);
    for (const c of this.corpses) { c.t += dt; if (c.t >= 0.25) this.dissolve(c); }
    this.corpses = this.corpses.filter(c => c.t < 0.25);
    this.updateBurns(dt);
    for (const s of this.shocks) s.t += dt;
    this.shocks = this.shocks.filter(s => s.t < 0.5);
    for (const f of this.flies) { f.ph += dt * f.sp; f.x += Math.cos(f.ph * 0.7) * dt * 4; f.y += Math.sin(f.ph) * dt * 3; }
    this.gateHit = Math.max(0, this.gateHit - dt);
    this.fx.update(dt);

    if (this.lives <= 0) this.finish(false);
    else if (this.phase === 'final' && this.enemies.length === 0) this.finish(true);
  }

  finish(win) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.sfx(win ? 'win' : 'lose');
    this.result = { win, time: this.playTime, kills: this.kills, lives: Math.max(0, this.lives), bossLeaked: !!this.bossLeaked };
    this.emit('end', this.result);
    this.emit('change');
  }

  updateWaves(dt) {
    if (this.phase === 'spawning') {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const w = C.WAVES[this.waveIdx];
        this.spawn(w.type);
        this.spawnLeft--; this.spawnT = w.gap;
        if (this.spawnLeft <= 0) {
          if (this.waveIdx >= C.WAVES.length - 1) this.phase = 'final';
          else { this.phase = 'break'; this.breakT = C.WAVE_BREAK; }
          this.emit('change');
        }
      }
    } else if (this.phase === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave();
    }
  }

  spawn(type) {
    const def = C.ENEMIES[type];
    const p = posAt(0);
    this.enemies.push({ type, def, hp: def.hp, max: def.hp, d: 0, x: p.x, y: p.y, dir: 1, alive: true,
      slowT: 0, slowK: 1, stunT: 0, dotT: 0, dotDps: 0, flash: 0, anim: Math.random(), h: size(type).h });
  }

  updateEnemy(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.dotT > 0) { e.dotT -= dt; this.damage(e, e.dotDps * dt, 'magic', false); if (!e.alive) return; }
    if (e.def.regen && e.hp < e.max) e.hp = Math.min(e.max, e.hp + e.def.regen * dt);
    if (e.def.slam) this.bossAbilities(e, dt);
    if (e.stunT > 0) { e.stunT -= dt; return; }
    let k = e.enraged ? e.def.rage.speed : 1;
    if (e.slowT > 0) { e.slowT -= dt; k *= e.slowK; }
    if (this.slowT > 0) k *= C.SPELLS.slow.slow;
    // держим дистанцию в колонне: если впереди кто-то ближе MIN_SPACING, притормаживаем
    let gap = Infinity;
    for (const o of this.enemies) if (o !== e && o.alive && o.d > e.d && o.def.flying === e.def.flying) gap = Math.min(gap, o.d - e.d);
    if (gap < C.MIN_SPACING) k *= Math.max(0, (gap - C.MIN_SPACING * 0.6) / (C.MIN_SPACING * 0.4));
    e.d += e.def.speed * k * dt;
    e.anim += dt * k;
    const p = posAt(e.d);
    if (p.dx) e.dir = p.dx;
    e.x = p.x; e.y = p.y;
    if (e.d >= PATH_LEN) {
      e.alive = false;
      this.lives -= e.def.lives;
      if (e.def.boss) this.bossLeaked = true;
      this.sfx('leak');
      this.hitGate();
      this.fx.shake = Math.min(3, 1 + e.def.lives / 4);
      this.emit('change');
    }
  }

  // тролль-вождь: каждые несколько секунд бьёт кулаками в землю — ближние башни оглушены;
  // при половине здоровья впадает в ярость и идёт быстрее
  bossAbilities(e, dt) {
    const sl = e.def.slam;
    e.slamCd = (e.slamCd ?? sl.every * 0.6) - dt;
    e.slamAnim = Math.max(0, (e.slamAnim || 0) - dt);
    const near = this.towers.filter(t => t.unit && Math.hypot(t.x - e.x, t.y - e.y) <= sl.radius);
    if (e.slamCd <= 0 && near.length && e.stunT <= 0) {
      e.slamCd = sl.every; e.slamAnim = 0.45;
      for (const t of near) t.stunT = sl.stun;
      this.shocks.push({ x: e.x, y: e.y + 1, r: sl.radius, t: 0 });
      this.fx.shake = Math.max(this.fx.shake, 2.5);
      this.fx.burst(e.x, e.y, ['#8c7f68', '#a89a80', '#5e584e'], 22, 60, 0.6, 150);
      this.sfx('slam');
    }
    if (!e.enraged && e.hp <= e.max * e.def.rage.at) {
      e.enraged = true;
      this.sfx('rage');
      this.fx.burst(e.x, this.aimY(e), ['#ff5a3a', '#ffb03a', '#ffffff'], 26, 55, 0.7, 20);
      this.emit('rage');
    }
  }

  // враг прорвался в замок: в проходе вспыхивает тревожный отсвет
  hitGate() { this.gateHit = 0.6; }

  // павший враг рассыпается на пиксели своей картинки, они осыпаются и тают
  dissolve(c) {
    const P = spritePixels(c.type), { w, h } = size(c.type);
    const flip = (c.dir < 0) !== P.faceLeft;
    const rot = (c.dir < 0 ? -1 : 1) * 1.45, cs = Math.cos(rot), sn = Math.sin(rot);
    const y0 = c.flying ? c.y : c.y + 2;
    const step = Math.max(1, Math.floor(P.list.length / (c.type === 'troll' ? 520 : 240)));
    for (let i = Math.floor(Math.random() * step); i < P.list.length; i += step) {
      const q = P.list[i];
      const lx = ((flip ? P.gw - 1 - q.u : q.u) + 0.5) * PIX - w / 2, ly = -(h - (q.v + 0.5) * PIX);
      this.fx.parts.push({ x: c.x + lx * cs - ly * sn, y: y0 + lx * sn + ly * cs,
        vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 16, g: 18 + Math.random() * 20,
        life: 0.45 + Math.random() * 0.5, max: 0.95, c: q.c, s: 0.6, fade: 1 });
    }
  }

  // горящая земля от дракона 3 уровня
  updateBurns(dt) {
    for (const b of this.burns) {
      b.t -= dt;
      for (const e of this.enemies) {
        if (!e.alive || e.def.flying) continue;
        if (Math.hypot((e.x - b.x) / b.r, (e.y - b.y) / (b.r * 0.6)) <= 1) this.damage(e, b.dps * dt, 'fire', false);
      }
      b.acc = (b.acc || 0) + dt * 22;
      for (; b.acc >= 1; b.acc--) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * b.r;
        this.fx.parts.push({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r * 0.5, vx: 0, vy: -18 - Math.random() * 10,
          life: 0.32, max: 0.32, fire: true, g: -10, s: 2, scale: 0.6, seed: Math.random() * 100 });
      }
    }
    this.burns = this.burns.filter(b => b.t > 0);
  }

  damage(e, amt, type, show = true) {
    if (!e.alive) return;
    if (type === 'phys') amt *= 1 - e.def.armor;
    e.hp -= amt;
    if (show) {
      e.flash = 0.08;
      if (amt >= 1) this.fx.number(e.x + (Math.random() * 6 - 3), this.aimY(e) - e.h * 0.6, amt,
        type === 'fire' ? '#f3c843' : type === 'magic' ? '#ffe08a' : '#ffffff');
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.gold += e.def.gold; this.kills++;
      this.sfx('death', e.type);
      if (e.def.boss) this.sfx('boom');
      this.corpses.push({ type: e.type, x: e.x, y: e.y, dir: e.dir, flying: e.def.flying, t: 0 });
      const cols = { skeleton: ['#d8d2bc', '#9c9682'], goblin: ['#74b03e', '#3f7024'], wolf: ['#8a8a94', '#4f4f5a'],
        gargoyle: ['#8a8a94', '#5a5a66'], orc: ['#b4bcc6', '#3f7024'], troll: ['#74b03e', '#f3c843'] }[e.type];
      this.fx.burst(e.x, this.aimY(e), cols, e.def.boss ? 40 : 10, e.def.boss ? 70 : 40, 0.6);
      if (e.def.boss) this.fx.shake = 3;
      this.emit('change');
    }
  }

  aimY(e) { return e.y - e.h * 0.45 - (e.def.flying ? LIFT : 0); }

  inRange(t, s, except = null) {
    const tx = t.x, ty = t.y - 8;
    let best = null;
    for (const e of this.enemies) {
      if (!e.alive || e === except || (e.def.flying && !s.air)) continue;
      const ey = this.aimY(e);
      if (Math.hypot(e.x - tx, ey - ty) > s.range) continue;
      if (!best || e.d > best.d) best = e;
    }
    return best;
  }

  updateTower(t, dt) {
    const s = this.stats(t);
    t.anim = Math.max(0, t.anim - dt);
    t.breath = Math.max(0, (t.breath || 0) - dt);
    this.flame(t.i, t.unit === 'dragon' && t.breath > 0); // звук огня ровно столько, сколько видна струя
    if (t.unit === 'dragon' && t.breath > 0) { // огонь льётся непрерывно, пока дракон дышит
      t.fireAcc = (t.fireAcc || 0) + dt * 150; // много коротких языков сливаются в сплошную струю
      for (; t.fireAcc >= 1; t.fireAcc--) {
        const a = t.breathAng + (Math.random() - 0.5) * t.breathCone * 1.1;
        const v = 150 + Math.random() * 140, off = -Math.random() * v * dt; // после сдвига в этом же кадре клуб окажется у самой пасти
        this.fx.flame(t.mouthX + Math.cos(a) * off, t.mouthY + Math.sin(a) * off, Math.cos(a) * v, Math.sin(a) * v);
      }
    }
    if (t.stunT > 0) { t.stunT -= dt; t.breath = 0; t.hasTarget = false; return; } // оглушён ударом тролля
    t.cd = Math.max(0, t.cd - dt * (this.hasteT > 0 ? C.SPELLS.haste.mult : 1));
    const target = this.inRange(t, s);
    t.hasTarget = !!target;
    if (target) t.face = target.x < t.x ? -1 : 1;
    if (t.cd > 0 || !target) return;
    t.cd = s.rate;
    t.face = target.x < t.x ? -1 : 1;
    t.anim = 0.3;
    const ox = t.x + t.face * 6, oy = t.y - TOWER_TOP - 13;
    const ty = this.aimY(target);
    if (t.unit === 'archer') {
      this.sfx('arrow');
      this.projectiles.push({ kind: 'arrow', x: ox, y: oy, target, tx: target.x, ty, speed: 220, dmg: s.dmg });
      if (t.level >= 3) { // вторая стрела — в следующего врага, а если его нет, в того же
        const second = this.inRange(t, s, target) || target;
        this.projectiles.push({ kind: 'arrow', x: ox, y: oy - 2, target: second, tx: second.x, ty: this.aimY(second), speed: 210, dmg: s.dmg });
      }
    } else if (t.unit === 'cyclops') {
      const lead = posAt(target.d + target.def.speed * 0.6);
      this.sfx('throw');
      const cs = size('cyclops'); // валун срывается с рук над головой
      this.projectiles.push({ kind: 'rock', sx: t.x - t.face, sy: t.y - TOWER_TOP - cs.h - 3, gy0: t.y, spin: t.face, tx: lead.x, ty: lead.y - 3, t: 0, dur: 0.6, dmg: s.dmg,
        splash: s.splash * (t.level >= 3 ? s.perkSplash : 1), stun: s.stun * (t.level >= 3 ? s.perkStun : 1) });
    } else if (t.unit === 'lich') {
      this.sfx('zap');
      const ps = size('lich'); // луч света бьёт из сферы на навершии посоха
      this.fx.beam(t.x + t.face * ps.w * 0.375, t.y - TOWER_TOP - ps.h * 0.9, target.x, ty);
      this.damage(target, s.dmg, 'magic');
      target.dotT = s.dot; target.dotDps = s.dps;
      target.slowT = s.slowTime; target.slowK = s.slow;
      if (t.level >= 3) { // луч перескакивает на ближайшего другого врага
        let next = null, bd = s.perkChainRange;
        for (const e of this.enemies) {
          if (!e.alive || e === target) continue;
          const d = Math.hypot(e.x - target.x, this.aimY(e) - ty);
          if (d < bd) { bd = d; next = e; }
        }
        if (next) {
          this.fx.beam(target.x, ty, next.x, this.aimY(next));
          this.damage(next, s.dmg * s.perkChain, 'magic');
          next.slowT = s.slowTime; next.slowK = s.slow;
        }
      }
    } else if (t.unit === 'dragon') {
      // пасть дракона — кончик морды (с учётом покачивания и рывка вперёд при выдохе);
      // пламя рождается чуть впереди неё, чтобы не закрывать голову
      const bob = Math.sin(this.time * 2.5 + t.i * 1.7) * 0.8;
      const mx = t.x + t.face * 12, my = t.y - TOWER_TOP - 20 + bob;
      const ang = Math.atan2(ty - my, target.x - mx);
      Object.assign(t, { breath: 0.24, breathAng: ang, breathLen: s.range, mouthX: mx + Math.cos(ang) * 4, mouthY: my + Math.sin(ang) * 4 });
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const ey = this.aimY(e);
        const dx = e.x - ox, dy = ey - oy;
        if (Math.hypot(dx, dy) > s.range + 6) continue;
        let da = Math.abs(Math.atan2(dy, dx) - ang);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da <= s.cone) this.damage(e, s.dmg, 'fire', Math.random() < 0.35);
      }
      for (let i = 0; i < 2; i++) { // искры вылетают из струи
        const a = ang + (Math.random() - 0.5) * s.cone * 2, v = 120 + Math.random() * 120;
        this.fx.parts.push({ x: t.mouthX, y: t.mouthY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, fire: true, spark: true, g: -30 });
      }
      t.breathCone = s.cone;
      t.burnCd = (t.burnCd || 0) - s.rate;
      if (t.level >= 3 && !target.def.flying && t.burnCd <= 0) {
        t.burnCd = s.perkBurn.every;
        this.burns.push({ x: target.x, y: target.y, r: s.perkBurn.radius, dps: s.perkBurn.dps, t: s.perkBurn.time });
      }
    }
  }

  updateProjectile(p, dt) {
    if (p.kind === 'arrow') {
      if (p.target.alive) { p.tx = p.target.x; p.ty = this.aimY(p.target); }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 2) {
        p.alive = false;
        if (p.target.alive) { this.sfx('hit'); this.damage(p.target, p.dmg, 'phys'); this.fx.burst(p.tx, p.ty, ['#ffffff', '#d8d2bc'], 3, 20, 0.25, 0); }
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    } else if (p.kind === 'rock') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k - Math.sin(Math.PI * k) * 26;
      if (Math.random() < dt * 14) // с валуна сыплется крошка
        this.fx.parts.push({ x: p.x + (Math.random() - 0.5) * 5, y: p.y + 2, vx: 0, vy: 10, life: 0.35, max: 0.35, c: Math.random() < 0.5 ? '#736c63' : '#4f4947', g: 120, s: 0.6 });
      if (k >= 1) {
        p.alive = false;
        for (const e of this.enemies) {
          if (!e.alive || e.def.flying) continue;
          if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) {
            this.damage(e, p.dmg, 'phys');
            e.stunT = Math.max(e.stunT, e.def.boss ? p.stun * 0.3 : p.stun);
          }
        }
        // валун раскалывается: осколки разлетаются по дуге, поднимается облако пыли
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI * (0.1 + 0.8 * Math.random()), v = 35 + Math.random() * 55;
          this.fx.parts.push({ x: p.tx + (Math.random() - 0.5) * 4, y: p.ty - 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: 0.45 + Math.random() * 0.3, max: 0.75, c: ['#9a9284', '#736c63', '#4f4947', '#c2baa9'][i % 4], g: 260, s: i < 4 ? 1.3 : 0.7 });
        }
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, v = 8 + Math.random() * 18;
          this.fx.parts.push({ x: p.tx + Math.cos(a) * 3, y: p.ty + Math.sin(a) * 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4 - 6,
            life: 0.6 + Math.random() * 0.4, max: 1, c: i % 2 ? '#a89a80' : '#8c7f68', g: -6, s: 1.8, fade: 0.55 });
        }
        this.sfx('rock');
        this.fx.shake = Math.max(this.fx.shake, 0.8);
      }
    }
  }

  updateMeteor(m, dt) {
    m.t += dt;
    if (m.t >= m.dur && !m.hit) {
      m.hit = true;
      this.sfx('boom');
      const sp = C.SPELLS.meteor;
      for (const e of this.enemies) {
        const ey = e.def.flying ? e.y - LIFT : e.y;
        if (Math.hypot(e.x - m.x, ey - m.y) <= sp.radius) this.damage(e, sp.dmg, 'fire');
      }
      this.fx.burst(m.x, m.y, ['#fff3a0', '#f3c843', '#f08a2a', '#d0402e', '#5e584e'], 50, 90, 0.8, 40);
      this.fx.shake = 3;
    }
  }

  // ---------- отрисовка ----------
  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.pxScale, 0, 0, this.pxScale, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (this.fx.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.fx.shake * 2), Math.round((Math.random() - 0.5) * this.fx.shake * 2));
    ctx.drawImage(this.bg, 0, 0, C.W, C.H);
    this.drawAmbientBack();

    // зона действия выбранной башни / предпросмотр
    const sel = this.towers[this.selected];
    if (sel && sel.unit) this.drawRange(sel.x, sel.y - 8, this.stats(sel).range);

    // объекты по глубине
    const list = [];
    for (const t of this.towers) list.push({ y: t.y, f: () => this.drawTowerUnit(t) });
    for (const c of this.corpses) list.push({ y: c.y, f: () => this.drawCorpse(c) });
    for (const e of this.enemies) if (!e.def.flying) list.push({ y: e.y + 1, f: () => this.drawEnemy(e) });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.f();
    for (const e of this.enemies) if (e.def.flying) this.drawEnemy(e);
    this.drawAmbientFront();

    for (const p of this.projectiles) this.drawProjectile(p);
    for (const m of this.meteors) this.drawMeteor(m);
    this.fx.draw(ctx);

    if (this.slowT > 0) { ctx.fillStyle = 'rgba(150,210,255,0.10)'; ctx.fillRect(0, 0, C.W, C.H); }
    if (this.targeting === 'meteor' && this.mouse) this.drawRange(this.mouse.x, this.mouse.y, C.SPELLS.meteor.radius, '#f08a2a');
    ctx.restore();
  }

  // ворота замка открыты: в арке тёмный проход вглубь, решётка поднята наверх.
  // Нарисованные на фоне створки закрываются темнотой построчно по форме арки
  drawOpenGate() {
    // форма проёма снята с фона: полукруглый верх, низ скошен по перспективе стены
    const ctx = this.ctx, cx = 435.8, top = 95, r = 10.6, x0 = cx - r, x1 = cx + r;
    const floorY = x => 124 + (x - x0) * 0.33;
    for (let y = top; y < floorY(x1); y += PIX) {
      let a = x0, b = x1;
      if (y < top + r) { const half = Math.sqrt(Math.max(0, r * r - Math.pow(top + r - y, 2))); a = cx - half; b = cx + half; }
      a = Math.max(a, x0 + 0.6); b = Math.min(b, x1 - 0.6);
      const cut = x0 + (y - 124) / 0.33; // ниже порога слева — уже мостовая
      if (y > 124) a = Math.max(a, cut);
      if (b - a < PIX) continue;
      const k = (y - top) / (floorY(x1) - top);
      ctx.fillStyle = `rgb(${Math.round(12 + 26 * k)},${Math.round(10 + 15 * k)},${Math.round(14 + 8 * k)})`;
      cell(ctx, a, y, b - a, PIX);
    }
    // поднятая решётка: из-под свода торчат нижние зубья
    for (let i = -3; i <= 3; i++) {
      const bx = cx + i * 2.6 - 0.6, len = 4.2 - Math.abs(i) * 0.6;
      ctx.fillStyle = '#3d3f48'; cell(ctx, bx, top + 1.2 + Math.abs(i) * 0.4, 1.2, len);
      ctx.fillStyle = '#6a6c76'; cell(ctx, bx, top + 1.2 + Math.abs(i) * 0.4, 0.6, len * 0.6);
    }
    // прорыв врага: в глубине прохода на миг тревожно вспыхивает отсвет
    if (this.gateHit > 0) {
      ctx.fillStyle = `rgba(255,110,50,${this.gateHit * 0.35})`;
      for (let y = 112; y < 126; y += PIX) cell(ctx, x0 + 3, y, r * 2 - 6, PIX);
    }
  }

  // окружение позади объектов: свет факелов, туман, выжженная земля, ворота, ударные волны
  drawAmbientBack() {
    const ctx = this.ctx, t = this.time;
    ctx.save();
    // туман: медленные полупрозрачные полосы у подножия гор и в нижнем лесу
    ctx.fillStyle = 'rgba(170,185,210,0.06)';
    for (let i = 0; i < 5; i++) {
      const y = i < 3 ? 70 + i * 5 : 222 + (i - 3) * 8;
      const x = ((t * (3 + i) + i * 140) % 640) - 80;
      pxEllipse(ctx, x, y, 70, 5); pxEllipse(ctx, x + 40, y + 2, 45, 3.5);
    }
    // факелы: дрожащий свет вокруг пламени
    ctx.globalCompositeOperation = 'lighter';
    TORCHES.forEach(([x, y], i) => {
      const f = 0.8 + 0.2 * Math.sin(t * 2.6 + i * 2) * Math.sin(t * 1.7 + i); // медленное дыхание света
      ctx.fillStyle = `rgba(255,140,40,${0.07 * f})`; pxEllipse(ctx, x, y + 1, 13 * f, 10 * f);
      ctx.fillStyle = `rgba(255,170,60,${0.12 * f})`; pxEllipse(ctx, x, y, 6 * f, 5 * f);
    });
    ctx.globalCompositeOperation = 'source-over';
    // выжженная земля под огнём дракона
    for (const b of this.burns) {
      ctx.fillStyle = `rgba(40,18,8,${0.35 * Math.min(1, b.t)})`; pxEllipse(ctx, b.x, b.y, b.r, b.r * 0.5);
    }
    this.drawOpenGate();
    // ударная волна от кулаков тролля: расходящееся пиксельное кольцо
    for (const s of this.shocks) {
      const k = s.t / 0.5, r = s.r * (0.2 + 0.8 * k), n = Math.floor(r * 1.6);
      ctx.fillStyle = `rgba(230,210,170,${0.8 * (1 - k)})`;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; cell(ctx, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.55, 2 * PIX, PIX); }
    }
    ctx.restore();
  }

  // окружение поверх объектов: язычки пламени факелов и светлячки
  drawAmbientFront() {
    const ctx = this.ctx, t = this.time;
    TORCHES.forEach(([x, y], i) => {
      const h = 2.4 + (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7)) * 2.4; // язычок медленно вытягивается и опадает
      ctx.fillStyle = 'rgba(255,150,40,0.85)'; cell(ctx, x - 1.2 + Math.sin(t * 1.9 + i) * 0.6, y - h, 2.4, h);
      ctx.fillStyle = 'rgba(255,236,150,0.9)'; cell(ctx, x - 0.6, y - h * 0.55, 1.2, h * 0.55);
    });
    for (const f of this.flies) {
      const blink = Math.sin(f.ph * 3);
      if (blink < 0.2) continue;
      ctx.fillStyle = `rgba(214,255,120,${0.35 + 0.55 * blink})`; cell(ctx, f.x, f.y);
      ctx.fillStyle = `rgba(214,255,120,${0.12 * blink})`; cell(ctx, f.x - PIX, f.y - PIX, 3 * PIX, 3 * PIX);
    }
  }

  // тетива лучника рисуется отдельно: натягивается к лицу перед выстрелом, после выстрела распрямляется и дрожит.
  // Концы лука и точка натяжения — в долях картинки (персонаж смотрит вправо)
  drawBowstring(t, top, o, partDy, windup, atk) {
    const ctx = this.ctx, { w, h } = size('archer'), f = t.face;
    const pull = windup * windup * (3 - 2 * windup);
    const P = (fx, fy) => [-w / 2 + fx * w, -h + fy * h + partDy];
    const tipT = P(0.667, 0.03), tipB = P(0.66, 0.72);
    const rest = P(0.665, 0.375), drawn = P(0.46, 0.335);
    const quiver = atk > 0 ? Math.sin(atk * 40) * atk * 0.9 : 0; // дрожание после спуска
    const nx = rest[0] + (drawn[0] - rest[0]) * pull + quiver, ny = rest[1] + (drawn[1] - rest[1]) * pull;
    ctx.save();
    ctx.translate(t.x + (o.dx || 0) * f, top + (o.dy || 0));
    if (o.rot) ctx.rotate(f < 0 ? -o.rot : o.rot);
    if (f < 0) ctx.scale(-1, 1);
    line(ctx, tipT[0], tipT[1], nx, ny, '#d8d0bc', 1);
    line(ctx, nx, ny, tipB[0], tipB[1], '#d8d0bc', 1);
    ctx.restore();
  }

  drawRange(x, y, r, color = '#fff3c0') {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,240,180,0.07)';
    pxEllipse(ctx, x, y, r, r);
    ctx.fillStyle = color;
    const n = Math.floor(r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time * 0.3;
      cell(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  drawTowerUnit(t) {
    const ctx = this.ctx;
    const hl = this.hover === t.i || this.selected === t.i;
    drawTower(ctx, t.x, t.y, Math.max(1, t.level), hl);
    if (!t.unit) { drawSlot(ctx, t.x, t.y - TOWER_TOP, hl, this.time + t.i); return; }
    const top = t.y - TOWER_TOP;
    const atk = t.anim / 0.3;
    const windup = t.hasTarget ? Math.min(1, Math.max(0, 1 - t.cd / 0.5)) : 0;
    const rig = unitRig(t.unit, this.time, atk, windup, t.i * 1.7);
    const o = { ...rig.o, faceLeft: t.face < 0 };
    if (t.unit === 'archer') this.drawBowstring(t, top, o, rig.parts[1].dy || 0, windup, atk);
    const glow = LEVEL_GLOW[t.level];
    if (glow) drawRigOutline(ctx, t.unit, t.x, top, o, rig.parts, glow[0], glow[1] * (0.75 + 0.25 * Math.sin(this.time * 3 + t.i)));
    const { w, h } = drawRig(ctx, t.unit, t.x, top, o, rig.parts);
    if (t.stunT > 0) { // оглушён ударом тролля: звёздочки над головой
      const a = this.time * 7;
      ctx.fillStyle = '#f3c843';
      for (let i = 0; i < 3; i++) cell(ctx, t.x + Math.cos(a + i * 2.1) * 6, top - h - 2 + Math.sin(a + i * 2.1) * 1.5, 2 * PIX, 2 * PIX);
    }
    const ry = top + (o.dy || 0);
    if (t.unit === 'cyclops' && windup > 0 && !this.cyclopsHasBoulder) { // валун над головой перед броском
      const k = windup * windup * (3 - 2 * windup); // поднимается вместе с руками: от груди до места над головой
      const rx = t.x + t.face * (3 - 4 * k), by = ry - h * 0.45 - (h * 0.55 + 3) * k;
      drawBoulder(ctx, rx, by, 0);
    }
    if (t.unit === 'lich') { // свечение солнечной сферы на посохе жреца
      const glow = 0.35 + 0.25 * Math.sin(this.time * 4 + t.i) + atk * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glow);
      const gx = t.x + t.face * w * 0.375, gy = ry - h * 0.9;
      const R = 2.4 + atk * 2.4; // пиксельное свечение: золотой ореол и небольшое светлое ядро
      ctx.fillStyle = 'rgba(255,180,50,0.35)'; pxEllipse(ctx, gx, gy, R, R);
      ctx.fillStyle = 'rgba(255,236,170,0.6)'; pxEllipse(ctx, gx, gy, R * 0.45, R * 0.45);
      ctx.restore();
    }
    if (this.hasteT > 0 && Math.floor(this.time * 8) % 2) {
      ctx.fillStyle = '#7af4ff'; cell(ctx, t.x - 13, ry - h * 0.6, PIX, 3); cell(ctx, t.x + 13, ry - h * 0.4, PIX, 3);
    }
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    const moving = e.stunT <= 0;
    const pace = { wolf: 13, troll: 7.5, gargoyle: 6, goblin: 11, orc: 8 }[e.type] || 9;
    const rig = enemyRig(e.type, e.anim * pace, moving);
    const lift = e.def.flying ? LIFT : 0;
    const fade = Math.min(1, Math.max(0, (PATH_LEN - e.d) / GATE_FADE)); // уходит в темноту ворот
    const o = { ...rig.o, faceLeft: e.dir < 0, white: e.flash > 0, alpha: fade };
    if (fade < 1) ctx.globalAlpha = fade;
    if (!moving) o.rot = 0.12;
    if (e.slamAnim > 0) o.dy = (o.dy || 0) - Math.sin((1 - e.slamAnim / 0.45) * Math.PI) * 4; // подпрыгивает перед ударом
    const sw = e.h * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    pxEllipse(ctx, e.x, e.y + 1, sw / 2, 2);
    if (e.enraged) drawRigOutline(ctx, e.type, e.x, e.y + 2 - lift, o, rig.parts, '#ff3a2a', 0.55 + 0.3 * Math.sin(this.time * 9));
    const { w, h } = drawRig(ctx, e.type, e.x, e.y + 2 - lift, o, rig.parts);
    const top = e.y + 2 - lift - h + (o.dy || 0);
    if (e.slowT > 0 || this.slowT > 0) { ctx.fillStyle = 'rgba(127,214,255,0.9)'; cell(ctx, e.x - w / 2, e.y, w, PIX); }
    if (e.dotT > 0 && Math.random() < 0.15) this.fx.parts.push({ x: e.x + Math.random() * 8 - 4, y: top + h * 0.3, vx: 0, vy: -12, life: 0.4, max: 0.4, c: '#ffd86a', g: 0, s: 1 });
    if (e.stunT > 0) { const a = this.time * 8; ctx.fillStyle = '#f3c843'; cell(ctx, e.x + Math.cos(a) * 5, top - 2, 2 * PIX, 2 * PIX); cell(ctx, e.x - Math.cos(a) * 5, top - 2, 2 * PIX, 2 * PIX); }
    if (e.hp < e.max || e.def.boss) {
      const bw = e.def.boss ? 26 : 13, bx = Math.round(e.x - bw / 2), by = Math.round(top - 4);
      ctx.fillStyle = '#1a1420'; cell(ctx, bx - PIX, by - PIX, bw + 2 * PIX, 5 * PIX);
      ctx.fillStyle = '#5a1414'; cell(ctx, bx, by, bw, 3 * PIX);
      ctx.fillStyle = e.def.boss ? '#f08a2a' : '#5fd04a'; if (e.hp > 0) cell(ctx, bx, by, bw * e.hp / e.max, 3 * PIX);
    }
    ctx.globalAlpha = 1;
  }

  // павший враг заваливается набок и тает
  drawCorpse(c) {
    const k = Math.min(1, c.t / 0.25), fade = 1 - Math.max(0, (c.t - 0.25) / 0.45);
    const y = c.flying ? c.y - LIFT * (1 - k) : c.y + 2;
    drawAt(this.ctx, c.type, c.x, y, { faceLeft: c.dir < 0, rot: (c.dir < 0 ? -1 : 1) * 1.45 * k, alpha: Math.max(0, fade) });
  }

  drawProjectile(p) {
    const ctx = this.ctx;
    if (p.kind === 'arrow') {
      const a = p.ang || 0, cx = Math.cos(a), cy = Math.sin(a);
      line(ctx, p.x - cx * 5, p.y - cy * 5, p.x, p.y, '#8a5630');
      ctx.fillStyle = '#ffffff'; cell(ctx, p.x, p.y);
      ctx.fillStyle = '#e05a4a'; cell(ctx, p.x - cx * 5, p.y - cy * 5); cell(ctx, p.x - cx * 4.4, p.y - cy * 4.4);
    } else if (p.kind === 'rock') {
      const k = Math.min(1, p.t / p.dur);
      // тень на земле: растёт и темнеет по мере приближения валуна
      const gy = p.gy0 + (p.ty + 3 - p.gy0) * k;
      ctx.fillStyle = `rgba(0,0,0,${0.08 + 0.22 * k})`;
      pxEllipse(ctx, p.x, gy, 2 + 2 * k, 1 + 0.8 * k);
      drawBoulder(ctx, p.x, p.y, p.t * 20 * p.spin); // валун кувыркается в полёте
    }
  }

  drawMeteor(m) {
    if (m.hit) return;
    const ctx = this.ctx;
    const k = m.t / m.dur;
    const x = m.x - 60 * (1 - k), y = m.y - 140 * (1 - k);
    for (let i = 1; i < 6; i++) {
      ctx.fillStyle = ['#f3c843', '#f08a2a', '#d0402e', '#7a1f1a', '#3e3c40'][i - 1];
      cell(ctx, x - i * 3, y - i * 7, 3, 3);
    }
    ctx.fillStyle = '#7a1f1a'; cell(ctx, x - 3.6, y - 3.6, 7.2, 7.2);
    ctx.fillStyle = '#f08a2a'; cell(ctx, x - 2.4, y - 2.4, 4.8, 4.8);
    ctx.fillStyle = '#fff3a0'; cell(ctx, x - 1.2, y - 1.2, 2.4, 2.4);
    this.drawRange(m.x, m.y, C.SPELLS.meteor.radius * k, '#f08a2a');
  }
}
