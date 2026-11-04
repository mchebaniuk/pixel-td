import * as C from './config.js';
import { sprite, hasFrame } from './sprites.js';
import { PATH_LEN, posAt, SLOTS, renderBackground, drawTower, drawSlot } from './map.js';
import { FX, line } from './fx.js';

export class Game {
  constructor(canvas, emit) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emit = emit || (() => {});
    this.bg = renderBackground();
    this.reset();
  }

  reset() {
    this.gold = C.START_GOLD;
    this.lives = C.START_LIVES;
    this.mana = C.MANA_START;
    this.waveIdx = -1;
    this.phase = 'prep';          // prep | spawning | break | final | over
    this.spawnLeft = 0; this.spawnT = 0; this.breakT = 0;
    this.enemies = []; this.projectiles = []; this.meteors = [];
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
    this.fx.burst(t.x, t.y - 20, ['#d0cabe', '#a39d92', '#f3c843'], 14, 40, 0.6);
    this.emit('change');
    return true;
  }
  upgradeCost(t) { const lv = C.UNITS[t.unit].levels[t.level]; return lv ? lv.cost : null; }
  upgrade(i) {
    const t = this.towers[i], cost = t.unit && this.upgradeCost(t);
    if (!cost || this.gold < cost) return false;
    this.gold -= cost; t.level++; t.invested += cost;
    this.fx.burst(t.x, t.y - 34, ['#f3c843', '#fff3a0', '#ffffff'], 16, 50, 0.7);
    this.emit('change');
    return true;
  }
  sellValue(t) { return Math.floor(t.invested * C.SELL_RATE); }
  sell(i) {
    const t = this.towers[i];
    if (!t.unit) return false;
    this.gold += this.sellValue(t);
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
    this.emit('wave', { idx: this.waveIdx, name: C.ENEMIES[w.type].name, count: w.count, boss: C.ENEMIES[w.type].boss });
    this.emit('change');
  }

  cast(key, x, y) {
    const sp = C.SPELLS[key];
    if (this.mana < sp.mana || this.phase === 'over') return false;
    if (key === 'meteor') {
      if (x === undefined) { this.targeting = 'meteor'; this.emit('change'); return true; }
      this.meteors.push({ x, y, t: 0, dur: 0.55 });
      this.targeting = null;
    } else if (key === 'slow') {
      this.slowT = sp.time;
      for (const e of this.enemies) this.fx.burst(e.x, e.y - 6, ['#bfe9ff', '#7fd6ff'], 4, 20, 0.5, 0);
    } else if (key === 'haste') {
      this.hasteT = sp.time;
      for (const t of this.towers) if (t.unit) this.fx.burst(t.x, t.y - 36, ['#7af4ff', '#ffffff'], 6, 25, 0.5, -20);
    }
    this.mana -= sp.mana;
    this.emit('change');
    return true;
  }

  slotAt(x, y) {
    for (const t of this.towers) {
      if (Math.abs(x - t.x) <= 11 && y <= t.y + 4 && y >= t.y - (t.unit ? 46 : 16)) return t.i;
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
    this.fx.update(dt);

    if (this.lives <= 0) this.finish(false);
    else if (this.phase === 'final' && this.enemies.length === 0) this.finish(true);
  }

  finish(win) {
    if (this.phase === 'over') return;
    this.phase = 'over';
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
      slowT: 0, slowK: 1, stunT: 0, dotT: 0, dotDps: 0, flash: 0, anim: Math.random() });
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
      if (amt >= 1) this.fx.number(e.x + (Math.random() * 6 - 3), e.y - (e.def.flying ? 30 : 18), amt,
        type === 'fire' ? '#f3c843' : type === 'magic' ? '#d6a4ff' : '#ffffff');
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.gold += e.def.gold; this.kills++;
      const cols = { skeleton: ['#d8d2bc', '#9c9682'], goblin: ['#74b03e', '#3f7024'], wolf: ['#8a8a94', '#4f4f5a'],
        gargoyle: ['#8a8a94', '#5a5a66'], orc: ['#b4bcc6', '#3f7024'], troll: ['#74b03e', '#f3c843'] }[e.type];
      this.fx.burst(e.x, e.y - (e.def.flying ? 18 : 6), cols, e.def.boss ? 40 : 10, e.def.boss ? 70 : 40, 0.6);
      if (e.def.boss) this.fx.shake = 3;
      this.emit('change');
    }
  }

  inRange(t, s) {
    const tx = t.x, ty = t.y - 30;
    let best = null;
    for (const e of this.enemies) {
      if (!e.alive || (e.def.flying && !s.air)) continue;
      const ey = e.def.flying ? e.y - 14 : e.y - 5;
      if (Math.hypot(e.x - tx, ey - ty) > s.range) continue;
      if (!best || e.d > best.d) best = e;
    }
    return best;
  }

  updateTower(t, dt) {
    const s = this.stats(t);
    t.anim = Math.max(0, t.anim - dt);
    t.cd -= dt * (this.hasteT > 0 ? C.SPELLS.haste.mult : 1);
    if (t.cd > 0) return;
    const target = this.inRange(t, s);
    if (!target) return;
    t.cd = s.rate;
    t.face = target.x < t.x ? -1 : 1;
    t.anim = 0.15;
    const ox = t.x + t.face * 4, oy = t.y - 38;
    const ty = target.def.flying ? target.y - 14 : target.y - 5;
    if (t.unit === 'archer') {
      this.projectiles.push({ kind: 'arrow', x: ox, y: oy, target, tx: target.x, ty, speed: 220, dmg: s.dmg });
    } else if (t.unit === 'cyclops') {
      const lead = posAt(target.d + target.def.speed * 0.6);
      this.projectiles.push({ kind: 'rock', sx: ox, sy: oy - 4, tx: lead.x, ty: lead.y - 3, t: 0, dur: 0.6, dmg: s.dmg, splash: s.splash, stun: s.stun });
    } else if (t.unit === 'lich') {
      this.fx.beam(t.x + t.face * 5, t.y - 44, target.x, ty);
      this.damage(target, s.dmg, 'magic');
      target.dotT = s.dot; target.dotDps = s.dps;
      target.slowT = s.slowTime; target.slowK = s.slow;
    } else if (t.unit === 'dragon') {
      const ax = target.x - ox, ay = ty - oy;
      const ang = Math.atan2(ay, ax);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const ey = e.def.flying ? e.y - 14 : e.y - 5;
        const dx = e.x - ox, dy = ey - oy;
        if (Math.hypot(dx, dy) > s.range + 6) continue;
        let da = Math.abs(Math.atan2(dy, dx) - ang);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da <= s.cone) this.damage(e, s.dmg, 'fire', Math.random() < 0.35);
      }
      for (let i = 0; i < 5; i++) {
        const a = ang + (Math.random() - 0.5) * s.cone * 1.6;
        const v = 90 + Math.random() * 70;
        this.fx.flame(ox + t.face * 3, oy + 2, Math.cos(a) * v, Math.sin(a) * v);
      }
    }
  }

  updateProjectile(p, dt) {
    if (p.kind === 'arrow') {
      if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.def.flying ? p.target.y - 14 : p.target.y - 5; }
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
        this.fx.shake = Math.max(this.fx.shake, 0.8);
      }
    }
  }

  updateMeteor(m, dt) {
    m.t += dt;
    if (m.t >= m.dur && !m.hit) {
      m.hit = true;
      const sp = C.SPELLS.meteor;
      for (const e of this.enemies) {
        const ey = e.def.flying ? e.y - 14 : e.y;
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
    if (this.fx.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.fx.shake * 2), Math.round((Math.random() - 0.5) * this.fx.shake * 2));
    ctx.drawImage(this.bg, 0, 0);

    // зона действия выбранной башни / предпросмотр
    const sel = this.towers[this.selected];
    if (sel && sel.unit) this.drawRange(sel.x, sel.y - 30, this.stats(sel).range);

    // объекты по глубине
    const list = [];
    for (const t of this.towers) list.push({ y: t.y, f: () => this.drawTowerUnit(t) });
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
    if (!t.unit) { drawSlot(ctx, t.x, t.y, hl, this.time + t.i); return; }
    drawTower(ctx, t.x, t.y, t.level, hl);
    const img = sprite(t.unit, 0, t.face < 0);
    const bob = Math.sin(this.time * 2.5 + t.i) > 0.6 ? 1 : 0;
    const kick = t.anim > 0 ? t.face : 0;
    const x = Math.round(t.x - img.width / 2 + kick), y = Math.round(t.y - 26 - img.height + bob);
    ctx.drawImage(img, x, y);
    if (this.hasteT > 0 && Math.floor(this.time * 8) % 2) { ctx.fillStyle = '#7af4ff'; ctx.fillRect(t.x - 9, y + 2, 1, 2); ctx.fillRect(t.x + 9, y + 4, 1, 2); }
    if (t.unit === 'cyclops' && t.cd < 0.7) { // валун в руках перед броском
      ctx.fillStyle = '#3e3c40'; ctx.fillRect(t.x - 3, y - 4, 7, 5);
      ctx.fillStyle = '#8a8478'; ctx.fillRect(t.x - 2, y - 4, 5, 4);
      ctx.fillStyle = '#a8a296'; ctx.fillRect(t.x - 2, y - 4, 2, 1);
    }
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    const frame = hasFrame(e.type, 1) && e.stunT <= 0 ? Math.floor(e.anim * (e.def.flying ? 5 : 7)) % 2 : 0;
    const img = sprite(e.type, frame, e.dir < 0, e.flash > 0);
    const lift = e.def.flying ? 14 + Math.round(Math.sin(e.anim * 4) * 1.5) : 0;
    if (e.def.flying) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(e.x) - 5, Math.round(e.y), 11, 2); }
    else { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(e.x) - Math.floor(img.width / 3), Math.round(e.y) + 1, Math.floor(img.width / 1.5), 2); }
    const x = Math.round(e.x - img.width / 2), y = Math.round(e.y - img.height + 2 - lift);
    ctx.drawImage(img, x, y);
    // статусы
    if (e.slowT > 0 || this.slowT > 0) { ctx.fillStyle = '#7fd6ff'; ctx.fillRect(x, y + img.height - 2, 2, 1); }
    if (e.dotT > 0 && Math.random() < 0.15) this.fx.parts.push({ x: e.x + Math.random() * 6 - 3, y: y + 4, vx: 0, vy: -12, life: 0.4, max: 0.4, c: '#c58cff', g: 0, s: 1 });
    if (e.stunT > 0) { const a = this.time * 8; ctx.fillStyle = '#f3c843'; ctx.fillRect(Math.round(e.x + Math.cos(a) * 4), y - 2, 1, 1); ctx.fillRect(Math.round(e.x - Math.cos(a) * 4), y - 2, 1, 1); }
    // полоска здоровья
    if (e.hp < e.max || e.def.boss) {
      const w = e.def.boss ? 22 : 10, bx = Math.round(e.x - w / 2), by = y - 4;
      ctx.fillStyle = '#1a1420'; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
      ctx.fillStyle = '#5a1414'; ctx.fillRect(bx, by, w, 2);
      ctx.fillStyle = e.def.boss ? '#f08a2a' : '#5fd04a'; ctx.fillRect(bx, by, Math.max(0, Math.round(w * e.hp / e.max)), 2);
    }
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
