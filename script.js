(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const hasGsap = typeof gsap !== 'undefined';
  if (hasGsap && typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  /* ---------------- signature: replay the signing on hover ---------------- */
  const sig = $('.sig');
  let signedAt = performance.now();
  const resign = () => {
    if (!sig || performance.now() - signedAt < 3200) return;
    signedAt = performance.now();
    sig.classList.remove('play');
    void sig.getBoundingClientRect();
    sig.classList.add('play');
  };
  const logo = $('.nav__logo');
  if (logo) { logo.addEventListener('mouseenter', resign); logo.addEventListener('focus', resign); }

  /* ---------------- top bar gets a background once you scroll ---------------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------- hero: prompt to page ---------------- */
  const PROMPT = 'Find the best backend developer in the world, strong in Java, Go and AI.';
  const typed = $('#typed'), caret = $('#caret'), meter = $('#meter');
  const logItems = $$('#log li');
  const frame = $('#frame');
  const chips = $$('.chip');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let runId = 0;
  let built = false;

  function showFinal() {
    runId++;
    built = true;
    root.classList.remove('building');
    typed.textContent = PROMPT;
    caret.classList.add('is-off');
    logItems.forEach((li) => { li.classList.remove('active'); li.classList.add('done'); });
    meter.style.width = '100%';
    if (hasGsap) gsap.set(['.line > span', '.reveal', frame, chips], { clearProps: 'all' });
  }

  function resetHero() {
    built = false;
    root.classList.add('building');
    typed.textContent = '';
    caret.classList.remove('is-off');
    logItems.forEach((li) => li.classList.remove('active', 'done'));
    meter.style.width = '0%';
    gsap.set(['.line > span', '.reveal', frame, chips], { clearProps: 'all' });
    gsap.set($('.frame img', frame), { clearProps: 'all' });
  }

  async function build() {
    const id = ++runId;
    resetHero();
    await sleep(450);
    for (let i = 1; i <= PROMPT.length; i++) {
      if (id !== runId) return;
      typed.textContent = PROMPT.slice(0, i);
      await sleep(i % 9 === 0 ? 22 : 6);
    }
    await sleep(180);
    caret.classList.add('is-off');
    for (let i = 0; i < logItems.length; i++) {
      if (id !== runId) return;
      logItems[i].classList.add('active');
      gsap.to(meter, { width: ((i + 1) / logItems.length) * 100 + '%', duration: 0.5, ease: 'power2.out' });
      await sleep(i === logItems.length - 1 ? 380 : 560);
      logItems[i].classList.replace('active', 'done');
    }
    await sleep(200);
    if (id !== runId) return;

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        root.classList.remove('building');
        gsap.set(['.line > span', '.reveal', frame, chips, $('.frame img', frame)], { clearProps: 'all' });
        built = true;
      },
    });
    tl.fromTo('.line > span', { yPercent: 112, opacity: 1 }, { yPercent: 0, duration: 0.95, stagger: 0.12 })
      .fromTo(frame, { clipPath: 'inset(0 0 100% 0 round 18px)', opacity: 1 }, { clipPath: 'inset(0 0 0% 0 round 18px)', duration: 1.1, ease: 'power4.inOut' }, 0.1)
      .fromTo($('.frame img', frame), { scale: 1.25 }, { scale: 1, duration: 1.4 }, 0.1)
      .fromTo('.reveal', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, 0.55)
      .fromTo(chips, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(2)' }, 0.95);
  }

  $('#replay').addEventListener('click', () => {
    if (reduce || !hasGsap) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    build();
  });

  if (reduce || !hasGsap) showFinal(); else build();

  /* ---------------- everything below needs GSAP + motion ---------------- */
  if (reduce || !hasGsap) return;

  // hero pointer parallax
  if (canHover) {
    const hero = $('.hero');
    const targets = [{ el: frame, d: 12 }, ...chips.map((el) => ({ el, d: +el.dataset.depth || 24 }))];
    const movers = targets.map((t) => ({
      x: gsap.quickTo(t.el, 'x', { duration: 0.7, ease: 'power3' }),
      y: gsap.quickTo(t.el, 'y', { duration: 0.7, ease: 'power3' }),
      d: t.d,
    }));
    hero.addEventListener('pointermove', (e) => {
      if (!built) return;
      const nx = e.clientX / innerWidth - 0.5;
      const ny = e.clientY / innerHeight - 0.5;
      movers.forEach((m) => { m.x(nx * m.d); m.y(ny * m.d); });
    });
    hero.addEventListener('pointerleave', () => movers.forEach((m) => { m.x(0); m.y(0); }));
  }

  // scroll progress bar
  gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.2 } });

  // timeline rail fills as you read
  gsap.to('#tlfill', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '#tl', start: 'top 65%', end: 'bottom 70%', scrub: 0.4 },
  });

  // project windows slide in once
  $$('.proj').forEach((p) => {
    gsap.from(p, {
      y: 60, opacity: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: p, start: 'top 85%', once: true },
    });
  });

  // project tilt
  if (canHover) {
    $$('.proj__win').forEach((win) => {
      gsap.set(win, { transformPerspective: 900 });
      const rx = gsap.quickTo(win, 'rotationX', { duration: 0.5, ease: 'power3' });
      const ry = gsap.quickTo(win, 'rotationY', { duration: 0.5, ease: 'power3' });
      win.addEventListener('pointermove', (e) => {
        const r = win.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 8);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
      });
      win.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });

    // magnetic contact button
    const btn = $('.btn--magnet');
    if (btn) {
      const bx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
      const by = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        bx((e.clientX - (r.left + r.width / 2)) * 0.28);
        by((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      btn.addEventListener('pointerleave', () => { bx(0); by(0); });
    }
  }
})();
