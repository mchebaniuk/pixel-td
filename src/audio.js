// Звуки и музыка синтезируются прямо в браузере (Web Audio), без звуковых файлов.
// Стиль — фэнтези-RPG: арфа, струнные, флейта, военный рог, барабаны и колокола в зале с эхом.
// Браузер разрешает звук только после действия игрока, поэтому initAudio() вызывается по клику.

let ac = null, master, comp, sfxBus, musicBus, reverb, noiseBuf, lfo;
let muted = false;
const lastPlayed = {};

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  if (ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.05);
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 1;
  comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4;
  comp.connect(master); master.connect(ac.destination);

  // зал: свёртка с искусственным «хвостом» эха
  reverb = ac.createConvolver(); reverb.buffer = hallImpulse(2.6);
  const wet = ac.createGain(); wet.gain.value = 0.9;
  reverb.connect(wet); wet.connect(comp);

  sfxBus = ac.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(comp);
  const sfxSend = ac.createGain(); sfxSend.gain.value = 0.22; sfxBus.connect(sfxSend); sfxSend.connect(reverb);
  musicBus = ac.createGain(); musicBus.gain.value = 0.17; musicBus.connect(comp);
  const musicSend = ac.createGain(); musicSend.gain.value = 0.55; musicBus.connect(musicSend); musicSend.connect(reverb);

  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // общее вибрато для струнных и флейты (в центах)
  lfo = ac.createOscillator(); lfo.frequency.value = 5.1; lfo.start();
  startMusic();
}

function hallImpulse(sec) {
  const sr = ac.sampleRate, len = Math.floor(sr * sec);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.4 * k); // хвост темнеет к концу, как в каменном зале
      d[i] = lp * Math.pow(1 - k, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return buf;
}

