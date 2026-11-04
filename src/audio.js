// Звуки и музыка синтезируются прямо в браузере (Web Audio), без звуковых файлов.
// Браузер разрешает звук только после действия игрока, поэтому initAudio() вызывается по клику.

let ac = null, master, sfxBus, musicBus, noiseBuf;
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
  const comp = ac.createDynamicsCompressor();
  comp.connect(master); master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
  // музыка тихая, с эхом для атмосферы
  musicBus = ac.createGain(); musicBus.gain.value = 0.11; musicBus.connect(comp);
  const delay = ac.createDelay(); delay.delayTime.value = 0.56;
  const fb = ac.createGain(); fb.gain.value = 0.32;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  musicBus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

// ---------- кирпичики ----------
function tone(freq, dur, o = {}) {
  const t = ac.currentTime + (o.when || 0);
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = o.type || 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const vol = o.vol ?? 0.2, atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); out = f; }
  osc.connect(g); out.connect(o.bus || sfxBus);
  osc.start(t); osc.stop(t + dur + 0.05);
}

function noise(dur, o = {}) {
  const t = ac.currentTime + (o.when || 0);
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = ac.createGain(), vol = o.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

// ---------- звуки игры ----------
// минимальный интервал между повторами, чтобы толпа башен не сливалась в шум
const GAP = { arrow: 0.06, zap: 0.08, fire: 0.16, death: 0.05, rock: 0.08, throw: 0.1 };

const SFX = {
  arrow() { noise(0.09, { freq: 2600, to: 1100, q: 2, vol: 0.22 }); tone(880, 0.07, { to: 330, vol: 0.05 }); },
  throw() { noise(0.25, { freq: 350, to: 900, q: 1.5, vol: 0.12, attack: 0.05 }); },
  rock() { noise(0.3, { filter: 'lowpass', freq: 380, vol: 0.5 }); tone(95, 0.25, { type: 'sine', to: 40, vol: 0.4 }); },
  zap() { tone(520, 0.2, { type: 'square', to: 1250, vol: 0.035, lp: 2400 }); tone(260, 0.22, { type: 'sine', to: 780, vol: 0.09 }); },
  fire() { noise(0.24, { filter: 'lowpass', freq: 1400, to: 500, vol: 0.2, attack: 0.03 }); noise(0.16, { freq: 3000, q: 0.8, vol: 0.05 }); },
  death() { tone(240, 0.12, { type: 'square', to: 80, vol: 0.04, lp: 1500 }); noise(0.08, { freq: 900, vol: 0.08 }); },
  build() { noise(0.12, { filter: 'lowpass', freq: 500, vol: 0.35 }); tone(523, 0.12, { vol: 0.1, when: 0.05 }); tone(784, 0.18, { vol: 0.1, when: 0.12 }); },
  upgrade() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { vol: 0.09, when: i * 0.07 })); },
  sell() { tone(988, 0.08, { type: 'square', vol: 0.04, lp: 3000 }); tone(1319, 0.2, { type: 'square', vol: 0.04, lp: 3000, when: 0.07 }); },
  wave() { [220, 277, 330].forEach(f => tone(f, 1.0, { type: 'sawtooth', vol: 0.06, attack: 0.08, lp: 1100 })); },
  boss() { [110, 147, 165].forEach(f => tone(f, 1.6, { type: 'sawtooth', vol: 0.09, attack: 0.15, lp: 700 })); noise(1.2, { filter: 'lowpass', freq: 160, vol: 0.3, attack: 0.2 }); },
  meteor() { noise(0.55, { freq: 300, to: 1600, q: 1.2, vol: 0.18, attack: 0.1 }); },
  boom() { noise(0.9, { filter: 'lowpass', freq: 260, vol: 0.8 }); tone(70, 0.6, { type: 'sine', to: 30, vol: 0.5 }); },
  frost() { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.05, when: i * 0.06 })); noise(0.6, { freq: 6000, q: 0.5, vol: 0.04, attack: 0.1 }); },
  haste() { tone(300, 0.35, { type: 'square', to: 1200, vol: 0.04, lp: 2500 }); tone(450, 0.35, { type: 'triangle', to: 1800, vol: 0.06, when: 0.05 }); },
  leak() { tone(130, 0.45, { type: 'sawtooth', to: 60, vol: 0.12, lp: 800 }); noise(0.3, { filter: 'lowpass', freq: 300, vol: 0.3 }); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.9 : 0.2, { vol: 0.1, when: i * 0.14 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, i === 3 ? 1.2 : 0.35, { type: 'sawtooth', vol: 0.06, lp: 900, when: i * 0.3 })); },
  click() { tone(660, 0.05, { type: 'square', vol: 0.025, lp: 2500 }); },
};

export function sfx(name) {
  if (!ac || muted || !SFX[name]) return;
  const now = ac.currentTime;
  if (GAP[name] && now - (lastPlayed[name] || 0) < GAP[name]) return;
  lastPlayed[name] = now;
  SFX[name]();
}

// ---------- фоновая музыка: тихий минорный перебор ----------
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const BARS = [ // бас, перебор
  [45, [57, 60, 64, 69]],  // Am
  [41, [53, 57, 60, 65]],  // F
  [38, [50, 53, 57, 62]],  // Dm
  [40, [52, 56, 59, 64]],  // E
];
const ARP = [0, 2, 1, 3, 2, 1, 0, 2];
const STEP = 60 / 76 / 2; // восьмые при 76 ударах в минуту
let nextTime = 0, step = 0;

function startMusic() {
  nextTime = ac.currentTime + 0.3;
  setInterval(() => {
    while (nextTime < ac.currentTime + 0.25) { scheduleStep(step, nextTime); nextTime += STEP; step++; }
  }, 60);
}

function scheduleStep(n, t) {
  const when = t - ac.currentTime;
  const [bass, chord] = BARS[Math.floor(n / 8) % BARS.length];
  const s = n % 8;
  if (s === 0) {
    tone(midi(bass), STEP * 7, { type: 'sine', vol: 0.5, attack: 0.05, when, bus: musicBus });
    chord.slice(0, 3).forEach(m => tone(midi(m - 12), STEP * 8, { type: 'triangle', vol: 0.12, attack: 0.6, when, bus: musicBus, lp: 900 }));
  }
  if (s === 4) tone(midi(bass + 7), STEP * 3, { type: 'sine', vol: 0.3, attack: 0.05, when, bus: musicBus });
  tone(midi(chord[ARP[s]]), 0.7, { type: 'triangle', vol: s % 2 ? 0.14 : 0.2, when, bus: musicBus, lp: 2200 });
  // каждый второй круг — короткая мелодия сверху
  if (Math.floor(n / 32) % 2 === 1 && (s === 0 || s === 3 || s === 6)) {
    tone(midi(chord[(s / 3 + Math.floor(n / 8)) % 4] + 12), 0.9, { type: 'sine', vol: 0.12, attack: 0.02, when, bus: musicBus });
  }
}
