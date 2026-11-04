// Пиксель-арт в коде: каждая буква — цвет из палитры, точка — прозрачность.

const PAL = {
  k: '#1a1420', w: '#f2efe6', b: '#d8d2bc', B: '#9c9682',
  g: '#74b03e', G: '#3f7024', r: '#d0402e', R: '#7a1f1a',
  o: '#f08a2a', y: '#f3c843', Y: '#b8862a', n: '#8a5630', N: '#4d2d17',
  s: '#b4bcc6', S: '#5c6670', p: '#8a48c4', P: '#4a2270', v: '#d6a4ff',
  f: '#e6b07e', F: '#a8704a', l: '#3f9a52', L: '#1f5e34', c: '#7af4ff',
  e: '#ff3b3b', h: '#8a8a94', H: '#4f4f5a', u: '#3b6fd1', U: '#23408a',
  t: '#c9b48a', d: '#5a5a66',
};

const DEFS = {
  // ---------- защитники (смотрят вправо) ----------
  archer: [
    '....LLLL....',
    '...LLllLL...',
    '...Lffk...n.',
    '...Lfff....n',
    '....ff.....n',
    '..LLllLLffkn',
    '.fLllllL...n',
    '...LllL....n',
    '...LyyL...n.',
    '...LllL.....',
    '...Ll.lL....',
    '...nN.Nn....',
    '..NNN.NNN...',
  ],
  cyclops: [
    '.....FFFF.....',
    '....FffffF....',
    '...FfwwwwfF...',
    '...FfwkkwfF...',
    '...FffwwffF...',
    '....FfRRfF....',
    '..FFffffffFF..',
    '.FffFffffFffF.',
    '.FfF.ffff.FfF.',
    '.ff.NnnnnN.ff.',
    '....NnnnnN....',
    '.....ff.ff....',
    '....FFf.fFF...',
  ],
  lich: [
    '....PPPP..v.',
    '...PPPPPP.vv',
    '...PbbbbP.n.',
    '...PcbbcP.n.',
    '...PbBBbP.n.',
    '..PPPbbPPPn.',
    '.PpPPPPPPpb.',
    '.Pp.pPPp..n.',
    '...ppPPpp.n.',
    '..ppPPPPppn.',
    '..pPPvvPPp..',
    '.ppPPPPPPpp.',
    '.PPPPPPPPPP.',
  ],
  dragon: [
    '..R..........R...',
    '..RR........RR...',
    '..RrR......RrR...',
    '..RrrR....RrrR...',
    '...RrrR..RrrR..RR',
    '....RrrRRrrR..RrrR',
    '.....RrrrrR..RrykR',
    '.RR..RrooorRRrrrRR',
    'R..RRrooooorrrRR..',
    '....RrooooorR.....',
    '....RrrrrrrR......',
    '....Rr..RrR.......',
    '....yR...yR.......',
  ],

  // ---------- враги (смотрят вправо) ----------
  skeleton: [
    '...bbb...',
    '..bwwwb..',
    '..bkwkb..',
    '..bwwwb..',
    '...bBb...',
    '..bbBbb.S',
    '.b.bBb.bS',
    '...bBb..S',
    '...bbb...',
    '..b...b..',
    '..b...b..',
    '.bb...bb.',
  ],
  skeleton_1: [
    '...bbb...',
    '..bwwwb..',
    '..bkwkb..',
    '..bwwwb..',
    '...bBb...',
    '..bbBbb.S',
    '.b.bBb.bS',
    '...bBb..S',
    '...bbb...',
    '...b.b...',
    '...b.b...',
    '..bb.bb..',
  ],
  goblin: [
    'G........G',
    'gG.gggg.Gg',
    '.gggggggg.',
    '..geggeg..',
    '..gggggg..',
    '...gkkg...',
    '..nNnnNn.s',
    '.g.nnnn.gs',
    '...NnnN...',
    '...g..g...',
    '..gg..gg..',
  ],
  goblin_1: [
    'G........G',
    'gG.gggg.Gg',
    '.gggggggg.',
    '..geggeg..',
    '..gggggg..',
    '...gkkg...',
    '..nNnnNn.s',
    '.g.nnnn.gs',
    '...NnnN...',
    '....gg....',
    '...gg.g...',
  ],
  wolf: [
    '......NN.......',
    '.....NffkN.....',
    '.....NnnN......',
    '....sNnnN......',
    '...sHHnnHH.....',
    '.H..hhhhhhh.hh.',
    'HhHhhhhhhhhhhhk',
    '.HhhhhhhhhhhhH.',
    '..hhhhhhhhhh...',
    '..h.h....h.h...',
    '..H.H....H.H...',
  ],
  wolf_1: [
    '......NN.......',
    '.....NffkN.....',
    '.....NnnN......',
    '....sNnnN......',
    '...sHHnnHH.....',
    '.H..hhhhhhh.hh.',
    'HhHhhhhhhhhhhhk',
    '.HhhhhhhhhhhhH.',
    '..hhhhhhhhhh...',
    '...hh....hh....',
    '..H...H.H...H..',
  ],
  gargoyle: [
    'H............H',
    'HhH...dd...HhH',
    'HhhH.dhhd.HhhH',
    '.HhhHheehHhhH.',
    '..HhhhhhhhhH..',
    '...Hhhhhhhh...',
    '....dhhhhd....',
    '.....hddh.....',
    '....hd..dh....',
    '....H....H....',
  ],
  gargoyle_1: [
    '..............',
    '......dd......',
    '.....dhhd.....',
    '.HHHHheehHHHH.',
    'HhhhhhhhhhhhhH',
    'H..Hhhhhhhh..H',
    '....dhhhhd....',
    '.....hddh.....',
    '....hd..dh....',
    '....H....H....',
  ],
  orc: [
    '...SSSSS....',
    '..SsssssS...',
    '..SGGGGGS...',
    '..SGeGeGS...',
    '...GwGwG....',
    '..SSssSSS..s',
    '.GSsssssSGsS',
    '.G.SsssS..s.',
    '...SSSSS..s.',
    '...nN.Nn....',
    '...SS.SS....',
    '..SSS.SSS...',
  ],
  orc_1: [
    '...SSSSS....',
    '..SsssssS...',
    '..SGGGGGS...',
    '..SGeGeGS...',
    '...GwGwG....',
    '..SSssSSS..s',
    '.GSsssssSGsS',
    '.G.SsssS..s.',
    '...SSSSS..s.',
    '....nNn.....',
    '....SSS.....',
    '...SS.SS....',
  ],
  troll: [
    '.y..........y.......',
    '.yy..GGGGG..yy......',
    '..yyGgggggGyy.......',
    '...GgggggggG........',
    '...GgeggeggG........',
    '...GgggggggG........',
    '....GgwkkwG.........',
    '..GGGgggggGGG....n..',
    '.GgggGgggGgggG..nNn.',
    'GgggggGggGgggggGnNn.',
    'GggGgggggggGgggGnn..',
    'Ggg.GgggggggG.ggn...',
    '.gg.NnnnnnnnN.gg....',
    '....NnnnnnnnN.......',
    '....GgggGgggG.......',
    '....Ggg...ggG.......',
    '...GGgg...ggGG......',
    '..GGGG.....GGGG.....',
  ],
  troll_1: [
    '.y..........y.......',
    '.yy..GGGGG..yy......',
    '..yyGgggggGyy.......',
    '...GgggggggG........',
    '...GgeggeggG........',
    '...GgggggggG........',
    '....GgwkkwG.........',
    '..GGGgggggGGG....n..',
    '.GgggGgggGgggG..nNn.',
    'GgggggGggGgggggGnNn.',
    'GggGgggggggGgggGnn..',
    'Ggg.GgggggggG.ggn...',
    '.gg.NnnnnnnnN.gg....',
    '....NnnnnnnnN.......',
    '....GgggGgggG.......',
    '.....Gggggg.........',
    '....GGg..gGG........',
    '...GGGG..GGGG.......',
  ],
};

