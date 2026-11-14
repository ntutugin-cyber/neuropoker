window.NP = window.NP || {};

NP.Content = {
  terms: [], lessons: [], combos: [], exam: [], map: {}, ok: false, error: null,

  async load() {
    try {
      const [t, l, c] = await Promise.all([
        this.fetchXML('data/terms.xml'),
        this.fetchXML('data/lessons.xml'),
        this.fetchXML('data/combos.xml')
      ]);
      this.terms = this.parseTerms(t);
      this.combos = this.parseCombos(c);
      const base = this.parseLessons(l);
      this.lessons = base.lessons;
      this.exam = base.exam;

      // Дополнительные термины и уроки (не обязательные файлы)
      try {
        const ta = await this.fetchXML('data/terms_advanced.xml');
        const extra = this.parseTerms(ta);
        const ids = new Set(this.terms.map(x => x.id));
        extra.forEach(x => { if (!ids.has(x.id)) this.terms.push(x); });
      } catch {}
      try {
        const la = await this.fetchXML('data/lessons_advanced.xml');
        const adv = this.parseLessons(la);
        const ids = new Set(this.lessons.map(x => x.id));
        adv.lessons.forEach(x => { if (!ids.has(x.id)) this.lessons.push(x); });
        if (adv.exam.length) this.exam = adv.exam;
      } catch {}

      this.map = Object.fromEntries(this.terms.map(x => [x.id, x]));
      this.ok = true;
    } catch (e) {
      this.error = e.message;
      this.ok = false;
    }
    return this.ok;
  },

  async fetchXML(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Не удалось загрузить ${url} (${res.status})`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(`Ошибка XML в ${url}`);
    return doc;
  },

  txt(node, sel) { return node.querySelector(sel)?.textContent?.trim() || ''; },

  parseTerms(doc) {
    return [...doc.querySelectorAll('term')].map(n => ({
      id: n.getAttribute('id').trim().toLowerCase(),
      title: n.getAttribute('title'),
      cat: n.getAttribute('cat') || 'Разное',
      def: this.txt(n, 'def'),
      ex: this.txt(n, 'example'),
      rel: (this.txt(n, 'related') || '').split(/\s+/).filter(Boolean)
    }));
  },

  parseCombos(doc) {
    return [...doc.querySelectorAll('combo')].map(n => ({
      name: n.getAttribute('name'),
      cards: n.getAttribute('cards'),
      desc: n.getAttribute('desc') || this.txt(n, 'desc')
    }));
  },

  parseQuiz(n) {
    return {
      type: 'quiz',
      q: n.getAttribute('q'),
      correct: +n.getAttribute('correct'),
      hint: n.getAttribute('hint') || '',
      options: [...n.querySelectorAll('option')].map(o => o.textContent.trim()),
      explain: this.txt(n, 'explain')
    };
  },

  parseLessons(doc) {
    const lessons = [];
    let exam = [];
    for (const ln of doc.querySelectorAll('lesson')) {
      const steps = [];
      for (const sn of ln.querySelectorAll('step')) {
        const type = sn.getAttribute('type');
        if (type === 'text') steps.push({ type, html: this.txt(sn, 'html') });
        else if (type === 'cards') steps.push({ type, cards: sn.getAttribute('cards'), caption: sn.getAttribute('caption') || '' });
        else if (type === 'gallery') steps.push({ type, from: +(sn.getAttribute('from') || 0), to: +(sn.getAttribute('to') || 10) });
        else if (type === 'quiz') steps.push(this.parseQuiz(sn));
        else if (type === 'pick') steps.push({ type, q: sn.getAttribute('q'), cards: sn.getAttribute('cards'), correct: +sn.getAttribute('correct'), hint: sn.getAttribute('hint') || '', explain: this.txt(sn, 'explain') });
        else if (type === 'vs') steps.push({ type, q: sn.getAttribute('q'), a: sn.getAttribute('a'), b: sn.getAttribute('b'), winner: +sn.getAttribute('winner'), hint: sn.getAttribute('hint') || '', explain: this.txt(sn, 'explain') });
        else if (type === 'exam') { exam = [...sn.querySelectorAll('question')].map(q => this.parseQuiz(q)); steps.push({ type: 'exam' }); }
        else steps.push({ type });
      }
      lessons.push({ id: ln.getAttribute('id'), title: ln.getAttribute('title'), sub: ln.getAttribute('sub') || '', steps });
    }
    return { lessons, exam };
  }
};