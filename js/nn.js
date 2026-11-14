window.NP = window.NP || {};
NP.NN_SIZES = [20, 48, 32, 5];
NP.ACT_NAMES = ['Фолд', 'Чек/Колл', 'Рейз ½', 'Рейз банк', 'Олл-ин'];

NP.MLP = class {
  constructor(sizes = NP.NN_SIZES) {
    this.sizes = sizes; this.L = sizes.length - 1;
    this.W = []; this.B = [];
    for (let l = 0; l < this.L; l++) {
      const fin = sizes[l], fout = sizes[l + 1], sc = Math.sqrt(6 / (fin + fout));
      const w = new Float64Array(fin * fout);
      for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * sc;
      this.W.push(w); this.B.push(new Float64Array(fout));
    }
    this.gW = this.W.map(w => new Float64Array(w.length));
    this.gB = this.B.map(b => new Float64Array(b.length));
    this.mW = this.W.map(w => new Float64Array(w.length));
    this.vW = this.W.map(w => new Float64Array(w.length));
    this.mB = this.B.map(b => new Float64Array(b.length));
    this.vB = this.B.map(b => new Float64Array(b.length));
    this.t = 0; this.lastAct = null;
  }
  forward(x, mask) {
    const acts = [x]; let inp = x;
    for (let l = 0; l < this.L; l++) {
      const fin = this.sizes[l], fout = this.sizes[l + 1], w = this.W[l], b = this.B[l];
      const out = new Float64Array(fout);
      for (let j = 0; j < fout; j++) {
        let s = b[j]; const off = j * fin;
        for (let i = 0; i < fin; i++) s += w[off + i] * inp[i];
        out[j] = l < this.L - 1 ? Math.tanh(s) : s;
      }
      acts.push(out); inp = out;
    }
    const z = acts[this.L];
    let mx = -1e9;
    for (let i = 0; i < z.length; i++) if (!mask || mask[i]) mx = Math.max(mx, z[i]);
    let sum = 0; const p = new Float64Array(z.length);
    for (let i = 0; i < z.length; i++) {
      if (mask && !mask[i]) { p[i] = 0; continue; }
      p[i] = Math.exp(z[i] - mx); sum += p[i];
    }
    for (let i = 0; i < p.length; i++) p[i] /= sum;
    this.lastAct = acts; this.lastProbs = p;
    return p;
  }
  entropy(p) { let h = 0; for (const v of p) if (v > 1e-9) h -= v * Math.log(v); return h; }
  zeroGrad() { this.gW.forEach(g => g.fill(0)); this.gB.forEach(g => g.fill(0)); }
  accumStep(x, mask, p, a, adv, beta) {
    const H = this.entropy(p);
    const dz = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) {
      if (mask && !mask[i]) continue;
      dz[i] = adv * (p[i] - (i === a ? 1 : 0)) + beta * p[i] * (Math.log(Math.max(p[i], 1e-9)) + H);
    }
    let da = dz;
    for (let l = this.L - 1; l >= 0; l--) {
      const fin = this.sizes[l], fout = this.sizes[l + 1];
      const inp = this.lastActCache[l], out = this.lastActCache[l + 1];
      const dh = l < this.L - 1 ? da.map((v, i) => v * (1 - out[i] * out[i])) : da;
      const gw = this.gW[l], gb = this.gB[l];
      for (let j = 0; j < fout; j++) {
        gb[j] += dh[j]; const off = j * fin;
        for (let i = 0; i < fin; i++) gw[off + i] += dh[j] * inp[i];
      }
      if (l > 0) {
        const w = this.W[l], nd = new Float64Array(fin);
        for (let j = 0; j < fout; j++) { const off = j * fin; for (let i = 0; i < fin; i++) nd[i] += w[off + i] * dh[j]; }
        da = nd;
      }
    }
  }
  adam(lr) {
    this.t++;
    const b1 = .9, b2 = .999, eps = 1e-8;
    let norm = 0;
    for (const g of this.gW) for (const v of g) norm += v * v;
    for (const g of this.gB) for (const v of g) norm += v * v;
    const clip = Math.sqrt(norm) > 1 ? 1 / Math.sqrt(norm) : 1;
    const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    const upd = (arr, g, m, v) => {
      for (let i = 0; i < arr.length; i++) {
        const gi = g[i] * clip;
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        arr[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
      }
    };
    for (let l = 0; l < this.L; l++) {
      upd(this.W[l], this.gW[l], this.mW[l], this.vW[l]);
      upd(this.B[l], this.gB[l], this.mB[l], this.vB[l]);
    }
  }
  serialize() { return { sizes: this.sizes, W: this.W.map(w => [...w]), B: this.B.map(b => [...b]), t: this.t }; }
  load(d) {
    if (!d || d.sizes.join() !== this.sizes.join()) return false;
    for (let l = 0; l < this.L; l++) {
      if (d.W[l].length !== this.W[l].length) return false;
      this.W[l].set(d.W[l]); this.B[l].set(d.B[l]);
    }
    this.t = d.t || 0;
    return true;
  }
};

