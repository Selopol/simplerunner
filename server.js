// simple runner: the site and its CA switch. No dependencies.
//   GET  /api/config          -> { mint }            (null until the coin is live)
//   POST /api/admin/config    { mint } + x-admin-key  sets it ("" clears); kept in DATA_DIR/config.json
// MINT in the environment is the fallback when nothing was set through the switch.
import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";

const PORT = Number(process.env.PORT || 8791);
const WEB = path.resolve("web");
const DATA = path.resolve(process.env.DATA_DIR || "data");
const CONFIG = path.join(DATA, "config.json");
const ADMIN = process.env.ADMIN_KEY || "";
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let mint = MINT_RE.test(process.env.MINT || "") ? process.env.MINT : null;
try { const c = JSON.parse(await fs.readFile(CONFIG, "utf8")); if (c.mint === null || MINT_RE.test(c.mint)) mint = c.mint; } catch { /* first start */ }

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const CACHE = { ".html": "no-cache", ".mp4": "public, max-age=604800", ".jpg": "public, max-age=604800", ".png": "public, max-age=604800" };

const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const keyOk = (given) => { const a = Buffer.from(String(given || "")), b = Buffer.from(ADMIN); return ADMIN.length >= 16 && a.length === b.length && timingSafeEqual(a, b); };

async function readBody(req, max = 1024) {
  let size = 0; const parts = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error("too large"); parts.push(chunk); }
  return Buffer.concat(parts).toString("utf8");
}

async function serveFile(req, res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) return json(res, 404, { error: "not found" });
  let st;
  try { st = await fs.stat(file); if (!st.isFile()) throw 0; } catch { return json(res, 404, { error: "not found" }); }
  const ext = path.extname(file);
  const head = { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": CACHE[ext] || "public, max-age=3600", "accept-ranges": "bytes" };
  // Safari plays a video only through range requests
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
    start = Math.max(0, start); end = Math.min(end, st.size - 1);
    if (start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, "content-length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  try {
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname === "/api/config" && req.method === "GET") return json(res, 200, { mint });
    if (url.pathname === "/api/admin/config" && req.method === "POST") {
      if (!keyOk(req.headers["x-admin-key"])) return json(res, 403, { error: "forbidden" });
      const body = JSON.parse(await readBody(req) || "{}");
      const next = body.mint ? String(body.mint).trim() : null;
      if (next !== null && !MINT_RE.test(next)) return json(res, 400, { error: "not a Solana address" });
      mint = next;
      await fs.mkdir(DATA, { recursive: true });
      await fs.writeFile(CONFIG, JSON.stringify({ mint }));
      console.log(`[config] mint = ${mint ?? "none"}`);
      return json(res, 200, { mint });
    }
    if (req.method === "GET" || req.method === "HEAD") return await serveFile(req, res, url.pathname);
    json(res, 405, { error: "method not allowed" });
  } catch (e) {
    json(res, 400, { error: String(e?.message ?? e).slice(0, 120) });
  }
}).listen(PORT, () => console.log(`simple runner on :${PORT}, mint ${mint ?? "none"}, switch ${ADMIN ? "on" : "off"}`));
