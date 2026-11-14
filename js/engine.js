window.NP = window.NP || {};
NP.STAGES = ['ПРЕФЛОП', 'ФЛОП', 'ТЁРН', 'РИВЕР', 'ВСКРЫТИЕ'];

NP.BOT_STYLES = {
  sticky: { name: 'Упорный', emoji: '🛡️', desc: 'Редко сбрасывает, тянет слабые и средние руки, наказывает частые блефы.', foldBase: -.10, callLoose: .20, aggression: .45, bluff: .10, raiseNeed: .72, noise: .08 },
  station: { name: 'Телефон', emoji: '📞', desc: 'Почти никогда не фолдит. Против него блефовать бесполезно — ставьте на вэлью.', foldBase: -.22, callLoose: .34, aggression: .14, bluff: .02, raiseNeed: .86, noise: .06 },
  maniac: { name: 'Маньяк', emoji: '🔥', desc: 'Очень агрессивен, часто рейзит и блефует, почти не сдаётся.', foldBase: -.16, callLoose: .24, aggression: .88, bluff: .38, raiseNeed: .55, noise: .12 },
  tag: { name: 'ТАГ', emoji: '🎯', desc: 'Тайтово-агрессивный: мало рук, но сильное давление. Его крупным ставкам можно верить.', foldBase: .06, callLoose: .04, aggression: .62, bluff: .16, raiseNeed: .70, noise: .07 },
  lag: { name: 'ЛАГ', emoji: '⚡', desc: 'Лузово-агрессивный: много рук, много рейзов, сложен для чтения.', foldBase: -.02, callLoose: .16, aggression: .78, bluff: .26, raiseNeed: .62, noise: .10 },
  rock: { name: 'Нит', emoji: '🪨', desc: 'Очень осторожный, играет только сильные руки, но не фолдит автоматически.', foldBase: .16, callLoose: -.04, aggression: .34, bluff: .05, raiseNeed: .82, noise: .05 }
};

