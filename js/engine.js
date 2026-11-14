window.NP = window.NP || {};
NP.STAGES = ['ПРЕФЛОП', 'ФЛОП', 'ТЁРН', 'РИВЕР', 'ВСКРЫТИЕ'];

NP.PokerHand = class {
  constructor(stacks, button, sb, bb) {
    this.startStacks = [...stacks];
    this.stacks = [...stacks];
    this.invested = [0, 0];
    this.button = button; this.sb = sb; this.bb = bb;
    this.bets = [0, 0]; this.pot = 0; this.stage = 0;
    this.over = false; this.winner = -1; this.reason = '';
    this.deck = NP.shuffle(NP.deck52());
    this.hole = [this.deck.splice(0, 2), this.deck.splice(0, 2)];
    this.board = [];
    this.minRaise = bb; this.acted = [false, false];
    this.streetBets = [0, 0]; this.decisions = [0, 0];
    this.raises = 0; this.totalActs = 0; this.foldedBy = -1;
    this.lastBluff = [false, false];
    this._pay(button, sb); this._pay(1 - button, bb);
    this.toAct = button; this.events = [{ t: 'start' }];
    this._settleAllIn(true);
  }
  potNow() { return this.pot + this.bets[0] + this.bets[1]; }
  totalInvested() { return this.invested[0] + this.invested[1]; }
  _pay(p, amt) { const d = Math.min(amt, this.stacks[p]); this.stacks[p] -= d; this.bets[p] += d; this.invested[p] += d; return d; }
  legalFor(p) {
    if (this.over) return null;
    const o = 1 - p, toCall = Math.max(0, this.bets[o] - this.bets[p]);
    const maxTo = this.bets[p] + this.stacks[p];
    const canRaise = this.stacks[p] > toCall;
    let minTo = Math.max(this.bets[o] + this.minRaise, this.bb);
    if (minTo > maxTo) minTo = maxTo;
    return { toCall, canCheck: toCall === 0, canFold: toCall > 0, callAmt: Math.min(toCall, this.stacks[p]), canRaise, minTo, maxTo, potNow: this.potNow() };
  }
  act(a, to) {
    if (this.over) return [];
    this.events = [];
    const p = this.toAct, L = this.legalFor(p);
    this.decisions[p]++; this.totalActs++;
    if (a === 'fold') {
      this.foldedBy = p;
      this.events.push({ t: 'act', p, a: 'fold', amt: 0 });
      this._endFold(1 - p);
      return this.events;
    }
    if (a === 'check') { this.acted[p] = true; this.events.push({ t: 'act', p, a: 'check', amt: 0 }); }
    else if (a === 'call') {
      const d = this._pay(p, L.callAmt); this.acted[p] = true;
      this.events.push({ t: 'act', p, a: 'call', amt: d, allin: this.stacks[p] === 0 });
    } else if (a === 'raise') {
      const target = NP.clamp(Math.round(to || L.minTo), L.minTo, L.maxTo);
      const inc = target - this.bets[1 - p];
      this._pay(p, target - this.bets[p]);
      if (inc >= this.minRaise) this.minRaise = inc;
      this.acted = [false, false]; this.acted[p] = true;
      this.streetBets[p]++; this.raises++;
      this.events.push({ t: 'act', p, a: 'raise', amt: target, allin: this.stacks[p] === 0 });
    }
    this._after();
    return this.events;
  }
  _after() {
    const ai = this.stacks[0] === 0 || this.stacks[1] === 0;
    if (ai) {
      const smaller = this.bets[0] < this.bets[1] ? 0 : this.bets[1] < this.bets[0] ? 1 : -1;
      if (smaller === -1 || this.stacks[smaller] === 0) { this._settleAllIn(); return; }
    }
    if (this.bets[0] === this.bets[1] && this.acted[0] && this.acted[1]) { this._closeStreet(); return; }
    this.toAct = 1 - this.toAct;
  }
  _settleAllIn(initial = false) {
    if (this.over) return;
    const ai = this.stacks[0] === 0 || this.stacks[1] === 0;
    if (!ai) return;
    const smaller = this.bets[0] < this.bets[1] ? 0 : this.bets[1] < this.bets[0] ? 1 : -1;
    if (smaller !== -1 && this.stacks[smaller] > 0 && !initial) return;
    if (smaller !== -1) {
      const big = 1 - smaller, diff = this.bets[big] - this.bets[smaller];
      if (diff > 0) { this.bets[big] -= diff; this.stacks[big] += diff; this.invested[big] -= diff; this.events.push({ t: 'refund', p: big, amt: diff }); }
    }
    this.pot += this.bets[0] + this.bets[1]; this.bets = [0, 0];
    while (this.stage < 3) { this.stage++; this._dealBoard(); this.events.push({ t: 'street', stage: this.stage, runout: true }); }
    this._showdown();
  }
  _closeStreet() {
    this.pot += this.bets[0] + this.bets[1]; this.bets = [0, 0];
    this.acted = [false, false]; this.streetBets = [0, 0]; this.minRaise = this.bb;
    if (this.stage === 3) { this._showdown(); return; }
    this.stage++; this._dealBoard();
    this.events.push({ t: 'street', stage: this.stage });
    this.toAct = 1 - this.button;
  }
  _dealBoard() { this.board.push(...this.deck.splice(0, this.stage === 1 ? 3 : 1)); }
  _showdown() {
    this.pot += this.bets[0] + this.bets[1]; this.bets = [0, 0]; this.stage = 4;
    const e0 = NP.evaluate7([...this.hole[0], ...this.board]);
    const e1 = NP.evaluate7([...this.hole[1], ...this.board]);
    this.eval = [e0, e1];
    this.winner = e0.score > e1.score ? 0 : e1.score > e0.score ? 1 : -1;
    if (this.winner === -1) { const h = Math.floor(this.pot / 2); this.stacks[0] += h; this.stacks[1] += this.pot - h; }
    else this.stacks[this.winner] += this.pot;
    this.reason = 'showdown'; this.over = true;
    this.events.push({ t: 'showdown', e0, e1 });
    this._end();
  }
  _endFold(w) {
    this.winner = w; this.reason = 'fold'; this.stage = 4; this.over = true;
    this.stacks[w] += this.pot + this.bets[0] + this.bets[1];
    this.pot = 0; this.bets = [0, 0];
    this._end();
  }
  _end() {
    this.delta = [this.stacks[0] - this.startStacks[0], this.stacks[1] - this.startStacks[1]];
    this.events.push({ t: 'end', winner: this.winner, reason: this.reason, delta: this.delta, invested: [...this.invested], potTotal: this.totalInvested() });
  }
  sizeFor(p, kind) {
    const L = this.legalFor(p);
    if (!L || !L.canRaise) return null;
    const after = L.potNow + L.toCall;
    let target;
    if (kind === 'min') target = L.minTo;
    else if (kind === 'half') target = this.bets[1 - p] + Math.max(this.minRaise, Math.round(after * .5));
    else if (kind === 'pot') target = this.bets[1 - p] + Math.max(this.minRaise, Math.round(after));
    else target = L.maxTo;
    return NP.clamp(Math.round(target), L.minTo, L.maxTo);
  }
};

