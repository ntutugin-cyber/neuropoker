window.NP = window.NP || {};

NP.Learn = {
  lesson: 0, step: 0, resolved: {},
  progress: NP.store.get('np_progress_v2', {}),

  lessons() { return NP.Content.lessons; },
  exam() { return NP.Content.exam; },

  save() { NP.store.set('np_progress_v2', this.progress); },
  doneCount() { return this.lessons().filter((_, i) => this.progress[i]?.done).length; },

  renderSidebar() {
    const list = NP.$('#lessonList');
    list.innerHTML = '';
    this.lessons().forEach((L, i) => {
      const b = document.createElement('button');
      b.className = 'll-item' + (i === this.lesson ? ' sel' : '') + (this.progress[i]?.done ? ' done' : '');
      b.innerHTML = `<span class="num">${this.progress[i]?.done ? '✓' : i + 1}</span>
        <span><span class="tt">${NP.esc(L.title)}</span><br><span class="st">${NP.esc(L.sub)}</span></span>`;
      b.onclick = () => { NP.SND.play('click'); this.lesson = i; this.step = 0; this.resolved = {}; this.render(); };
      list.appendChild(b);
    });
    const pct = this.lessons().length ? Math.round(this.doneCount() / this.lessons().length * 100) : 0;
    NP.$('#learnPct').textContent = pct + '%';
    NP.$('#learnBar').style.width = pct + '%';
  },

  markDone(i) {
    if (this.progress[i]?.done) return;
    this.progress[i] = { done: true };
    this.save(); this.renderSidebar();
    NP.SND.play('win'); NP.CF.burst(100);
    NP.toast('🎓 Урок «' + this.lessons()[i].title + '» пройден!', 'ok');
  },

  render() {
    this.renderSidebar();
    const L = this.lessons()[this.lesson];
    const body = NP.$('#lessonBody');
    if (!L) {
      body.innerHTML = '<div class="callout warn">Курс не загружен. Проверьте data/lessons.xml и запустите проект через локальный сервер.</div>';
      NP.$('#stepPrev').disabled = true; NP.$('#stepNext').disabled = true;
      return;
    }
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'step-anim';
    wrap.innerHTML = `<div class="faint" style="font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:8px">Урок ${this.lesson + 1} · шаг ${this.step + 1}/${L.steps.length}</div>`;
    body.appendChild(wrap);
    const st = L.steps[this.step];
    const need = ['quiz', 'pick', 'vs', 'showdown', 'exam', 'bestfive', 'outs'].includes(st.type);
    this.resolved[this.step] = this.resolved[this.step] || !need;
    this.buildStep(st, wrap);
    const dots = NP.$('#stepDots');
    dots.innerHTML = '';
    L.steps.forEach((_, i) => {
      const d = document.createElement('i');
      if (i === this.step) d.className = 'cur'; else if (i < this.step) d.className = 'passed';
      dots.appendChild(d);
    });
    NP.$('#stepPrev').disabled = this.step === 0;
    this.updateNext();
  },

  updateNext() {
    const L = this.lessons()[this.lesson];
    if (!L) return;
    const last = this.step === L.steps.length - 1;
    const ok = this.resolved[this.step];
    const btn = NP.$('#stepNext');
    btn.disabled = !ok;
    btn.textContent = last ? (ok ? '✓ Завершить урок' : 'Ответьте на вопросы') : 'Далее →';
  },

  resolvedNow() { this.resolved[this.step] = true; this.updateNext(); },

  next() {
    const L = this.lessons()[this.lesson];
    NP.SND.play('click');
    if (this.step < L.steps.length - 1) { this.step++; this.render(); }
    else {
      this.markDone(this.lesson);
      if (this.lesson < this.lessons().length - 1) {
        this.lesson++; this.step = 0; this.resolved = {}; this.render();
      } else { this.render(); NP.toast('🏆 Курс полностью пройден!', 'ok', 5000); }
    }
  },
  prev() { if (this.step > 0) { this.step--; NP.SND.play('click'); this.render(); } },

  comboRows(from = 0, to = 99) {
    return NP.Content.combos.slice(from, to).map((c, i) => `
      <div class="combo-row">
        <div class="rank-n">${from + i + 1}</div>
        <div class="cardrow tight">${c.cards.split(' ').map(x => NP.cardHTML(NP.C(x), 'mini')).join('')}</div>
        <div class="ci"><div class="cn">${NP.esc(c.name)}</div><div class="cd">${NP.esc(c.desc)}</div>
          <div class="meter"><i style="width:${(10 - (from + i)) * 10}%"></i></div></div>
      </div>`).join('');
  },

  buildStep(st, root) {
    const B = NP.Widgets;
    switch (st.type) {
      case 'text': root.insertAdjacentHTML('beforeend', NP.rich(st.html)); break;
      case 'cards':
        root.insertAdjacentHTML('beforeend', `<h3>Порядок карт</h3><div class="cardrow" style="margin:14px 0">${st.cards.split(' ').map(c => NP.cardHTML(NP.C(c))).join('')}</div><p class="dim">${NP.esc(st.caption)}</p>`);
        root.querySelectorAll('.pcard').forEach((el, i) => { el.classList.add('deal'); el.style.animationDelay = i * 100 + 'ms'; });
        break;
      case 'gallery': root.insertAdjacentHTML('beforeend', '<h3>Комбинации</h3>' + this.comboRows(st.from, st.to)); break;
      case 'quiz': root.appendChild(this.quiz(st, () => this.resolvedNow())); break;
      case 'pick': root.appendChild(B.pick(st, () => this.resolvedNow())); break;
      case 'vs': root.appendChild(B.vs(st, () => this.resolvedNow())); break;
      case 'showdown': root.appendChild(B.showdown(() => this.resolvedNow())); break;
      case 'exam': root.appendChild(B.exam(this.exam(), () => this.resolvedNow(), () => this.markDone(this.lesson))); break;
      default:
        if (B[st.type]) root.appendChild(B[st.type]());
        else root.insertAdjacentHTML('beforeend', `<div class="callout warn">Неизвестный тип шага: ${NP.esc(st.type)}</div>`);
    }
  },

  quiz(st, onRight) {
    const box = document.createElement('div');
    box.className = 'quiz';
    box.innerHTML = `<div class="q">❓ ${NP.rich(st.q)}</div>`;
    const opts = document.createElement('div'); opts.className = 'opts'; box.appendChild(opts);
    const exp = document.createElement('div'); exp.className = 'q-exp'; box.appendChild(exp);
    const hint = document.createElement('button');
    hint.className = 'btn btn-sm btn-ghost'; hint.style.marginTop = '10px'; hint.textContent = '💡 Подсказка';
    hint.onclick = () => { exp.className = 'q-exp on bad'; exp.innerHTML = '💡 ' + NP.rich(st.hint); };
    box.appendChild(hint);
    let done = false;
    st.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'qopt'; b.innerHTML = NP.rich(o);
      b.onclick = () => {
        if (done) return;
        if (i === st.correct) {
          done = true; b.classList.add('right'); NP.SND.play('ok');
          exp.className = 'q-exp on good';
          exp.innerHTML = '✅ <b>Верно!</b> ' + NP.rich(st.explain);
          NP.$$('.qopt', box).forEach(x => x.disabled = true);
          hint.style.display = 'none';
          onRight();
        } else {
          b.classList.add('wrong'); b.disabled = true; NP.SND.play('bad');
          exp.className = 'q-exp on bad';
          exp.innerHTML = 'Не совсем. 💡 ' + NP.rich(st.hint);
        }
      };
      opts.appendChild(b);
    });
    return box;
  }
};