NP.PokerHand = class {
  constructor(stacks, button, sb, bb) {
    this.n = stacks.length;
    this.startStacks = [...stacks];
    this.stacks = [...stacks];
    this.invested = Array(this.n).fill(0);
    this.bets = Array(this.n).fill(0);
    this.inHand = Array(this.n).fill(true);
    this.acted = Array(this.n).fill(false);
    this.streetBets = Array(this.n).fill(0);
    this.decisions = Array(this.n).fill(0);
    this.button = button; this.sb = sb; this.bb = bb;
    this.pot = 0; this.stage = 0; this.over = false;
    this.currentBet = bb; this.minRaise = bb;
    this.deck = NP.shuffle(NP.deck52());
    this.hole = Array.from({ length: this.n }, () => this.deck.splice(0, 2));
    this.board = [];
    this.foldedBy = []; this.raises = 0; this.totalActs = 0;
    this.events = []; this.winners = []; this.pots = []; this.winnings = Array(this.n).fill(0);
    this._postBlinds();
    this.events.push({ t: 'start' });
    this._finishSetup();
  }

  alivePlayers() { return this.inHand.map((v, i) => v ? i : -1).filter(i => i >= 0); }
  canActPlayers() { return this.alivePlayers().filter(i => this.stacks[i] > 0); }
  potNow() { return this.pot + this.bets.reduce((a, b) => a + b, 0); }
  totalInvested() { return this.invested.reduce((a, b) => a + b, 0); }
  _canAct(i) { return this.inHand[i] && this.stacks[i] > 0; }
  _pay(p, amt) { const d = Math.min(amt, this.stacks[p]); this.stacks[p] -= d; this.bets[p] += d; this.invested[p] += d; return d; }

  _postBlinds() {
    const n = this.n;
    this.sbIdx = n === 2 ? this.button : (this.button + 1) % n;
    this.bbIdx = n === 2 ? (this.button + 1) % n : (this.button + 2) % n;
    this._pay(this.sbIdx, this.sb);
    this._pay(this.bbIdx, this.bb);
    this.currentBet = this.bb;
    this.minRaise = this.bb;
  }

  _nextActive(from) {
    for (let k = 1; k <= this.n; k++) { const i = (from + k) % this.n; if (this._canAct(i)) return i; }
    return -1;
  }
  _nextNeedingAction(from) {
    for (let k = 1; k <= this.n; k++) {
      const i = (from + k) % this.n;
      if (this._canAct(i) && (!this.acted[i] || this.bets[i] < this.currentBet)) return i;
    }
    return -1;
  }
  _firstToActPreflop() {
    if (this.n === 2) return this._canAct(this.button) ? this.button : this._nextActive(this.button);
    return this._nextActive(this.bbIdx);
  }
  _finishSetup() {
    const canAct = this.canActPlayers();
    if (canAct.length === 0) { this._collectBets(); this._runout(); return; }
    if (canAct.length === 1 && this.bets[canAct[0]] === this.currentBet) { this._collectBets(); this._runout(); return; }
    this.toAct = this._firstToActPreflop();
    if (this.toAct === -1) { this._collectBets(); this._runout(); }
  }

  legalFor(p) {
    if (this.over || !this.inHand[p]) return null;
    const toCall = Math.max(0, this.currentBet - this.bets[p]);
    const maxTo = this.bets[p] + this.stacks[p];
    const canRaise = this.stacks[p] > toCall;
    let minTo = this.currentBet + this.minRaise;
    if (minTo > maxTo) minTo = maxTo;
    return { toCall, canCheck: toCall === 0, canFold: toCall > 0, callAmt: Math.min(toCall, this.stacks[p]), canRaise, minTo, maxTo, potNow: this.potNow() };
  }

  act(a, to) {
    if (this.over) return [];
    this.events = [];
    const p = this.toAct, L = this.legalFor(p);
    if (!L) return [];
    this.decisions[p]++; this.totalActs++;
    if (a === 'fold') {
      this.inHand[p] = false; this.foldedBy.push({ p, stage: this.stage }); this.acted[p] = true;
      this.events.push({ t: 'act', p, a: 'fold', amt: 0 });
    } else if (a === 'check') {
      this.acted[p] = true; this.events.push({ t: 'act', p, a: 'check', amt: 0 });
    } else if (a === 'call') {
      const d = this._pay(p, L.callAmt); this.acted[p] = true;
      this.events.push({ t: 'act', p, a: 'call', amt: d, allin: this.stacks[p] === 0 });
    } else if (a === 'raise') {
      const target = NP.clamp(Math.round(to || L.minTo), L.minTo, L.maxTo);
      const inc = target - this.currentBet;
      this._pay(p, target - this.bets[p]);
      if (target > this.currentBet) {
        if (inc >= this.minRaise) this.minRaise = inc;
        this.currentBet = target;
        for (let i = 0; i < this.n; i++) if (i !== p && this._canAct(i)) this.acted[i] = false;
        this.streetBets[p]++; this.raises++;
      }
      this.acted[p] = true;
      this.events.push({ t: 'act', p, a: 'raise', amt: target, allin: this.stacks[p] === 0 });
    }
    this._afterAction();
    return this.events;
  }

  _afterAction() {
    const alive = this.alivePlayers();
    if (alive.length === 1) { this._endFold(alive[0]); return; }
    const canAct = this.canActPlayers();
    if (canAct.length === 0) { this._collectBets(); this._runout(); return; }
    const done = canAct.every(i => this.acted[i] && this.bets[i] === this.currentBet);
    if (done) { this._closeStreet(); return; }
    const nxt = this._nextNeedingAction(this.toAct);
    if (nxt === -1) this._closeStreet(); else this.toAct = nxt;
  }

  _collectBets() { this.pot += this.bets.reduce((a, b) => a + b, 0); this.bets.fill(0); }

  _closeStreet() {
    this._collectBets();
    this.acted.fill(false); this.currentBet = 0; this.minRaise = this.bb; this.streetBets.fill(0);
    if (this.stage === 3) { this._showdown(); return; }
    this.stage++; this._dealBoard();
    this.events.push({ t: 'street', stage: this.stage });
    if (this.canActPlayers().length <= 1) { this._runout(); return; }
    this.toAct = this._nextActive(this.button);
  }

  _dealBoard() { this.board.push(...this.deck.splice(0, this.stage === 1 ? 3 : 1)); }

  _runout() {
    while (this.stage < 3) { this.stage++; this._dealBoard(); this.events.push({ t: 'street', stage: this.stage, runout: true }); }
    this._showdown();
  }

  _buildPots() {
    const levels = [...new Set(this.invested.filter(v => v > 0))].sort((a, b) => a - b);
    let prev = 0; const pots = [];
    for (const level of levels) {
      let amount = 0; const eligible = [];
      for (let i = 0; i < this.n; i++) {
        const c = Math.min(this.invested[i], level) - Math.min(this.invested[i], prev);
        if (c > 0) amount += c;
        if (this.invested[i] >= level && this.inHand[i]) eligible.push(i);
      }
      if (amount > 0) pots.push({ amount, eligible, level });
      prev = level;
    }
    return pots;
  }

  _orderAfterButton(indices) {
    const out = [];
    for (let k = 1; k <= this.n; k++) { const i = (this.button + k) % this.n; if (indices.includes(i)) out.push(i); }
    return out;
  }

  _showdown() {
    this._collectBets(); this.stage = 4;
    this.eval = this.hole.map((h, i) => this.inHand[i] ? NP.evaluate7([...h, ...this.board]) : null);
    this.pots = this._buildPots();
    for (const pot of this.pots) {
      const elig = pot.eligible.filter(i => this.inHand[i] && this.eval[i]);
      if (!elig.length) continue;
      let best = -1; for (const i of elig) best = Math.max(best, this.eval[i].score);
      const winners = elig.filter(i => this.eval[i].score === best);
      const share = Math.floor(pot.amount / winners.length), rem = pot.amount - share * winners.length;
      const ordered = this._orderAfterButton(winners);
      ordered.forEach((i, k) => { const add = share + (k < rem ? 1 : 0); this.winnings[i] += add; this.stacks[i] += add; });
      pot.winners = winners; pot.best = best;
    }
    this.winners = [...new Set(this.pots.flatMap(p => p.winners || []))];
    this.reason = 'showdown'; this.over = true;
    this.events.push({ t: 'showdown', evals: this.eval, pots: this.pots });
    this._end();
  }

  _endFold(w) {
    this.winner = w; this.reason = 'fold'; this.stage = 4; this.over = true;
    this._collectBets();
    this.winnings[w] = this.pot; this.stacks[w] += this.pot;
    this.pots = [{ amount: this.pot, eligible: [w], winners: [w] }];
    this.pot = 0;
    this._end();
  }

  _end() {
    this.delta = this.stacks.map((s, i) => s - this.startStacks[i]);
    if (this.reason === 'showdown') this.winner = this.delta[0] > 0 ? 0 : this.delta[0] < 0 ? 1 : -1;
    this.events.push({ t: 'end', winner: this.winner, reason: this.reason, delta: [...this.delta], invested: [...this.invested], potTotal: this.totalInvested(), winnings: [...this.winnings], pots: this.pots.map(p => ({ ...p })) });
  }

  sizeFor(p, kind) {
    const L = this.legalFor(p);
    if (!L || !L.canRaise) return null;
    const after = L.potNow + L.toCall;
    let target;
    if (kind === 'min') target = L.minTo;
    else if (kind === 'half') target = this.currentBet + Math.max(this.minRaise, Math.round(after * .5));
    else if (kind === 'pot') target = this.currentBet + Math.max(this.minRaise, Math.round(after));
    else target = L.maxTo;
    return NP.clamp(Math.round(target), L.minTo, L.maxTo);
  }
};

