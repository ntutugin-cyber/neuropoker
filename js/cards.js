window.NP = window.NP || {};

NP.SUIT_CH = ['♠', '♥', '♦', '♣'];
NP.RANK_CH = '23456789TJQKA';
NP.RANK_RU = { 2: 'двойка', 3: 'тройка', 4: 'четвёрка', 5: 'пятёрка', 6: 'шестёрка', 7: 'семёрка', 8: 'восьмёрка', 9: 'девятка', 10: 'десятка', 11: 'валет', 12: 'дама', 13: 'король', 14: 'туз' };
NP.RANK_PL = { 2: 'двоек', 3: 'троек', 4: 'четвёрок', 5: 'пятёрок', 6: 'шестёрок', 7: 'семёрок', 8: 'восьмёрок', 9: 'девяток', 10: 'десяток', 11: 'валетов', 12: 'дам', 13: 'королей', 14: 'тузов' };

NP.C = function (str) {
  str = String(str).trim();
  const s = NP.SUIT_CH.indexOf(str[str.length - 1]);
  const rs = str.slice(0, -1).toUpperCase();
  const r = rs === '10' ? 10 : NP.RANK_CH.indexOf(rs) + 2;
  return { r, s };
};
NP.ckey = c => c.r * 4 + c.s;
NP.rlabel = r => r === 10 ? '10' : NP.RANK_CH[r - 2];
NP.deck52 = () => { const d = []; for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) d.push({ r, s }); return d; };

NP.cardHTML = function (c, cls = '') {
  const red = c.s === 1 || c.s === 2;
  return `<div class="pcard ${cls}"><div class="in"><div class="f ${red ? 'red' : ''}">
    <div class="cn">${NP.rlabel(c.r)}<span>${NP.SUIT_CH[c.s]}</span></div>
    <div class="cs">${NP.SUIT_CH[c.s]}</div>
    <div class="cn br">${NP.rlabel(c.r)}<span>${NP.SUIT_CH[c.s]}</span></div>
  </div><div class="b">♠</div></div></div>`;
};

NP.makeCard = function (c, opt = {}) {
  const el = document.createElement('div');
  el.className = 'pcard' + (opt.big ? ' big' : '') + (opt.mini ? ' mini' : '') + (opt.tiny ? ' tiny' : '') + (opt.down ? ' down' : '') + (opt.deal === false ? '' : ' deal');
  if (opt.delay) el.style.animationDelay = opt.delay + 'ms';
  el.innerHTML = NP.cardHTML(c).replace('class="pcard "', 'class="pcard"');
  el.innerHTML = NP.cardHTML(c).match(/<div class="in">[\s\S]*<\/div><\/div>/)[0];
  el._card = c;
  return el;
};

/* Оценка комбинации */
NP.straightHigh = function (m) {
  let mm = m; if (mm & (1 << 14)) mm |= 1 << 1;
  let run = 0;
  for (let r = 14; r >= 1; r--) {
    if (mm & (1 << r)) { run++; if (run >= 5) return r + 4; } else run = 0;
  }
  return 0;
};

NP.evaluate7 = function (cs) {
  const cnt = new Array(15).fill(0), sc = [0, 0, 0, 0], sr = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cs) { cnt[c.r]++; mask |= 1 << c.r; sc[c.s]++; sr[c.s] |= 1 << c.r; }
  const top = (m, n, ex = []) => { const out = []; for (let r = 14; r >= 2 && out.length < n; r--) if ((m & (1 << r)) && !ex.includes(r)) out.push(r); return out; };
  const enc = (cat, t) => { let s = cat; for (let i = 0; i < 5; i++) s = s * 15 + (t[i] || 0); return { score: s, cat, t }; };
  let fs = -1; for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) { const sf = NP.straightHigh(sr[fs]); if (sf) return enc(8, [sf]); }
  let quad = 0; const trips = [], pairs = [];
  for (let r = 14; r >= 2; r--) {
    if (cnt[r] === 4) quad = quad || r;
    else if (cnt[r] === 3) trips.push(r);
    else if (cnt[r] === 2) pairs.push(r);
  }
  if (quad) return enc(7, [quad, top(mask, 1, [quad])[0]]);
  if (trips.length && (trips.length > 1 || pairs.length)) return enc(6, [trips[0], trips.length > 1 ? trips[1] : pairs[0]]);
  if (fs >= 0) return enc(5, top(sr[fs], 5));
  const sh = NP.straightHigh(mask); if (sh) return enc(4, [sh]);
  if (trips.length) return enc(3, [trips[0], ...top(mask, 2, [trips[0]])]);
  if (pairs.length >= 2) return enc(2, [pairs[0], pairs[1], top(mask, 1, [pairs[0], pairs[1]])[0]]);
  if (pairs.length === 1) return enc(1, [pairs[0], ...top(mask, 3, [pairs[0]])]);
  return enc(0, top(mask, 5));
};

NP.bestFive = function (cs) {
  let best = null, bs = -1; const n = cs.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++) for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
    const five = [cs[a], cs[b], cs[c], cs[d], cs[e]];
    const s = NP.evaluate7(five).score;
    if (s > bs) { bs = s; best = five; }
  }
  return best;
};

