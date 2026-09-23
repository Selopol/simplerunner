// simple runner: the whole picture is drawn here, no video. A stick figure runs on a real gait (hips, knees, feet,
// arms), the world scrolls past at the speed his planted foot pushes it, six places follow each other (meadow, forest,
// desert, city, snow, beach) and the day turns into night and back on its own clock.
// ?t=<seconds> starts the world that far in (for checking a place or the night without waiting).
(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const q = new URLSearchParams(location.search);
  const T_START = Number(q.get("t")) || 0;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- small tools
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
  const INK = hex("#14161b"), PAPER = hex("#fbfaf5");

  // ---------- the day: sky colours by phase, how dark it is, how warm the light is
  const DAY = 100; // seconds for a whole day
  const SKY = [
    [0.00, "#7483c3", "#ffc59e"], [0.07, "#45a9ee", "#a9dcfb"], [0.50, "#36a6f0", "#9ad6fb"],
    [0.575, "#4c63b0", "#ffb07a"], [0.635, "#2d2f6c", "#c26a8a"], [0.71, "#0b1134", "#1f2c5c"],
    [0.93, "#0d1438", "#2c376e"], [1.00, "#7483c3", "#ffc59e"],
  ].map(([p, a, b]) => [p, hex(a), hex(b)]);
  const skyAt = (ph) => {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [p0, a0, b0] = SKY[i], [p1, a1, b1] = SKY[i + 1];
      if (ph <= p1) { const t = smooth(p0, p1, ph); return [mix(a0, a1, t), mix(b0, b1, t)]; }
    }
    return [SKY[0][1], SKY[0][2]];
  };
  const darkAt = (ph) => ph < 0.07 ? 0.35 * (1 - ph / 0.07) : ph < 0.54 ? 0 : ph < 0.72 ? smooth(0.54, 0.72, ph) : ph < 0.93 ? 1 : 1 - 0.65 * smooth(0.93, 1, ph);
  const warmAt = (ph) => Math.max(1 - Math.abs(ph - 0.6) / 0.07, 1 - Math.min(ph, 1 - ph) / 0.06, 0);
  let dark = 0, warm = 0;
  const NIGHT = [0.26, 0.32, 0.55], DUSK = [1, 0.8, 0.68];
  const lit = (c) => { const w = mix(c, [c[0] * DUSK[0], c[1] * DUSK[1], c[2] * DUSK[2]], warm * 0.7); return mix(w, [w[0] * NIGHT[0], w[1] * NIGHT[1], w[2] * NIGHT[2]], dark); };

  // ---------- the places
  const PLACES = [
    { far: "hills", farC: "#a9d49b", g0: "#93cc45", g1: "#5c9d2b", mid: "tree", near: "tuft", midP: 0.34 },
    { far: "ridge", farC: "#7cae8c", g0: "#7dba3f", g1: "#4a8829", mid: "pine", near: "tuft", midP: 0.85 },
    { far: "dunes", farC: "#f2cf92", g0: "#f1d27e", g1: "#d6a354", mid: "cactus", near: "pebble", midP: 0.42 },
    { far: "city", farC: "#9db0cd", g0: "#a9aeb6", g1: "#6f747d", mid: "lamp", near: "dash", midP: 0.5 },
    { far: "peaks", farC: "#b3c4df", g0: "#f2f6fc", g1: "#c9d7ea", mid: "snowpine", near: "mound", midP: 0.6 },
    { far: "sea", farC: "#3ea4dc", g0: "#f4dea2", g1: "#e0bb76", mid: "palm", near: "shell", midP: 0.36 },
  ].map((p) => ({ ...p, farC: hex(p.farC), g0: hex(p.g0), g1: hex(p.g1) }));
  const N = PLACES.length, PLACE_S = 18; // seconds of running in each place
  let PLACE_U = 1;
  const placeAt = (d) => { const n = d / PLACE_U, i = Math.floor(n), a = ((i % N) + N) % N; return { a, b: (a + 1) % N, w: smooth(0.8, 1, n - i) }; };
  const farHeight = (kind, x) => {
    switch (kind) {
      case "hills": return 2.2 + 2.2 * noise(x * 0.035) + 0.7 * noise(x * 0.11 + 5);
      case "ridge": return 3 + 2.6 * noise(x * 0.05 + 11) + 1.1 * noise(x * 0.17 + 3);
      case "dunes": return 0.8 + 2.4 * noise(x * 0.045 + 7) ** 2;
      case "city": { const b = Math.floor(x / 3.2); return hash(b * 1.7) < 0.12 ? 1.2 : 2.6 + 7 * hash(b) ** 1.6; }
      case "peaks": { const f = x * 0.055 + noise(x * 0.02) * 0.8; return 2.2 + 8 * (1 - Math.abs((f - Math.floor(f)) - 0.5) * 2) * (0.55 + 0.45 * noise(x * 0.03 + 2)); }
      default: return 0.12;
    }
  };

  // ---------- the runner: a gait in radians from straight down, forward positive; lengths in body units (U)
  const L1 = 1.75, L2 = 1.7, FOOT = 0.5, TORSO = 2.35, HEAD = 0.82, A1 = 1.2, A2 = 1.1, LEAN = 0.24, LINE = 0.34;
  const STRIDE_HZ = 1.45;
  const leg = (p) => {
    const th = 0.12 + 0.82 * Math.sin(p);
    const k = 0.18 + 1.55 * Math.max(0, Math.cos(p + 0.35)) ** 1.25;
    const sh = th - k, knee = [L1 * Math.sin(th), L1 * Math.cos(th)];
    const foot = [knee[0] + L2 * Math.sin(sh), knee[1] + L2 * Math.cos(sh)];
    const ta = sh + 1.45 + 0.25 * Math.sin(p);
    return [knee, foot, [foot[0] + FOOT * Math.sin(ta), foot[1] + FOOT * Math.cos(ta)]];
  };
  const arm = (p) => {
    const a = -0.33 - 1.07 * Math.sin(p), f = a + 1.05 - 0.25 * Math.sin(p);
    const el = [A1 * Math.sin(a), A1 * Math.cos(a)];
    return [el, [el[0] + A2 * Math.sin(f), el[1] + A2 * Math.cos(f)]];
  };
  const low = (p) => Math.max(leg(p)[1][1], leg(p)[2][1]);
  // the ground moves as fast as the planted foot moves back at its lowest point: no skating
  let pLow = 0; for (let p = 0; p < Math.PI * 2; p += 0.01) if (low(p) > low(pLow)) pLow = p;
  const SPEED = -((leg(pLow + 0.01)[1][0] - leg(pLow - 0.01)[1][0]) / 0.02) * Math.PI * 2 * STRIDE_HZ * 0.95; // U per second
  const REST = low(pLow);
  PLACE_U = SPEED * PLACE_S;

  // ---------- layout
  let W = 0, H = 0, U = 1, dpr = 1, horizon = 0, ground = 0, runX = 0;
  const resize = () => {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    if (W * H * dpr * dpr > 6e6) dpr = Math.sqrt(6e6 / (W * H));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const tall = H > W;
    horizon = H * (tall ? 0.6 : 0.585);
    ground = H * (tall ? 0.79 : 0.8);
    U = Math.min(H * 0.34, W * (tall ? 0.64 : 0.55)) / 7.45;
    runX = W * (tall ? 0.47 : 0.45);
    if (still) frame(0);
  };

  // ---------- props (x, y at the base, s = scale in px)
  const PROPS = {
    tree(x, y, s) {
      ctx.fillStyle = css(lit(hex("#7a5431"))); ctx.fillRect(x - 0.17 * s, y - 1.7 * s, 0.34 * s, 1.7 * s);
      ctx.fillStyle = css(lit(hex("#4f9a3a")));
      for (const [dx, dy, r] of [[-0.7, -2.2, 0.95], [0.6, -2.3, 1], [0, -3.1, 1.15]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill(); }
      ctx.fillStyle = css(lit(hex("#62ad48"))); ctx.beginPath(); ctx.arc(x - 0.25 * s, y - 3.35 * s, 0.6 * s, 0, 7); ctx.fill();
    },
    pine(x, y, s, snowy) {
      ctx.fillStyle = css(lit(hex("#6b4a2e"))); ctx.fillRect(x - 0.14 * s, y - 0.9 * s, 0.28 * s, 0.9 * s);
      const tiers = [[0.9, 1.25, 1.7], [2.0, 1.0, 1.5], [3.0, 0.75, 1.3]];
      for (const [b, hw, h] of tiers) {
        ctx.fillStyle = css(lit(hex(snowy ? "#3f6e5c" : "#2f6d3e")));
        ctx.beginPath(); ctx.moveTo(x - hw * s, y - b * s); ctx.lineTo(x + hw * s, y - b * s); ctx.lineTo(x, y - (b + h) * s); ctx.fill();
        if (snowy) { ctx.fillStyle = css(lit(PAPER)); ctx.beginPath(); ctx.moveTo(x - hw * 0.45 * s, y - (b + h * 0.55) * s); ctx.lineTo(x + hw * 0.45 * s, y - (b + h * 0.55) * s); ctx.lineTo(x, y - (b + h) * s); ctx.fill(); }
      }
    },
    snowpine(x, y, s) { PROPS.pine(x, y, s, true); },
    cactus(x, y, s, r) {
      ctx.strokeStyle = css(lit(hex("#4f9448"))); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 0.62 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 3.3 * s); ctx.stroke();
      const a = 1.2 + r * 0.8, b = 1.8 + (1 - r) * 0.7;
      ctx.lineWidth = 0.46 * s; ctx.beginPath();
      ctx.moveTo(x, y - a * s); ctx.lineTo(x - 0.95 * s, y - a * s); ctx.lineTo(x - 0.95 * s, y - (a + 1) * s);
      ctx.moveTo(x, y - b * s); ctx.lineTo(x + 0.9 * s, y - b * s); ctx.lineTo(x + 0.9 * s, y - (b + 0.8) * s); ctx.stroke();
    },
    lamp(x, y, s) {
      ctx.strokeStyle = css(lit(hex("#3b4049"))); ctx.lineCap = "round"; ctx.lineWidth = 0.17 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 4.3 * s); ctx.quadraticCurveTo(x, y - 4.7 * s, x + 0.7 * s, y - 4.6 * s); ctx.stroke();
      ctx.fillStyle = css(mix(lit(hex("#e9e3c8")), hex("#ffe9a0"), dark)); ctx.beginPath(); ctx.ellipse(x + 0.75 * s, y - 4.5 * s, 0.32 * s, 0.16 * s, 0, 0, 7); ctx.fill();
      if (dark > 0.05) {
        const g = ctx.createRadialGradient(x + 0.75 * s, y - 4.4 * s, 0, x + 0.75 * s, y - 4.4 * s, 3.2 * s);
        g.addColorStop(0, `rgba(255,226,140,${0.5 * dark})`); g.addColorStop(1, "rgba(255,226,140,0)");
        ctx.fillStyle = g; ctx.fillRect(x - 3 * s, y - 7.6 * s, 7.5 * s, 7.6 * s);
      }
    },
    palm(x, y, s, r) {
      const lean = (r - 0.3) * 1.2 * s;
      ctx.strokeStyle = css(lit(hex("#9a7448"))); ctx.lineCap = "round"; ctx.lineWidth = 0.34 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.2, y - 2.5 * s, x + lean, y - 4.4 * s); ctx.stroke();
      ctx.strokeStyle = css(lit(hex("#3f8f3a"))); ctx.lineWidth = 0.3 * s;
      const tx = x + lean, ty = y - 4.4 * s;
      for (const a of [-2.7, -2.1, -1.2, -0.45, 0.2]) {
        ctx.beginPath(); ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * 1.3 * s, ty + Math.sin(a) * 1.3 * s - 0.5 * s, tx + Math.cos(a) * 2.1 * s, ty + Math.sin(a) * 2.1 * s + 0.6 * s); ctx.stroke();
      }
    },
    tuft(x, y, s) {
      ctx.strokeStyle = css(lit(hex("#4b8f27"))); ctx.lineCap = "round"; ctx.lineWidth = 0.1 * s;
      ctx.beginPath(); for (const d of [-0.25, 0, 0.25]) { ctx.moveTo(x + d * s, y); ctx.lineTo(x + d * 2 * s, y - 0.55 * s); } ctx.stroke();
    },
    pebble(x, y, s) { ctx.fillStyle = css(lit(hex("#b98d52"))); ctx.beginPath(); ctx.ellipse(x, y, 0.3 * s, 0.14 * s, 0, 0, 7); ctx.fill(); },
    dash(x, y, s) { ctx.fillStyle = css(lit(hex("#eef0f2")), 0.85); ctx.fillRect(x - 1.1 * s, y - 0.07 * s, 2.2 * s, 0.14 * s); },
    mound(x, y, s) { ctx.fillStyle = css(lit(hex("#ffffff"))); ctx.beginPath(); ctx.ellipse(x, y, 0.8 * s, 0.22 * s, 0, Math.PI, 0); ctx.fill(); },
    shell(x, y, s) { ctx.fillStyle = css(lit(hex("#f3b6a6"))); ctx.beginPath(); ctx.ellipse(x, y, 0.18 * s, 0.12 * s, 0, 0, 7); ctx.fill(); },
  };

  // ---------- one layer of props at depth k, drawn from slot positions so the world never repeats a pattern
  const propLayer = (dist, k, spacing, yOf, scale, pick, seed) => {
    const off = dist * k * U;
    const first = Math.floor((off - 6 * U) / (spacing * U)), last = Math.ceil((off + W + 6 * U) / (spacing * U));
    for (let i = first; i <= last; i++) {
      const r = hash(i * 7.31 + seed);
      const x = (i * spacing + (r - 0.5) * spacing * 0.8) * U - off;
      const d = dist + (x - runX) / (U * k), pl = placeAt(d);
      const place = PLACES[hash(i * 3.17 + seed) < pl.w ? pl.b : pl.a];
      const kind = pick(place);
      if (!kind || hash(i * 1.93 + seed * 2) > (pick === midKind ? place.midP : 0.55)) continue;
      PROPS[kind](x, yOf(r), scale * (0.85 + 0.3 * hash(i * 5.1 + seed)), hash(i * 9.7 + seed));
    }
  };
  const midKind = (p) => p.mid, nearKind = (p) => p.near;

  // ---------- the figure
  const figure = (t, phase, color) => {
    const pR = phase, pL = phase + Math.PI;
    const lowest = Math.max(low(pR), low(pL));
    const hipY = ground - U * Math.max(lowest, REST * 0.93);
    const hip = [runX, hipY];
    const boil = Math.floor(t * 10); // hand-drawn lines "boil" ten times a second
    let jn = 0;
    const P = (v) => { jn++; return [hip[0] + v[0] * U + (hash(boil * 13.7 + jn) - 0.5) * 0.07 * U, hip[1] + v[1] * U + (hash(boil * 7.9 + jn * 3) - 0.5) * 0.07 * U]; };
    // the shadow shrinks as he flies
    const air = clamp((REST * 0.93 - lowest) / 0.9, 0, 1);
    ctx.fillStyle = css(INK, (0.2 - air * 0.08) * (1 - dark * 0.5));
    ctx.beginPath(); ctx.ellipse(runX + 0.4 * U, ground + 0.12 * U, (1.9 - air * 0.4) * U, 0.3 * U, 0, 0, 7); ctx.fill();

    ctx.strokeStyle = css(color); ctx.lineWidth = LINE * U; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const neck = [TORSO * Math.sin(LEAN), -TORSO * Math.cos(LEAN)];
    const sh = [neck[0] * 0.86, neck[1] * 0.86];
    const line = (pts) => { ctx.beginPath(); const a = P(pts[0]); ctx.moveTo(a[0], a[1]); for (let i = 1; i < pts.length; i++) { const b = P(pts[i]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); };
    const limbs = (p) => {
      const [kn, ft, toe] = leg(p); line([[0, 0], kn, ft, toe]);
      const [el, hand] = arm(p); line([sh, [sh[0] + el[0], sh[1] + el[1]], [sh[0] + hand[0], sh[1] + hand[1]]]);
    };
    limbs(pL);
    line([[0, 0], neck]);
    limbs(pR);
    const hc = P([neck[0] + (HEAD + 0.08) * Math.sin(LEAN * 0.7), neck[1] - (HEAD + 0.08) * Math.cos(LEAN * 0.7)]);
    ctx.beginPath(); ctx.arc(hc[0], hc[1], HEAD * U, 0, 7); ctx.stroke();
  };

  // ---------- speed lines and snow: a few long-lived particles
  const streaks = Array.from({ length: 16 }, (_, i) => ({ x: hash(i) * 2, y: hash(i + 40), len: 0.5 + hash(i + 80), v: 1.4 + hash(i + 120) * 0.9 }));
  const flakes = Array.from({ length: 70 }, (_, i) => ({ x: hash(i + 200), y: hash(i + 300), r: 0.5 + hash(i + 400) * 1.3, v: 0.25 + hash(i + 500) * 0.35 }));

  // ---------- one frame
  let dist = T_START * SPEED + PLACE_U * 0.45, phase = T_START * STRIDE_HZ * Math.PI * 2, last = 0, fg = "";
  const frame = (dt) => {
    const t = T_START + performance.now() / 1000;
    dist += dt * SPEED; phase += dt * STRIDE_HZ * Math.PI * 2;
    const ph = (((t / DAY) + 0.18) % 1 + 1) % 1; // start in the morning
    dark = darkAt(ph); warm = warmAt(ph);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sky
    const [top, bot] = skyAt(ph);
    let g = ctx.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 2);

    // stars
    if (dark > 0.05) {
      for (let i = 0; i < 110; i++) {
        const sx = hash(i * 2.3) * W, sy = hash(i * 4.1) ** 1.4 * horizon * 0.85;
        const tw = 0.55 + 0.45 * Math.sin(t * (1 + hash(i) * 2) + i);
        ctx.fillStyle = `rgba(255,250,235,${dark * tw * 0.9})`; ctx.fillRect(sx, sy, 1.6 + hash(i * 9) * 1.4, 1.6 + hash(i * 9) * 1.4);
      }
    }
    // sun by day, moon by night, on an arc
    const orb = (u, r, fill, glow) => {
      const x = W * (0.06 + 0.88 * u), y = horizon - horizon * 0.8 * Math.sin(Math.PI * u);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2); gg.addColorStop(0, glow); gg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = gg; ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      return [x, y];
    };
    const R = Math.min(W, H) * 0.045;
    if (ph < 0.62 || ph > 0.985) { const u = ((ph + 0.015) % 1) / 0.635; orb(u, R, css(mix(hex("#fff3b0"), hex("#ffb24a"), warm)), `rgba(255,236,160,${0.55 - warm * 0.2})`); }
    if (ph > 0.6 && ph < 0.995) {
      const u = (ph - 0.6) / 0.395, [mx, my] = orb(u, R * 0.8, "rgba(246,244,230,0.95)", `rgba(220,230,255,${0.3 * dark})`);
      ctx.fillStyle = css(mix(top, bot, clamp(my / horizon, 0, 1))); ctx.beginPath(); ctx.arc(mx + R * 0.34, my - R * 0.18, R * 0.7, 0, 7); ctx.fill();
    }
    // clouds
    const cOff = (dist * 0.035 + t * 0.6) * U;
    for (let i = Math.floor((cOff - W) / (W * 0.42)); i <= Math.ceil((cOff + W) / (W * 0.42)); i++) {
      const cx = i * W * 0.42 + hash(i) * W * 0.3 - cOff, cy = horizon * (0.12 + hash(i + 7) * 0.45), cs = U * (0.8 + hash(i + 3) * 0.9);
      ctx.fillStyle = css(mix(mix(PAPER, hex("#ffd2b0"), warm * 0.6), hex("#3a4470"), dark), 0.85 - dark * 0.45);
      ctx.beginPath();
      for (const [dx, dy, r] of [[-1.6, 0.25, 0.9], [-0.5, -0.3, 1.25], [0.8, -0.1, 1.05], [1.8, 0.3, 0.75]]) { ctx.moveTo(cx + dx * cs + r * cs, cy + dy * cs); ctx.arc(cx + dx * cs, cy + dy * cs, r * cs, 0, 7); }
      ctx.rect(cx - 1.6 * cs, cy + 0.1 * cs, 3.4 * cs, 0.95 * cs); ctx.fill();
    }

    // far land: one silhouette whose shape and colour follow the place ahead
    const KF = 0.12, fOff = dist * KF;
    const at = (x) => { const d = dist + (x - runX) / (U * KF), pl = placeAt(d); return pl; };
    ctx.beginPath(); ctx.moveTo(0, horizon + 1);
    for (let x = 0; x <= W + 6; x += 6) {
      const pl = at(x), lx = fOff + x / U;
      const h = farHeight(PLACES[pl.a].far, lx) * (1 - pl.w) + farHeight(PLACES[pl.b].far, lx) * pl.w;
      ctx.lineTo(x, horizon - h * U);
    }
    ctx.lineTo(W, horizon + 1); ctx.closePath();
    g = ctx.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 8; i++) { const pl = at((W * i) / 8); g.addColorStop(i / 8, css(lit(mix(PLACES[pl.a].farC, PLACES[pl.b].farC, pl.w)))); }
    ctx.fillStyle = g; ctx.fill();
    // snow caps: the silhouette itself, whitened above the snow line where the peaks are
    let peaks = 0; const capG = ctx.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 8; i++) { const pl = at((W * i) / 8), w = (pl.a === 4 ? 1 - pl.w : 0) + (pl.b === 4 ? pl.w : 0); peaks = Math.max(peaks, w); capG.addColorStop(i / 8, css(lit(PAPER), w)); }
    if (peaks > 0.02) { ctx.save(); ctx.clip(); ctx.fillStyle = capG; ctx.fillRect(0, 0, W, horizon - 5.4 * U); ctx.restore(); }
    // city windows light up at night
    if (dark > 0.05) for (let x = 0; x <= W; x += 6) {
      const pl = at(x), lx = fOff + x / U, pc = (pl.a === 3 ? 1 - pl.w : 0) + (pl.b === 3 ? pl.w : 0);
      if (pc < 0.02) continue;
      const b = Math.floor(lx / 3.2), h = farHeight("city", lx), col = Math.floor((lx - b * 3.2) / 0.55);
      if ((lx - b * 3.2) % 0.55 < 0.25) for (let row = 1; row * 0.7 < h - 0.4; row++) if (hash(b * 31 + col * 7 + row) > 0.45) { ctx.fillStyle = `rgba(255,224,140,${pc * dark * 0.9})`; ctx.fillRect(x, horizon - row * 0.7 * U, 3, 0.28 * U); }
    }

    // the ground: bands from the horizon down, each coloured along x by the place under it
    const bands = 12, gAt = (x) => placeAt(dist + (x - runX) / U);
    const cols = []; for (let i = 0; i <= 8; i++) { const pl = gAt((W * i) / 8); cols.push([mix(PLACES[pl.a].g0, PLACES[pl.b].g0, pl.w), mix(PLACES[pl.a].g1, PLACES[pl.b].g1, pl.w)]); }
    for (let b = 0; b < bands; b++) {
      const y0 = horizon + ((H - horizon) * b) / bands, depth = (b + 0.5) / bands;
      g = ctx.createLinearGradient(0, 0, W, 0);
      cols.forEach(([c0, c1], i) => g.addColorStop(i / 8, css(lit(mix(c0, c1, depth ** 0.8)))));
      ctx.fillStyle = g; ctx.fillRect(0, y0, W, (H - horizon) / bands + 1);
    }
    // the sea along the beach
    g = ctx.createLinearGradient(0, 0, W, 0);
    let sea = 0;
    for (let i = 0; i <= 8; i++) { const pl = gAt((W * i) / 8), w = (pl.a === 5 ? 1 - pl.w : 0) + (pl.b === 5 ? pl.w : 0); sea = Math.max(sea, w); g.addColorStop(i / 8, css(lit(hex("#3ea4dc")), w)); }
    if (sea > 0.01) {
      const sh = (ground - horizon) * 0.32;
      ctx.fillStyle = g; ctx.fillRect(0, horizon, W, sh);
      ctx.fillStyle = `rgba(255,255,255,${0.55 * sea * (1 - dark * 0.6)})`;
      for (let i = 0; i < 26; i++) { const sx = ((hash(i) * W * 1.5 - dist * 0.35 * U) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25, sy = horizon + hash(i + 9) * sh; ctx.fillRect(sx, sy, U * (0.3 + hash(i + 5) * 0.6), 2); }
    }
    ctx.fillStyle = css(INK, 0.08); ctx.fillRect(0, horizon, W, 2);

    // motion streaks on the ground: nearer rows run faster
    for (let i = 0; i < 34; i++) {
      const depth = (i + 0.5) / 34, y = horizon + (H - horizon) * depth ** 1.3, sp = (0.3 + 1.1 * depth) * SPEED * U;
      const len = U * (1.5 + hash(i + 11) * 4) * (0.4 + depth), span = W + len * 2;
      const x = span - (((dist / SPEED) * sp + hash(i) * span) % span) - len;
      ctx.fillStyle = hash(i + 3) > 0.5 ? `rgba(255,255,255,${0.16 * (1 - dark * 0.7)})` : css(INK, 0.07);
      ctx.fillRect(x, y, len, 1 + depth * 2.5);
    }

    // things between the horizon and him, him, things in front of him
    propLayer(dist, 0.5, 6.5, () => horizon + (ground - horizon) * 0.18, U * 0.8, midKind, 1);
    const color = mix(INK, PAPER, smooth(0.45, 0.8, dark));
    figure(t, phase, color);
    propLayer(dist, 1.3, 2.4, (r) => ground + 0.6 * U + r * (H - ground - 0.9 * U), U * 0.9, nearKind, 2);

    // speed lines in the air
    ctx.lineCap = "round";
    for (const s of streaks) {
      s.x -= (dt * s.v * SPEED * U) / W;
      if (s.x < -0.4) { s.x = 1.1 + Math.random() * 0.6; s.y = Math.random(); s.len = 0.5 + Math.random(); }
      const y = H * (0.12 + s.y * 0.7);
      ctx.strokeStyle = `rgba(255,255,255,${(0.7 - dark * 0.45) * (y < horizon ? 1 : 0.6)})`; ctx.lineWidth = Math.max(2, U * 0.09);
      ctx.beginPath(); ctx.moveTo(s.x * W, y); ctx.lineTo(s.x * W + s.len * U * 2.6, y); ctx.stroke();
    }
    // snow where it snows
    const here = placeAt(dist), snow = (here.a === 4 ? 1 - here.w : 0) + (here.b === 4 ? here.w : 0);
    if (snow > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * snow})`;
      for (const f of flakes) {
        f.y += dt * f.v; f.x -= dt * 0.35; if (f.y > 1) { f.y = 0; f.x = Math.random() * 1.3; } if (f.x < -0.05) f.x += 1.3;
        ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.r * Math.max(1.5, U * 0.06), 0, 7); ctx.fill();
      }
    }

    // the page's words take the runner's colour: ink by day, chalk by night
    const next = css(color);
    if (next !== fg) { fg = next; document.documentElement.style.setProperty("--fg", fg); }
  };

  const loop = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now; frame(dt);
    requestAnimationFrame(loop);
  };
  addEventListener("resize", resize);
  resize();
  if (!still) requestAnimationFrame(loop);
})();