// ---------- кирпичики ----------
const at = when => ac.currentTime + (when || 0);
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function env(g, t, vol, attack, dur, release = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  if (release) {
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function vibrato(osc, cents) {
  const g = ac.createGain(); g.gain.value = cents;
  lfo.connect(g); g.connect(osc.detune);
}

function noise(dur, o = {}) {
  const t = at(o.when);
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = ac.createGain();
  env(g, t, o.vol ?? 0.2, o.attack ?? 0.005, dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

// мягкий удар низким тоном (барабаны, удары камня)
function thump(f0, f1, dur, vol, when, bus) {
  const t = at(when);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, vol, 0.004, dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

// щипковая струна (арфа, лютня, тетива) — алгоритм Карплуса — Стронга, буфер кешируется
const ksCache = {};
function ksBuffer(freq, dur, soft) {
  const key = `${Math.round(freq * 10)}|${dur}|${soft}`;
  if (ksCache[key]) return ksCache[key];
  const sr = ac.sampleRate, N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * dur);
  const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  let prev = 0;
  for (let i = 0; i < N; i++) { prev += ((Math.random() * 2 - 1) - prev) * (1 - soft); ring[i] = prev; }
  const decay = 0.998 - Math.min(0.006, freq / 400000);
  for (let i = 0, idx = 0; i < len; i++) {
    const nx = (idx + 1) % N, v = ring[idx];
    ring[idx] = decay * 0.5 * (v + ring[nx]);
    d[i] = v;
    idx = nx;
  }
  return (ksCache[key] = buf);
}

function pluck(freq, o = {}) {
  const t = at(o.when), dur = o.dur || 2;
  const src = ac.createBufferSource(); src.buffer = ksBuffer(freq, dur, o.soft ?? 0.5);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp || 3200;
  const g = ac.createGain(); g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.setValueAtTime(o.vol ?? 0.3, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t); src.stop(t + dur);
}

// струнная группа: несколько расстроенных «смычковых» голосов, медленная атака
function strings(freqs, dur, o = {}) {
  const t = at(o.when);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp || 1300; f.Q.value = 0.6;
  const g = ac.createGain();
  env(g, t, o.vol ?? 0.1, o.attack ?? 0.6, dur, o.release ?? 0.7);
  f.connect(g); g.connect(o.bus || sfxBus);
  for (const fr of freqs) for (const det of [-9, 7]) {
    const osc = ac.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.value = fr; osc.detune.value = det;
    vibrato(osc, 6);
    osc.connect(f); osc.start(t); osc.stop(t + dur + 0.05);
  }
}

// флейта: чистый тон с дыханием и вибрато
function flute(freq, dur, o = {}) {
  const t = at(o.when), vol = o.vol ?? 0.12;
  const osc = ac.createOscillator(), osc2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  osc2.type = 'sine'; osc2.frequency.value = freq * 2; g2.gain.value = 0.05;
  vibrato(osc, 9); vibrato(osc2, 9);
  env(g, t, vol, 0.07, dur, Math.min(0.25, dur * 0.4));
  osc.connect(g); osc2.connect(g2); g2.connect(g); g.connect(o.bus || sfxBus);
  osc.start(t); osc2.start(t); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  noise(Math.min(dur, 0.35), { freq: freq * 2, q: 6, vol: vol * 0.12, attack: 0.03, when: o.when, bus: o.bus || sfxBus });
}

// медный рог: фильтр раскрывается на атаке, как у живого духового
function horn(freq, dur, o = {}) {
  const t = at(o.when), vol = o.vol ?? 0.12;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(220, t);
  f.frequency.exponentialRampToValueAtTime(o.bright || 1600, t + 0.14);
  f.frequency.exponentialRampToValueAtTime((o.bright || 1600) * 0.55, t + dur);
  const g = ac.createGain();
  env(g, t, vol, 0.1, dur, Math.min(0.35, dur * 0.4));
  f.connect(g); g.connect(o.bus || sfxBus);
  for (const det of [-6, 5]) {
    const osc = ac.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.97, t); osc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    osc.detune.value = det;
    osc.connect(f); osc.start(t); osc.stop(t + dur + 0.05);
  }
}

// колокол / металл: частотная модуляция с нецелым отношением
function bell(freq, dur, o = {}) {
  const t = at(o.when);
  const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * (o.ratio || 3.5);
  mg.gain.setValueAtTime(freq * (o.index || 2), t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
  env(g, t, o.vol ?? 0.08, 0.003, dur);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(o.bus || sfxBus);
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
}

// большой барабан (тайко / походный): низкий удар + шлепок кожи
function drum(vol, o = {}) {
  const bus = o.bus || sfxBus, p = o.pitch || 1;
  thump(120 * p, 42 * p, 0.45, vol, o.when, bus);
  noise(0.12, { filter: 'lowpass', freq: 900 * p, vol: vol * 0.45, when: o.when, bus });
}

// крик / рык: пила с падающей высотой через «гласные» полосы (форманты)
function voice(f0, f1, dur, formants, vol, when) {
  const t = at(when);
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  vibrato(o, 25);
  const g = ac.createGain(); env(g, t, vol, 0.02, dur);
  for (const f of formants) {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 5;
    o.connect(bp); bp.connect(g);
  }
  g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

// ---------- звуки игры ----------
// минимальный интервал между повторами, чтобы толпа башен не сливалась в шум
const GAP = { arrow: 0.07, zap: 0.09, fire: 0.18, death: 0.08, rock: 0.09, throw: 0.1, click: 0.04 };
const rnd = (a, b) => a + Math.random() * (b - a);

const SFX = {
  // тетива и свист стрелы
  arrow() {
    pluck(rnd(92, 104), { dur: 0.32, soft: 0.2, vol: 0.5, lp: 1800 });
    noise(0.16, { freq: 2400, to: 700, q: 1.6, vol: 0.09, attack: 0.02, when: 0.02 });
  },
  // взмах тяжёлого валуна
  throw() { noise(0.32, { freq: 280, to: 820, q: 1.4, vol: 0.16, attack: 0.08 }); },
  // удар камня о землю: глухо и с треском
  rock() {
    thump(95, 34, 0.32, 0.5);
    noise(0.35, { filter: 'lowpass', freq: 420, vol: 0.45 });
    noise(0.06, { freq: 2600, q: 2, vol: 0.12, when: 0.01 });
  },
  // луч жреца: гул, вихрь и отзвук
  zap() {
    for (const f of [110, 116.5]) thump(f * 1.5, f, 0.38, 0.08);
    noise(0.34, { freq: 380, to: 2600, q: 5, vol: 0.12, attack: 0.04 });
    bell(rnd(1180, 1320), 0.5, { vol: 0.025, ratio: 1.41, index: 1.2, when: 0.05 });
  },
  // рёв пламени
  fire() {
    noise(0.36, { filter: 'lowpass', freq: 1100, to: 380, vol: 0.24, attack: 0.05 });
    noise(0.3, { freq: 220, q: 1, vol: 0.2, attack: 0.04 });
  },
  // падение врага: глухой удар и звяканье снаряжения
  // гибель врага — у каждого вида свой голос; тело падает с глухим ударом
  death(type) {
    const k = rnd(0.9, 1.12); // чуть разная высота, чтобы толпа не звучала одинаково
    noise(0.14, { filter: 'lowpass', freq: 320, vol: 0.22, when: 0.06 });
    switch (type) {
      case 'skeleton': // кости рассыпаются
        for (let i = 0; i < 6; i++) noise(0.035, { freq: rnd(1300, 2600), q: 9, vol: 0.13, when: i * rnd(0.03, 0.06) });
        break;
      case 'goblin': // визг
        voice(560 * k, 240 * k, 0.28, [950, 2100], 0.13);
        break;
      case 'wolf': // скулёж волка
        voice(760 * k, 420 * k, 0.16, [850, 1700], 0.12);
        voice(560 * k, 300 * k, 0.26, [850, 1700], 0.09, 0.15);
        break;
      case 'gargoyle': // каменный крик и осыпь
        voice(900 * k, 420 * k, 0.22, [1400, 2800], 0.08);
        noise(0.4, { filter: 'lowpass', freq: 700, to: 250, vol: 0.25, when: 0.05 });
        for (let i = 0; i < 4; i++) noise(0.04, { freq: rnd(600, 1300), q: 6, vol: 0.12, when: 0.08 + i * rnd(0.04, 0.08) });
        break;
      case 'orc': // хрип и лязг доспеха
        voice(150 * k, 75 * k, 0.38, [520, 1150], 0.18);
        bell(rnd(1500, 1900), 0.25, { vol: 0.06, ratio: 2.76, index: 1, when: 0.12 });
        break;
      case 'troll': // рёв вождя
        voice(120, 55, 0.9, [420, 950], 0.25);
        break;
      default:
        voice(300 * k, 140 * k, 0.25, [700, 1400], 0.12);
    }
  },
  // плотник: два удара молотом и аккорд арфы
  build() {
    for (const w of [0, 0.13]) { noise(0.07, { freq: 1300, q: 3, vol: 0.28, when: w }); thump(190, 110, 0.09, 0.2, w); }
    [62, 69, 74].forEach((m, i) => pluck(midi(m), { dur: 1.6, vol: 0.18, when: 0.26 + i * 0.04 }));
  },
  // магическое усиление: глиссандо арфы и колокольчик
  upgrade() {
    [62, 65, 69, 72, 74, 77, 81].forEach((m, i) => pluck(midi(m), { dur: 1.4, vol: 0.15, when: i * 0.045 }));
    bell(1760, 1.2, { vol: 0.05, ratio: 2.01, index: 0.8, when: 0.32 });
  },
  // звон монет
  sell() { for (let i = 0; i < 6; i++) bell(rnd(2400, 4300), 0.22, { vol: 0.045, ratio: 2.76, index: 0.6, when: rnd(0, 0.22) }); },
  // боевой рог и барабаны перед волной
  wave() { // светлый призыв рога в мажоре: ре — ля — ре октавой выше
    horn(midi(62), 0.22, { vol: 0.12, bright: 2400 });
    horn(midi(69), 0.22, { vol: 0.12, bright: 2400, when: 0.24 });
    horn(midi(74), 0.9, { vol: 0.13, bright: 2600, when: 0.48 });
    horn(midi(66), 0.9, { vol: 0.07, bright: 2200, when: 0.48 });
    drum(0.22, { when: 0, pitch: 1.4 }); drum(0.25, { when: 0.48, pitch: 1.4 });
  },
  // вождь идёт: низкий рог, гонг и тяжёлая дробь
  boss() {
    horn(midi(38), 2.2, { vol: 0.2, bright: 900 });
    horn(midi(45), 2.2, { vol: 0.13, bright: 900, when: 0.05 });
    bell(73, 3, { vol: 0.22, ratio: 1.41, index: 3, when: 0.1 });
    [0, 0.38, 0.76, 0.95, 1.14].forEach((w, i) => drum(i < 3 ? 0.7 : 0.5, { when: w, pitch: 0.75 }));
  },
  // огненный шар падает с неба
  meteor() {
    noise(0.6, { freq: 300, to: 1500, q: 1.2, vol: 0.18, attack: 0.15 });
    noise(0.6, { filter: 'lowpass', freq: 180, vol: 0.2, attack: 0.3 });
  },
  // взрыв
  boom() {
    thump(70, 24, 0.9, 0.6);
    noise(1.1, { filter: 'lowpass', freq: 320, to: 120, vol: 0.85 });
    noise(0.45, { freq: 2200, q: 0.7, vol: 0.08, when: 0.05 });
  },
  // мороз: ледяные колокольчики и потрескивание
  frost() {
    [2093, 2637, 3136, 3951].forEach((f, i) => bell(f, 0.9, { vol: 0.05, ratio: 2.4, index: 0.5, when: i * 0.07 }));
    noise(0.8, { filter: 'highpass', freq: 5500, vol: 0.05, attack: 0.15 });
    for (let i = 0; i < 4; i++) noise(0.03, { freq: rnd(3000, 6000), q: 8, vol: 0.06, when: 0.1 + i * 0.09 });
  },
  // ускорение: порыв ветра и взлёт арфы
  haste() {
    noise(0.55, { freq: 400, to: 2600, q: 1.5, vol: 0.14, attack: 0.12 });
    [57, 62, 64, 69, 74, 76, 81].forEach((m, i) => pluck(midi(m), { dur: 0.9, vol: 0.12, when: i * 0.03 }));
  },
  // враг у ворот: колокол замка бьёт тревогу
  leak() {
    bell(196, 2.4, { vol: 0.2, ratio: 1.41, index: 2.5 });
    thump(80, 40, 0.3, 0.3);
  },
  // победа: фанфары медных и литавры
  win() {
    const seq = [[62, 0, 0.3], [66, 0.3, 0.3], [69, 0.6, 0.3], [74, 0.9, 1.6]];
    for (const [m, w, d] of seq) { horn(midi(m), d, { vol: 0.13, when: w, bright: 2200 }); horn(midi(m - 12), d, { vol: 0.08, when: w }); }
    strings([midi(50), midi(57), midi(62), midi(66)], 2.6, { vol: 0.09, attack: 0.4, when: 0.9 });
    [0, 0.3, 0.6, 0.9].forEach(w => drum(0.45, { when: w }));
  },
  // поражение: печальные струнные вниз и гонг
  lose() {
    [[62, 0], [60, 0.55], [58, 1.1], [57, 1.65]].forEach(([m, w], i) =>
      strings([midi(m - 12), midi(m)], i === 3 ? 2.4 : 0.7, { vol: 0.1, attack: 0.15, release: 0.3, when: w, lp: 900 }));
    bell(65, 4, { vol: 0.25, ratio: 1.41, index: 3, when: 1.65 });
    drum(0.6, { when: 1.65, pitch: 0.6 });
  },
  // деревянный щелчок интерфейса
  click() { noise(0.035, { freq: 2100, q: 4, vol: 0.14 }); thump(700, 400, 0.03, 0.04); },
};

export function sfx(name, arg) {
  if (!ac || muted || !SFX[name]) return;
  const now = ac.currentTime;
  if (GAP[name] && now - (lastPlayed[name] || 0) < GAP[name]) return;
  lastPlayed[name] = now;
  SFX[name](arg);
}

// ---------- фоновая музыка ----------
// Светлая тема в ре мажоре, 3/4, как городская музыка фэнтези-RPG: арфа мягко перебирает аккорды,
// струнные держат гармонию, щипковый бас на сильную долю, флейта ведёт напевную мелодию.
// Через круг мелодию подхватывает арфа октавой ниже — для разнообразия.
// В бою добавляется лёгкий барабан с бубном, на боссе барабан плотнее.
// mood: 'calm' | 'battle' | 'boss' | 'off'
let mood = 'calm';
export function setMusicMood(m) { mood = m; }

const BARS = [ // бас, аккорд
  [38, [62, 66, 69]], // D
  [43, [55, 59, 62]], // G
  [47, [59, 62, 66]], // Bm
  [45, [57, 61, 64]], // A
  [38, [62, 66, 69]], // D
  [43, [55, 59, 62]], // G
  [40, [55, 59, 64]], // Em
  [45, [57, 61, 64]], // A
];
// мелодия: [восьмая в такте, нота, длина в восьмых]
const MELODY = [
  [[0, 74, 3], [3, 76, 1], [4, 78, 2]],
  [[0, 79, 4], [4, 78, 1], [5, 76, 1]],
  [[0, 74, 3], [3, 73, 1], [4, 71, 2]],
  [[0, 73, 4], [4, 69, 2]],
  [[0, 78, 3], [3, 79, 1], [4, 81, 2]],
  [[0, 83, 3], [3, 81, 1], [4, 79, 2]],
  [[0, 78, 2], [2, 76, 2], [4, 79, 2]],
  [[0, 76, 4], [4, 73, 2]],
];
const ARP = [0, 1, 2, 3, 2, 1];
const STEP = 60 / 104 / 2; // восьмые при 104 ударах в минуту
let nextTime = 0, step = 0;

function startMusic() {
  nextTime = ac.currentTime + 0.3;
  setInterval(() => {
    if (ac.state !== 'running') { nextTime = ac.currentTime + 0.1; return; }
    while (nextTime < ac.currentTime + 0.3) { scheduleStep(step, nextTime); nextTime += STEP; step++; }
  }, 60);
}

function scheduleStep(n, t) {
  if (mood === 'off' || muted) return;
  const when = t - ac.currentTime, bus = musicBus;
  const barN = Math.floor(n / 6), s = n % 6, loop = Math.floor(barN / BARS.length);
  const bar = barN % BARS.length;
  const [bass, chord] = BARS[bar];
  const fight = mood !== 'calm', boss = mood === 'boss';
  const barLen = STEP * 6;

  if (s === 0) {
    strings(chord.map(midi), barLen + 0.4, { vol: 0.045, attack: 0.45, release: 0.5, when, bus, lp: 1500 });
    pluck(midi(bass), { dur: 1.6, vol: 0.34, soft: 0.55, lp: 1000, when, bus });
  }
  if (s === 4) pluck(midi(bass + 7), { dur: 1, vol: 0.2, soft: 0.55, lp: 1000, when, bus });
  // арфа
  const tones = [chord[0] - 12, chord[1] - 12, chord[2] - 12, chord[0]];
  pluck(midi(tones[ARP[s]]), { dur: 1.6, vol: s === 0 ? 0.13 : 0.09, soft: 0.45, lp: 2600, when, bus });

  // мелодия: флейта, а через круг — арфа октавой ниже
  for (const [st, m, len] of MELODY[bar]) {
    if (st !== s) continue;
    if (loop % 2 === 0) flute(midi(m), len * STEP * 0.95, { vol: 0.08, when, bus });
    else pluck(midi(m - 12), { dur: 2, vol: 0.2, soft: 0.35, lp: 3000, when, bus });
  }

  // лёгкий барабан и бубен в бою
  if (fight) {
    if (s === 0) drum(boss ? 0.3 : 0.2, { when, bus, pitch: boss ? 0.9 : 1.2 });
    if (boss && s === 3) drum(0.18, { when, bus, pitch: 1 });
    if (s === 2 || s === 4) noise(0.06, { filter: 'highpass', freq: 7000, vol: 0.05, when, bus });
  }
}