NP.comboName = function (ev) {
  const t = ev.t;
  if (ev.cat === 8) return t[0] === 14 ? 'Роял-флеш' : 'Стрит-флеш до ' + NP.rlabel(t[0]);
  if (ev.cat === 7) return 'Каре ' + NP.RANK_PL[t[0]];
  if (ev.cat === 6) return 'Фулл-хаус: ' + NP.RANK_RU[t[0]] + ' + ' + NP.RANK_RU[t[1]];
  if (ev.cat === 5) return 'Флеш до ' + NP.rlabel(t[0]);
  if (ev.cat === 4) return 'Стрит до ' + NP.rlabel(t[0]);
  if (ev.cat === 3) return 'Тройка ' + NP.RANK_PL[t[0]];
  if (ev.cat === 2) return 'Две пары: ' + NP.RANK_RU[t[0]] + ' и ' + NP.RANK_RU[t[1]];
  if (ev.cat === 1) return 'Пара ' + NP.RANK_PL[t[0]];
  return 'Старшая карта ' + NP.rlabel(t[0]);
};

/* Сила руки и эквити */
NP.boardInfo = function (board) {
  if (!board.length) return { wet: 0, flush3: false, str3: false, paired: false };
  const sc = [0, 0, 0, 0], cnt = {}; let m = 0;
  for (const c of board) { sc[c.s]++; cnt[c.r] = (cnt[c.r] || 0) + 1; m |= 1 << c.r; }
  const flush3 = Math.max(...sc) >= 3;
  const paired = Object.values(cnt).some(v => v >= 2);
  let mm = m; if (mm & (1 << 14)) mm |= 1 << 1;
  let str3 = false;
  for (let hi = 5; hi <= 14 && !str3; hi++) {
    let n = 0; for (let r = hi - 4; r <= hi; r++) if (mm & (1 << r)) n++;
    if (n >= 3) str3 = true;
  }
  return { wet: NP.clamp((flush3 ? .45 : 0) + (str3 ? .35 : 0) + (paired ? .2 : 0), 0, 1), flush3, str3, paired };
};

NP.handStrength = function (hole, board) {
  if (board.length === 0) {
    const a = hole[0], b = hole[1], hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
    let v = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
    if (a.r === b.r) v = Math.max(5, v * 2);
    if (a.s === b.s) v += 2;
    if (a.r !== b.r) {
      const gap = hi - lo - 1;
      v -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
      if (gap <= 1 && hi < 12) v += 1;
    }
    return { s: NP.clamp((v + 2) / 22, .03, .97), draw: 0 };
  }
  const all = [...hole, ...board], ev = NP.evaluate7(all), cat = ev.cat, t = ev.t;
  const holeR = hole.map(c => c.r), holeS = hole.map(c => c.s);
  const uses = r => holeR.includes(r);
  let base;
  if (cat === 0) base = .08 + t[0] / 14 * .10;
  else if (cat === 1) {
    base = uses(t[0]) ? .30 + t[0] / 14 * .15 : .15;
    if (uses(t[0]) && t[0] === Math.max(...board.map(c => c.r))) base += .08;
  }
  else if (cat === 2) { const u = (uses(t[0]) ? 1 : 0) + (uses(t[1]) ? 1 : 0); base = u === 2 ? .56 : u === 1 ? .46 : .28; }
  else if (cat === 3) base = uses(t[0]) ? .63 : .44;
  else if (cat === 4) base = .72;
  else if (cat === 5) base = .78;
  else if (cat === 6) base = .88;
  else if (cat === 7) base = .96;
  else base = .99;
  let draw = 0;
  if (board.length < 5 && cat < 5) {
    const sc = [0, 0, 0, 0];
    for (const c of all) sc[c.s]++;
    for (let s = 0; s < 4; s++) if (sc[s] === 4 && holeS.includes(s)) draw = Math.max(draw, .16);
  }
  const bi = NP.boardInfo(board);
  let danger = 0;
  if (bi.flush3 && cat < 5) danger += .10;
  if (bi.str3 && cat < 4) danger += .06;
  if (bi.paired && (cat === 4 || cat === 5)) danger += .08;
  return { s: NP.clamp(base + draw - danger, .02, .99), draw };
};

NP.mcEquity = function (hole, board, n = 150) {
  const known = new Set([...hole, ...board].map(NP.ckey));
  const rest = NP.deck52().filter(c => !known.has(NP.ckey(c)));
  const need = 2 + (5 - board.length);
  let win = 0, tie = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < need; j++) {
      const k = j + NP.rndi(rest.length - j);
      [rest[j], rest[k]] = [rest[k], rest[j]];
    }
    const b = board.concat(rest.slice(2, need));
    const a = NP.evaluate7(hole.concat(b)).score;
    const o = NP.evaluate7([rest[0], rest[1]].concat(b)).score;
    if (a > o) win++; else if (a === o) tie++;
  }
  return (win + tie * .5) / n;
};