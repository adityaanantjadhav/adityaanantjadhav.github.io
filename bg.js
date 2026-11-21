/* Interactive background: twinkling stars and floating code tokens.
   - Tokens dodge the cursor and get blown around by scrolling.
   - A click sends out a ring. Any token the ring reaches (or that you click directly) is "hit":
     it inflates a little and gets a gentle nudge (no numbers are shown).
   - On the 10th hit it breaks loose like a released balloon: it zooms around leaving smoke and
     bouncing off the edges for 2 seconds, then bursts.
   - Only one token at a time can be in that flying-then-bursting state. */
(() => {
  const canvas = document.getElementById('bg');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAX_HITS = 10;       // hits needed to pop a token
  const MAX_POPS = 1;        // tokens allowed to be flying or bursting at the same time
  const POP_MS = 1500;       // how long the burst itself plays after the flight
  const BOOST_MS = 2000;     // how long a released token zooms around before it bursts
  const HIT_DECAY_MS = 6000; // no hits for this long and the token starts deflating
  const RING_REACH = 350;

  const WORDS = ['{ }', '</>', 'Java', 'Go', 'SQL', 'AI', 'MCP', 'git', 'LLM', 'API', 'Docker', 'K8s',
    'React', 'Spring', 'λ', '=>', '0xFF', 'async', 'npm run', 'main()', 'JSON', 'OAuth', 'AWS', 'TDD',
    'Agent', 'prompt', '404', 'null'];
  let COLORS = ['#A79CFF', '#8CF0C8', '#E9E8FF', '#FFD27A', '#7CC4FF'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const c = ['--accent-text', '--mint', '--text', '--tok4', '--tok5'].map((n) => cs.getPropertyValue(n).trim());
    if (c.every(Boolean)) COLORS = c;
  }

  let W = 0, H = 0, dpr = 1;
  let tokens = [];
  let stars = [];
  const waves = [];   // expanding rings; `hits` is a Set for click rings, null for purely visual rings
  const sparks = [];
  const puffs = [];   // smoke
  const shards = [];  // letters and confetti from popped tokens
  const popSlots = []; // expiry times of pops that are still playing
  const mouse = { x: -9999, y: -9999, active: false };
  let lastScroll = scrollY;
  let last = 0;       // timestamp of the current frame (ms)

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = () => COLORS[(Math.random() * COLORS.length) | 0];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeToken(word) {
    const fs = rand(11, 20);
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
      ci: (Math.random() * 5) | 0,
      alpha: rand(0.2, 0.42) * (0.55 + depth * 0.45),
      // hit / balloon state
      hits: 0, lastHit: 0, boost: 0, flying: false, sc: 1, wob: 0, spawn: 1, dead: false,
    };
  }

  /* ---------------- stars ---------------- */
  function makeStars() {
    const n = Math.max(70, Math.min(230, Math.round((W * H) / 9000)));
    stars = Array.from({ length: n }, () => {
      const big = Math.random() < 0.08;
      return {
        x: rand(0, W), y: rand(0, H),
        r: big ? rand(1.3, 1.9) : rand(0.5, 1.1),
        ph: rand(0, Math.PI * 2), sp: rand(0.18, 0.55),
        base: rand(0.45, 0.95), big,
        ci: Math.random() < 0.7 ? 2 : (Math.random() * 5) | 0,
      };
    });
  }

  function withAlpha(c, a) {
    if (c[0] === '#' && c.length >= 7) {
      const n = parseInt(c.slice(1, 7), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    return c;
  }

  // soft four-armed sparkle: each arm tapers to nothing and carries a blur
  function drawArms(s, tw) {
    const L = s.r * (4.5 + 8 * tw);
    const color = COLORS[s.ci];
    const a = 0.25 + 0.75 * tw;
    ctx.save();
    ctx.globalAlpha = s.base;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + tw * 13;
    ctx.lineWidth = 1.2 + tw * 0.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const x0 = i === 0 ? s.x - L : s.x, x1 = i === 0 ? s.x + L : s.x;
      const y0 = i === 0 ? s.y : s.y - L, y1 = i === 0 ? s.y : s.y + L;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, withAlpha(color, 0));
      g.addColorStop(0.5, withAlpha(color, a));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  function drawStars(time) {
    for (const s of stars) {
      // slow cycle, narrow peak: most of the time a star is a dim dot, then it briefly glows
      const v = 0.5 + 0.5 * Math.sin(time * s.sp + s.ph);
      const tw = reduce ? 0.3 : Math.pow(v, 8);
      ctx.globalAlpha = s.base * (0.22 + 0.78 * tw);
      ctx.fillStyle = COLORS[s.ci];
      if (tw > 0.04) {
        ctx.shadowColor = COLORS[s.ci];
        ctx.shadowBlur = (s.big ? 8 : 5) + tw * (s.big ? 20 : 12);
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (1 + tw * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (s.big) drawArms(s, tw);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function init() {
    resize();
    const count = Math.max(12, Math.min(26, Math.round((W * H) / 52000)));
    const pool = WORDS.slice().sort(() => Math.random() - 0.5);
    tokens = Array.from({ length: count }, (_, i) => makeToken(pool[i % pool.length]));
    makeStars();
  }

  /* ---------------- tokens ---------------- */
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
    const ease = t.spawn < 1 ? 1 - Math.pow(1 - t.spawn, 3) : 1;
    const wob = t.wob > 0.01 ? 1 + Math.sin(t.wob * 14) * t.wob * 0.12 : 1;
    const s = t.sc * ease * wob;
    const hot = t.boost > 0;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(0.9, (t.alpha + t.hits * 0.045) * (0.3 + 0.7 * ease));
    if (hot) { ctx.shadowColor = COLORS[t.ci]; ctx.shadowBlur = 14; }
    roundRect(-t.w / 2, -t.h / 2, t.w, t.h, t.h * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COLORS[t.ci];
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS[t.ci];
    ctx.font = `500 ${t.fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.word, 0, 1);
    ctx.restore();
  }

  function popsActive(now) {
    for (let i = popSlots.length - 1; i >= 0; i--) if (popSlots[i] <= now) popSlots.splice(i, 1);
    return popSlots.length;
  }

  function step(k, now) {
    const dt = k * 16.667;
    for (const t of tokens) {
      if (t.dead) continue;

      t.boost = Math.max(0, t.boost - dt);
      if (t.flying && t.boost <= 0) { popToken(t); continue; }
      const hot = t.boost > 0;

      // gentle wander
      t.vx += (Math.random() - 0.5) * (hot ? 1.6 : 0.03) * k;
      t.vy += (Math.random() - 0.5) * (hot ? 1.6 : 0.03) * k;

      // dodge the cursor
      if (mouse.active && !hot) {
        const dx = t.x - mouse.x, dy = t.y - mouse.y;
        const d2 = dx * dx + dy * dy, R = 160;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * 1.1 * k;
          t.vx += (dx / d) * f; t.vy += (dy / d) * f;
          t.vr += (dx > 0 ? 1 : -1) * f * 0.006;
        }
      }

      // friction (almost none while hot), then keep a slow drift going
      const fr = Math.pow(hot ? 0.9985 : 0.99, k);
      t.vx *= fr; t.vy *= fr; t.vr *= Math.pow(0.992, k);
      if (!hot && Math.hypot(t.vx, t.vy) < t.base) { t.vx += t.bx * 0.012 * k; t.vy += t.by * 0.012 * k; }
      if (hot) { // a released balloon never slows down until it bursts
        const s0 = Math.hypot(t.vx, t.vy) || 1;
        if (s0 < 17) { t.vx *= 17 / s0; t.vy *= 17 / s0; }
      }

      t.x += t.vx * k; t.y += t.vy * k;
      t.rot += (t.vr + t.vx * 0.006) * k; // rolls as it travels

      // bounce off the edges (a hot token loses no speed)
      const e = hot ? 1 : 0.9;
      const mx = (t.w / 2) * t.sc, my = (t.h / 2) * t.sc;
      if (t.x < mx) { t.x = mx; t.vx = Math.abs(t.vx) * e; t.bx = Math.abs(t.bx); }
      else if (t.x > W - mx) { t.x = W - mx; t.vx = -Math.abs(t.vx) * e; t.bx = -Math.abs(t.bx); }
      if (t.y < my) { t.y = my; t.vy = Math.abs(t.vy) * e; t.by = Math.abs(t.by); }
      else if (t.y > H - my) { t.y = H - my; t.vy = -Math.abs(t.vy) * e; t.by = -Math.abs(t.by); }

      const sp = Math.hypot(t.vx, t.vy);
      const max = hot ? 26 : 16;
      if (sp > max) { t.vx *= max / sp; t.vy *= max / sp; }

      // smoke trail while travelling fast
      if (hot && sp > 3) {
        const n = sp > 12 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          puffs.push({
            x: t.x - (t.vx / (sp || 1)) * t.w * 0.25 + rand(-4, 4),
            y: t.y - (t.vy / (sp || 1)) * t.w * 0.25 + rand(-4, 4),
            vx: -t.vx * 0.04 + rand(-0.4, 0.4), vy: -t.vy * 0.04 + rand(-0.7, 0.1),
            r: t.h * rand(0.3, 0.5), life: 1, c: COLORS[t.ci],
          });
        }
        while (puffs.length > 260) puffs.shift();
      }

      // balloon inflation, wobble and slow deflation
      t.sc += ((1 + t.hits * 0.045) - t.sc) * Math.min(1, 0.12 * k);
      t.wob *= Math.pow(0.93, k);
      if (t.spawn < 1) t.spawn = Math.min(1, t.spawn + 0.025 * k);
      if (!t.flying && t.hits > 0 && now - t.lastHit > HIT_DECAY_MS) { t.hits--; t.lastHit = now - HIT_DECAY_MS + 1500; }
    }
  }

  /* ---------------- hits and pops ---------------- */
  function hitToken(t, ox, oy, reach) {
    if (t.flying) return; // already on its way out
    t.hits = Math.min(MAX_HITS, t.hits + 1);
    t.lastHit = last;
    t.wob = 1;
    const dx = t.x - ox, dy = t.y - oy, d = Math.hypot(dx, dy) || 1;
    const nudge = 2.5 + (1 - Math.min(1, reach)) * 3; // a gentle push away from the click
    t.vx += (dx / d) * nudge;
    t.vy += (dy / d) * nudge;
    t.vr += rand(-0.08, 0.08);
    if (t.hits >= MAX_HITS) {
      if (popsActive(last) < MAX_POPS) launchToken(t, ox, oy);
      else t.hits = MAX_HITS - 1; // another one is already going: it stays one hit away until that one is done
    }
  }

  // the 10th hit: the token breaks loose like a released balloon
  function launchToken(t, ox, oy) {
    t.flying = true;
    t.boost = BOOST_MS;
    popSlots.push(last + BOOST_MS + POP_MS);
    const dx = t.x - ox, dy = t.y - oy, d = Math.hypot(dx, dy) || 1;
    t.vx = (dx / d) * 22 + rand(-2, 2);
    t.vy = (dy / d) * 22 + rand(-2, 2);
    t.vr = rand(-0.35, 0.35);
    waves.push({ x: t.x, y: t.y, r: 6, life: 0.6, hits: null });
  }

  function popToken(t) {
    t.dead = true;
    waves.push({ x: t.x, y: t.y, r: 6, life: 1, hits: null });
    const color = COLORS[t.ci];
    const chars = [...t.word];
    chars.forEach((ch, i) => {
      const a = rand(0, Math.PI * 2), v = rand(3, 9);
      shards.push({
        ch, fs: t.fs * rand(1.1, 1.6), c: color,
        x: t.x + (i - (chars.length - 1) / 2) * t.fs * 0.62, y: t.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, rot: rand(-1, 1), vr: rand(-0.3, 0.3), life: 1,
      });
    });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2), v = rand(3, 11);
      shards.push({
        ch: null, w: rand(3, 7), h: rand(2, 5), c: pick(),
        x: t.x + rand(-t.w / 3, t.w / 3), y: t.y + rand(-t.h / 3, t.h / 3),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, rot: rand(0, 6), vr: rand(-0.4, 0.4), life: 1,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), v = rand(2, 9);
      sparks.push({ x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1.5, 3.5), life: 1, c: pick() });
    }
    // a fresh token floats in a little later so the field never runs dry
    setTimeout(() => {
      const fresh = makeToken(WORDS[(Math.random() * WORDS.length) | 0]);
      fresh.spawn = 0;
      tokens.push(fresh);
    }, 2600);
  }

  function updateWaves(k) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= (w.hits ? 0.032 : 0.035) * k;
      if (w.life <= 0) { waves.splice(i, 1); continue; }
      w.r += 11 * k;

      // a click ring hits every token it passes over, once
      if (w.hits) {
        for (const t of tokens) {
          if (t.dead || w.hits.has(t)) continue;
          const d = Math.hypot(t.x - w.x, t.y - w.y);
          const half = Math.hypot(t.w / 2, t.h / 2) * t.sc;
          if (Math.abs(d - w.r) <= half + 8) {
            w.hits.add(t);
            hitToken(t, w.x, w.y, d / RING_REACH);
          }
        }
      }

      ctx.save();
      ctx.globalAlpha = w.life * 0.55;
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS[1];
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    tokens = tokens.filter((t) => !t.dead);
  }

  function drawSmoke(k) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= 0.016 * k;
      if (p.life <= 0) { puffs.splice(i, 1); continue; }
      p.x += p.vx * k; p.y += p.vy * k; p.vx *= 0.97; p.vy *= 0.97;
      ctx.globalAlpha = p.life * 0.26;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - p.life) * p.r * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(k) {
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
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= 0.012 * k;
      if (s.life <= 0) { shards.splice(i, 1); continue; }
      s.x += s.vx * k; s.y += s.vy * k; s.vy += 0.12 * k; s.vx *= 0.985; s.rot += s.vr * k;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = Math.min(1, s.life * 1.6);
      ctx.fillStyle = s.c;
      if (s.ch) {
        ctx.font = `600 ${s.fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.ch, 0, 0);
      } else {
        ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
      }
      ctx.restore();
    }
  }

  function burst(x, y) {
    waves.push({ x, y, r: 6, life: 1, hits: new Set() });
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2), v = rand(2, 7);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1.5, 3.2), life: 1, c: pick() });
    }
    const hint = document.getElementById('hint');
    if (hint) hint.classList.add('is-gone');
  }

  function frame(now) {
    const k = Math.min((now - last) / 16.667, 3) || 0;
    last = now;
    ctx.clearRect(0, 0, W, H);
    drawStars(now / 1000);
    step(k, now);
    drawSmoke(k);
    for (const t of tokens) drawToken(t);
    updateWaves(k);
    drawFx(k);
    requestAnimationFrame(frame);
  }

  function start() {
    readColors();
    init();
    addEventListener('themechange', () => {
      readColors();
      if (reduce) { ctx.clearRect(0, 0, W, H); drawStars(0); for (const t of tokens) drawToken(t); }
    });
    if (reduce) { drawStars(0); for (const t of tokens) drawToken(t); return; }

    addEventListener('resize', () => {
      const ow = W, oh = H;
      resize();
      makeStars();
      tokens.forEach((t) => { t.x = Math.min(t.x * (W / ow), W - t.w / 2); t.y = Math.min(t.y * (H / oh), H - t.h / 2); });
    });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.active = false; });
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') mouse.active = false; });
    addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('a, button, input, textarea, select, summary, label, .nav, .mode')) return;
      burst(e.clientX, e.clientY);
    });
    addEventListener('scroll', () => {
      const dy = scrollY - lastScroll;
      lastScroll = scrollY;
      for (const t of tokens) t.vy -= dy * 0.035 * t.depth; // wind
    }, { passive: true });

    last = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
