// Простая «кукольная» анимация: спрайт режется на части (ноги, тело, крылья),
// и каждая часть двигается отдельно. Доли [x0, y0, x1, y1] даны для персонажа, смотрящего вправо.

const legs = (LEG, lift) => s => [
  { r: [0, LEG, 0.5, 1], sy: 1 - lift * Math.max(0, s), pivot: 'top' },   // задняя нога поднимается
  { r: [0.5, LEG, 1, 1], sy: 1 - lift * Math.max(0, -s), pivot: 'top' },  // передняя нога поднимается
];

// враги: phase растёт с пройденным путём
export function enemyRig(type, phase, moving) {
  const s = moving ? Math.sin(phase) : 0;
  const bob = -Math.abs(s);
  switch (type) {
    case 'gargoyle': {
      const flap = 0.5 + 0.5 * Math.sin(phase * 1.6);
      return { o: { dy: Math.sin(phase * 0.8) * 1.2 }, parts: [
        { r: [0, 0, 1, 0.42], sy: 1 - flap * 0.5, pivot: 'bottom' }, // крылья
        { r: [0, 0.4, 1, 1] },
      ] };
    }
    case 'wolf':
      return { o: { rot: s * 0.05, dy: bob * 1.2 }, parts: [
        ...legs(0.68, 0.4)(s),
        { r: [0, 0, 1, 0.71] },
      ] };
    case 'troll':
      return { o: { dy: bob * 0.6, rot: s * 0.02 }, parts: [
        ...legs(0.7, 0.3)(s),
        { r: [0, 0, 1, 0.73], dy: Math.abs(s) * 0.5 }, // тяжёлое тело проседает на шаге
      ] };
    default: // скелет, гоблин, орк
      return { o: { dy: bob * 0.8 }, parts: [
        ...legs(0.66, 0.38)(s),
        { r: [0, 0, 1, 0.69], dx: s * 0.4 },
      ] };
  }
}

// защитники на башнях: t — время, atk — 1→0 сразу после выстрела, windup — 0→1 перед выстрелом
export function unitRig(unit, t, atk, windup, seed) {
  const breath = Math.sin(t * 2.2 + seed);
  switch (unit) {
    case 'archer':
      return { o: { dx: -0.8 * windup + 1.6 * atk }, parts: [
        { r: [0, 0.58, 1, 1] },
        { r: [0, 0, 1, 0.63], dy: breath * 0.35 },
      ] };
    case 'cyclops':
      return { o: { rot: -0.12 * windup + 0.18 * atk }, parts: [
        { r: [0, 0.6, 1, 1] },
        { r: [0, 0, 1, 0.65], dy: breath * 0.45 },
      ] };
    case 'lich': // жрец стоит на площадке и спокойно дышит
      return { o: {}, parts: [
        { r: [0, 0.6, 1, 1] },
        { r: [0, 0, 1, 0.62], dy: breath * 0.3 },
      ] };
    case 'dragon': {
      const flap = 0.5 + 0.5 * Math.sin(t * 5 + seed);
      return { o: { dy: Math.sin(t * 2.5 + seed) * 0.8, dx: 1.5 * atk }, parts: [
        { r: [0, 0, 0.47, 0.6], sy: 1 - flap * 0.22, pivot: 'bottom' },   // левое крыло
        { r: [0.83, 0, 1, 0.72], sy: 1 - flap * 0.22, pivot: 'bottom' },  // правое крыло
        { r: [0, 0.58, 0.47, 1] },
        { r: [0.83, 0.7, 1, 1] },
        { r: [0.45, 0, 0.85, 1] },                                         // тело и голова
      ] };
    }
    default:
      return { o: {}, parts: [{ r: [0, 0, 1, 1] }] };
  }
}