const cache = {};

function build(rows, colorOverride) {
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      x.fillStyle = colorOverride || PAL[ch] || '#f0f';
      x.fillRect(i, j, 1, 1);
    }
  });
  return c;
}

function outlined(src) {
  // тёмный контур вокруг спрайта — читается на любой траве
  const c = document.createElement('canvas');
  c.width = src.width + 2; c.height = src.height + 2;
  const x = c.getContext('2d');
  const sil = document.createElement('canvas');
  sil.width = src.width; sil.height = src.height;
  const sx = sil.getContext('2d');
  sx.drawImage(src, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = PAL.k; sx.fillRect(0, 0, sil.width, sil.height);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(sil, dx, dy);
  x.drawImage(src, 1, 1);
  return c;
}

function flipped(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.translate(src.width, 0); x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

function whiteOf(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// get('skeleton', frame, flip, white)
export function sprite(name, frame = 0, flip = false, white = false) {
  const key = `${name}|${frame}|${flip}|${white}`;
  if (cache[key]) return cache[key];
  const rows = (frame && DEFS[`${name}_${frame}`]) || DEFS[name];
  let c = outlined(build(rows));
  if (white) c = whiteOf(c);
  if (flip) c = flipped(c);
  cache[key] = c;
  return c;
}

export function hasFrame(name, frame) { return !!DEFS[`${name}_${frame}`]; }

// Крошечный шрифт 3x5 для цифр урона
const DIGITS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001111', '-': '000000111000000', '+': '000010111010000',
};
export function drawNumber(ctx, str, x, y, color) {
  const s = String(str);
  const totalW = s.length * 4 - 1;
  let cx = Math.round(x - totalW / 2);
  y = Math.round(y);
  for (const ch of s) {
    const bits = DIGITS[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] !== '1') continue;
        const px = cx + (i % 3), py = y + Math.floor(i / 3);
        ctx.fillStyle = PAL.k;
        ctx.fillRect(px + 1, py + 1, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    cx += 4;
  }
}

export { PAL };
