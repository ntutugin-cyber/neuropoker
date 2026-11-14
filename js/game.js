window.NP = window.NP || {};

NP.Settings = Object.assign({
  opp: 'algo', opponents: 1, style: 'sticky',
  botBluff: true, botBluffFreq: 18, nnBluff: true,
  hints: true, autoReview: true, blinds: 5, stack: 1000
}, NP.store.get('np_settings_v2', {}));
NP.saveSettings = () => NP.store.set('np_settings_v2', NP.Settings);

NP.Game = {
  playerCount: 2, players: [], stacks: [], button: 0, handNo: 0, hand: null,
  token: 0, busy: false, stats: { hands: 0, wins: 0, big: 0 }, matchOver: false,
  review: [], street: 0, lastAgg: null, lastResult: null,

  now() { return new Date().toLocaleTimeString('ru-RU', { hour12: false }); },
  cardsText(cards) { return cards.map(c => NP.rlabel(c.r) + NP.SUIT_CH[c.s]).join(' '); },
  who(p) { return this.players[p]?.name || ('Игрок ' + (p + 1)); },
  posMap() { return { 2: ['bottom', 'top'], 3: ['bottom', 'tl', 'tr'], 4: ['bottom', 'left', 'top', 'right'] }[this.playerCount]; },

  buildPlayers() {
    const n = NP.clamp(+NP.Settings.opponents + 1, 2, 4);
    this.playerCount = n;
    const keys = Object.keys(NP.BOT_STYLES);
    this.players = [{ name: 'Вы', emoji: '🧑', isHuman: true, style: null, isNN: false }];
    for (let i = 1; i < n; i++) {
      const style = NP.Settings.style === 'mix' ? keys[NP.rndi(keys.length)] : NP.Settings.style;
      const prof = NP.BOT_STYLES[style] || NP.BOT_STYLES.sticky;
      const isNN = NP.Settings.opp === 'nn' && NP.Settings.opponents === 1 && i === 1;
      this.players.push({
        name: isNN ? 'Нейросеть' : prof.name + ' ' + i,
        emoji: isNN ? '🧠' : prof.emoji, isHuman: false, style, isNN
      });
    }
  },

  applyStylesLive() {
    const keys = Object.keys(NP.BOT_STYLES);
    this.players.forEach((pl, i) => {
      if (pl.isHuman || pl.isNN) return;
      pl.style = NP.Settings.style === 'mix' ? keys[NP.rndi(keys.length)] : NP.Settings.style;
      const prof = NP.BOT_STYLES[pl.style];
      pl.name = prof.name + ' ' + i; pl.emoji = prof.emoji;
      const nm = NP.$('#mnm' + i), st = NP.$('#mstyle' + i), av = NP.$('#mav' + i);
      if (nm) nm.textContent = pl.name;
      if (st) st.textContent = prof.name;
      if (av) av.firstChild.textContent = pl.emoji;
    });
    this.renderMatchBar();
  },

  renderMatchBar() {
    const styles = this.players.slice(1).map(p => p.isNN ? 'Нейросеть' : NP.BOT_STYLES[p.style].name).join(', ');
    NP.$('#mOppTag').innerHTML = `Противников: <b>${this.playerCount - 1}</b> · <b>${styles}</b>`;
    NP.$('#tableInfo').textContent = `${this.playerCount} игрока за столом · стиль: ${NP.Settings.style === 'mix' ? 'смешанный' : NP.BOT_STYLES[NP.Settings.style].name}`;
  },

  newMatch() {
    this.token++;
    this.buildPlayers();
    this.stacks = Array(this.playerCount).fill(NP.Settings.stack);
    this.button = NP.rndi(this.playerCount);
    this.handNo = 0; this.stats = { hands: 0, wins: 0, big: 0 };
    this.matchOver = false; this.lastResult = null;
    NP.$('#gameLog').innerHTML = '';
    NP.$('#matchModal').classList.remove('on');
    NP.$('#resultModal').classList.remove('on');
    NP.$('#reviewBtn').disabled = true;
    this.renderSeats();
    this.renderMatchBar();
    this.log(`Новый матч: ${this.playerCount} игрока, стек ${NP.fmt(NP.Settings.stack)}, блайнды ${NP.Settings.blinds}/${NP.Settings.blinds * 2}.`, 'result');
    this.startHand();
  },

  renderSeats() {
    const layer = NP.$('#seatsLayer');
    layer.innerHTML = '';
    const pos = this.posMap();
    NP.$('#ptable').className = 'ptable players-' + this.playerCount;
    this.players.forEach((pl, i) => {
      const el = document.createElement('div');
      el.className = 'mseat pos-' + pos[i];
      el.id = 'mseat' + i;
      el.innerHTML = `
        <div class="mseat-av" id="mav${i}">${pl.emoji}<div class="act-bubble" id="mbub${i}"></div></div>
        <div class="mseat-info">
          <div class="nm"><span id="mnm${i}">${NP.esc(pl.name)}</span><span class="dealer" id="mdl${i}">D</span></div>
          <div class="stack" id="mst${i}">0</div>
          <div class="mseat-style" id="mstyle${i}">${pl.isHuman ? 'Игрок' : pl.isNN ? 'Нейросеть' : NP.BOT_STYLES[pl.style].name}</div>
          <div class="bet-bubble" id="mbet${i}"><span class="chip-ic"></span><span>0</span></div>
        </div>
        <div class="cardrow tight mseat-cards" id="mhole${i}"></div>`;
      layer.appendChild(el);
    });
  },

  startHand() {
    const aliveStacks = this.stacks.filter(s => s > 0).length;
    if (this.stacks[0] <= 0 || aliveStacks < 2) { this.showMatchEnd(); return; }
    // выбывшие получают 0 и не участвуют
    this.token++; this.handNo++; this.busy = false; this.review = []; this.street = 0; this.lastAgg = null;
    const sb = NP.Settings.blinds, bb = sb * 2;
    // Для простоты движок играет всеми, у кого стек > 0; выбывшие сидят с 0.
    this.hand = new NP.PokerHand(this.stacks, this.button, sb, bb);
    NP.$('#winBanner').classList.remove('on');
    NP.$('#nextRow').classList.remove('on');
    NP.$('#resultModal').classList.remove('on');
    NP.$('#think1')?.classList.remove('on');
    NP.$('#mHandNo').textContent = this.handNo;
    NP.$('#mBlinds').textContent = sb + '/' + bb;
    NP.$('#nnTrainNote').textContent = 'Модель: ' + NP.fmt(NP.Model.hands) + ' раздач';
    this.renderSeats();
    this.renderMatchBar();
    this.hand.hole.forEach((cards, i) => {
      const holeEl = NP.$('#mhole' + i);
      holeEl.innerHTML = '';
      cards.forEach((c, k) => holeEl.appendChild(NP.makeCard(c, { big: i === 0, mini: i !== 0, down: i !== 0, delay: i * 90 + k * 70 })));
    });
    const br = NP.$('#boardRow');
    br.innerHTML = '';
    for (let i = 0; i < 5; i++) { const s = document.createElement('div'); s.className = 'board-slot'; br.appendChild(s); }
    NP.SND.play('deal');
    this.log(`Раздача №${this.handNo}. Баттон: ${this.who(this.button)}. SB ${sb} — ${this.who(this.hand.sbIdx)}, BB ${bb} — ${this.who(this.hand.bbIdx)}. Банк ${this.hand.potNow()}.`, 'street');
    this.pushReview('street', `Раздача №${this.handNo}. Блайнды ${sb}/${bb}. Баттон: ${this.who(this.button)}.`);
    this.renderState(); this.updateHints(); NP.Coach.update();
    if (this.hand.over) this.processEvents(this.hand.events);
    else if (this.hand.toAct !== 0) this.runAI();
    else this.enablePlayer();
  },

  pushReview(type, text) { this.review.push({ time: this.now(), type, text }); },

  log(msg, cls = '') {
    const l = NP.$('#gameLog'), d = document.createElement('div');
    d.className = 'le ' + cls;
    d.innerHTML = `<span class="lt">${this.now()}</span>${msg}`;
    l.appendChild(d);
    while (l.children.length > 320) l.firstChild.remove();
    l.scrollTop = l.scrollHeight;
  },

  renderState() {
    const h = this.hand; if (!h) return;
    NP.$('#potVal').textContent = NP.fmt(h.potNow());
    NP.$('#stageLbl').textContent = NP.STAGES[Math.min(h.stage, 4)];
    this.players.forEach((pl, i) => {
      const st = NP.$('#mst' + i), bet = NP.$('#mbet' + i), seat = NP.$('#mseat' + i);
      if (st) st.textContent = NP.fmt(h.stacks[i]);
      if (bet) { bet.classList.toggle('on', h.bets[i] > 0); bet.lastElementChild.textContent = NP.fmt(h.bets[i]); }
      NP.$('#mdl' + i)?.classList.toggle('on', h.button === i);
      if (seat) {
        seat.classList.toggle('turn', !h.over && h.toAct === i);
        seat.classList.toggle('folded', !h.inHand[i]);
        seat.classList.toggle('busted', h.stacks[i] === 0 && h.inHand[i]);
      }
    });
  },

  bubble(p, text, cls) {
    const b = NP.$('#mbub' + p);
    if (!b) return;
    b.textContent = text; b.className = 'act-bubble on ' + cls;
  },

  dealBoardCards(stage, board) {
    const row = NP.$('#boardRow'), count = stage === 1 ? 3 : 1, start = board.length - count;
    for (let i = 0; i < count; i++) {
      const idx = start + i, card = board[idx];
      if (!card) continue;
      const el = NP.makeCard(card, { delay: i * 140 });
      const target = row.children[idx];
      if (target) target.replaceWith(el); else row.appendChild(el);
    }
  },

  actionDetails(e, h) {
    const who = this.who(e.p), pot = h.potNow();
    if (e.a === 'fold') return {
      bubble: 'Фолд', cls: 'fold', sound: 'fold',
      log: `${who}: <b>ФОЛД</b> на «${NP.STAGES[this.street]}». В раздаче осталось ${h.alivePlayers().length}.`,
      review: `${who} сбросил карты. Осталось игроков: ${h.alivePlayers().length}.`
    };
    if (e.a === 'check') return {
      bubble: 'Чек', cls: 'call', sound: 'check',
      log: `${who}: <b>ЧЕК</b>. Банк ${NP.fmt(pot)}.`,
      review: `${who}: чек.`
    };
    if (e.a === 'call') return {
      bubble: (e.allin ? 'Олл-ин колл ' : 'Колл ') + NP.fmt(e.amt), cls: e.allin ? 'allin' : 'call', sound: 'chip',
      log: `${who}: <b>КОЛЛ ${NP.fmt(e.amt)}</b>${e.allin ? ' (олл-ин)' : ''}. Банк ${NP.fmt(pot)}. Стек: ${NP.fmt(h.stacks[e.p])}.`,
      review: `${who} уравнял ${NP.fmt(e.amt)}${e.allin ? ' (олл-ин)' : ''}.`
    };
    return {
      bubble: (e.allin ? 'Олл-ин ' : 'Рейз до ') + NP.fmt(e.amt), cls: e.allin ? 'allin' : 'raise', sound: 'chip',
      log: `${who}: <b>${e.allin ? 'ОЛЛ-ИН' : 'РЕЙЗ'} до ${NP.fmt(e.amt)}</b>. Банк ${NP.fmt(pot)}. Ответ должны дать ${h.canActPlayers().filter(i => i !== e.p).length} игрока(ов).`,
      review: `${who} повысил до ${NP.fmt(e.amt)}${e.allin ? ' (олл-ин)' : ''}.`
    };
  },

  async processEvents(evts) {
    const tok = this.token, h = this.hand;
    for (const e of evts) {
      if (tok !== this.token) return;
      if (e.t === 'act') {
        const d = this.actionDetails(e, h);
        if (e.a === 'raise') this.lastAgg = { p: e.p, amt: e.amt, stage: this.street };
        this.bubble(e.p, d.bubble, d.cls);
        NP.SND.play(d.sound);
        this.log(d.log, e.p !== 0 ? 'nn' : '');
        this.pushReview(e.p === 0 ? 'info' : 'bad', d.review);
        this.renderState(); NP.Coach.update();
        await NP.sleep(430);
      } else if (e.t === 'street') {
        this.street = e.stage;
        this.players.forEach((_, i) => NP.$('#mbub' + i)?.classList.remove('on'));
        this.dealBoardCards(e.stage, h.board);
        NP.SND.play('deal');
        NP.$('#potDisp').classList.remove('bump'); void NP.$('#potDisp').offsetWidth; NP.$('#potDisp').classList.add('bump');
        const newCards = e.stage === 1 ? h.board.slice(0, 3) : h.board.slice(-1);
        this.log(`<b>${NP.STAGES[e.stage]}</b>${e.runout ? ' (прогон после олл-ина)' : ''}: ${this.cardsText(newCards)}. Банк ${NP.fmt(h.potNow())}.`, 'street');
        this.pushReview('street', `${NP.STAGES[e.stage]}: ${this.cardsText(newCards)}. Банк ${NP.fmt(h.potNow())}.`);
        this.renderState(); NP.Coach.update();
        await NP.sleep(e.runout ? 620 : 700);
      } else if (e.t === 'showdown') {
        this.players.forEach((_, i) => { if (i !== 0 && h.inHand[i]) NP.$$('#mhole' + i + ' .pcard').forEach(el => el.classList.remove('down')); });
        NP.SND.play('flip');
        await NP.sleep(650);
        const lines = [];
        h.inHand.forEach((alive, i) => { if (alive && h.eval[i]) lines.push(`${this.who(i)}: <b>${NP.comboName(h.eval[i])}</b>`); });
        this.log(`<b>ВСКРЫТИЕ</b>. ${lines.join(' · ')}.`, 'result');
        this.pushReview('result', 'Вскрытие: ' + lines.join(' · '));
        if (h.pots.length > 1) {
          const potLines = h.pots.map((pot, k) => `Банк ${k + 1} (${NP.fmt(pot.amount)}): выиграл ${pot.winners.map(w => this.who(w)).join(', ')}`);
          this.log('Сайд-поты: ' + potLines.join(' · '), 'result');
          this.pushReview('result', 'Сайд-поты: ' + potLines.join(' · '));
        }
        const highlightPlayer = h.inHand[0] ? 0 : (h.winners[0] ?? 0);
        const winFive = NP.bestFive([...h.hole[highlightPlayer], ...h.board]);
        const keys = new Set(winFive.map(NP.ckey));
        NP.$$('.mseat-cards .pcard, #boardRow .pcard').forEach(el => { if (el._card && keys.has(NP.ckey(el._card))) el.classList.add('hl'); });
        this.renderState(); NP.Coach.update();
        await NP.sleep(900);
      } else if (e.t === 'end') {
        const deltas = e.delta.map((d, i) => `${this.who(i)} ${d >= 0 ? '+' : ''}${NP.fmt(d)}`).join(' · ');
        this.log(`ИТОГ: ${deltas}. Общий банк ${NP.fmt(e.potTotal)}.`, 'result');
        this.pushReview('result', `Итог: ${deltas}. Банк ${NP.fmt(e.potTotal)}.`);
        this.finishHand(e);
      }
    }
  },

  catLabel(cat) { return ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'][cat]; },

  explainResult(s) {
    const lines = [];
    const humanDelta = s.delta[0];
    if (s.reason === 'fold') {
      const lastFold = s.folds[s.folds.length - 1];
      lines.push(`Раздача закончилась <b>без вскрытия</b>: все соперники сбросили карты. Последний фолд — ${this.who(lastFold.p)} на улице «${NP.STAGES[lastFold.stage]}». Победитель забирает банк без сравнения комбинаций.`);
      if (s.lastAgg) lines.push(`Решающее давление: ${this.who(s.lastAgg.p)} повысил до <b>${NP.fmt(s.lastAgg.amt)}</b>. После этого никто не ответил.`);
      lines.push(`${this.who(s.winner)} забирает банк <b>${NP.fmt(s.potTotal)}</b>. ${s.winner === 0 ? 'Вы выиграли за счёт давления — комбинации не сравнивались.' : 'Вы сбросили карты, поэтому не участвовали в распределении банка.'}`);
    } else {
      lines.push(`Раздача дошла до <b>вскрытия</b>: сравниваются лучшие пятёрки из семи карт.`);
      s.players.forEach((pl, i) => {
        if (!s.inHand[i]) lines.push(`${pl.name}: фолд — не участвует во вскрытии.`);
        else if (s.eval[i]) lines.push(`${pl.name}: <b>${NP.comboName(s.eval[i])}</b> (${this.cardsText(s.hole[i])} + борд).`);
      });
      if (s.pots.length > 1) {
        lines.push(`Были <b>сайд-поты</b>: когда кто-то идёт олл-ин на меньшую сумму, банк делится на части. Каждый сайд-пот разыгрывается только между теми, кто вложил в него фишки.`);
        s.pots.forEach((pot, k) => {
          lines.push(`Банк ${k + 1} — <b>${NP.fmt(pot.amount)}</b>: участвовали ${pot.eligible.map(i => this.who(i)).join(', ')}; выиграл ${pot.winners.map(i => this.who(i)).join(', ')}.`);
        });
      } else {
        const pot = s.pots[0];
        if (pot) lines.push(`Основной банк <b>${NP.fmt(pot.amount)}</b> выиграл ${pot.winners.map(i => this.who(i)).join(', ')} — у него лучшая пятёрка среди участников.`);
      }
    }
    lines.push(`Ваш чистый результат: <b>${humanDelta >= 0 ? '+' : ''}${NP.fmt(humanDelta)}</b>. Вы вложили ${NP.fmt(s.invested[0])}, получили ${NP.fmt(s.winnings[0])}.`);
    return lines;
  },

  resultHTML(s) {
    const win = s.delta[0] > 0, draw = s.delta[0] === 0;
    const cls = win ? 'win' : draw ? 'draw' : 'lose';
    const icon = win ? '🏆' : draw ? '🤝' : '💀';
    const title = win ? 'Вы выиграли раздачу' : draw ? 'Нулевой результат' : 'Вы проиграли раздачу';
    const deltaCls = s.delta[0] > 0 ? 'plus' : s.delta[0] < 0 ? 'minus' : 'zero';
    const boardCards = s.board.length ? s.board.map(c => NP.cardHTML(c, 'mini')).join('') : '<span class="faint">борд не открылся</span>';
    const handBlock = p => {
      const pl = s.players[p], alive = s.inHand[p];
      const won = s.winnings[p] > 0;
      const ev = alive ? (s.eval[p] || (s.board.length ? NP.evaluate7([...s.hole[p], ...s.board]) : null)) : null;
      const combo = ev ? NP.comboName(ev) : 'Карты сброшены';
      const best = ev ? NP.bestFive([...s.hole[p], ...s.board]) : s.hole[p];
      const keys = new Set(best.map(NP.ckey));
      const holeHTML = s.hole[p].map(c => NP.cardHTML(c, 'mini' + (keys.has(NP.ckey(c)) ? ' hl' : ''))).join('');
      const bestHTML = best.map(c => NP.cardHTML(c, 'mini hl')).join('');
      return `<div class="res-hand ${won ? 'winner' : ''}">
        <div class="rh-top"><span class="rh-name">${pl.emoji} ${NP.esc(pl.name)}</span>
          ${!alive ? '<span class="rh-badge fold">ФОЛД</span>' : won ? '<span class="rh-badge">+' + NP.fmt(s.winnings[p]) + '</span>' : ''}</div>
        <div class="cardrow tight">${holeHTML}</div>
        <div class="rh-combo">${combo}</div>
        <div class="rh-note">${alive ? 'Лучшая пятёрка:' : 'Карты на момент фолда:'}</div>
        <div class="cardrow tight" style="margin-top:6px">${bestHTML}</div>
        <div class="rh-note">Вложил: ${NP.fmt(s.invested[p])} · Получил: ${NP.fmt(s.winnings[p])} · Итог: ${s.delta[p] >= 0 ? '+' : ''}${NP.fmt(s.delta[p])}</div>
      </div>`;
    };
    const potsHTML = s.pots.map((pot, k) => `<div class="rm"><div class="k">${s.pots.length > 1 ? 'Сайд-пот ' + (k + 1) : 'Банк'}</div><div class="v">${NP.fmt(pot.amount)}</div><div class="faint" style="font-size:11px;margin-top:3px">${pot.winners.map(i => NP.esc(s.players[i].name)).join(', ')}</div></div>`).join('');
    const timeline = s.timeline.map(r => `<div class="rt-item ${r.type}"><span class="rt-time">${r.time}</span><span>${r.text}</span></div>`).join('');
    return `
      <div class="res-head"><div class="res-icon">${icon}</div>
        <div><div class="res-title ${cls}">${title}</div>
          <div class="res-sub">Раздача №${s.handNo} · ${s.reason === 'fold' ? 'все сбросили' : 'вскрытие'} · ${s.players.length} игрока · ${new Date(s.ts).toLocaleString('ru-RU')}</div></div>
        <div class="res-delta ${deltaCls}">${s.delta[0] >= 0 ? '+' : ''}${NP.fmt(s.delta[0])}</div></div>
      <div class="res-why">${this.explainResult(s).map(l => `<div class="why-line">${l}</div>`).join('')}</div>
      <div class="res-sec"><div class="h">🃏 Общие карты</div><div class="res-board"><span class="rb-lbl">Борд</span><div class="cardrow tight">${boardCards}</div></div></div>
      <div class="res-sec"><div class="h">🆚 Руки игроков</div><div class="res-hands">${s.players.map((_, i) => handBlock(i)).join('')}</div></div>
      <div class="res-sec"><div class="h">💰 Банки</div><div class="res-math">${potsHTML}</div></div>
      <div class="res-sec"><div class="h">⏱ Хронология</div><div class="res-timeline">${timeline}</div></div>
      ${this.matchOver ? '<div class="callout warn">Матч окончен. Нажмите «Новый матч».</div>' : ''}`;
  },

  finishHand(e) {
    const h = this.hand;
    this.stacks = [...h.stacks];
    this.stats.hands++;
    if (e.delta[0] > 0) this.stats.wins++;
    this.stats.big = Math.max(this.stats.big, e.potTotal);
    NP.$('#gsHands').textContent = this.stats.hands;
    NP.$('#gsWins').textContent = this.stats.wins;
    NP.$('#gsBig').textContent = NP.fmt(this.stats.big);
    NP.$('#gsRate').textContent = Math.round(this.stats.wins / this.stats.hands * 100) + '%';
    const wb = NP.$('#winBanner');
    wb.classList.remove('lose');
    let title;
    if (e.delta[0] > 0) { title = '🏆 Вы в плюсе!'; NP.SND.play('win'); NP.CF.burst(60); }
    else if (e.delta[0] < 0) { title = 'Вы в минусе'; wb.classList.add('lose'); NP.SND.play('lose'); }
    else { title = '🤝 Ноль'; NP.SND.play('ok'); }
    NP.$('#wbT').textContent = title;
    NP.$('#wbS').textContent = e.reason === 'fold' ? 'Раздача без вскрытия' : 'Вскрытие / сайд-поты';
    NP.$('#wbA').textContent = (e.delta[0] > 0 ? '+' : '') + NP.fmt(e.delta[0]) + ' фишек';
    wb.classList.add('on');
    this.matchOver = this.stacks[0] <= 0 || this.stacks.filter(s => s > 0).length < 2;
    const snapshot = {
      ts: Date.now(), handNo: this.handNo, winner: e.winner, reason: e.reason,
      folds: h.foldedBy.map(f => ({ ...f })), lastAgg: this.lastAgg ? { ...this.lastAgg } : null,
      delta: [...e.delta], invested: [...e.invested], winnings: [...e.winnings], potTotal: e.potTotal,
      inHand: [...h.inHand], players: this.players.map(p => ({ ...p })),
      hole: h.hole.map(cs => cs.map(c => ({ ...c }))), board: h.board.map(c => ({ ...c })),
      eval: h.eval ? h.eval.map(ev => ev ? { ...ev, t: [...ev.t] } : null) : Array(this.playerCount).fill(null),
      pots: e.pots.map(p => ({ ...p, eligible: [...p.eligible], winners: [...(p.winners || [])] })),
      timeline: this.review.map(r => ({ ...r }))
    };
    this.lastResult = { snapshot, html: this.resultHTML(snapshot) };
    NP.$('#reviewBtn').disabled = false;
    NP.$('#resultNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Следующая раздача';
    NP.$('#btnNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Новая раздача';
    this.renderState(); this.disablePlayer();
    this.button = (this.button + 1) % this.playerCount;
    NP.Coach.update();
    NP.$('#nextRow').classList.add('on');
    if (NP.Settings.autoReview) { const tok = this.token; setTimeout(() => { if (tok === this.token) this.openReview(); }, 900); }
  },

  openReview() {
    if (!this.lastResult) return;
    NP.$('#resultBody').innerHTML = this.lastResult.html;
    NP.$('#resultNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Следующая раздача';
    NP.$('#resultModal').classList.add('on');
    NP.SND.play('click');
  },
  continueAfterReview() { NP.$('#resultModal').classList.remove('on'); if (this.matchOver) this.newMatch(); else this.startHand(); },

  showMatchEnd() {
    const youWin = this.stacks[0] === Math.max(...this.stacks);
    NP.$('#mmIcon').textContent = youWin ? '🏆' : '💀';
    NP.$('#mmTitle').textContent = youWin ? 'Вы выиграли матч!' : 'Матч окончен';
    NP.$('#mmText').textContent = youWin ? 'Вы забрали все фишки стола.' : 'Вы потеряли стек. Реванш?';
    NP.$('#matchModal').classList.add('on');
    if (youWin) { NP.SND.play('win'); NP.CF.burst(160); } else NP.SND.play('lose');
  },

  enablePlayer() {
    const h = this.hand;
    if (!h || h.over || h.toAct !== 0 || !h.inHand[0]) return;
    this.busy = false;
    const L = h.legalFor(0);
    NP.$('#btnFold').disabled = !L.canFold;
    NP.$('#btnCall').disabled = false;
    NP.$('#btnCall').textContent = L.canCheck ? 'Чек' : 'Колл ' + NP.fmt(L.callAmt);
    NP.$('#btnRaise').disabled = !L.canRaise;
    NP.$('#btnAllin').disabled = !L.canRaise;
    NP.$('#raiseRow').style.display = L.canRaise ? 'flex' : 'none';
    if (L.canRaise) {
      const sl = NP.$('#raiseSlider');
      sl.min = L.minTo; sl.max = L.maxTo; sl.step = Math.max(1, Math.round(h.bb / 2)); sl.value = L.minTo;
      this.updateRaiseLbl();
    }
    NP.$('#nextRow').classList.remove('on');
    this.updateHints(); this.renderState(); NP.Coach.update();
  },
  disablePlayer() { ['#btnFold', '#btnCall', '#btnRaise', '#btnAllin'].forEach(s => NP.$(s).disabled = true); },
  updateRaiseLbl() {
    const h = this.hand; if (!h) return;
    const L = h.legalFor(0), v = +NP.$('#raiseSlider').value;
    NP.$('#raiseVal').textContent = NP.fmt(v);
    NP.$('#btnRaise').textContent = (L?.canCheck ? 'Бет ' : 'Рейз до ') + NP.fmt(v);
    NP.$('#btnAllin').textContent = 'Олл-ин ' + NP.fmt(L?.maxTo || 0);
  },
  updateHints() {
    NP.$('#hintBar').classList.toggle('off', !NP.Settings.hints);
    if (!NP.Settings.hints) return;
    const h = this.hand; if (!h) return;
    const combo = h.board.length ? NP.comboName(NP.evaluate7([...h.hole[0], ...h.board])) : 'Карманные: ' + this.cardsText(h.hole[0]);
    NP.$('#hintCombo').textContent = combo;
    const eq = NP.mcEquity(h.hole[0], h.board, 150);
    NP.$('#hintEq').textContent = Math.round(eq * 100) + '%';
    const L = h.legalFor(0);
    let adv;
    if (L?.toCall > 0) {
      const po = L.toCall / (L.potNow + L.toCall);
      adv = 'Пот-оддсы ' + Math.round(po * 100) + '% · ' + (eq > po + .08 ? 'колл выгоден' : eq > po ? 'колл на грани' : 'лучше фолд');
    } else adv = eq > .65 ? 'сильная рука — ставьте' : eq > .45 ? 'средняя рука — осторожно' : 'слабая рука — чек/фолд';
    NP.$('#hintAdvice').textContent = adv;
  },

  async playerAct(a, to) {
    if (this.busy || !this.hand || this.hand.over || this.hand.toAct !== 0) return;
    this.busy = true; this.disablePlayer(); NP.SND.play('click');
    try {
      const evts = this.hand.act(a, to);
      await this.processEvents(evts);
      if (this.hand.over) return;
      if (this.hand.toAct !== 0) await this.runAI(); else this.enablePlayer();
    } catch (err) { console.error(err); NP.toast('Ошибка хода. Раздача перезапущена.', 'err'); this.startHand(); }
  },

  async runAI() {
    const tok = this.token, h = this.hand;
    try {
      while (h && !h.over && h.toAct !== 0) {
        if (tok !== this.token) return;
        const p = h.toAct, pl = this.players[p];
        this.disablePlayer();
        NP.$('#mseat' + p)?.classList.add('thinking');
        this.renderState();
        await NP.sleep(560 + Math.random() * 520);
        if (tok !== this.token) return;
        let d;
        if (pl.isNN) {
          const f = NP.buildFeatures(h, p, NP.Model.opp[0]);
          const mask = NP.nnMask(h, p, NP.Settings.nnBluff, f.s, f.draw);
          const probs = NP.Model.net.forward(f.x, mask);
          let idx = 0, r = Math.random(), acc = 0;
          for (let i = 0; i < 5; i++) { acc += probs[i]; if (r <= acc) { idx = i; break; } }
          d = NP.nnActionFrom(idx, h, p);
        } else d = NP.decideBot(h, p, pl.style);
        NP.$('#mseat' + p)?.classList.remove('thinking');
        const evts = h.act(d.a, d.to);
        await this.processEvents(evts);
      }
      if (tok !== this.token) return;
      if (!h.over) this.enablePlayer();
    } catch (err) {
      console.error(err);
      this.players.forEach((_, i) => NP.$('#mseat' + i)?.classList.remove('thinking'));
      NP.toast('Ошибка хода соперника. Раздача перезапущена.', 'err');
      this.startHand();
    }
  }
};