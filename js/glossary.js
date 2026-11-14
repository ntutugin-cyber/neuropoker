window.NP = window.NP || {};

NP.rich = function (html) {
  return String(html).replace(/\{\{([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi, (m, id, label) => {
    const t = NP.Content.map[id.toLowerCase()];
    if (!t) return label || id;
    return `<span class="tlink" data-term="${t.id}">${NP.esc(label || t.title)}</span>`;
  });
};

NP.openTerm = function (id) {
  const t = NP.Content.map[String(id).toLowerCase()];
  if (!t) return;
  const rel = (t.rel || []).map(r => NP.Content.map[r]).filter(Boolean);
  NP.$('#termBody').innerHTML = `
    <div class="term-title">${NP.esc(t.title)}</div>
    <div class="term-cat">${NP.esc(t.cat)}</div>
    <div class="term-def">${NP.rich(t.def)}</div>
    <div class="term-ex">💬 ${NP.rich(t.ex)}</div>
    ${rel.length ? `<div class="h" style="font-size:11px;margin:12px 0 6px">Связанные термины</div>
      <div class="term-rel">${rel.map(r => `<button data-term="${r.id}">${NP.esc(r.title)}</button>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn btn-sm btn-cyan" data-term-flash="${t.id}">🔄 В тренажёр</button></div>`;
  NP.$('#termModal').classList.add('on');
  NP.SND.play('click');
};

NP.Gloss = {
  tab: 'dict', cat: 'Все', q: '',
  flashIdx: 0, flashDeck: [],
  flashKnown: NP.store.get('np_terms_known', {}),
  quiz: null,

  terms() { return NP.Content.terms; },
  cats() { return ['Все', ...new Set(this.terms().map(t => t.cat))]; },
  filtered() {
    const q = this.q.trim().toLowerCase();
    return this.terms().filter(t =>
      (this.cat === 'Все' || t.cat === this.cat) &&
      (!q || t.title.toLowerCase().includes(q) || t.def.toLowerCase().includes(q))
    );
  },

  open(tab = 'dict', termId = null) {
    NP.$('#glossModal').classList.add('on');
    this.tab = tab;
    if (termId) { this.flashDeck = [NP.Content.map[termId]]; this.flashIdx = 0; }
    else this.flashDeck = NP.shuffle(this.filtered().slice());
    this.render();
    NP.SND.play('click');
  },

  newQuiz() {
    const items = NP.shuffle(this.terms().slice()).slice(0, 10);
    const opts = items.map(t =>
      NP.shuffle([t, ...NP.shuffle(this.terms().filter(x => x.id !== t.id)).slice(0, 3)])
    );
    return { items, opts, i: 0, score: 0, done: false };
  },

  render() {
    NP.$$('.gl-tab').forEach(b => b.classList.toggle('active', b.dataset.gl === this.tab));
    const body = NP.$('#glBody');
    if (!this.terms().length) {
      body.innerHTML = '<div class="callout warn">Термины не загружены. Проверьте data/terms.xml и запустите локальный сервер.</div>';
      return;
    }
    if (this.tab === 'dict') this.renderDict(body);
    else if (this.tab === 'flash') this.renderFlash(body);
    else this.renderQuiz(body);
  },

  renderDict(body) {
    const list = this.filtered();
    body.innerHTML = `
      <div class="gl-controls">
        <input id="glSearch" placeholder="Поиск: рейз, эквити, флоп…" value="${NP.esc(this.q)}">
        <span class="chip-tag">Найдено: <b>${list.length}</b></span>
      </div>
      <div class="gl-cats">${this.cats().map(c => `<button class="gl-cat ${c === this.cat ? 'active' : ''}" data-cat="${NP.esc(c)}">${NP.esc(c)}</button>`).join('')}</div>
      <div class="gl-list">${list.map(t => `
        <div class="gl-card" data-term="${t.id}">
          <div class="gt">${NP.esc(t.title)}</div>
          <div class="gc">${NP.esc(t.cat)}</div>
          <div class="gd">${NP.rich(t.def)}</div>
          <div class="ge">💬 ${NP.rich(t.ex)}</div>
        </div>`).join('')}</div>`;
    NP.$('#glSearch').oninput = e => { this.q = e.target.value; this.render(); };
    NP.$$('.gl-cat', body).forEach(b => b.onclick = () => { this.cat = b.dataset.cat; this.render(); });
  },

  renderFlash(body) {
    if (!this.flashDeck.length) this.flashDeck = NP.shuffle(this.filtered().slice());
    if (!this.flashDeck.length) { body.innerHTML = '<div class="callout warn">Нет карточек для выбранной категории.</div>'; return; }
    const t = this.flashDeck[this.flashIdx % this.flashDeck.length];
    const known = Object.keys(this.flashKnown).length;
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-progress">Карточка ${this.flashIdx + 1}/${this.flashDeck.length} · выучено ${known}/${this.terms().length}</div>
        <div class="flash" id="flashCard"><div class="fin">
          <div class="ff"><div class="ft">${NP.esc(t.title)}</div><div class="fc">${NP.esc(t.cat)} · нажмите, чтобы перевернуть</div></div>
          <div class="fb"><div class="fd">${NP.rich(t.def)}</div><div class="fe">💬 ${NP.rich(t.ex)}</div></div>
        </div></div>
        <div class="flash-btns">
          <button class="btn btn-danger" id="flashNo">❌ Ещё учу</button>
          <button class="btn" id="flashNext">➡ Далее</button>
          <button class="btn btn-gold" id="flashYes">✅ Знаю</button>
        </div>
        <div class="row">
          <button class="btn btn-sm" id="flashShuffle">🔀 Перемешать</button>
          <button class="btn btn-sm" id="flashReset">↺ Сбросить прогресс</button>
        </div>
      </div>`;
    NP.$('#flashCard').onclick = () => { NP.$('#flashCard').classList.toggle('flipped'); NP.SND.play('flip'); };
    const next = () => { this.flashIdx = (this.flashIdx + 1) % this.flashDeck.length; this.render(); };
    NP.$('#flashNext').onclick = next;
    NP.$('#flashYes').onclick = () => { this.flashKnown[t.id] = 1; NP.store.set('np_terms_known', this.flashKnown); NP.SND.play('ok'); next(); };
    NP.$('#flashNo').onclick = () => { delete this.flashKnown[t.id]; NP.store.set('np_terms_known', this.flashKnown); next(); };
    NP.$('#flashShuffle').onclick = () => { this.flashDeck = NP.shuffle(this.filtered().slice()); this.flashIdx = 0; this.render(); };
    NP.$('#flashReset').onclick = () => NP.confirm('Сбросить прогресс?', 'Отметки «знаю» будут удалены.', () => {
      this.flashKnown = {}; NP.store.set('np_terms_known', {}); this.render();
    });
  },

  renderQuiz(body) {
    if (!this.quiz || this.quiz.done) this.quiz = this.newQuiz();
    const q = this.quiz;
    const t = q.items[q.i];
    const opts = q.opts[q.i]; // ИСПРАВЛЕНО: варианты конкретного вопроса

    body.innerHTML = `
      <div class="quiz">
        <div class="q">Вопрос ${q.i + 1}/${q.items.length}: какой термин означает это?</div>
        <div class="callout">${NP.rich(t.def)}</div>
        <div class="opts">${opts.map((o, i) => `<button class="qopt" data-i="${i}">${NP.esc(o.title)}</button>`).join('')}</div>
        <div class="q-exp" id="tqExp"></div>
      </div>
      <div class="row">
        <span class="chip-tag">Счёт: <b class="green-t">${q.score}</b></span>
        <button class="btn btn-sm" id="tqNext" style="display:none">Далее →</button>
        <button class="btn btn-sm btn-ghost" id="tqRestart">↺ Новая проверка</button>
      </div>`;

    const exp = NP.$('#tqExp');
    let answered = false;
    NP.$$('.qopt', body).forEach(b => b.onclick = () => {
      if (answered) return;
      answered = true;
      const i = +b.dataset.i;
      const ok = opts[i].id === t.id;
      if (ok) {
        q.score++; b.classList.add('right'); NP.SND.play('ok');
        exp.className = 'q-exp on good';
        exp.innerHTML = `✅ Верно: <b>${NP.esc(t.title)}</b>. ${NP.rich(t.ex)}`;
      } else {
        b.classList.add('wrong'); NP.SND.play('bad');
        exp.className = 'q-exp on bad';
        exp.innerHTML = `Правильный ответ: <b>${NP.esc(t.title)}</b>. ${NP.rich(t.ex)}`;
        NP.$$('.qopt', body).forEach(x => { if (opts[+x.dataset.i].id === t.id) x.classList.add('right'); });
      }
      NP.$$('.qopt', body).forEach(x => x.disabled = true);
      NP.$('#tqNext').style.display = 'inline-flex';
    });

    NP.$('#tqNext').onclick = () => {
      q.i++;
      if (q.i >= q.items.length) {
        q.done = true;
        body.innerHTML = `
          <div class="cert">
            <div style="font-size:38px">${q.score >= 8 ? '🏆' : '📚'}</div>
            <div class="ct">Проверка терминов</div>
            <p style="margin:10px 0">Результат: <b class="gold-t mono">${q.score}/${q.items.length}</b></p>
            <button class="btn btn-gold" id="tqAgain">↺ Ещё раз</button>
          </div>`;
        NP.$('#tqAgain').onclick = () => { this.quiz = this.newQuiz(); this.render(); };
        if (q.score >= 8) { NP.CF.burst(120); NP.SND.play('win'); }
      } else this.render();
    };
    NP.$('#tqRestart').onclick = () => { this.quiz = this.newQuiz(); this.render(); };
  }
};