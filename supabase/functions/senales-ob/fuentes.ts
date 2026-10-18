// Descarga de velas cerradas de futuros perpetuos USDT desde APIs públicas (sin clave).
// Orden de prueba: Bybit -> OKX -> Binance. Si una está bloqueada en la región del servidor, usa la siguiente.

import type { Vela } from "./indicadores.ts";

export interface Resultado {
  velas: Vela[];
  fuente: string;
}

const MIN_BYBIT: Record<number, string> = { 1: "1", 3: "3", 5: "5", 15: "15", 30: "30", 60: "60", 240: "240", 0: "D", [-1]: "W" };
const MIN_OKX: Record<number, string> = { 1: "1m", 3: "3m", 5: "5m", 15: "15m", 30: "30m", 60: "1H", 240: "4H", 0: "1Dutc", [-1]: "1Wutc" };
const MIN_BINANCE: Record<number, string> = { 1: "1m", 3: "3m", 5: "5m", 15: "15m", 30: "30m", 60: "1h", 240: "4h", 0: "1d", [-1]: "1w" };

async function getJson(url: string): Promise<any> {
  let ultimo = "";
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "senales-ob/1.0" } });
      if (r.ok) return await r.json();
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = (e as Error).message;
    }
    await new Promise((ok) => setTimeout(ok, 600)); // reintento único ante fallos pasajeros
  }
  throw new Error(ultimo);
}

/** Quita la vela en formación (la última) y devuelve en orden cronológico. */
function cerradas(velas: Vela[], periodoMs: number, incluirAbierta: boolean): Vela[] {
  velas.sort((a, b) => a.t - b.t);
  const ahora = Date.now();
  return incluirAbierta ? velas : velas.filter((v) => v.t + periodoMs <= ahora);
}

export function periodoMs(min: number): number {
  return (min > 0 ? min : min === 0 ? 1440 : 10080) * 60_000;
}

/** `base` es la moneda, por ejemplo "BTC" -> BTCUSDT. */
export async function obtenerVelas(base: string, min: number, incluirAbierta = false): Promise<Resultado> {
  const errores: string[] = [];
  const intentos: Array<[string, () => Promise<Vela[]>]> = [
    ["Bybit", async () => {
      const j = await getJson(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${base}USDT&interval=${MIN_BYBIT[min]}&limit=1000`);
      if (j.retCode !== 0 || !j.result?.list?.length) throw new Error(j.retMsg ?? "sin datos");
      return j.result.list.map((r: string[]) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
    }],
    ["OKX", async () => {
      const j = await getJson(`https://www.okx.com/api/v5/market/candles?instId=${base}-USDT-SWAP&bar=${MIN_OKX[min]}&limit=300`);
      if (j.code !== "0" || !j.data?.length) throw new Error(j.msg ?? "sin datos");
      return j.data.map((r: string[]) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
    }],
    ["Binance", async () => {
      const j = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${base}USDT&interval=${MIN_BINANCE[min]}&limit=1000`);
      if (!Array.isArray(j) || !j.length) throw new Error("sin datos");
      return j.map((r: string[]) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
    }],
  ];
  for (const [nombre, fn] of intentos) {
    try {
      const velas = cerradas(await fn(), periodoMs(min), incluirAbierta);
      if (velas.length >= 200) return { velas, fuente: nombre };
      errores.push(`${nombre}: pocas velas (${velas.length})`);
    } catch (e) {
      errores.push(`${nombre}: ${(e as Error).message}`);
    }
  }
  throw new Error(errores.join(" | "));
}

const EXCLUIDAS = new Set(["USDC", "FDUSD", "USDE", "DAI", "TUSD", "USDD", "PYUSD", "USD1", "EUR", "BUSD"]);

/** Las `n` monedas de futuros USDT con más volumen (turnover 24 h). Bybit -> OKX -> Binance. */
export async function obtenerTop(n: number): Promise<{ monedas: string[]; fuente: string }> {
  const errores: string[] = [];
  const limpiar = (pares: Array<[string, number]>) =>
    pares
      .filter(([b, v]) => b && !EXCLUIDAS.has(b) && Number.isFinite(v) && v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([b]) => b);
  const intentos: Array<[string, () => Promise<string[]>]> = [
    ["Bybit", async () => {
      const j = await getJson("https://api.bybit.com/v5/market/tickers?category=linear");
      if (j.retCode !== 0) throw new Error(j.retMsg ?? "sin datos");
      return limpiar(j.result.list.filter((t: any) => /USDT$/.test(t.symbol)).map((t: any) => [t.symbol.replace(/USDT$/, ""), +t.turnover24h]));
    }],
    ["OKX", async () => {
      const j = await getJson("https://www.okx.com/api/v5/market/tickers?instType=SWAP");
      if (j.code !== "0") throw new Error(j.msg ?? "sin datos");
      return limpiar(j.data.filter((t: any) => /-USDT-SWAP$/.test(t.instId)).map((t: any) => [t.instId.replace("-USDT-SWAP", ""), +t.volCcy24h * +t.last]));
    }],
    ["Binance", async () => {
      const j = await getJson("https://fapi.binance.com/fapi/v1/ticker/24hr");
      return limpiar(j.filter((t: any) => /USDT$/.test(t.symbol)).map((t: any) => [t.symbol.replace(/USDT$/, ""), +t.quoteVolume]));
    }],
  ];
  for (const [nombre, fn] of intentos) {
    try {
      const m = await fn();
      if (m.length >= Math.min(n, 10)) return { monedas: m, fuente: nombre };
      errores.push(`${nombre}: pocas monedas`);
    } catch (e) {
      errores.push(`${nombre}: ${(e as Error).message}`);
    }
  }
  throw new Error(errores.join(" | "));
}
