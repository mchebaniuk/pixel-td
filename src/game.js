import * as C from './config.js';
import { drawAt, drawRig, size, SCALE } from './sprites.js';
import { unitRig, enemyRig } from './anim.js';
import { PATH_LEN, posAt, SLOTS, renderBackground, drawTower, drawSlot, TOWER_TOP } from './map.js';

const LIFT = 18; // высота полёта гаргулий
import { FX, line } from './fx.js';

export class Game {
  constructor(canvas, emit) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emit = emit || (() => {});
    this.sfx = () => {}; // звуки подключает интерфейс
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
    this.towers = SLOTS.map(([x, y], i) => ({ i, x, y, unit: null, level: 0, cd: 0, invested: 0, face: 1, anim: 0 }));
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
    Object.assign(t, { unit, level: 1, cd: 0.3, invested: def.cost });
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
    if (this.paused || this.phase === 'over') { this.fx.update(rawDt * 0.0); return; }
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
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter(c => c.t < 0.7);
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
    if (e.stunT > 0) { e.stunT -= dt; return; }
    let k = 1;
    if (e.slowT > 0) { e.slowT -= dt; k *= e.slowK; }
    if (this.slowT > 0) k *= C.SPELLS.slow.slow;
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
      this.fx.shake = Math.min(3, 1 + e.def.lives / 4);
      this.fx.burst(e.x, e.y - 20, ['#ff5a4a', '#ffffff'], 8, 30, 0.6);
      this.emit('change');
    }
  }

  damage(e, amt, type, show = true) {
    if (!e.alive) return;
    if (type === 'phys') amt *= 1 - e.def.armor;
    e.hp -= amt;
    if (show) {
      e.flash = 0.08;
      if (amt >= 1) this.fx.number(e.x + (Math.random() * 6 - 3), this.aimY(e) - e.h * 0.6, amt,
        type === 'fire' ? '#f3c843' : type === 'magic' ? '#d6a4ff' : '#ffffff');
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.gold += e.def.gold; this.kills++;
      this.sfx(e.def.boss ? 'boom' : 'death');
      this.corpses.push({ type: e.type, x: e.x, y: e.y, dir: e.dir, flying: e.def.flying, t: 0 });
      const cols = { skeleton: ['#d8d2bc', '#9c9682'], goblin: ['#74b03e', '#3f7024'], wolf: ['#8a8a94', '#4f4f5a'],
        gargoyle: ['#8a8a94', '#5a5a66'], orc: ['#b4bcc6', '#3f7024'], troll: ['#74b03e', '#f3c843'] }[e.type];
      this.fx.burst(e.x, this.aimY(e), cols, e.def.boss ? 40 : 10, e.def.boss ? 70 : 40, 0.6);
      if (e.def.boss) this.fx.shake = 3;
      this.emit('change');
    }
  }

  aimY(e) { return e.y - e.h * 0.45 - (e.def.flying ? LIFT : 0); }

  inRange(t, s) {
    const tx = t.x, ty = t.y - 8;
    let best = null;
    for (const e of this.enemies) {
      if (!e.alive || (e.def.flying && !s.air)) continue;
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
    if (t.unit === 'dragon' && t.breath > 0) { // огонь льётся непрерывно, пока дракон дышит
      t.fireAcc = (t.fireAcc || 0) + dt * 110;
      for (; t.fireAcc >= 1; t.fireAcc--) {
        const a = t.breathAng + (Math.random() - 0.5) * t.breathCone * 1.1;
        const v = 150 + Math.random() * 140, off = -Math.random() * v * dt; // после сдвига в этом же кадре клуб окажется у самой пасти
        this.fx.flame(t.mouthX + Math.cos(a) * off, t.mouthY + Math.sin(a) * off, Math.cos(a) * v, Math.sin(a) * v);
      }
    }
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
    } else if (t.unit === 'cyclops') {
      const lead = posAt(target.d + target.def.speed * 0.6);
      this.sfx('throw');
      this.projectiles.push({ kind: 'rock', sx: ox, sy: oy - 4, tx: lead.x, ty: lead.y - 3, t: 0, dur: 0.6, dmg: s.dmg, splash: s.splash, stun: s.stun });
    } else if (t.unit === 'lich') {
      this.sfx('zap');
      this.fx.beam(t.x + t.face * 6, t.y - TOWER_TOP - 25, target.x, ty);
      this.damage(target, s.dmg, 'magic');
      target.dotT = s.dot; target.dotDps = s.dps;
      target.slowT = s.slowTime; target.slowK = s.slow;
    } else if (t.unit === 'dragon') {
      this.sfx('fire');
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
        if (p.target.alive) { this.damage(p.target, p.dmg, 'phys'); this.fx.burst(p.tx, p.ty, ['#ffffff', '#d8d2bc'], 3, 20, 0.25, 0); }
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    } else if (p.kind === 'rock') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k - Math.sin(Math.PI * k) * 26;
      if (k >= 1) {
        p.alive = false;
        for (const e of this.enemies) {
          if (!e.alive || e.def.flying) continue;
          if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) {
            this.damage(e, p.dmg, 'phys');
            e.stunT = Math.max(e.stunT, e.def.boss ? p.stun * 0.3 : p.stun);
          }
        }
        this.fx.burst(p.tx, p.ty, ['#8a8478', '#5e584e', '#8a6a44'], 14, 50, 0.5);
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

    for (const p of this.projectiles) this.drawProjectile(p);
    for (const m of this.meteors) this.drawMeteor(m);
    this.fx.draw(ctx);

    if (this.slowT > 0) { ctx.fillStyle = 'rgba(150,210,255,0.10)'; ctx.fillRect(0, 0, C.W, C.H); }
    if (this.targeting === 'meteor' && this.mouse) this.drawRange(this.mouse.x, this.mouse.y, C.SPELLS.meteor.radius, '#f08a2a');
    ctx.restore();
  }

  drawRange(x, y, r, color = '#fff3c0') {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,240,180,0.07)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    const n = Math.floor(r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time * 0.3;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
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
    const { w, h } = drawRig(ctx, t.unit, t.x, top, o, rig.parts);
    const ry = top + (o.dy || 0);
    if (t.unit === 'cyclops' && windup > 0 && !this.cyclopsHasBoulder) { // валун над головой перед броском
      const rx = t.x - t.face * 3 * windup, by = ry - h + 2 - 6 * windup;
      ctx.fillStyle = '#2e2c30'; ctx.beginPath(); ctx.arc(rx, by, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.arc(rx, by, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b0aa9c'; ctx.fillRect(rx - 2, by - 2, 2, 1.5);
    }
    if (t.unit === 'lich') { // свечение навершия посоха
      const glow = 0.35 + 0.25 * Math.sin(this.time * 4 + t.i) + atk * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glow);
      const gx = t.x + t.face * w * 0.33, gy = ry - h * 0.95;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 3 + atk * 4);
      g.addColorStop(0, 'rgba(236,214,255,1)'); g.addColorStop(1, 'rgba(160,90,230,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, 3 + atk * 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.hasteT > 0 && Math.floor(this.time * 8) % 2) {
      ctx.fillStyle = '#7af4ff'; ctx.fillRect(t.x - 13, ry - h * 0.6, 1, 3); ctx.fillRect(t.x + 13, ry - h * 0.4, 1, 3);
    }
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    const moving = e.stunT <= 0;
    const pace = { wolf: 13, troll: 6, gargoyle: 6, goblin: 11, orc: 8 }[e.type] || 9;
    const rig = enemyRig(e.type, e.anim * pace, moving);
    const lift = e.def.flying ? LIFT : 0;
    const o = { ...rig.o, faceLeft: e.dir < 0, white: e.flash > 0 };
    if (!moving) o.rot = 0.12;
    const sw = e.h * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 1, sw / 2, 2, 0, 0, Math.PI * 2); ctx.fill();
    const { w, h } = drawRig(ctx, e.type, e.x, e.y + 2 - lift, o, rig.parts);
    const top = e.y + 2 - lift - h + (o.dy || 0);
    if (e.slowT > 0 || this.slowT > 0) { ctx.fillStyle = 'rgba(127,214,255,0.9)'; ctx.fillRect(e.x - w / 2, e.y, w, 1); }
    if (e.dotT > 0 && Math.random() < 0.15) this.fx.parts.push({ x: e.x + Math.random() * 8 - 4, y: top + h * 0.3, vx: 0, vy: -12, life: 0.4, max: 0.4, c: '#c58cff', g: 0, s: 1 });
    if (e.stunT > 0) { const a = this.time * 8; ctx.fillStyle = '#f3c843'; ctx.fillRect(e.x + Math.cos(a) * 5, top - 2, 1.5, 1.5); ctx.fillRect(e.x - Math.cos(a) * 5, top - 2, 1.5, 1.5); }
    if (e.hp < e.max || e.def.boss) {
      const bw = e.def.boss ? 26 : 13, bx = Math.round(e.x - bw / 2), by = Math.round(top - 4);
      ctx.fillStyle = '#1a1420'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#5a1414'; ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = e.def.boss ? '#f08a2a' : '#5fd04a'; ctx.fillRect(bx, by, Math.max(0, bw * e.hp / e.max), 2);
    }
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
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      ctx.fillStyle = '#e05a4a'; ctx.fillRect(Math.round(p.x - cx * 5), Math.round(p.y - cy * 5), 1, 1);
    } else if (p.kind === 'rock') {
      const k = Math.min(1, p.t / p.dur);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.round(p.sx + (p.tx - p.sx) * k) - 2, Math.round(p.sy + (p.ty - p.sy) * k) + 26 * 0, 5, 2);
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = '#3e3c40'; ctx.fillRect(x - 3, y - 2, 7, 5); ctx.fillRect(x - 2, y - 3, 5, 7);
      ctx.fillStyle = '#8a8478'; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = '#a8a296'; ctx.fillRect(x - 2, y - 2, 2, 2);
    }
  }

  drawMeteor(m) {
    if (m.hit) return;
    const ctx = this.ctx;
    const k = m.t / m.dur;
    const x = m.x - 60 * (1 - k), y = m.y - 140 * (1 - k);
    for (let i = 1; i < 6; i++) {
      ctx.fillStyle = ['#f3c843', '#f08a2a', '#d0402e', '#7a1f1a', '#3e3c40'][i - 1];
      ctx.fillRect(Math.round(x - i * 3), Math.round(y - i * 7), 3, 3);
    }
    ctx.fillStyle = '#7a1f1a'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
    ctx.fillStyle = '#f08a2a'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
    ctx.fillStyle = '#fff3a0'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    this.drawRange(m.x, m.y, C.SPELLS.meteor.radius * k, '#f08a2a');
  }
}
