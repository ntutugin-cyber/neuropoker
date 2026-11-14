window.NP = window.NP || {};

NP.Settings = Object.assign({
  opp: 'algo', botBluff: true, botBluffFreq: 18, nnBluff: true,
  hints: true, autoReview: true, blinds: 5, stack: 1000
}, NP.store.get('np_settings_v2', {}));

NP.saveSettings = () => NP.store.set('np_settings_v2', NP.Settings);

NP.Game = {
  stacks: [1000, 1000], button: 0, handNo: 0, hand: null, token: 0, busy: false,
  stats: { hands: 0, wins: 0, big: 0 }, matchOver: false, review: [],
  street: 0, lastAgg: null, lastResult: null,

  now() { return new Date().toLocaleTimeString('ru-RU', { hour12: false }); },
  cardsText(cards) { return cards.map(c => NP.rlabel(c.r) + NP.SUIT_CH[c.s]).join(' '); },
  who(p) { return p === 0 ? 'Вы' : 'Соперник'; },

  newMatch() {
    this.token++;
    this.stacks = [NP.Settings.stack, NP.Settings.stack];
    this.button = NP.rndi(2);
    this.handNo = 0;
    this.stats = { hands: 0, wins: 0, big: 0 };
    this.matchOver = false;
    this.lastResult = null;
    NP.$('#gameLog').innerHTML = '';
    NP.$('#matchModal').classList.remove('on');
    NP.$('#resultModal').classList.remove('on');
    NP.$('#reviewBtn').disabled = true;
    this.log('Новый матч. Стеки по ' + NP.fmt(NP.Settings.stack) + ', блайнды ' + NP.Settings.blinds + '/' + (NP.Settings.blinds * 2) + '.', 'result');
    this.startHand();
  },

  startHand() {
    if (this.stacks[0] <= 0 || this.stacks[1] <= 0) { this.showMatchEnd(); return; }
    this.token++; this.handNo++; this.busy = false; this.review = [];
    this.street = 0; this.lastAgg = null;
    const sb = NP.Settings.blinds, bb = sb * 2;
    this.hand = new NP.PokerHand(this.stacks, this.button, sb, bb);
    NP.$('#winBanner').classList.remove('on');
    NP.$('#nextRow').classList.remove('on');
    NP.$('#resultModal').classList.remove('on');
    NP.$('#bub0').classList.remove('on');
    NP.$('#bub1').classList.remove('on');
    NP.$('#think1').classList.remove('on');
    NP.$('#mHandNo').textContent = this.handNo;
    NP.$('#mBlinds').textContent = sb + '/' + bb;
    const isNN = NP.Settings.opp === 'nn';
    NP.$('#nm1').textContent = isNN ? 'Нейросеть' : 'Алгоритм';
    NP.$('#av1').firstChild.textContent = isNN ? '🧠' : '🤖';
    NP.$('#mOppTag').innerHTML = 'Соперник: <b>' + (isNN ? 'Нейросеть' : 'Алгоритм') + '</b>';
    NP.$('#nnTrainNote').textContent = 'Модель: ' + NP.fmt(NP.Model.hands) + ' раздач';
    const h0 = NP.$('#hole0'), h1 = NP.$('#hole1');
    h0.innerHTML = ''; h1.innerHTML = '';
    this.hand.hole[0].forEach((c, i) => h0.appendChild(NP.makeCard(c, { big: true, delay: i * 120 })));
    this.hand.hole[1].forEach((c, i) => h1.appendChild(NP.makeCard(c, { down: true, delay: 240 + i * 120 })));
    const br = NP.$('#boardRow');
    br.innerHTML = '';
    for (let i = 0; i < 5; i++) { const s = document.createElement('div'); s.className = 'board-slot'; br.appendChild(s); }
    NP.SND.play('deal');
    const btnWho = this.button === 0 ? 'вы' : 'соперник';
    this.log(`Раздача №${this.handNo}. Баттон у ${btnWho === 'вы' ? 'вас' : 'соперника'} (${this.who(this.button)} — SB). Стеки: вы ${NP.fmt(this.hand.stacks[0])}, соперник ${NP.fmt(this.hand.stacks[1])}.`, 'street');
    this.log(`Блайнды поставлены: ${this.who(this.button)} — SB ${sb}, ${this.who(1 - this.button)} — BB ${bb}. Начальный банк ${this.hand.potNow()}.`);
    this.pushReview('street', `Раздача №${this.handNo}. Блайнды ${sb}/${bb}. Баттон: ${this.who(this.button)}. Банк ${this.hand.potNow()}.`);
    this.renderState(); this.updateHints(); NP.Coach.update();
    if (this.hand.over) this.processEvents(this.hand.events);
    else if (this.hand.toAct === 1) this.runAI();
    else this.enablePlayer();
  },

  pushReview(type, text) { this.review.push({ time: this.now(), type, text }); },

  log(msg, cls = '') {
    const l = NP.$('#gameLog'), d = document.createElement('div');
    d.className = 'le ' + cls;
    d.innerHTML = `<span class="lt">${this.now()}</span>${msg}`;
    l.appendChild(d);
    while (l.children.length > 300) l.firstChild.remove();
    l.scrollTop = l.scrollHeight;
  },

  renderState() {
    const h = this.hand; if (!h) return;
    NP.$('#st0').textContent = NP.fmt(h.stacks[0]);
    NP.$('#st1').textContent = NP.fmt(h.stacks[1]);
    NP.$('#potVal').textContent = NP.fmt(h.potNow());
    NP.$('#stageLbl').textContent = NP.STAGES[Math.min(h.stage, 4)];
    for (const p of [0, 1]) {
      const b = NP.$('#bet' + p);
      b.classList.toggle('on', h.bets[p] > 0);
      b.lastElementChild.textContent = NP.fmt(h.bets[p]);
      NP.$('#dl' + p).classList.toggle('on', h.button === p);
      NP.$('#seat' + p).classList.toggle('turn', !h.over && h.toAct === p);
    }
  },

  bubble(p, text, cls) {
    const b = NP.$('#bub' + p);
    b.textContent = text;
    b.className = 'act-bubble on ' + cls;
  },

  dealBoardCards(stage, board) {
    const row = NP.$('#boardRow');
    const count = stage === 1 ? 3 : 1;
    const start = board.length - count;
    for (let i = 0; i < count; i++) {
      const idx = start + i;
      const card = board[idx];
      if (!card) continue;
      const el = NP.makeCard(card, { delay: i * 140 });
      const target = row.children[idx];
      if (target) target.replaceWith(el);
      else row.appendChild(el);
    }
  },

  actionDetails(e, h) {
    const who = this.who(e.p);
    const pot = h.potNow();
    if (e.a === 'fold') {
      const total = h.totalInvested();
      return {
        bubble: 'Фолд', cls: 'fold', sound: 'fold',
        log: `${who}: <b>ФОЛД</b> — сбрасывает карты на улице «${NP.STAGES[this.street]}». ${this.who(1 - e.p)} забирает банк ${NP.fmt(total)} без вскрытия.`,
        review: `${who} сбросил карты (${NP.STAGES[this.street]}). Банк ${NP.fmt(total)} уходит ${this.who(1 - e.p)}.`
      };
    }
    if (e.a === 'check') return {
      bubble: 'Чек', cls: 'call', sound: 'check',
      log: `${who}: <b>ЧЕК</b> — пропускает ход без ставки. Банк ${NP.fmt(pot)}.`,
      review: `${who}: чек. Банк ${NP.fmt(pot)}.`
    };
    if (e.a === 'call') return {
      bubble: (e.allin ? 'Колл олл-ин ' : 'Колл ') + NP.fmt(e.amt), cls: e.allin ? 'allin' : 'call', sound: 'chip',
      log: `${who}: <b>КОЛЛ ${NP.fmt(e.amt)}</b>${e.allin ? ' (олл-ин)' : ''} — уравнивает ставку. Банк ${NP.fmt(pot)}. Стек ${who.toLowerCase() === 'вы' ? 'ваш' : 'соперника'}: ${NP.fmt(h.stacks[e.p])}.`,
      review: `${who} уравнял ${NP.fmt(e.amt)}${e.allin ? ' (олл-ин)' : ''}. Банк ${NP.fmt(pot)}.`
    };
    return {
      bubble: (e.allin ? 'Олл-ин ' : 'Рейз до ') + NP.fmt(e.amt), cls: e.allin ? 'allin' : 'raise', sound: 'chip',
      log: `${who}: <b>${e.allin ? 'ОЛЛ-ИН' : 'РЕЙЗ'} до ${NP.fmt(e.amt)}</b>. Банк ${NP.fmt(pot)}. Теперь ${this.who(1 - e.p).toLowerCase()} должен ответить.`,
      review: `${who} повысил до ${NP.fmt(e.amt)}${e.allin ? ' (олл-ин)' : ''}. Банк ${NP.fmt(pot)}.`
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
        this.log(d.log, e.p === 1 && NP.Settings.opp === 'nn' ? 'nn' : '');
        this.pushReview(e.p === 0 ? 'info' : 'bad', d.review);
        this.renderState(); NP.Coach.update();
        await NP.sleep(430);
      }
      else if (e.t === 'refund') {
        this.log(`Неуравненная ставка ${NP.fmt(e.amt)} возвращена ${this.who(e.p).toLowerCase()} (олл-ин за меньшую сумму).`, 'nn');
        this.pushReview('info', `Возврат неуравненной ставки ${NP.fmt(e.amt)} — ${this.who(e.p)}.`);
        this.renderState();
      }
      else if (e.t === 'street') {
        this.street = e.stage;
        NP.$('#bub0').classList.remove('on'); NP.$('#bub1').classList.remove('on');
        this.dealBoardCards(e.stage, h.board);
        NP.SND.play('deal');
        NP.$('#potDisp').classList.remove('bump'); void NP.$('#potDisp').offsetWidth; NP.$('#potDisp').classList.add('bump');
        const newCards = e.stage === 1 ? h.board.slice(0, 3) : h.board.slice(-1);
        const first = h.over ? '' : ` Первым ходит ${this.who(h.toAct).toLowerCase()}.`;
        this.log(`<b>${NP.STAGES[e.stage]}</b>${e.runout ? ' (прогон борда после олл-ина)' : ''}: открыты ${this.cardsText(newCards)}. Всего на столе: ${this.cardsText(h.board)}. Банк ${NP.fmt(h.potNow())}.${first}`, 'street');
        this.pushReview('street', `${NP.STAGES[e.stage]}: ${this.cardsText(newCards)}. Банк ${NP.fmt(h.potNow())}.`);
        this.renderState(); NP.Coach.update();
        await NP.sleep(e.runout ? 620 : 700);
      }
      else if (e.t === 'showdown') {
        NP.$$('#hole1 .pcard').forEach(el => el.classList.remove('down'));
        NP.SND.play('flip');
        await NP.sleep(600);
        const n0 = NP.comboName(e.e0), n1 = NP.comboName(e.e1);
        const w = h.winner;
        this.log(`<b>ВСКРЫТИЕ</b>. Вы: ${n0} (${this.cardsText(h.hole[0])} + борд). Соперник: ${n1} (${this.cardsText(h.hole[1])} + борд). ${w === -1 ? 'Ничья — банк делится.' : 'Побеждает ' + this.who(w).toLowerCase() + '.'}`, 'result');
        this.pushReview('result', `Вскрытие: вы — ${n0}; соперник — ${n1}. ${w === -1 ? 'Ничья.' : 'Победил ' + this.who(w).toLowerCase() + '.'}`);
        const winFive = w === -1 ? NP.bestFive([...h.hole[0], ...h.board]) : NP.bestFive([...h.hole[w], ...h.board]);
        const keys = new Set(winFive.map(NP.ckey));
        NP.$$('#hole0 .pcard, #hole1 .pcard, #boardRow .pcard').forEach(el => { if (el._card && keys.has(NP.ckey(el._card))) el.classList.add('hl'); });
        this.renderState(); NP.Coach.update();
        await NP.sleep(850);
      }
      else if (e.t === 'end') {
        this.log(`ИТОГ РАЗДАЧИ: вы ${e.delta[0] >= 0 ? '+' : ''}${NP.fmt(e.delta[0])}, соперник ${e.delta[1] >= 0 ? '+' : ''}${NP.fmt(e.delta[1])}. Вложено: вы ${NP.fmt(e.invested[0])}, соперник ${NP.fmt(e.invested[1])}. Общий банк ${NP.fmt(e.potTotal)}.`, 'result');
        this.pushReview('result', `Итог: вы ${e.delta[0] >= 0 ? '+' : ''}${NP.fmt(e.delta[0])}; соперник ${e.delta[1] >= 0 ? '+' : ''}${NP.fmt(e.delta[1])}. Банк ${NP.fmt(e.potTotal)}.`);
        this.finishHand(e);
      }
    }
  },

  catLabel(cat) { return ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'][cat]; },

  tiebreakText(a, b) {
    const labels = {
      0: ['старшая карта', 'вторая карта', 'третья карта', 'четвёртая карта', 'пятая карта'],
      1: ['ранг пары', 'первый кикер', 'второй кикер', 'третий кикер'],
      2: ['старшая пара', 'младшая пара', 'кикер'],
      3: ['ранг тройки', 'первый кикер', 'второй кикер'],
      4: ['старшая карта стрита'],
      5: ['старшая карта флеша', 'вторая карта', 'третья карта', 'четвёртая карта', 'пятая карта'],
      6: ['ранг тройки', 'ранг пары'],
      7: ['ранг каре', 'кикер'],
      8: ['старшая карта стрит-флеша']
    };
    const L = labels[a.cat] || [];
    for (let i = 0; i < 5; i++) {
      const av = a.t[i] || 0, bv = b.t[i] || 0;
      if (av !== bv) {
        const mine = av > bv;
        return `Категория одинаковая — «${this.catLabel(a.cat)}». Победителя определяет <b>${L[i] || 'следующая карта'}</b>: ${mine ? 'ваша карта' : 'карта соперника'} <b>${NP.rlabel(Math.max(av, bv))}</b> старше, чем <b>${NP.rlabel(Math.min(av, bv))}</b>.`;
      }
    }
    return 'Все пять карт совпали по рангам — полная ничья.';
  },

  explainResult(s) {
    const lines = [];
    if (s.reason === 'showdown') {
      const a = s.eval[0], b = s.eval[1];
      lines.push(`Раздача дошла до <b>вскрытия</b>: после последней ставки на ривере оба игрока остались в игре, поэтому карты открываются и сравниваются лучшие пятёрки.`);
      if (s.winner === -1) {
        lines.push(`У вас <b>${NP.comboName(a)}</b>, у соперника <b>${NP.comboName(b)}</b>. Комбинации полностью равны, поэтому банк ${NP.fmt(s.potTotal)} делится поровну.`);
      } else {
        lines.push(`У вас <b>${NP.comboName(a)}</b>, у соперника <b>${NP.comboName(b)}</b>.`);
        if (a.cat !== b.cat) {
          const yourWin = s.winner === 0;
          lines.push(`<b>${this.catLabel(yourWin ? a.cat : b.cat)}</b> сильнее, чем <b>${this.catLabel(yourWin ? b.cat : a.cat)}</b> — порядок комбинаций решает исход без сравнения кикеров.`);
        } else lines.push(this.tiebreakText(a, b));
        lines.push(s.winner === 0 ? `Ваша пятёрка старше — вы забираете банк <b>${NP.fmt(s.potTotal)}</b>.` : `Пятёрка соперника старше — он забирает банк <b>${NP.fmt(s.potTotal)}</b>.`);
      }
    } else {
      const folder = s.foldedBy, winner = s.winner;
      lines.push(`Раздача закончилась <b>без вскрытия</b>: ${this.who(folder).toLowerCase()} сделал <b>фолд</b> на улице «${NP.STAGES[s.foldStage]}». Когда один игрок сбрасывает, второй сразу забирает банк — комбинации не сравниваются.`);
      if (s.lastAgg) lines.push(`Последнее агрессивное действие: ${this.who(s.lastAgg.p).toLowerCase()} поставил/повысил до <b>${NP.fmt(s.lastAgg.amt)}</b> на улице «${NP.STAGES[s.lastAgg.stage]}». Именно это давление заставило ${this.who(folder).toLowerCase()} сбросить.`);
      lines.push(`${this.who(winner)} забирает банк <b>${NP.fmt(s.potTotal)}</b>. ${winner === 0 ? 'Вы выиграли за счёт давления, а не за счёт вскрытия.' : 'Соперник выиграл за счёт давления — вы сбросили карты.'}`);
      if (s.board.length >= 3) {
        const fEval = NP.evaluate7([...s.hole[folder], ...s.board]);
        const wEval = NP.evaluate7([...s.hole[winner], ...s.board]);
        lines.push(`Для обучения показываем карты сбросившего: у ${this.who(folder).toLowerCase()} было <b>${NP.comboName(fEval)}</b>, у ${this.who(winner).toLowerCase()} — <b>${NP.comboName(wEval)}</b> на момент фолда. ${fEval.score > wEval.score ? 'Сбросилась более сильная рука — давление/блеф сработали.' : 'Сбросилась более слабая рука — фолд был разумным.'}`);
      } else {
        lines.push(`Раздача завершилась до флопа, поэтому сравнивать готовые комбинации рано — решение было основано на силе карманных карт и ставках.`);
      }
    }
    lines.push(`Фишки: вы вложили <b>${NP.fmt(s.invested[0])}</b>, соперник — <b>${NP.fmt(s.invested[1])}</b>. Ваш чистый результат: <b>${s.delta[0] >= 0 ? '+' : ''}${NP.fmt(s.delta[0])}</b>.`);
    return lines;
  },

  resultHTML(s) {
    const win = s.winner === 0, draw = s.winner === -1;
    const cls = win ? 'win' : draw ? 'draw' : 'lose';
    const icon = win ? '🏆' : draw ? '🤝' : '💀';
    const title = win ? 'Вы выиграли раздачу' : draw ? 'Ничья — банк разделён' : 'Вы проиграли раздачу';
    const deltaCls = s.delta[0] > 0 ? 'plus' : s.delta[0] < 0 ? 'minus' : 'zero';
    const boardCards = s.board.length ? s.board.map(c => NP.cardHTML(c, 'mini')).join('') : '<span class="faint">борд не открылся</span>';
    const handBlock = p => {
      const isWinner = s.winner === p;
      const folded = s.foldedBy === p;
      const ev = s.reason === 'showdown' ? s.eval[p] : (s.board.length ? NP.evaluate7([...s.hole[p], ...s.board]) : null);
      const combo = ev ? NP.comboName(ev) : 'Только карманные карты';
      const best = ev ? NP.bestFive([...s.hole[p], ...s.board]) : s.hole[p];
      const keys = new Set(best.map(NP.ckey));
      const holeHTML = s.hole[p].map(c => NP.cardHTML(c, 'mini' + (keys.has(NP.ckey(c)) ? ' hl' : ''))).join('');
      const bestHTML = best.map(c => NP.cardHTML(c, 'mini hl')).join('');
      return `<div class="res-hand ${isWinner ? 'winner' : ''}">
        <div class="rh-top"><span class="rh-name">${p === 0 ? '🧑 Вы' : '🤖 Соперник'}</span>
          ${folded ? '<span class="rh-badge fold">ФОЛД</span>' : isWinner ? '<span class="rh-badge">ПОБЕДИТЕЛЬ</span>' : ''}</div>
        <div class="cardrow tight">${holeHTML}</div>
        <div class="rh-combo">${combo}</div>
        <div class="rh-note">Лучшая пятёрка (подсвечена):</div>
        <div class="cardrow tight" style="margin-top:6px">${bestHTML}</div>
      </div>`;
    };
    const timeline = s.timeline.map(r => `<div class="rt-item ${r.type}"><span class="rt-time">${r.time}</span><span>${r.text}</span></div>`).join('');
    return `
      <div class="res-head">
        <div class="res-icon">${icon}</div>
        <div><div class="res-title ${cls}">${title}</div>
          <div class="res-sub">Раздача №${s.handNo} · ${s.reason === 'fold' ? 'победа фолдом' : 'вскрытие'} · ${new Date(s.ts).toLocaleString('ru-RU')}</div></div>
        <div class="res-delta ${deltaCls}">${s.delta[0] >= 0 ? '+' : ''}${NP.fmt(s.delta[0])}</div>
      </div>
      <div class="res-why">${this.explainResult(s).map(l => `<div class="why-line">${l}</div>`).join('')}</div>
      <div class="res-sec"><div class="h">🃏 Общие карты</div><div class="res-board"><span class="rb-lbl">Борд</span><div class="cardrow tight">${boardCards}</div></div></div>
      <div class="res-sec"><div class="h">🆚 Руки игроков</div><div class="res-hands">${handBlock(0)}${handBlock(1)}</div></div>
      <div class="res-sec"><div class="h">💰 Движение фишек</div>
        <div class="res-math">
          <div class="rm"><div class="k">Общий банк</div><div class="v">${NP.fmt(s.potTotal)}</div></div>
          <div class="rm"><div class="k">Вы вложили</div><div class="v">${NP.fmt(s.invested[0])}</div></div>
          <div class="rm"><div class="k">Соперник вложил</div><div class="v">${NP.fmt(s.invested[1])}</div></div>
          <div class="rm"><div class="k">Ваш итог</div><div class="v" style="color:${s.delta[0] > 0 ? 'var(--green)' : s.delta[0] < 0 ? 'var(--red)' : 'var(--gold2)'}">${s.delta[0] >= 0 ? '+' : ''}${NP.fmt(s.delta[0])}</div></div>
        </div></div>
      <div class="res-sec"><div class="h">⏱ Хронология раздачи</div><div class="res-timeline">${timeline}</div></div>
      ${this.matchOver ? '<div class="callout warn" style="margin-top:4px">Матч окончен: один из стеков обнулился. Нажмите «Новый матч», чтобы начать заново.</div>' : ''}`;
  },

  finishHand(e) {
    const h = this.hand;
    this.stacks = [...h.stacks];
    this.stats.hands++;
    if (e.winner === 0) this.stats.wins++;
    this.stats.big = Math.max(this.stats.big, e.potTotal);
    NP.$('#gsHands').textContent = this.stats.hands;
    NP.$('#gsWins').textContent = this.stats.wins;
    NP.$('#gsBig').textContent = NP.fmt(this.stats.big);
    NP.$('#gsRate').textContent = Math.round(this.stats.wins / this.stats.hands * 100) + '%';
    const wb = NP.$('#winBanner');
    wb.classList.remove('lose');
    let title;
    if (e.winner === 0) { title = '🏆 Вы выиграли!'; NP.SND.play('win'); NP.CF.burst(60); }
    else if (e.winner === 1) { title = 'Соперник забрал банк'; wb.classList.add('lose'); NP.SND.play('lose'); }
    else { title = '🤝 Ничья'; NP.SND.play('ok'); }
    const sub = e.reason === 'fold' ? (e.winner === 0 ? 'Соперник сбросил карты' : 'Вы сбросили карты') : (h.eval ? NP.comboName(h.eval[e.winner === 1 ? 1 : 0]) : 'Банк разделён');
    NP.$('#wbT').textContent = title;
    NP.$('#wbS').textContent = sub;
    NP.$('#wbA').textContent = (e.delta[0] > 0 ? '+' : '') + NP.fmt(e.delta[0]) + ' фишек';
    wb.classList.add('on');
    this.pushReview(e.winner === 0 ? 'good' : e.winner === 1 ? 'bad' : 'info', `${title}. Ваш результат ${e.delta[0] >= 0 ? '+' : ''}${NP.fmt(e.delta[0])}.`);
    this.matchOver = this.stacks[0] <= 0 || this.stacks[1] <= 0;
    const snapshot = {
      ts: Date.now(), handNo: this.handNo, winner: e.winner, reason: e.reason,
      foldedBy: h.foldedBy, foldStage: this.street, lastAgg: this.lastAgg ? { ...this.lastAgg } : null,
      delta: [...e.delta], invested: [...e.invested], potTotal: e.potTotal,
      hole: [h.hole[0].map(c => ({ ...c })), h.hole[1].map(c => ({ ...c }))],
      board: h.board.map(c => ({ ...c })),
      eval: h.eval ? [{ ...h.eval[0], t: [...h.eval[0].t] }, { ...h.eval[1], t: [...h.eval[1].t] }] : null,
      timeline: this.review.map(r => ({ ...r }))
    };
    this.lastResult = { snapshot, html: this.resultHTML(snapshot) };
    NP.$('#reviewBtn').disabled = false;
    NP.$('#resultNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Следующая раздача';
    NP.$('#btnNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Новая раздача';
    this.renderState(); this.disablePlayer();
    this.button = 1 - this.button;
    NP.Coach.update();
    NP.$('#nextRow').classList.add('on');
    if (NP.Settings.autoReview) {
      const tok = this.token;
      setTimeout(() => { if (tok === this.token) this.openReview(); }, 900);
    }
  },

  openReview() {
    if (!this.lastResult) return;
    NP.$('#resultBody').innerHTML = this.lastResult.html;
    NP.$('#resultNext').innerHTML = this.matchOver ? '↺ Новый матч' : '▶ Следующая раздача';
    NP.$('#resultModal').classList.add('on');
    NP.SND.play('click');
  },

  continueAfterReview() {
    NP.$('#resultModal').classList.remove('on');
    if (this.matchOver) this.newMatch();
    else this.startHand();
  },

  showMatchEnd() {
    const youWin = this.stacks[0] > this.stacks[1];
    NP.$('#mmIcon').textContent = youWin ? '🏆' : '💀';
    NP.$('#mmTitle').textContent = youWin ? 'Победа в матче!' : 'Матч проигран';
    NP.$('#mmText').textContent = youWin ? 'Вы забрали все фишки соперника.' : 'Соперник забрал все ваши фишки. Реванш?';
    NP.$('#matchModal').classList.add('on');
    if (youWin) { NP.SND.play('win'); NP.CF.burst(160); } else NP.SND.play('lose');
  },

  enablePlayer() {
    const h = this.hand;
    if (!h || h.over || h.toAct !== 0) return;
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
    const combo = h.board.length ? NP.comboName(NP.evaluate7([...h.hole[0], ...h.board])) : 'Карманные: ' + h.hole[0].map(c => NP.rlabel(c.r) + NP.SUIT_CH[c.s]).join(' ');
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
      if (this.hand.toAct === 1) await this.runAI(); else this.enablePlayer();
    } catch (err) {
      console.error(err);
      NP.toast('Ошибка обработки хода. Раздача перезапущена.', 'err');
      this.startHand();
    }
  },

  async runAI() {
    const tok = this.token, h = this.hand;
    try {
      while (h && !h.over && h.toAct === 1) {
        if (tok !== this.token) return;
        this.disablePlayer();
        NP.$('#think1').classList.add('on');
        this.renderState();
        await NP.sleep(620 + Math.random() * 520);
        if (tok !== this.token) return;
        let d;
        if (NP.Settings.opp === 'nn') {
          const f = NP.buildFeatures(h, 1, NP.Model.opp[0]);
          const mask = NP.nnMask(h, 1, NP.Settings.nnBluff, f.s, f.draw);
          const p = NP.Model.net.forward(f.x, mask);
          let idx = 0, r = Math.random(), acc = 0;
          for (let i = 0; i < 5; i++) { acc += p[i]; if (r <= acc) { idx = i; break; } }
          d = NP.nnActionFrom(idx, h, 1);
        } else d = NP.algoDecide(h, 1, { bluff: NP.Settings.botBluff, bluffFreq: NP.Settings.botBluffFreq / 100 });
        NP.$('#think1').classList.remove('on');
        const evts = h.act(d.a, d.to);
        await this.processEvents(evts);
      }
      if (tok !== this.token) return;
      if (!h.over) this.enablePlayer();
    } catch (err) {
      console.error(err);
      NP.$('#think1').classList.remove('on');
      NP.toast('Ошибка хода соперника. Раздача перезапущена.', 'err');
      this.startHand();
    }
  }
};