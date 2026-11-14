window.NP = window.NP || {};

NP.Chart = class {
  constructor(canvas, opt) {
    this.cv = canvas; this.colors = opt.colors;
    this.data = this.colors.map(() => []);
    this.max = opt.max || 240;
    this.yMin = opt.yMin ?? null; this.yMax = opt.yMax ?? null;
    this.ref = opt.ref ?? null; this.fmtV = opt.fmtV || (v => v.toFixed(0));
  }
  push(vals) { vals.forEach((v, i) => { this.data[i].push(v); if (this.data[i].length > this.max) this.data[i].shift(); }); }
  fit() {
    const r = this.cv.getBoundingClientRect();
    if (r.width < 20) return false;
    const dpr = Math.min(devicePixelRatio, 2);
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx = this.cv.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = r.width; this.H = r.height;
    return true;
  }
  draw() {
    if (!this.fit()) return;
    const ctx = this.ctx, W = this.W, H = this.H, padL = 36, padB = 16, padT = 8, padR = 8;
    ctx.clearRect(0, 0, W, H);
    const all = this.data.flat();
    let lo = this.yMin, hi = this.yMax;
    if (lo == null) lo = Math.min(all.length ? Math.min(...all) : 0, -.05);
    if (hi == null) hi = Math.max(all.length ? Math.max(...all) : 1, .05);
    if (hi - lo < 1e-6) hi = lo + 1;
    const pad = (hi - lo) * .12; lo -= pad; hi += pad;
    const X = i => padL + (W - padL - padR) * i / (this.max - 1);
    const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    ctx.strokeStyle = 'rgba(49,70,92,.5)'; ctx.fillStyle = '#5f7688'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
    for (let g = 0; g <= 3; g++) { const v = lo + (hi - lo) * g / 3, y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(this.fmtV(v), padL - 5, y + 3); }
    if (this.ref != null) { ctx.save(); ctx.strokeStyle = 'rgba(233,185,92,.55)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(padL, Y(this.ref)); ctx.lineTo(W - padR, Y(this.ref)); ctx.stroke(); ctx.restore(); }
    this.data.forEach((arr, si) => {
      if (!arr.length) return;
      const col = this.colors[si], off = this.max - arr.length;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 7; ctx.beginPath();
      arr.forEach((v, i) => { const x = X(off + i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      const lx = X(off + arr.length - 1), ly = Y(arr[arr.length - 1]);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, 6.28); ctx.fill();
    });
    if (!all.length) { ctx.fillStyle = '#5f7688'; ctx.font = '12px Manrope'; ctx.textAlign = 'center'; ctx.fillText('Запустите обучение', W / 2, H / 2); }
  }
};

NP.NetViz = {
  pulse: 0, chosen: -1,
  draw() {
    const cv = NP.$('#netCanvas'), r = cv.getBoundingClientRect();
    if (r.width < 20) return;
    const dpr = Math.min(devicePixelRatio, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    const sizes = NP.NN_SIZES, cols = sizes.length;
    const xs = sizes.map((_, l) => 40 + (W - 110) * l / (cols - 1));
    const pos = sizes.map((n, l) => Array.from({ length: n }, (_, i) => ({ x: xs[l], y: 24 + (H - 54) * i / (n - 1) })));
    const acts = NP.Model.net.lastAct;
    for (let l = 0; l < cols - 1; l++) {
      const w = NP.Model.net.W[l], fin = sizes[l];
      for (let j = 0; j < sizes[l + 1]; j += l ? 1 : 2) for (let i = 0; i < fin; i += l ? 3 : 2) {
        const v = w[j * fin + i], a = Math.min(.4, Math.abs(v) * .35);
        if (a < .03) continue;
        ctx.strokeStyle = v > 0 ? `rgba(63,214,255,${a})` : `rgba(255,79,163,${a})`;
        ctx.lineWidth = .7; ctx.beginPath();
        ctx.moveTo(pos[l][i].x, pos[l][i].y); ctx.lineTo(pos[l + 1][j].x, pos[l + 1][j].y); ctx.stroke();
      }
    }
    for (let l = 0; l < cols; l++) for (let i = 0; i < sizes[l]; i++) {
      const p = pos[l][i];
      const a = acts?.[l] ? NP.clamp(Math.abs(acts[l][i] || 0), 0, 1) : 0;
      const rad = l === cols - 1 ? 7 : l === 0 ? 3.2 : 2.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.28);
      ctx.fillStyle = l === cols - 1 ? `rgba(233,185,92,${.25 + a * .75})` : `rgba(63,214,255,${.18 + a * .7})`;
      ctx.fill();
      if (l === cols - 1 && i === this.chosen) {
        ctx.save(); ctx.strokeStyle = '#f6d488'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad + 4 + 2 * Math.sin(this.pulse), 0, 6.28); ctx.stroke(); ctx.restore();
      }
    }
    ctx.fillStyle = '#9db2c2'; ctx.font = '10px Manrope'; ctx.textAlign = 'center';
    ['Вход · 20', 'Скрытый · 48', 'Скрытый · 32', 'Выход · 5'].forEach((t, l) => ctx.fillText(t, xs[l], H - 8));
    ctx.textAlign = 'left'; ctx.fillStyle = '#e9b95c'; ctx.font = '10px JetBrains Mono';
    NP.ACT_NAMES.forEach((t, i) => { const p = pos[cols - 1][i]; ctx.fillText(t, p.x + 13, p.y + 3); });
  }
};

NP.Lab = {
  mode: 'self', speed: 1, running: false, lr: .002, beta: .012,
  allowBluff: true, learnBluff: true, autoSave: true,
  hand: null, button: 0, traj: [[], []], bluffFlag: [false, false],
  rBuf: [], bluffWinW: 0, bluffCntW: 0, acc: 0, lastRender: 0, miniDirty: true,
  charts: {},

  init() {
    this.charts.reward = new NP.Chart(NP.$('#chReward'), { colors: ['#e9b95c'], fmtV: v => v.toFixed(2) });
    this.charts.win = new NP.Chart(NP.$('#chWin'), { colors: ['#3fd6ff'], yMin: 0, yMax: 100, ref: 50, fmtV: v => v + '%' });
    this.charts.bluff = new NP.Chart(NP.$('#chBluff'), { colors: ['#ff4fa3', '#3ddc84'], yMin: 0, yMax: 100, fmtV: v => v + '%' });
    this.fromModel();
  },
  fromModel() {
    this.charts.reward.data[0] = [...NP.Model.charts.reward];
    this.charts.win.data[0] = [...NP.Model.charts.win];
    this.charts.bluff.data[0] = [...NP.Model.charts.bluffF];
    this.charts.bluff.data[1] = [...NP.Model.charts.bluffS];
  },
  toModel() {
    NP.Model.charts = {
      reward: [...this.charts.reward.data[0]], win: [...this.charts.win.data[0]],
      bluffF: [...this.charts.bluff.data[0]], bluffS: [...this.charts.bluff.data[1]]
    };
  },
  seatIsNN(p) { return this.mode === 'self' || p === 0; },
  newHand() {
    this.hand = new NP.PokerHand([1000, 1000], this.button, 5, 10);
    this.traj = [[], []]; this.bluffFlag = [false, false];
    this.button = 1 - this.button; this.miniDirty = true;
    if (this.hand.over) this.finalize();
  },
  stepDecision() {
    if (!this.hand || this.hand.over) this.newHand();
    const h = this.hand; if (h.over) return;
    const p = h.toAct;
    let d;
    if (this.seatIsNN(p)) {
      const f = NP.buildFeatures(h, p, NP.Model.opp[p]);
      const mask = NP.nnMask(h, p, this.allowBluff, f.s, f.draw);
      const probs = NP.Model.net.forward(f.x, mask);
      let idx = 0, r = Math.random(), acc = 0;
      for (let i = 0; i < 5; i++) { acc += probs[i]; if (r <= acc) { idx = i; break; } }
      NP.Model.entEMA = NP.Model.entEMA * .98 + NP.Model.net.entropy(probs) * .02;
      NP.NetViz.chosen = idx;
      this.traj[p].push({ x: f.x, mask, a: idx, p: probs, acts: NP.Model.net.lastAct });
      d = NP.nnActionFrom(idx, h, p);
      if (f.s < .38 && f.draw < .12 && d.a === 'raise') this.bluffFlag[p] = true;
    } else d = NP.algoDecide(h, p, { bluff: true, bluffFreq: .18 });
    h.act(d.a, d.to);
    this.miniDirty = true;
    if (h.over) this.finalize();
  },
  finalize() {
    const h = this.hand;
    NP.Model.hands++;
    for (const p of [0, 1]) {
      const o = NP.Model.opp[p], a = .03;
      o.fold = o.fold * (1 - a) + (h.foldedBy === 1 - p ? 1 : 0) * a;
    }
    NP.Model.net.zeroGrad();
    let steps = 0;
    for (const p of [0, 1]) {
      if (!this.traj[p].length) continue;
      let reward = Math.tanh(h.delta[p] / 120);
      const bluffSuccess = this.bluffFlag[p] && h.winner === p && h.reason === 'fold';
      if (this.bluffFlag[p]) { this.bluffCntW++; NP.Model.bluffCnt++; }
      if (bluffSuccess) { this.bluffWinW++; NP.Model.bluffWin++; if (this.learnBluff) reward += .15; }
      const adv = reward - NP.Model.baseline;
      NP.Model.baseline = NP.Model.baseline * .97 + reward * .03;
      NP.Model.rewardEMA = NP.Model.rewardEMA * .97 + reward * .03;
      for (const st of this.traj[p]) {
        NP.Model.net.lastActCache = st.acts;
        NP.Model.net.accumStep(st.x, st.mask, st.p, st.a, adv, this.beta);
        steps++;
      }
    }
    if (steps) {
      for (const g of NP.Model.net.gW) for (let i = 0; i < g.length; i++) g[i] /= steps;
      for (const g of NP.Model.net.gB) for (let i = 0; i < g.length; i++) g[i] /= steps;
      NP.Model.net.adam(this.lr);
    }
    this.rBuf.push(NP.Model.rewardEMA);
    if (NP.Model.hands % 10 === 0) {
      const w = this.rBuf.slice(-25);
      this.charts.reward.push([w.reduce((a, b) => a + b, 0) / w.length]);
    }
    if (NP.Model.hands % 25 === 0) {
      const f = NP.clamp(Math.round(this.bluffCntW / 25 * 200), 0, 100);
      const s = this.bluffCntW ? Math.round(this.bluffWinW / this.bluffCntW * 100) : 0;
      this.charts.bluff.push([f, s]);
      this.bluffCntW = 0; this.bluffWinW = 0;
    }
    if (NP.Model.hands % 150 === 0) this.runEval();
    if (this.autoSave && NP.Model.hands % 250 === 0) { this.toModel(); NP.Model.save(); }
    NP.$('#evalProg').style.width = (NP.Model.hands % 150) / 150 * 100 + '%';
  },
  runEval() {
    let wins = 0, btn = 0;
    for (let i = 0; i < 40; i++) {
      const h = new NP.PokerHand([1000, 1000], btn, 5, 10);
      btn = 1 - btn;
      let guard = 0;
      while (!h.over && guard++ < 60) {
        const p = h.toAct;
        let d;
        if (p === 0) {
          const f = NP.buildFeatures(h, 0, NP.Model.opp[0]);
          const probs = NP.Model.net.forward(f.x, NP.nnMask(h, 0, true, f.s, f.draw));
          let idx = 0, best = -1;
          for (let k = 0; k < 5; k++) if (probs[k] > best) { best = probs[k]; idx = k; }
          d = NP.nnActionFrom(idx, h, 0);
        } else d = NP.algoDecide(h, 1, { bluff: true, bluffFreq: .18 });
        h.act(d.a, d.to);
      }
      if (h.winner === 0) wins++; else if (h.winner === -1) wins += .5;
    }
    NP.Model.lastWin = Math.round(wins / 40 * 100);
    this.charts.win.push([NP.Model.lastWin]);
  },
  setRunning(on) {
    this.running = on;
    NP.$('#labRun').innerHTML = on ? '⏸ Пауза' : '▶ Начать обучение';
    NP.$('#labTab').classList.toggle('training', on);
    NP.$('#labStep').disabled = on;
    if (!on) { this.toModel(); NP.Model.save(); }
    if (on && NP.Model.hands === 0 && !this.charts.win.data[0].length) this.runEval();
  },
  renderMini() {
    const h = this.hand; if (!h) return;
    NP.$('#miniHandNo').textContent = 'раздача ' + NP.fmt(NP.Model.hands + 1);
    NP.$('#msNm0').textContent = '🧠 Нейро' + (this.mode === 'self' ? ' A' : '');
    NP.$('#msNm1').textContent = this.mode === 'self' ? '🧠 Нейро B' : '🤖 Алгоритм';
    for (const p of [0, 1]) {
      NP.$('#msSt' + p).textContent = NP.fmt(h.stacks[p]) + (h.bets[p] ? ' · ' + NP.fmt(h.bets[p]) : '');
      NP.$('#ms' + p).classList.toggle('turn', !h.over && h.toAct === p);
      NP.$('#msCards' + p).innerHTML = h.hole[p].map(c => NP.cardHTML(c, 'tiny')).join('');
      NP.$('#msAc' + p).textContent = h.over ? (h.winner === p ? '🏆 победил' : h.winner === -1 ? '🤝 ничья' : 'проиграл') : '';
    }
    NP.$('#msBoard').innerHTML = h.board.map(c => NP.cardHTML(c, 'tiny')).join('') || '<span class="faint" style="font-size:11px">общих карт нет</span>';
    NP.$('#msPot').textContent = 'Банк ' + NP.fmt(h.potNow());
    NP.$('#msStage').textContent = NP.STAGES[Math.min(h.stage, 4)].toLowerCase();
  },
  renderStats() {
    NP.$('#lsHands').textContent = NP.fmt(NP.Model.hands);
    const m = Math.floor(NP.Model.activeSec / 60), s = Math.floor(NP.Model.activeSec % 60);
    NP.$('#lsTime').textContent = m + ':' + String(s).padStart(2, '0');
    NP.$('#lsReward').textContent = NP.Model.rewardEMA.toFixed(3);
    NP.$('#lsWin').textContent = NP.Model.lastWin == null ? '—' : NP.Model.lastWin + '%';
    NP.$('#lsBluff').textContent = (NP.Model.bluffCnt ? Math.round(NP.Model.bluffCnt / Math.max(1, NP.Model.hands) * 100) : 0) + '%';
    NP.$('#lsBluffS').textContent = NP.Model.bluffCnt ? Math.round(NP.Model.bluffWin / NP.Model.bluffCnt * 100) + '%' : '—';
    NP.$('#lsRate').textContent = NP.Model.activeSec > 5 ? Math.round(NP.Model.hands / NP.Model.activeSec * 60) : 0;
  },
  render(force = false) {
    this.renderStats();
    if (this.miniDirty || force) { this.renderMini(); this.miniDirty = false; }
    Object.values(this.charts).forEach(c => c.draw());
    NP.NetViz.draw();
  }
};