/* Интерактивные виджеты */
NP.Widgets = {
  pick(st, done) {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Проверка</h3><p><b>${NP.rich(st.q)}</b></p>`;
    const row = document.createElement('div'); row.className = 'cardrow'; row.style.margin = '14px 0'; w.appendChild(row);
    const exp = document.createElement('div'); exp.className = 'q-exp'; w.appendChild(exp);
    let solved = false;
    st.cards.split(' ').map(NP.C).forEach((c, i) => {
      const el = NP.makeCard(c, { delay: i * 90 });
      el.classList.add('pickable');
      el.onclick = () => {
        if (solved) return;
        if (i === st.correct) {
          solved = true; el.classList.add('sel', 'hl'); NP.SND.play('ok');
          exp.className = 'q-exp on good'; exp.innerHTML = '✅ ' + NP.rich(st.explain); done();
        } else {
          NP.SND.play('bad'); el.style.animation = 'shake .4s';
          setTimeout(() => el.style.animation = '', 450);
          exp.className = 'q-exp on bad'; exp.innerHTML = 'Подсказка: ' + NP.rich(st.hint);
        }
      };
      row.appendChild(el);
    });
    return w;
  },

  vs(st, done) {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Дуэль комбинаций</h3><p><b>${NP.rich(st.q)}</b></p>`;
    const vs = document.createElement('div'); vs.className = 'vs-pick'; w.appendChild(vs);
    const exp = document.createElement('div'); exp.className = 'q-exp'; w.appendChild(exp);
    let solved = false;
    [st.a, st.b].forEach((hand, hi) => {
      const box = document.createElement('div');
      box.className = 'vs-hand';
      box.innerHTML = `<div class="vl">Рука ${hi === 0 ? 'A' : 'B'}</div><div class="cardrow tight">${hand.split(' ').map(x => NP.cardHTML(NP.C(x), 'mini')).join('')}</div>`;
      box.onclick = () => {
        if (solved) return;
        if (hi === st.winner) {
          solved = true; box.classList.add('right'); NP.SND.play('ok');
          exp.className = 'q-exp on good'; exp.innerHTML = '✅ ' + NP.rich(st.explain); done();
        } else {
          box.classList.add('wrong'); NP.SND.play('bad');
          setTimeout(() => box.classList.remove('wrong'), 500);
          exp.className = 'q-exp on bad'; exp.innerHTML = 'Подсказка: ' + NP.rich(st.hint);
        }
      };
      vs.appendChild(box);
    });
    return w;
  },

  deal() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Интерактивная раздача</h3>
      <div class="demo-table">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div><div class="faint" style="font-size:11px">СОПЕРНИК · BB</div><div class="cardrow tight" id="dwH1"></div></div>
          <div class="mini-pot" id="dwPot">Банк 0</div>
          <div><div class="faint" style="font-size:11px">ВЫ · SB · D</div><div class="cardrow tight" id="dwH0"></div></div>
        </div>
        <div class="cardrow tight" id="dwBoard" style="justify-content:center;margin:12px 0;min-height:50px"></div>
        <div class="demo-msg" id="dwMsg">Нажмите «Следующий этап».</div>
      </div><button class="btn btn-gold" id="dwBtn">▶ Следующий этап</button>`;
    const steps = [
      () => { w.querySelector('#dwPot').textContent = 'Банк 15'; return '💰 Блайнды: вы 5, соперник 10. Банк 15.'; },
      () => { w.querySelector('#dwH0').innerHTML = ['A♠', 'K♥'].map(c => NP.cardHTML(NP.C(c), 'mini')).join(''); w.querySelector('#dwH1').innerHTML = ['Q♦', 'J♦'].map(() => NP.cardHTML(NP.C('2♠'), 'mini down')).join(''); NP.SND.play('deal'); return '🃏 Префлоп: вам A♠ K♥.'; },
      () => { w.querySelector('#dwBoard').innerHTML = ['9♣', 'K♦', '4♠'].map(c => NP.cardHTML(NP.C(c), 'mini')).join(''); NP.SND.play('deal'); return '🌊 Флоп: 9♣ K♦ 4♠. У вас пара королей.'; },
      () => { w.querySelector('#dwBoard').insertAdjacentHTML('beforeend', NP.cardHTML(NP.C('7♥'), 'mini')); NP.SND.play('deal'); return '🔄 Тёрн 7♥.'; },
      () => { w.querySelector('#dwBoard').insertAdjacentHTML('beforeend', NP.cardHTML(NP.C('2♠'), 'mini')); NP.SND.play('deal'); return '🏁 Ривер 2♠.'; },
      () => { w.querySelector('#dwH1').innerHTML = ['Q♦', 'J♦'].map(c => NP.cardHTML(NP.C(c), 'mini')).join(''); NP.SND.play('flip'); return '👁 Вскрытие: у соперника старшая дама. Ваша пара королей побеждает.'; }
    ];
    let i = 0;
    w.querySelector('#dwBtn').onclick = () => {
      if (i >= steps.length) { i = 0; w.querySelector('#dwH0').innerHTML = ''; w.querySelector('#dwH1').innerHTML = ''; w.querySelector('#dwBoard').innerHTML = ''; w.querySelector('#dwPot').textContent = 'Банк 0'; }
      w.querySelector('#dwMsg').innerHTML = NP.rich(steps[i]()); i++; NP.SND.play('click');
      if (i >= steps.length) NP.SND.play('win');
    };
    return w;
  },

  actions() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Потрогайте действия</h3><p>Банк 60, соперник поставил 20, ваш стек 500.</p>
      <div class="demo-table"><div class="demo-msg" id="awMsg">Выберите действие…</div></div>
      <div class="demo-btns">
        <button class="abtn fold" data-a="fold">Фолд</button>
        <button class="abtn call" data-a="check">Чек</button>
        <button class="abtn call" data-a="call">Колл 20</button>
        <button class="abtn raise" data-a="raise">Рейз до 60</button>
        <button class="abtn allin" data-a="allin">Олл-ин</button>
      </div>`;
    const msgs = {
      fold: '🔴 Фолд: карты сброшены, соперник забирает банк.',
      check: '⚪ Чек невозможен: соперник уже поставил. Нужно колл/рейз/фолд.',
      call: '🟢 Колл 20: вы уравняли. Банк 100.',
      raise: '🟠 Рейз до 60: соперник должен реагировать.',
      allin: '🔥 Олл-ин: все фишки в банк.'
    };
    w.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      w.querySelector('#awMsg').innerHTML = NP.rich(msgs[a]);
      if (a === 'check') { NP.SND.play('bad'); b.style.animation = 'shake .4s'; setTimeout(() => b.style.animation = '', 450); }
      else NP.SND.play(a === 'fold' ? 'fold' : 'chip');
    });
    return w;
  },

  odds() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Калькулятор пот-оддсов</h3>
      <div class="set-row"><div class="lab">Банк: <span id="owPotV">100</span></div><input type="range" id="owPot" min="20" max="500" step="10" value="100" style="width:170px"></div>
      <div class="set-row"><div class="lab">Колл: <span id="owCallV">25</span></div><input type="range" id="owCall" min="10" max="200" step="5" value="25" style="width:170px"></div>
      <div class="set-row"><div class="lab">Эквити: <span id="owEqV">35%</span></div><input type="range" id="owEq" min="5" max="95" value="35" style="width:170px"></div>
      <div class="odds-out" id="owOut"></div>`;
    const calc = () => {
      const pot = +w.querySelector('#owPot').value, call = +w.querySelector('#owCall').value, eq = +w.querySelector('#owEq').value;
      w.querySelector('#owPotV').textContent = pot;
      w.querySelector('#owCallV').textContent = call;
      w.querySelector('#owEqV').textContent = eq + '%';
      const po = call / (pot + call) * 100, good = eq > po;
      w.querySelector('#owOut').innerHTML = `Пот-оддсы = <b class="gold-t">${po.toFixed(1)}%</b><br>Эквити ${eq}% → <b style="color:${good ? 'var(--green)' : 'var(--red)'}">${good ? '✅ Колл выгоден' : '❌ Колл невыгоден'}</b>`;
    };
    ['owPot', 'owCall', 'owEq'].forEach(id => w.querySelector('#' + id).oninput = calc);
    calc();
    return w;
  },

  showdown(done) {
    const rounds = [
      { board: 'K♠ 9♣ 4♦ 2♥ 7♠', h0: 'K♥ Q♦', h1: '9♥ 9♠', win: 1, why: 'Тройка девяток сильнее пары королей.' },
      { board: 'A♠ K♠ Q♠ J♠ 3♦', h0: '10♠ 2♣', h1: 'A♥ A♦', win: 0, why: '10♠ достраивает роял-флеш.' },
      { board: '8♥ 8♣ 3♦ 3♠ K♦', h0: 'A♠ K♥', h1: 'Q♥ J♦', win: 0, why: 'Ваш король создаёт большие две пары.' }
    ];
    const w = document.createElement('div');
    let round = 0;
    const render = () => {
      const r = rounds[round];
      w.innerHTML = `<h3>Кто победил? ${round + 1}/${rounds.length}</h3>
        <div class="cardrow tight">${r.board.split(' ').map(c => NP.cardHTML(NP.C(c), 'mini')).join('')}</div>
        <div class="vs-pick">
          <div class="vs-hand" data-h="0"><div class="vl">🧑 Вы</div><div class="cardrow tight">${r.h0.split(' ').map(c => NP.cardHTML(NP.C(c), 'mini')).join('')}</div></div>
          <div class="vs-hand" data-h="1"><div class="vl">🤖 Соперник</div><div class="cardrow tight">${r.h1.split(' ').map(c => NP.cardHTML(NP.C(c), 'mini')).join('')}</div></div>
        </div><div class="q-exp" id="sdExp"></div>`;
      let solved = false;
      w.querySelectorAll('.vs-hand').forEach(box => box.onclick = () => {
        if (solved) return;
        const hi = +box.dataset.h, exp = w.querySelector('#sdExp');
        if (hi === r.win) {
          solved = true; box.classList.add('right'); NP.SND.play('ok');
          exp.className = 'q-exp on good'; exp.innerHTML = '✅ ' + r.why;
          setTimeout(() => {
            round++;
            if (round < rounds.length) render();
            else { w.innerHTML = '<h3>🎉 Все раунды пройдены!</h3>'; NP.SND.play('win'); done(); }
          }, 1800);
        } else {
          box.classList.add('wrong'); NP.SND.play('bad');
          setTimeout(() => box.classList.remove('wrong'), 500);
          exp.className = 'q-exp on bad'; exp.textContent = 'Сравните категории комбинаций.';
        }
      });
    };
    render();
    return w;
  },

  bestfive() {
    const w = document.createElement('div');
    const all = 'A♠ K♠ A♦ K♦ 2♣ 3♥ 9♠'.split(' ').map(NP.C);
    const correct = new Set(NP.bestFive(all).map(NP.ckey));
    w.innerHTML = `<h3>Выберите лучшие пять из семи</h3><div class="cardrow" id="bfRow"></div><div class="demo-msg" id="bfMsg">Выбрано 0/5</div><button class="btn btn-gold" id="bfCheck">Проверить</button>`;
    const sel = new Set();
    all.forEach(c => {
      const el = NP.makeCard(c, { deal: false });
      el.classList.add('pickable');
      el.onclick = () => {
        const k = NP.ckey(c);
        if (sel.has(k)) { sel.delete(k); el.classList.remove('sel'); }
        else if (sel.size < 5) { sel.add(k); el.classList.add('sel'); }
        w.querySelector('#bfMsg').textContent = 'Выбрано ' + sel.size + '/5';
      };
      w.querySelector('#bfRow').appendChild(el);
    });
    w.querySelector('#bfCheck').onclick = () => {
      const ok = sel.size === 5 && [...sel].every(k => correct.has(k));
      w.querySelector('#bfMsg').innerHTML = ok ? '✅ Верно: две пары A и K, кикер 9.' : '❌ Подсказка: две пары тузов и королей + девятка.';
      NP.SND.play(ok ? 'ok' : 'bad');
      if (ok) NP.Learn.resolvedNow();
    };
    return w;
  },

  outs() {
    const w = document.createElement('div');
    const known = 'A♠ 5♠ K♠ 9♠ 2♦'.split(' ').map(NP.C);
    const knownSet = new Set(known.map(NP.ckey));
    const rest = NP.deck52().filter(c => !knownSet.has(NP.ckey(c)));
    const outs = new Set(rest.filter(c => c.s === 0).map(NP.ckey));
    w.innerHTML = `<h3>Найдите ауты флеш-дро</h3><p>У вас A♠ 5♠, борд K♠ 9♠ 2♦. Найдите все карты, дающие флеш.</p>
      <div class="cardrow tight">${known.map(c => NP.cardHTML(c, 'mini')).join('')}</div>
      <div class="outs-grid" id="outGrid"></div><div class="demo-msg" id="outMsg">Нужно 9 аутов.</div>
      <button class="btn btn-gold" id="outCheck">Проверить</button>`;
    const sel = new Set();
    rest.forEach(c => {
      const el = document.createElement('div');
      el.className = 'out-card';
      el.innerHTML = NP.cardHTML(c, 'mini');
      el.onclick = () => {
        const k = NP.ckey(c);
        if (sel.has(k)) { sel.delete(k); el.classList.remove('sel'); } else { sel.add(k); el.classList.add('sel'); }
        w.querySelector('#outMsg').textContent = 'Выбрано ' + sel.size;
      };
      w.querySelector('#outGrid').appendChild(el);
    });
    w.querySelector('#outCheck').onclick = () => {
      const ok = sel.size === outs.size && [...sel].every(k => outs.has(k));
      [...w.querySelector('#outGrid').children].forEach((el, i) => {
        el.classList.toggle('good', outs.has(NP.ckey(rest[i])));
        el.classList.toggle('bad', sel.has(NP.ckey(rest[i])) && !outs.has(NP.ckey(rest[i])));
      });
      w.querySelector('#outMsg').innerHTML = ok ? '✅ Верно: 9 аутов, все оставшиеся пики.' : '❌ Ауты — все оставшиеся карты ♠.';
      NP.SND.play(ok ? 'ok' : 'bad');
      if (ok) NP.Learn.resolvedNow();
    };
    return w;
  },

  raisecalc() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Калькулятор рейза</h3><p>Меняйте параметры и смотрите размеры ставок.</p><div class="odds-out">Мин-рейз обычно удваивает текущую ставку. ½ банка и банк считаются от банка после вашего колла. Олл-ин — весь стек.</div>`;
    return w;
  },

  equitydemo() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Эквити в действии</h3><div class="row"><div class="cardrow tight">${'A♠ A♥'.split(' ').map(c => NP.cardHTML(NP.C(c), 'mini')).join('')}</div><span>против</span><div class="cardrow tight">${'K♠ Q♠'.split(' ').map(c => NP.cardHTML(NP.C(c), 'mini')).join('')}</div></div><div class="eq-bar"><i id="eqBar" style="width:50%"></i></div><div class="demo-msg" id="eqMsg">Нажмите симуляцию.</div><button class="btn btn-cyan" id="eqRun">▶ 500 раздач</button>`;
    w.querySelector('#eqRun').onclick = () => {
      const h0 = 'A♠ A♥'.split(' ').map(NP.C), h1 = 'K♠ Q♠'.split(' ').map(NP.C);
      const known = new Set([...h0, ...h1].map(NP.ckey));
      const rest = NP.deck52().filter(c => !known.has(NP.ckey(c)));
      let win = 0, tie = 0;
      for (let i = 0; i < 500; i++) {
        NP.shuffle(rest);
        const b = rest.slice(0, 5);
        const a = NP.evaluate7([...h0, ...b]).score, o = NP.evaluate7([...h1, ...b]).score;
        if (a > o) win++; else if (a === o) tie++;
      }
      const pct = (win + tie * .5) / 500 * 100;
      w.querySelector('#eqBar').style.width = pct + '%';
      w.querySelector('#eqMsg').innerHTML = `AA против KQs: <b class="green-t">${pct.toFixed(1)}%</b> побед.`;
      NP.SND.play('ok');
    };
    return w;
  },

  position() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Позиция</h3><div class="demo-table"><div class="demo-msg" id="posMsg">Вы на баттоне: на префлопе ходите первым, после флопа — вторым.</div></div><button class="btn btn-gold" id="posBtn">▶ Перейти на флоп</button>`;
    let flop = false;
    w.querySelector('#posBtn').onclick = () => {
      flop = !flop;
      w.querySelector('#posMsg').innerHTML = flop ? '✅ После флопа вы <b>в позиции</b>: видите действие соперника.' : 'Вы на баттоне: префлоп первым, постфлоп вторым.';
      w.querySelector('#posBtn').textContent = flop ? '↺ Префлоп' : '▶ Перейти на флоп';
    };
    return w;
  },

  grid() {
    const w = document.createElement('div');
    const ranks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const score = (r1, r2, suited) => {
      const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
      let v = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
      if (r1 === r2) v = Math.max(5, v * 2);
      if (suited) v += 2;
      if (r1 !== r2) { const gap = hi - lo - 1; v -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5; if (gap <= 1 && hi < 12) v += 1; }
      return (v + 2) / 22;
    };
    let html = '<h3>Карта стартовых рук</h3><div class="hand-grid">';
    ranks.forEach((r1, i) => ranks.forEach((r2, j) => {
      const suited = j > i, pair = i === j, s = score(r1, r2, suited);
      const tier = s > .62 ? 2 : s > .45 ? 1 : 0;
      const label = NP.rlabel(r1) + NP.rlabel(r2) + (pair ? '' : suited ? 's' : 'o');
      html += `<div class="hg-cell t${tier}" data-l="${label}" data-t="${tier}">${label}</div>`;
    }));
    html += '</div><div class="demo-msg" id="hgMsg">Кликните клетку.</div>';
    w.innerHTML = html;
    w.querySelectorAll('.hg-cell').forEach(c => c.onclick = () => {
      const t = +c.dataset.t;
      w.querySelector('#hgMsg').innerHTML = `<b class="gold-t">${c.dataset.l}</b>: ` + (t === 2 ? '💪 играйте смело' : t === 1 ? '🤔 осторожно' : '🗑️ фолд');
    });
    return w;
  },

  range() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Диапазон</h3><p>Новичку комфортно начинать с 20–25% лучших рук.</p><div class="callout">Чем уже диапазон, тем проще решения после флопа. Чем шире — тем больше сложных ситуаций.</div>`;
    return w;
  },

  bluffscenarios() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Когда блефовать</h3><div class="gloss">
      <div class="g"><b>✅ Хороший блеф</b>Сухой тузовый борд, вы рейзили префлоп, соперник чек.</div>
      <div class="g"><b>❌ Плохой блеф</b>Соперник коллирует всё. Он не сбросит.</div>
      <div class="g"><b>✅ Полублеф</b>Флеш-дро: можно выиграть сразу или собрать флеш.</div>
    </div>`;
    return w;
  },

  opponents() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Типы соперников</h3><div class="gloss">
      <div class="g" data-term="callingstation"><b>📞 Телефон</b>Не блефовать, ставить на вэлью.</div>
      <div class="g" data-term="nit"><b>🪨 Нит</b>Верить большим ставкам.</div>
      <div class="g" data-term="maniac"><b>🔥 Маньяк</b>Ловить с сильными руками.</div>
      <div class="g" data-term="reg"><b>🎯 Рег</b>Менять размеры и линии.</div>
    </div>`;
    return w;
  },

  mistakes() {
    const w = document.createElement('div');
    w.innerHTML = `<h3>Ошибки новичка</h3><div class="gloss">
      <div class="g"><b>❌ Колл с мусором</b>Фолд экономит фишки.</div>
      <div class="g"><b>❌ Блеф против телефона</b>Он не сбрасывает.</div>
      <div class="g"><b>❌ Все руки подряд</b>Нужно терпение.</div>
      <div class="g"><b>❌ Игнор математики</b>Считайте пот-оддсы.</div>
      <div class="g"><b>❌ Тильт</b>После проигрыша — пауза.</div>
    </div>`;
    return w;
  },

  exam(questions, done, mark) {
    const w = document.createElement('div');
    let idx = 0, score = 0;
    const render = () => {
      w.innerHTML = `<h3>Экзамен · ${idx + 1}/${questions.length}</h3>`;
      const q = NP.Learn.quiz(questions[idx], () => { score++; setTimeout(next, 1200); });
      w.appendChild(q);
      const cont = document.createElement('button');
      cont.className = 'btn btn-sm'; cont.style.marginTop = '10px'; cont.textContent = 'Продолжить →'; cont.style.display = 'none';
      cont.onclick = next; w.appendChild(cont);
      const obs = new MutationObserver(() => { if (q.querySelector('.q-exp.on')) cont.style.display = 'inline-flex'; });
      obs.observe(q, { subtree: true, attributes: true, attributeFilter: ['class'] });
      function next() { obs.disconnect(); idx++; idx < questions.length ? render() : finish(); }
    };
    const finish = () => {
      const pass = score >= Math.ceil(questions.length * .75);
      w.innerHTML = `<div class="cert"><div style="font-size:40px">${pass ? '🏆' : '📚'}</div>
        <div class="ct">${pass ? 'СЕРТИФИКАТ' : 'ПОЧТИ ПОЛУЧИЛОСЬ'}</div>
        <p style="margin:10px 0">Результат: <b class="gold-t mono">${score}/${questions.length}</b></p>
        <button class="btn btn-gold" id="exRetry">↺ Ещё раз</button></div>`;
      w.querySelector('#exRetry').onclick = () => { idx = 0; score = 0; render(); };
      if (pass) { NP.SND.play('win'); NP.CF.burst(180); mark(); } else NP.SND.play('lose');
      done();
    };
    render();
    return w;
  }
};