/* Lili dan Sumbui-sumbui — interactive flip book (page curl powered by StPageFlip) */
(() => {
  "use strict";

  const IMG = (n) => `assets/pages/${n}.webp`;
  const AUD = (n) => `assets/audio/${n}.m4a`;
  const QUIZ_URL = "https://www.educaplay.com/learning-resources/31355139-kui_lil.html";
  const VIDEO_URL = "assets/video/kuih-dalamu.mp4";

  /* Sound-icon centres (percent of page), detected from the artwork. */
  const BL = [7.6, 92.7];           // usual bottom-left position
  const TL = [6.9, 6.9];            // top-left position
  const SND = {
    1: BL, 2: [5.9, 94.3], 3: BL, 4: BL, 5: BL, 6: [8.4, 7.6], 7: BL, 8: BL,
    9: [6.2, 93.8], 10: BL, 11: BL, 12: BL, 13: TL, 14: [7.1, 6.9], 15: BL,
    16: [7.1, 7.1], 17: TL, 18: BL, 19: BL, 20: TL, 21: BL, 22: BL,
  };

  /* Page order: cover, "Buku ini milik", pages 1–24, blank inside back cover, back cover. */
  const KEYS = ["0.0", "0.1"];
  for (let p = 1; p <= 24; p++) KEYS.push(String(p));
  KEYS.push(null, "25");
  const TOTAL = KEYS.length;                 // 28
  const IDX15 = KEYS.indexOf("15");          // 16
  const BLUR_KEYS = ["16", "17"];            // hidden until the bush is clicked

  function pageDef(key) {
    if (key === null) return { blank: true, label: "" };
    const d = { key, label: "" };
    if (key === "0.0") return { ...d, img: "0.0", hard: true, label: "Kulit depan" };
    if (key === "0.1") return { ...d, img: "0.1", name: true, label: "Buku ini milik" };
    if (key === "25") return { ...d, img: "25", hard: true, label: "Kulit belakang" };
    const n = Number(key);
    d.label = `Halaman ${n}`;
    d.img = n === 3 || n === 4 || n === 15 ? `${n}.0` : String(n);
    if (SND[n]) { d.snd = SND[n]; d.audio = d.img; }
    if (n === 3) d.hots = [{ x: 37, y: 62, w: 26, h: 30, act: "popup3", label: "Tekan mangkuk" }];
    if (n === 4) d.hots = [{ x: 50, y: 34, w: 17, h: 26, act: "popup4", label: "Tekan telefon ayah" }];
    if (n === 15) d.hots = [{ x: 58, y: 32, w: 42, h: 66, act: "bush", label: "Tekan semak" }];
    if (n === 24) d.link = { x: 14, y: 33, w: 44, h: 40 };
    return d;
  }

  /* Pop-up slides */
  const POPUPS = {
    popup3: {
      img: "3.1",
      hots: [
        { x: 3.5, y: 3, w: 11, h: 11, act: "close", label: "Tutup" },
        { x: 90, y: 0.5, w: 8.5, h: 8, act: "snd", audio: "3.1", label: "Main suara" },
        { x: 61, y: 81, w: 14, h: 14, act: "video", label: "Tonton video" },
      ],
    },
    popup4: {
      img: "4.1",
      hots: [
        { x: 3.5, y: 3, w: 11, h: 11, act: "close", label: "Tutup" },
        { x: 1.5, y: 87.2, w: 11.5, h: 12, act: "snd", audio: "4.1", label: "Main suara" },
      ],
    },
  };

  const $ = (s) => document.querySelector(s);
  const stage = $("#stage"), wrap = $("#bookWrap"), bookEl = $("#book");
  const btnPrev = $("#btnPrev"), btnNext = $("#btnNext"), label = $("#pageLabel");

  let bushRevealed = false;
  let popupOpen = false;

  /* ---------- audio ---------- */
  const player = new Audio();
  player.preload = "none";
  let playingBtn = null;
  function stopAudio() {
    player.pause();
    if (playingBtn) playingBtn.classList.remove("playing");
    playingBtn = null;
  }
  function toggleAudio(src, btn) {
    if (playingBtn === btn && !player.paused) { stopAudio(); return; }
    stopAudio();
    player.src = AUD(src);
    player.currentTime = 0;
    player.play().then(() => { playingBtn = btn; btn.classList.add("playing"); }).catch(() => {});
  }
  player.addEventListener("ended", stopAudio);

  /* soft paper "swish" synthesised with Web Audio (no extra file).
     The audio engine is created once in advance (creating it inside a click can freeze
     the first page turn for ~150 ms on Windows) and woken up on the first tap. */
  let actx = null, swishBuf = null;
  function initAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const len = 0.45, sr = actx.sampleRate;
      swishBuf = actx.createBuffer(1, Math.floor(sr * len), sr);
      const data = swishBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 2 * 0.5;
      }
    } catch (e) { actx = null; }
  }
  (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(initAudio);
  document.addEventListener("pointerdown", () => { initAudio(); if (actx && actx.state === "suspended") actx.resume().catch(() => {}); }, { capture: true });
  function swish() {
    try {
      if (!actx || !swishBuf || actx.state !== "running") return;
      const src = actx.createBufferSource(); src.buffer = swishBuf;
      const f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = 0.5;
      const g = actx.createGain(); g.gain.value = 0.22;
      src.connect(f).connect(g).connect(actx.destination);
      src.start();
    } catch (e) { /* audio not available */ }
  }

  /* ---------- build pages ---------- */
  function placeHot(el, h) {
    Object.assign(el.style, { left: h.x + "%", top: h.y + "%", width: h.w + "%", height: h.h + "%" });
  }
  function makeBushButton(pg) {
    const h = pageDef("15").hots[0];
    const b = document.createElement("button");
    b.className = "hot area"; b.dataset.act = h.act;
    b.setAttribute("aria-label", h.label);
    placeHot(b, h);
    b.addEventListener("click", (e) => { e.stopPropagation(); revealBush(pg, b); });
    return b;
  }

  function buildPage(key) {
    const d = pageDef(key);
    const page = document.createElement("div");
    page.className = "page";
    if (d.hard) page.dataset.density = "hard";
    const pg = document.createElement("div");
    pg.className = "pg" + (d.blank ? " blank" : "");
    pg.dataset.page = key ?? "blank";
    page.appendChild(pg);

    if (d.img) {
      const img = new Image();
      img.alt = d.label; img.decoding = "async"; img.draggable = false;
      img.src = IMG(d.img);
      pg.appendChild(img);
      if (key === "15") {
        const r = new Image();
        r.className = "reveal-img"; r.alt = ""; r.draggable = false; r.src = IMG("15.1");
        pg.appendChild(r);
      }
    }
    if (d.snd) {
      const b = document.createElement("button");
      b.className = "hot snd";
      b.setAttribute("aria-label", "Main suara");
      const D = 12;
      Object.assign(b.style, { left: d.snd[0] - D / 2 + "%", top: d.snd[1] - D / 2 + "%", width: D + "%", height: D + "%" });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleAudio(key === "15" ? (bushRevealed ? "15.1" : "15.0") : d.audio, b);
      });
      pg.appendChild(b);
    }
    (d.hots || []).forEach((h) => {
      if (h.act === "bush") { pg.appendChild(makeBushButton(pg)); return; }
      const b = document.createElement("button");
      b.className = "hot area"; b.dataset.act = h.act;
      b.setAttribute("aria-label", h.label);
      placeHot(b, h);
      b.addEventListener("click", (e) => { e.stopPropagation(); if (isIdle()) openPopup(h.act); });
      pg.appendChild(b);
    });
    if (d.link) {
      const a = document.createElement("a");
      a.className = "hot area"; a.href = QUIZ_URL; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", "Kuiz Lili dan Sumbui-sumbui");
      placeHot(a, d.link);
      a.addEventListener("click", (e) => e.stopPropagation());
      pg.appendChild(a);
    }
    if (d.name) {
      const inp = document.createElement("input");
      inp.className = "name-input"; inp.type = "text"; inp.maxLength = 22;
      inp.placeholder = "Tulis nama di sini"; inp.autocomplete = "off"; inp.spellcheck = false;
      inp.setAttribute("aria-label", "Nama pemilik buku");
      try { inp.value = localStorage.getItem("lili-owner") || ""; } catch (e) {}
      inp.addEventListener("input", () => { try { localStorage.setItem("lili-owner", inp.value); } catch (e) {} });
      inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); });
      pg.appendChild(inp);
    }
    return page;
  }

  const pages = KEYS.map(buildPage);
  pages.forEach((p) => bookEl.appendChild(p));
  const pg15 = pages[IDX15].querySelector(".pg");

  /* ---------- sizing ---------- */
  let PW = 400, portrait = false;
  function computeSize() {
    const r = stage.getBoundingClientRect();
    const availW = Math.max(160, r.width - 40);
    const availH = Math.max(160, r.height - 24);
    portrait = availW < availH * 1.15 && availW < 900;   // tall screens -> one page at a time
    PW = Math.floor(portrait ? Math.min(availW, availH) : Math.min(availW / 2, availH));
    wrap.style.width = (portrait ? PW : PW * 2) + "px";
    wrap.classList.toggle("portrait", portrait);
  }
  computeSize();

  /* ---------- page-flip engine ---------- */
  const pf = new St.PageFlip(bookEl, {
    width: 800, height: 800,
    size: "stretch",
    minWidth: portrait ? PW : PW / 2, maxWidth: 4000,
    minHeight: 100, maxHeight: 4000,
    showCover: true,
    usePortrait: true,
    drawShadow: true,
    maxShadowOpacity: 0.55,
    flippingTime: 900,
    showPageCorners: true,
    useMouseEvents: false,         // input is handled below so hotspots always win over page turning
    mobileScrollSupport: false,
    swipeDistance: 30,
    startZIndex: 0,
    autoSize: true,
  });
  pf.loadFromHTML(pages);
  bookEl.style.minWidth = "0px";

  /* Performance: the library rewrites the inline style of every page on every frame,
     even when nothing moves. Skip writes identical to the previous one so the browser
     only re-styles what actually changed. */
  const cssTextDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "cssText");
  function dedupeStyleWrites(el) {
    if (!cssTextDesc || el.__deduped) return;
    el.__deduped = true;
    const st = el.style;
    let last = null;
    try {
      Object.defineProperty(st, "cssText", {
        configurable: true,
        get() { return cssTextDesc.get.call(st); },
        set(v) { if (v === last) return; last = v; cssTextDesc.set.call(st, v); },
      });
    } catch (e) { /* not supported: normal behaviour */ }
  }
  bookEl.querySelectorAll(".stf__item, .stf__outerShadow, .stf__innerShadow, .stf__hardShadow, .stf__hardInnerShadow")
    .forEach(dedupeStyleWrites);

  /* Smoothness: the library moves the page along a straight line at constant speed
     (it starts at full speed and stops dead). Re-time its animation with easing:
     turns from buttons/taps accelerate and settle (ease-in-out); a page released
     after dragging, or the hover curl, glides to rest (ease-out). */
  const flipRender = pf.getRender();
  const origStartAnimation = flipRender.startAnimation.bind(flipRender);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  let easeMode = "inOut";
  flipRender.startAnimation = (frames, duration, onEnd) => {
    const n = frames.length;
    if (n > 2) {
      const ease = easeMode === "out" ? easeOut : easeInOut;
      const timed = new Array(n);
      for (let k = 0; k < n; k++) timed[k] = frames[Math.min(n - 1, Math.round(ease(k / (n - 1)) * (n - 1)))];
      frames = timed;
      if (easeMode === "inOut") duration = Math.max(duration, 800);   // full turns: same feel on small screens
    }
    origStartAnimation(frames, duration, onEnd);
  };

  const settings = pf.getSettings();
  function syncOrientation() {
    // the library decides portrait/landscape from minWidth: keep it in step with our layout
    settings.minWidth = portrait ? PW : PW / 2;
    bookEl.style.minWidth = "0px";
  }
  syncOrientation();

  const isLandscape = () => pf.getOrientation() === "landscape";
  const curIdx = () => pf.getCurrentPageIndex();
  const isIdle = () => pf.getState() === "read" || pf.getState() === "fold_corner";

  function lockedAhead() {
    if (bushRevealed) return false;
    const i = curIdx();
    return isLandscape() ? i === IDX15 || i === IDX15 - 1 : i === IDX15;
  }

  /* buttons / keyboard / swipe go through these, so page 15 can't be skipped */
  let pendingDir = 0;
  const orig = {
    start: pf.startUserTouch.bind(pf),
    move: pf.userMove.bind(pf),
    stop: pf.userStop.bind(pf),
    next: pf.flipNext.bind(pf),
    prev: pf.flipPrev.bind(pf),
  };
  pf.flipNext = (corner) => {
    if (popupOpen || !isIdle()) return;
    if (lockedAhead()) { blocked(); return; }
    if (curIdx() >= TOTAL - 1) return;
    pendingDir = 1; easeMode = "inOut"; orig.next(corner);
  };
  pf.flipPrev = (corner) => {
    if (popupOpen || !isIdle() || curIdx() <= 0) return;
    pendingDir = -1; easeMode = "inOut"; orig.prev(corner);
  };

  /* centre the closed book (cover alone / back cover alone) like a real book on a table */
  function shiftFor(idx) {
    if (!isLandscape()) return 0;
    if (idx <= 0) return -PW / 2;
    if (idx >= TOTAL - 1) return PW / 2;
    return 0;
  }
  function applyShift(x) {
    wrap.style.transform = `translateX(${x}px)`;
    wrap.classList.toggle("closed-front", x < 0);
    wrap.classList.toggle("closed-back", x > 0);
  }
  function predictShift() {
    const i = curIdx();
    if (!isLandscape()) return;
    if (i <= 0 || i >= TOTAL - 1) applyShift(0);                    // opening
    else if (pendingDir < 0 && i <= 2) applyShift(-PW / 2);         // closing to the front cover
    else if (pendingDir > 0 && i >= TOTAL - 3) applyShift(PW / 2);  // closing to the back cover
  }

  pf.on("changeState", (e) => {
    const s = e.data;
    if (s === "flipping") { stopAudio(); swish(); predictShift(); }
    if (s === "user_fold") stopAudio();
    if (s === "read") { applyShift(shiftFor(curIdx())); refreshUI(); }
  });
  pf.on("flip", (e) => { applyShift(shiftFor(e.data)); refreshUI(); });
  pf.on("changeOrientation", () => { applyShift(shiftFor(curIdx())); refreshUI(); });

  /* ---------- UI state ---------- */
  function refreshUI() {
    const i = curIdx();
    let text;
    if (isLandscape() && i > 0 && i < TOTAL - 1) {
      const left = i % 2 ? i : i - 1;
      const a = pageDef(KEYS[left]).label, b = pageDef(KEYS[left + 1]).label;
      text = [a, b].filter(Boolean).join("  •  ").replace(/Halaman (\d+)  •  Halaman (\d+)/, "Halaman $1 – $2");
    } else {
      text = pageDef(KEYS[i]).label || " ";
    }
    label.textContent = text;
    btnPrev.disabled = i <= 0;
    const atEnd = isLandscape() ? i >= TOTAL - 1 : i >= TOTAL - 1;
    btnNext.disabled = atEnd;
    const locked = lockedAhead();
    btnNext.classList.toggle("locked", locked);
    btnNext.setAttribute("aria-label", locked ? "Tekan semak dahulu" : "Halaman seterusnya");
    document.querySelectorAll(".pg").forEach((p) =>
      p.classList.toggle("blurred", !bushRevealed && BLUR_KEYS.includes(p.dataset.page)));
  }

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }
  function blocked() {
    wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake");
    toast("🌿 Tekan semak dahulu untuk melihat apa di sebaliknya!");
    const bush = pg15.querySelector('[data-act="bush"]');
    if (bush) { bush.classList.remove("hint"); void bush.offsetWidth; bush.classList.add("hint"); }
  }

  /* ---------- page 15: bush reveal ---------- */
  function revealBush(pg, btn) {
    if (bushRevealed || !isIdle()) return;
    bushRevealed = true;
    stopAudio();
    pg.classList.add("revealed");
    btn.remove();
    const icons = ["🌿", "🍃", "✨", "🌱", "⭐"];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("span");
      s.className = "particle";
      s.textContent = icons[i % icons.length];
      const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const dist = 18 + Math.random() * 16;
      s.style.setProperty("--dx", Math.cos(ang) * dist + "cqw");
      s.style.setProperty("--dy", Math.sin(ang) * dist + "cqh");
      s.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      pg.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    }
    refreshUI();
    setTimeout(() => {
      toast("Hebat! Sekarang kamu boleh ke halaman seterusnya. ➜", 3000);
      btnNext.classList.add("pulse");
      setTimeout(() => btnNext.classList.remove("pulse"), 3600);
    }, 1200);
  }

  /* ---------- pop-up slides ---------- */
  const popup = $("#popup"), popupImg = $("#popupImg"), popupHots = $("#popupHots");
  const videoLayer = $("#videoLayer"), video = $("#video");

  function openPopup(id) {
    const def = POPUPS[id];
    stopAudio();
    popupImg.src = IMG(def.img);
    popupImg.alt = "Tahu kah kamu?";
    popupHots.innerHTML = "";
    def.hots.forEach((h) => {
      const b = document.createElement("button");
      b.className = "hot " + (h.act === "snd" ? "snd" : "area");
      b.setAttribute("aria-label", h.label);
      placeHot(b, h);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (h.act === "close") closePopup();
        else if (h.act === "snd") toggleAudio(h.audio, b);
        else if (h.act === "video") openVideo();
      });
      popupHots.appendChild(b);
    });
    popup.classList.remove("closing");
    popup.hidden = false;
    popupOpen = true;
    setTimeout(() => popupHots.querySelector("button")?.focus({ preventScroll: true }), 50);
  }
  function closePopup() {
    stopAudio(); closeVideo();
    popup.classList.add("closing");
    setTimeout(() => { popup.hidden = true; popup.classList.remove("closing"); popupOpen = false; }, 220);
  }
  function openVideo() {
    stopAudio();
    if (!video.src) video.src = VIDEO_URL;
    videoLayer.hidden = false;
    video.currentTime = 0;
    video.play().catch(() => {});
  }
  function closeVideo() { video.pause(); videoLayer.hidden = true; }
  $("#videoClose").addEventListener("click", (e) => { e.stopPropagation(); closeVideo(); });

  /* ---------- controls ---------- */
  btnNext.addEventListener("click", () => pf.flipNext("bottom"));
  btnPrev.addEventListener("click", () => pf.flipPrev("bottom"));
  document.addEventListener("keydown", (e) => {
    if (popupOpen || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight" || e.key === "PageDown") pf.flipNext("bottom");
    if (e.key === "ArrowLeft" || e.key === "PageUp") pf.flipPrev("bottom");
  });

  $("#btnFull").addEventListener("click", () => {
    const d = document;
    if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)?.call(d.documentElement);
    else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  });
  $("#btnRestart").addEventListener("click", () => {
    if (!isIdle()) return;
    stopAudio();
    bushRevealed = false;
    pg15.classList.remove("revealed");
    if (!pg15.querySelector('[data-act="bush"]')) pg15.appendChild(makeBushButton(pg15));
    pf.turnToPage(0);
    applyShift(shiftFor(0));
    refreshUI();
  });

  /* ---------- input: hotspots first, then page-turn zones ----------
     Every press is hit-tested against the hotspots of the visible pages first
     (sound icons, bowl, phone, bush, quiz link, name box). Only if none is hit do
     we check the turn zones: a strip along the whole outer edge of each page
     (top corner, centre and bottom corner). The corner curl on hover is only
     shown when no hotspot sits in that corner, so it never covers a button. */
  const HOT_SEL = ".hot, .name-input";
  const blockEl = bookEl.querySelector(".stf__block");
  stage.style.touchAction = "none";

  function toBook(e) {
    const r = blockEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function visibleIdx() {
    const i = curIdx();
    if (!isLandscape()) return [i];
    if (i <= 0) return [0];
    if (i >= TOTAL - 1) return [TOTAL - 1];
    const l = i % 2 ? i : i - 1;
    return [l, l + 1];
  }
  /* boxes of the visible pages, in book coordinates */
  function geom() {
    const r = pf.getBoundsRect(), pw = r.pageWidth, i = curIdx();
    const box = (x) => ({ x, y: r.top, w: pw, h: r.height });
    const g = { r, pw, left: null, right: null, portrait: !isLandscape() };
    if (g.portrait) { g.right = box(r.left + pw); return g; }
    if (i > 0) g.left = box(r.left);
    if (i < TOTAL - 1) g.right = box(r.left + pw);
    return g;
  }
  /* hotspot rectangles of the visible pages, in book coordinates */
  function hotRects() {
    const b = blockEl.getBoundingClientRect();
    const out = [];
    visibleIdx().forEach((idx) => pages[idx].querySelectorAll(HOT_SEL).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ el, x0: r.left - b.left, y0: r.top - b.top, x1: r.right - b.left, y1: r.bottom - b.top });
    }));
    return out;
  }
  function hotAt(p, pad = 6) {
    return hotRects().find((h) => p.x >= h.x0 - pad && p.x <= h.x1 + pad && p.y >= h.y0 - pad && p.y <= h.y1 + pad)?.el || null;
  }
  /* +1 = forward zone, -1 = back zone, 0 = none */
  function zoneAt(p) {
    const g = geom();
    const EZ = Math.max(26, g.pw * 0.13);   // depth of the zone inside the page
    const OUT = 30;                          // and how far it reaches outside the page
    if (p.y < g.r.top - OUT || p.y > g.r.top + g.r.height + OUT) return 0;
    if (g.right && curIdx() < TOTAL - 1) {
      const R = g.right.x + g.right.w;
      if (p.x >= R - EZ && p.x <= R + OUT) return 1;
    }
    const lb = g.portrait ? g.right : g.left;
    if (lb && curIdx() > 0 && p.x >= lb.x - OUT && p.x <= lb.x + EZ) return -1;
    return 0;
  }
  /* corner-curl point for hovering, or null if a hotspot is in that corner */
  function peelFor(dir, p) {
    const g = geom();
    if (g.portrait && dir < 0) return null;                 // library has no back-curl in single-page view
    const box = dir > 0 ? g.right : g.left;
    if (!box) return null;
    const top = p.y < g.r.top + g.r.height / 2;
    const inset = Math.max(18, Math.min(50, g.pw * 0.08));
    const cx = dir > 0 ? box.x + box.w : box.x;
    const cy = top ? g.r.top : g.r.top + g.r.height;
    const reach = inset * 2.8;                               // area the curl can cover
    const zx0 = dir > 0 ? cx - reach : cx, zx1 = dir > 0 ? cx : cx + reach;
    const zy0 = top ? cy : cy - reach, zy1 = top ? cy + reach : cy;
    const clash = hotRects().some((h) => h.x1 > zx0 && h.x0 < zx1 && h.y1 > zy0 && h.y0 < zy1);
    if (clash) return null;
    return { key: dir + (top ? "t" : "b"), pt: { x: cx - dir * inset, y: top ? cy + inset : cy - inset } };
  }

  let peelKey = null;
  function cancelPeel() {
    if (peelKey === null) return;
    peelKey = null;
    if (pf.getState() === "fold_corner") orig.move({ x: -9999, y: -9999 }, false);
  }
  function hover(e) {
    if (popupOpen || !isIdle()) { stage.style.cursor = ""; return; }
    const p = toBook(e);
    const hot = e.target.closest?.(HOT_SEL) || hotAt(p, 2);
    let dir = hot ? 0 : zoneAt(p);
    if (dir > 0 && lockedAhead()) dir = 0;
    stage.style.cursor = hot ? "pointer" : dir ? "grab" : "";
    const peel = dir ? peelFor(dir, p) : null;
    if (!peel) { cancelPeel(); return; }
    if (peelKey !== null && peelKey !== peel.key) cancelPeel();   // switching corners: reset first
    peelKey = peel.key;
    easeMode = "out";
    orig.move(peel.pt, false);
  }

  let gesture = null;
  let suppressClickUntil = 0;
  stage.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  stage.addEventListener("pointerdown", (e) => {
    if (popupOpen || e.button > 0) return;
    const p = toBook(e);
    const directHot = e.target.closest?.(HOT_SEL);
    if (directHot) {                                         // let the button/link/input work normally…
      cancelPeel();
      // …but on touch screens a horizontal swipe that starts on it still turns the page
      if (e.pointerType !== "mouse") gesture = { type: "page", x0: e.clientX, y0: e.clientY, t: Date.now(), touch: true, onHot: true };
      return;
    }
    const coveredHot = hotAt(p, 0);
    if (coveredHot) {                                        // something drew over it: still honour it
      cancelPeel(); e.preventDefault();
      gesture = { type: "hot", el: coveredHot };
      return;
    }
    const dir = zoneAt(p);
    if (dir) {
      if (!isIdle()) return;
      if (dir > 0 && lockedAhead()) { cancelPeel(); blocked(); return; }
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      gesture = { type: "edge", dir, start: p, x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType !== "mouse" };
      stage.style.cursor = "grabbing";
      return;
    }
    // anywhere else on a page: tap the cover to open it, or swipe (touch) to turn
    gesture = { type: "page", x0: e.clientX, y0: e.clientY, t: Date.now(), touch: e.pointerType !== "mouse" };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!gesture) { if (e.pointerType === "mouse") hover(e); return; }
    if (gesture.type !== "edge") return;
    const p = toBook(e);
    if (!gesture.moved) {
      if (Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) < 6) return;
      gesture.moved = true;
      // the page is lifted by its nearest corner; the corner then follows the pointer
      // with the same vertical offset, so grabbing the centre of the edge works smoothly
      const g = geom();
      const top = gesture.start.y < g.r.top + g.r.height / 2;
      const cornerY = top ? g.r.top + 1 : g.r.top + g.r.height - 1;
      const box = gesture.dir > 0 ? g.right : g.portrait ? g.right : g.left;
      const sx = Math.min(Math.max(gesture.start.x, box.x + 2), box.x + box.w - 2);
      gesture.dx = sx - gesture.start.x;
      gesture.dy = cornerY - gesture.start.y;
      peelKey = null;
      pendingDir = gesture.dir;
      stopAudio();
      orig.start({ x: sx, y: cornerY });
    }
    orig.move({ x: p.x + gesture.dx, y: p.y + gesture.dy }, gesture.touch);
  });

  function endGesture(e, cancelled) {
    const gs = gesture; gesture = null;
    if (!gs) return;
    const p = toBook(e);
    if (gs.type === "hot") {
      if (!cancelled && hotAt(p, 6) === gs.el) gs.el.tagName === "INPUT" ? gs.el.focus() : gs.el.click();
      return;
    }
    if (gs.type === "edge") {
      stage.style.cursor = "";
      if (gs.moved) { easeMode = "out"; orig.stop({ x: p.x + gs.dx, y: p.y + gs.dy }, false); return; }   // finish or fall back
      if (cancelled) return;
      const g = geom();
      const corner = p.y < g.r.top + g.r.height * 0.3 ? "top" : "bottom";
      cancelPeel();
      gs.dir > 0 ? pf.flipNext(corner) : pf.flipPrev(corner);
      return;
    }
    if (gs.type === "page" && !cancelled) {
      const dx = e.clientX - gs.x0, dy = e.clientY - gs.y0;
      if (gs.touch && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - gs.t < 700) {
        if (document.activeElement?.classList.contains("name-input")) document.activeElement.blur();
        suppressClickUntil = Date.now() + 450;               // a swipe is not a tap on whatever it ended on
        dx < 0 ? pf.flipNext("bottom") : pf.flipPrev("bottom");
      } else if (!gs.onHot && Math.hypot(dx, dy) < 8 && curIdx() === 0) {
        // tap on the closed front cover opens the book
        const g = geom(), q = toBook(e);
        if (g.right && q.x >= g.right.x && q.x <= g.right.x + g.right.w) pf.flipNext("bottom");
      }
    }
  }
  stage.addEventListener("pointerup", (e) => endGesture(e, false));
  stage.addEventListener("pointercancel", (e) => endGesture(e, true));
  stage.addEventListener("pointerleave", (e) => { if (!gesture && e.pointerType === "mouse") { cancelPeel(); stage.style.cursor = ""; } });

  /* ---------- resize ---------- */
  // resize our wrapper, then let the library re-measure on the next frame
  addEventListener("resize", () => {
    computeSize(); syncOrientation();
    requestAnimationFrame(() => { pf.update(); applyShift(shiftFor(curIdx())); refreshUI(); });
  });

  /* ---------- start ---------- */
  wrap.style.transition = "none";
  applyShift(shiftFor(0));
  refreshUI();
  requestAnimationFrame(() => { wrap.style.transition = ""; });

  const firstImgs = pages.slice(0, 3).map((p) => p.querySelector("img"));
  Promise.race([
    Promise.all(firstImgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })))),
    new Promise((r) => setTimeout(r, 6000)),
  ]).then(() => {
    $("#loader").classList.add("done");
    // decode every picture ahead of time, then paint them all once (invisibly, at their
    // real size) so the browser has them ready and the first turn of each page doesn't stutter
    const all = [...document.querySelectorAll(".pg img")];
    Promise.all(all.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {}))).then(() => {
      const box = document.createElement("div");
      box.setAttribute("aria-hidden", "true");
      // on top (but 1% opaque and click-through): the browser skips drawing hidden layers
      box.style.cssText = `position:fixed;left:0;top:0;width:${PW}px;height:${PW}px;opacity:.01;pointer-events:none;z-index:9999;overflow:hidden;contain:strict`;
      all.forEach((img, k) => {
        const c = new Image();
        c.src = img.src; c.alt = "";
        // drawn the same way a turning page is (rotated + clipped) so the graphics card
        // prepares that drawing path now instead of during the first page turn
        c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" +
          `transform:translate3d(${k % 3}px,0,0) rotate(${(k % 7) - 3}deg);` +
          "clip-path:polygon(0 0,100% 8%,92% 100%,0 94%)";
        box.appendChild(c);
      });
      const sh = document.createElement("div");
      sh.style.cssText = "position:absolute;inset:0;transform:rotate(-2deg);clip-path:polygon(0 0,100% 0,80% 100%,0 100%);" +
        "background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.4) 40%,rgba(0,0,0,0))";
      box.appendChild(sh);
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 1500);
    });
    ["3.1", "4.1"].forEach((n) => { const i = new Image(); i.src = IMG(n); i.decode?.().catch(() => {}); });
  });
})();
