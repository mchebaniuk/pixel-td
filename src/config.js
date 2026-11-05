// Весь баланс игры. Меняй цифры здесь, код трогать не нужно.

export const W = 480;           // внутреннее разрешение (пиксели)
export const H = 240;
export const PLAY_TOP = 0;
export const PLAY_BOTTOM = 270;

export const START_GOLD = 300;
export const START_LIVES = 20;
export const SELL_RATE = 0.7;   // продажа возвращает 70% вложенного
export const WAVE_BREAK = 5;    // секунд паузы между волнами — отсчёт начинается, когда враги прошлой волны закончились
export const EARLY_BONUS = 15;  // золото за досрочный вызов волны

export const MANA_MAX = 100;
export const MANA_START = 40;
export const MANA_REGEN = 3.5;  // в секунду

// type урона: phys (режется бронёй), magic, fire
// rate: секунд между атаками. range: радиус в пикселях.
// levels: уровень 1 = базовый, 2 и 3 = апгрейды (cost = цена апгрейда)
export const UNITS = {
  archer: {
    name: 'Лучник', desc: 'Быстрые стрелы по одной цели',
    perk: 'Две стрелы за выстрел',
    cost: 60, type: 'phys', proj: 'arrow', air: true,
    levels: [
      { dmg: 12, range: 88, rate: 0.6 },
      { dmg: 14, range: 95, rate: 0.5,  cost: 55 },
      { dmg: 21, range: 102, rate: 0.4,  cost: 95 },
    ],
  },
  cyclops: {
    name: 'Циклоп', desc: 'Валун по площади, оглушает. Не достаёт летающих',
    perk: 'Оглушает дольше и по большей площади', perkStun: 1.6, perkSplash: 1.25,
    cost: 90, type: 'phys', proj: 'rock', air: false, splash: 20, stun: 0.5,
    levels: [
      { dmg: 24, range: 78, rate: 1.9 },
      { dmg: 38, range: 82, rate: 1.7, cost: 80 },
      { dmg: 58, range: 88, rate: 1.5, cost: 130 },
    ],
  },
  lich: {
    name: 'Жрец', desc: 'Луч света: жжёт и замедляет',
    perk: 'Луч перескакивает на второго врага', perkChain: 0.6, perkChainRange: 40,
    cost: 80, type: 'magic', proj: 'beam', air: true,
    dot: 3, slow: 0.55, slowTime: 1.6,
    levels: [
      { dmg: 7,  dps: 5,  range: 82, rate: 0.9 },
      { dmg: 11, dps: 8,  range: 88, rate: 0.8, cost: 70 },
      { dmg: 16, dps: 13, range: 95, rate: 0.7, cost: 120 },
    ],
  },
  dragon: {
    name: 'Дракон', desc: 'Огненное дыхание конусом по толпе',
    perk: 'Оставляет на дороге горящую землю', perkBurn: { time: 2.2, radius: 9, dps: 14, every: 0.5 },
    cost: 170, type: 'fire', proj: 'breath', air: true, cone: 0.55,
    levels: [
      { dmg: 5,  range: 86, rate: 0.14 },
      { dmg: 8,  range: 93, rate: 0.13, cost: 140 },
      { dmg: 12, range: 100, rate: 0.12, cost: 220 },
    ],
  },
};
export const UNIT_ORDER = ['archer', 'cyclops', 'lich', 'dragon'];

// armor: доля физического урона, которую режет броня
export const ENEMIES = {
  skeleton: { name: 'Скелеты',          hp: 42,   speed: 22, gold: 6,  armor: 0,   lives: 1 },
  goblin:   { name: 'Гоблины',          hp: 30,   speed: 29, gold: 5,  armor: 0,   lives: 1 },
  wolf:     { name: 'Волчьи всадники',  hp: 70,   speed: 42, gold: 8,  armor: 0,   lives: 1 },
  gargoyle: { name: 'Гаргульи',         hp: 85,   speed: 26, gold: 10,  armor: 0.2, lives: 1, flying: true },
  orc:      { name: 'Орки-латники',     hp: 250,  speed: 19, gold: 15, armor: 0.4, lives: 2 },
  troll:    { name: 'Тролль-вождь',     hp: 2600, speed: 15, gold: 150, armor: 0.25, lives: 12, regen: 12, boss: true,
              // удар по земле оглушает ближние башни; при половине здоровья — ярость (быстрее идёт)
              slam: { every: 7, radius: 55, stun: 1.6 }, rage: { at: 0.5, speed: 1.35 } },
};

// Каждая волна: один тип врагов, идут колонной. gap — секунд между выходом врагов
// враги всегда смотрят вправо, к замку, и не разворачиваются на петле дороги (true — разворачиваться по ходу движения)
export const ENEMIES_TURN = false;
export const MIN_SPACING = 11; // враги в колонне держат дистанцию по дороге не меньше этой (не наползают друг на друга)
export const WAVES = [
  { type: 'skeleton', count: 10, gap: 1.4 },
  { type: 'goblin',   count: 16, gap: 0.9 },
  { type: 'wolf',     count: 10, gap: 1.0 },
  { type: 'gargoyle', count: 10, gap: 1.4 },
  { type: 'orc',      count: 8,  gap: 1.9 },
  { type: 'troll',    count: 1,  gap: 1 },
];

export const SPELLS = {
  meteor: { name: 'Метеор',    mana: 45, dmg: 120, radius: 30, key: 'q', desc: 'Удар по области, клик по карте' },
  slow:   { name: 'Мороз',     mana: 35, slow: 0.4, time: 4,    key: 'w', desc: 'Все враги замедлены на 4 с' },
  haste:  { name: 'Ускорение', mana: 40, mult: 1.6, time: 5,    key: 'e', desc: 'Башни стреляют быстрее 5 с' },
};
