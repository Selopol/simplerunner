// The coin's market cap, read from the chain through the RPC (Helius): the pump.fun curve while it trades there, the
// canonical PumpSwap pool once it graduated. Price in the quote x the mint's supply; SOL priced by Helius (DAS getAsset).
import { PublicKey } from "@solana/web3.js";

const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL = "So11111111111111111111111111111111111111112";
const NONE = "11111111111111111111111111111111"; // an empty quote_mint on the curve = SOL

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8_000) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const accounts = async (url, keys) => (await rpc(url, "getMultipleAccounts", [keys.map(String), { encoding: "base64", commitment: "confirmed" }])).value.map((a) => (a ? Buffer.from(a.data[0], "base64") : null));
const u64 = (b, o) => b.readBigUInt64LE(o);
const key = (b, o) => new PublicKey(b.subarray(o, o + 32)).toBase58();

let sol = { usd: 0, at: 0 };
async function solUsd(url) {
  if (Date.now() - sol.at < 60_000 && sol.usd > 0) return sol.usd;
  const a = await rpc(url, "getAsset", { id: WSOL, displayOptions: { showFungible: true } });
  const usd = Number(a?.token_info?.price_info?.price_per_token);
  if (usd > 0) sol = { usd, at: Date.now() };
  return sol.usd;
}

/** { mcapUsd, mcapSol, venue } or throws. Quote other than SOL: null caps (the page shows nothing rather than a wrong number). */
export async function marketCap(url, mintStr) {
  const mint = new PublicKey(mintStr);
  const [curvePda] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP);
  const [curve, mintAcc] = await accounts(url, [curvePda, mint]);
  if (!mintAcc) throw new Error("mint not found");
  const decimals = mintAcc[44], supply = Number(u64(mintAcc, 36)) / 10 ** decimals;
  let priceQuote, quote = WSOL, venue;
  if (curve && curve[48] === 0) { // still on the curve
    if (curve.length >= 115 && key(curve, 83) !== NONE) quote = key(curve, 83);
    const vTok = Number(u64(curve, 8)) / 10 ** decimals, vQuote = Number(u64(curve, 16)) / 1e9;
    priceQuote = vQuote / vTok; venue = "curve";
  } else { // graduated: the canonical pool the migration made
    const [authority] = PublicKey.findProgramAddressSync([Buffer.from("pool-authority"), mint.toBuffer()], PUMP);
    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool"), Buffer.from([0, 0]), authority.toBuffer(), mint.toBuffer(), new PublicKey(WSOL).toBuffer()], AMM);
    const [pool] = await accounts(url, [poolPda]);
    if (!pool) throw new Error("no curve and no pool");
    quote = key(pool, 75);
    const [base, qt] = await accounts(url, [key(pool, 139), key(pool, 171)]);
    const virt = pool.length >= 261 ? Number(pool.readBigInt64LE(245)) : 0; // i128 low half: pump pools may add virtual quote
    const b = Number(u64(base, 64)) / 10 ** decimals, q = (Number(u64(qt, 64)) + virt) / 1e9;
    priceQuote = q / b; venue = "pumpswap";
  }
  if (quote !== WSOL) return { mcapUsd: null, mcapSol: null, venue, quote };
  const mcapSol = priceQuote * supply;
  const usd = await solUsd(url);
  return { mcapSol, mcapUsd: usd > 0 ? mcapSol * usd : null, venue };
}
