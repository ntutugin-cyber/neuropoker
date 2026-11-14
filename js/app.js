window.NP = window.NP || {};

(async function init() {
  NP.CF.init();

  /* Модальные окна */
  NP.$('#cfYes').onclick = () => { NP.$('#confirmModal').classList.remove('on'); NP._cfCb?.(); NP._cfCb = null; };
  NP.$('#cfNo').onclick = () => { NP.$('#confirmModal').classList.remove('on'); NP._cfCb = null; };
  NP.$$('.modal-x').forEach(b => b.onclick = () => NP.$('#' + b.dataset.close).classList.remove('on'));
  NP.$$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m && !['matchModal', 'resultModal'].includes(m.id)) m.classList.remove('on');
  }));

  /* Звук */
  const sndUI = () => {
    NP.$('#sndIc').textContent = NP.SND.on ? '🔊' : '🔇';
    NP.$('#sndLbl').textContent = NP.SND.on ? 'Звук вкл' : 'Звук выкл';
    NP.$('#sndBtn').classList.toggle('off', !NP.SND.on);
  };
  NP.$('#sndBtn').onclick = () => { NP.SND.on = !NP.SND.on; NP.store.set('np_snd', NP.SND.on); sndUI(); if (NP.SND.on) NP.SND.play('ok'); };
  sndUI();
  document.addEventListener('pointerdown', () => NP.SND.ensure(), { once: true });

  /* Загрузка XML-контента */
  const ok = await NP.Content.load();
  if (!ok) {
    NP.$('#contentWarning').innerHTML = `<div class="callout warn">
      <b>Обучающий контент не загружен.</b><br>${NP.esc(NP.Content.error || '')}<br><br>
      Запустите проект через локальный сервер, например:<br>
      <code>python -m http.server 8080</code> → <code>http://localhost:8080</code>
    </div>`;
    NP.toast('XML-контент не загружен. Запустите локальный сервер.', 'warn', 7000);
  }

  /* Правила и словарь */
  NP.$('#rulesCombos').innerHTML = NP.Learn.comboRows();
  NP.$('#rulesBtn').onclick = () => NP.$('#rulesModal').classList.add('on');
  NP.$('#glossBtn').onclick = () => NP.Gloss.open('dict');
  NP.$('#learnGlossBtn').onclick = () => NP.Gloss.open('dict');
  NP.$('#learnFlashBtn').onclick = () => NP.Gloss.open('flash');
  NP.$('#learnQuizBtn').onclick = () => NP.Gloss.open('quiz');
  NP.$$('.gl-tab').forEach(b => b.onclick = () => { NP.Gloss.tab = b.dataset.gl; NP.Gloss.render(); });

  /* Кликабельные термины */
  document.addEventListener('click', e => {
    const t = e.target.closest('.tlink,[data-term]');
    if (t?.dataset.term) { NP.openTerm(t.dataset.term); return; }
    const tf = e.target.closest('[data-term-flash]');
    if (tf) NP.Gloss.open('flash', tf.dataset.termFlash);
  });

  /* Коуч */
  NP.$('#coachBtn').onclick = () => NP.Coach.toggle(true);
  NP.$('#coachFab').onclick = () => NP.Coach.toggle(true);
  NP.$('#coachClose').onclick = () => NP.Coach.toggle(false);
  NP.$('#hintExplain').onclick = () => NP.Coach.toggle(true);
  NP.$('#coachSearch').oninput = () => NP.Coach.renderTerms();
  NP.$('#coachFull').onclick = () => { NP.$('.tab[data-scr="learn"]').click(); NP.Coach.toggle(false); };
  NP.$('#learnCoachBtn').onclick = () => { NP.$('.tab[data-scr="game"]').click(); NP.Coach.toggle(true); };
  NP.$$('[data-quick]').forEach(b => b.onclick = () => {
    const idx = NP.Content.lessons.findIndex(l => l.id === b.dataset.quick);
    if (idx >= 0) { NP.Learn.lesson = idx; NP.Learn.step = 0; NP.Learn.resolved = {}; }
    NP.$('.tab[data-scr="learn"]').click();
    NP.Coach.toggle(false);
  });

  /* Обучение */
  NP.$('#stepPrev').onclick = () => NP.Learn.prev();
  NP.$('#stepNext').onclick = () => NP.Learn.next();
  NP.Learn.render();

  /* Настройки игры */
  const S = NP.Settings;
  NP.$('#setOpp').value = S.opp;
  NP.$('#setBotBluff').checked = S.botBluff;
  NP.$('#setBotBluffFreq').value = S.botBluffFreq;
  NP.$('#botBluffVal').textContent = S.botBluffFreq + '%';
  NP.$('#setNNBluff').checked = S.nnBluff;
  NP.$('#setHints').checked = S.hints;
  NP.$('#setAutoReview').checked = S.autoReview;
  NP.$('#setBlinds').value = S.blinds;
  NP.$('#setStack').value = S.stack;

  NP.$('#setOpp').onchange = e => { S.opp = e.target.value; NP.saveSettings(); NP.toast('Соперник сменится со следующей раздачи'); };
  NP.$('#setBotBluff').onchange = e => { S.botBluff = e.target.checked; NP.saveSettings(); };
  NP.$('#setBotBluffFreq').oninput = e => { S.botBluffFreq = +e.target.value; NP.$('#botBluffVal').textContent = e.target.value + '%'; NP.saveSettings(); };
  NP.$('#setNNBluff').onchange = e => { S.nnBluff = e.target.checked; NP.saveSettings(); };
  NP.$('#setHints').onchange = e => { S.hints = e.target.checked; NP.saveSettings(); NP.Game.updateHints(); };
  NP.$('#setAutoReview').onchange = e => { S.autoReview = e.target.checked; NP.saveSettings(); NP.toast(S.autoReview ? 'Разбор будет открываться после каждой раздачи' : 'Разбор открывается кнопкой «Разбор раздачи»'); };
  NP.$('#setBlinds').onchange = e => { S.blinds = +e.target.value; NP.saveSettings(); NP.Game.newMatch(); };
  NP.$('#setStack').onchange = e => { S.stack = +e.target.value; NP.saveSettings(); NP.Game.newMatch(); };

  /* Кнопки игры */
  NP.$('#btnFold').onclick = () => NP.Game.playerAct('fold');
  NP.$('#btnCall').onclick = () => { const L = NP.Game.hand.legalFor(0); NP.Game.playerAct(L.canCheck ? 'check' : 'call'); };
  NP.$('#btnRaise').onclick = () => NP.Game.playerAct('raise', +NP.$('#raiseSlider').value);
  NP.$('#btnAllin').onclick = () => NP.Game.playerAct('raise', NP.Game.hand.legalFor(0).maxTo);
  NP.$('#btnNext').onclick = () => NP.Game.continueAfterReview();
  NP.$('#raiseSlider').oninput = () => NP.Game.updateRaiseLbl();
  NP.$$('.presets .btn').forEach(b => b.onclick = () => {
    const t = NP.Game.hand?.sizeFor(0, b.dataset.pre);
    if (t != null) { NP.$('#raiseSlider').value = t; NP.Game.updateRaiseLbl(); }
  });
  NP.$('#mmNew').onclick = () => NP.Game.newMatch();
  NP.$('#btnNewMatch').onclick = () => NP.Game.newMatch();

  /* Разбор раздачи */
  NP.$('#reviewBtn').onclick = () => NP.Game.openReview();
  NP.$('#reviewOpenBtn').onclick = () => NP.Game.openReview();
  NP.$('#resultStay').onclick = () => NP.$('#resultModal').classList.remove('on');
  NP.$('#resultNext').onclick = () => NP.Game.continueAfterReview();

  /* Нейросеть */
  const loaded = NP.Model.load();
  NP.Lab.init();
  if (loaded && NP.Model.hands) NP.toast('🧠 Загружена модель: ' + NP.fmt(NP.Model.hands) + ' раздач', 'ok');

  NP.$('#labRun').onclick = () => NP.Lab.setRunning(!NP.Lab.running);
  NP.$('#labStep').onclick = () => { const target = NP.Model.hands + 1; let g = 0; while (NP.Model.hands < target && g++ < 100) NP.Lab.stepDecision(); NP.Lab.render(true); };
  NP.$('#labReset').onclick = () => NP.confirm('Сбросить нейросеть?', 'Веса и статистика будут удалены.', () => {
    NP.Model.reset(); NP.Lab.fromModel(); NP.Lab.hand = null; NP.Lab.rBuf = []; NP.store.set('np_model_v2', null); NP.Lab.render(true);
  });
  NP.$('#labSave').onclick = () => { NP.Lab.toModel(); NP.Model.save(); NP.toast('Модель сохранена', 'ok'); };
  NP.$('#labExport').onclick = () => { NP.Lab.toModel(); NP.download('neuropoker-model.json', { v: 2, net: NP.Model.net.serialize(), hands: NP.Model.hands, opp: NP.Model.opp, charts: NP.Model.charts }); };
  NP.$('#labImportBtn').onclick = () => NP.$('#labImport').click();
  NP.$('#labImport').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.v !== 2 || !NP.Model.net.load(d.net)) throw 0;
        NP.Model.hands = d.hands || 0; NP.Model.opp = d.opp || NP.Model.opp; NP.Model.charts = d.charts || NP.Model.charts;
        NP.Lab.fromModel(); NP.Model.save(); NP.Lab.render(true);
        NP.toast('Модель импортирована', 'ok');
      } catch { NP.toast('Не удалось импортировать модель', 'err'); }
    };
    rd.readAsText(f); e.target.value = '';
  };
  NP.$$('.mode-opt').forEach(el => el.onclick = () => {
    NP.$$('.mode-opt').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel'); NP.Lab.mode = el.dataset.mode; NP.Lab.hand = null;
  });
  NP.$('#labSpeed').oninput = e => { NP.Lab.speed = +e.target.value; NP.$('#speedVal').textContent = '×' + NP.Lab.speed; };
  NP.$('#labLR').oninput = e => { NP.Lab.lr = +e.target.value / 10000; NP.$('#lrVal').textContent = NP.Lab.lr.toFixed(4); };
  NP.$('#labEnt').oninput = e => { NP.Lab.beta = +e.target.value / 1000; NP.$('#entVal').textContent = NP.Lab.beta.toFixed(3); };
  NP.$('#labBluff').onchange = e => NP.Lab.allowBluff = e.target.checked;
  NP.$('#labLearnBluff').onchange = e => NP.Lab.learnBluff = e.target.checked;
  NP.$('#labAutoSave').onchange = e => NP.Lab.autoSave = e.target.checked;

  /* Вкладки */
  let activeScreen = 'game';
  NP.$$('.tab').forEach(t => t.onclick = () => {
    NP.SND.play('click');
    NP.$$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    NP.$$('.screen').forEach(s => s.classList.remove('active'));
    activeScreen = t.dataset.scr;
    NP.$('#scr-' + activeScreen).classList.add('active');
    if (activeScreen === 'lab') setTimeout(() => NP.Lab.render(true), 60);
    if (activeScreen === 'learn') NP.Learn.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* Главный цикл */
  let lastTs = 0;
  function tick(ts) {
    requestAnimationFrame(tick);
    const dt = Math.min(.1, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (NP.Lab.running) {
      NP.Model.activeSec += dt;
      NP.Lab.acc += dt * 2.3 * NP.Lab.speed;
      let guard = 0;
      while (NP.Lab.acc >= 1 && guard++ < 120) { NP.Lab.acc--; NP.Lab.stepDecision(); }
    }
    NP.NetViz.pulse += dt * 5;
    if (activeScreen === 'lab' && ts - NP.Lab.lastRender > 240) { NP.Lab.lastRender = ts; NP.Lab.render(); }
    if (NP.CF.active) NP.CF.step(dt);
  }
  requestAnimationFrame(tick);

  addEventListener('resize', () => { if (activeScreen === 'lab') NP.Lab.render(true); });
  addEventListener('beforeunload', () => { NP.Lab.toModel(); NP.Model.save(); });

  /* Старт */
  NP.Game.newMatch();
  NP.$('#lsParams').textContent = NP.fmt(20 * 48 + 48 + 48 * 32 + 32 + 32 * 5 + 5);
  if (!NP.store.get('np_visited_v4', false)) {
    NP.store.set('np_visited_v4', true);
    setTimeout(() => NP.toast('После каждой раздачи игра теперь делает паузу: изучите разбор результата и хронологию, затем продолжайте.', 'info', 7000), 1500);
  }
})();