NP.algoDecide = function (hand, p, cfg) {
  const { s, draw } = NP.handStrength(hand.hole[p], hand.board);
  const L = hand.legalFor(p);
  const st = NP.clamp(s + (Math.random() - .5) * .08, 0, 1);
  const aggr = cfg.aggression ?? .55;
  const bluffF = cfg.bluff ? (cfg.bluffFreq ?? .18) : 0;
  const potOdds = L.toCall > 0 ? L.toCall / (L.potNow + L.toCall) : 0;
  const r = Math.random();
  const oppQuiet = hand.streetBets[1 - p] === 0;
  if (L.toCall > 0) {
    if (st > .78 && L.canRaise && r < aggr) return { a: 'raise', to: hand.sizeFor(p, st > .9 ? 'pot' : 'half') };
    if (st < .34 && L.canRaise && hand.stage >= 1 && oppQuiet && r < bluffF * .6) return { a: 'raise', to: hand.sizeFor(p, 'pot'), bluff: true };
    const need = potOdds * .92 + .05;
    if (st > need + .06) return { a: 'call' };
    if (st > need - .05 && L.toCall <= L.potNow * .3) return { a: 'call' };
    if (draw > .1 && st + .18 > need) return { a: 'call' };
    return { a: 'fold' };
  }
  if (st > .62 && L.canRaise && r < aggr + .25) return { a: 'raise', to: hand.sizeFor(p, st > .82 ? 'pot' : 'half') };
  if (draw > .1 && L.canRaise && r < .5) return { a: 'raise', to: hand.sizeFor(p, 'half') };
  if (st < .32 && L.canRaise && hand.stage >= 1 && r < bluffF) return { a: 'raise', to: hand.sizeFor(p, 'half'), bluff: true };
  return { a: 'check' };
};