// simple runner: X, the CA once there is one, the market cap on the sky. Reads /api/stats only.
// ?mc=<usd> shows a market cap without a coin (to look at the sky before launch).
(() => {
  const $ = (s) => document.querySelector(s);
  const copy = $("#copy"), ca = $("#ca"), mc = $("#mc"), mcVal = $("#mc-val");
  const preview = Number(new URLSearchParams(location.search).get("mc")) || 0;
  let mint = null, shown = "", timer = 0;

  const money = (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K` : `$${Math.round(v)}`;
  const show = (usd) => {
    mc.hidden = !(usd > 0);
    if (!(usd > 0)) return;
    const text = money(usd);
    if (text !== shown) { if (shown) { mc.classList.remove("is-bump"); void mc.offsetWidth; mc.classList.add("is-bump"); } shown = text; mcVal.textContent = text; }
  };
  copy.addEventListener("click", async () => {
    if (!mint) return;
    try { await navigator.clipboard.writeText(mint); }
    catch { getSelection()?.selectAllChildren(ca); return; }
    copy.classList.add("is-copied"); clearTimeout(timer);
    timer = setTimeout(() => copy.classList.remove("is-copied"), 1400);
  });
  const load = async () => {
    try {
      const s = await (await fetch("/api/stats", { cache: "no-store" })).json();
      mint = s.mint || null; ca.textContent = mint || ""; copy.hidden = !mint;
      show(preview || s.mcapUsd);
    } catch { show(preview); }
  };
  load();
  setInterval(load, 10_000);
})();
