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
      // взмах: крылья от плеч уходят вниз и складываются, потом раскрываются вверх;
      // каждые несколько взмахов — короткое планирование с раскрытыми крыльями
      const glide = 0.35 + 0.65 * Math.min(1, Math.max(0, 0.5 + Math.sin(phase * 0.35) * 1.5));
      const w = Math.sin(phase * 2.2) * glide;          // +1 — крылья вверху, −1 — внизу
      const lag = Math.sin(phase * 2.2 - 1.2) * glide;   // тело и ноги отстают от крыльев
      const wing = { sy: 1 + 0.18 * w - 0.38 * Math.max(0, -w), pivot: 'bottom', dy: -w * 0.8 };
      const spread = 1 - 0.22 * Math.max(0, -w);
      return { o: { dy: lag * 1.6 - 1, rot: 0.05 }, parts: [
        { r: [0, 0.55, 1, 1], dx: -lag * 0.5 },                                 // ноги и хвост болтаются
        { r: [0, 0, 0.42, 0.55], ...wing, sx: spread, pivotX: 'right' },       // заднее крыло
        { r: [0.62, 0, 1, 0.55], ...wing, sx: spread, pivotX: 'left' },        // переднее крыло
        { r: [0.42, 0, 0.62, 0.55] },                                           // голова и торс
      ] };
    }
    case 'wolf':
      return { o: { rot: s * 0.05, dy: bob * 1.2 }, parts: [
        ...legs(0.68, 0.4)(s),
        { r: [0, 0, 1, 0.71] },
      ] };
    case 'troll': // тяжёлый шаг: ноги по очереди поднимаются и выносятся вперёд, тело переваливается
      return { o: { dy: bob * 1.1, rot: s * 0.045 }, parts: [
        { r: [0.08, 0.74, 0.48, 1], sy: 1 - 0.42 * Math.max(0, s), pivot: 'top', dx: -s * 1.8 },  // задняя нога
        { r: [0.48, 0.74, 0.86, 1], sy: 1 - 0.42 * Math.max(0, -s), pivot: 'top', dx: s * 1.8 },  // передняя нога
        { r: [0.86, 0.74, 1, 1], dy: Math.abs(s) * 0.7 },  // кулак, свисающий ниже пояса
        { r: [0, 0.74, 0.08, 1] },
        { r: [0, 0, 1, 0.76], dy: Math.abs(s) * 0.7 },     // тело проседает на каждом шаге
      ] };
    default: // скелет, гоблин, орк
      return { o: { dy: bob * 0.8 }, parts: [
        ...legs(0.66, 0.38)(s),
        { r: [0, 0, 1, 0.69], dx: s * 0.4 },
      ] };
  }
}

const ease = k => k * k * (3 - 2 * k); // плавный разгон и торможение

// защитники на башнях: t — время, atk — 1→0 сразу после выстрела, windup — 0→1 перед выстрелом
export function unitRig(unit, t, atk, windup, seed) {
  const breath = Math.sin(t * 2.2 + seed);
  switch (unit) {
    case 'archer': { // натягивает тетиву, отклоняясь назад, после выстрела — отдача и возврат
      const pull = ease(windup), kick = atk * atk;
      return { o: { dx: -0.9 * pull + 1.4 * kick, rot: -0.05 * pull + 0.04 * kick }, parts: [
        { r: [0, 0.58, 1, 1], dx: 0.5 * pull - 0.6 * kick },  // ноги упираются
        { r: [0, 0, 1, 0.63], dy: breath * 0.35 - 0.4 * kick },
      ] };
    }
    case 'cyclops': { // поднимает валун над головой и швыряет его вперёд всем корпусом
      const up = ease(windup), hit = atk;
      // руки: замах вверх через перёд; на броске проходят вперёд и вниз
      const arm = -2.7 * Math.max(up, hit * hit * 0.9);
      return { o: { rot: -0.12 * up + 0.22 * hit, dx: -0.8 * up + 2 * hit }, parts: [
        { r: [0.8, 0.18, 1, 0.62], rot: arm * 1.08, at: [0.84, 0.22] },             // дальняя рука
        { r: [0, 0.62, 1, 1], sy: 1 - 0.06 * up, pivot: 'top' },                      // ноги приседают на замахе
        { r: [0.2, 0, 0.8, 0.64], dy: breath * 0.45 + 1.2 * up - 0.8 * hit },         // голова и торс
        { r: [0, 0.18, 0.2, 0.62], rot: arm, at: [0.16, 0.22], dy: 1.2 * up - 0.8 * hit }, // ближняя рука
      ] };
    }
    case 'lich': { // жрец поднимает посох перед лучом и вскидывает его при выстреле; подол колышется
      const lift = 1.2 * ease(windup) + 1.6 * atk;
      return { o: {}, parts: [
        { r: [0, 0.74, 0.72, 1], dx: Math.sin(t * 2.2 + seed) * 0.35 },            // подол мантии
        { r: [0, 0, 0.72, 0.75], dy: breath * 0.3 },                                // тело
        { r: [0.72, 0, 1, 1], dy: -lift + breath * 0.2 },                           // рука с посохом
      ] };
    }
    case 'dragon': { // крылья машут; при выдохе голова выбрасывается вперёд, крылья распахиваются; хвост качается
      const fire = Math.min(1, atk * 1.6);
      const flap = (0.5 + 0.5 * Math.sin(t * 5 + seed)) * (1 - fire) + fire * 0.05;
      const tail = Math.sin(t * 2 + seed) * 0.8;
      return { o: { dy: Math.sin(t * 2.5 + seed) * 0.8, dx: 0.8 * fire }, parts: [
        { r: [0, 0, 0.47, 0.6], sy: 1 - flap * 0.22 + fire * 0.06, pivot: 'bottom' },   // левое крыло
        { r: [0.83, 0, 1, 0.72], sy: 1 - flap * 0.22 + fire * 0.06, pivot: 'bottom' },  // правое крыло
        { r: [0, 0.58, 0.47, 1], dx: tail },                                              // хвост
        { r: [0.83, 0.7, 1, 1] },
        { r: [0.45, 0.4, 0.85, 1] },                                                      // тело
        { r: [0.45, 0, 0.85, 0.42], dx: 1.2 * fire, dy: 0.6 * fire },                     // шея и голова
      ] };
    }
    default:
      return { o: {}, parts: [{ r: [0, 0, 1, 1] }] };
  }
}