NP.buildFeatures = function (hand, p, opp) {
  const L = hand.legalFor(p);
  const { s, draw } = NP.handStrength(hand.hole[p], hand.board);
  const pot = L ? L.potNow : hand.potNow(), toCall = L ? L.toCall : 0;
  const total = hand.startStacks[0] + hand.startStacks[1];
  const eff = Math.min(hand.stacks[0] + hand.bets[0], hand.stacks[1] + hand.bets[1]);
  const bi = NP.boardInfo(hand.board);
  const x = new Float64Array(20);
  x[0] = s;
  x[hand.stage === 0 ? 1 : hand.stage <= 3 ? hand.stage + 1 : 4] = 1;
  x[5] = Math.log1p(pot / hand.bb) / Math.log1p(200);
  x[6] = NP.clamp(toCall / (hand.stacks[p] + toCall + 1e-9), 0, 1);
  x[7] = toCall > 0 ? toCall / (pot + toCall) : 0;
  x[8] = (hand.stacks[p] + hand.bets[p]) / total;
  x[9] = Math.log1p(eff / hand.bb) / Math.log1p(200);
  x[10] = p === hand.button ? 1 : 0;
  x[11] = NP.clamp(hand.streetBets[p] / 4, 0, 1);
  x[12] = NP.clamp(hand.streetBets[1 - p] / 4, 0, 1);
  x[13] = opp.fold; x[14] = opp.aggr; x[15] = opp.myAggr;
  x[16] = bi.wet; x[17] = draw;
  x[18] = NP.clamp(hand.raises / 5, 0, 1);
  x[19] = NP.clamp(hand.totalActs / 12, 0, 1);
  return { x, s, draw };
};

NP.nnMask = function (hand, p, allowBluff, s, draw) {
  const L = hand.legalFor(p);
  const m = [true, true, true, true, true];
  if (!L.canFold) m[0] = false;
  if (!L.canRaise) m[2] = m[3] = m[4] = false;
  if (!allowBluff && s < .38 && draw < .12) m[2] = m[3] = m[4] = false;
  return m;
};

NP.nnActionFrom = function (idx, hand, p) {
  const L = hand.legalFor(p);
  if (idx === 0) return { a: L.canFold ? 'fold' : 'check', to: 0 };
  if (idx === 1) return { a: L.canCheck ? 'check' : 'call', to: 0 };
  if (idx === 2) return { a: 'raise', to: hand.sizeFor(p, 'half') };
  if (idx === 3) return { a: 'raise', to: hand.sizeFor(p, 'pot') };
  return { a: 'raise', to: L.maxTo };
};

NP.Model = {
  net: new NP.MLP(),
  hands: 0, baseline: 0, rewardEMA: 0, entEMA: 0, activeSec: 0,
  opp: [{ fold: .3, aggr: .35, myAggr: .35 }, { fold: .3, aggr: .35, myAggr: .35 }],
  bluffWin: 0, bluffCnt: 0,
  charts: { reward: [], win: [], bluffF: [], bluffS: [] },
  lastWin: null,
  save() {
    NP.store.set('np_model_v2', {
      v: 2, net: this.net.serialize(), hands: this.hands, baseline: this.baseline,
      rewardEMA: this.rewardEMA, entEMA: this.entEMA, activeSec: this.activeSec,
      opp: this.opp, charts: this.charts, lastWin: this.lastWin,
      bluffWin: this.bluffWin, bluffCnt: this.bluffCnt
    });
  },
  load() {
    const d = NP.store.get('np_model_v2', null);
    if (!d || d.v !== 2 || !this.net.load(d.net)) return false;
    Object.assign(this, {
      hands: d.hands || 0, baseline: d.baseline || 0, rewardEMA: d.rewardEMA || 0,
      entEMA: d.entEMA || 0, activeSec: d.activeSec || 0, opp: d.opp || this.opp,
      charts: d.charts || this.charts, lastWin: d.lastWin,
      bluffWin: d.bluffWin || 0, bluffCnt: d.bluffCnt || 0
    });
    return true;
  },
  reset() {
    this.net = new NP.MLP();
    this.hands = 0; this.baseline = 0; this.rewardEMA = 0; this.entEMA = 0; this.activeSec = 0;
    this.opp = [{ fold: .3, aggr: .35, myAggr: .35 }, { fold: .3, aggr: .35, myAggr: .35 }];
    this.charts = { reward: [], win: [], bluffF: [], bluffS: [] };
    this.lastWin = null; this.bluffWin = 0; this.bluffCnt = 0;
  }
};