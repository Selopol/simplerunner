// simple runner. The runner, the name, X and the CA once there is one. Reads /api/config only.
(() => {
  const $ = (s) => document.querySelector(s);

  // 4K on wide screens, 1080p on phones; the poster sits underneath either way
  const wall = $("#wall");
  if (wall && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    wall.src = matchMedia("(max-width: 900px)").matches ? "/runner-1080.mp4?v=1" : "/runner.mp4?v=1";
    wall.play().catch(() => {});
  }

  const copy = $("#copy"), ca = $("#ca");
  let mint = null, timer = 0;
  const apply = () => { ca.textContent = mint || ""; copy.hidden = !mint; };
  copy.addEventListener("click", async () => {
    if (!mint) return;
    try { await navigator.clipboard.writeText(mint); }
    catch { getSelection()?.selectAllChildren(ca); return; }
    copy.classList.add("is-copied"); clearTimeout(timer);
    timer = setTimeout(() => copy.classList.remove("is-copied"), 1400);
  });
  const load = async () => {
    try { mint = (await (await fetch("/api/config", { cache: "no-store" })).json()).mint || null; } catch {}
    apply();
  };
  load();
  setInterval(load, 20_000);
})();
