window.NP = window.NP || {};

NP.Coach = {
  open: false,
  toggle(force) {
    this.open = force ?? !this.open;
    NP.$('#coachDrawer').classList.toggle('open', this.open);
    NP.$('#coachFab').style.display = this.open ? 'none' : 'flex';
    if (this.open) { this.update(); this.renderTerms(); }
  },
  update() {
    if (!this.open) return;
    const h = NP.Game?.hand;
    if (!h) { NP.$('#coachLive').innerHTML = 'Начните раздачу.'; return; }
    const L = h.legalFor(0);
    const combo = h.board.length ? NP.comboName(NP.evaluate7([...h.hole[0], ...h.board])) : 'Карманные ' + h.hole[0].map(c => NP.rlabel(c.r) + NP.SUIT_CH[c.s]).join(' ');
    const eq = NP.mcEquity(h.hole[0], h.board, 110);
    const po = L && L.toCall > 0 ? L.toCall / (L.potNow + L.toCall) : 0;
    const pos = h.button === 0 ? '{{ip|в позиции}}' : '{{oop|без позиции}}';
    let rec;
    if (h.over) rec = 'Раздача завершена. Посмотрите разбор ниже.';
    else if (h.toAct !== 0) rec = 'Сейчас ход соперника. Наблюдайте за размером его ставки.';
    else if (L.toCall > 0) rec = eq > po + .1 ? '{{equity|Эквити}} выше {{potodds|пот-оддсов}} — {{call|колл}} оправдан.' : eq > po ? 'Пограничная ситуация: учитывайте {{position|позицию}}.' : 'Цена высока для вашей руки — чаще {{fold|фолд}}.';
    else rec = eq > .66 ? 'Сильная рука: {{valuebet|вэлью-бет}}.' : eq > .45 ? 'Средняя рука: {{check|чек}} или маленький {{bet|бет}}.' : 'Слабая рука: {{check|чек}} или аккуратный {{bluff|блеф}}.';
    NP.$('#coachLive').innerHTML = NP.rich(`Сейчас <b>${NP.STAGES[Math.min(h.stage, 4)]}</b>. Рука: <b>${combo}</b>. Вы ${pos}. {{equity|Эквити}} ≈ <b>${Math.round(eq * 100)}%</b>${L && L.toCall > 0 ? `, {{potodds|пот-оддсы}} <b>${Math.round(po * 100)}%</b>` : ''}.<br><br><b>Совет:</b> ${rec}`);
    const rows = [];
    if (L && !h.over && h.toAct === 0) {
      rows.push(`<div class="coach-action"><b>{{fold|Фолд}}</b>${L.canFold ? 'Сбросить карты и потерять уже вложенное.' : 'Недоступен: есть бесплатный чек.'}</div>`);
      rows.push(`<div class="coach-action"><b>{{check|Чек}} / {{call|Колл}}</b>${L.canCheck ? 'Бесплатно пропустить ход.' : 'Уравнять ' + NP.fmt(L.callAmt) + '.'}</div>`);
      rows.push(`<div class="coach-action"><b>{{bet|Бет}} / {{raise|Рейз}}</b>${L.canRaise ? 'От ' + NP.fmt(L.minTo) + ' до ' + NP.fmt(L.maxTo) + '.' : 'Недостаточно фишек для повышения.'}</div>`);
      rows.push(`<div class="coach-action"><b>{{allin|Олл-ин}}</b>${L.canRaise ? 'Все фишки: ' + NP.fmt(L.maxTo) + '.' : 'Недоступен как отдельный рейз.'}</div>`);
    } else rows.push('<div class="coach-action"><b>Ожидание</b>Дождитесь своего хода.</div>');
    NP.$('#coachActions').innerHTML = NP.rich(rows.join(''));
    NP.$('#coachReview').innerHTML = NP.Game.review.length
      ? NP.Game.review.map(r => `<div class="rv ${r.type}">${NP.rich(r.text)}</div>`).join('')
      : 'Раздача ещё не сыграна.';
  },
  renderTerms() {
    const q = (NP.$('#coachSearch').value || '').toLowerCase().trim();
    const list = NP.Content.terms.filter(t => !q || t.title.toLowerCase().includes(q) || t.def.toLowerCase().includes(q)).slice(0, 14);
    NP.$('#coachTerms').innerHTML = list.map(t => `<div class="coach-term" data-term="${t.id}"><b>${NP.esc(t.title)}</b><span>${NP.esc(t.def.slice(0, 90))}${t.def.length > 90 ? '…' : ''}</span></div>`).join('');
  }
};