window.NP = window.NP || {};

NP.$ = (s, r = document) => r.querySelector(s);
NP.$$ = (s, r = document) => [...r.querySelectorAll(s)];
NP.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
NP.rnd = Math.random;
NP.rndi = n => Math.floor(Math.random() * n);
NP.sleep = ms => new Promise(r => setTimeout(r, ms));
NP.fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
NP.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

NP.store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

NP.toast = function (msg, type = 'info', ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  NP.$('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
};

NP.confirm = function (title, text, cb) {
  NP.$('#cfTitle').textContent = title;
  NP.$('#cfText').textContent = text;
  NP._cfCb = cb;
  NP.$('#confirmModal').classList.add('on');
};

NP.download = function (name, obj) {
  const b = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

NP.shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = NP.rndi(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* Звук */
NP.SND = {
  on: NP.store.get('np_snd', true), ctx: null,
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.g = this.ctx.createGain();
        this.g.gain.value = .32;
        this.g.connect(this.ctx.destination);
      } catch {}
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  },
  tone(f, dur, type = 'sine', vol = 1, when = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * .5, t + .008);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.g);
    o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, vol, fq) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.g); s.start();
  },
  play(n) {
    if (!this.on) return;
    this.ensure(); if (!this.ctx) return;
    switch (n) {
      case 'deal': this.noise(.07, .5, 2600); break;
      case 'flip': this.noise(.1, .4, 1600); break;
      case 'chip': this.tone(1900, .05, 'triangle', .7); this.tone(1350, .06, 'triangle', .6, .05); break;
      case 'click': this.tone(950, .04, 'square', .25); break;
      case 'check': this.tone(500, .06); this.tone(500, .05, 'sine', .4, .09); break;
      case 'fold': this.noise(.12, .35, 700); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .22, 'triangle', .7, i * .09)); break;
      case 'lose': this.tone(220, .3, 'sawtooth', .35); this.tone(160, .35, 'sawtooth', .3, .12); break;
      case 'ok': this.tone(660, .1); this.tone(880, .14, 'sine', .5, .09); break;
      case 'bad': this.tone(200, .16, 'square', .3); break;
    }
  }
};

/* Конфетти */
NP.CF = {
  parts: [], active: false, canvas: null,
  init() { this.canvas = NP.$('#confetti'); },
  burst(n = 130) {
    const c = this.canvas, dpr = Math.min(devicePixelRatio, 2);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const cols = ['#e9b95c', '#3fd6ff', '#ff4fa3', '#3ddc84', '#9d6bff'];
    for (let i = 0; i < n; i++) this.parts.push({
      x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35,
      vx: (Math.random() - .5) * 560, vy: -Math.random() * 520 - 120,
      r: Math.random() * 5 + 3, c: cols[NP.rndi(cols.length)],
      rot: Math.random() * 6.28, vr: (Math.random() - .5) * 10, life: 1.4 + Math.random() * .8
    });
    this.active = true;
  },
  step(dt) {
    if (!this.active) return;
    const ctx = this.canvas.getContext('2d'), dpr = Math.min(devicePixelRatio, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.parts = this.parts.filter(p => p.life > 0);
    if (!this.parts.length) { this.active = false; return; }
    for (const p of this.parts) {
      p.life -= dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = NP.clamp(p.life, 0, 1); ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); ctx.restore();
    }
  }
};