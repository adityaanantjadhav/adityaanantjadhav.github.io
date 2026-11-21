/* Interactive background: floating code tokens that dodge the cursor,
   scatter on click and get blown around by scrolling. */
(() => {
  const canvas = document.getElementById('bg');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const WORDS = ['{ }', '</>', 'Java', 'Go', 'SQL', 'AI', 'MCP', 'git', 'LLM', 'API', 'Docker', 'K8s',
    'React', 'Spring', 'λ', '=>', '0xFF', 'async', 'npm run', 'main()', 'JSON', 'OAuth', 'AWS', 'TDD',
    'Agent', 'prompt', '404', 'null'];
  const COLORS = ['#A79CFF', '#8CF0C8', '#E9E8FF', '#FFD27A', '#7CC4FF'];

  let W = 0, H = 0, dpr = 1;
  let tokens = [];
  const waves = [];
  const sparks = [];
  const mouse = { x: -9999, y: -9999, active: false };
  let lastScroll = scrollY;

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeToken(word) {
    const fs = rand(13, 25);
    ctx.font = `500 ${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    const w = ctx.measureText(word).width + fs * 1.2;
    const h = fs * 2;
    const depth = rand(0.45, 1);
    const ang = rand(0, Math.PI * 2);
    const base = rand(0.25, 0.6) * depth;
    return {
      word, fs, w, h, depth,
      x: rand(w, Math.max(w + 1, W - w)), y: rand(h, Math.max(h + 1, H - h)),
      vx: Math.cos(ang) * base, vy: Math.sin(ang) * base,
      bx: Math.cos(ang), by: Math.sin(ang), base,
      rot: rand(-0.5, 0.5), vr: rand(-0.004, 0.004),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: rand(0.2, 0.42) * (0.55 + depth * 0.45),
    };
  }

  function init() {
    resize();
    const count = Math.max(12, Math.min(26, Math.round((W * H) / 52000)));
    const pool = WORDS.slice().sort(() => Math.random() - 0.5);
    tokens = Array.from({ length: count }, (_, i) => makeToken(pool[i % pool.length]));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawToken(t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);
    ctx.globalAlpha = t.alpha;
    roundRect(-t.w / 2, -t.h / 2, t.w, t.h, t.h * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = t.color;
    ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.font = `500 ${t.fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.word, 0, 1);
    ctx.restore();
  }

  function step(k) {
    for (const t of tokens) {
      // gentle wander
      t.vx += (Math.random() - 0.5) * 0.03 * k;
      t.vy += (Math.random() - 0.5) * 0.03 * k;

      // dodge the cursor
      if (mouse.active) {
        const dx = t.x - mouse.x, dy = t.y - mouse.y;
        const d2 = dx * dx + dy * dy, R = 160;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * 1.1 * k;
          t.vx += (dx / d) * f; t.vy += (dy / d) * f;
          t.vr += (dx > 0 ? 1 : -1) * f * 0.006;
        }
      }

      // friction, then keep a slow drift going
      const fr = Math.pow(0.99, k);
      t.vx *= fr; t.vy *= fr; t.vr *= Math.pow(0.992, k);
      if (Math.hypot(t.vx, t.vy) < t.base) { t.vx += t.bx * 0.012 * k; t.vy += t.by * 0.012 * k; }

      t.x += t.vx * k; t.y += t.vy * k;
      t.rot += (t.vr + t.vx * 0.006) * k; // rolls as it travels

      // bounce off the edges
      const mx = t.w / 2, my = t.h / 2;
      if (t.x < mx) { t.x = mx; t.vx = Math.abs(t.vx) * 0.9; t.bx = Math.abs(t.bx); }
      else if (t.x > W - mx) { t.x = W - mx; t.vx = -Math.abs(t.vx) * 0.9; t.bx = -Math.abs(t.bx); }
      if (t.y < my) { t.y = my; t.vy = Math.abs(t.vy) * 0.9; t.by = Math.abs(t.by); }
      else if (t.y > H - my) { t.y = H - my; t.vy = -Math.abs(t.vy) * 0.9; t.by = -Math.abs(t.by); }

      const sp = Math.hypot(t.vx, t.vy);
      if (sp > 16) { t.vx *= 16 / sp; t.vy *= 16 / sp; }
    }
  }

  function drawFx(k) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= 0.035 * k;
      if (w.life <= 0) { waves.splice(i, 1); continue; }
      w.r += 11 * k;
      ctx.save();
      ctx.globalAlpha = w.life * 0.55;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8CF0C8';
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= 0.025 * k;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.x += s.vx * k; s.y += s.vy * k; s.vx *= 0.96; s.vy *= 0.96;
      ctx.save();
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life + 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function burst(x, y) {
    const R = 340;
    for (const t of tokens) {
      const dx = t.x - x, dy = t.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < R) {
        const f = (1 - d / R) * 16 * (0.6 + t.depth * 0.4);
        t.vx += (dx / d) * f; t.vy += (dy / d) * f;
        t.vr += rand(-0.18, 0.18);
      }
    }
    waves.push({ x, y, r: 6, life: 1 });
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2), v = rand(2, 7);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1.5, 3.2), life: 1, c: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    const hint = document.getElementById('hint');
    if (hint) hint.classList.add('is-gone');
  }

  let last = performance.now();
  function frame(now) {
    const k = Math.min((now - last) / 16.667, 3);
    last = now;
    ctx.clearRect(0, 0, W, H);
    step(k);
    for (const t of tokens) drawToken(t);
    drawFx(k);
    requestAnimationFrame(frame);
  }

  function start() {
    init();
    if (reduce) { for (const t of tokens) drawToken(t); return; }

    addEventListener('resize', () => {
      const ow = W, oh = H;
      resize();
      tokens.forEach((t) => { t.x = Math.min(t.x * (W / ow), W - t.w / 2); t.y = Math.min(t.y * (H / oh), H - t.h / 2); });
    });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.active = false; });
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') mouse.active = false; });
    addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('a, button, input, textarea, select, summary, label, .nav')) return;
      burst(e.clientX, e.clientY);
    });
    addEventListener('scroll', () => {
      const dy = scrollY - lastScroll;
      lastScroll = scrollY;
      for (const t of tokens) t.vy -= dy * 0.035 * t.depth; // wind
    }, { passive: true });

    requestAnimationFrame(frame);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
