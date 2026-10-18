// Indicadores técnicos equivalentes a los de Pine Script v6 (ta.*).
// Todas las series son arrays alineados con las velas; NaN = "na" de Pine.

export interface Vela {
  t: number; // apertura en ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** ta.rma: media de Wilder, sembrada con la SMA de las primeras `len` muestras. */
export function rma(src: number[], len: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let prev = NaN;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    if (Number.isNaN(prev)) {
      if (Number.isNaN(x)) continue;
      sum += x;
      cnt++;
      if (cnt === len) {
        prev = sum / len;
        out[i] = prev;
      }
    } else {
      prev = (prev * (len - 1) + (Number.isNaN(x) ? 0 : x)) / len;
      out[i] = prev;
    }
  }
  return out;
}

/** ta.sma */
export function sma(src: number[], len: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let s = 0;
    let bad = false;
    for (let k = 0; k < len; k++) {
      const x = src[i - k];
      if (Number.isNaN(x)) {
        bad = true;
        break;
      }
      s += x;
    }
    if (!bad) out[i] = s / len;
  }
  return out;
}

/** ta.rsi */
export function rsi(close: number[], len: number): number[] {
  const up = close.map((x, i) => (i === 0 ? NaN : Math.max(x - close[i - 1], 0)));
  const dn = close.map((x, i) => (i === 0 ? NaN : Math.max(close[i - 1] - x, 0)));
  const u = rma(up, len);
  const d = rma(dn, len);
  return close.map((_, i) => {
    if (Number.isNaN(u[i]) || Number.isNaN(d[i])) return NaN;
    if (d[i] === 0) return 100;
    if (u[i] === 0) return 0;
    return 100 - 100 / (1 + u[i] / d[i]);
  });
}

/** ta.stoch(close, high, low, len) */
export function stoch(close: number[], high: number[], low: number[], len: number): number[] {
  const out = new Array<number>(close.length).fill(NaN);
  for (let i = len - 1; i < close.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = 0; k < len; k++) {
      hh = Math.max(hh, high[i - k]);
      ll = Math.min(ll, low[i - k]);
    }
    out[i] = hh === ll ? NaN : (100 * (close[i] - ll)) / (hh - ll);
  }
  return out;
}

/** ta.atr */
export function atr(c: Vela[], len: number): number[] {
  const tr = c.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c))));
  return rma(tr, len);
}

function fixnan(a: number[]): number[] {
  let last = NaN;
  return a.map((x) => {
    if (!Number.isNaN(x)) last = x;
    return last;
  });
}

/** ta.dmi(len, adxSmooth) -> [DI+, DI-, ADX] */
export function dmi(c: Vela[], len: number, adxSmooth: number): { diP: number[]; diM: number[]; adx: number[] } {
  const n = c.length;
  const plusDM = new Array<number>(n).fill(NaN);
  const minusDM = new Array<number>(n).fill(NaN);
  const tr = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const up = c[i].h - c[i - 1].h;
    const down = c[i - 1].l - c[i].l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
  }
  const trR = rma(tr, len);
  const pR = rma(plusDM, len);
  const mR = rma(minusDM, len);
  const diP = fixnan(pR.map((x, i) => (100 * x) / trR[i]));
  const diM = fixnan(mR.map((x, i) => (100 * x) / trR[i]));
  const dx = diP.map((p, i) => {
    const s = p + diM[i];
    return (Math.abs(p - diM[i]) / (s === 0 ? 1 : s)) * 100;
  });
  const adx = rma(dx, adxSmooth);
  return { diP, diM, adx };
}

/** ta.pivothigh: out[i] = valor del pivote ubicado en i-right (se confirma `right` velas después). */
export function pivotHigh(src: number[], left: number, right: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = left + right; i < src.length; i++) {
    const ci = i - right;
    const x = src[ci];
    if (Number.isNaN(x)) continue;
    let ok = true;
    for (let k = 1; k <= left && ok; k++) if (!(x > src[ci - k])) ok = false;
    for (let k = 1; k <= right && ok; k++) if (!(x >= src[ci + k])) ok = false;
    if (ok) out[i] = x;
  }
  return out;
}

/** ta.pivotlow */
export function pivotLow(src: number[], left: number, right: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = left + right; i < src.length; i++) {
    const ci = i - right;
    const x = src[ci];
    if (Number.isNaN(x)) continue;
    let ok = true;
    for (let k = 1; k <= left && ok; k++) if (!(x < src[ci - k])) ok = false;
    for (let k = 1; k <= right && ok; k++) if (!(x <= src[ci + k])) ok = false;
    if (ok) out[i] = x;
  }
  return out;
}

/** Oscilador de DMCRIPTO: (RSI + SMA(stoch, suavizado)) / 2 */
export function oscilador(c: Vela[], rsiLen = 14, stochLen = 14, stochSmooth = 3): number[] {
  const close = c.map((x) => x.c);
  const r = rsi(close, rsiLen);
  const s = sma(stoch(close, c.map((x) => x.h), c.map((x) => x.l), stochLen), stochSmooth);
  return r.map((x, i) => (x + s[i]) / 2);
}