/* Бот со стилем игры. Все стили сопротивляются давлению сильнее старого бота. */
NP.decideBot = function (hand, p, styleKey) {
  const prof = NP.BOT_STYLES[styleKey] || NP.BOT_STYLES.sticky;
  const { s, draw } = NP.handStrength(hand.hole[p], hand.board);
  const L = hand.legalFor(p);
  if (!L) return { a: 'check' };
  const opponents = hand.alivePlayers().filter(i => i !== p).length;
  const st = NP.clamp(s + (Math.random() - .5) * prof.noise, 0, 1);
  const price = L.toCall > 0 ? L.toCall / (L.potNow + L.toCall) : 0;
  const r = Math.random();
  const multiwayTighten = Math.max(0, opponents - 1) * .035;

  if (L.toCall > 0) {
    if (st > prof.raiseNeed + multiwayTighten && L.canRaise && r < prof.aggression)
      return { a: 'raise', to: hand.sizeFor(p, st > .88 ? 'pot' : 'half') };
    const quiet = hand.streetBets.every((v, i) => i === p || v === 0);
    if (st < .3 && L.canRaise && hand.stage >= 1 && quiet && r < prof.bluff)
      return { a: 'raise', to: hand.sizeFor(p, 'pot'), bluff: true };
    const continueNeed = price * .85 + prof.foldBase + multiwayTighten - prof.callLoose - draw * .55;
    if (st + draw * .4 > continueNeed) return { a: 'call' };
    if (L.toCall <= L.potNow * .12 && st > .10) return { a: 'call' };
    if (L.toCall >= hand.stacks[p] * .55 && st > .18) return { a: 'call' };
    return { a: 'fold' };
  }
  if (st > .62 && L.canRaise && r < prof.aggression + .2) return { a: 'raise', to: hand.sizeFor(p, st > .82 ? 'pot' : 'half') };
  if (draw > .1 && L.canRaise && r < prof.aggression * .8) return { a: 'raise', to: hand.sizeFor(p, 'half') };
  if (st < .3 && L.canRaise && hand.stage >= 1 && r < prof.bluff) return { a: 'raise', to: hand.sizeFor(p, 'half'), bluff: true };
  return { a: 'check' };
};

/* Совместимость со старым кодом/лабораторией */
NP.algoDecide = (hand, p, cfg) => NP.decideBot(hand, p, cfg?.style || 'tag');